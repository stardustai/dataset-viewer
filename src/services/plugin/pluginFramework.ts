import { ReactNode } from 'react';
import { PluginBundle, PluginInstance } from '@dataset-viewer/sdk';
import { commands } from '../../types/tauri-commands';
import i18n from '../../i18n';

/**
 * 插件错误类型
 */
export enum PluginErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_FORMAT = 'INVALID_FORMAT',
  EXECUTION_ERROR = 'EXECUTION_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 插件错误信息
 */
export interface PluginError {
  type: PluginErrorType;
  message: string;
  originalError?: Error;
  pluginId?: string;
  canRetry?: boolean;
}

/**
 * 插件加载结果
 */
export interface PluginLoadResult {
  success: boolean;
  plugin?: PluginInstance;
  error?: PluginError;
  fallbackUsed?: boolean;
}

/**
 * 插件框架 - 负责插件的管理和动态加载
 *
 * 加载策略:
 * - 仅支持CJS格式：通过自定义require函数加载，提供外部依赖映射
 * - 统一使用Tauri命令：所有插件文件通过Tauri后端加载，支持开发和生产环境
 * - npm link插件：开发模式下直接使用ES Module动态导入
 *
 * 插件存储:
 * - 开发模式: .plugins/ (项目根目录)
 * - 生产模式: 应用数据目录/plugins/
 */
export class PluginFramework {
  private static instance: PluginFramework;
  private plugins = new Map<string, PluginInstance>();
  private loadedBundles = new Map<string, PluginBundle>();
  private dependencyCache = new Map<string, any>();
  private loadingPromises = new Map<string, Promise<PluginLoadResult>>();
  private pluginFileCache = new Map<string, string>(); // 插件文件内容缓存
  private lastValidationCache = new Map<string, boolean>(); // 插件验证结果缓存

  static getInstance(): PluginFramework {
    if (!PluginFramework.instance) {
      PluginFramework.instance = new PluginFramework();
    }
    return PluginFramework.instance;
  }

  /**
   * 创建插件错误信息
   */
  private createPluginError(
    type: PluginErrorType,
    message: string,
    originalError?: Error,
    pluginId?: string
  ): PluginError {
    return {
      type,
      message,
      originalError,
      pluginId,
      canRetry: type === PluginErrorType.NETWORK_ERROR || type === PluginErrorType.FILE_NOT_FOUND,
    };
  }

  /**
   * 获取用户友好的错误消息（支持国际化）
   */
  private getUserFriendlyErrorMessage(error: PluginError): string {
    const pluginName = error.pluginId ? ` (${error.pluginId})` : '';

    switch (error.type) {
      case PluginErrorType.FILE_NOT_FOUND:
        return i18n.t('plugin.error.file_not_found', { pluginName });
      case PluginErrorType.INVALID_FORMAT:
        return i18n.t('plugin.error.invalid_format', { pluginName });
      case PluginErrorType.EXECUTION_ERROR:
        return i18n.t('plugin.error.execution_error', { pluginName });
      case PluginErrorType.DEPENDENCY_ERROR:
        return i18n.t('plugin.error.dependency_error', { pluginName });
      case PluginErrorType.NETWORK_ERROR:
        return i18n.t('plugin.error.network_error', { pluginName });
      default:
        return i18n.t('plugin.error.unknown_error', { pluginName, message: error.message });
    }
  }

  /**
   * 统一的插件日志记录
   */
  private logPlugin(
    level: 'info' | 'warn' | 'error',
    pluginId: string,
    message: string,
    data?: unknown
  ): void {
    const prefix = `🔌 [Plugin ${pluginId}]`;
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format

    switch (level) {
      case 'info':
        console.log(`${prefix} ℹ️ [${timestamp}] ${message}`, data ? data : '');
        break;
      case 'warn':
        console.warn(`${prefix} ⚠️ [${timestamp}] ${message}`, data ? data : '');
        break;
      case 'error':
        console.error(`${prefix} ❌ [${timestamp}] ${message}`, data ? data : '');
        break;
    }
  }

  /**
   * 记录插件错误（统一日志格式）
   */
  private logPluginError(error: PluginError): void {
    const userMessage = this.getUserFriendlyErrorMessage(error);
    const pluginId = error.pluginId || 'Unknown';

    this.logPlugin('error', pluginId, `${error.type}: ${userMessage}`);
    if (error.originalError) {
      this.logPlugin('error', pluginId, 'Original Error Details', error.originalError);
    }
  }

  /**
   * 从插件ID加载插件（推荐的新接口）
   * @param pluginId 插件ID
   * @param entryPath 插件入口文件路径
   */
  async loadPlugin(pluginId: string, entryPath: string): Promise<PluginInstance> {
    try {
      this.logPlugin('info', pluginId, `开始加载插件，入口文件: ${entryPath}`);

      // 检查是否已经加载
      if (this.plugins.has(pluginId)) {
        this.logPlugin('info', pluginId, '插件已加载，返回现有实例');
        return this.plugins.get(pluginId)!;
      }

      // 避免重复加载同一插件
      if (this.loadingPromises.has(pluginId)) {
        this.logPlugin('info', pluginId, '插件正在加载中，等待完成...');
        const result = await this.loadingPromises.get(pluginId)!;
        if (result.success && result.plugin) {
          return result.plugin;
        } else {
          throw new Error(result.error?.message || 'Plugin loading failed');
        }
      }

      // 创建加载Promise并缓存
      const loadingPromise = this.loadPluginInternal(pluginId, entryPath);
      this.loadingPromises.set(pluginId, loadingPromise);

      try {
        const result = await loadingPromise;
        if (result.success && result.plugin) {
          this.logPlugin('info', pluginId, '✅ 插件加载成功');
          return result.plugin;
        } else {
          const error =
            result.error ||
            this.createPluginError(
              PluginErrorType.UNKNOWN_ERROR,
              'Unknown loading error',
              undefined,
              pluginId
            );
          this.logPluginError(error);
          throw new Error(this.getUserFriendlyErrorMessage(error));
        }
      } finally {
        this.loadingPromises.delete(pluginId);
      }
    } catch (error) {
      this.logPlugin('error', pluginId, '加载失败', error);
      throw error;
    }
  }

  /**
   * 内部插件加载实现
   */
  private async loadPluginInternal(pluginId: string, entryPath: string): Promise<PluginLoadResult> {
    try {
      // 判断加载方式
      if (entryPath.includes('node_modules')) {
        // 开发模式：npm link，直接导入
        console.log(`📦 [Plugin ${pluginId}] 使用npm link方式加载`);
        const pluginModule = await import(/* @vite-ignore */ entryPath);
        const plugin = await this.processPluginModule(pluginModule, pluginId, entryPath);
        return { success: true, plugin };
      } else {
        // 通过Tauri命令加载插件代码（CJS格式）
        console.log(`🔌 [Plugin ${pluginId}] 使用Tauri命令加载CJS插件`);

        try {
          const result = await commands.loadPluginFile(entryPath);
          if (result.status === 'error') {
            throw new Error(result.error);
          }
          const pluginCode = new TextDecoder('utf-8').decode(new Uint8Array(result.data));
          console.log(`🔌 [Plugin ${pluginId}] ✅ 通过Tauri加载CJS插件代码成功`);

          // 执行CJS插件
          const pluginModule = this.executeCJSPlugin(pluginCode, entryPath);
          const plugin = await this.processPluginModule(pluginModule, pluginId, entryPath);
          return { success: true, plugin };
        } catch (commandError: any) {
          // 根据错误类型创建具体的错误信息
          let errorType = PluginErrorType.UNKNOWN_ERROR;
          if (
            commandError.message?.includes('not found') ||
            commandError.message?.includes('does not exist')
          ) {
            errorType = PluginErrorType.FILE_NOT_FOUND;
          } else if (
            commandError.message?.includes('network') ||
            commandError.message?.includes('fetch')
          ) {
            errorType = PluginErrorType.NETWORK_ERROR;
          }

          const error = this.createPluginError(
            errorType,
            `Failed to load CJS plugin file: ${commandError.message}`,
            commandError,
            pluginId
          );
          return { success: false, error };
        }
      }
    } catch (error: any) {
      // 处理其他类型的错误
      let errorType = PluginErrorType.EXECUTION_ERROR;
      if (error.message?.includes('dependency') || error.message?.includes('require')) {
        errorType = PluginErrorType.DEPENDENCY_ERROR;
      } else if (error.message?.includes('format') || error.message?.includes('parse')) {
        errorType = PluginErrorType.INVALID_FORMAT;
      }

      const pluginError = this.createPluginError(
        errorType,
        error.message || 'Plugin loading failed',
        error,
        pluginId
      );
      return { success: false, error: pluginError };
    }
  }

  /**
   * 获取所有可用的插件列表（从后端）
   */
  async getAvailablePlugins(): Promise<
    Array<{ id: string; name: string; entryPath: string; enabled: boolean }>
  > {
    try {
      // 调用后端的插件发现命令，只获取已安装的插件
      const result = await commands.pluginDiscover(false);
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      const plugins = result.data;

      return plugins
        .filter(plugin => plugin.local && plugin.enabled && plugin.entry_path)
        .map(plugin => ({
          id: plugin.id,
          name: plugin.name,
          entryPath: plugin.entry_path!, // 使用非空断言，因为已经在filter中检查了
          enabled: plugin.enabled,
        }));
    } catch (error) {
      console.error('❌ Failed to get available plugins:', error);
      return [];
    }
  }

  /**
   * 自动加载所有可用的插件
   */
  async loadAllAvailablePlugins(): Promise<PluginInstance[]> {
    console.log('🔌 Loading all available plugins...');
    const availablePlugins = await this.getAvailablePlugins();
    const loadedPlugins: PluginInstance[] = [];

    for (const pluginInfo of availablePlugins) {
      try {
        const instance = await this.loadPlugin(pluginInfo.id, pluginInfo.entryPath);
        loadedPlugins.push(instance);
        console.log(`✅ Loaded plugin: ${pluginInfo.name}`);
      } catch (error) {
        console.error(`❌ Failed to load plugin ${pluginInfo.name}:`, error);
      }
    }

    console.log(
      `🔌 Loaded ${loadedPlugins.length} out of ${availablePlugins.length} available plugins`
    );
    return loadedPlugins;
  }

  /**
   * 从插件路径中提取基础路径
   * 为插件提供一个统一的资源加载代理
   */
  private extractPluginBasePath(pluginId: string): string {
    if (typeof window === 'undefined') {
      return './';
    }

    // 返回plugin-resource协议URL，由Tauri原生处理
    console.log('🔍 Creating plugin base path for ID:', pluginId);
    return `plugin-resource://${pluginId}/`;
  }

  /**
   * 处理插件模块（通用逻辑）
   */
  private async processPluginModule(
    pluginModule: unknown,
    pluginId: string,
    entryPath?: string
  ): Promise<PluginInstance> {
    try {
      // 类型保护：确保 pluginModule 是一个有效的对象
      if (typeof pluginModule !== 'object' || pluginModule === null) {
        throw new Error('Plugin module must be an object');
      }

      const moduleAsAny = pluginModule as Record<string, unknown>;
      const bundle: PluginBundle = (moduleAsAny.default || moduleAsAny) as PluginBundle;

      // 使用传入的pluginId或bundle中的id
      const finalPluginId = pluginId || bundle.metadata.id;

      // 验证插件包格式
      const cacheKey = `${finalPluginId}-validation`;
      if (!this.validatePluginBundle(bundle, cacheKey)) {
        throw this.createPluginError(
          PluginErrorType.INVALID_FORMAT,
          'Invalid plugin bundle format - missing required metadata or component',
          undefined,
          pluginId
        );
      }

      // 防重复加载
      if (this.plugins.has(finalPluginId)) {
        console.log(`🔌 [Plugin ${finalPluginId}] 插件已存在，跳过重复加载`);
        return this.plugins.get(finalPluginId)!;
      }

      // 执行插件初始化
      if (bundle.initialize) {
        try {
          const basePath = this.extractPluginBasePath(finalPluginId);
          await bundle.initialize({ pluginBasePath: basePath });
          console.log(`🔌 [Plugin ${finalPluginId}] ✅ 插件初始化成功`);
        } catch (initError: any) {
          console.warn(`🔌 [Plugin ${finalPluginId}] ⚠️ 插件初始化失败，但继续加载:`, initError);
          // 初始化失败不阻止插件加载，只是记录警告
        }
      }

      // 如果插件有翻译资源，合并到主应用的 i18n 系统
      if (bundle.i18nResources) {
        try {
          for (const [lang, resources] of Object.entries(bundle.i18nResources)) {
            const namespace = `plugin:${finalPluginId}`;
            const translation = (resources as any)?.translation || resources;
            i18n.addResourceBundle(lang, namespace, translation, true, true);
          }
          console.log(`🔌 [Plugin ${finalPluginId}] ✅ 国际化资源加载成功`);
        } catch (i18nError: any) {
          console.warn(`🔌 [Plugin ${finalPluginId}] ⚠️ 国际化资源加载失败:`, i18nError);
          // i18n失败不阻止插件加载
        }
      }

      // 自动识别官方插件（基于插件ID或路径）
      const isOfficial =
        entryPath?.includes('@dataset-viewer/plugin-') || finalPluginId.includes('dataset-viewer');

      // 创建插件实例，自动设置 official 字段
      const enhancedMetadata = {
        ...bundle.metadata,
        id: finalPluginId, // 确保使用正确的ID
        official: isOfficial,
      };

      const instance: PluginInstance = {
        metadata: enhancedMetadata,
        component: bundle.component,
        canHandle: (filename: string) => {
          const ext = filename.split('.').pop()?.toLowerCase();
          if (!ext) return false;

          // 检查插件支持的扩展名，支持带点和不带点的格式
          return bundle.metadata.supportedExtensions.some((supportedExt: string) => {
            const normalizedExt = supportedExt.startsWith('.')
              ? supportedExt.slice(1)
              : supportedExt;
            return normalizedExt.toLowerCase() === ext;
          });
        },
        getFileType: () => finalPluginId, // 使用插件ID作为文件类型标识符
        getFileIcon: (filename?: string) => {
          // 如果提供了文件名且存在图标映射，尝试根据扩展名获取特定图标
          if (filename && bundle.metadata.iconMapping) {
            const ext = '.' + filename.split('.').pop()?.toLowerCase();
            const specificIcon = bundle.metadata.iconMapping[ext];
            if (specificIcon) {
              return specificIcon;
            }
          }
          // 返回默认图标
          return bundle.metadata.icon || '';
        },
      };

      // 缓存插件
      this.loadedBundles.set(finalPluginId, bundle);
      this.plugins.set(finalPluginId, instance);

      console.log(`🔌 [Plugin ${finalPluginId}] ✅ 插件实例创建成功`);
      return instance;
    } catch (error: any) {
      // 如果错误已经是PluginError类型，直接抛出
      if (error.type && error.message) {
        throw error;
      }

      // 否则包装为PluginError
      throw this.createPluginError(
        PluginErrorType.EXECUTION_ERROR,
        error.message || 'Failed to process plugin module',
        error,
        pluginId
      );
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const bundle = this.loadedBundles.get(pluginId);

    try {
      if (bundle?.cleanup) {
        await bundle.cleanup();
      }
    } catch (e) {
      console.error(`Failed to cleanup plugin ${pluginId}:`, e);
    } finally {
      // 清理 i18n 资源（与加载阶段的命名空间对应）
      if (bundle?.i18nResources) {
        const namespace = `plugin:${pluginId}`;
        for (const lang of Object.keys(bundle.i18nResources)) {
          if (i18n.hasResourceBundle(lang, namespace)) {
            i18n.removeResourceBundle(lang, namespace);
          }
        }
      }
      this.plugins.delete(pluginId);
      this.loadedBundles.delete(pluginId);
    }
  }

  /**
   * 获取可以处理指定文件的插件
   */
  findPluginForFile(filename: string): PluginInstance | null {
    for (const plugin of this.plugins.values()) {
      if (plugin.canHandle(filename)) {
        return plugin;
      }
    }
    return null;
  }

  /**
   * 获取所有已加载的插件
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 根据插件 ID 获取插件实例
   */
  getPlugin(pluginId: string): PluginInstance | null {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * 验证插件包格式（带缓存）
   */
  private validatePluginBundle(bundle: unknown, cacheKey?: string): bundle is PluginBundle {
    // 如果有缓存键且已验证过，直接返回缓存结果
    if (cacheKey && this.lastValidationCache.has(cacheKey)) {
      return this.lastValidationCache.get(cacheKey)!;
    }

    if (!bundle || typeof bundle !== 'object') {
      if (cacheKey) this.lastValidationCache.set(cacheKey, false);
      return false;
    }

    const b = bundle as Record<string, unknown>;
    const metadata = b.metadata as Record<string, unknown>;

    const isValid = !!(
      b.metadata &&
      typeof b.metadata === 'object' &&
      b.metadata !== null &&
      typeof metadata.id === 'string' &&
      typeof metadata.name === 'string' &&
      Array.isArray(metadata.supportedExtensions) &&
      typeof b.component === 'function'
    );

    // 缓存验证结果
    if (cacheKey) {
      this.lastValidationCache.set(cacheKey, isValid);
    }

    return isValid;
  }

  /**
   * 获取插件的文件类型映射
   */
  getFileTypeMapping(): Map<string, string> {
    const mapping = new Map<string, string>();
    const norm = (e: string) => (e.startsWith('.') ? e : `.${e}`).toLowerCase();

    for (const plugin of this.plugins.values()) {
      for (const ext of plugin.metadata.supportedExtensions) {
        const key = norm(ext);
        if (!mapping.has(key)) {
          mapping.set(key, plugin.getFileType());
        } else {
          console.warn(`Extension mapping conflict on ${key}: keeping first-registered plugin.`);
        }
      }
    }

    return mapping;
  }

  /**
   * 获取插件的图标映射
   */
  getIconMapping(): Map<string, ReactNode> {
    const mapping = new Map<string, ReactNode>();
    const norm = (e: string) => (e.startsWith('.') ? e : `.${e}`).toLowerCase();

    for (const plugin of this.plugins.values()) {
      for (const ext of plugin.metadata.supportedExtensions) {
        const key = norm(ext);
        // 传入一个伪文件名（如 file.dwg）以复用插件的解析逻辑
        const icon = plugin.getFileIcon?.(`file${key}`);
        if (icon && !mapping.has(key)) {
          mapping.set(key, icon);
        }
      }
    }

    return mapping;
  }

  /**
   * 执行CJS格式的插件代码（带缓存）
   */
  private executeCJSPlugin(code: string, pluginPath: string): unknown {
    // 检查文件内容缓存
    const cacheKey = `${pluginPath}-${code.length}`;
    if (this.pluginFileCache.has(cacheKey)) {
      this.logPlugin('info', 'System', `使用缓存的插件代码: ${pluginPath}`);
    } else {
      this.pluginFileCache.set(cacheKey, code);
    }

    // 创建自定义require函数
    const require = this.createCustomRequire(pluginPath);

    // 创建CommonJS环境
    const module = { exports: {} };
    const exports = module.exports;

    try {
      // 执行插件代码
      const func = new Function('require', 'module', 'exports', code);
      func(require, module, exports);

      this.logPlugin('info', 'System', '✅ CJS插件执行成功');
      return module.exports;
    } catch (error) {
      this.logPlugin('error', 'System', '❌ CJS插件执行失败', error);
      throw error;
    }
  }

  /**
   * 创建自定义require函数
   */
  private createCustomRequire(pluginPath: string): (moduleName: string) => unknown {
    const moduleMap: Record<string, unknown> = {
      'react/jsx-runtime': (window as any).ReactJSXRuntime,
      react: (window as any).React,
      'react-dom': (window as any).ReactDOM,
      '@tauri-apps/api/core': (window as any).TauriCore,
    };

    // 获取插件目录路径
    const pluginDir = pluginPath.substring(0, pluginPath.lastIndexOf('/') + 1);

    return function require(moduleName: string): unknown {
      if (moduleMap[moduleName]) {
        console.log(`📦 Resolved module: ${moduleName}`);
        return moduleMap[moduleName];
      }

      // 处理相对导入
      if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
        console.warn(`⚠️ Relative require not yet supported: ${moduleName}`);
        console.warn(`📋 Plugin directory: ${pluginDir}`);
        console.warn(`🔧 Consider using absolute imports or await pattern`);

        // 提供更好的错误信息，包含建议
        throw new Error(
          `
Relative require not supported: ${moduleName}

Plugin directory: ${pluginDir}
Requested module: ${moduleName}

Suggestions:
1. Use external dependencies instead of relative imports
2. Bundle all dependencies into the main plugin file
3. Use absolute imports if possible

This limitation exists because require() is synchronous but plugin files are loaded asynchronously via Tauri commands.
        `.trim()
        );
      }

      throw new Error(`Module not found: ${moduleName}`);
    };
  }

  /**
   * 清理所有插件
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.loadedBundles.values())
      .filter(bundle => bundle.cleanup)
      .map(bundle => bundle.cleanup!());

    const results = await Promise.allSettled(cleanupPromises);

    // 记录失败的清理操作
    results.forEach(result => {
      if (result.status === 'rejected') {
        this.logPlugin('error', 'System', 'Failed to cleanup plugin', result.reason);
      }
    });

    // 清理所有缓存和状态
    this.plugins.clear();
    this.loadedBundles.clear();
    this.dependencyCache.clear();
    this.loadingPromises.clear();
    this.pluginFileCache.clear();
    this.lastValidationCache.clear();

    this.logPlugin('info', 'System', '🧹 插件系统清理完成');
  }
}

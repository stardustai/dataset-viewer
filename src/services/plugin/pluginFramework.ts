import { ReactNode } from 'react';
import { PluginBundle, PluginInstance } from '@dataset-viewer/sdk';
import i18n from '../../i18n';

/**
 * 插件框架 - 负责插件的管理和动态加载
 */
export class PluginFramework {
  private static instance: PluginFramework;
  private plugins = new Map<string, PluginInstance>();
  private loadedBundles = new Map<string, PluginBundle>();
  private dependencyCache = new Map<string, any>();

  static getInstance(): PluginFramework {
    if (!PluginFramework.instance) {
      PluginFramework.instance = new PluginFramework();
    }
    return PluginFramework.instance;
  }

  /**
   * 从插件目录动态加载插件
   */
  async loadPlugin(pluginPath: string): Promise<PluginInstance> {
    try {
      // 动态导入插件包
      const pluginModule = await import(/* @vite-ignore */ pluginPath);
      const bundle: PluginBundle = pluginModule.default || pluginModule;

      // 验证插件包格式
      if (!this.validatePluginBundle(bundle)) {
        throw new Error('Invalid plugin bundle format');
      }

      // 防重复加载
      if (this.plugins.has(bundle.metadata.id)) {
        console.warn(`Plugin "${bundle.metadata.id}" 已加载，跳过重复加载。`);
        return this.plugins.get(bundle.metadata.id)!;
      }

      // 在开发模式下验证插件 ID 与路径的一致性
      if (import.meta.env.DEV) {
        this.validatePluginIdConsistency(bundle.metadata.id, pluginPath);
      }

      // 执行插件初始化
      if (bundle.initialize) {
        await bundle.initialize();
      }

      // 如果插件有翻译资源，合并到主应用的 i18n 系统
      if (bundle.i18nResources) {
        for (const [lang, resources] of Object.entries(bundle.i18nResources)) {
          // 使用插件ID作为命名空间，避免冲突
          const namespace = `plugin:${bundle.metadata.id}`;
          i18n.addResourceBundle(lang, namespace, resources.translation, true, true);
        }
      }

      // 自动识别官方插件（基于路径中是否包含 @dataset-viewer）
      const isOfficial = pluginPath.includes('@dataset-viewer/plugin-');

      // 创建插件实例，自动设置 official 字段
      const enhancedMetadata = {
        ...bundle.metadata,
        official: isOfficial,
      };

      const instance: PluginInstance = {
        metadata: enhancedMetadata,
        component: bundle.component,
        canHandle: (filename: string) => {
          const ext = filename.split('.').pop()?.toLowerCase();
          if (!ext) return false;

          // 检查插件支持的扩展名，支持带点和不带点的格式
          return bundle.metadata.supportedExtensions.some(supportedExt => {
            const normalizedExt = supportedExt.startsWith('.')
              ? supportedExt.slice(1)
              : supportedExt;
            return normalizedExt.toLowerCase() === ext;
          });
        },
        getFileType: () => bundle.metadata.id, // 使用插件ID作为文件类型标识符
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
      this.loadedBundles.set(bundle.metadata.id, bundle);
      this.plugins.set(bundle.metadata.id, instance);

      return instance;
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginPath}:`, error);
      throw error;
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
   * 验证插件包格式
   */
  private validatePluginBundle(bundle: unknown): bundle is PluginBundle {
    if (!bundle || typeof bundle !== 'object') return false;

    const b = bundle as Record<string, unknown>;
    const metadata = b.metadata as Record<string, unknown>;

    return !!(
      b.metadata &&
      typeof b.metadata === 'object' &&
      b.metadata !== null &&
      typeof metadata.id === 'string' &&
      typeof metadata.name === 'string' &&
      Array.isArray(metadata.supportedExtensions) &&
      typeof b.component === 'function'
    );
  }

  /**
   * 验证插件 ID 与包名的一致性
   */
  private validatePluginIdConsistency(pluginId: string, pluginPath: string): void {
    try {
      // 从路径推导出预期的插件 ID
      // 例如：/path/to/@dataset-viewer/plugin-cad/dist/index.js -> cad
      const pathParts = pluginPath.split('/');
      let packageName = '';

      // 查找包含 @dataset-viewer/plugin- 的路径段
      for (const part of pathParts) {
        if (part.includes('@dataset-viewer/plugin-')) {
          packageName = part;
          break;
        }
      }

      if (packageName.startsWith('@dataset-viewer/plugin-')) {
        const expectedId = packageName.replace('@dataset-viewer/plugin-', '');
        if (pluginId !== expectedId) {
          console.warn(
            `Plugin ID mismatch: package name "${packageName}" suggests ID should be "${expectedId}", but plugin defines ID as "${pluginId}"`
          );
        }
      }
    } catch (error) {
      // 验证失败不影响插件加载，只是警告
      console.warn('Failed to validate plugin ID consistency:', error);
    }
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
        console.error(`Failed to cleanup plugin:`, result.reason);
      }
    });

    this.plugins.clear();
    this.loadedBundles.clear();
    this.dependencyCache.clear();
  }
}

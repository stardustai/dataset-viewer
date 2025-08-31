import { pluginManager } from './pluginManager';

/**
 * 插件初始化服务
 * 负载应用启动时的插件系统初始化
 */
export class PluginInitializationService {
  private initialized = false;

  /**
   * 初始化插件系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Plugin system already initialized');
      return;
    }

    try {
      console.log('� Initializing plugin system...');

      // 初始化插件管理器
      await pluginManager.initialize();

      this.initialized = true;
      console.log('✅ Plugin system initialized successfully');

      // 打印已加载的插件信息
      const loadedPlugins = pluginManager.getLoadedPlugins();
      console.log(
        `📦 Loaded ${loadedPlugins.length} plugins:`,
        loadedPlugins.map(p => p.metadata.name)
      );
    } catch (error) {
      console.error('❌ Failed to initialize plugin system:', error);
      throw error;
    }
  }

  /**
   * 重新加载插件系统
   */
  async reload(): Promise<void> {
    console.log('🔄 Reloading plugin system...');

    // 清理现有状态
    await pluginManager.cleanup();
    this.initialized = false;

    // 重新初始化
    await this.initialize();
  }

  /**
   * 获取初始化状态
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取加载统计
   */
  getStats(): {
    totalInstalled: number;
    totalEnabled: number;
    initialized: boolean;
  } {
    const loadedPlugins = pluginManager.getLoadedPlugins();

    return {
      totalInstalled: loadedPlugins.length,
      totalEnabled: loadedPlugins.length,
      initialized: this.initialized,
    };
  }

  /**
   * 获取插件统计信息
   */
  getPluginStats() {
    const loadedPlugins = pluginManager.getLoadedPlugins();
    const fileTypeMapping = pluginManager.getFileTypeMapping();

    return {
      total: loadedPlugins.length,
      enabled: loadedPlugins.length,
      disabled: 0,
      official: loadedPlugins.filter(p => p.metadata.official).length,
      community: loadedPlugins.filter(p => !p.metadata.official).length,
      supportedExtensions: fileTypeMapping.size,
    };
  }
}

// 单例实例
export const pluginInitialization = new PluginInitializationService();

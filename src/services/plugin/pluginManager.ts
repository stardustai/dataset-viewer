import { ReactNode } from 'react';
import {
  commands,
  type LocalPluginInfo,
  type PluginInstallRequest,
} from '../../types/tauri-commands';
import { PluginFramework } from './pluginFramework';
import { PluginInstance } from '@dataset-viewer/sdk';

/**
 * 插件管理器 - 负责插件的生命周期管理
 */
export class PluginManager {
  private static instance: PluginManager;
  private framework: PluginFramework;
  private initialized = false;

  private constructor() {
    this.framework = PluginFramework.getInstance();
  }

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * 初始化插件系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // 从后端获取已激活的插件列表
      const activePluginsResult = await commands.pluginGetActive();
      if (activePluginsResult.status === 'error') {
        throw new Error(activePluginsResult.error);
      }
      const activePlugins = activePluginsResult.data;

      // 加载每个激活的插件
      for (const pluginInfo of activePlugins) {
        if (pluginInfo.entry_path) {
          try {
            await this.framework.loadPlugin(pluginInfo.metadata.id, pluginInfo.entry_path);
            console.log(`Plugin loaded: ${pluginInfo.metadata.name}`);
          } catch (error) {
            console.error(`Failed to load plugin ${pluginInfo.metadata.name}:`, error);
          }
        }
      }

      this.initialized = true;
      console.log(`Plugin system initialized with ${activePlugins.length} plugins`);
    } catch (error) {
      console.error('Failed to initialize plugin system:', error);
      throw error;
    }
  }

  /**
   * 重新同步插件状态
   * 确保前端插件状态与后端一致
   */
  async syncPluginState(): Promise<void> {
    try {
      console.log('Syncing plugin state...');

      // 获取后端已安装插件状态
      const allPluginsResult = await commands.pluginDiscover(false); // 只获取已安装插件
      if (allPluginsResult.status === 'error') {
        throw new Error(allPluginsResult.error);
      }
      const allPlugins = allPluginsResult.data;
      const activePlugins = allPlugins.filter((p: LocalPluginInfo) => p.enabled);

      // 获取当前前端已加载的插件
      const loadedPlugins = this.framework.getAllPlugins();
      const loadedPluginIds = new Set(loadedPlugins.map(p => p.metadata.id));

      // 卸载不应该激活的插件
      for (const plugin of loadedPlugins) {
        const shouldBeActive = activePlugins.some(
          (p: LocalPluginInfo) => p.id === plugin.metadata.id
        );
        if (!shouldBeActive) {
          await this.framework.unloadPlugin(plugin.metadata.id);
          console.log(`Plugin unloaded during sync: ${plugin.metadata.name}`);
        }
      }

      // 加载应该激活但未加载的插件
      for (const pluginInfo of activePlugins) {
        if (!loadedPluginIds.has(pluginInfo.id) && pluginInfo.entry_path) {
          try {
            await this.framework.loadPlugin(pluginInfo.id, pluginInfo.entry_path);
            console.log(`Plugin loaded during sync: ${pluginInfo.name}`);
          } catch (error) {
            console.error(`Failed to load plugin ${pluginInfo.name} during sync:`, error);
          }
        }
      }

      console.log(`Plugin state synced: ${activePlugins.length} active plugins`);
    } catch (error) {
      console.error('Failed to sync plugin state:', error);
      throw error;
    }
  }

  /**
   * 安装插件
   */
  async installPlugin(source: 'local' | 'url', path: string): Promise<void> {
    try {
      let request: PluginInstallRequest;

      if (source === 'local') {
        request = {
          source: { Local: { path } },
          options: null,
        };
      } else {
        request = {
          source: { Url: { url: path } },
          options: null,
        };
      }

      const result = await commands.pluginInstall(request);
      if (result.status === 'error') {
        throw new Error(result.error);
      }

      console.log(`Plugin installed: ${result.data.plugin_id}`);
    } catch (error) {
      console.error('Failed to install plugin:', error);
      throw error;
    }
  }

  /**
   * 直接加载插件（不调用后端激活接口）
   * 用于插件已在后端启用的情况下的前端热加载
   */
  async loadPluginDirect(pluginId: string, entryPath: string): Promise<void> {
    try {
      await this.framework.loadPlugin(pluginId, entryPath);
      console.log(`Plugin loaded directly: ${pluginId}`);
    } catch (error) {
      console.error(`Failed to load plugin directly: ${pluginId}`, error);
      throw error;
    }
  }

  /**
   * 激活插件
   */
  async activatePlugin(pluginId: string): Promise<void> {
    try {
      // 调用后端激活插件
      const activateResult = await commands.pluginToggle(pluginId, true);
      if (activateResult.status === 'error') {
        throw new Error(activateResult.error);
      }

      // 获取已安装插件信息找到激活的插件
      const pluginsResult = await commands.pluginDiscover(false); // 只获取已安装插件
      if (pluginsResult.status === 'error') {
        throw new Error(pluginsResult.error);
      }
      const plugins = pluginsResult.data;
      const pluginInfo = plugins.find(p => p.id === pluginId && p.enabled);

      if (pluginInfo?.entry_path) {
        // 使用后端提供的准确入口文件路径
        await this.framework.loadPlugin(pluginInfo.id, pluginInfo.entry_path);
        console.log(`Plugin activated and loaded: ${pluginInfo.name}`);
      } else {
        throw new Error(
          `Plugin ${pluginId} not found, not enabled, or missing entry path after activation`
        );
      }
    } catch (error) {
      console.error('Failed to activate plugin:', error);
      throw error;
    }
  }

  /**
   * 停用插件
   */
  async deactivatePlugin(pluginId: string): Promise<void> {
    try {
      const result = await commands.pluginToggle(pluginId, false);
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      await this.framework.unloadPlugin(pluginId);
      console.log(`Plugin deactivated: ${pluginId}`);
    } catch (error) {
      console.error('Failed to deactivate plugin:', error);
      throw error;
    }
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    try {
      // 先停用插件
      await this.deactivatePlugin(pluginId);

      // 卸载插件
      const result = await commands.pluginUninstall(pluginId);
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      console.log(`Plugin uninstalled: ${pluginId}`);
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      throw error;
    }
  }

  /**
   * 获取所有插件列表
   */
  async getAllPlugins(): Promise<LocalPluginInfo[]> {
    try {
      const result = await commands.pluginDiscover(false); // 只获取已安装插件
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      return result.data;
    } catch (error) {
      console.error('Failed to get plugins:', error);
      return [];
    }
  }

  /**
   * 根据文件名找到对应的插件查看器
   */
  findViewerForFile(filename: string): PluginInstance | null {
    return this.framework.findPluginForFile(filename);
  }

  /**
   * 根据插件ID获取插件实例
   */
  getPluginById(pluginId: string): PluginInstance | null {
    return this.framework.getPlugin(pluginId);
  }

  /**
   * 获取所有已加载的插件实例
   */
  getLoadedPlugins(): PluginInstance[] {
    return this.framework.getAllPlugins();
  }

  /**
   * 获取文件类型映射
   */
  getFileTypeMapping(): Map<string, string> {
    return this.framework.getFileTypeMapping();
  }

  /**
   * 获取图标映射
   */
  getIconMapping(): Map<string, ReactNode> {
    return this.framework.getIconMapping();
  }

  /**
   * 清理插件系统
   */
  async cleanup(): Promise<void> {
    await this.framework.cleanup();
    this.initialized = false;
  }
}

// 单例实例
export const pluginManager = PluginManager.getInstance();

import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PluginFramework } from './pluginFramework';
import { PluginInstance } from '../../types/plugin-framework';

// Rust backend plugin types
interface PluginInfo {
  metadata: {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    supported_extensions: string[];
    mime_types: Record<string, string>;
    icon?: string;
    official: boolean;
    category: string;
    min_app_version: string;
  };
  source: {
    type: string;
    path?: string;
    package_name?: string;
    version?: string;
    url?: string;
  };
  installed: boolean;
  active: boolean;
  entry_path?: string;
}

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
      const activePlugins: PluginInfo[] = await invoke('get_active_plugins');

      // 加载每个激活的插件
      for (const pluginInfo of activePlugins) {
        if (pluginInfo.entry_path) {
          try {
            await this.framework.loadPlugin(pluginInfo.entry_path);
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
   * 安装插件
   */
  async installPlugin(source: 'local' | 'url', path: string): Promise<void> {
    try {
      let pluginInfo: PluginInfo;

      if (source === 'local') {
        pluginInfo = await invoke('install_plugin_from_local', { pluginPath: path });
      } else {
        pluginInfo = await invoke('install_plugin_from_url', { pluginUrl: path });
      }

      console.log(`Plugin installed: ${pluginInfo.metadata.name}`);
    } catch (error) {
      console.error('Failed to install plugin:', error);
      throw error;
    }
  }

  /**
   * 激活插件
   */
  async activatePlugin(pluginId: string): Promise<void> {
    try {
      await invoke('activate_plugin', { pluginId });

      // 获取插件信息并加载
      const plugins: PluginInfo[] = await invoke('discover_plugins');
      const pluginInfo = plugins.find(p => p.metadata.id === pluginId);

      if (pluginInfo?.entry_path) {
        await this.framework.loadPlugin(pluginInfo.entry_path);
        console.log(`Plugin activated: ${pluginInfo.metadata.name}`);
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
      await invoke('deactivate_plugin', { pluginId });
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
      await invoke('uninstall_plugin', { pluginId });
      console.log(`Plugin uninstalled: ${pluginId}`);
    } catch (error) {
      console.error('Failed to uninstall plugin:', error);
      throw error;
    }
  }

  /**
   * 获取所有插件列表
   */
  async getAllPlugins(): Promise<PluginInfo[]> {
    try {
      return await invoke('discover_plugins');
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
  getIconMapping(): Map<string, React.ReactNode> {
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

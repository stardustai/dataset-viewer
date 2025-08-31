import { ComponentType } from 'react';

/**
 * 插件元数据
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  supportedExtensions?: string[];
  official?: boolean;
  keywords?: string[];
  icon?: string;
  homepage?: string;
  repository?: string;
  npmPackage?: string;
  publishedAt?: string;
  downloads?: number;
  local?: boolean;
  localPath?: string;
  linkedPath?: string;
}

/**
 * 插件资源定义
 */
export interface PluginResources {
  /** 文件图标组件 */
  icons?: Record<string, ComponentType<{ className?: string }>>;
  /** 文件类型图标映射 */
  iconMap?: Record<string, string>;
  /** 静态资源 URL */
  assets?: Record<string, string>;
}

/**
 * 插件配置接口
 */
export interface PluginConfig {
  /** 是否启用该插件 */
  enabled: boolean;
  /** 插件安装来源 */
  source: 'npm' | 'local' | 'url';
  /** 安装时间 */
  installedAt?: Date;
  /** 插件特定的配置选项 */
  options?: Record<string, any>;
}

/**
 * 文件查看器上下文
 */
export interface ViewerContext {
  /** 当前文件信息 */
  file: {
    filename: string;
    size: number;
    path: string;
  };
  /** 文件内容（如果已加载） */
  content?: ArrayBuffer | string;
  /** 存储客户端（用于访问文件） */
  storageClient?: any;
  /** 容器高度 */
  containerHeight: number;
  /** 是否为大文件 */
  isLargeFile: boolean;
  /** 错误处理函数 */
  onError: (error: Error) => void;
  /** 加载状态更新函数 */
  onLoadingChange: (loading: boolean) => void;
  /** 主题信息 */
  theme?: 'light' | 'dark';
  /** 语言设置 */
  locale?: string;
}

/**
 * 插件查看器组件接口
 */
export interface PluginViewerComponent {
  /** React组件 */
  component: ComponentType<ViewerContext>;
  /** 组件显示名称 */
  displayName: string;
  /** 是否支持搜索功能 */
  supportsSearch?: boolean;
  /** 是否支持导出功能 */
  supportsExport?: boolean;
  /** 是否支持全屏模式 */
  supportsFullscreen?: boolean;
  /** 预加载函数 */
  preload?: () => Promise<void>;
}

/**
 * 插件实例接口
 */
export interface Plugin {
  /** 插件元数据 */
  metadata: PluginMetadata;
  /** 查看器组件（懒加载） */
  viewer: () => Promise<PluginViewerComponent>;
  /** 插件资源（懒加载） */
  resources?: () => Promise<PluginResources>;
  /** 初始化函数 */
  initialize?: () => Promise<void>;
  /** 清理函数 */
  cleanup?: () => Promise<void>;
  /** 检查是否支持指定文件 */
  canHandle: (filename: string, mimeType?: string) => boolean;
  /** 获取文件类型 */
  getFileType: (filename: string) => string;
  /** 获取文件图标组件名 */
  getFileIcon?: (filename: string) => string | null;
}

/**
 * 插件加载器接口
 */
export interface PluginLoader {
  /** 从npm包加载插件 */
  loadFromNpm: (packageName: string, version?: string) => Promise<Plugin>;
  /** 从本地路径加载插件 */
  loadFromLocal: (path: string) => Promise<Plugin>;
  /** 从URL加载插件 */
  loadFromUrl: (url: string) => Promise<Plugin>;
  /** 卸载插件模块 */
  unload: (pluginId: string) => Promise<void>;
}

/**
 * 插件管理器接口
 */
export interface PluginManager {
  /** 注册插件 */
  registerPlugin: (plugin: Plugin) => Promise<void>;
  /** 卸载插件 */
  unregisterPlugin: (pluginId: string) => Promise<void>;
  /** 获取插件 */
  getPlugin: (pluginId: string) => Plugin | undefined;
  /** 获取所有插件 */
  getAllPlugins: () => Plugin[];
  /** 获取已启用的插件 */
  getEnabledPlugins: () => Plugin[];
  /** 根据文件类型查找合适的插件 */
  findPluginForFile: (filename: string, mimeType?: string) => Plugin | undefined;
  /** 启用/禁用插件 */
  togglePlugin: (pluginId: string, enabled: boolean) => Promise<void>;
  /** 安装插件包 */
  installPlugin: (source: string, type: 'npm' | 'local' | 'url') => Promise<void>;
  /** 卸载插件包 */
  uninstallPlugin: (pluginId: string) => Promise<void>;
  /** 更新插件 */
  updatePlugin: (pluginId: string) => Promise<void>;
  /** 获取可用的插件市场列表 */
  getAvailablePlugins: () => Promise<PluginMetadata[]>;
  /** 获取插件文件图标 */
  getFileIcon: (filename: string) => Promise<ComponentType<{ className?: string }> | null>;
}

/**
 * 插件安装状态
 */
export type PluginInstallStatus =
  | 'installing'
  | 'installed'
  | 'failed'
  | 'uninstalling'
  | 'updating';

/**
 * 插件安装信息
 */
export interface PluginInstallInfo {
  pluginId: string;
  status: PluginInstallStatus;
  progress?: number;
  error?: string;
  installedAt?: Date;
  source: 'npm' | 'local' | 'url';
  sourcePath: string;
}

/**
 * 插件开发工具接口
 */
export interface PluginDevTools {
  /** 监听本地插件变化 */
  watchLocal: (path: string, callback: (plugin: Plugin) => void) => void;
  /** 热重载插件 */
  hotReload: (pluginId: string) => Promise<void>;
  /** 验证插件结构 */
  validate: (plugin: Plugin) => Promise<{ valid: boolean; errors: string[] }>;
}

import React from 'react';

/**
 * 插件包接口
 */
export interface PluginBundle {
  metadata: PluginMetadata;
  component: React.ComponentType<PluginViewerProps>;
  initialize?: () => Promise<void>;
  cleanup?: () => Promise<void>;
  // 插件翻译资源
  i18nResources?: {
    [language: string]: {
      translation: Record<string, string>;
    };
  };
}

/**
 * 插件元数据
 */
export interface PluginMetadata {
  /**
   * 插件 ID，必须与包名保持一致
   * 例如：包名 @dataset-viewer/plugin-cad 对应插件 ID "cad"
   * 包名 @dataset-viewer/plugin-pdf-viewer 对应插件 ID "pdf-viewer"
   */
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  supportedExtensions: string[];
  mimeTypes: Record<string, string>;
  /**
   * 插件图标，可以是字符串（如 emoji）或 React 组件
   * 注意：如果是 React 组件，不要包含尺寸样式（如 w-4 h-4），
   * 系统会根据使用场景自动应用合适的尺寸
   */
  icon?: string | React.ReactNode;
  official: boolean;
  category: 'viewer' | 'editor' | 'converter' | 'analyzer';
  minAppVersion: string;
}

/**
 * 插件查看器属性
 */
export interface PluginViewerProps {
  file: {
    filename: string;
    size: number;
    path: string;
  };
  content: string | ArrayBuffer;
  storageClient: any;
  isLargeFile: boolean;
  onError: (error: string) => void;
  onLoadingChange: (loading: boolean) => void;
  // 语言设置
  language?: string;
  t?: (key: string, options?: any) => string;
}

/**
 * 插件源类型
 */
export interface PluginSource {
  type: 'local' | 'npm' | 'url';
  path?: string;
  packageName?: string;
  version?: string;
  url?: string;
}

/**
 * 插件实例
 */
export interface PluginInstance {
  metadata: PluginMetadata;
  component: React.ComponentType<PluginViewerProps>;
  canHandle: (filename: string) => boolean;
  getFileType: () => string;
  /**
   * 获取文件图标，可以返回字符串（如 emoji）或 React 组件
   * 注意：如果返回 React 组件，不要包含尺寸样式（如 w-4 h-4），
   * 系统会根据使用场景自动应用合适的尺寸
   */
  getFileIcon?: () => string | React.ReactNode;
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

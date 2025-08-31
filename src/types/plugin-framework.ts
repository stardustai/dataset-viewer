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
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  supportedExtensions: string[];
  mimeTypes: Record<string, string>;
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

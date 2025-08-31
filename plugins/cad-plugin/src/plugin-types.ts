// 主应用的插件接口类型定义
import React from 'react';

export interface PluginViewerProps {
  file: {
    filename: string;
    size: number;
    path: string;
  };
  content: string | ArrayBuffer;
  storageClient: any;
  containerHeight: number;
  isLargeFile: boolean;
  onError: (error: string) => void;
  onLoadingChange: (loading: boolean) => void;
  // 语言设置
  language?: string;
  t?: (key: string, options?: any) => string;
}

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

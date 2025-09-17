import type { ComponentType, ReactNode } from 'react';

/**
 * 插件初始化上下文
 */
export interface PluginInitializeContext {
  pluginBasePath?: string;
}

/**
 * 插件包接口
 */
export interface PluginBundle {
  metadata: PluginMetadata;
  component: ComponentType<PluginViewerProps>;
  initialize?: (context: PluginInitializeContext) => Promise<void>;
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
  icon?: string | ReactNode;
  /**
   * 按文件扩展名的图标映射，支持为不同文件类型指定不同图标
   * 键为文件扩展名（如 '.dwg', '.dxf'），值为图标
   * 如果某个扩展名没有在此映射中定义，则使用默认的 icon
   */
  iconMapping?: {
    [extension: string]: string | ReactNode;
  };
  /**
   * 是否为官方插件，由系统自动识别（基于包名是否以 @dataset-viewer/ 开头）
   * 插件开发者无需手动设置此字段
   */
  official?: boolean;
  category: 'viewer' | 'editor' | 'converter' | 'analyzer';
  minAppVersion: string;
}

/**
 * 文件获取接口
 */
export interface FileAccessor {
  /**
   * 获取完整文件内容
   */
  getFullContent: () => Promise<ArrayBuffer>;

  /**
   * 获取文件的指定范围内容
   * @param start 起始字节位置
   * @param end 结束字节位置（可选，不指定则读取到文件末尾）
   */
  getRangeContent: (start: number, end?: number) => Promise<ArrayBuffer>;

  /**
   * 获取文件的文本内容（自动处理编码）
   * @param encoding 指定编码，默认为 'utf-8'
   */
  getTextContent: (encoding?: string) => Promise<string>;
}

/**
 * 插件查看器属性
 */
export interface PluginViewerProps {
  file: {
    name: string;
    size: number;
    path: string;
  };
  /**
   * 预加载的文件内容（可选）
   * 如果提供了此内容，插件可以直接使用，否则需要通过 fileAccessor 获取
   */
  content?: string | ArrayBuffer;
  /**
   * 文件访问器，提供获取文件内容的方法
   */
  fileAccessor: FileAccessor;
  isLargeFile: boolean;
  onError: (error: string) => void;
  onLoadingChange: (loading: boolean) => void;
  // 语言设置
  language: string;
  t: (key: string, options?: any) => string;
}

/**
 * 插件实例
 */
export interface PluginInstance {
  metadata: PluginMetadata;
  component: ComponentType<PluginViewerProps>;
  canHandle: (filename: string) => boolean;
  getFileType: () => string;
  /**
   * 获取文件图标，可以返回字符串（如 emoji）或 React 组件
   * 注意：如果返回 React 组件，不要包含尺寸样式（如 w-4 h-4），
   * 系统会根据使用场景自动应用合适的尺寸
   * @param filename 可选的文件名，用于根据扩展名返回特定图标
   */
  getFileIcon?: (filename?: string) => string | ReactNode;
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
  installedAt?: string; // ISO 8601
  source: PluginSource;
}

/**
 * 插件源类型
 */
export type PluginSource =
  | { type: 'local'; path: string }
  | { type: 'npm'; packageName: string; version?: string }
  | { type: 'url'; url: string; integrity?: string };

// 类型定义导出
export type {
  PluginBundle,
  PluginMetadata,
  PluginViewerProps,
  PluginInstance,
  PluginInstallStatus,
  PluginInstallInfo,
  PluginSource,
  FileAccessor,
  PluginInitializeContext,
} from './types';

// 工具函数导出
export {
  createPlugin,
  validatePluginMetadata,
  getPluginIdFromPackageName,
  isFileSupported,
  formatFileSize,
  isLargeFile,
} from './utils';

// 版本信息
export const SDK_VERSION = '1.0.0';

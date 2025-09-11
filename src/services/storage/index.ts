// 统一存储服务入口点 - 简化架构

export { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';
export { localStorageAdapter } from './adapters/LocalAdapter';
export { ossStorageAdapter } from './adapters/OSSAdapter';

// 适配器导出
export { webdavStorageAdapter } from './adapters/WebDAVAdapter';
export { STORAGE_ADAPTERS, StorageClient } from './StorageClient';
// 便捷的默认导出
export {
  StorageClientFactory,
  StorageServiceManager,
  StorageServiceManager as default,
} from './StorageManager';
export * from './types';

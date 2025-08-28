// 统一存储服务入口点 - 简化架构
export { StorageClient, STORAGE_ADAPTERS } from './StorageClient';
export { StorageClientFactory, StorageServiceManager } from './StorageManager';
export * from './types';

// 适配器导出
export { webdavStorageAdapter } from './adapters/WebDAVAdapter';
export { localStorageAdapter } from './adapters/LocalAdapter';
export { ossStorageAdapter } from './adapters/OSSAdapter';
export { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';

// 便捷的默认导出
export { StorageServiceManager as default } from './StorageManager';

// 统一存储服务入口点 - 简化架构
export { StorageClient, STORAGE_ADAPTERS } from './StorageClient';
export { StorageClientFactory } from './StorageManager';
export * from './types';

// 适配器导出
export { webdavStorageAdapter } from './adapters/WebDAVAdapter';
export { localStorageAdapter } from './adapters/LocalAdapter';
export { ossStorageAdapter } from './adapters/OSSAdapter';
export { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';

// 统一存储服务入口点 - 简化架构

export { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';
export { localStorageAdapter } from './adapters/LocalAdapter';
export { ossStorageAdapter } from './adapters/OSSAdapter';

// 适配器导出
export { webdavStorageAdapter } from './adapters/WebDAVAdapter';
export { STORAGE_ADAPTERS, StorageClient } from './StorageClient';
export { StorageClientFactory } from './StorageManager';
export * from './types';

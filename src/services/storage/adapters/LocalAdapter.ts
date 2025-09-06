import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';

/**
 * 本地文件系统存储适配器
 * 处理本地文件系统特有的逻辑
 */
export const localStorageAdapter: StorageAdapter = {
  protocol: 'local',
  displayName: 'Local Files',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: null, // 不分页
  supportsSearch: true,
  supportsCustomRootDisplay: false,

  preprocessConnection: (config: ConnectionConfig) => {
    // 将 rootPath 转换为 url 字段供后端使用
    if (config.rootPath && !config.url) {
      return {
        ...config,
        url: config.rootPath,
      };
    }
    return config;
  },

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.rootPath) {
      throw new Error('Local storage not connected');
    }

    const cleanPath = path.replace(/^\/+/, '');
    let rootPath = connection.rootPath;

    // 标准化根路径：移除末尾斜杠
    rootPath = rootPath.replace(/\/+$/, '');

    // 构建完整路径
    let fullPath;
    if (cleanPath) {
      fullPath = `${rootPath}/${cleanPath}`;
    } else {
      fullPath = rootPath;
    }

    // 清理多余的斜杠并构建 file URL
    const normalizedPath = fullPath.replace(/\/+/g, '/');
    return `file:///${normalizedPath}`;
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    const rootPath = config.url || config.rootPath || '';
    const folderName = rootPath.split('/').pop() || rootPath;
    return `Local (${folderName})`;
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    const rootPath = config.url || config.rootPath!;

    return {
      rootPath,
      connected: true,
      displayPath: rootPath.split('/').pop() || rootPath,
    };
  },

  // === 新增的标准方法实现 ===

  getDefaultConfig: () => ({}),

  buildConnectionConfig: (formData: Record<string, any>, existingConnection?: any) => {
    const rootPath = formData.rootPath?.trim() || formData.url?.trim();

    const config: ConnectionConfig = {
      type: 'local',
      url: rootPath,
      rootPath: rootPath,
      name: existingConnection
        ? existingConnection.name
        : `Local (${rootPath?.split('/').pop() || 'unknown'})`,
    };

    return config;
  },

  extractFormData: (config: ConnectionConfig) => ({
    rootPath: config.rootPath || config.url || '',
  }),
};

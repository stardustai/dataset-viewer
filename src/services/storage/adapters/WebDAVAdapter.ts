import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';
import { getHostnameFromUrl } from '../../../utils/urlUtils';

/**
 * WebDAV 存储适配器
 * 处理 WebDAV 协议特有的逻辑
 */
export const webdavStorageAdapter: StorageAdapter = {
  protocol: 'webdav',
  displayName: 'WebDAV Server',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: null, // 不分页
  supportsSearch: false,
  supportsCustomRootDisplay: false,

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.url) {
      throw new Error('Not connected to WebDAV server');
    }

    const connectionUrl = new URL(connection.url);
    const scheme = connectionUrl.protocol === 'https:' ? 'webdavs' : 'webdav';
    const cleanPath = path.replace(/^\/+/, '');
    const basePath = connectionUrl.pathname.replace(/\/+$/, '');

    if (cleanPath) {
      return `${scheme}://${connectionUrl.host}${basePath}/${cleanPath}`;
    } else {
      return `${scheme}://${connectionUrl.host}${basePath}`;
    }
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    try {
      const hostname = getHostnameFromUrl(config.url!);
      return `WebDAV (${hostname})`;
    } catch {
      return 'WebDAV Server';
    }
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    return {
      url: config.url?.trim(),
      username: config.username,
      password: config.password,
      connected: true,
    };
  },

  // === 新增的标准方法实现 ===

  getDefaultConfig: () => ({}),

  buildConnectionConfig: (formData: Record<string, any>, existingConnection?: any) => {
    const config: ConnectionConfig = {
      type: 'webdav',
      url: formData.url?.trim(),
      username: formData.username?.trim(),
      password:
        formData.isPasswordFromStorage && existingConnection?.config.password
          ? existingConnection.config.password
          : formData.password,
      name: existingConnection
        ? existingConnection.name
        : `WebDAV (${formData.url?.trim() || 'unknown'})`,
    };

    return config;
  },

  extractFormData: (config: ConnectionConfig) => ({
    url: config.url || '',
    username: config.username || '',
    password: config.password ? '******' : '', // 使用占位符回显已保存的密码
    isPasswordFromStorage: !!config.password, // 如果有密码，标记为来自存储
  }),
};

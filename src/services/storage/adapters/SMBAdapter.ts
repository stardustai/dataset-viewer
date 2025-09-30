import type { StorageAdapter } from '../StorageClient';
import type { ConnectionConfig } from '../types';

/**
 * SMB 存储适配器
 * 处理 SMB/CIFS 协议特有的逻辑
 */
export const smbStorageAdapter: StorageAdapter = {
  protocol: 'smb',
  displayName: 'SMB/CIFS Server',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: null, // 不分页
  supportsSearch: false,
  supportsCustomRootDisplay: false,

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.url) {
      throw new Error('Not connected to SMB server');
    }

    const rawPath = (path ?? '').toString();
    const cleanPath = rawPath.replace(/^\/+/, '');
    const server = String(connection.url)
      .replace(/^smb:\/\//i, '')
      .replace(/^\/+|\/+$/g, '');
    const share = String(connection.share || '')
      .trim()
      .replace(/^[/\\]+|[/\\]+$/g, '');

    if (!share) {
      throw new Error('SMB share name is required');
    }
    if (share.includes('/')) {
      throw new Error('Invalid SMB share name');
    }
    const encodedShare = encodeURIComponent(share);
    const encodedPath = cleanPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');

    return encodedPath
      ? `smb://${server}/${encodedShare}/${encodedPath}`
      : `smb://${server}/${encodedShare}`;
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    try {
      const server = config.url || 'unknown';
      const share = config.share || 'share';
      return `SMB (${server}/${share})`;
    } catch {
      return 'SMB Server';
    }
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    return {
      url: config.url?.trim(),
      username: config.username,
      password: config.password,
      share: config.share || '',
      domain: config.domain || '',
      connected: true,
    };
  },

  // === 新增的标准方法实现 ===

  getDefaultConfig: () => ({
    share: '',
    domain: '',
  }),

  buildConnectionConfig: (formData: Record<string, any>, existingConnection?: any) => {
    const config: ConnectionConfig = {
      type: 'smb',
      url: formData.url?.trim(),
      username: formData.username?.trim(),
      password:
        formData.isPasswordFromStorage && existingConnection?.config.password
          ? existingConnection.config.password
          : formData.password,
      share: formData.share?.trim(),
      domain: formData.domain?.trim() || undefined,
      name: existingConnection
        ? existingConnection.name
        : `SMB (${formData.url?.trim() || 'unknown'}/${formData.share?.trim() || 'share'})`,
    };

    return config;
  },

  extractFormData: (config: ConnectionConfig) => ({
    url: config.url || '',
    username: config.username || '',
    password: config.password ? '******' : '', // 使用占位符回显已保存的密码
    share: config.share || '',
    domain: config.domain || '',
    isPasswordFromStorage: !!config.password, // 如果有密码，标记为来自存储
  }),
};

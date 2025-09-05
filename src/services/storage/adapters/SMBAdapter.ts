import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';

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

    const cleanPath = path.replace(/^\/+/, '');
    const server = connection.url;
    const share = connection.share || '';
    
    if (!share) {
      throw new Error('SMB share name is required');
    }

    if (cleanPath) {
      return `smb://${server}/${share}/${cleanPath}`;
    } else {
      return `smb://${server}/${share}`;
    }
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
};
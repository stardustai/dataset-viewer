import { StorageAdapter } from '../StorageClient';
import { ConnectionConfig } from '../types';

/**
 * SSH 存储适配器
 * 处理 SSH/SFTP 协议特有的逻辑
 */
export const sshStorageAdapter: StorageAdapter = {
  protocol: 'ssh',
  displayName: 'SSH/SFTP Server',
  defaultSortOptions: null, // 使用前端排序
  defaultPageSize: null, // 不分页
  supportsSearch: false,
  supportsCustomRootDisplay: false,

  preprocessConnection: (config: ConnectionConfig) => {
    // SSH 特有的配置预处理
    return {
      ...config,
      // 确保端口有默认值
      port: config.port || 22,
      // 确保远程路径有默认值
      url: config.url || '',
      // 将 rootPath 设置为远程路径
      rootPath: config.rootPath || '/',
    };
  },

  buildProtocolUrl: (path: string, connection: any) => {
    if (!connection?.url) {
      throw new Error('Not connected to SSH server');
    }

    const cleanPath = path.replace(/^\/+/, '');
    const server = connection.url;
    const port = connection.port || 22;
    const username = connection.username || '';
    const remotePath = connection.rootPath || '/';

    // 构建 SSH URL: ssh://user@host:port/path
    let sshUrl = `ssh://${username ? `${username}@` : ''}${server}`;

    if (port !== 22) {
      sshUrl += `:${port}`;
    }

    // 合并远程路径和请求路径
    let fullPath = remotePath;
    if (cleanPath) {
      fullPath = fullPath.endsWith('/') ? `${fullPath}${cleanPath}` : `${fullPath}/${cleanPath}`;
    }

    // 标准化路径
    fullPath = fullPath.replace(/\/+/g, '/');
    if (!fullPath.startsWith('/')) {
      fullPath = `/${fullPath}`;
    }

    return `${sshUrl}${fullPath}`;
  },

  generateConnectionName: (config: ConnectionConfig) => {
    if (config.name) return config.name;

    try {
      const server = config.url || 'unknown';
      const port = config.port || 22;
      const portSuffix = port !== 22 ? `:${port}` : '';
      return `SSH (${server}${portSuffix})`;
    } catch {
      return 'SSH Server';
    }
  },

  postConnect: (_connection: any, config: ConnectionConfig) => {
    return {
      url: config.url?.trim(),
      username: config.username,
      password: config.password,
      port: config.port || 22,
      privateKeyPath: config.privateKeyPath || '',
      passphrase: config.passphrase || '',
      rootPath: config.rootPath || '/',
      connected: true,
    };
  },
};

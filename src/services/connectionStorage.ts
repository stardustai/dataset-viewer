import { ConnectionConfig } from './storage/types';

export interface StoredConnection {
  id: string;
  name: string;
  config: ConnectionConfig; // 直接存储完整的连接配置
  lastConnected?: string;
  isDefault?: boolean;
}

class ConnectionStorageService {
  private readonly STORAGE_KEY = 'saved-connections';

  // 获取所有保存的连接
  getStoredConnections(): StoredConnection[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      const connections = stored ? JSON.parse(stored) : [];

      // 过滤无效的连接数据
      const validConnections = connections.filter((conn: any) => {
        return conn.id && conn.name && conn.config && conn.config.type;
      });

      // 按照最后连接时间排序，最近的在前面
      return validConnections.sort((a: StoredConnection, b: StoredConnection) => {
        const aTime = new Date(a.lastConnected || new Date().toISOString()).getTime();
        const bTime = new Date(b.lastConnected || new Date().toISOString()).getTime();
        return bTime - aTime; // 降序排列，最新的在前面
      });
    } catch (error) {
      console.error('Failed to load stored connections:', error);
      return [];
    }
  }

  // 保存连接配置
  async saveConnection(config: ConnectionConfig, name?: string): Promise<string> {
    const connections = this.getStoredConnections();

    // 检查是否已存在相同的连接
    const existingConnection = this.findConnection(config);
    if (existingConnection) {
      // 重新获取最新的连接列表并更新
      const updatedConnections = this.getStoredConnections();
      const targetConnection = updatedConnections.find(c => c.id === existingConnection.id);
      if (targetConnection) {
        targetConnection.config = { ...config };
        targetConnection.lastConnected = new Date().toISOString();
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedConnections));
      }

      return existingConnection.id;
    }

    const id = this.generateId();

    // 生成连接名称
    let connectionName = name || config.name;
    if (!connectionName) {
      connectionName = this.generateConnectionName(config);
    }

    // 直接保存完整的连接配置（包含密码信息）
    const storedConnection: StoredConnection = {
      id,
      name: connectionName,
      config: { ...config },
      lastConnected: new Date().toISOString(),
    };

    // 如果是第一个连接，设为默认
    if (connections.length === 0) {
      storedConnection.isDefault = true;
    }

    connections.push(storedConnection);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    return id;
  }

  // 查找匹配的连接
  findConnection(config: ConnectionConfig): StoredConnection | null {
    const connections = this.getStoredConnections();

    return (
      connections.find(conn => {
        const storedConfig = conn.config;

        // 基本类型匹配
        if (storedConfig.type !== config.type) return false;

        switch (config.type) {
          case 'webdav':
            // 标准化 URL 进行比较，移除末尾斜杠
            const normalizeUrl = (url?: string) => url?.trim().replace(/\/+$/, '') || '';
            return (
              normalizeUrl(storedConfig.url) === normalizeUrl(config.url) &&
              storedConfig.username === config.username
            );

          case 'local':
            return storedConfig.rootPath === config.rootPath;

          case 'oss':
            // 对于 OSS 连接，只比较桶的基础名称（不包含路径）
            const storedBucketBase = (storedConfig.bucket || '').split('/')[0];
            const configBucketBase = (config.bucket || '').split('/')[0];
            return (
              storedBucketBase === configBucketBase &&
              storedConfig.region === config.region &&
              storedConfig.endpoint === config.endpoint &&
              storedConfig.username === config.username
            );

          case 'huggingface':
            return storedConfig.organization === config.organization;

          case 'ssh':
            // SSH连接匹配：主机、端口、用户名
            const storedHost = storedConfig.url || '';
            const configHost = config.url || '';
            const storedPort = storedConfig.port || 22;
            const configPort = config.port || 22;
            return (
              storedHost === configHost &&
              storedPort === configPort &&
              storedConfig.username === config.username
            );

          case 'smb':
            // SMB连接匹配：主机、共享名、用户名
            const storedSmbHost = storedConfig.url || '';
            const configSmbHost = config.url || '';
            const storedShare = storedConfig.share || '';
            const configShare = config.share || '';
            return (
              storedSmbHost === configSmbHost &&
              storedShare === configShare &&
              storedConfig.username === config.username
            );

          default:
            return false;
        }
      }) || null
    );
  }

  // 生成连接名称
  generateConnectionName(config: ConnectionConfig): string {
    switch (config.type) {
      case 'webdav':
        const hostname = config.url ? this.getHostnameFromUrl(config.url) : 'WebDAV';
        return `WebDAV(${hostname})`;

      case 'local':
        const path = config.rootPath || '/';
        const folderName = path.split('/').filter(Boolean).pop() || 'Root';
        return `Local(${folderName})`;

      case 'oss':
        const platform = config.platform || 'OSS';
        return `${platform}(${config.bucket})`;

      case 'huggingface':
        return `HuggingFace(${config.organization || 'hub'})`;

      case 'ssh':
        const sshHost = config.url ? this.getHostnameFromUrl(config.url) : 'SSH';
        const sshPort = config.port && config.port !== 22 ? `:${config.port}` : '';
        return `SSH (${sshHost}${sshPort})`;

      case 'smb':
        const smbHost = config.url || 'unknown';
        const smbShare = config.share || 'share';
        return `SMB (${smbHost}/${smbShare})`;

      default:
        return 'Unknown Connection';
    }
  }

  // 从URL提取主机名
  private getHostnameFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // 更新最后连接时间
  updateLastConnected(id: string): void {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.lastConnected = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    }
  }

  // 删除连接
  deleteConnection(id: string): void {
    const connections = this.getStoredConnections();
    const filtered = connections.filter(c => c.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
  }

  // 恢复已删除的连接
  restoreConnection(connection: StoredConnection): void {
    const connections = this.getStoredConnections();
    const exists = connections.some(c => c.id === connection.id);
    if (!exists) {
      connections.push(connection);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    }
  }

  // 设置默认连接
  setDefaultConnection(id: string): void {
    const connections = this.getStoredConnections();
    connections.forEach(c => {
      c.isDefault = c.id === id;
    });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
  }

  // 获取默认连接
  getDefaultConnection(): StoredConnection | null {
    const connections = this.getStoredConnections();
    return connections.find(c => c.isDefault) || connections[0] || null;
  }

  // 重命名连接
  renameConnection(id: string, newName: string): boolean {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.name = newName;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
      return true;
    }
    return false;
  }

  // 清空所有连接
  clearAllConnections(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

export const connectionStorage = new ConnectionStorageService();

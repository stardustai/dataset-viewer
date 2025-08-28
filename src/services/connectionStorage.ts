import type { StorageConnection } from '../types';

export interface StoredConnection {
  id: string;
  name: string;
  url: string;
  username: string;
  password?: string; // 可选的密码字段
  lastConnected?: string;
  isDefault?: boolean;
  // 扩展元数据字段，用于存储不同存储类型的特定信息
  metadata?: {
    // HuggingFace 特定字段
    organization?: string;
    apiToken?: string;
    // OSS 特定字段
    bucket?: string;
    region?: string;
    endpoint?: string;
    // 其他存储类型可以在此添加字段
    [key: string]: any;
  };
}

class ConnectionStorageService {
  private readonly STORAGE_KEY = 'storage-connections';

  // 标准化 URL 格式 - 统一以斜杠结尾
  private normalizeUrl(url: string): string {
    try {
      // 移除尾部的多个斜杠，然后统一添加单个斜杠
      return `${url.replace(/\/+$/, '')}/`;
    } catch (error) {
      console.warn('Failed to normalize URL:', url, error);
      return url;
    }
  }

  // 获取所有保存的连接
  getStoredConnections(): StoredConnection[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      const connections = stored ? JSON.parse(stored) : [];

      // 迁移现有连接的 URL 格式（一次性处理）
      let needsSave = false;
      const migratedConnections = connections.map((conn: StoredConnection) => {
        const normalizedUrl = this.normalizeUrl(conn.url);
        if (conn.url !== normalizedUrl) {
          needsSave = true;
          return { ...conn, url: normalizedUrl };
        }
        return conn;
      });

      // 如果有 URL 被标准化，保存更新后的连接
      if (needsSave) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(migratedConnections));
      }

      const finalConnections = needsSave ? migratedConnections : connections;

      // 按照最后连接时间排序，最近的在前面
      // 对于没有 lastConnected 的连接，使用当前时间作为默认值
      return finalConnections.sort((a: StoredConnection, b: StoredConnection) => {
        const aTime = new Date(a.lastConnected || new Date().toISOString()).getTime();
        const bTime = new Date(b.lastConnected || new Date().toISOString()).getTime();
        return bTime - aTime; // 降序排列，最新的在前面
      });
    } catch (error) {
      console.error('Failed to load stored connections:', error);
      return [];
    }
  }

  // 保存连接配置（可选择保存密码）
  async saveConnection(
    connection: StorageConnection,
    name?: string,
    savePassword: boolean = false
  ): Promise<string> {
    const connections = this.getStoredConnections();

    // 清理输入数据：去除首尾空格
    const cleanedConnection = {
      ...connection,
      url: connection.url.trim(),
      username: connection.username.trim(),
    };

    // 标准化 URL 格式
    const normalizedUrl = this.normalizeUrl(cleanedConnection.url);

    // 检查是否已存在相同的连接（基于标准化的 URL 和用户名）
    const existingConnection = this.findConnection(
      normalizedUrl,
      cleanedConnection.username,
      cleanedConnection.metadata
    );
    if (existingConnection) {
      // 如果连接已存在，更新最后连接时间和密码（如果需要）
      this.updateLastConnected(existingConnection.id);
      if (savePassword && cleanedConnection.password) {
        this.updatePassword(existingConnection.id, cleanedConnection.password);
      }
      // 更新 metadata 信息（如果有变化）
      if (cleanedConnection.metadata) {
        this.updateMetadata(existingConnection.id, cleanedConnection.metadata);
      }
      return existingConnection.id;
    }

    const id = this.generateId();

    // 如果没有提供名称，使用 client 生成名称
    let connectionName = name;
    if (!connectionName) {
      try {
        // 动态导入避免循环依赖
        const { StorageClientFactory } = await import('./storage/StorageManager');

        // 确定连接类型
        let type: 'webdav' | 'oss' | 'local' = 'webdav';
        if (normalizedUrl.startsWith('file:///')) {
          type = 'local';
        } else if (normalizedUrl.startsWith('oss://') || this.isOSSEndpoint(normalizedUrl)) {
          type = 'oss';
        }

        connectionName = StorageClientFactory.generateConnectionName({
          type,
          url: normalizedUrl,
          username: cleanedConnection.username,
          password: cleanedConnection.password,
        });
      } catch (error) {
        console.warn('Failed to generate connection name with client, using fallback:', error);
        connectionName = normalizedUrl;
      }
    }

    const storedConnection: StoredConnection = {
      id,
      name: connectionName,
      url: normalizedUrl, // 使用标准化的 URL
      username: cleanedConnection.username,
      lastConnected: new Date().toISOString(),
    };

    // 根据选择决定是否保存密码
    if (savePassword && cleanedConnection.password) {
      storedConnection.password = cleanedConnection.password;
    }

    // 保存扩展的 metadata 信息
    if (cleanedConnection.metadata) {
      storedConnection.metadata = cleanedConnection.metadata;
    }

    // 如果是第一个连接，设为默认
    if (connections.length === 0) {
      storedConnection.isDefault = true;
    }

    connections.push(storedConnection);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    return id;
  } // 更新最后连接时间
  updateLastConnected(id: string): void {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.lastConnected = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    }
  }

  // 更新连接密码
  updatePassword(id: string, password: string): void {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.password = password;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    }
  }

  // 更新连接的 metadata
  updateMetadata(id: string, metadata: { [key: string]: any }): void {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.metadata = { ...connection.metadata, ...metadata };
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

    // 检查连接是否已存在（避免重复恢复）
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

  // 查找连接 - 使用标准化的 URL 进行比较
  findConnection(
    url: string,
    username: string,
    metadata?: { [key: string]: any }
  ): StoredConnection | null {
    const connections = this.getStoredConnections();
    const normalizedUrl = this.normalizeUrl(url);

    return (
      connections.find(c => {
        const urlMatch = this.normalizeUrl(c.url) === normalizedUrl;
        const usernameMatch = c.username === username;

        // 对于 HuggingFace 连接，额外检查组织名
        if (normalizedUrl.startsWith('huggingface://')) {
          const storedOrg = c.metadata?.organization;
          const inputOrg = metadata?.organization;
          return urlMatch && usernameMatch && storedOrg === inputOrg;
        }

        return urlMatch && usernameMatch;
      }) || null
    );
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

  // 检测是否为 OSS 端点
  private isOSSEndpoint(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      return (
        hostname.includes('.oss') || hostname.includes('.s3.') || hostname.includes('amazonaws.com')
      );
    } catch {
      return false;
    }
  }
}

export const connectionStorage = new ConnectionStorageService();

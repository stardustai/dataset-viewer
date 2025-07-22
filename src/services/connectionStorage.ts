import { WebDAVConnection } from '../types';

export interface StoredConnection {
  id: string;
  name: string;
  url: string;
  username: string;
  password?: string; // 可选的密码字段
  lastConnected?: string;
  isDefault?: boolean;
}

class ConnectionStorageService {
  private readonly STORAGE_KEY = 'webdav-connections';

  // 获取所有保存的连接
  getStoredConnections(): StoredConnection[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load stored connections:', error);
      return [];
    }
  }

  // 保存连接配置（可选择保存密码）
  saveConnection(connection: WebDAVConnection, name?: string, savePassword: boolean = false): string {
    const connections = this.getStoredConnections();
    const id = this.generateId();
    const connectionName = name || this.extractNameFromUrl(connection.url);

    const storedConnection: StoredConnection = {
      id,
      name: connectionName,
      url: connection.url,
      username: connection.username,
      lastConnected: new Date().toISOString(),
    };

    // 根据选择决定是否保存密码
    if (savePassword && connection.password) {
      storedConnection.password = connection.password;
    }

    // 如果是第一个连接，设为默认
    if (connections.length === 0) {
      storedConnection.isDefault = true;
    }

    connections.push(storedConnection);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    return id;
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

  // 更新连接密码
  updatePassword(id: string, password: string): void {
    const connections = this.getStoredConnections();
    const connection = connections.find(c => c.id === id);
    if (connection) {
      connection.password = password;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(connections));
    }
  }

  // 删除连接
  deleteConnection(id: string): void {
    const connections = this.getStoredConnections();
    const filtered = connections.filter(c => c.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
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

  // 查找连接
  findConnection(url: string, username: string): StoredConnection | null {
    const connections = this.getStoredConnections();
    return connections.find(c => c.url === url && c.username === username) || null;
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

  private extractNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (pathname && pathname !== '/') {
        return `${hostname}${pathname}`;
      }
      return hostname;
    } catch (error) {
      return url;
    }
  }
}

export const connectionStorage = new ConnectionStorageService();

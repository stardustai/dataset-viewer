import { StorageClient } from './StorageClient';
import { ConnectionConfig, StorageClientType } from './types';
import { connectionStorage, StoredConnection } from '../connectionStorage';
import { StorageConnection } from '../../types';
import { commands } from '../../types/tauri-commands';

/**
 * 存储客户端工厂 - 简化版
 * 统一使用 StorageClient 处理所有存储类型
 */
export class StorageClientFactory {
  private static instances: Map<string, StorageClient> = new Map();

  /**
   * 创建存储客户端实例 - 统一使用 StorageClient
   */
  static createClient(type: StorageClientType): StorageClient {
    return new StorageClient(type);
  }

  /**
   * 获取或创建存储客户端实例（单例模式）
   */
  static getInstance(type: StorageClientType, key?: string): StorageClient {
    const instanceKey = key || type;

    if (!this.instances.has(instanceKey)) {
      this.instances.set(instanceKey, this.createClient(type));
    }

    return this.instances.get(instanceKey)!;
  }

  /**
   * 连接到存储服务
   */
  static async connectToStorage(config: ConnectionConfig, key?: string): Promise<StorageClient> {
    const client = this.getInstance(config.type, key);

    try {
      const connected = await client.connect(config);

      if (!connected) {
        throw new Error(`Failed to connect to ${config.type} storage`);
      }

      return client;
    } catch (error) {
      // 重新抛出错误，保持原始错误信息
      throw error;
    }
  }

  /**
   * 断开连接并清理实例
   */
  static disconnect(key?: string): void {
    if (key) {
      const client = this.instances.get(key);
      if (client) {
        client.disconnect();
        this.instances.delete(key);
      }
    } else {
      // 断开所有连接
      for (const [key, client] of this.instances) {
        client.disconnect();
        this.instances.delete(key);
      }
    }
  }

  /**
   * 获取所有活跃的连接
   */
  static getActiveConnections(): Array<{ key: string; client: StorageClient }> {
    return Array.from(this.instances.entries()).map(([key, client]) => ({
      key,
      client,
    }));
  }

  /**
   * 检查是否支持指定的存储类型
   */
  static isSupportedType(type: string): type is StorageClientType {
    return ['webdav', 'local', 'oss', 'huggingface'].includes(type);
  }

  /**
   * 生成连接名称
   */
  static generateConnectionName(config: ConnectionConfig): string {
    try {
      const client = this.createClient(config.type);
      return client.generateConnectionName(config);
    } catch (error) {
      // 如果出错，回退到简单的名称生成
      console.warn('Failed to generate connection name:', error);
      return config.type.toUpperCase();
    }
  }
}

/**
 * 统一存储服务管理器 - 简化版
 * 提供高级存储操作和连接管理
 */
export class StorageServiceManager {
  private static currentClient: StorageClient | null = null;
  private static currentConnection: ConnectionConfig | null = null;

  /**
   * 统一连接方法 - 根据配置自动选择合适的连接方式
   */
  static async connectWithConfig(config: ConnectionConfig): Promise<boolean> {
    try {
      // 断开现有连接
      this.disconnect();

      // 连接新的存储
      this.currentClient = await StorageClientFactory.connectToStorage(config);
      this.currentConnection = config;

      // 自动保存连接信息（除非明确标记为临时连接）
      if (!config.isTemporary) {
        await this.saveConnectionInfo(config);
      }

      return true;
    } catch (error) {
      console.error('Connection failed:', error);
      return false;
    }
  }

  /**
   * 保存连接信息到本地存储
   */
  private static async saveConnectionInfo(config: ConnectionConfig): Promise<void> {
    try {
      // 查找匹配的已保存连接
      const connections = connectionStorage.getStoredConnections();
      const matchedConnection = this.findMatchingStoredConnection(connections, config);

      if (matchedConnection) {
        // 更新最后连接时间
        connectionStorage.updateLastConnected(matchedConnection.id);
      } else {
        // 创建新的保存连接记录
        const newConnection: StorageConnection = {
          url: this.getConnectionUrl(config),
          username: config.username || '',
          password: config.password || config.apiToken || '',
          connected: true,
          metadata: this.getConnectionMetadata(config),
        };

        await connectionStorage.saveConnection(
          newConnection,
          this.currentClient!.generateConnectionName(config),
          true
        );
      }
    } catch (error) {
      console.warn('Failed to save connection info:', error);
      // 不抛出错误，允许连接继续
    }
  }

  /**
   * 查找匹配的已保存连接
   */
  private static findMatchingStoredConnection(
    connections: StoredConnection[],
    config: ConnectionConfig
  ): StoredConnection | undefined {
    return connections.find(conn => {
      switch (config.type) {
        case 'webdav':
          return conn.url === config.url && conn.username === config.username;
        case 'local':
          return (
            conn.url.startsWith('file:///') && conn.url.includes(config.rootPath || config.url!)
          );
        case 'oss':
          return conn.url.startsWith('oss://') && conn.username === config.username;
        case 'huggingface':
          const storedOrg = conn.metadata?.organization;
          const configOrg = config.organization;
          return conn.url.startsWith('huggingface://') && storedOrg === configOrg;
        default:
          return false;
      }
    });
  }

  /**
   * 获取连接URL
   */
  private static getConnectionUrl(config: ConnectionConfig): string {
    switch (config.type) {
      case 'webdav': {
        return config.url!;
      }
      case 'local': {
        return `file:///${config.rootPath || config.url}`;
      }
      case 'oss': {
        return `oss://${config.bucket}`;
      }
      case 'huggingface': {
        return `huggingface://${config.organization || 'hub'}`;
      }
      default: {
        return config.url || '';
      }
    }
  }

  /**
   * 获取连接元数据
   */
  private static getConnectionMetadata(config: ConnectionConfig): any {
    const metadata: any = {};

    if (config.type === 'oss') {
      metadata.region = config.region;
      metadata.platform = config.platform;
    } else if (config.type === 'huggingface') {
      metadata.organization = config.organization;
    }

    return metadata;
  }

  /**
   * 设置当前活跃的存储客户端
   */
  static async setCurrentStorage(config: ConnectionConfig): Promise<void> {
    await this.connectWithConfig(config);
  }

  /**
   * 获取当前连接的显示名称
   */
  static getConnectionDisplayName(): string {
    if (!this.currentClient) {
      return 'Unknown';
    }
    return this.currentClient.getDisplayName();
  }

  /**
   * 获取当前存储客户端
   */
  static getCurrentClient(): StorageClient {
    if (!this.currentClient) {
      throw new Error('No storage client connected');
    }
    return this.currentClient;
  }

  /**
   * 获取当前连接配置
   */
  static getCurrentConnection(): ConnectionConfig {
    if (!this.currentConnection) {
      throw new Error('No storage connection active');
    }
    return this.currentConnection;
  }

  /**
   * 检查是否已连接
   */
  static isConnected(): boolean {
    return this.currentClient?.isConnected() || false;
  }

  /**
   * 断开当前连接
   */
  static disconnect(): void {
    if (this.currentClient) {
      this.currentClient.disconnect();
      this.currentClient = null;
      this.currentConnection = null;
    }
  }

  /**
   * 切换存储类型（如从 WebDAV 切换到 OSS）
   */
  static async switchStorage(config: ConnectionConfig): Promise<void> {
    await this.connectWithConfig(config);
  }

  /**
   * 获取存储类型特定的功能信息
   */
  static getStorageCapabilities(): {
    type: StorageClientType;
    supportsRangeRequests: boolean;
    supportsSearch: boolean;
  } {
    if (!this.currentClient || !this.currentConnection) {
      throw new Error('No storage connection active');
    }

    return {
      type: this.currentConnection.type,
      supportsRangeRequests: true, // 所有存储类型都支持范围请求
      supportsSearch: this.currentClient.supportsSearch(),
    };
  }

  /**
   * 自动连接
   */
  static async autoConnect(): Promise<boolean> {
    try {
      // 尝试使用默认连接
      const defaultConnection = connectionStorage.getDefaultConnection();
      if (defaultConnection) {
        const config = this.convertStoredConnectionToConfig(defaultConnection);
        if (config) {
          return await this.connectWithConfig(config);
        }
      }

      // 尝试使用最近的连接
      const connections = connectionStorage.getStoredConnections();
      if (connections.length > 0) {
        // 按最后连接时间排序
        const recent = [...connections].sort(
          (a, b) =>
            new Date(b.lastConnected || 0).getTime() - new Date(a.lastConnected || 0).getTime()
        )[0];

        const config = this.convertStoredConnectionToConfig(recent);
        if (config) {
          return await this.connectWithConfig(config);
        }
      }

      return false;
    } catch (error) {
      console.warn('Auto connect failed:', error);
      return false;
    }
  }

  /**
   * 将存储的连接转换为配置
   */
  private static convertStoredConnectionToConfig(
    connection: StoredConnection
  ): ConnectionConfig | null {
    try {
      // 从 URL 推断存储类型
      let storageType: StorageClientType;
      if (connection.url.startsWith('file:///')) {
        storageType = 'local';
      } else if (connection.url.startsWith('oss://')) {
        storageType = 'oss';
      } else if (connection.url.startsWith('huggingface://')) {
        storageType = 'huggingface';
      } else {
        storageType = 'webdav';
      }

      const baseConfig: ConnectionConfig = {
        type: storageType,
        name: connection.name,
        username: connection.username,
        password: connection.password,
      };

      if (connection.url.startsWith('file:///')) {
        baseConfig.rootPath = connection.url.replace('file:///', '/');
        if (!baseConfig.rootPath) {
          console.warn('Local storage missing rootPath');
          return null;
        }
      } else if (connection.url.startsWith('oss://')) {
        baseConfig.bucket = connection.url.replace('oss://', '');
        if (!baseConfig.bucket) {
          console.warn('OSS storage missing bucket');
          return null;
        }
        baseConfig.region = connection.metadata?.region;
      } else if (connection.url.startsWith('huggingface://')) {
        baseConfig.organization = connection.metadata?.organization;
      } else {
        baseConfig.url = connection.url;
        if (!baseConfig.url) {
          console.warn('WebDAV storage missing URL');
          return null;
        }
      }

      return baseConfig;
    } catch (error) {
      console.warn('Failed to convert stored connection:', error);
      return null;
    }
  }

  // ========== 文件操作便捷方法 ==========

  /**
   * 列出目录
   */
  static async listDirectory(path: string = '', options?: any) {
    const client = this.getCurrentClient();
    return await client.listDirectory(path, options);
  }

  /**
   * 获取文件内容
   */
  static async getFileContent(path: string, start?: number, length?: number) {
    const client = this.getCurrentClient();
    const options = start !== undefined && length !== undefined ? { start, length } : undefined;
    return await client.getFileContent(path, options);
  }

  /**
   * 获取文件大小
   */
  static async getFileSize(path: string): Promise<number> {
    const client = this.getCurrentClient();
    return await client.getFileSize(path);
  }

  /**
   * 下载文件
   */
  static async downloadFile(path: string): Promise<Blob> {
    const client = this.getCurrentClient();
    return await client.downloadFile(path);
  }

  /**
   * 带进度下载文件
   */
  static async downloadFileWithProgress(
    path: string,
    filename: string,
    savePath?: string
  ): Promise<string> {
    const client = this.getCurrentClient();
    if (client.downloadFileWithProgress) {
      return await client.downloadFileWithProgress(path, filename, savePath);
    }
    throw new Error('Progress download not supported for this storage type');
  }

  /**
   * 获取文件URL
   */
  static getFileUrl(path: string): string {
    const client = this.getCurrentClient();
    return client.toProtocolUrl(path);
  }

  /**
   * 获取连接信息
   */
  static getConnection(): any {
    return this.currentConnection;
  }

  // ========== 连接管理便捷方法 ==========

  static getStoredConnections() {
    return connectionStorage.getStoredConnections();
  }

  static getDefaultConnection() {
    return connectionStorage.getDefaultConnection();
  }

  static deleteConnection(id: string) {
    connectionStorage.deleteConnection(id);
  }

  static deleteStoredConnection(id: string) {
    connectionStorage.deleteConnection(id);
  }

  static restoreConnection(connection: StoredConnection) {
    connectionStorage.restoreConnection(connection);
  }

  static renameStoredConnection(id: string, newName: string) {
    connectionStorage.renameConnection(id, newName);
  }

  static setDefaultConnection(id: string) {
    connectionStorage.setDefaultConnection(id);
  }

  /**
   * 连接到本地文件系统的便利方法
   */
  static async connectToLocal(
    rootPath: string,
    connectionName?: string,
    isTemporary?: boolean
  ): Promise<boolean> {
    const config: ConnectionConfig = {
      type: 'local',
      rootPath,
      url: rootPath,
      name: connectionName || `Local Files(${rootPath})`,
      isTemporary: isTemporary,
    };
    return await this.connectWithConfig(config);
  }

  /**
   * 下载压缩文件中的文件（带进度）
   */
  static async downloadArchiveFileWithProgress(
    archivePath: string,
    entryPath: string,
    filename: string,
    savePath?: string
  ): Promise<string> {
    // 对于压缩文件内的文件，我们需要先获取文件内容，然后保存
    // 这个方法可能需要后端支持
    const client = this.getCurrentClient();

    try {
      // 尝试使用普通下载方法
      if (client.downloadFileWithProgress) {
        // 构造压缩文件内文件的路径
        const fullPath = `${archivePath}#${entryPath}`;
        return await client.downloadFileWithProgress(fullPath, filename, savePath);
      } else {
        throw new Error('Archive file progress download not supported for this storage type');
      }
    } catch (error) {
      console.error('downloadArchiveFileWithProgress failed:', error);
      throw error;
    }
  }

  /**
   * 获取文件下载URL
   */
  static async getDownloadUrl(path: string): Promise<string> {
    const result = await commands.storageGetUrl(path);
    if (result.status === 'error') {
      throw new Error(result.error);
    }
    return result.data;
  }

  /**
   * 获取文件的ArrayBuffer内容
   */
  static async getFileArrayBuffer(path: string): Promise<ArrayBuffer> {
    const client = this.getCurrentClient();
    const blob = await client.downloadFile(path);
    return await blob.arrayBuffer();
  }
}

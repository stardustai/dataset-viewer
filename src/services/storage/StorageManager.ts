import { commands } from '../../types/tauri-commands';
import { connectionStorage, type StoredConnection } from '../connectionStorage';
import { StorageClient } from './StorageClient';
import type { ConnectionConfig, StorageClientType } from './types';

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

    if (!StorageClientFactory.instances.has(instanceKey)) {
      StorageClientFactory.instances.set(instanceKey, StorageClientFactory.createClient(type));
    }

    return StorageClientFactory.instances.get(instanceKey)!;
  }

  /**
   * 连接到存储服务
   */
  static async connectToStorage(config: ConnectionConfig, key?: string): Promise<StorageClient> {
    const client = StorageClientFactory.getInstance(config.type, key);

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
      const client = StorageClientFactory.instances.get(key);
      if (client) {
        client.disconnect();
        StorageClientFactory.instances.delete(key);
      }
    } else {
      // 断开所有连接
      for (const [key, client] of StorageClientFactory.instances) {
        client.disconnect();
        StorageClientFactory.instances.delete(key);
      }
    }
  }

  /**
   * 获取所有活跃的连接
   */
  static getActiveConnections(): Array<{ key: string; client: StorageClient }> {
    return Array.from(StorageClientFactory.instances.entries()).map(([key, client]) => ({
      key,
      client,
    }));
  }

  /**
   * 检查是否支持指定的存储类型
   */
  static isSupportedType(type: string): type is StorageClientType {
    return ['webdav', 'local', 'oss', 'huggingface', 'ssh', 'smb'].includes(type);
  }

  /**
   * 生成连接名称
   */
  static generateConnectionName(config: ConnectionConfig): string {
    try {
      const client = StorageClientFactory.createClient(config.type);
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
      StorageServiceManager.disconnect();

      // 连接新的存储
      StorageServiceManager.currentClient = await StorageClientFactory.connectToStorage(config);
      StorageServiceManager.currentConnection = config;

      // 自动保存连接信息（除非明确标记为临时连接）
      if (!config.isTemporary) {
        const connectionId = await StorageServiceManager.saveConnectionInfo(config);
        // 如果成功保存连接，设置为默认连接
        if (connectionId) {
          connectionStorage.setDefaultConnection(connectionId);
        }
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
  private static async saveConnectionInfo(config: ConnectionConfig): Promise<string | null> {
    try {
      // 直接使用 connectionStorage.saveConnection，它会自动处理新建或更新逻辑
      const connectionId = await connectionStorage.saveConnection(
        config,
        StorageServiceManager.currentClient!.generateConnectionName(config)
      );
      return connectionId;
    } catch (error) {
      console.warn('Failed to save connection info:', error);
      // 不抛出错误，允许连接继续
      return null;
    }
  }

  /**
   * 设置当前活跃的存储客户端
   */
  static async setCurrentStorage(config: ConnectionConfig): Promise<void> {
    await StorageServiceManager.connectWithConfig(config);
  }

  /**
   * 获取当前连接的显示名称
   */
  /**
   * 获取连接显示名称
   */
  static getConnectionDisplayName(): string {
    if (!StorageServiceManager.isConnected() || !StorageServiceManager.currentClient) {
      return 'Unknown';
    }
    return StorageServiceManager.currentClient.getDisplayName();
  }

  /**
   * 获取当前存储客户端
   */
  static getCurrentClient(): StorageClient {
    if (!StorageServiceManager.currentClient) {
      throw new Error('No storage client connected');
    }
    return StorageServiceManager.currentClient;
  }

  /**
   * 获取当前连接配置
   */
  static getCurrentConnection(): ConnectionConfig {
    if (!StorageServiceManager.currentConnection) {
      throw new Error('No storage connection active');
    }
    return StorageServiceManager.currentConnection;
  }

  /**
   * 检查是否已连接
   */
  static isConnected(): boolean {
    return StorageServiceManager.currentClient?.isConnected() || false;
  }

  /**
   * 断开当前连接
   */
  static disconnect(): void {
    if (StorageServiceManager.currentClient) {
      StorageServiceManager.currentClient.disconnect();
      StorageServiceManager.currentClient = null;
      StorageServiceManager.currentConnection = null;
    }
  }

  /**
   * 切换存储类型（如从 WebDAV 切换到 OSS）
   */
  static async switchStorage(config: ConnectionConfig): Promise<void> {
    await StorageServiceManager.connectWithConfig(config);
  }

  /**
   * 获取存储类型特定的功能信息
   */
  static getStorageCapabilities(): {
    type: StorageClientType;
    supportsRangeRequests: boolean;
    supportsSearch: boolean;
  } {
    if (!StorageServiceManager.currentClient || !StorageServiceManager.currentConnection) {
      throw new Error('No storage connection active');
    }

    return {
      type: StorageServiceManager.currentConnection.type,
      supportsRangeRequests: true, // 所有存储类型都支持范围请求
      supportsSearch: StorageServiceManager.currentClient.supportsSearch(),
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
        return await StorageServiceManager.connectWithConfig(defaultConnection.config);
      }

      // 尝试使用最近的连接
      const connections = connectionStorage.getStoredConnections();
      if (connections.length > 0) {
        // connections 已经按最后连接时间排序，取第一个即可
        return await StorageServiceManager.connectWithConfig(connections[0].config);
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
  // ========== 文件操作便捷方法 ==========

  /**
   * 列出目录
   */
  static async listDirectory(path: string = '', options?: any) {
    const client = StorageServiceManager.getCurrentClient();
    return await client.listDirectory(path, options);
  }

  /**
   * 获取文件内容
   */
  static async getFileContent(path: string, start?: number, length?: number) {
    const client = StorageServiceManager.getCurrentClient();
    const options = start !== undefined && length !== undefined ? { start, length } : undefined;
    return await client.getFileContent(path, options);
  }

  /**
   * 获取文件大小
   */
  static async getFileSize(path: string): Promise<number> {
    const client = StorageServiceManager.getCurrentClient();
    return await client.getFileSize(path);
  }

  /**
   * 下载文件
   */
  static async downloadFile(path: string): Promise<Blob> {
    const client = StorageServiceManager.getCurrentClient();
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
    const client = StorageServiceManager.getCurrentClient();
    if (client.downloadFileWithProgress) {
      return await client.downloadFileWithProgress(path, filename, savePath);
    }
    throw new Error('Progress download not supported for this storage type');
  }

  /**
   * 获取文件URL
   */
  static getFileUrl(path: string): string {
    const client = StorageServiceManager.getCurrentClient();
    return client.toProtocolUrl(path);
  }

  /**
   * 获取连接信息
   */
  static getConnection(): any {
    return StorageServiceManager.currentConnection;
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
    return await StorageServiceManager.connectWithConfig(config);
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
    const client = StorageServiceManager.getCurrentClient();

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
    const client = StorageServiceManager.getCurrentClient();
    const blob = await client.downloadFile(path);
    return await blob.arrayBuffer();
  }
}

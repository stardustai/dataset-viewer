import { BaseStorageClient } from './BaseStorageClient';
import { WebDAVStorageClient } from './WebDAVStorageClient';
import { LocalStorageClient } from './LocalStorageClient';
import { OSSStorageClient } from './OSSStorageClient';
import { HuggingFaceStorageClient } from './HuggingFaceStorageClient';
import { ConnectionConfig, StorageClientType } from './types';
import { connectionStorage, StoredConnection } from '../connectionStorage';
import { formatServiceName } from '../../utils/urlUtils';

/**
 * 存储客户端工厂
 * 负责创建和管理不同类型的存储客户端实例
 */
export class StorageClientFactory {
  private static instances: Map<string, BaseStorageClient> = new Map();

  /**
   * 创建存储客户端实例
   */
  static createClient(type: StorageClientType): BaseStorageClient {
    switch (type) {
      case 'webdav':
        return new WebDAVStorageClient();
      case 'local':
        return new LocalStorageClient();
      case 'oss':
        return new OSSStorageClient();
      case 'huggingface':
        return new HuggingFaceStorageClient();
      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }

  /**
   * 获取或创建存储客户端实例（单例模式）
   */
  static getInstance(type: StorageClientType, key?: string): BaseStorageClient {
    const instanceKey = key || type;

    if (!this.instances.has(instanceKey)) {
      this.instances.set(instanceKey, this.createClient(type));
    }

    return this.instances.get(instanceKey)!;
  }

  /**
   * 连接到存储服务
   */
  static async connectToStorage(config: ConnectionConfig, key?: string): Promise<BaseStorageClient> {
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
      this.instances.forEach(client => client.disconnect());
      this.instances.clear();
    }
  }

  /**
   * 获取所有活跃的连接
   */
  static getActiveConnections(): Array<{ key: string; client: BaseStorageClient }> {
    return Array.from(this.instances.entries())
      .filter(([_, client]) => client.isConnected())
      .map(([key, client]) => ({ key, client }));
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
 * 统一存储服务管理器
 * 提供高级存储操作和缓存管理
 */
export class StorageServiceManager {
  private static currentClient: BaseStorageClient | null = null;
  private static currentConnection: ConnectionConfig | null = null;

  /**
   * 统一连接方法 - 根据配置自动选择合适的连接方式
   */
  static async connectWithConfig(config: ConnectionConfig): Promise<boolean> {
    try {
      if (this.isConnected()) {
        this.disconnect();
      }

      // 生成默认连接名称（如果没有提供）
      if (!config.name) {
        config.name = StorageClientFactory.generateConnectionName(config);
      }

      // 直接使用 setCurrentStorage 建立连接
      await this.setCurrentStorage(config);

      // 连接成功后保存连接信息
      await this.saveConnectionInfo(config);

      // 设置为默认连接
      const connections = this.getStoredConnections();
      const matchingConnection = this.findMatchingStoredConnection(connections, config);

      if (matchingConnection) {
        this.setDefaultConnection(matchingConnection.id);
      }

      return true;
    } catch (error) {
      console.error(`${config.type} connection error:`, error);
      throw error;
    }
  }

  /**
   * 保存连接信息到本地存储
   */
  private static async saveConnectionInfo(config: ConnectionConfig): Promise<void> {
    let connectionData;

    switch (config.type) {
      case 'webdav': {
        connectionData = {
          url: config.url!,
          username: config.username!,
          password: config.password!,
          connected: true
        };
        await connectionStorage.saveConnection(connectionData, config.name, true);
        break;
      }

      case 'local': {
        connectionData = {
          url: `file:///${config.rootPath || config.url!}`,
          username: 'local',
          password: '',
          connected: true
        };
        await connectionStorage.saveConnection(connectionData, config.name, false);
        break;
      }

      case 'oss': {
        const endpointUrl = new URL(config.url!);
        const ossUrl = `oss://${endpointUrl.hostname}${config.bucket ? '/' + config.bucket : ''}`;
        connectionData = {
          url: ossUrl,
          username: config.username!,
          password: config.password!,
          connected: true,
          metadata: {
            bucket: config.bucket,
            region: config.region,
            endpoint: config.endpoint || config.url
          }
        };
        await connectionStorage.saveConnection(connectionData, config.name, true);
        break;
      }

      case 'huggingface': {
        const hfUrl = `huggingface://${config.organization || 'hub'}`;
        connectionData = {
          url: hfUrl,
          username: '', // 不再使用 username 存储组织信息
          password: '', // 不再使用 password 存储 API token
          connected: true,
          metadata: {
            organization: config.organization,
            apiToken: config.apiToken
          }
        };
        await connectionStorage.saveConnection(connectionData, config.name, true);
        break;
      }
    }
  }

  /**
   * 查找匹配的已保存连接
   */
  private static findMatchingStoredConnection(connections: any[], config: ConnectionConfig) {
    return connections.find(conn => {
      switch (config.type) {
        case 'webdav':
          return conn.url === config.url && conn.username === config.username;
        case 'local':
          return conn.url.startsWith('file:///') && conn.url.includes(config.rootPath || config.url!);
        case 'oss':
          return conn.url.startsWith('oss://') && conn.username === config.username;
        case 'huggingface':
          // 匹配 HuggingFace 连接：使用 metadata 中的组织信息
          const storedOrg = conn.metadata?.organization;
          const configOrg = config.organization;
          return conn.url.startsWith('huggingface://') && storedOrg === configOrg;
        default:
          return false;
      }
    });
  }

  /**
   * 设置当前活跃的存储客户端
   */
  static async setCurrentStorage(config: ConnectionConfig): Promise<void> {
    // 断开现有连接
    if (this.currentClient) {
      this.currentClient.disconnect();
      this.currentClient = null;
      this.currentConnection = null;
    }

    // 如果切换到不同类型的存储，清理对应的单例实例
    if (this.currentConnection && this.currentConnection.type !== config.type) {
      StorageClientFactory.disconnect(this.currentConnection.type);
    }

    // 连接新的存储
    this.currentClient = await StorageClientFactory.connectToStorage(config);
    this.currentConnection = config;
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
  static getCurrentClient(): BaseStorageClient {
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
    const previousType = this.currentConnection?.type;

    try {
      await this.setCurrentStorage(config);
      console.log(`Switched from ${previousType || 'none'} to ${config.type}`);
    } catch (error) {
      console.error(`Failed to switch to ${config.type}:`, error);
      throw error;
    }
  }

  /**
   * 获取存储类型特定的功能信息
   */
  static getStorageCapabilities(): {
    type: StorageClientType;
    supportsPagination: boolean;
    supportsRangeRequests: boolean;
    supportsSearch: boolean;
  } {
    if (!this.currentClient || !this.currentConnection) {
      throw new Error('No storage connection active');
    }

    // 根据存储类型返回不同的功能集
    switch (this.currentConnection.type) {
      case 'webdav':
        return {
          type: 'webdav',
          supportsPagination: false, // WebDAV 不原生支持分页
          supportsRangeRequests: true,
          supportsSearch: false, // 大多数 WebDAV 服务器不支持搜索
        };
      case 'local':
        return {
          type: 'local',
          supportsPagination: false, // 本机文件系统不需要分页
          supportsRangeRequests: true,
          supportsSearch: true, // 本机文件系统支持文件名搜索
        };
      default:
        throw new Error(`Unknown storage type: ${this.currentConnection.type}`);
    }
  }

  /**
   * 自动连接
   */
  static async autoConnect(): Promise<boolean> {
    const defaultConnection = connectionStorage.getDefaultConnection();
    if (!defaultConnection) return false;

    try {
      // 根据连接类型进行不同的处理
      if (defaultConnection.url.startsWith('file:///')) {
      // 本地连接
      const rootPath = defaultConnection.url.replace('file:///', '');
        return await this.connectToLocal(rootPath, defaultConnection.name);
      } else if (defaultConnection.url.startsWith('oss://')) {
        // OSS 连接 - 从 metadata 获取信息
        const endpoint = defaultConnection.metadata?.endpoint;
        const bucketName = defaultConnection.metadata?.bucket || '';
        const region = defaultConnection.metadata?.region || '';

        const config: ConnectionConfig = {
          type: 'oss',
          url: endpoint,
          username: defaultConnection.username, // accessKey
          password: defaultConnection.password || '', // secretKey
          bucket: bucketName,
          region: region,
          endpoint: endpoint,
          name: defaultConnection.name
        };

        await this.setCurrentStorage(config);
        return true;
      } else if (defaultConnection.url.startsWith('huggingface://')) {
        // HuggingFace 连接 - 从 metadata 获取信息
        const organization = defaultConnection.metadata?.organization;
        const apiToken = defaultConnection.metadata?.apiToken || '';

        const config: ConnectionConfig = {
          type: 'huggingface',
          name: defaultConnection.name,
          apiToken: apiToken,
          organization: organization
        };

        await this.setCurrentStorage(config);
        return true;
      } else {
        // WebDAV 连接
        return await this.connect(
          defaultConnection.url,
          defaultConnection.username,
          defaultConnection.password || ''
        );
      }
    } catch (error) {
      console.warn('Auto connect failed:', error);
      return false;
    }
  }

  /**
   * 列出目录
   */
  static async listDirectory(path: string = '') {
    const client = this.getCurrentClient();
    const result = await client.listDirectory(path);

    // 转换为原有的格式
    return result.files.map(file => ({
      filename: file.filename,
      basename: file.basename,
      lastmod: file.lastmod,
      size: file.size,
      type: file.type,
      mime: file.mime || '',
      etag: file.etag || ''
    }));
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
    console.log('[StorageManager] downloadFile called with path:', path);
    console.log('[StorageManager] current client type:', client.constructor.name);
    console.log('[StorageManager] current connection:', this.currentConnection?.type);
    return await client.downloadFile(path);
  }

  /**
   * 带进度下载文件
   */
  static async downloadFileWithProgress(path: string, filename: string): Promise<string> {
    const client = this.getCurrentClient();
    if (client.downloadFileWithProgress) {
      return await client.downloadFileWithProgress(path, filename);
    } else {
      throw new Error('Download with progress not supported');
    }
  }

  /**
   * 下载压缩包内的单个文件
   */
  static async downloadArchiveFileWithProgress(
    archivePath: string,
    archiveFilename: string,
    entryPath: string,
    entryFilename: string
  ): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // 使用超时保护，下载操作使用较长的超时时间
    const timeoutMs = 300000; // 5分钟
    
    return Promise.race([
      invoke('download_archive_file_with_progress', {
        archivePath,
        archiveFilename,
        entryPath,
        entryFilename,
      }) as Promise<string>,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`下载操作超时 (${timeoutMs}ms)`));
        }, timeoutMs);
      })
    ]);
  }

  /**
   * 获取文件二进制数据
   */
  static async getFileBlob(path: string): Promise<ArrayBuffer> {
    const blob = await this.downloadFile(path);
    return await blob.arrayBuffer();
  }

  /**
   * 获取文件URL
   */
  static getFileUrl(path: string): string {
    const client = this.getCurrentClient();

    // 如果路径已经是协议URL格式，直接返回
    if (path.includes('://')) {
      return path;
    }

    return client.toProtocolUrl(path);
  }

  /**
   * 获取文件下载URL（直接可用的URL）
   */
  static async getDownloadUrl(path: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string>('storage_get_download_url', { path });
  }

  /**
   * 获取请求headers
   */
  static getHeaders(): Record<string, string> {
    const connection = this.getCurrentConnection();
    if (!connection || !connection.username || !connection.password) return {};

    return {
      'Authorization': `Basic ${btoa(`${connection.username}:${connection.password}`)}`
    };
  }

  /**
   * 获取连接信息
   */
  static getConnection() {
    try {
      const config = this.getCurrentConnection();
      const client = this.getCurrentClient();

      // 对于 HuggingFace，构建虚拟 URL
      let url = config.url;
      if (client instanceof HuggingFaceStorageClient && !url) {
        const org = config.organization || 'hub';
        url = `huggingface://${org}`;
      }

      return {
        url: url!,
        username: config.username!,
        password: config.password!,
        connected: true
      };
    } catch {
      return null;
    }
  }

  // 连接管理便捷方法
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

  // ========== 统一存储接口（便捷方法）==========

  /**
   * WebDAV 兼容连接方法
   */
  static async connect(
    url: string,
    username: string,
    password: string,
    connectionName?: string
  ): Promise<boolean> {
    const config: ConnectionConfig = {
      type: 'webdav',
      url,
      username,
      password,
      name: connectionName || formatServiceName(url, 'WebDAV')
    };
    return await this.connectWithConfig(config);
  }

  /**
   * 连接到本机文件系统
   */
  static async connectToLocal(
    rootPath: string,
    connectionName?: string
  ): Promise<boolean> {
    const config: ConnectionConfig = {
      type: 'local',
      rootPath,
      url: rootPath,
      name: connectionName || `Local Files(${rootPath})`
    };
    return await this.connectWithConfig(config);
  }

  /**
   * 连接到 OSS 对象存储
   */
  static async connectToOSS(config: ConnectionConfig): Promise<boolean> {
    return await this.connectWithConfig(config);
  }

  /**
   * 连接到 HuggingFace Hub
   */
  static async connectToHuggingFace(config: ConnectionConfig): Promise<boolean> {
    return await this.connectWithConfig(config);
  }
}

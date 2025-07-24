import { WebDAVConnection, WebDAVFile, FileContent } from '../../types';
import { configManager } from '../../config';
import { connectionStorage, StoredConnection } from '../connectionStorage';
import { navigationHistoryService } from '../navigationHistory';
import { WebDAVClient } from './client';
import { WebDAVDirectoryService } from './directory';
import { WebDAVFileService } from './file';

class WebDAVService {
  private client: WebDAVClient;
  private directoryService: WebDAVDirectoryService;
  private fileService: WebDAVFileService;

  constructor() {
    this.client = new WebDAVClient();
    this.directoryService = new WebDAVDirectoryService(this.client);
    this.fileService = new WebDAVFileService(this.client);
  }

  async connect(url: string, username: string, password: string, saveConnection: boolean = true, connectionName?: string, savePassword: boolean = false): Promise<boolean> {
    try {
      // Test connection with a simple HEAD request first
      const testConnection = { url, username, password, connected: false };
      this.client.setConnection(testConnection);

      // Try HEAD request first (most lightweight) - use empty path to trigger base URL
      let response;
      try {
        response = await this.client.makeRequest('HEAD', '');
      } catch (error) {
        // If HEAD fails, try GET as fallback
        console.warn('HEAD request failed, trying GET:', error);
        response = await this.client.makeRequest('GET', '');
      }

      if (response.status >= 200 && response.status < 400) {
        // 初始化服务器能力检测
        this.directoryService.setServerCapabilities({
          supportsWebDAV: false,
          preferredMethod: 'AUTO',
          lastDetected: Date.now()
        });

        // Try to detect WebDAV support by attempting PROPFIND
        try {
          const webdavTest = await this.client.makeRequest('PROPFIND', '', {
            'Depth': '1',
          }, '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>');

          // Check both status code and response content type
          const contentType = webdavTest.headers['content-type'] || '';
          const isWebDAVResponse = (webdavTest.status >= 200 && webdavTest.status < 300) &&
                                 (contentType.includes('xml') || webdavTest.body.trim().startsWith('<?xml'));

          if (isWebDAVResponse) {
            this.directoryService.setServerCapabilities({
              supportsWebDAV: true,
              preferredMethod: 'PROPFIND',
              lastDetected: Date.now()
            });
            console.log('WebDAV server detected - using PROPFIND method');
          } else {
            this.directoryService.setServerCapabilities({
              supportsWebDAV: false,
              preferredMethod: 'GET',
              lastDetected: Date.now()
            });
            console.log('Non-WebDAV server detected - using GET method');
          }
        } catch (error) {
          console.warn('PROPFIND test failed, will auto-detect on first directory request:', error);
          // Start with auto-detection, let the actual request determine support
          this.directoryService.setServerCapabilities({
            supportsWebDAV: false,
            preferredMethod: 'AUTO',
            lastDetected: Date.now()
          });
        }

        const connection = {
          url,
          username,
          password,
          connected: true,
        };
        this.client.setConnection(connection);

        // 保存或更新连接配置
        if (saveConnection) {
          const existingConnection = connectionStorage.findConnection(url, username);
          if (existingConnection) {
            connectionStorage.updateLastConnected(existingConnection.id);
            // 如果选择保存密码，更新密码
            if (savePassword) {
              connectionStorage.updatePassword(existingConnection.id, password);
            }
          } else {
            connectionStorage.saveConnection(connection, connectionName, savePassword);
          }
        }

        return true;
      }

      this.client.setConnection(null);
      return false;
    } catch (error) {
      console.error('Failed to connect to WebDAV server:', error);
      this.client.setConnection(null);
      return false;
    }
  }

  disconnect(): void {
    this.client.setConnection(null);
    this.directoryService.setServerCapabilities({
      supportsWebDAV: false,
      preferredMethod: 'AUTO',
      lastDetected: 0
    });

    // 清理路径和文件缓存
    navigationHistoryService.clearHistory();
    navigationHistoryService.clearDirectoryCache();
    navigationHistoryService.clearScrollPositions();
  }

  // 连接管理方法
  getStoredConnections(): StoredConnection[] {
    return connectionStorage.getStoredConnections();
  }

  getDefaultConnection(): StoredConnection | null {
    return connectionStorage.getDefaultConnection();
  }

  deleteStoredConnection(id: string): void {
    connectionStorage.deleteConnection(id);
  }

  setDefaultConnection(id: string): void {
    connectionStorage.setDefaultConnection(id);
  }

  renameStoredConnection(id: string, newName: string): boolean {
    return connectionStorage.renameConnection(id, newName);
  }

  // 使用存储的连接进行连接
  async connectWithStored(storedConnection: StoredConnection, password?: string): Promise<boolean> {
    const connectPassword = password || storedConnection.password;
    if (!connectPassword) {
      throw new Error('Password is required');
    }

    const success = await this.connect(storedConnection.url, storedConnection.username, connectPassword, false);
    if (success) {
      connectionStorage.updateLastConnected(storedConnection.id);
    }
    return success;
  }

  // 尝试自动连接到默认连接
  async autoConnect(): Promise<boolean> {
    const defaultConnection = connectionStorage.getDefaultConnection();
    if (defaultConnection && defaultConnection.password) {
      try {
        return await this.connectWithStored(defaultConnection);
      } catch (error) {
        console.warn('Auto connect failed:', error);
        return false;
      }
    }
    return false;
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  getConnection(): WebDAVConnection | null {
    return this.client.getConnection();
  }

  // Directory operations
  async listDirectory(path: string = ''): Promise<WebDAVFile[]> {
    return await this.directoryService.listDirectory(path);
  }

  // File operations
  async getFileContent(path: string, start?: number, length?: number): Promise<FileContent> {
    return await this.fileService.getFileContent(path, start, length);
  }

  async getFileBlob(path: string): Promise<ArrayBuffer> {
    return await this.fileService.getFileBlob(path);
  }

  async getFileStream(path: string, start?: number, end?: number): Promise<string> {
    return await this.fileService.getFileStream(path, start, end);
  }

  async getFileSize(path: string): Promise<number> {
    return await this.fileService.getFileSize(path);
  }

  async downloadFile(filePath: string): Promise<Blob> {
    return await this.fileService.downloadFile(filePath);
  }

  async downloadFileWithProgress(filePath: string, filename: string): Promise<string> {
    try {
      const result = await this.client.downloadFileWithProgress('GET', filePath, filename);
      return result;
    } catch (error) {
      console.error('Download with progress failed:', error);
      throw error;
    }
  }

  // Utility methods
  isTextFile(filename: string): boolean {
    return configManager.isTextFile({ filename } as WebDAVFile);
  }

  getFileUrl(path: string): string {
    const connection = this.client.getConnection();
    if (!connection) {
      throw new Error('No active connection');
    }

    // 确保路径以 / 开头
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    // 移除 URL 末尾的 /，然后添加路径
    const baseUrl = connection.url.replace(/\/$/, '');
    return baseUrl + normalizedPath;
  }

  getHeaders(): Record<string, string> {
    const connection = this.client.getConnection();
    if (!connection) {
      throw new Error('No active connection');
    }

    const credentials = btoa(`${connection.username}:${connection.password}`);
    return {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/octet-stream',
    };
  }
}

export const webdavService = new WebDAVService();

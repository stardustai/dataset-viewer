import { invoke } from '@tauri-apps/api/core';
import { BaseStorageClient } from './BaseStorageClient';
import {
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions,
  ServerCapabilities
} from './types';

interface WebDAVConnection {
  url: string;
  username: string;
  password: string;
  connected: boolean;
}

/**
 * 优化的 WebDAV 客户端实现
 * 基于统一存储接口，支持分页模拟和服务器能力检测
 */
export class WebDAVStorageClient extends BaseStorageClient {
  protected protocol = 'webdav';
  private connection: WebDAVConnection | null = null;
  private serverCapabilities: ServerCapabilities = {
    supportsWebDAV: false,
    preferredMethod: 'AUTO',
    lastDetected: 0,
    supportsPagination: false,
  };

  /**
   * 获取连接的显示名称
   */
  getDisplayName(): string {
    if (!this.connection?.url) return 'WebDAV';

    try {
      return new URL(this.connection.url).hostname;
    } catch {
      return this.connection.url;
    }
  }

  /**
   * 根据连接配置生成连接名称
   */
  generateConnectionName(config: ConnectionConfig): string {
    try {
      if (!config.url) {
        return 'WebDAV';
      }

      const urlObj = new URL(config.url);
      return `WebDAV(${urlObj.hostname})`;
    } catch (error) {
      return 'WebDAV';
    }
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    if (config.type !== 'webdav' || !config.url || !config.username || !config.password) {
      throw new Error('Invalid WebDAV configuration');
    }

    try {
      // 简单的 URL 标准化 - 由后端统一处理具体格式
      const cleanUrl = config.url.trim();

      // First establish connection in the Rust backend
      const connected = await invoke<boolean>('storage_connect', {
        config: {
          protocol: 'webdav',
          url: cleanUrl,
          username: config.username,
          password: config.password,
          accessKey: null,
          secretKey: null,
          region: null,
          bucket: null,
          endpoint: null,
          extraOptions: null,
        }
      });

      if (connected) {
        this.connection = {
          url: cleanUrl,
          username: config.username,
          password: config.password,
          connected: true,
        };
        this.connected = true;

        // 检测服务器能力 (non-blocking)
        this.detectServerCapabilities().catch(error => {
          console.warn('Server capability detection failed, will auto-detect later:', error);
        });
      } else {
        this.connected = false;
      }

      return connected;
    } catch (error) {
      console.error('WebDAV connection failed:', error);
      this.connected = false;

      // 提供更详细的错误信息
      if (error instanceof Error && error.message.includes('URL format')) {
        throw new Error('Server connection failed. Please check the URL format and credentials.');
      }

      throw error;
    }
  }

  /**
   * 构建文件URL（WebDAV文件URL）
   */
  protected buildFileUrl(path: string): string {
    if (!this.connection?.url) {
      throw new Error('Not connected to WebDAV server');
    }

    const baseUrl = this.connection.url.replace(/\/$/, '');
    const cleanPath = path.replace(/^\/+/, '');

    return cleanPath ? `${baseUrl}/${cleanPath}` : baseUrl;
  }

  /**
   * 获取认证头
   */
  protected getAuthHeaders(): Record<string, string> {
    if (!this.connection?.username || !this.connection?.password) {
      return {};
    }

    const credentials = btoa(`${this.connection.username}:${this.connection.password}`);
    return {
      'Authorization': `Basic ${credentials}`
    };
  }

  disconnect(): void {
    // Disconnect from Rust backend
    invoke('storage_disconnect').catch(error => {
      console.warn('Failed to disconnect from storage backend:', error);
    });

    this.connection = null;
    this.connected = false;
    this.resetServerCapabilities();
  }

  async listDirectory(path: string = '', options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connection) throw new Error('Not connected to WebDAV server');

    try {
      // 使用统一的后端命令
      const result = await invoke<DirectoryResult>('storage_list_directory', {
        path,
        options: options ? {
          pageSize: options.pageSize,
          marker: options.marker,
          prefix: options.prefix,
          recursive: options.recursive,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder,
        } : null,
      });

      return result;
    } catch (error) {
      console.error('Failed to list directory:', error);
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  async getFileContent(path: string, options?: ReadOptions): Promise<FileContent> {
    if (!this.connection) throw new Error('Not connected');

    const headers: Record<string, string> = {
      'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
    };

    if (options?.start !== undefined && options?.length !== undefined) {
      headers['Range'] = `bytes=${options.start}-${options.start + options.length - 1}`;
    }

    const response = await this.makeRequest({
      method: 'GET',
      url: this.buildUrl(path),
      headers
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return {
      content: response.body,
      size: parseInt(response.headers['content-length'] || '0'),
      encoding: 'utf-8'
    };
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connection) throw new Error('Not connected');

    const response = await this.makeRequest({
      method: 'HEAD',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file size: ${response.status}`);
    }

    const contentLength = response.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connection) throw new Error('Not connected');

    const binaryData = await this.makeRequestBinary({
      method: 'GET',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    });

    return new Blob([binaryData], { type: 'application/octet-stream' });
  }

  async downloadFileWithProgress(path: string, filename: string): Promise<string> {
    if (!this.connection) throw new Error('Not connected');

    return await this.downloadWithProgress(
      'GET',
      this.buildUrl(path),
      filename,
      {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    );
  }

  private buildUrl(path: string): string {
    if (!this.connection) throw new Error('Not connected');

    if (path.startsWith('http')) return path;

    // 简单的 URL 构建 - 避免过度处理
    const baseUrl = this.connection.url.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async detectServerCapabilities(): Promise<void> {
    if (!this.connection) return;

    // 简化的服务器能力检测 - 现在由后端处理
    // 只是设置默认值
    this.serverCapabilities = {
      supportsWebDAV: true,
      preferredMethod: 'PROPFIND',
      lastDetected: Date.now(),
      supportsPagination: false,
    };
    console.log('Server capabilities set to WebDAV PROPFIND (handled by backend)');
  }

  private resetServerCapabilities(): void {
    this.serverCapabilities = {
      supportsWebDAV: false,
      preferredMethod: 'AUTO',
      lastDetected: 0,
      supportsPagination: false,
    };
  }

  // 获取服务器能力（用于调试和优化）
  getServerCapabilities(): ServerCapabilities {
    return { ...this.serverCapabilities };
  }
}

import { BaseStorageClient, DEFAULT_TIMEOUTS } from './BaseStorageClient';
import {
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions,
  ServerCapabilities,
  StorageResponse
} from './types';
import type { ArchiveInfo, FilePreview } from '../../types';

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

      // 使用基类的通用连接方法
      const connected = await this.connectToBackend({
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
      });

      if (connected) {
        this.connection = {
          url: cleanUrl,
          username: config.username,
          password: config.password,
          connected: true,
        };

        // 检测服务器能力 (non-blocking)
        this.detectServerCapabilities().catch(error => {
          console.warn('Server capability detection failed, will auto-detect later:', error);
        });
      }

      return connected;
    } catch (error) {
      console.error('WebDAV connection failed:', error);

      // 提供更详细的错误信息
      if (error instanceof Error && error.message.includes('URL format')) {
        throw new Error('Server connection failed. Please check the URL format and credentials.');
      }

      throw error;
    }
  }

  /**
   * 将前端路径转换为协议统一的地址格式
   * WebDAV 协议格式：webdav://host/path/to/file
   */
  toProtocolUrl(path: string): string {
    if (!this.connection?.url) {
      throw new Error('Not connected to WebDAV server');
    }

    // 提取主机部分并构建 webdav:// 协议URL
    const url = new URL(this.connection.url);
    const cleanPath = path.replace(/^\/+/, '');

    return cleanPath ? `webdav://${url.host}/${cleanPath}` : `webdav://${url.host}`;
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
    // 使用基类的通用断开连接方法
    this.disconnectFromBackend();
    this.connection = null;
    this.resetServerCapabilities();
  }

  async listDirectory(path: string = '', options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connection) throw new Error('Not connected to WebDAV server');

    try {
      // 使用统一的后端命令，带超时保护
      const result = await this.invokeWithTimeout<DirectoryResult>(
        'storage_list_directory',
        {
          path,
          options: options ? {
            pageSize: options.pageSize,
            marker: options.marker,
            prefix: options.prefix,
            recursive: options.recursive,
            sortBy: options.sortBy,
            sortOrder: options.sortOrder,
          } : null,
        },
        60000 // 1分钟超时
      );

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

    const response = await this.invokeWithTimeout<StorageResponse>(
      'storage_request',
      {
        protocol: this.protocol,
        method: 'GET',
        url: this.toProtocolUrl(path),
        headers,
        body: undefined,
        options: undefined
      },
      30000 // 30秒超时
    );

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

    // 使用完整URL，与其他接口保持一致
    const response = await this.invokeWithTimeout<StorageResponse>(
      'storage_request',
      {
        protocol: this.protocol,
        method: 'HEAD',
        url: this.toProtocolUrl(path),
        headers: {
          'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
        },
        body: undefined,
        options: undefined
      },
      15000 // 15秒超时
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file size: ${response.status}`);
    }

    const contentLength = response.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connection) throw new Error('Not connected');

    const response = await this.invokeWithTimeout<number[]>(
      'storage_request_binary',
      {
        protocol: this.protocol,
        method: 'GET',
        url: this.toProtocolUrl(path),
        headers: {
          'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
        },
        options: undefined
      },
      300000 // 5分钟超时，适合大文件下载
    );

    // 直接使用返回的二进制数据创建 Blob
    const uint8Array = new Uint8Array(response);
    return new Blob([uint8Array], { type: 'application/octet-stream' });
  }

  async downloadFileWithProgress(path: string, filename: string): Promise<string> {
    if (!this.connection) throw new Error('Not connected');

    return await this.downloadWithProgress(
      'GET',
      this.toProtocolUrl(path),
      filename,
      {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    );
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

  /**
   * 重写分析压缩文件方法，使用统一的协议URL格式
   */
  protected async analyzeArchiveWithClient(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    // 直接使用传入的路径，因为它已经是协议URL格式
    // 通过Tauri命令调用后端的存储客户端接口
    return await this.invokeWithTimeout('analyze_archive_with_client', {
      protocol: this.protocol,
      filePath: path, // 直接使用传入的路径
      filename,
      maxSize
    }, DEFAULT_TIMEOUTS.default);
  }

  /**
   * 重写获取压缩文件预览方法，使用统一的协议URL格式
   */
  protected async getArchiveFilePreviewWithClient(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    // 直接使用传入的路径，因为它已经是协议URL格式
    // 通过Tauri命令调用后端的存储客户端接口
    const result = await this.invokeWithTimeout('get_archive_preview_with_client', {
      protocol: this.protocol,
      filePath: path, // 直接使用传入的路径
      filename,
      entryPath,
      maxPreviewSize
    }, DEFAULT_TIMEOUTS.default) as FilePreview;

    // 确保 content 是 Uint8Array 类型，处理 Tauri 序列化的二进制数据
    if (result.content && !(result.content instanceof Uint8Array)) {
      result.content = new Uint8Array(result.content as number[]);
    }

    return result;
  }
}

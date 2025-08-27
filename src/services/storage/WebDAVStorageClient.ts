import { BaseStorageClient, DefaultSortOptions } from './BaseStorageClient';
import {
  ConnectionConfig,
  FileContent,
  ReadOptions,
  ServerCapabilities
} from './types';
import { DirectoryResult, ListOptions, commands } from '../../types/tauri-commands';
import type { ArchiveInfo, FilePreview } from '../../types';
import { getHostnameFromUrl } from '../../utils/urlUtils';

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
  };

  /**
   * WebDAV 不使用固定排序，让用户自由排序
   */
  getDefaultSortOptions(): DefaultSortOptions | null {
    return null; // 使用前端排序
  }

  /**
   * WebDAV 通常不需要分页
   */
  getDefaultPageSize(): number | null {
    return null; // 不分页
  }

  /**
   * 获取连接的显示名称
   */
  getDisplayName(): string {
    if (!this.connection?.url) return 'WebDAV';

    return getHostnameFromUrl(this.connection.url);
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
    if (config.type !== 'webdav') {
      throw new Error(`WebDAV client cannot handle ${config.type} connections`);
    }

    if (!config.url || !config.username || !config.password) {
      throw new Error('WebDAV connection requires URL, username, and password');
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
   * WebDAV 协议格式：webdav://host:port/base-path/file-path
   */
  toProtocolUrl(path: string): string {
    if (!this.connection?.url) {
      throw new Error('Not connected to WebDAV server');
    }

    // 解析连接URL以获取完整的基础路径
    const connectionUrl = new URL(this.connection.url);
    const cleanPath = path.replace(/^\/+/, '');

    // 构建完整的协议URL，保留连接URL中的路径部分
    const basePath = connectionUrl.pathname.replace(/\/+$/, ''); // 移除末尾斜杠

    if (cleanPath) {
      if (basePath && basePath !== '/') {
        // 如果连接URL包含基础路径，需要合并路径
        return `webdav://${connectionUrl.host}${basePath}/${cleanPath}`;
      } else {
        // 如果连接URL是根路径
        return `webdav://${connectionUrl.host}/${cleanPath}`;
      }
    } else {
      // 根目录情况
      return basePath && basePath !== '/'
        ? `webdav://${connectionUrl.host}${basePath}`
        : `webdav://${connectionUrl.host}`;
    }
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
      // 使用基类的统一包装器，自动处理类型转换
      const result = await this.invokeListDirectory(
        path,
        options ? {
          pageSize: options.pageSize || null,
          marker: options.marker || null,
          prefix: options.prefix || null,
          recursive: options.recursive || null,
          sortBy: options.sortBy || null,
          sortOrder: options.sortOrder || null,
        } : undefined
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

    const response = await commands.storageRequest(
      this.protocol,
      'GET',
      this.toProtocolUrl(path),
      headers,
      null,
      null
    );

    if (response.status === 'error') {
      throw new Error(`Failed to get file content: ${response.error}`);
    }

    if (response.data.status < 200 || response.data.status >= 300) {
      throw new Error(`Failed to get file content: ${response.data.status}`);
    }

    return {
      content: response.data.body,
      size: parseInt(response.data.headers['content-length'] || '0'),
      encoding: 'utf-8'
    };
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connection) throw new Error('Not connected');

    // 使用完整URL，与其他接口保持一致
    const response = await commands.storageRequest(
      this.protocol,
      'HEAD',
      this.toProtocolUrl(path),
      {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      },
      null,
      null
    );

    if (response.status === 'error') {
      throw new Error(`Failed to get file size: ${response.error}`);
    }

    if (response.data.status < 200 || response.data.status >= 300) {
      throw new Error(`Failed to get file size: ${response.data.status}`);
    }

    const contentLength = response.data.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connection) throw new Error('Not connected');

    const response = await commands.storageRequestBinary(
      this.protocol,
      'GET',
      this.toProtocolUrl(path),
      {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      },
      null
    );

    if (response.status === 'error') {
      throw new Error(`Failed to download file: ${response.error}`);
    }

    // 直接使用返回的二进制数据创建 Blob
    const uint8Array = new Uint8Array(response.data);
    return new Blob([uint8Array], { type: 'application/octet-stream' });
  }

  async downloadFileWithProgress(path: string, filename: string, savePath?: string): Promise<string> {
    if (!this.connection) throw new Error('Not connected');

    return await this.downloadWithProgress(
      'GET',
      this.toProtocolUrl(path),
      filename,
      savePath,
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
    };
    console.log('Server capabilities set to WebDAV PROPFIND (handled by backend)');
  }

  private resetServerCapabilities(): void {
    this.serverCapabilities = {
      supportsWebDAV: false,
      preferredMethod: 'AUTO',
      lastDetected: 0,
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
    const result = await commands.archiveScan(
      this.protocol,
      path,
      filename,
      maxSize || null
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
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
    const result = await commands.archiveRead(
      this.protocol,
      path,
      filename,
      entryPath,
      maxPreviewSize || null,
      null  // offset 参数
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    // 转换为主项目的 FilePreview 格式，确保 content 是 Uint8Array
    return {
      content: new Uint8Array(result.data.content),
      is_truncated: result.data.is_truncated,
      total_size: result.data.total_size,
      preview_size: result.data.preview_size
    };
  }
}

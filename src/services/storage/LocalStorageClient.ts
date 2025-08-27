import { BaseStorageClient, DefaultSortOptions } from './BaseStorageClient';
import {
  ConnectionConfig,
  FileContent,
  ReadOptions,
} from './types';
import { DirectoryResult, ListOptions } from '../../types/tauri-commands';
import { ArchiveInfo, FilePreview } from '../../types';
import { commands } from '../../types/tauri-commands';

/**
 * 本机文件系统存储客户端
 * 通过 Tauri 的文件系统权限访问本机文件
 */
export class LocalStorageClient extends BaseStorageClient {
  protected protocol = 'local';
  private rootPath: string = '';
  private displayPath: string = '';

  /**
   * 本地文件系统不使用固定排序，让用户自由排序
   */
  getDefaultSortOptions(): DefaultSortOptions | null {
    return null; // 使用前端排序
  }

  /**
   * 本地文件系统通常不需要分页
   */
  getDefaultPageSize(): number | null {
    return null; // 不分页
  }

  /**
   * 获取连接的显示名称
   */
  getDisplayName(): string {
    return this.displayPath || 'Local Files';
  }

  /**
   * 根据连接配置生成连接名称
   */
  generateConnectionName(config: ConnectionConfig): string {
    try {
      const path = config.url || config.rootPath;
      if (!path) {
        return 'Local Files';
      }

      // 提取路径的最后一部分作为显示名称
      const pathParts = path.replace(/[\/\\]+$/, '').split(/[\/\\]/);
      const lastPart = pathParts[pathParts.length - 1] || path;

      return `Local Files(${lastPart})`;
    } catch (error) {
      return 'Local Files';
    }
  }

  /**
   * 构建文件URL（本地文件路径）
   */
  /**
   * 将前端路径转换为协议统一的地址格式
   * 本地存储协议格式：file:///path/to/file
   */
  toProtocolUrl(path: string): string {
    if (!path) {
      return 'file:///';
    }

    // 如果路径已经是绝对路径（以 / 开头），直接使用
    if (path.startsWith('/')) {
      return `file:///${path}`;
    }

    // 对于相对路径，构建 file:/// 协议 URL
    return `file:///${path}`;
  }

  /**
   * 获取认证头（本地文件无需认证）
   */
  protected getAuthHeaders(): Record<string, string> {
    return {};
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    try {
      // 验证本机文件系统配置
      if (!config.url && !config.rootPath) {
        throw new Error('Root path is required for local file system');
      }

      const rootPath = config.url || config.rootPath!;

      // 使用基类的通用连接方法
      const connected = await this.connectToBackend({
        protocol: 'local',
        url: rootPath,
        accessKey: null,
        secretKey: null,
        region: null,
        bucket: null,
        endpoint: null,
        username: null,
        password: null,
        extraOptions: null,
      });

      if (!connected) {
        throw new Error(`Cannot access path: ${rootPath}`);
      }

      // 保存根路径用于后续的路径构建
      this.displayPath = rootPath;
      this.rootPath = rootPath;

      return true;
    } catch (error) {
      console.error('Local storage connection failed:', error);
      return false;
    }
  }

  disconnect(): void {
    // 使用基类的通用断开连接方法
    this.disconnectFromBackend();
    this.displayPath = '';
    this.rootPath = '';
  }

  async listDirectory(path: string = '', options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connected) {
      throw new Error('Local storage not connected');
    }

    try {
      // 使用基类的统一包装器，自动处理类型转换
      const result = await this.invokeListDirectory(
        path,
        options ? {
          pageSize: options.pageSize,
          marker: options.marker,
          prefix: options.prefix,
          recursive: options.recursive,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder,
        } : undefined,
      );

      return result;
    } catch (error) {
      console.error('Failed to list directory:', error);
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  async getFileContent(path: string, options?: ReadOptions): Promise<FileContent> {
    if (!this.connected) {
      throw new Error('Local storage not connected');
    }

    const result = await commands.storageRequest(
      this.protocol,
      'READ_FILE',
      this.toProtocolUrl(path),
      {},
      null,
      {
        protocol: 'local',
        start: options?.start?.toString(),
        length: options?.length?.toString()
			}
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    const response = result.data;

    if (response.status !== 200) {
      throw new Error(`Failed to read file: ${response.body}`);
    }

    const data = JSON.parse(response.body);

    return {
      content: data.content,
      size: data.size,
      encoding: data.encoding || 'utf-8'
    };
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connected) {
      throw new Error('Local storage not connected');
    }

    const result = await commands.storageRequest(
      this.protocol,
      'GET_FILE_SIZE',
      this.toProtocolUrl(path),
      {},
      null,
      {
        protocol: 'local'
      }
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    const response = result.data;    if (response.status !== 200) {
      throw new Error(`Failed to get file size: ${response.body}`);
    }

    const data = JSON.parse(response.body);
    return data.size;
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connected) {
      throw new Error('Local storage not connected');
    }

        // 对于本机文件，直接读取为二进制数据
    const result = await commands.storageRequestBinary(
      this.protocol,
      'READ_FILE_BINARY',
      this.toProtocolUrl(path),
      {},
      {
        protocol: 'local'
      }
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    const response = result.data;

    // 直接使用返回的二进制数据创建 Blob
    const uint8Array = new Uint8Array(response);
    return new Blob([uint8Array]);
  }

  async downloadFileWithProgress(path: string, filename: string, savePath?: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Local storage not connected');
    }

    // 对于本地文件，使用正常的GET方法获取数据
    return await this.downloadWithProgress('GET', this.toProtocolUrl(path), filename, savePath);
  }

  /**
   * 构建完整的文件路径
   */
  private buildFullPath(relativePath: string): string {
    // 防止路径遍历攻击
    if (relativePath.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // 清理相对路径
    const cleanPath = relativePath.replace(/^\/+/, '').replace(/\/+/g, '/');

    // 如果是根路径，直接返回 rootPath
    if (!cleanPath) {
      return this.rootPath;
    }

    // 拼接完整路径
    const separator = this.rootPath.endsWith('/') || this.rootPath.endsWith('\\') ? '' : '/';
    return `${this.rootPath}${separator}${cleanPath}`;
  }

  /**
   * 分析压缩文件结构（本地文件统一流式实现）
   */
  async analyzeArchive(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    try {
      // 本地文件使用统一的StorageClient流式分析接口
      console.log('本地文件使用统一流式分析:', { path, filename });

      const result = await this.analyzeArchiveWithClient(path, filename, maxSize);

      return result;
    } catch (error) {
      console.error('Failed to analyze local archive:', error);
      throw error;
    }
  }

  /**
   * 获取压缩文件中的文件预览（本地文件特定实现）
   */
  async getArchiveFilePreview(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    try {
      // 对于本地文件，使用存储客户端接口进行流式预览
      console.log('本地文件获取压缩文件预览:', {
        path,
        filename,
        entryPath
      });

      // 使用流式预览接口，只读取需要的部分
      return await this.getArchiveFilePreviewWithClient(
        path,
        filename,
        entryPath,
        maxPreviewSize
      );
    } catch (error) {
      console.error('Failed to get local archive file preview:', error);
      throw error;
    }
  }

  /**
   * 获取根路径
   */
  getRootPath(): string {
    return this.rootPath;
  }

  /**
   * 获取文件的实际路径（用于压缩包处理等需要直接访问文件的场景）
   */
  getActualFilePath(relativePath: string): string {
    // 对于压缩包处理，我们需要返回完整路径
    return this.buildFullPath(relativePath);
  }
}

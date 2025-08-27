import { commands, DirectoryResult, ListOptions, ConnectionConfig as TauriConnectionConfig } from '../../types/tauri-commands';
import {
  StorageClient,
  ConnectionConfig,
  FileContent,
  ReadOptions
} from './types';
import { ArchiveInfo, FilePreview } from '../../types';

/**
 * 存储客户端排序选项
 */
export interface DefaultSortOptions {
  /** 默认排序字段 */
  sortBy?: 'name' | 'size' | 'modified';
  /** 默认排序顺序 */
  sortOrder?: 'asc' | 'desc';
}

/**
 * 统一存储客户端基类
 * 提供所有存储类型的通用接口实现
 */
export abstract class BaseStorageClient implements StorageClient {
  protected abstract protocol: string;
  protected connected: boolean = false;

  /**
   * 获取默认排序选项
   * 返回 null 表示使用前端排序，返回具体选项表示使用服务端排序
   */
  abstract getDefaultSortOptions(): DefaultSortOptions | null;

  /**
   * 获取默认分页大小
   * 返回 null 表示不分页
   */
  abstract getDefaultPageSize(): number | null;

  /**
   * 专用的 listDirectory 包装器，直接使用 commands.storageList
   */
  protected async invokeListDirectory(
    path: string,
    options?: ListOptions
  ): Promise<DirectoryResult> {
    const result = await commands.storageList(path, options || null);

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 获取连接的显示名称
   */
  abstract getDisplayName(): string;

  /**
   * 根据连接配置生成连接名称
   */
  abstract generateConnectionName(config: ConnectionConfig): string;

  /**
   * 检查是否支持搜索功能
   */
  supportsSearch(): boolean {
    return false; // 默认不支持，由子类重写
  }

  /**
   * 检查是否支持自定义根路径展示
   */
  supportsCustomRootDisplay(): boolean {
    return false; // 默认不支持，由子类重写
  }

  /**
   * 获取根路径的显示信息
   */
  getRootDisplayInfo(): { showWelcome?: boolean; customMessage?: string } {
    return {}; // 默认空，由子类重写
  }

  /**
   * 将前端路径转换为协议统一的地址格式
   * 用于: 后端存储操作、HTTP 请求、用户复制等所有场景
   * @param path 前端传入的路径
   * @returns 协议统一的地址格式 (如: oss://bucket/path, file:///path, webdav://host/path, huggingface://dataset/path)
   */
  abstract toProtocolUrl(path: string): string;

  /**
   * 带进度的下载接口
   * 使用 Tauri 后端提供的流式下载和进度事件
   */
  protected async downloadWithProgress(
    url: string,
    filename: string,
    savePath?: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    // 确保 savePath 不是 undefined，如果是则设为 null
    const normalizedSavePath = savePath === undefined ? null : savePath;

    const result = await commands.downloadStart(
      url,
      filename,
      headers,
      normalizedSavePath
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 分析压缩文件（统一使用StorageClient流式接口）
   */
  async analyzeArchive(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    try {
      // 所有存储类型都使用统一的StorageClient流式接口
      console.log(`${this.protocol}存储使用统一流式分析:`, { path, filename });
      return await this.analyzeArchiveWithClient(path, filename, maxSize);
    } catch (error) {
      console.error('Failed to analyze archive:', error);
      throw error;
    }
  }

  /**
   * 获取压缩文件中的文件预览（统一使用StorageClient流式接口）
   */
  async getArchiveFilePreview(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number,
    offset?: number  // 添加偏移量参数，但目前后端不支持
  ): Promise<FilePreview> {
    try {
      // 所有存储类型都使用统一的StorageClient流式接口
      console.log(`${this.protocol}存储使用统一流式预览:`, { path, filename, entryPath });

      // 注意：当前后端不支持偏移量，如果传递了offset参数，应该抛出错误让调用者回退到完整加载
      if (offset !== undefined && offset > 0) {
        throw new Error('Archive file offset loading not supported');
      }

      return await this.getArchiveFilePreviewWithClient(path, filename, entryPath, maxPreviewSize, offset);
    } catch (error) {
      console.error('Failed to get archive file preview:', error);
      throw error;
    }
  }



  /**
   * 通过存储客户端分析压缩文件（用于本地文件）
   */
  protected async analyzeArchiveWithClient(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    // 通过Tauri命令调用后端的存储客户端接口
    const result = await commands.archiveGetFileInfo(
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
   * 通过存储客户端获取压缩文件预览（用于本地文件）
   */
  protected async getArchiveFilePreviewWithClient(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number,
    offset?: number
  ): Promise<FilePreview> {
    // 通过Tauri命令调用后端的存储客户端接口
    const result = await commands.archiveGetFileContent(
      path,
      filename,
      entryPath,
      maxPreviewSize || null,
      offset?.toString() || null
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

  /**
   * 标准化路径格式 - 所有子类统一使用
   * @param path 原始路径
   * @returns 标准化后的路径
   */
  protected normalizePath(path: string): string {
    if (!path) return '';

    // 移除开头的斜杠，确保路径格式一致
    let cleanPath = path.trim();
    while (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }

    return cleanPath;
  }

  /**
   * 解析路径信息 - 由子类重写以处理特定格式
   * @param path 路径字符串
   * @returns 解析后的路径信息
   */
  protected parsePath(path: string): any {
    return { normalizedPath: this.normalizePath(path) };
  }

  /**
   * 通用连接方法 - 调用后端storage_connect
   */
  protected async connectToBackend(config: {
    protocol: string;
    url?: string | null;
    username?: string | null;
    password?: string | null;
    accessKey?: string | null;
    secretKey?: string | null;
    region?: string | null;
    bucket?: string | null;
    endpoint?: string | null;
    extraOptions?: any;
  }): Promise<boolean> {
    try {
      // 构建符合 Tauri 后端 ConnectionConfig 的对象
      const tauriConfig: TauriConnectionConfig = {
        protocol: config.protocol,
        url: config.url ?? null,
        username: config.username ?? null,
        password: config.password ?? null,
        accessKey: config.accessKey ?? null,
        secretKey: config.secretKey ?? null,
        region: config.region ?? null,
        bucket: config.bucket ?? null,
        endpoint: config.endpoint ?? null,
        extraOptions: config.extraOptions ?? null,
      };

      const result = await commands.storageConnect(tauriConfig);

      if (result.status === 'error') {
        console.error(`${config.protocol} connection failed:`, result.error);
        this.connected = false;
        return false;
      }

      this.connected = result.data;
      return result.data;
    } catch (error) {
      console.error(`${config.protocol} connection failed:`, error);
      this.connected = false;
      return false;
    }
  }

  /**
   * 通用断开连接方法
   */
  protected async disconnectFromBackend(): Promise<void> {
    try {
      const result = await commands.storageDisconnect();

      if (result.status === 'error') {
        console.warn('Failed to disconnect from storage backend:', result.error);
      }
    } catch (error) {
      console.warn('Failed to disconnect from storage backend:', error);
    }
    this.connected = false;
  }

  /**
   * 获取认证头（子类实现）
   */
  protected abstract getAuthHeaders(): Record<string, string>;

	// 抽象方法，由具体实现定义
  abstract connect(config: ConnectionConfig): Promise<boolean>;
  abstract disconnect(): void;
  abstract listDirectory(path: string, options?: ListOptions): Promise<DirectoryResult>;
  abstract getFileContent(path: string, options?: ReadOptions): Promise<FileContent>;
  abstract getFileSize(path: string): Promise<number>;
  abstract downloadFile(path: string): Promise<Blob>;

  isConnected(): boolean {
    return this.connected;
  }

  // 可选的带进度下载方法，由子类实现
  downloadFileWithProgress?(_path: string, _filename: string, _savePath?: string): Promise<string>;

  /**
   * 读取文件内容（统一二进制接口）
   * @param path 文件路径
   * @param start 起始位置（可选）
   * @param length 读取长度（可选）
   * @returns 二进制数据
   */
  protected async readFileBytes(path: string, start?: number, length?: number): Promise<Uint8Array> {
    const result = await commands.storageGetFileContent(
      this.toProtocolUrl(path),
      start !== undefined ? start.toString() : null,
      length !== undefined ? length.toString() : null
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return new Uint8Array(result.data);
  }

  /**
   * 获取文件大小（统一接口）
   * @param path 文件路径
   * @returns 文件大小
   */
  protected async getFileSizeInternal(path: string): Promise<number> {
    const result = await commands.storageGetFileInfo(this.toProtocolUrl(path));

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return parseInt(result.data.size, 10);
  }

  /**
   * 将二进制数据解码为文本
   * @param data 二进制数据
   * @param encoding 编码格式，默认 utf-8
   * @returns 文本内容
   */
  protected decodeTextContent(data: Uint8Array, encoding: string = 'utf-8'): string {
    const decoder = new TextDecoder(encoding);
    return decoder.decode(data);
  }
}

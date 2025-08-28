import { commands, DirectoryResult, ListOptions, ConnectionConfig as TauriConnectionConfig } from '../../types/tauri-commands';
import {
  StorageClient as IStorageClient,
  ConnectionConfig,
  StorageClientType,
  FileContent,
  ReadOptions
} from './types';
import { ArchiveInfo, FilePreview } from '../../types';

// 导入平台特定的适配器
import { webdavStorageAdapter } from './adapters/WebDAVAdapter';
import { localStorageAdapter } from './adapters/LocalAdapter';
import { ossStorageAdapter } from './adapters/OSSAdapter';
import { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';

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
 * 存储适配器接口
 * 定义每个存储类型需要实现的特定逻辑
 */
export interface StorageAdapter {
  /** 协议前缀 */
  protocol: string;
  /** 显示名称 */
  displayName: string;
  /** 默认排序选项 */
  defaultSortOptions: DefaultSortOptions | null;
  /** 默认分页大小 */
  defaultPageSize: number | null;
  /** 是否支持搜索 */
  supportsSearch: boolean;
  /** 是否支持自定义根路径展示 */
  supportsCustomRootDisplay: boolean;

  /** 路径预处理逻辑 */
  preprocessPath?: (path: string, connection: any, config?: ConnectionConfig) => string;
  /** 连接配置预处理 */
  preprocessConnection?: (config: ConnectionConfig) => any;
  /** URL 构建逻辑 */
  buildProtocolUrl: (path: string, connection: any, config?: ConnectionConfig) => string;
  /** 连接名称生成逻辑 */
  generateConnectionName: (config: ConnectionConfig) => string;
  /** 根路径显示信息 */
  getRootDisplayInfo?: (connection: any, config?: ConnectionConfig) => { showWelcome?: boolean; customMessage?: string };
  /** 特定的连接后处理 */
  postConnect?: (connection: any, config: ConnectionConfig) => any;
}

/**
 * 存储适配器映射表
 */
const STORAGE_ADAPTERS: Record<StorageClientType, StorageAdapter> = {
  webdav: webdavStorageAdapter,
  local: localStorageAdapter,
  oss: ossStorageAdapter,
  s3: ossStorageAdapter, // S3 使用 OSS 适配器（兼容）
  huggingface: huggingfaceStorageAdapter
};

/**
 * 统一存储客户端
 * 合并了 BaseStorageClient 和 UnifiedStorageClient 的功能
 * 通过适配器模式支持多种存储类型，集中管理核心逻辑
 */
export class StorageClient implements IStorageClient {
  protected protocol: string;
  protected connected: boolean = false;

  private storageType: StorageClientType;
  private adapter: StorageAdapter;
  private connection: any = null;
  private connectionConfig: ConnectionConfig | null = null;

  constructor(storageType: StorageClientType) {
    this.storageType = storageType;
    this.adapter = STORAGE_ADAPTERS[storageType];
    if (!this.adapter) {
      throw new Error(`Unsupported storage type: ${storageType}`);
    }
    this.protocol = this.adapter.protocol;
  }

  // ========== 适配器代理方法 ==========

  getDefaultSortOptions(): DefaultSortOptions | null {
    return this.adapter.defaultSortOptions;
  }

  getDefaultPageSize(): number | null {
    return this.adapter.defaultPageSize;
  }

  getDisplayName(): string {
    return this.adapter.displayName;
  }

  generateConnectionName(config: ConnectionConfig): string {
    return this.adapter.generateConnectionName(config);
  }

  supportsSearch(): boolean {
    return this.adapter.supportsSearch;
  }

  supportsCustomRootDisplay(): boolean {
    return this.adapter.supportsCustomRootDisplay;
  }

  toProtocolUrl(path: string): string {
    return this.adapter.buildProtocolUrl(path, this.connection, this.connectionConfig || undefined);
  }

  getRootDisplayInfo(): { showWelcome?: boolean; customMessage?: string } {
    if (this.adapter.getRootDisplayInfo) {
      return this.adapter.getRootDisplayInfo(this.connection, this.connectionConfig || undefined);
    }
    return { showWelcome: false };
  }

  // ========== 核心业务方法 ==========

  async connect(config: ConnectionConfig): Promise<boolean> {
    try {
      // 保存原始配置
      this.connectionConfig = config;

      // 适配器预处理连接配置
      let processedConnection = config;
      if (this.adapter.preprocessConnection) {
        const preprocessed = this.adapter.preprocessConnection(config);
        processedConnection = { ...config, ...preprocessed };
      }

      // 构建后端连接配置
      const backendConfig = this.buildBackendConfig(processedConnection);

      // 调用后端连接
      const connected = await this.connectToBackend(backendConfig);

      if (connected) {
        // 适配器后处理连接状态
        if (this.adapter.postConnect) {
          this.connection = this.adapter.postConnect(processedConnection, config);
        } else {
          this.connection = processedConnection;
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error(`${this.storageType} connection failed:`, error);
      return false;
    }
  }

  disconnect(): void {
    this.disconnectFromBackend();
    this.connection = null;
    this.connectionConfig = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ========== 统一的文件操作方法 ==========

  async listDirectory(path: string = '', options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      // 使用适配器的路径预处理逻辑
      let actualPath = path;
      if (this.adapter.preprocessPath) {
        actualPath = this.adapter.preprocessPath(path, this.connection, this.connectionConfig || undefined);
      }

      return await this.invokeListDirectory(
        actualPath,
        options ? {
          pageSize: options.pageSize || null,
          marker: options.marker || null,
          prefix: options.prefix || null,
          recursive: options.recursive || null,
          sortBy: options.sortBy || null,
          sortOrder: options.sortOrder || null,
        } : undefined,
      );
    } catch (error) {
      console.error(`Failed to list directory ${path}:`, error);
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  async getFileContent(path: string, options?: ReadOptions): Promise<FileContent> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      const data = await this.readFileBytes(path, options?.start, options?.length);
      const content = this.decodeTextContent(data);

      return {
        content,
        size: data.length,
        encoding: 'utf-8',
      };
    } catch (error) {
      console.error(`Failed to get file content for ${path}:`, error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      return await this.getFileSizeInternal(path);
    } catch (error) {
      throw new Error(`Failed to get file size: ${error}`);
    }
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      const data = await this.readFileBytes(path);
      const compatibleArray = new Uint8Array(data);
      return new Blob([compatibleArray]);
    } catch (error) {
      console.error(`Failed to download file for ${path}:`, error);
      throw error;
    }
  }

  async downloadFileWithProgress(path: string, filename: string, savePath?: string): Promise<string> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      return await this.downloadWithProgress(this.toProtocolUrl(path), filename, savePath);
    } catch (error) {
      console.error(`Failed to download file with progress ${path}:`, error);
      throw error;
    }
  }

  // ========== 压缩文件处理方法 ==========

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
    offset?: number  // 支持偏移量参数
  ): Promise<FilePreview> {
    try {
      // 所有存储类型都使用统一的StorageClient流式接口
      console.log(`${this.protocol}存储使用统一流式预览:`, { path, filename, entryPath, offset });

      return await this.getArchiveFilePreviewWithClient(path, filename, entryPath, maxPreviewSize, offset);
    } catch (error) {
      console.error('Failed to get archive file preview:', error);
      throw error;
    }
  }

  // ========== 内部工具方法 ==========

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
   * 带进度的下载接口
   * 使用 Tauri 后端提供的流式下载和进度事件
   */
  protected async downloadWithProgress(
    url: string,
    filename: string,
    savePath?: string
  ): Promise<string> {
    // 确保 savePath 不是 undefined，如果是则设为 null
    const normalizedSavePath = savePath === undefined ? null : savePath;

    const result = await commands.downloadStart(
      url,
      filename,
      normalizedSavePath
    );

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
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

  // ========== 辅助方法 ==========

  /**
   * 构建后端连接配置
   */
  private buildBackendConfig(config: any): any {
    return {
      protocol: this.protocol,
      url: config.url || null,
      username: config.username || null,
      password: config.password || config.apiToken || null,
      accessKey: config.accessKey || null,
      secretKey: config.secretKey || null,
      region: config.region || null,
      bucket: config.bucket || null,
      endpoint: config.endpoint || null,
      extraOptions: null,
    };
  }

}

// 导出适配器映射，供外部使用
export { STORAGE_ADAPTERS };

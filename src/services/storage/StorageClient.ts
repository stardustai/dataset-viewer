import {
  commands,
  DirectoryResult,
  ListOptions,
  ConnectionConfig as TauriConnectionConfig,
} from '../../types/tauri-commands';
import {
  StorageClient as IStorageClient,
  ConnectionConfig,
  StorageClientType,
  FileContent,
  ReadOptions,
} from './types';
import { ArchiveInfo } from '../../types';
import { detectEncodingWithFallback } from '../../utils/textEncodingDetection';

// 通用连接对象接口 - 不同存储类型有不同的连接对象结构
interface BaseConnection {
  [key: string]: any; // 允许任何属性，因为不同存储类型有不同的连接对象
}

// 导入平台特定的适配器
import { webdavStorageAdapter } from './adapters/WebDAVAdapter';
import { localStorageAdapter } from './adapters/LocalAdapter';
import { ossStorageAdapter } from './adapters/OSSAdapter';
import { huggingfaceStorageAdapter } from './adapters/HuggingFaceAdapter';
import { sshStorageAdapter } from './adapters/SSHAdapter';
import { smbStorageAdapter } from './adapters/SMBAdapter';

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
  preprocessPath?: (path: string, connection: BaseConnection, config?: ConnectionConfig) => string;
  /** 连接配置预处理 */
  preprocessConnection?: (config: ConnectionConfig) => BaseConnection;
  /** URL 构建逻辑 */
  buildProtocolUrl: (path: string, connection: BaseConnection, config?: ConnectionConfig) => string;
  /** 连接名称生成逻辑 */
  generateConnectionName: (config: ConnectionConfig) => string;
  /** 根路径显示信息 */
  getRootDisplayInfo?: (
    connection: BaseConnection,
    config?: ConnectionConfig
  ) => { showWelcome?: boolean; customMessage?: string };
  /** 特定的连接后处理 */
  postConnect?: (connection: BaseConnection, config: ConnectionConfig) => BaseConnection;

  // === 新增的标准方法（用于重构连接管理逻辑） ===

  /** 获取默认配置 */
  getDefaultConfig?: () => Partial<ConnectionConfig>;

  /** 构建完整的连接配置（用于替代组件中的配置构建逻辑） */
  buildConnectionConfig?: (
    formData: Record<string, any>,
    existingConnection?: BaseConnection
  ) => ConnectionConfig;

  /** 从存储的连接中提取表单数据（用于表单回填） */
  extractFormData?: (config: ConnectionConfig) => Record<string, any>;
}

/**
 * 存储适配器映射表
 */
const STORAGE_ADAPTERS: Record<StorageClientType, StorageAdapter> = {
  webdav: webdavStorageAdapter,
  local: localStorageAdapter,
  oss: ossStorageAdapter,
  s3: ossStorageAdapter, // S3 使用 OSS 适配器（兼容）
  huggingface: huggingfaceStorageAdapter,
  ssh: sshStorageAdapter,
  smb: smbStorageAdapter,
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
  private connection: BaseConnection | null = null;
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
    if (!this.connection) {
      throw new Error('Not connected');
    }
    return this.adapter.buildProtocolUrl(path, this.connection, this.connectionConfig || undefined);
  }

  getRootDisplayInfo(): { showWelcome?: boolean; customMessage?: string } {
    if (!this.connection) {
      return { showWelcome: false };
    }
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
      if (this.adapter.preprocessPath && this.connection) {
        actualPath = this.adapter.preprocessPath(
          path,
          this.connection,
          this.connectionConfig || undefined
        );
      }

      return await this.invokeListDirectory(
        actualPath,
        options
          ? {
              pageSize: options.pageSize || null,
              marker: options.marker || null,
              prefix: options.prefix || null,
              recursive: options.recursive || null,
              sortBy: options.sortBy || null,
              sortOrder: options.sortOrder || null,
            }
          : undefined
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

      // 先检测编码
      const { encoding: detectedEncoding } = detectEncodingWithFallback(data);
      const content = this.decodeTextContent(data);

      return {
        content,
        size: data.length,
        encoding: detectedEncoding,
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

  async getFileAsBlob(path: string): Promise<Blob> {
    if (!this.connected) {
      throw new Error(`${this.storageType} storage not connected`);
    }

    try {
      const data = await this.readFileBytes(path);
      const compatibleArray = new Uint8Array(data);
      return new Blob([compatibleArray]);
    } catch (error) {
      console.error(`Failed to get file as blob for ${path}:`, error);
      throw error;
    }
  }

  async downloadFileWithProgress(
    path: string,
    filename: string,
    savePath?: string
  ): Promise<string> {
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
  async analyzeArchive(path: string, filename: string, maxSize?: number): Promise<ArchiveInfo> {
    try {
      // 所有存储类型都使用统一的StorageClient流式接口
      console.log(`${this.protocol}存储使用统一流式分析:`, { path, filename });
      return await this.analyzeArchiveWithClient(path, filename, maxSize);
    } catch (error) {
      console.error('Failed to analyze archive:', error);
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

    const result = await commands.downloadStart(url, filename, normalizedSavePath);

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
    const result = await commands.archiveGetFileInfo(path, filename, maxSize || null);

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
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
  protected parsePath(path: string): { normalizedPath: string } {
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
    extraOptions?: Record<string, any> | null;
  }): Promise<boolean> {
    try {
      // 构建符合 Tauri 后端 ConnectionConfig 的对象
      const backendConfig = this.buildBackendConfig(config);
      const result = await commands.storageConnect(backendConfig);

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
  async readFileBytes(path: string, start?: number, length?: number): Promise<Uint8Array> {
    // 所有存储类型现在都使用协议方式实现高效的文件请求
    return this.readProtocolFileBytes(path, start, length);
  } /**
   * 通过协议 URL 读取文件字节数据
   * @param path 文件路径
   * @param start 起始位置（可选）
   * @param length 读取长度（可选）
   * @returns 二进制数据
   */
  private async readProtocolFileBytes(
    path: string,
    start?: number,
    length?: number
  ): Promise<Uint8Array> {
    if (!this.connected) {
      throw new Error(`Not connected to ${this.protocol} server`);
    }

    // 使用现有的 toProtocolUrl 方法构建完整的协议 URL
    const protocolUrl = this.toProtocolUrl(path);

    try {
      let response: Response;

      if (start !== undefined) {
        // 处理范围请求
        const endPos = length !== undefined ? start + length - 1 : '';
        const rangeHeader = `bytes=${start}-${endPos}`;

        response = await fetch(protocolUrl, {
          method: 'GET',
          headers: {
            Range: rangeHeader,
          },
        });
      } else {
        // 处理完整文件请求
        response = await fetch(protocolUrl, {
          method: 'GET',
        });
      }

      if (!response.ok) {
        throw new Error(
          `${this.protocol.toUpperCase()} request failed: ${response.status} ${response.statusText}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      console.error(`${this.protocol.toUpperCase()} fetch error:`, error);
      throw new Error(
        `Failed to fetch file via ${this.protocol.toUpperCase()} protocol: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 获取文件大小（统一接口）
   * @param path 文件路径
   * @returns 文件大小
   */
  protected async getFileSizeInternal(path: string): Promise<number> {
    // 所有存储类型现在都使用协议方式获取文件大小
    return this.getProtocolFileSize(path);
  }

  /**
   * 通过协议 URL 获取文件大小
   * @param path 文件路径
   * @returns 文件大小
   */
  private async getProtocolFileSize(path: string): Promise<number> {
    if (!this.connected) {
      throw new Error(`Not connected to ${this.protocol} server`);
    }

    // 使用现有的 toProtocolUrl 方法构建完整的协议 URL
    const protocolUrl = this.toProtocolUrl(path);

    try {
      const response = await fetch(protocolUrl, {
        method: 'HEAD', // 使用 HEAD 请求获取文件信息
      });

      if (!response.ok) {
        throw new Error(
          `${this.protocol.toUpperCase()} HEAD request failed: ${response.status} ${response.statusText}`
        );
      }

      // 从响应头中获取 Content-Length
      const contentLength = response.headers.get('Content-Length');
      if (!contentLength) {
        throw new Error(
          `Content-Length header not found in ${this.protocol.toUpperCase()} response`
        );
      }

      const size = parseInt(contentLength, 10);
      if (isNaN(size)) {
        throw new Error(`Invalid Content-Length value in ${this.protocol.toUpperCase()} response`);
      }

      return size;
    } catch (error) {
      console.error(`${this.protocol.toUpperCase()} HEAD request error:`, error);
      throw new Error(
        `Failed to get file size via ${this.protocol.toUpperCase()} protocol: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 将二进制数据解码为文本，自动检测最佳编码
   * @param data 二进制数据
   * @returns 文本内容
   */
  protected decodeTextContent(data: Uint8Array): string {
    // 使用智能编码检测
    const { encoding: detectedEncoding } = detectEncodingWithFallback(data);

    try {
      return new TextDecoder(detectedEncoding).decode(data);
    } catch (error) {
      console.warn(`Failed to decode with detected encoding ${detectedEncoding}:`, error);
      // 最终回退到 UTF-8，使用非严格模式
      return new TextDecoder('utf-8', { fatal: false }).decode(data);
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 构建后端连接配置
   */
  private buildBackendConfig(config: BaseConnection): TauriConnectionConfig {
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
      // SSH 特定字段
      port: config.port || null,
      privateKeyPath: config.privateKeyPath || null,
      passphrase: config.passphrase || null,
      rootPath: config.rootPath || null,
      // SMB 特定字段
      share: config.share || null,
      domain: config.domain || null,
      extraOptions: null,
    };
  }
}

// 导出适配器映射，供外部使用
export { STORAGE_ADAPTERS };

/**
 * 获取指定存储类型的适配器
 */
export function getStorageAdapter(storageType: StorageClientType): StorageAdapter {
  return STORAGE_ADAPTERS[storageType];
}

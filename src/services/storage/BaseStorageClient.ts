import { invoke } from '@tauri-apps/api/core';
import {
  StorageClient,
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions
} from './types';
import { ArchiveInfo, FilePreview } from '../../types';

/**
 * 超时配置
 */
interface TimeoutConfig {
  /** 默认超时时间（毫秒） */
  default: number;
  /** 连接超时时间（毫秒） */
  connect: number;
  /** 下载超时时间（毫秒） */
  download: number;
  /** 列表操作超时时间（毫秒） */
  list: number;
}

/**
 * 默认超时配置
 */
export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  default: 30000,   // 30秒
  connect: 15000,   // 15秒
  download: 300000, // 5分钟
  list: 60000,      // 1分钟
};

/**
 * 统一存储客户端基类
 * 提供所有存储类型的通用接口实现
 */
export abstract class BaseStorageClient implements StorageClient {
  protected abstract protocol: string;
  protected connected: boolean = false;

  /**
   * 带超时的 Tauri invoke 包装器
   * @param command Tauri 命令名
   * @param args 命令参数
   * @param timeoutMs 超时时间（毫秒），默认使用 DEFAULT_TIMEOUTS.default
   * @returns Promise<T>
   */
  protected async invokeWithTimeout<T>(
    command: string,
    args?: Record<string, any>,
    timeoutMs: number = DEFAULT_TIMEOUTS.default
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tauri command '${command}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      invoke<T>(command, args)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
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
    method: string,
    url: string,
    filename: string,
    savePath?: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    // 确保 savePath 不是 undefined，如果是则设为 null
    const normalizedSavePath = savePath === undefined ? null : savePath;

    const params = {
      method,
      url,
      headers,
      filename,
      savePath: normalizedSavePath,
    };
    return await this.invokeWithTimeout(
      'download_file_with_progress',
      params,
      DEFAULT_TIMEOUTS.download
    );
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
    return await this.invokeWithTimeout('analyze_archive_with_client', {
      protocol: this.protocol,
      filePath: path,
      filename,
      maxSize
    }, DEFAULT_TIMEOUTS.default);
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
    const result = await this.invokeWithTimeout('get_archive_preview_with_client', {
      protocol: this.protocol,
      filePath: path,
      filename,
      entryPath,
      maxPreviewSize,
      offset
    }, DEFAULT_TIMEOUTS.default) as FilePreview;

    // 确保 content 是 Uint8Array 类型，处理 Tauri 序列化的二进制数据
    if (result.content && !(result.content instanceof Uint8Array)) {
      result.content = new Uint8Array(result.content as number[]);
    }

    return result;
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
      const connected = await this.invokeWithTimeout<boolean>(
        'storage_connect',
        { config },
        DEFAULT_TIMEOUTS.connect
      );
      this.connected = connected;
      return connected;
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
      await this.invokeWithTimeout('storage_disconnect', undefined, 5000); // 5秒超时
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
}

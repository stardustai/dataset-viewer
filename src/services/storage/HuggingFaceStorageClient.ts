import { invoke } from '@tauri-apps/api/core';
import { BaseStorageClient, DEFAULT_TIMEOUTS, DefaultSortOptions } from './BaseStorageClient';
import { ConnectionConfig, DirectoryResult, ListOptions, ReadOptions, FileContent, StorageResponse } from './types';
import type { ArchiveInfo, FilePreview } from '../../types';

/**
 * HuggingFace 路径信息
 */
interface HuggingFacePathInfo {
  owner: string;
  dataset: string;
  filePath?: string;
  fullDatasetId: string; // owner:dataset
}

export class HuggingFaceStorageClient extends BaseStorageClient {
  protected protocol = 'huggingface';
  private currentConfig: ConnectionConfig | null = null;

  /**
   * HuggingFace 使用服务端排序，默认按下载量降序
   */
  getDefaultSortOptions(): DefaultSortOptions | null {
    return {
      sortBy: 'size', // 'size' 映射到下载量
      sortOrder: 'desc'
    };
  }

  /**
   * HuggingFace 使用较小的分页大小以提高响应速度
   */
  getDefaultPageSize(): number | null {
    return 20;
  }

  /**
   * 解析 HuggingFace 路径
   * 格式：{owner}:{dataset}/{file_path}
   */
  private parseHuggingFacePath(path: string): HuggingFacePathInfo | null {
    if (!path || path === '/' || path === '') {
      return null;
    }

    // 移除开头的斜杠并分割路径
    const normalizedPath = path.replace(/^\/+/, '');
    const segments = normalizedPath.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
      return null;
    }

    const datasetIdPart = segments[0];

    // 必须使用 : 分隔符
    if (!datasetIdPart.includes(':')) {
      return null;
    }

    const datasetParts = datasetIdPart.split(':');
    if (datasetParts.length !== 2) {
      return null;
    }

    const [owner, dataset] = datasetParts;

    if (!owner || !dataset) {
      return null;
    }

    // 剩余部分是文件路径
    const filePath = segments.length > 1 ? segments.slice(1).join('/') : undefined;

    return {
      owner,
      dataset,
      filePath,
      fullDatasetId: `${owner}:${dataset}`
    };
  }

  /**
   * 将前端路径转换为协议统一的地址格式
   * HuggingFace 协议格式：huggingface://dataset_id/file_path
   */
  toProtocolUrl(path: string): string {
    const org = this.currentConfig?.organization;

    // 处理空路径或根路径
    if (!path || path === '/' || path === '') {
      if (org) {
        // 如果指定了组织，使用组织名作为默认路径
        return `huggingface://${org}`;
      }
      return 'huggingface://';
    }

    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo) {
      if (org && !path.includes('/') && !path.includes(':')) {
        // 如果指定了组织且路径不包含分隔符，自动添加组织前缀
        return `huggingface://${org}:${path}`;
      }
      return `huggingface://${path}`;
    }

    if (!pathInfo.filePath) {
      // 数据集根目录
      return `huggingface://${pathInfo.fullDatasetId}`;
    }

    // 完整的数据集文件路径
    return `huggingface://${pathInfo.fullDatasetId}/${pathInfo.filePath}`;
  }

  getDisplayName(): string {
    return 'Hugging Face Hub';
  }

  generateConnectionName(config: ConnectionConfig): string {
    if (config.name) return config.name;
    return config.organization ? `HF (${config.organization})` : 'Hugging Face Hub';
  }

  /**
   * 获取当前连接的组织名称
   */
  getCurrentOrganization(): string | undefined {
    return this.currentConfig?.organization;
  }

  /**
   * HuggingFace 支持数据集搜索
   */
  supportsSearch(): boolean {
    return true;
  }

  /**
   * HuggingFace 支持自定义根路径展示
   */
  supportsCustomRootDisplay(): boolean {
    return true;
  }

  /**
   * HuggingFace 根路径显示热门数据集
   */
  getRootDisplayInfo(): { showWelcome?: boolean; customMessage?: string } {
    const org = this.currentConfig?.organization;
    if (org) {
      return {
        showWelcome: true,
        customMessage: `Browse datasets from ${org} organization on Hugging Face Hub`
      };
    }

    return {
      showWelcome: true,
      customMessage: 'Browse popular datasets from Hugging Face Hub'
    };
  }

  /**
   * 构建 HuggingFace 文件下载 URL（用于后端处理）
   */
  protected buildDownloadUrl(path: string): string {
    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download URL');
    }

    // HuggingFace 文件下载 URL 格式 (URL中需要使用/分隔符)
    const urlDatasetId = pathInfo.fullDatasetId.replace(':', '/');
    return `https://huggingface.co/datasets/${urlDatasetId}/resolve/main/${pathInfo.filePath}`;
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    // API token 通过 Tauri 后端管理，前端不需要直接处理
    return headers;
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    try {
      // 保存当前配置，用于构建 URL
      this.currentConfig = config;

      // 使用基类的通用连接方法
      const connected = await this.connectToBackend({
        protocol: 'huggingface',
        url: null,
        accessKey: null,
        secretKey: null,
        region: null,
        endpoint: null,
        username: null,
        password: config.apiToken, // HuggingFace token 传递给 password 字段
        extraOptions: null,
      });

      if (connected) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('HuggingFace connection failed:', error);
      return false;
    }
  }

  disconnect(): void {
    // 使用基类的通用断开连接方法
    this.disconnectFromBackend();
    this.currentConfig = null;
  }

  async listDirectory(path: string, options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connected) {
      throw new Error('HuggingFace storage not connected');
    }

    try {
      // 处理组织过滤：如果指定了组织且路径为空，则使用组织名作为路径
      let actualPath = path;
      const org = this.currentConfig?.organization;

      if (org && (!path || path === '' || path === '/')) {
        // 如果指定了组织且路径为空，使用组织名作为路径前缀
        actualPath = org;
      }

      // 直接传递路径给后端，后端负责处理所有格式转换
      return await invoke<DirectoryResult>('storage_list', {
        path: actualPath,
        options: options ? {
          pageSize: options.pageSize,
          marker: options.marker,
          prefix: options.prefix,
          recursive: options.recursive,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder,
        } : null,
      });
    } catch (error) {
      console.error(`Failed to list directory ${path}:`, error);
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  async getFileContent(path: string, options?: ReadOptions): Promise<FileContent> {
    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace content reading');
    }

    try {
      // 准备请求头，支持范围请求
      const headers = this.getAuthHeaders();

      // 如果指定了范围参数，添加 Range 头
      if (options?.start !== undefined && options?.length !== undefined) {
        const end = options.start + options.length - 1;
        headers['Range'] = `bytes=${options.start}-${end}`;
      } else if (options?.start !== undefined && options?.end !== undefined) {
        headers['Range'] = `bytes=${options.start}-${options.end}`;
      }

      // 使用统一的 storage_request 方法获取文件内容
      const response = await invoke<StorageResponse>('storage_request', {
        protocol: this.protocol,
        method: 'GET',
        url: this.toProtocolUrl(path),
        headers,
        body: undefined,
        options: undefined
      });

      return {
        content: response.body || '',
        size: parseInt(response.headers['content-length'] || '0'),
        encoding: 'utf-8',
      };
    } catch (error) {
      console.error(`Failed to get file content for ${path}:`, error);
      throw error;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace size check');
    }

    try {
      // 使用统一的 storage_request 方法获取文件头信息
      const response = await invoke<StorageResponse>('storage_request', {
        protocol: this.protocol,
        method: 'HEAD',
        url: this.toProtocolUrl(path),
        headers: this.getAuthHeaders(),
        body: undefined,
        options: undefined
      });

      const sizeHeader = response.headers['content-length'] || response.headers['Content-Length'];
      if (sizeHeader) {
        return parseInt(sizeHeader, 10);
      }

      throw new Error('Content-Length header not found');
    } catch (error) {
      console.error(`Failed to get file size for ${path}:`, error);
      throw error;
    }
  }

  async downloadFile(path: string): Promise<Blob> {
    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download');
    }

    try {
      // 使用统一的 storage_request_binary 方法
      const response = await invoke<number[]>('storage_request_binary', {
        protocol: this.protocol,
        method: 'GET',
        url: this.toProtocolUrl(path),
        headers: this.getAuthHeaders(),
        options: undefined
      });

      // 直接从二进制数据创建 Blob
      return new Blob([new Uint8Array(response)]);
    } catch (error) {
      console.error(`Failed to download file ${path}:`, error);
      throw error;
    }
  }

  async downloadFileWithProgress(path: string, filename: string, savePath?: string): Promise<string> {
    const pathInfo = this.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download with progress');
    }

    try {
      // 构建下载 URL 并使用 downloadWithProgress 方法
      const downloadUrl = this.buildDownloadUrl(path);
      return await this.downloadWithProgress('GET', downloadUrl, filename, savePath, this.getAuthHeaders());
    } catch (error) {
      console.error(`Failed to download file with progress ${path}:`, error);
      throw error;
    }
  }

  /**
   * 重写分析压缩文件方法，确保传递正确的协议URL格式给后端
   */
  protected async analyzeArchiveWithClient(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    // 使用协议URL格式
    // 直接使用传入的路径，因为它已经是协议URL格式
    // 通过Tauri命令调用后端的存储客户端接口
    return await this.invokeWithTimeout('archive_scan', {
      protocol: this.protocol,
      filePath: path, // 直接使用传入的路径
      filename,
      maxSize
    }, DEFAULT_TIMEOUTS.default);
  }

  /**
   * 重写获取压缩文件预览方法，确保传递正确的协议URL格式给后端
   */
  protected async getArchiveFilePreviewWithClient(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    // 直接使用传入的路径，因为它已经是协议URL格式
    // 通过Tauri命令调用后端的存储客户端接口
    const result = await this.invokeWithTimeout('archive_read', {
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

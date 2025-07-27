import { invoke } from '@tauri-apps/api/core';
import { BaseStorageClient } from './BaseStorageClient';
import { ConnectionConfig, DirectoryResult, ListOptions, ReadOptions, FileContent } from './types';
import { PathProcessor } from '../../utils/pathUtils';

export class HuggingFaceStorageClient extends BaseStorageClient {
  protected protocol = 'huggingface';
  private currentConfig: ConnectionConfig | null = null;

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

	// HuggingFace 构建正确的数据集 URL
  protected buildFileUrl(path: string): string {
    const org = this.currentConfig?.organization;

    // 处理空路径或根路径
    if (!path || path === '/' || path === '') {
      if (org) {
        // 如果指定了组织，跳转到组织页面
        return `https://huggingface.co/${org}`;
      }
      return 'https://huggingface.co/datasets';
    }

    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo) {
      // 验证路径格式，避免构建无效 URL
      if (path.includes('..') || path.includes('//')) {
        throw new Error('Invalid path format');
      }

      // 如果无法解析路径，假设它是一个简单的数据集名称
      if (org && !path.includes('/')) {
        // 如果指定了组织且路径不包含斜杠，自动添加组织前缀
        return `https://huggingface.co/datasets/${org}/${path}`;
      }
      return `https://huggingface.co/datasets/${path}`;
    }

    const baseUrl = `https://huggingface.co/datasets/${pathInfo.fullDatasetId}`;

    if (!pathInfo.filePath) {
      // 数据集根目录
      return baseUrl;
    }

    // 判断是文件还是目录
    const isFile = this.isLikelyFile(pathInfo.filePath);

    if (isFile) {
      // 文件使用 resolve 路径
      return `${baseUrl}/resolve/main/${pathInfo.filePath}`;
    } else {
      // 目录使用 tree 路径
      return `${baseUrl}/tree/main/${pathInfo.filePath}`;
    }
  }

  /**
   * 根据路径判断是否可能是文件
   * 简单判断：有文件扩展名的认为是文件，否则认为是目录
   */
  private isLikelyFile(filePath: string): boolean {
    const fileName = filePath.split('/').pop() || '';
    // 判断是否包含点号且点号不在开头（排除隐藏文件夹如 .git）
    return fileName.includes('.') && !fileName.startsWith('.');
  }  /**
   * 构建 HuggingFace 文件下载 URL
   */
  protected buildDownloadUrl(path: string): string {
    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download URL');
    }

    // HuggingFace 文件下载 URL 格式
    return `https://huggingface.co/datasets/${pathInfo.fullDatasetId}/resolve/main/${pathInfo.filePath}`;
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

      // 使用统一的后端连接命令建立连接
      const connected = await invoke<boolean>('storage_connect', {
        config: {
          protocol: 'huggingface',
          url: null,
          accessKey: config.apiToken,
          secretKey: null,
          region: null,
          endpoint: null,
          username: null,
          password: null,
          extraOptions: null,
        }
      });

      if (connected) {
        this.connected = true;
        return true;
      }

      this.connected = false;
      return false;
    } catch (error) {
      console.error('HuggingFace connection failed:', error);
      this.connected = false;
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
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
      return await invoke<DirectoryResult>('storage_list_directory', {
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
    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace content reading');
    }

    try {
      // 构建下载 URL
      const downloadUrl = this.buildDownloadUrl(path);

      // 准备请求头，支持范围请求
      const headers = this.getAuthHeaders();

      // 如果指定了范围参数，添加 Range 头
      if (options?.start !== undefined && options?.length !== undefined) {
        const end = options.start + options.length - 1;
        headers['Range'] = `bytes=${options.start}-${end}`;
      } else if (options?.start !== undefined && options?.end !== undefined) {
        headers['Range'] = `bytes=${options.start}-${options.end}`;
      }

      // 使用基类的 makeRequest 方法获取文件内容
      const response = await this.makeRequest({
        method: 'GET',
        url: downloadUrl,
        headers,
        options: null,
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
    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace size check');
    }

    try {
      // 构建下载 URL 并使用基类的 makeRequest 方法获取文件头信息
      const downloadUrl = this.buildDownloadUrl(path);
      const response = await this.makeRequest({
        method: 'HEAD',
        url: downloadUrl,
        headers: this.getAuthHeaders(),
        options: {}
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
    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download');
    }

    try {
      // 构建下载 URL 并使用基类的 makeRequestBinary 方法
      const downloadUrl = this.buildDownloadUrl(path);
      const arrayBuffer = await this.makeRequestBinary({
        method: 'GET',
        url: downloadUrl,
        headers: this.getAuthHeaders(),
        options: {}
      });

      return new Blob([arrayBuffer]);
    } catch (error) {
      console.error(`Failed to download file ${path}:`, error);
      throw error;
    }
  }

  async downloadFileWithProgress(path: string, filename: string): Promise<string> {
    const pathInfo = PathProcessor.parseHuggingFacePath(path);
    if (!pathInfo || !pathInfo.filePath) {
      throw new Error('Invalid file path for HuggingFace download with progress');
    }

    try {
      // 构建下载 URL 并使用 downloadWithProgress 方法
      const downloadUrl = this.buildDownloadUrl(path);
      return await this.downloadWithProgress('GET', downloadUrl, filename, this.getAuthHeaders());
    } catch (error) {
      console.error(`Failed to download file with progress ${path}:`, error);
      throw error;
    }
  }
}

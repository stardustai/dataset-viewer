import { BaseStorageClient, DefaultSortOptions } from './BaseStorageClient';
import {
  ConnectionConfig,
  FileContent,
  ReadOptions,
} from './types';
import { DirectoryResult, ListOptions } from '../../types/tauri-commands';
import { ArchiveInfo, FilePreview } from '../../types';

interface OSSConnection {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
  connected: boolean;
}

/**
 * OSS (Object Storage Service) 客户端实现
 * 支持阿里云 OSS、AWS S3 兼容的对象存储服务
 */
export class OSSStorageClient extends BaseStorageClient {
  protected protocol = 'oss';
  private connection: OSSConnection | null = null;

  /**
   * OSS 不使用固定排序，让用户自由排序
   */
  getDefaultSortOptions(): DefaultSortOptions | null {
    return null; // 使用前端排序
  }

  /**
   * OSS 使用大分页大小，提高批量处理效率
   */
  getDefaultPageSize(): number | null {
    return 100;
  }

  /**
   * 统一解析 OSS 配置，支持带路径前缀的 bucket
   * 格式：bucket 或 bucket/path/prefix
   */
  private parseOSSConfig(config: ConnectionConfig): {
    endpoint: string;
    bucket: string;
    region: string;
  } {
    let endpoint = config.endpoint || '';
    let bucket = config.bucket || '';
    let region = config.region || 'cn-hangzhou';
    const rawUrl = config.url || '';

    // 如果没有直接配置，从 URL 解析
    if (!bucket || !endpoint) {
      if (rawUrl.startsWith('oss://')) {
        const ossUrl = rawUrl.replace('oss://', '');
        const [hostname, ...bucketParts] = ossUrl.split('/');

        if (!bucket && bucketParts.length > 0) {
          bucket = bucketParts.join('/');
        }

        if (!endpoint) {
          endpoint = `https://${hostname}`;
        }

        // 从 hostname 推断 region
        if (!config.region && hostname.includes('oss-')) {
          const regionMatch = hostname.match(/oss-([^.]+)/);
          region = regionMatch ? regionMatch[1] : 'cn-hangzhou';
        }
      } else if (rawUrl.startsWith('http')) {
        try {
          const url = new URL(rawUrl);
          const hostname = url.hostname;

          if (!endpoint) {
            endpoint = `${url.protocol}//${hostname}`;
          }

          if (!bucket) {
            if (hostname.includes('.oss-')) {
              // 虚拟主机格式：bucket.oss-region.aliyuncs.com
              const bucketPart = hostname.split('.')[0];
              // 如果URL路径不为空，添加路径前缀
              if (url.pathname && url.pathname.length > 1) {
                const pathParts = url.pathname.split('/').filter(Boolean);
                const hasExplicitPrefix = url.pathname.endsWith('/');
                bucket = hasExplicitPrefix && pathParts.length > 0
                  ? `${bucketPart}/${pathParts.join('/')}`
                  : bucketPart;
              } else {
                bucket = bucketPart;
              }
            } else if (url.pathname && url.pathname.length > 1) {
              // 路径格式：oss-region.aliyuncs.com/bucket[/optional/prefix[/...]]
              const pathParts = url.pathname.split('/').filter(Boolean);
              if (pathParts.length > 0) {
                const baseBucket = pathParts[0];
                const hasExplicitPrefix = url.pathname.endsWith('/');
                bucket = hasExplicitPrefix && pathParts.length > 1
                  ? `${baseBucket}/${pathParts.slice(1).join('/')}`
                  : baseBucket;
              }
            }
          }

          // 从 hostname 推断 region
          if (!config.region && hostname.includes('oss-')) {
            const regionMatch = hostname.match(/oss-([^.]+)/);
            region = regionMatch ? regionMatch[1] : 'cn-hangzhou';
          }
        } catch {
          if (!endpoint) endpoint = rawUrl;
        }
      }
    }

    return { endpoint, bucket, region };
  }

  /**
   * 获取连接的显示名称
   */
  getDisplayName(): string {
    if (!this.connection?.endpoint) return 'OSS';

    try {
      const url = new URL(this.connection.endpoint);
      const hostname = url.hostname;

      // 如果hostname已经包含bucket名称（虚拟主机格式），直接使用hostname
      if (hostname.startsWith(`${this.connection.bucket}.`)) {
        return hostname;
      }

      // 否则添加bucket前缀
      return `${this.connection.bucket}.${hostname}`;
    } catch {
      return `${this.connection.bucket} (OSS)`;
    }
  }

  /**
   * 根据连接配置生成连接名称
   */
  generateConnectionName(config: ConnectionConfig): string {
    try {
      const { endpoint, bucket } = this.parseOSSConfig(config);

      if (!bucket) {
        return 'OSS';
      }

      // 提取域名信息用于显示
      let domain = 'OSS';
      try {
        const url = new URL(endpoint);
        const hostParts = url.hostname.split('.');
        if (hostParts.length >= 2) {
          domain = hostParts.slice(-2).join('.');
        }
      } catch {
        // 忽略 URL 解析错误
      }

      return `${domain} (${bucket})`;
    } catch (error) {
      console.warn('Failed to generate OSS connection name:', error);
      return config.bucket ? `OSS (${config.bucket})` : 'OSS';
    }
  }

  async connect(config: ConnectionConfig): Promise<boolean> {
    if (config.type !== 'oss') {
      throw new Error('Invalid connection type for OSS client');
    }

    // 验证必需的配置
    if (!config.url || !config.username || !config.password) {
      throw new Error('OSS requires endpoint (url), accessKey (username), and secretKey (password)');
    }

    // 使用统一的配置解析方法
    const { endpoint, bucket, region } = this.parseOSSConfig(config);
    const accessKey = config.username;
    const secretKey = config.password;

    if (!bucket) {
      throw new Error('OSS bucket is required');
    }

    // 统一使用标准化端点处理
    const normalizedEndpoint = this.normalizeOSSEndpoint(endpoint, bucket, region);

    try {
      // 使用基类的通用连接方法
      const success = await this.connectToBackend({
        protocol: 'oss',
        url: normalizedEndpoint,
        accessKey: accessKey,
        secretKey: secretKey,
        bucket: bucket,
        region: region,
        username: null,
        password: null,
        extraOptions: null,
      });

      if (success) {
        this.connection = {
          endpoint: normalizedEndpoint,
          accessKey,
          secretKey,
          bucket,
          region,
          connected: true,
        };

        return true;
      }

      return false;
    } catch (error) {
      console.error('OSS connection failed:', error);
      throw new Error(`OSS connection failed: ${error}`);
    }
  }

  disconnect(): void {
    // 使用基类的通用断开连接方法
    this.disconnectFromBackend();
    this.connection = null;
  }

  async listDirectory(path: string, options?: Partial<ListOptions>): Promise<DirectoryResult> {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    // 获取对象键前缀，对于根目录，返回空字符串
    const objectKeyPrefix = this.normalizePath(path);

    try {
      // 使用基类的统一包装器，自动处理类型转换
      const result = await this.invokeListDirectory(
        objectKeyPrefix, // 传递处理后的对象键，而不是协议URL
        options ? {
          pageSize: options.pageSize || null,
          marker: options.marker || null,
          // 只有用户明确指定prefix时才使用，否则让后端根据path自动处理
          prefix: options.prefix || null,
          recursive: options.recursive || null,
          sortBy: options.sortBy || null,
          sortOrder: options.sortOrder || null,
        } : undefined
      );

      return result;
    } catch (error) {
      console.error('Failed to list OSS directory:', error);
      throw new Error(`Failed to list directory: ${error}`);
    }
  }

  async getFileContent(path: string, options: ReadOptions = {}): Promise<FileContent> {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    try {
      // 使用新的统一二进制接口读取文件
      const data = await this.readFileBytes(path, options?.start, options?.length);

      // 解码为文本
      const content = this.decodeTextContent(data);

      return {
        content,
        size: data.length,
        encoding: 'utf-8',
      };
    } catch (error) {
      console.error('Failed to get OSS file content:', error);
      throw new Error(`Failed to get file content: ${error}`);
    }
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    try {
      return await this.getFileSizeInternal(path);
    } catch (error) {
      throw new Error(`Failed to get file size: ${error}`);
    }
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    try {
      // 使用新的统一二进制接口读取整个文件
      const data = await this.readFileBytes(path);
      const compatibleArray = new Uint8Array(data);
      return new Blob([compatibleArray]);
    } catch (error) {
      console.error('Failed to download OSS file:', error);
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  /**
   * 带进度的下载方法
   */
  async downloadFileWithProgress(path: string, filename: string, savePath?: string): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    try {
      return await this.downloadWithProgress(
        'GET',
        this.toProtocolUrl(path),
        filename,
        savePath,
        this.getAuthHeaders()
      );
    } catch (error) {
      console.error('Failed to download OSS file with progress:', error);
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  /**
   * 将前端路径转换为协议统一的地址格式
   * OSS 协议格式：oss://bucket/path/to/file
   */
  toProtocolUrl(path: string): string {
    if (!this.connection) {
      throw new Error('Not connected to OSS');
    }

    const objectKey = this.normalizePath(path);

    // 构建标准的 OSS URL 格式：oss://bucket/path/to/file
    // 移除 bucket 末尾的斜杠（如果有），避免双斜杠
    const cleanBucket = this.connection.bucket.replace(/\/+$/, '');

    if (objectKey) {
      return `oss://${cleanBucket}/${objectKey}`;
    } else {
      return `oss://${cleanBucket}`;
    }
  }

  /**
   * 获取认证头
   */
  protected getAuthHeaders(): Record<string, string> {
    if (!this.connection) {
      return {};
    }

    // OSS 认证将在后端处理，不需要在前端添加任何认证头部
    return {};
  }

  /**
   * 分析压缩文件结构（OSS统一流式实现）
   */
  async analyzeArchive(
    path: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    try {
      // OSS使用统一的StorageClient流式分析接口
      console.log('OSS使用统一流式分析:', { originalPath: path, filename });

      // 直接传递path，因为它已经是协议URL格式
      const result = await this.analyzeArchiveWithClient(path, filename, maxSize);

      return result;
    } catch (error) {
      console.error('Failed to analyze OSS archive:', error);
      throw error;
    }
  }

  /**
   * 获取压缩文件中的文件预览（OSS特定实现）
   */
  async getArchiveFilePreview(
    path: string,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    try {
      // 对于OSS，使用存储客户端接口而不是HTTP接口进行流式预览
      console.log('OSS获取压缩文件预览（流式）:', {
        originalPath: path,
        filename,
        entryPath
      });

      // 直接传递path，因为它已经是协议URL格式
      return await this.getArchiveFilePreviewWithClient(
        path,
        filename,
        entryPath,
        maxPreviewSize
      );
    } catch (error) {
      console.error('Failed to get OSS archive file preview:', error);
      throw error;
    }
  }

  /**
   * 将 OSS 端点标准化为虚拟主机风格
   * 输入：https://oss-cn-hangzhou.aliyuncs.com 或 oss://hostname/bucket
   * 输出：https://bucket-name.oss-cn-hangzhou.aliyuncs.com
   */
  private normalizeOSSEndpoint(rawEndpoint: string, bucket: string, region: string): string {
    try {
      // 如果是 oss:// 协议，先转换为 https://
      const endpoint = rawEndpoint.startsWith('oss://')
        ? rawEndpoint.replace('oss://', 'https://')
        : rawEndpoint;

      const url = new URL(endpoint);

      // 提取实际的 bucket 名称（不包含路径前缀）
      const actualBucket = bucket.includes('/') ? bucket.split('/')[0] : bucket;

      // 如果已经是虚拟主机风格（包含实际的 bucket 名称），直接返回
      if (url.hostname.startsWith(`${actualBucket}.`)) {
        return endpoint;
      }

      // 检查是否为本地或自定义端点（不需要虚拟主机风格）
      const isLocalOrCustom = url.hostname.includes('localhost') ||
                              url.hostname.includes('127.0.0.1') ||
                              !url.hostname.includes('.');

      if (isLocalOrCustom) {
        return endpoint;
      }

      // 检查 URL 格式是否正确，如果包含无效字符则重新构建
      const hasInvalidFormat = url.hostname.includes('/') ||
                               !url.hostname.includes('.') ||
                               url.hostname.split('.').length < 2;

      if (hasInvalidFormat) {
        // URL 格式错误，根据 region 重新构建标准的 OSS 端点
        return `https://${actualBucket}.oss-${region}.aliyuncs.com`;
      }

      // 对于支持虚拟主机风格的云服务商，统一转换
      const supportedProviders = [
        'oss-',           // 阿里云OSS
        'amazonaws.com',  // AWS S3
        'myqcloud.com',   // 腾讯云COS
        'myhuaweicloud.com' // 华为云OBS
      ];

      const needsVirtualHostStyle = supportedProviders.some(provider =>
        url.hostname.includes(provider) || url.hostname.startsWith(provider)
      );

      if (needsVirtualHostStyle) {
        const pathSuffix = url.pathname !== '/' ? url.pathname : '';
        // 使用实际的 bucket 名称构建虚拟主机风格 URL
        return `${url.protocol}//${actualBucket}.${url.hostname}${pathSuffix}`;
      }

      // 对于未知的提供商或自定义端点，返回原始端点不做修改
      return endpoint;
    } catch (error) {
      // 如果解析失败，构建默认的阿里云OSS端点
      // 使用实际的 bucket 名称
      const actualBucket = bucket.includes('/') ? bucket.split('/')[0] : bucket;
      return `https://${actualBucket}.oss-${region}.aliyuncs.com`;
    }
  }

  /**
   * 标准化路径
   */
  protected normalizePath(path: string): string {
    // 如果路径是完整的 oss:// URL，提取对象键部分
    if (path.startsWith('oss://')) {
      try {
        // 解析 oss://hostname/bucket/object-key 格式
        const ossUrl = path.replace('oss://', '');
        const parts = ossUrl.split('/');
        if (parts.length >= 3) {
          // 跳过 hostname 和 bucket，获取 object key
          return parts.slice(2).join('/');
        }
      } catch (error) {
        console.warn('Failed to parse OSS URL:', path, error);
      }
    }

    // 如果路径是完整的 HTTPS OSS URL，提取对象键部分
    if (path.startsWith('http')) {
      try {
        const url = new URL(path);
        const hostname = url.hostname;
        const pathname = url.pathname;

        // 检查是否为OSS URL
        if (hostname.includes('oss-') || hostname.includes('aliyuncs.com')) {
          if (hostname.includes('.oss-')) {
            // 虚拟主机格式：bucket.oss-region.aliyuncs.com/object-key
            return pathname.replace(/^\/+/, ''); // 直接使用pathname作为object key
          } else if (hostname.startsWith('oss-') || hostname.includes('aliyuncs.com')) {
            // 路径格式：oss-region.aliyuncs.com/bucket/object-key
            const pathParts = pathname.split('/').filter(part => part.length > 0);
            if (pathParts.length > 1) {
              // 跳过bucket（第一个部分），获取object key
              return pathParts.slice(1).join('/');
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse HTTPS OSS URL:', path, error);
      }
    }

    // 移除开头的斜杠，OSS 对象键不应该以斜杠开头
    return path.replace(/^\/+/, '');
  }

}

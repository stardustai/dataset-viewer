// 存储类型定义
export type StorageClientType = 'webdav' | 'oss' | 's3' | 'local' | 'huggingface';
export interface StorageClient {
  connect(config: ConnectionConfig): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  listDirectory(path: string, options?: ListOptions): Promise<DirectoryResult>;
  getFileContent(path: string, options?: ReadOptions): Promise<FileContent>;
  getFileSize(path: string): Promise<number>;
  downloadFile(path: string): Promise<Blob>;
  downloadFileWithProgress?(path: string, filename: string): Promise<string>;
}

// 统一的连接配置基类
// 连接配置
export interface ConnectionConfig {
  type: StorageClientType;
  url?: string;
  username?: string;
  password?: string;
  name?: string; // 连接名称，用于显示和保存
  // 本机文件系统特定配置
  rootPath?: string; // 本机文件系统的根目录路径
  // OSS 特定配置
  bucket?: string;  // OSS bucket 名称
  region?: string;  // OSS 区域
  endpoint?: string; // OSS 端点地址（可选，通常从 url 解析）
  // HuggingFace 特定配置
  apiToken?: string; // HF API token for private datasets
  organization?: string; // 组织名称 (可选)
}

// 统一的分页选项
export interface ListOptions {
  pageSize?: number;        // 每页大小（OSS 使用，WebDAV 忽略）
  marker?: string;          // 分页标记（OSS 使用，WebDAV 忽略）
  prefix?: string;          // 路径前缀过滤
  recursive?: boolean;      // 是否递归列出子目录
  sortBy?: 'name' | 'size' | 'modified';  // 排序方式
  sortOrder?: 'asc' | 'desc';
}

// 统一的目录结果
export interface DirectoryResult {
  files: StorageFile[];
  hasMore: boolean;         // 是否有更多数据
  nextMarker?: string;      // 下一页标记（仅 OSS 使用）
  totalCount?: number;      // 总数量（如果可获取）
  path: string;             // 当前路径
}

// 统一的文件信息接口
interface StorageFile {
  filename: string;   // 用于内部路径导航和API调用的标识符（如 HF 的 owner:dataset）
  basename: string;   // 用于UI显示的文件/目录名称（如 owner/dataset）
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  mime?: string;
  etag?: string;
  // 扩展元数据
  metadata?: Record<string, any>;
}

// 文件内容接口
export interface FileContent {
  content: string;
  size: number;
  encoding: string;
  totalSize?: number; // 总文件大小（用于范围请求）
}

// 读取选项
export interface ReadOptions {
  start?: number;
  length?: number;
  end?: number; // 结束位置 (包含)
}


// 后端响应
export interface StorageResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  metadata?: any;
}

// 服务器能力检测
export interface ServerCapabilities {
  supportsWebDAV: boolean;
  preferredMethod: 'PROPFIND' | 'GET' | 'AUTO';
  lastDetected: number;
  supportsPagination: boolean;
  maxPageSize?: number;
}

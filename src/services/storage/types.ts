// 存储类型定义
import { DirectoryResult, ListOptions } from '../../types/tauri-commands';
import type { ArchiveInfo } from '../../types';

// 重新导出从 tauri-commands 导入的类型，使其对外可用
export type { DirectoryResult, ListOptions };

export type StorageClientType = 'webdav' | 'oss' | 's3' | 'local' | 'huggingface' | 'ssh' | 'smb';
export interface StorageClient {
  connect(config: ConnectionConfig): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  listDirectory(path: string, options?: ListOptions): Promise<DirectoryResult>;
  getFileContent(path: string, options?: ReadOptions): Promise<FileContent>;
  getFileSize(path: string): Promise<number>;
  getFileAsBlob(path: string): Promise<Blob>;
  downloadFileWithProgress?(path: string, filename: string, savePath?: string): Promise<string>;
  // 低级别文件访问方法
  readFileBytes(path: string, start?: number, length?: number): Promise<Uint8Array>;
  // 档案文件相关方法
  analyzeArchive?(path: string, filename: string, maxSize?: number): Promise<ArchiveInfo>;
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
  bucket?: string; // OSS bucket 名称
  region?: string; // OSS 区域
  endpoint?: string; // OSS 端点地址（可选，通常从 url 解析）
  platform?: string; // OSS 平台类型 (aws, aliyun, tencent, huawei, minio, custom)
  // HuggingFace 特定配置
  apiToken?: string; // HF API token for private datasets
  organization?: string; // 组织名称 (可选)
  // SSH 特定配置
  port?: number; // SSH 端口 (默认22)
  privateKeyPath?: string; // SSH 私钥文件路径
  passphrase?: string; // 私钥密码
  // SMB 特定配置
  share?: string; // SMB 共享名称
  domain?: string; // SMB 域名或工作组
  // 连接元数据
  isTemporary?: boolean; // 临时连接，不保存到已保存连接中（如文件关联）
}

// 文件内容接口
export interface FileContent {
  content: string;
  size: number;
  encoding: string;
  totalSize?: string; // 总文件大小（用于范围请求），改为字符串类型
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

import type { StorageFile } from './tauri-commands';

// 重新导出 tauri-commands 中的 StorageFile 作为主要类型定义
export type { StorageFile };

// 类型保护函数，帮助检查文件类型
export const isFileType = (
  file: Pick<StorageFile, 'type'>
): file is StorageFile & { type: 'file' } => {
  return file.type === 'file';
};

export const isDirectoryType = (
  file: Pick<StorageFile, 'type'>
): file is StorageFile & { type: 'directory' } => {
  return file.type === 'directory';
};

export interface StorageConnection {
  url: string;
  username: string;
  password: string;
  connected: boolean;
  // 扩展元数据字段，用于存储不同存储类型的特定信息
  metadata?: {
    // HuggingFace 特定字段
    organization?: string;
    apiToken?: string;
    // OSS 特定字段
    bucket?: string;
    region?: string;
    endpoint?: string;
    // 其他存储类型可以在此添加字段
    [key: string]: any;
  };
}
export interface SearchResult {
  line: number;
  column: number;
  text: string;
  match: string;
}

export interface FullFileSearchResult extends SearchResult {
  filePosition: number;
}

export interface ReleaseInfo {
  downloadUrl: string;
  filename: string;
  fileSize: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  filename?: string;
  fileSize?: string;
}

// 重新导出 tauri-commands 中的 Archive 相关类型
export type { ArchiveEntry, ArchiveInfo } from './tauri-commands';

export interface FilePreview {
  content: Uint8Array;
  is_truncated: boolean;
  total_size: string; // 改为字符串类型，与后端保持一致
  preview_size: number;
}

export interface WebDAVFile {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  mime?: string;
  etag?: string;
}

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

export interface FileContent {
  content: string;
  size: number;
  encoding: string;
}

export interface SearchResult {
  line: number;
  column: number;
  text: string;
  match: string;
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

export interface ArchiveEntry {
  path: string;
  size: number;
  is_dir: boolean;
  modified_time?: string;
  compressed_size?: number;
}

export interface ArchiveInfo {
  entries: ArchiveEntry[];
  total_entries: number;
  compression_type: string;
  total_uncompressed_size: number;
  total_compressed_size: number;
  supports_streaming?: boolean;
  supports_random_access?: boolean;
  analysis_status?: AnalysisStatus;
}

export interface AnalysisStatus {
  Complete?: {};
  Partial?: { analyzed_entries: number };
  Streaming?: { estimated_entries: number | null };
  Failed?: { error: string };
}

export interface FilePreview {
  content: Uint8Array;
  is_truncated: boolean;
  total_size: number;
  preview_size: number;
}


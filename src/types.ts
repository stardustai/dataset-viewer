export interface WebDAVFile {
  filename: string;
  basename: string;
  lastmod: string;
  size: number;
  type: 'file' | 'directory';
  mime?: string;
  etag?: string;
}

export interface WebDAVConnection {
  url: string;
  username: string;
  password: string;
  connected: boolean;
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
}

export interface FilePreview {
  content: string;
  is_truncated: boolean;
  total_size: number;
  encoding: string;
}

export interface CompressedFileChunk {
  stream_id: string;
  chunk_index: number;
  content: string;
  is_complete: boolean;
}

export interface CompressedFileEvent {
  stream_id: string;
  error?: string;
  total_chunks?: number;
}

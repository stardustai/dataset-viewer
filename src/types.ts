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

export interface UpdateConfig {
  version: string;
  releases: {
    'macos-arm64': ReleaseInfo | null;
    'macos-x64': ReleaseInfo | null;
    windows: ReleaseInfo | null;
    linux: ReleaseInfo | null;
  };
  github: {
    repoUrl: string;
  };
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  filename?: string;
  fileSize?: string;
}

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

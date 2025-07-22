import { fetch } from '@tauri-apps/plugin-http';
import { WebDAVFile, WebDAVConnection, FileContent } from '../types';

class TauriWebDAVService {
  private connection: WebDAVConnection | null = null;

  private async makeRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string
  ): Promise<Response> {
    if (!this.connection) {
      throw new Error('Not connected to WebDAV server');
    }

    const url = new URL(path, this.connection.url).toString();
    const auth = btoa(`${this.connection.username}:${this.connection.password}`);

    const requestHeaders = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      ...headers,
    };

    return await fetch(url, {
      method,
      headers: requestHeaders,
      body: body,
    });
  }

  async connect(url: string, username: string, password: string): Promise<boolean> {
    try {
      // Test connection by making a PROPFIND request to root
      const testConnection = { url, username, password, connected: false };
      this.connection = testConnection;

      const response = await this.makeRequest('PROPFIND', '/', {
        'Depth': '1',
      }, '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>');

      if (response.ok) {
        this.connection = {
          url,
          username,
          password,
          connected: true,
        };
        return true;
      } else {
        this.connection = null;
        return false;
      }
    } catch (error) {
      console.error('Failed to connect to WebDAV server:', error);
      this.connection = null;
      return false;
    }
  }

  disconnect(): void {
    this.connection = null;
  }

  isConnected(): boolean {
    return this.connection?.connected || false;
  }

  getConnection(): WebDAVConnection | null {
    return this.connection;
  }

  async listDirectory(path: string = '/'): Promise<WebDAVFile[]> {
    const response = await this.makeRequest('PROPFIND', path, {
      'Depth': '1',
    }, '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>');

    if (!response.ok) {
      throw new Error(`Failed to list directory: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    // 解码路径以确保与 decodedHref 进行正确比较
    return this.parseDirectoryListing(xmlText, decodeURIComponent(path));
  }

  private parseDirectoryListing(xmlText: string, basePath: string): WebDAVFile[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const responses = xmlDoc.getElementsByTagName('response');
    const files: WebDAVFile[] = [];

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const href = response.getElementsByTagName('href')[0]?.textContent;

      if (!href) continue;

      // Skip the current directory entry
      const decodedHref = decodeURIComponent(href);
      if (decodedHref === basePath || decodedHref === basePath + '/') {
        continue;
      }

      const propstat = response.getElementsByTagName('propstat')[0];
      if (!propstat) continue;

      const prop = propstat.getElementsByTagName('prop')[0];
      if (!prop) continue;

      const resourceType = prop.getElementsByTagName('resourcetype')[0];
      const isDirectory = resourceType?.getElementsByTagName('collection').length > 0;

      const contentLength = prop.getElementsByTagName('getcontentlength')[0]?.textContent;
      const lastModified = prop.getElementsByTagName('getlastmodified')[0]?.textContent;

      const filename = decodedHref.split('/').pop() || '';

      files.push({
        filename: decodedHref,
        basename: filename,
        lastmod: lastModified || new Date().toISOString(),
        size: contentLength ? parseInt(contentLength, 10) : 0,
        type: isDirectory ? 'directory' : 'file',
      });
    }

    return files;
  }

  async getFileContent(filePath: string): Promise<FileContent> {
    const response = await this.makeRequest('GET', filePath);

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    const contentLength = response.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength, 10) : content.length;

    return {
      content,
      size,
      encoding: 'utf-8',
    };
  }

  async getFileStream(filePath: string, start?: number, end?: number): Promise<string> {
    const headers: Record<string, string> = {};

    if (start !== undefined && end !== undefined) {
      headers['Range'] = `bytes=${start}-${end}`;
    }

    const response = await this.makeRequest('GET', filePath, headers);

    if (!response.ok) {
      throw new Error(`Failed to get file stream: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  isTextFile(filename: string): boolean {
    const textExtensions = [
      '.txt', '.md', '.json', '.xml', '.yml', '.yaml', '.csv', '.log',
      '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
      '.html', '.htm', '.css', '.scss', '.sass', '.less',
      '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
      '.php', '.rb', '.go', '.rs', '.swift', '.kt',
      '.sql', '.sh', '.bash', '.zsh', '.fish',
      '.ini', '.conf', '.config', '.env',
      '.gitignore', '.gitattributes', '.editorconfig',
      '.dockerfile', '.makefile', '.cmake',
    ];

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return textExtensions.includes(ext) ||
           filename.toLowerCase().includes('readme') ||
           filename.toLowerCase().includes('license') ||
           filename.toLowerCase().includes('changelog');
  }

  async downloadFile(filePath: string): Promise<Blob> {
    const response = await this.makeRequest('GET', filePath);

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    return await response.blob();
  }
}

export const webdavService = new TauriWebDAVService();

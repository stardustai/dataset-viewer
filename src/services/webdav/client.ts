import { invoke } from '@tauri-apps/api/core';
import { WebDAVConnection } from '../../types';
import { WebDAVResponse } from './types';

export class WebDAVClient {
  private connection: WebDAVConnection | null = null;

  setConnection(connection: WebDAVConnection | null): void {
    this.connection = connection;
  }

  getConnection(): WebDAVConnection | null {
    return this.connection;
  }

  isConnected(): boolean {
    return this.connection?.connected || false;
  }

  async makeRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: string
  ): Promise<WebDAVResponse> {
    if (!this.connection) {
      throw new Error('Not connected to WebDAV server');
    }

    // Handle relative and absolute paths correctly
    let requestUrl: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      // Absolute URL
      requestUrl = path;
    } else if (path.startsWith('/')) {
      // Absolute path - construct URL with base URL's origin
      const baseUrl = new URL(this.connection.url);
      requestUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;
    } else if (path === '') {
      // Empty path means use the base URL as-is
      requestUrl = this.connection.url;
    } else {
      // Non-empty relative path
      requestUrl = new URL(path, this.connection.url).toString();
    }

    const auth = btoa(`${this.connection.username}:${this.connection.password}`);

    const requestHeaders = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      ...headers,
    };

    // 使用Tauri的HTTP命令来绕过权限限制
    console.log('Making WebDAV request:', {
      method,
      url: requestUrl,
      hasAuth: requestHeaders.Authorization ? 'Yes' : 'No'
    });

    const response = await invoke<{ status: number; headers: Record<string, string>; body: string }>('webdav_request', {
      method,
      url: requestUrl,
      headers: requestHeaders,
      body,
    });

    console.log('WebDAV response status:', response.status);

    if (response.status === 403) {
      const errorMessage = `Access denied (403): This could be due to:
1. Incorrect username or password
2. Insufficient permissions for this file/directory
3. Server configuration blocking this operation
4. Path encoding issues

URL: ${requestUrl}
Please check your credentials and server configuration.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    return response;
  }

  async makeRequestBinary(
    method: string,
    path: string,
    headers: Record<string, string> = {}
  ): Promise<ArrayBuffer> {
    if (!this.connection) {
      throw new Error('Not connected to WebDAV server');
    }

    // Handle relative and absolute paths correctly
    let requestUrl: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      requestUrl = path;
    } else if (path.startsWith('/')) {
      const baseUrl = new URL(this.connection.url);
      requestUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;
    } else if (path === '') {
      requestUrl = this.connection.url;
    } else {
      requestUrl = new URL(path, this.connection.url).toString();
    }

    const auth = btoa(`${this.connection.username}:${this.connection.password}`);
    const requestHeaders = {
      'Authorization': `Basic ${auth}`,
      'Accept': '*/*',
      ...headers
    };

    // 使用新的二进制请求命令
    console.log('Making binary WebDAV request:', {
      method,
      url: requestUrl,
      hasAuth: requestHeaders.Authorization ? 'Yes' : 'No'
    });

    const response = await invoke<{ status: number; headers: Record<string, string>; body: string }>('webdav_request_binary', {
      method,
      url: requestUrl,
      headers: requestHeaders,
    });

    console.log('Binary WebDAV response status:', response.status);

    if (response.status === 403) {
      const errorMessage = `Access denied (403) for binary download: This could be due to:
1. Incorrect username or password
2. Insufficient permissions for this file
3. Server blocking binary downloads
4. File is restricted or protected

URL: ${requestUrl}
Please check your credentials and file permissions.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    // Convert base64 string to ArrayBuffer for binary files
    const binaryString = atob(response.body);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async downloadFileWithProgress(
    method: string,
    path: string,
    filename: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    if (!this.connection) {
      throw new Error('Not connected to WebDAV server');
    }

    // Handle relative and absolute paths correctly
    let requestUrl: string;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      requestUrl = path;
    } else if (path.startsWith('/')) {
      const baseUrl = new URL(this.connection.url);
      requestUrl = `${baseUrl.protocol}//${baseUrl.host}${path}`;
    } else if (path === '') {
      requestUrl = this.connection.url;
    } else {
      requestUrl = new URL(path, this.connection.url).toString();
    }

    const auth = btoa(`${this.connection.username}:${this.connection.password}`);
    const requestHeaders = {
      'Authorization': `Basic ${auth}`,
      'Accept': '*/*',
      ...headers
    };

    // 使用新的带进度的下载命令
    const result = await invoke<string>('download_file_with_progress', {
      method,
      url: requestUrl,
      headers: requestHeaders,
      filename,
    });

    return result;
  }
}

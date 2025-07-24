import { BaseStorageClient } from './BaseStorageClient';
import {
  ConnectionConfig,
  DirectoryResult,
  FileContent,
  ListOptions,
  ReadOptions,
  StorageFile,
  ServerCapabilities
} from './types';

interface WebDAVConnection {
  url: string;
  username: string;
  password: string;
  connected: boolean;
}

/**
 * 优化的 WebDAV 客户端实现
 * 基于统一存储接口，支持分页模拟和服务器能力检测
 */
export class WebDAVStorageClient extends BaseStorageClient {
  protected protocol = 'webdav';
  private connection: WebDAVConnection | null = null;
  private serverCapabilities: ServerCapabilities = {
    supportsWebDAV: false,
    preferredMethod: 'AUTO',
    lastDetected: 0,
    supportsPagination: false,
  };

  async connect(config: ConnectionConfig): Promise<boolean> {
    if (config.type !== 'webdav' || !config.url || !config.username || !config.password) {
      throw new Error('Invalid WebDAV configuration');
    }

    try {
      this.connection = {
        url: config.url,
        username: config.username,
        password: config.password,
        connected: false,
      };

      // 使用统一接口测试连接
      let response;
      try {
        response = await this.makeRequest({
          method: 'HEAD',
          url: config.url,
          headers: {
            'Authorization': `Basic ${btoa(`${config.username}:${config.password}`)}`
          }
        });
      } catch (error) {
        // 如果 HEAD 失败，尝试 GET
        console.warn('HEAD request failed, trying GET:', error);
        response = await this.makeRequest({
          method: 'GET',
          url: config.url,
          headers: {
            'Authorization': `Basic ${btoa(`${config.username}:${config.password}`)}`
          }
        });
      }

      const connected = response.status >= 200 && response.status < 400;
      if (this.connection) {
        this.connection.connected = connected;
        this.connected = connected;
      }

      // 检测服务器能力
      if (connected) {
        await this.detectServerCapabilities();
      }

      return connected;
    } catch (error) {
      console.error('WebDAV connection failed:', error);
      this.connected = false;
      return false;
    }
  }

  disconnect(): void {
    this.connection = null;
    this.connected = false;
    this.resetServerCapabilities();
  }

  async listDirectory(path: string = '', options?: ListOptions): Promise<DirectoryResult> {
    if (!this.connection) throw new Error('Not connected to WebDAV server');

    try {
      // 根据服务器能力选择请求方法
      switch (this.serverCapabilities.preferredMethod) {
        case 'PROPFIND':
          return await this.listDirectoryWithPROPFIND(path, options);
        case 'GET':
          return await this.listDirectoryWithGET(path, options);
        case 'AUTO':
        default:
          // 自动检测：先尝试 PROPFIND，失败则降级到 GET
          return await this.listDirectoryWithAutoDetection(path, options);
      }
    } catch (error) {
      console.error('Directory listing failed:', error);
      throw error;
    }
  }

  private async listDirectoryWithPROPFIND(path: string, options?: ListOptions): Promise<DirectoryResult> {
    const response = await this.makeRequest({
      method: 'PROPFIND',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection!.username}:${this.connection!.password}`)}`,
        'Depth': '1',
      },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>'
    });

    if (response.status === 405) {
      throw new Error('PROPFIND method not allowed');
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PROPFIND failed with status: ${response.status}`);
    }

    const files = this.parseDirectoryListing(response.body, path);
    return this.applyClientSideOptions(files, path, options);
  }

  private async listDirectoryWithGET(path: string, options?: ListOptions): Promise<DirectoryResult> {
    const response = await this.makeRequest({
      method: 'GET',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection!.username}:${this.connection!.password}`)}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to list directory: ${response.status}`);
    }

    const files = this.parseHTMLDirectoryListing(response.body, path);
    return this.applyClientSideOptions(files, path, options);
  }

  private async listDirectoryWithAutoDetection(path: string, options?: ListOptions): Promise<DirectoryResult> {
    console.log('Starting server capability detection...');

    try {
      // 先尝试 PROPFIND
      const result = await this.listDirectoryWithPROPFIND(path, options);

      // 成功则标记为支持 WebDAV
      this.serverCapabilities.supportsWebDAV = true;
      this.serverCapabilities.preferredMethod = 'PROPFIND';
      this.serverCapabilities.lastDetected = Date.now();
      console.log('Detection result: Supports WebDAV PROPFIND');

      return result;
    } catch (propfindError) {
      console.warn('PROPFIND failed, trying GET method:', propfindError);

      try {
        const result = await this.listDirectoryWithGET(path, options);

        // 成功则标记为不支持 WebDAV，使用 GET
        this.serverCapabilities.supportsWebDAV = false;
        this.serverCapabilities.preferredMethod = 'GET';
        this.serverCapabilities.lastDetected = Date.now();
        console.log('Detection result: Does not support WebDAV, using GET');

        return result;
      } catch (getError) {
        console.error('GET method also failed:', getError);
        throw getError;
      }
    }
  }

  private applyClientSideOptions(files: StorageFile[], path: string, options?: ListOptions): DirectoryResult {
    let filteredFiles = [...files];

    // 前缀过滤
    if (options?.prefix) {
      filteredFiles = filteredFiles.filter(file =>
        file.filename.startsWith(options.prefix!)
      );
    }

    // 排序
    if (options?.sortBy) {
      filteredFiles.sort((a, b) => {
        let comparison = 0;
        switch (options.sortBy) {
          case 'name':
            comparison = a.filename.localeCompare(b.filename);
            break;
          case 'size':
            comparison = a.size - b.size;
            break;
          case 'modified':
            comparison = new Date(a.lastmod).getTime() - new Date(b.lastmod).getTime();
            break;
        }
        return options.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // WebDAV 不支持真正的分页，但可以模拟
    const pageSize = options?.pageSize || filteredFiles.length;
    const startIndex = options?.marker ? parseInt(options.marker) : 0;
    const endIndex = Math.min(startIndex + pageSize, filteredFiles.length);
    const pagedFiles = filteredFiles.slice(startIndex, endIndex);

    return {
      files: pagedFiles,
      hasMore: endIndex < filteredFiles.length,
      nextMarker: endIndex < filteredFiles.length ? endIndex.toString() : undefined,
      totalCount: filteredFiles.length,
      path: path
    };
  }

  async getFileContent(path: string, options?: ReadOptions): Promise<FileContent> {
    if (!this.connection) throw new Error('Not connected');

    const headers: Record<string, string> = {
      'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
    };

    if (options?.start !== undefined && options?.length !== undefined) {
      headers['Range'] = `bytes=${options.start}-${options.start + options.length - 1}`;
    }

    const response = await this.makeRequest({
      method: 'GET',
      url: this.buildUrl(path),
      headers
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return {
      content: response.body,
      size: parseInt(response.headers['content-length'] || '0'),
      encoding: 'utf-8'
    };
  }

  async getFileSize(path: string): Promise<number> {
    if (!this.connection) throw new Error('Not connected');

    const response = await this.makeRequest({
      method: 'HEAD',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file size: ${response.status}`);
    }

    const contentLength = response.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.connection) throw new Error('Not connected');

    const binaryData = await this.makeRequestBinary({
      method: 'GET',
      url: this.buildUrl(path),
      headers: {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    });

    return new Blob([binaryData], { type: 'application/octet-stream' });
  }

  async downloadFileWithProgress(path: string, filename: string): Promise<string> {
    if (!this.connection) throw new Error('Not connected');

    return await this.downloadWithProgress(
      'GET',
      this.buildUrl(path),
      filename,
      {
        'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`
      }
    );
  }

  private buildUrl(path: string): string {
    if (!this.connection) throw new Error('Not connected');

    if (path.startsWith('http')) return path;
    const baseUrl = this.connection.url.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async detectServerCapabilities(): Promise<void> {
    if (!this.connection) return;

    try {
      const webdavTest = await this.makeRequest({
        method: 'PROPFIND',
        url: this.connection.url,
        headers: {
          'Authorization': `Basic ${btoa(`${this.connection.username}:${this.connection.password}`)}`,
          'Depth': '1',
        },
        body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>'
      });

      const contentType = webdavTest.headers['content-type'] || '';
      const isWebDAVResponse = (webdavTest.status >= 200 && webdavTest.status < 300) &&
                               (contentType.includes('xml') || webdavTest.body.trim().startsWith('<?xml'));

      if (isWebDAVResponse) {
        this.serverCapabilities = {
          supportsWebDAV: true,
          preferredMethod: 'PROPFIND',
          lastDetected: Date.now(),
          supportsPagination: false,
        };
        console.log('WebDAV server detected - using PROPFIND method');
      } else {
        this.serverCapabilities = {
          supportsWebDAV: false,
          preferredMethod: 'GET',
          lastDetected: Date.now(),
          supportsPagination: false,
        };
        console.log('Non-WebDAV server detected - using GET method');
      }
    } catch (error) {
      console.warn('PROPFIND test failed, will auto-detect on first directory request:', error);
      this.serverCapabilities = {
        supportsWebDAV: false,
        preferredMethod: 'AUTO',
        lastDetected: Date.now(),
        supportsPagination: false,
      };
    }
  }

  private resetServerCapabilities(): void {
    this.serverCapabilities = {
      supportsWebDAV: false,
      preferredMethod: 'AUTO',
      lastDetected: 0,
      supportsPagination: false,
    };
  }

  private parseDirectoryListing(xmlBody: string, currentPath: string): StorageFile[] {
    // 简化的 WebDAV XML 解析
    // 在实际项目中，这里会复用现有的解析器
    const files: StorageFile[] = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlBody, 'text/xml');
      const responses = doc.getElementsByTagName('response');

      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        const href = response.getElementsByTagName('href')[0]?.textContent || '';

        // 跳过当前目录
        if (href === currentPath || href === currentPath + '/') continue;

        const filename = decodeURIComponent(href.split('/').pop() || '');
        if (!filename) continue;

        // 检查是否为目录
        const resourceType = response.getElementsByTagName('resourcetype')[0];
        const isDirectory = resourceType?.getElementsByTagName('collection').length > 0;

        // 获取文件大小
        const sizeElement = response.getElementsByTagName('getcontentlength')[0];
        const size = sizeElement ? parseInt(sizeElement.textContent || '0') : 0;

        // 获取修改时间
        const lastModElement = response.getElementsByTagName('getlastmodified')[0];
        const lastmod = lastModElement?.textContent || new Date().toISOString();

        files.push({
          filename,
          basename: filename,
          lastmod,
          size,
          type: isDirectory ? 'directory' : 'file',
          mime: isDirectory ? 'httpd/unix-directory' : 'application/octet-stream',
          etag: '',
        });
      }
    } catch (error) {
      console.error('Failed to parse WebDAV XML response:', error);
    }

    return files;
  }

  private parseHTMLDirectoryListing(htmlBody: string, _currentPath: string): StorageFile[] {
    // 简化的 HTML 目录列表解析
    // 在实际项目中，这里会复用现有的解析器
    const files: StorageFile[] = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlBody, 'text/html');
      const links = doc.getElementsByTagName('a');

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const href = link.getAttribute('href') || '';
        const filename = link.textContent || '';

        // 跳过父目录和当前目录
        if (href === '../' || href === './' || !filename) continue;

        const isDirectory = href.endsWith('/');
        const cleanFilename = isDirectory ? filename.replace('/', '') : filename;

        files.push({
          filename: cleanFilename,
          basename: cleanFilename,
          lastmod: new Date().toISOString(),
          size: 0, // HTML 列表通常不包含大小信息
          type: isDirectory ? 'directory' : 'file',
          mime: isDirectory ? 'httpd/unix-directory' : 'application/octet-stream',
          etag: '',
        });
      }
    } catch (error) {
      console.error('Failed to parse HTML directory listing:', error);
    }

    return files;
  }

  // 获取服务器能力（用于调试和优化）
  getServerCapabilities(): ServerCapabilities {
    return { ...this.serverCapabilities };
  }
}

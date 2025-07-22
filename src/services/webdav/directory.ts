import { WebDAVFile } from '../../types';
import { WebDAVClient } from './client';
import { WebDAVDirectoryParser } from './parser';
import { WebDAVServerCapabilities } from './types';

export class WebDAVDirectoryService {
  private client: WebDAVClient;
  private parser: WebDAVDirectoryParser;
  private serverCapabilities: WebDAVServerCapabilities = {
    supportsWebDAV: false,
    preferredMethod: 'AUTO',
    lastDetected: 0
  };

  constructor(client: WebDAVClient) {
    this.client = client;
    this.parser = new WebDAVDirectoryParser();
  }

  setServerCapabilities(capabilities: WebDAVServerCapabilities): void {
    this.serverCapabilities = capabilities;
  }

  getServerCapabilities(): WebDAVServerCapabilities {
    return this.serverCapabilities;
  }

  async listDirectory(path: string = ''): Promise<WebDAVFile[]> {
    console.log(`列出目录: ${path}, 当前策略: ${this.serverCapabilities.preferredMethod}`);

    try {
      // 根据服务器能力选择请求方法
      switch (this.serverCapabilities.preferredMethod) {
        case 'PROPFIND':
          return await this.listDirectoryWithPROPFIND(path);

        case 'GET':
          return await this.listDirectoryWithGET(path);

        case 'AUTO':
        default:
          // 自动检测：先尝试 PROPFIND，失败则降级到 GET
          return await this.listDirectoryWithAutoDetection(path);
      }
    } catch (error) {
      console.error('Directory listing completely failed:', error);
      throw error;
    }
  }

  private async listDirectoryWithAutoDetection(path: string): Promise<WebDAVFile[]> {
    console.log('开始自动检测服务器能力...');

    try {
      // 先尝试 PROPFIND
      const result = await this.listDirectoryWithPROPFIND(path);

      // 成功则标记为支持 WebDAV
      this.serverCapabilities.supportsWebDAV = true;
      this.serverCapabilities.preferredMethod = 'PROPFIND';
      this.serverCapabilities.lastDetected = Date.now();
      console.log('检测结果: 支持 WebDAV PROPFIND');

      return result;
    } catch (propfindError) {
      console.warn('PROPFIND 失败，尝试 GET 方法:', propfindError);

      try {
        const result = await this.listDirectoryWithGET(path);

        // 成功则标记为不支持 WebDAV，使用 GET
        this.serverCapabilities.supportsWebDAV = false;
        this.serverCapabilities.preferredMethod = 'GET';
        this.serverCapabilities.lastDetected = Date.now();
        console.log('检测结果: 不支持 WebDAV，使用 GET');

        return result;
      } catch (getError) {
        console.error('GET 方法也失败:', getError);
        throw getError;
      }
    }
  }

  private async listDirectoryWithPROPFIND(path: string): Promise<WebDAVFile[]> {
    const response = await this.client.makeRequest('PROPFIND', path, {
      'Depth': '1',
    }, '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/><getcontentlength/><getlastmodified/></prop></propfind>');

    if (response.status === 405) {
      // 方法不被允许，服务器不支持 WebDAV
      throw new Error('PROPFIND method not allowed');
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`PROPFIND failed with status: ${response.status}`);
    }

    // 检查响应内容类型
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('xml') && !response.body.trim().startsWith('<?xml')) {
      // 服务器返回了非 XML 响应，可能是 HTML 目录列表
      console.warn('PROPFIND 返回非 XML 响应，尝试解析为 HTML');
      return this.parser.parseHTMLDirectoryListing(response.body);
    }

    // 计算实际请求的URL路径，用于在解析时过滤当前目录
    const actualRequestPath = this.calculateActualRequestPath(path);

    // 解析 XML 响应，传递实际请求的路径用于过滤
    return this.parser.parseDirectoryListing(response.body, actualRequestPath);
  }

  private async listDirectoryWithGET(path: string): Promise<WebDAVFile[]> {
    const response = await this.client.makeRequest('GET', path);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to list directory: ${response.status}`);
    }

    const responseBody = response.body;
    const contentType = response.headers['content-type'] || '';

    // 计算实际请求的URL路径，用于在解析时过滤当前目录
    const actualRequestPath = this.calculateActualRequestPath(path);

    // 检查响应类型并选择合适的解析方法
    if (contentType.includes('xml') || responseBody.trim().startsWith('<?xml')) {
      console.log('GET 响应是 XML，尝试解析为 WebDAV');
      try {
        return this.parser.parseDirectoryListing(responseBody, actualRequestPath);
      } catch (xmlError) {
        console.warn('XML 解析失败，降级到 HTML 解析:', xmlError);
      }
    }

    // 默认使用 HTML 解析
    console.log('解析响应为 HTML 目录列表');
    return this.parser.parseHTMLDirectoryListing(responseBody);
  }

  private calculateActualRequestPath(path: string): string {
    const connection = this.client.getConnection();
    if (!connection) return decodeURIComponent(path);

    let resultPath: string;

    if (path.startsWith('http://') || path.startsWith('https://')) {
      // 绝对URL
      resultPath = new URL(path).pathname;
    } else if (path.startsWith('/')) {
      // 绝对路径
      resultPath = path;
    } else if (path === '') {
      // 空路径，使用base URL的路径
      resultPath = new URL(connection.url).pathname;
    } else {
      // 相对路径
      resultPath = new URL(path, connection.url).pathname;
    }

    // 解码路径以确保与 decodedHref 进行正确比较
    return decodeURIComponent(resultPath);
  }
}

import { FileContent } from '../../types';
import { WebDAVClient } from './client';

export class WebDAVFileService {
  private client: WebDAVClient;

  constructor(client: WebDAVClient) {
    this.client = client;
  }

  async getFileContent(path: string, start?: number, length?: number): Promise<FileContent> {
    const headers: Record<string, string> = {};

    if (start !== undefined && length !== undefined) {
      headers['Range'] = `bytes=${start}-${start + length - 1}`;
    }

    const response = await this.client.makeRequest('GET', path, headers);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    const content = response.body;
    const contentLength = response.headers['content-length'];
    const size = contentLength ? parseInt(contentLength, 10) : content.length;

    return {
      content,
      size,
      encoding: 'utf-8',
    };
  }

  async getFileBlob(path: string): Promise<ArrayBuffer> {
    return await this.client.makeRequestBinary('GET', path);
  }

  async getFileStream(path: string, start?: number, end?: number): Promise<string> {
    const headers: Record<string, string> = {};

    if (start !== undefined && end !== undefined) {
      headers['Range'] = `bytes=${start}-${end}`;
    }

    const response = await this.client.makeRequest('GET', path, headers);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file stream: ${response.status}`);
    }

    return response.body;
  }

  async getFileSize(path: string): Promise<number> {
    const response = await this.client.makeRequest('HEAD', path);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to get file size: ${response.status}`);
    }

    const contentLength = response.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : 0;
  }

  async downloadFile(filePath: string): Promise<Blob> {
    console.log('Starting download for path:', filePath);

    try {
      // First try to get the file as binary data
      console.log('Attempting binary download...');
      const binaryData = await this.client.makeRequestBinary('GET', filePath);
      console.log('Binary download successful, data size:', binaryData.byteLength);
      return new Blob([binaryData], { type: 'application/octet-stream' });
    } catch (error) {
      // Only log the error and check if it's a network/auth error
      console.warn('Binary download failed with error:', error);

      // If it's a 403 error or auth issue, don't try fallback
      if (error instanceof Error && (error.message.includes('403') || error.message.includes('Access denied'))) {
        const errorMessage = `Access denied: Failed to download file. This could be due to:\n1. Incorrect credentials\n2. Insufficient permissions on the server\n3. File is restricted\n\nOriginal error: ${error.message}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }

      // For other errors, try fallback to text method for compatibility
      console.warn('Attempting fallback to text download method...');
      try {
        const response = await this.client.makeRequest('GET', filePath);

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Failed to download file: ${response.status}`);
        }

        console.log('Text download fallback successful');
        // Convert response body string to Blob
        return new Blob([response.body], { type: 'application/octet-stream' });
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }
}

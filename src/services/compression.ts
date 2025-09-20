import { ArchiveInfo, FilePreview } from '../types';
import { commands } from '../types/tauri-commands';
import { StorageServiceManager } from './storage/StorageManager';

export class CompressionService {
  /**
   * 分析压缩文件结构
   */
  static async analyzeArchive(
    url: string,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    const timeoutMs = 30000; // 30秒

    const result = await Promise.race([
      commands.archiveGetFileInfo(url, filename, maxSize || null),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`压缩文件分析超时 (${timeoutMs}ms)`));
        }, timeoutMs);
      }),
    ]);

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 从压缩文件中提取文件预览（使用自定义协议）
   */
  static async extractFilePreviewViaProtocol(
    archivePath: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    // 使用 StorageServiceManager 构建协议URL
    const archiveProtocolUrl = StorageServiceManager.getFileUrl(archivePath);

    // 构建协议URL：protocol://host/path/to/archive.zip?entry=internal/file.txt
    const protocolUrl = `${archiveProtocolUrl}?entry=${encodeURIComponent(entryPath)}`;

    try {
      const response = await fetch(protocolUrl, {
        headers: maxPreviewSize ? { Range: `bytes=0-${maxPreviewSize - 1}` } : {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = new Uint8Array(await response.arrayBuffer());
      const totalSizeHeader = response.headers.get('Content-Range');
      let totalSize = content.length.toString();

      // 解析Content-Range头获取文件总大小
      if (totalSizeHeader) {
        const match = totalSizeHeader.match(/bytes \d+-\d+\/(\d+)/);
        if (match) {
          totalSize = match[1];
        }
      } else {
        // 如果没有Range请求，Content-Length就是文件大小
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
          totalSize = contentLength;
        }
      }

      const isTruncated = maxPreviewSize ? content.length >= maxPreviewSize : false;

      return {
        content,
        is_truncated: isTruncated,
        total_size: totalSize,
        preview_size: content.length,
      } as FilePreview;
    } catch (error) {
      throw new Error(
        `文件预览提取失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

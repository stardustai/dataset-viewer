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

    // 检查 entryPath 是否已经是编码格式，如果是则先解码再重新编码
    let normalizedEntryPath = entryPath;
    try {
      // 尝试解码，如果成功且与原始不同，说明已经编码过
      const decoded = decodeURIComponent(entryPath);
      if (decoded !== entryPath) {
        normalizedEntryPath = decoded;
      }
    } catch {
      // 解码失败，使用原始路径
    }

    // 构建协议URL：protocol://host/path/to/archive.zip?entry=internal/file.txt
    const protocolUrl = `${archiveProtocolUrl}?entry=${encodeURIComponent(normalizedEntryPath)}`;

    try {
      const response = await fetch(protocolUrl, {
        headers: maxPreviewSize ? { Range: `bytes=0-${maxPreviewSize - 1}` } : {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = new Uint8Array(await response.arrayBuffer());
      const totalSizeHeader = response.headers.get('Content-Range');
      // 默认使用已读长度
      let totalSize = content.length.toString();
      let total = content.length;

      // 解析总大小
      if (totalSizeHeader) {
        const match = totalSizeHeader.match(/bytes \d+-\d+\/(\d+)/);
        if (match) {
          totalSize = match[1];
          total = parseInt(match[1], 10);
        }
      } else {
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
          totalSize = contentLength;
          total = parseInt(contentLength, 10);
        }
      }

      // 优先用"总大小 vs 已读大小"判断截断；无法确定总大小时再回退到 maxPreviewSize
      const isTruncated =
        Number.isFinite(total) && total > 0
          ? content.length < total
          : !!maxPreviewSize && content.length >= (maxPreviewSize || 0);

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

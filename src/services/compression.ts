import { ArchiveInfo, FilePreview } from '../types';
import { commands } from '../types/tauri-commands';

export class CompressionService {
  /**
   * 分析压缩文件结构
   */
  static async analyzeArchive(
    url: string,
    headers: Record<string, string>,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    const timeoutMs = 30000; // 30秒

    const result = await Promise.race([
      commands.archiveAnalyze(url, headers, filename, maxSize || null),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`压缩文件分析超时 (${timeoutMs}ms)`));
        }, timeoutMs);
      })
    ]);

    if (result.status === 'error') {
      throw new Error(result.error);
    }

    return result.data;
  }

  /**
   * 从压缩文件中提取文件预览
   */
  static async extractFilePreview(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    const timeoutMs = 30000; // 30秒

    const response = await Promise.race([
      commands.archivePreview(url, headers, filename, entryPath, maxPreviewSize || null, null),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`文件预览提取超时 (${timeoutMs}ms)`));
        }, timeoutMs);
      })
    ]);

    if (response.status === 'error') {
      throw new Error(response.error);
    }

    const result = response.data;

    const content = new Uint8Array(result.content);

    return {
      content,
      is_truncated: result.is_truncated,
      total_size: result.total_size.toString(),
      preview_size: result.preview_size
    } as FilePreview;
  }
}

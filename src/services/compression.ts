import { invoke } from '@tauri-apps/api/core';
import { ArchiveInfo, FilePreview } from '../types';

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
    return await invoke('analyze_archive', {
      url,
      headers,
      filename,
      maxSize,
    });
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
    const result = await invoke('get_file_preview', {
      url,
      headers,
      filename,
      entryPath,
      maxPreviewSize,
    }) as any;
    
    // Convert content to Uint8Array if it's not already
    if (result.content && !(result.content instanceof Uint8Array)) {
      result.content = new Uint8Array(result.content);
    }
    
    return result as FilePreview;
  }
}

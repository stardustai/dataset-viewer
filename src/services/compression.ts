import { invoke } from '@tauri-apps/api/core';
import { ArchiveInfo, FilePreview } from '../types';

interface FilePreviewInvokeResponse {
  content: number[];
  is_truncated: boolean;
  total_size: number;
  preview_size: number;
}

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
    }) as FilePreviewInvokeResponse;
    
    const content = new Uint8Array(result.content);
    
    return {
      content,
      is_truncated: result.is_truncated,
      total_size: result.total_size,
      preview_size: result.preview_size
    } as FilePreview;
  }
}

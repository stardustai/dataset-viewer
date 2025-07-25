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
    return await invoke('get_file_preview', {
      url,
      headers,
      filename,
      entryPath,
      maxPreviewSize,
    });
  }

  /**
   * 智能预览文件
   */
  static async smartPreview(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPath: string
  ): Promise<FilePreview> {
    return await invoke('smart_preview', {
      url,
      headers,
      filename,
      entryPath,
    });
  }

  /**
   * 批量预览多个文件
   */
  static async batchPreview(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPaths: string[],
    maxPreviewSize?: number
  ): Promise<Array<[string, FilePreview | string]>> {
    return await invoke('batch_preview', {
      url,
      headers,
      filename,
      entryPaths,
      maxPreviewSize,
    });
  }

  /**
   * 获取支持的压缩格式列表
   */
  static async getSupportedFormats(): Promise<string[]> {
    return await invoke('get_supported_formats');
  }

  /**
   * 检查文件是否为支持的压缩格式
   */
  static async isSupportedArchive(filename: string): Promise<boolean> {
    return await invoke('is_supported_archive', { filename });
  }

  /**
   * 检查压缩文件是否支持流式读取
   */
  static async isStreamableArchive(filename: string): Promise<boolean> {
    return await invoke('supports_streaming', { filename });
  }

  /**
   * 格式化文件大小
   */
  static async formatFileSize(bytes: number): Promise<string> {
    return await invoke('format_file_size', { bytes });
  }

  /**
   * 获取压缩率
   */
  static async getCompressionRatio(uncompressed: number, compressed: number): Promise<string> {
    return await invoke('get_compression_ratio', { uncompressed, compressed });
  }
}

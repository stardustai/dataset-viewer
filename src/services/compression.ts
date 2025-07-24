import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ArchiveInfo, FilePreview, CompressedFileChunk, CompressedFileEvent } from '../types';

export class CompressionService {
  /**
   * 分析压缩文件结构
   */
  static async analyzeCompressedFile(
    url: string,
    headers: Record<string, string>,
    filename: string,
    maxSize?: number
  ): Promise<ArchiveInfo> {
    return await invoke('analyze_compressed_file', {
      url,
      headers,
      filename,
      maxSize,
    });
  }

  /**
   * 按需加载ZIP文件的详细信息
   */
  static async loadZipFileDetails(
    url: string,
    headers: Record<string, string>,
    filename: string
  ): Promise<ArchiveInfo> {
    return await invoke('load_zip_file_details', {
      url,
      headers,
      filename,
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
    return await invoke('extract_file_preview_from_archive', {
      url,
      headers,
      filename,
      entryPath,
      maxPreviewSize,
    });
  }

  /**
   * 流式读取压缩文件中的文件内容
   */
  static async streamCompressedFile(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPath: string,
    chunkSize?: number,
    onChunk?: (chunk: CompressedFileChunk) => void,
    onComplete?: (event: CompressedFileEvent) => void,
    onError?: (event: CompressedFileEvent) => void
  ): Promise<string> {
    // 设置事件监听器
    const unlisten1 = onChunk ? await listen<CompressedFileChunk>('compressed-file-chunk', (event) => {
      onChunk(event.payload);
    }) : null;

    const unlisten2 = onComplete ? await listen<CompressedFileEvent>('compressed-file-complete', (event) => {
      onComplete(event.payload);
      unlisten1?.();
      unlisten2?.();
      unlisten3?.();
    }) : null;

    const unlisten3 = onError ? await listen<CompressedFileEvent>('compressed-file-error', (event) => {
      onError(event.payload);
      unlisten1?.();
      unlisten2?.();
      unlisten3?.();
    }) : null;

    // 开始流式读取
    const streamId = await invoke<string>('stream_compressed_file', {
      url,
      headers,
      filename,
      entryPath,
      chunkSize,
    });

    return streamId;
  }

  /**
   * 读取压缩文件的指定块
   */
  static async readCompressedFileChunk(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPath: string,
    offset: number,
    chunkSize: number
  ): Promise<{
    content: string;
    is_eof: boolean;
    offset: number;
    bytes_read: number;
  }> {
    return await invoke('read_compressed_file_chunk', {
      url,
      headers,
      filename,
      entryPath,
      offset,
      chunkSize,
    });
  }

  /**
   * 检查文件是否为支持的压缩格式
   */
  static isSupportedArchive(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.zip') ||
           lower.endsWith('.tar') ||
           lower.endsWith('.gz') ||
           lower.endsWith('.tar.gz') ||
           lower.endsWith('.tgz');
  }

  /**
   * 检查压缩文件是否支持流式读取
   */
  static isStreamableArchive(filename: string): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.zip') ||
           lower.endsWith('.gz') ||
           lower.endsWith('.tar.gz') ||
           lower.endsWith('.tgz');
  }

  /**
   * 格式化文件大小
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取压缩率
   */
  static getCompressionRatio(uncompressed: number, compressed: number): string {
    if (compressed === 0) return '0%';
    const ratio = ((uncompressed - compressed) / uncompressed) * 100;
    return `${Math.round(ratio)}%`;
  }
}

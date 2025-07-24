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
    return await invoke('analyze_archive', {
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
    return await invoke('get_file_preview', {
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
    const streamId = await invoke<string>('start_file_stream', {
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
   * 暂停流式读取
   */
  static async pauseStream(streamId: string): Promise<void> {
    return await invoke('pause_stream', { streamId });
  }

  /**
   * 恢复流式读取
   */
  static async resumeStream(streamId: string): Promise<void> {
    return await invoke('resume_stream', { streamId });
  }

  /**
   * 取消流式读取
   */
  static async cancelStream(streamId: string): Promise<void> {
    return await invoke('cancel_stream', { streamId });
  }

  /**
   * 智能预览文件
   */
  static async smartPreview(
    url: string,
    headers: Record<string, string>,
    filename: string,
    entryPath: string,
    maxPreviewSize?: number
  ): Promise<FilePreview> {
    return await invoke('smart_preview', {
      url,
      headers,
      filename,
      entryPath,
      maxPreviewSize,
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

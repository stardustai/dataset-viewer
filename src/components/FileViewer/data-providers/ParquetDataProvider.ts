import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer } from 'hyparquet';
import { commands } from '../../../types/tauri-commands';

export interface DataColumn {
  name: string;
  type: string;
  logicalType?: string;
}

export interface DataMetadata {
  numRows: number;
  numColumns: number;
  columns: DataColumn[];
  fileSize: number;
  sheets?: string[];
}

export interface DataProvider {
  loadMetadata(): Promise<DataMetadata>;
  loadData(offset: number, limit: number, sheetIndex?: number): Promise<Record<string, unknown>[]>;
  switchSheet?(sheetIndex: number): Promise<void>;
}

/**
 * 流式异步缓冲区实现
 * 支持范围请求的文件读取，用于大文件的分块加载
 * 实现 hyparquet 的 AsyncBuffer 接口
 */
class StreamingAsyncBuffer implements AsyncBuffer {
  private filePath: string;
  private _byteLength: number;
  private chunks: Map<string, ArrayBuffer> = new Map();

  constructor(filePath: string, byteLength: number) {
    this.filePath = filePath;
    this._byteLength = byteLength;
  }

  get byteLength(): number {
    return this._byteLength;
  }

  /**
   * 读取指定范围的数据
   * 实现 AsyncBuffer.slice 接口，返回 ArrayBuffer
   */
  async slice(start: number, end?: number): Promise<ArrayBuffer> {
    const actualEnd = end ?? this._byteLength;
    const length = actualEnd - start;

    if (length <= 0) {
      return new ArrayBuffer(0);
    }

    // 生成缓存键
    const cacheKey = `${start}-${actualEnd}`;

    // 检查缓存
    if (this.chunks.has(cacheKey)) {
      return this.chunks.get(cacheKey)!;
    }

    try {
      // 使用后端的分块读取 API
      const result = await commands.storageGetFileContent(
        this.filePath,
        start.toString(),
        length.toString()
      );

      if (result.status === 'error') {
        throw new Error(`Failed to read file range ${start}-${actualEnd}: ${result.error}`);
      }

      const uint8Array = new Uint8Array(result.data);
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength
      );

      // 缓存读取的数据块（限制缓存大小以避免内存溢出）
      if (this.chunks.size < 50) { // 最多缓存50个块
        this.chunks.set(cacheKey, arrayBuffer);
      }

      return arrayBuffer;
    } catch (error) {
      console.error(`Failed to read file range ${start}-${actualEnd}:`, error);
      throw error;
    }
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.chunks.clear();
  }
}

/**
 * 流式 Parquet 数据提供器
 * 使用分块加载技术处理所有 Parquet 文件，避免内存溢出
 */
export class ParquetDataProvider implements DataProvider {
  private filePath: string;
  private fileSize: number;
  private streamingBuffer: StreamingAsyncBuffer | null = null;
  private metadata: DataMetadata | null = null;
  private parquetMetadata: any = null;

  constructor(filePath: string, fileSize: number) {
    this.filePath = filePath;
    this.fileSize = fileSize;
  }

  private async getStreamingBuffer(): Promise<StreamingAsyncBuffer> {
    if (!this.streamingBuffer) {
      this.streamingBuffer = new StreamingAsyncBuffer(this.filePath, this.fileSize);
    }
    return this.streamingBuffer;
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    const buffer = await this.getStreamingBuffer();

    // 读取 Parquet 元数据
    this.parquetMetadata = await parquetMetadataAsync(buffer);
    const numRows = Number(this.parquetMetadata.num_rows);
    const schema = this.parquetMetadata.schema;

    const columns: DataColumn[] = [];
    if (schema && schema.length > 1) {
      // 跳过根schema节点
      for (let i = 1; i < schema.length; i++) {
        const field = schema[i];
        if (field.name) {
          columns.push({
            name: field.name,
            type: field.type || 'UNKNOWN',
            logicalType: field.logical_type ? JSON.stringify(field.logical_type) : undefined,
          });
        }
      }
    }

    this.metadata = {
      numRows,
      numColumns: columns.length,
      columns,
      fileSize: this.fileSize,
    };

    return this.metadata;
  }

  async loadData(offset: number, limit: number): Promise<Record<string, unknown>[]> {
    if (!this.parquetMetadata) {
      await this.loadMetadata(); // 确保元数据已加载
    }

    const buffer = await this.getStreamingBuffer();

    try {
      // 使用 hyparquet 的分块读取功能，利用流式缓冲区
      const result = await parquetReadObjects({
        file: buffer,
        rowStart: offset,
        rowEnd: offset + limit,
      });

      console.log(`Streaming Parquet: Loaded ${result.length} rows (${offset}-${offset + limit}) using chunked buffer`);

      return result as Record<string, unknown>[];
    } catch (error) {
      console.error('Error loading data with streaming approach:', error);
      throw error;
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.streamingBuffer) {
      this.streamingBuffer.clearCache();
      this.streamingBuffer = null;
    }
    this.metadata = null;
    this.parquetMetadata = null;
  }
}

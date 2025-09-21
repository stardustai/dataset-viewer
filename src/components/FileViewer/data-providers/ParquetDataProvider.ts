import { parquetMetadataAsync, parquetReadObjects, type AsyncBuffer } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
// import { commands } from '../../../types/tauri-commands';

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
  private protocolUrl: string;
  private _byteLength: number;
  private chunks: Map<string, ArrayBuffer> = new Map();

  constructor(protocolUrl: string, byteLength: number) {
    this.protocolUrl = protocolUrl;
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
    // 边界校验和裁剪
    const from = Math.max(0, Math.min(start, this._byteLength));
    const to = Math.min(end ?? this._byteLength, this._byteLength);
    const length = to - from;

    if (length <= 0) {
      return new ArrayBuffer(0);
    }

    // 生成缓存键
    const cacheKey = `${from}-${to}`;

    // 检查缓存
    if (this.chunks.has(cacheKey)) {
      return this.chunks.get(cacheKey)!;
    }

    try {
      // 直接使用 fetch 和协议 URL 获取文件数据
      let response: Response;

      if (length < this._byteLength) {
        // 范围请求
        const rangeHeader = `bytes=${from}-${to - 1}`;
        response = await fetch(this.protocolUrl, {
          method: 'GET',
          headers: {
            Range: rangeHeader,
          },
        });
      } else {
        // 完整文件请求
        response = await fetch(this.protocolUrl, {
          method: 'GET',
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // 缓存读取的数据块（限制缓存大小以避免内存溢出）
      if (this.chunks.size < 50) {
        // 最多缓存50个块
        this.chunks.set(cacheKey, arrayBuffer);
      }

      return arrayBuffer;
    } catch (error) {
      console.error(`Failed to read file range ${from}-${to}:`, error);
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
  private protocolUrl: string;
  private fileSize: number;
  private metadata: any = null;
  private streamingBuffer: StreamingAsyncBuffer | null = null;
  private parquetMetadata: any = null;

  constructor(protocolUrl: string, fileSize: number) {
    this.protocolUrl = protocolUrl;
    this.fileSize = fileSize;
  }

  private async getStreamingBuffer(): Promise<StreamingAsyncBuffer> {
    if (!this.streamingBuffer) {
      this.streamingBuffer = new StreamingAsyncBuffer(this.protocolUrl, this.fileSize);
    }
    return this.streamingBuffer;
  }

  /**
   * 处理BigInt和其他特殊数据类型
   */
  private processDataValues(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.map(row => {
      const processedRow: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          // 保持BigInt类型，让DataTableCell处理显示
          processedRow[key] = value;
        } else if (value instanceof Date) {
          // 保持Date类型
          processedRow[key] = value;
        } else if (value === null || value === undefined) {
          // 保持null/undefined
          processedRow[key] = value;
        } else if (typeof value === 'object' && value !== null) {
          try {
            // 对于复杂对象，检查是否包含BigInt
            const hasSpecialTypes = this.containsSpecialTypes(value);
            if (hasSpecialTypes) {
              // 如果包含特殊类型，保持原对象结构让DataTableCell处理
              processedRow[key] = value;
            } else {
              processedRow[key] = value;
            }
          } catch (error) {
            // 如果处理失败，保持原值
            processedRow[key] = value;
          }
        } else {
          // 其他类型保持不变
          processedRow[key] = value;
        }
      }

      return processedRow;
    });
  }

  /**
   * 检查对象是否包含特殊类型（BigInt, Symbol, Function等）
   */
  private containsSpecialTypes(obj: any): boolean {
    if (typeof obj === 'bigint' || typeof obj === 'symbol' || typeof obj === 'function') {
      return true;
    }

    if (Array.isArray(obj)) {
      return obj.some(item => this.containsSpecialTypes(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.values(obj).some(value => this.containsSpecialTypes(value));
    }

    return false;
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

    // 边界校验和裁剪
    const totalRows = this.metadata?.numRows || 0;
    const validOffset = Math.max(0, Math.min(offset, totalRows));
    const validLimit = limit <= 0 ? 0 : Math.min(limit, totalRows - validOffset);

    if (validLimit <= 0) {
      return [];
    }

    const buffer = await this.getStreamingBuffer();

    try {
      // 使用 hyparquet 的分块读取功能，利用流式缓冲区
      const result = await parquetReadObjects({
        file: buffer,
        rowStart: validOffset,
        rowEnd: validOffset + validLimit,
        compressors, // 添加压缩器支持
      });

      console.debug(
        `Streaming Parquet: Loaded ${result.length} rows (${validOffset}-${validOffset + validLimit}) using chunked buffer`
      );

      // 处理特殊数据类型
      const processedResult = this.processDataValues(result as Record<string, unknown>[]);

      return processedResult;
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

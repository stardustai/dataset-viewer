import { DataProvider, DataMetadata, DataColumn } from './ParquetDataProvider';
import Papa from 'papaparse';
import { useStorageStore } from '../../../stores/storageStore';

/**
 * CSV streaming buffer implementation
 * Reads and parses CSV files in 1MB chunks sequentially
 * Uses Papa Parse incremental parsing to handle CSV record boundaries correctly
 */
class CsvStreamingBuffer {
  private protocolUrl: string;
  private fileSize: number;
  private readonly chunkSize = 1024 * 1024; // 1MB chunk size
  private headerText: string = '';
  private columns: string[] = [];
  private nextReadOffset = 0; // Next file read position
  private isFileCompletelyLoaded = false; // Whether file is completely loaded
  private allRows: string[][] = []; // Store all loaded rows
  private loadedChunks = 0; // Number of chunks loaded
  private partialBuffer = ''; // Buffer for incomplete records from previous chunk

  constructor(protocolUrl: string, fileSize: number) {
    this.protocolUrl = protocolUrl;
    this.fileSize = fileSize;
  }

  /**
   * 初始化，读取文件头获取列信息，并处理第一个分块
   */
  async initialize(): Promise<void> {
    if (this.headerText) {
      return; // 已经初始化过了
    }

    console.debug(`CSV initializing: reading first chunk from ${this.protocolUrl}`);

    // 读取第一个分块以获取标题和初始数据
    await this.loadNextChunk();

    console.debug(
      `CSV initialized: ${this.columns.length} columns, ${this.allRows.length} initial rows`
    );
  }

  /**
   * 确保加载到指定行数的数据
   */
  async ensureDataLoaded(requiredRows: number): Promise<void> {
    await this.initialize();

    // 如果已经有足够的数据或文件已完全加载，直接返回
    if (this.allRows.length >= requiredRows || this.isFileCompletelyLoaded) {
      return;
    }

    console.debug(
      `CSV ensuring data loaded: current ${this.allRows.length} rows, required ${requiredRows} rows`
    );

    // 继续加载分块直到有足够的数据
    while (this.allRows.length < requiredRows && !this.isFileCompletelyLoaded) {
      const newRows = await this.loadNextChunk();
      if (newRows.length === 0) {
        break; // 没有更多数据
      }
    }

    console.debug(
      `CSV data loaded: ${this.allRows.length} total rows, file complete: ${this.isFileCompletelyLoaded}`
    );
  }

  /**
   * 加载下一个分块
   */
  private async loadNextChunk(): Promise<string[][]> {
    if (this.nextReadOffset >= this.fileSize || this.isFileCompletelyLoaded) {
      console.debug('CSV file completely loaded, no more data to read');
      return [];
    }

    // 计算本次读取的长度
    const remainingBytes = this.fileSize - this.nextReadOffset;
    const readLength = Math.min(this.chunkSize, remainingBytes);

    console.debug(
      `CSV loading chunk ${this.loadedChunks}: offset ${this.nextReadOffset}, length ${readLength}`
    );

    // 读取数据
    const store = useStorageStore.getState();
    const fileContent = await store.getFileContent(this.protocolUrl, {
      start: this.nextReadOffset,
      length: readLength,
    });

    // 拼接上次的残留数据
    let textToProcess = this.partialBuffer + fileContent.content;
    this.partialBuffer = '';

    const newRows: string[][] = [];
    let isFirstChunk = this.loadedChunks === 0;
    let headerProcessed = false;

    return new Promise<string[][]>((resolve, reject) => {
      Papa.parse(textToProcess, {
        step: (result, parser) => {
          if (result.errors.length > 0) {
            // 检查是否是因为不完整的行导致的错误
            const incompleteError = result.errors.some(
              error => error.message.includes('Unexpected') || error.message.includes('Unclosed')
            );

            if (incompleteError && this.nextReadOffset + readLength < this.fileSize) {
              // 这可能是不完整的行，停止解析并保存残留
              parser.abort();
              return;
            }
          }

          if (result.data && Array.isArray(result.data) && result.data.length > 0) {
            const row = result.data as string[];

            // 处理标题行（仅第一个分块）
            if (isFirstChunk && !headerProcessed) {
              this.columns = row;
              this.headerText = row.join(',');
              headerProcessed = true;
              return;
            }

            // 过滤掉空行
            if (row.some(cell => cell && cell.trim() !== '')) {
              newRows.push(row);
            }
          }
        },
        complete: results => {
          // 检查是否有残留的未解析内容
          if (results.meta.cursor && results.meta.cursor < textToProcess.length) {
            this.partialBuffer = textToProcess.substring(results.meta.cursor);
            console.debug(
              `CSV chunk ${this.loadedChunks}: saved ${this.partialBuffer.length} bytes to partial buffer`
            );
          }

          console.debug(
            `CSV chunk ${this.loadedChunks} parsed: ${newRows.length} rows, partial buffer: ${this.partialBuffer.length} bytes`
          );

          // 添加到总行数组
          this.allRows.push(...newRows);

          // 更新状态
          this.nextReadOffset += readLength;
          this.loadedChunks++;

          // Check if entire file has been read
          if (this.nextReadOffset >= this.fileSize) {
            // 处理最后的残留数据
            if (this.partialBuffer.trim()) {
              const finalResult = Papa.parse<string[]>(this.partialBuffer, {
                skipEmptyLines: true,
                header: false,
              });

              if (finalResult.data && finalResult.data.length > 0) {
                const finalRows = finalResult.data.filter(
                  row => row.length > 0 && row.some(cell => cell && cell.trim() !== '')
                );
                this.allRows.push(...finalRows);
                newRows.push(...finalRows);
                console.debug(
                  `CSV final chunk: added ${finalRows.length} rows from partial buffer`
                );
              }
            }

            this.isFileCompletelyLoaded = true;
            console.debug(
              `CSV file loading completed. Total chunks: ${this.loadedChunks}, Total rows: ${this.allRows.length}`
            );
          }

          resolve(newRows);
        },
        error: (error: unknown) => {
          console.error('CSV parsing error:', error);
          reject(error);
        },
        header: false,
        skipEmptyLines: true,
        encoding: 'UTF-8',
      });
    });
  }

  /**
   * 获取指定范围的行数据
   */
  async getRows(startRow: number, limit: number): Promise<string[][]> {
    await this.initialize();

    if (limit <= 0) {
      return [];
    }

    // 确保加载到所需的行数
    const requiredRows = startRow + limit;
    await this.ensureDataLoaded(requiredRows);

    // 从缓存的数据中提取指定范围
    const endRow = Math.min(startRow + limit, this.allRows.length);
    const result = this.allRows.slice(startRow, endRow);

    console.debug(
      `CSV getRows: returned ${result.length} rows from range ${startRow}-${endRow} (total cached: ${this.allRows.length})`
    );
    return result;
  }

  /**
   * 重置读取状态，从头开始（这个方法现在不应该被调用）
   */
  private resetReading(): void {
    this.nextReadOffset = 0;
    this.isFileCompletelyLoaded = false;
    this.allRows = [];
    this.loadedChunks = 0;
    this.headerText = '';
    this.columns = [];
    this.partialBuffer = '';
    console.debug('CSV reading state reset');
  }

  /**
   * Get current loaded row count
   */
  async getLoadedRowCount(): Promise<number> {
    await this.initialize();
    return this.allRows.length;
  }

  /**
   * 获取列信息
   */
  getColumns(): string[] {
    return this.columns;
  }

  /**
   * 检查是否还有更多数据可以加载
   */
  hasMoreData(): boolean {
    return !this.isFileCompletelyLoaded && this.nextReadOffset < this.fileSize;
  }

  /**
   * 获取当前已加载的行数
   */
  getTotalRowsLoaded(): number {
    return this.allRows.length;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.allRows = [];
    this.resetReading();
  }

  /**
   * 获取文件大小
   */
  getFileSize(): number {
    return this.fileSize;
  }
}

export class CsvDataProvider implements DataProvider {
  private filePath: string;
  private fileSize: number;
  private metadata: DataMetadata | null = null;
  private streamingBuffer: CsvStreamingBuffer | null = null;

  constructor(filePath: string, fileSize: number) {
    this.filePath = filePath;
    this.fileSize = fileSize;
  }

  private async getStreamingBuffer(): Promise<CsvStreamingBuffer> {
    if (!this.streamingBuffer) {
      const store = useStorageStore.getState();
      const url = store.getFileUrl(this.filePath);
      this.streamingBuffer = new CsvStreamingBuffer(url, this.fileSize);
    }
    return this.streamingBuffer;
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      const buffer = await this.getStreamingBuffer();
      await buffer.initialize();

      const columns: DataColumn[] = buffer.getColumns().map((header, index) => ({
        name: header || `Column ${index + 1}`,
        type: 'string', // 暂时设为字符串类型
      }));

      // Get current loaded row count
      const numRows = await buffer.getLoadedRowCount();

      this.metadata = {
        numRows: Math.max(0, numRows),
        numColumns: columns.length,
        columns,
        fileSize: this.fileSize,
      };

      return this.metadata;
    } catch (error) {
      console.error('Error loading CSV metadata:', error);
      throw error;
    }
  }

  async loadData(offset: number, limit: number): Promise<Record<string, unknown>[]> {
    try {
      if (!this.metadata) {
        await this.loadMetadata();
      }

      if (!this.metadata || this.metadata.numColumns === 0) {
        return [];
      }

      const buffer = await this.getStreamingBuffer();

      // 边界校验
      const validOffset = Math.max(0, offset);
      const validLimit = Math.max(0, limit);

      if (validLimit === 0) {
        return [];
      }

      console.debug(
        `CSV loading: rows ${validOffset}-${validOffset + validLimit} for ${this.filePath}`
      );

      // 使用分块读取
      const rows = await buffer.getRows(validOffset, validLimit);

      return this.convertRowsToObjects(rows);
    } catch (error) {
      console.error('Error loading CSV data:', error);
      throw error;
    }
  }

  /**
   * 将行数组转换为对象数组
   */
  private convertRowsToObjects(rows: string[][]): Record<string, unknown>[] {
    if (!this.metadata || rows.length === 0) {
      return [];
    }

    const columns = this.metadata.columns;
    return rows.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        const rawValue = row[index];
        obj[column.name] = this.parseValue(rawValue);
      });
      return obj;
    });
  }

  private parseValue(value: string | undefined): unknown {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const trimmedValue = value.trim();

    // 布尔值处理
    const lowerValue = trimmedValue.toLowerCase();
    if (lowerValue === 'true') return true;
    if (lowerValue === 'false') return false;

    // 数字处理
    if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
      return Number(trimmedValue);
    }

    return trimmedValue;
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

    console.debug(`CSV provider disposed for ${this.filePath}`);
  }
}

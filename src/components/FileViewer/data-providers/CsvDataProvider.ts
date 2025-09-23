import { DataProvider, DataMetadata, DataColumn } from './ParquetDataProvider';
import Papa from 'papaparse';
import { useStorageStore } from '../../../stores/storageStore';

/**
 * CSV streaming buffer implementation
 * Reads and parses CSV files in 1MB chunks sequentially
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

    // 读取第一个 1MB 分块
    const store = useStorageStore.getState();
    const requestLength = Math.min(this.chunkSize, this.fileSize);
    const fileContent = await store.getFileContent(this.protocolUrl, {
      start: 0,
      length: requestLength,
    });

    let text = fileContent.content;
    let textEndOffset = text.length; // 实际处理的文本结束位置

    // 处理第一个分块的边界（如果不是整个文件）
    if (text.length === this.chunkSize && this.fileSize > this.chunkSize && !text.endsWith('\n')) {
      const lastNewlineIndex = text.lastIndexOf('\n');
      if (lastNewlineIndex !== -1) {
        text = text.substring(0, lastNewlineIndex + 1);
        textEndOffset = lastNewlineIndex + 1;
        console.debug(
          `CSV init: truncated first chunk from ${this.chunkSize} to ${textEndOffset} bytes`
        );
      }
    }

    // 找到第一个换行符，获取标题行
    const firstNewlineIndex = text.indexOf('\n');
    if (firstNewlineIndex === -1) {
      throw new Error('CSV file appears to have no line breaks');
    }

    const headerLine = text.substring(0, firstNewlineIndex);
    const parseResult = Papa.parse<string[]>(headerLine, { header: false });
    this.columns = parseResult.data[0] || [];
    this.headerText = headerLine;

    // 解析第一个分块的数据部分（跳过标题行）
    const dataText = text.substring(firstNewlineIndex + 1);
    if (dataText.trim()) {
      const dataParseResult = Papa.parse<string[]>(dataText, {
        skipEmptyLines: true,
        header: false,
      });

      let rows = dataParseResult.data;
      // 过滤掉空行
      rows = rows.filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));

      console.debug(`CSV init: parsed ${rows.length} data rows from first chunk`);
      this.allRows.push(...rows);
    }

    // 设置下次读取的位置 - 关键修复：使用实际的字节偏移
    this.nextReadOffset = textEndOffset;
    this.loadedChunks = 1;

    console.debug(
      `CSV initialized: ${this.columns.length} columns, ${this.allRows.length} initial rows, next offset: ${this.nextReadOffset}`
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

    let text = fileContent.content;
    let actualBytesConsumed = readLength;

    // 处理分块边界：如果不是文件末尾且末尾不是换行符，需要找到最后一个完整行
    if (this.nextReadOffset + readLength < this.fileSize && !text.endsWith('\n')) {
      const lastNewlineIndex = text.lastIndexOf('\n');
      if (lastNewlineIndex !== -1) {
        // 截断到最后一个完整行
        text = text.substring(0, lastNewlineIndex + 1);
        actualBytesConsumed = lastNewlineIndex + 1;
        console.debug(
          `CSV chunk boundary: truncated from ${readLength} to ${actualBytesConsumed} bytes`
        );
      }
    }

    // 解析 CSV 数据
    const parseResult = Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      header: false,
    });

    let rows = parseResult.data;

    // 过滤掉空行
    rows = rows.filter(row => row.length > 0 && row.some(cell => cell.trim() !== ''));

    // 如果这不是第一个分块，需要处理可能的重复行
    if (this.loadedChunks > 0 && rows.length > 0) {
      // 检查第一行是否可能是上个分块的不完整行的延续
      // 简单策略：如果第一行列数不匹配，就跳过
      if (this.columns.length > 0 && rows[0].length !== this.columns.length) {
        console.debug(`CSV chunk: skipping potentially incomplete first row`);
        rows = rows.slice(1);
      }
    }

    console.debug(
      `CSV chunk ${this.loadedChunks} parsed: ${rows.length} rows from ${text.length} bytes, next offset will be: ${this.nextReadOffset + actualBytesConsumed}`
    );

    // 添加到总行数组
    this.allRows.push(...rows);

    // 更新状态 - 关键：确保下次从正确位置开始读取
    this.nextReadOffset += actualBytesConsumed;
    this.loadedChunks++;

    // Check if entire file has been read
    if (this.nextReadOffset >= this.fileSize) {
      this.isFileCompletelyLoaded = true;
      console.debug(
        `CSV file loading completed. Total chunks: ${this.loadedChunks}, Total rows: ${this.allRows.length}`
      );
    }

    return rows;
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
      this.streamingBuffer = new CsvStreamingBuffer(this.filePath, this.fileSize);
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

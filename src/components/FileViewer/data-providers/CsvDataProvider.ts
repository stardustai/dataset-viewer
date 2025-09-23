import { DataProvider, DataMetadata, DataColumn } from './ParquetDataProvider';
import Papa from 'papaparse';
import { useStorageStore } from '../../../stores/storageStore';

/**
 * CSV 流式缓冲区实现
 * 支持分块读取 CSV 文件，用于大文件的流式加载
 */
class CsvStreamingBuffer {
  private protocolUrl: string;
  private fileSize: number;
  private chunks: Map<string, { text: string; encoding: string }> = new Map();

  constructor(protocolUrl: string, fileSize: number) {
    this.protocolUrl = protocolUrl;
    this.fileSize = fileSize;
  }

  /**
   * 读取指定范围的文本数据
   * @param start 起始字节位置
   * @param length 读取长度（字节）
   * @returns Promise<string> 文本内容
   */
  async readTextRange(start: number, length?: number): Promise<string> {
    // 边界校验
    const from = Math.max(0, Math.min(start, this.fileSize));
    const actualLength = length ? Math.min(length, this.fileSize - from) : this.fileSize - from;
    const to = from + actualLength;

    if (actualLength <= 0) {
      return '';
    }

    // 生成缓存键
    const cacheKey = `${from}-${to}`;

    // 检查缓存
    if (this.chunks.has(cacheKey)) {
      return this.chunks.get(cacheKey)!.text;
    }

    try {
      // 使用 storageStore 进行范围读取
      const store = useStorageStore.getState();
      const fileContent = await store.getFileContent(this.protocolUrl, {
        start: from,
        length: actualLength,
      });

      const text = fileContent.content;

      // 缓存读取的数据块（限制缓存大小以避免内存溢出）
      if (this.chunks.size < 50) {
        // 最多缓存50个块
        this.chunks.set(cacheKey, { text, encoding: fileContent.encoding });
      }

      return text;
    } catch (error) {
      console.error(`Failed to read CSV text range ${from}-${to}:`, error);
      throw error;
    }
  }

  /**
   * 读取文件头部数据用于元数据分析
   * @param maxBytes 最大读取字节数，默认 8KB
   * @returns Promise<string> 头部文本内容
   */
  async readHeader(maxBytes: number = 8192): Promise<string> {
    const length = Math.min(maxBytes, this.fileSize);
    return this.readTextRange(0, length);
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.chunks.clear();
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
  private cachedParsedChunks: Map<string, string[][]> = new Map();
  private lastAccessTime: Map<string, number> = new Map();
  private readonly maxCacheSize = 20;
  private readonly maxSmallFileSize = 1024 * 1024; // 1MB

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

  /**
   * 清理过期的缓存项
   */
  private cleanupCache(): void {
    if (this.cachedParsedChunks.size <= this.maxCacheSize) {
      return;
    }

    // 按照最后访问时间排序，移除最旧的项
    const entries = Array.from(this.lastAccessTime.entries());
    entries.sort((a, b) => a[1] - b[1]);

    // 移除一半的最旧项
    const itemsToRemove = Math.ceil(this.cachedParsedChunks.size / 2);
    for (let i = 0; i < itemsToRemove; i++) {
      const [key] = entries[i];
      this.cachedParsedChunks.delete(key);
      this.lastAccessTime.delete(key);
    }

    console.debug(
      `CSV cache cleanup: removed ${itemsToRemove} items, ${this.cachedParsedChunks.size} remaining`
    );
  }

  /**
   * 更新缓存访问时间
   */
  private updateCacheAccess(key: string): void {
    this.lastAccessTime.set(key, Date.now());
  }

  /**
   * 解析 CSV 文本块并返回行数组
   */
  private parseCsvChunk(text: string, isFirstChunk: boolean = false): string[][] {
    if (!text) return [];

    try {
      const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
        header: false,
      });

      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }

      let rows = parseResult.data;

      // 如果不是第一个块，移除第一行（可能是不完整的行）
      if (!isFirstChunk && rows.length > 0) {
        rows = rows.slice(1);
      }

      return rows;
    } catch (error) {
      console.error('Error parsing CSV chunk:', error);
      return [];
    }
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      const buffer = await this.getStreamingBuffer();

      // 只读取文件头部来获取列信息和推断数据类型
      const headerText = await buffer.readHeader(8192); // 读取前8KB

      if (!headerText) {
        this.metadata = {
          numRows: 0,
          numColumns: 0,
          columns: [],
          fileSize: this.fileSize,
        };
        return this.metadata;
      }

      // 解析头部获取列信息
      const headerLines = headerText.split('\n').filter(line => line.trim());
      if (headerLines.length === 0) {
        this.metadata = {
          numRows: 0,
          numColumns: 0,
          columns: [],
          fileSize: this.fileSize,
        };
        return this.metadata;
      }

      // 解析第一行作为列名
      const parseResult = Papa.parse<string[]>(headerLines[0], {
        header: false,
      });

      const headerRow = parseResult.data[0] || [];
      const columns: DataColumn[] = headerRow.map((header, index) => ({
        name: header || `Column ${index + 1}`,
        type: 'string', // 暂时设为字符串，后续可以通过采样推断类型
      }));

      // 估算总行数（基于文件大小和平均行长度）
      const avgLineLength = Math.max(headerText.length / headerLines.length, 50);
      const estimatedRows = Math.floor(this.fileSize / avgLineLength) - 1; // 减去标题行

      this.metadata = {
        numRows: Math.max(0, estimatedRows),
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

      // 对于大文件，使用流式加载策略
      if (this.fileSize > this.maxSmallFileSize) {
        return this.loadDataStreaming(buffer, offset, limit);
      } else {
        // 小文件直接加载全部内容
        return this.loadDataComplete(buffer, offset, limit);
      }
    } catch (error) {
      console.error('Error loading CSV data:', error);
      throw error;
    }
  }

  /**
   * 流式加载数据（用于大文件）
   */
  private async loadDataStreaming(
    buffer: CsvStreamingBuffer,
    offset: number,
    limit: number
  ): Promise<Record<string, unknown>[]> {
    // 生成缓存键
    const cacheKey = `${offset}-${limit}`;

    // 检查缓存
    if (this.cachedParsedChunks.has(cacheKey)) {
      this.updateCacheAccess(cacheKey);
      const cachedRows = this.cachedParsedChunks.get(cacheKey)!;
      console.debug(`CSV streaming: cache hit for rows ${offset}-${offset + limit}`);
      return this.convertRowsToObjects(cachedRows);
    }

    console.debug(`CSV streaming: loading rows ${offset}-${offset + limit} for ${this.filePath}`);

    // 估算需要读取的字节范围
    const avgBytesPerRow = Math.max(this.fileSize / Math.max(this.metadata!.numRows, 1), 100);

    // 从文件头开始读取，直到覆盖所需的行数
    // 为了保证边界正确，我们读取更大的块
    const estimatedStart = 0; // 总是从头开始以确保行边界正确
    const estimatedLength = Math.ceil((offset + limit) * avgBytesPerRow * 1.5); // 多读取一些

    // 限制最大读取长度
    const maxLength = Math.min(estimatedLength, this.fileSize);

    // 读取并解析数据
    const startTime = performance.now();
    const text = await buffer.readTextRange(estimatedStart, maxLength);
    const readTime = performance.now() - startTime;

    const parseStartTime = performance.now();
    const allRows = this.parseCsvChunk(text, true);
    const parseTime = performance.now() - parseStartTime;

    console.debug(
      `CSV streaming: read ${(maxLength / 1024).toFixed(1)}KB in ${readTime.toFixed(1)}ms, parsed ${allRows.length} rows in ${parseTime.toFixed(1)}ms`
    );

    // 跳过标题行
    const dataRows = allRows.length > 0 ? allRows.slice(1) : [];

    // 提取请求的行范围
    const requestedRows = dataRows.slice(offset, offset + limit);

    // 缓存解析结果
    this.cleanupCache();
    this.cachedParsedChunks.set(cacheKey, requestedRows);
    this.updateCacheAccess(cacheKey);

    return this.convertRowsToObjects(requestedRows);
  }

  /**
   * 完整加载数据（用于小文件）
   */
  private async loadDataComplete(
    buffer: CsvStreamingBuffer,
    offset: number,
    limit: number
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = 'complete';

    // 检查是否已缓存完整数据
    if (!this.cachedParsedChunks.has(cacheKey)) {
      console.debug(`CSV complete loading: loading entire file ${this.filePath}`);

      const startTime = performance.now();
      // 读取整个文件
      const text = await buffer.readTextRange(0, this.fileSize);
      const readTime = performance.now() - startTime;

      const parseStartTime = performance.now();
      const allRows = this.parseCsvChunk(text, true);
      const parseTime = performance.now() - parseStartTime;

      console.debug(
        `CSV complete: read ${(this.fileSize / 1024).toFixed(1)}KB in ${readTime.toFixed(1)}ms, parsed ${allRows.length} rows in ${parseTime.toFixed(1)}ms`
      );

      // 跳过标题行并缓存所有数据行
      const dataRows = allRows.length > 0 ? allRows.slice(1) : [];
      this.cachedParsedChunks.set(cacheKey, dataRows);
      this.updateCacheAccess(cacheKey);
    } else {
      this.updateCacheAccess(cacheKey);
      console.debug(`CSV complete: using cached data for ${this.filePath}`);
    }

    const allDataRows = this.cachedParsedChunks.get(cacheKey)!;
    const requestedRows = allDataRows.slice(offset, offset + limit);

    return this.convertRowsToObjects(requestedRows);
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
    this.cachedParsedChunks.clear();
    this.lastAccessTime.clear();
    this.metadata = null;

    console.debug(`CSV provider disposed for ${this.filePath}`);
  }
}

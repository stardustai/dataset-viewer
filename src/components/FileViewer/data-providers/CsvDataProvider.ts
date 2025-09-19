import { DataProvider, DataMetadata, DataColumn } from './ParquetDataProvider';
import Papa from 'papaparse';
import { getFileText, getFileHeader } from '../../../utils/fileDataUtils';
import { suggestEncoding } from '../../../utils/csvEncodingDetection';

export class CsvDataProvider implements DataProvider {
  private filePath: string;
  private fileSize: number;
  private csvData: string[][] | null = null;
  private metadata: DataMetadata | null = null;
  private encoding: string;

  constructor(filePath: string, fileSize: number, encoding: string = 'utf-8') {
    this.filePath = filePath;
    this.fileSize = fileSize;
    this.encoding = encoding;
  }

  private async getCsvData(): Promise<string[][]> {
    if (this.csvData) {
      return this.csvData;
    }

    try {
      // 获取文件文本内容，使用指定的编码
      const text = await getFileText(this.filePath, this.encoding);

      // 使用 papaparse 解析 CSV
      const parseResult = Papa.parse<string[]>(text, {
        skipEmptyLines: true,
        header: false, // 我们自己处理标题行
      });

      if (parseResult.errors.length > 0) {
        console.warn('CSV parsing warnings:', parseResult.errors);
      }

      this.csvData = parseResult.data;
    } catch (error) {
      console.error('Error parsing CSV:', error);
      throw new Error(`Failed to parse CSV file: ${error}`);
    }
    return this.csvData;
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      const csvData = await this.getCsvData();

      if (csvData.length === 0) {
        this.metadata = {
          numRows: 0,
          numColumns: 0,
          columns: [],
          fileSize: this.fileSize,
        };
        return this.metadata;
      }

      // 假设第一行是标题行
      const headerRow = csvData[0] || [];
      const columns: DataColumn[] = headerRow.map((header, index) => ({
        name: header || `Column ${index + 1}`,
        type: this.inferColumnType(csvData, index),
      }));

      this.metadata = {
        numRows: Math.max(0, csvData.length - 1), // 减去标题行
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

  private inferColumnType(csvData: string[][], columnIndex: number): string {
    // 简单的类型推断：检查前几行数据
    const sampleSize = Math.min(10, csvData.length - 1);
    let numberCount = 0;
    let booleanCount = 0;

    for (let i = 1; i <= sampleSize; i++) {
      const value = csvData[i]?.[columnIndex];
      if (!value) continue;

      // 检查是否为数字
      if (!isNaN(Number(value)) && value.trim() !== '') {
        numberCount++;
      }

      // 检查是否为布尔值
      const lowerValue = value.toLowerCase().trim();
      if (lowerValue === 'true' || lowerValue === 'false') {
        booleanCount++;
      }
    }

    if (numberCount === sampleSize) return 'number';
    if (booleanCount === sampleSize) return 'boolean';
    return 'string';
  }

  async loadData(offset: number, limit: number): Promise<Record<string, unknown>[]> {
    try {
      const csvData = await this.getCsvData();

      if (csvData.length === 0) {
        return [];
      }

      // 跳过标题行（第一行）
      const dataRows = csvData.slice(1);
      const chunk = dataRows.slice(offset, offset + limit);

      // 转换为对象数组格式
      const headerRow = csvData[0] || [];
      return chunk.map(row => {
        const obj: Record<string, unknown> = {};
        headerRow.forEach((header, index) => {
          const key = header || `Column ${index + 1}`;
          const rawValue = row[index];
          obj[key] = this.parseValue(rawValue);
        });
        return obj;
      });
    } catch (error) {
      console.error('Error loading CSV data:', error);
      throw error;
    }
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

  // 设置新的编码并重新加载数据
  async setEncoding(encoding: string): Promise<void> {
    this.encoding = encoding;
    this.csvData = null; // 清除缓存，强制重新加载
    this.metadata = null; // 清除元数据缓存
  }

  // 获取当前编码
  getEncoding(): string {
    return this.encoding;
  }

  // 自动检测编码并返回建议
  async detectEncoding(): Promise<string> {
    try {
      const filename = this.filePath.split('/').pop() || '';
      const header = await getFileHeader(this.filePath, 2048);
      return suggestEncoding(filename, header);
    } catch (error) {
      console.warn('Failed to detect encoding:', error);
      return 'utf-8';
    }
  }
}

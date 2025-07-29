import { StorageServiceManager } from '../../../services/storage';
import { DataProvider, DataMetadata } from './ParquetDataProvider';

interface DataColumn {
  name: string;
  type: string;
  logicalType?: string;
}

export class CsvDataProvider implements DataProvider {
  private filePath: string;
  private fileSize: number;
  private csvData: string[][] | null = null;
  private metadata: DataMetadata | null = null;

  constructor(filePath: string, fileSize: number) {
    this.filePath = filePath;
    this.fileSize = fileSize;
  }

  private async getCsvData(): Promise<string[][]> {
    if (!this.csvData) {
      const arrayBuffer = await StorageServiceManager.getFileBlob(this.filePath);
      const text = new TextDecoder('utf-8').decode(arrayBuffer);

      // 简单的 CSV 解析（这里可以使用更强大的 CSV 解析库）
      const lines = text.split('\n').filter(line => line.trim());
      this.csvData = lines.map(line => {
        // 简单处理引号包围的字段
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      });
    }
    return this.csvData;
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    const csvData = await this.getCsvData();

    // 假设第一行是标题行
    const headerRow = csvData[0] || [];
    const columns: DataColumn[] = headerRow.map((header, index) => ({
      name: header || `Column ${index + 1}`,
      type: 'string', // CSV 中类型推断较简单，默认为字符串
    }));

    this.metadata = {
      numRows: Math.max(0, csvData.length - 1), // 减去标题行
      numColumns: columns.length,
      columns,
      fileSize: this.fileSize,
    };

    return this.metadata;
  }

  async loadData(offset: number, limit: number): Promise<any[]> {
    const csvData = await this.getCsvData();

    // 跳过标题行（第一行）
    const dataRows = csvData.slice(1);
    const chunk = dataRows.slice(offset, offset + limit);

    // 转换为对象数组格式
    const headerRow = csvData[0] || [];
    return chunk.map(row => {
      const obj: any = {};
      headerRow.forEach((header, index) => {
        const key = header || `Column ${index + 1}`;
        obj[key] = row[index] !== undefined ? row[index] : null;
      });
      return obj;
    });
  }
}

import { StorageServiceManager } from '../../../services/storage';
import { parquetReadObjects, parquetMetadataAsync } from 'hyparquet';

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

export class ParquetDataProvider implements DataProvider {
  private filePath: string;
  private fileSize: number;
  private fileBuffer: ArrayBuffer | null = null;
  private metadata: DataMetadata | null = null;

  constructor(filePath: string, fileSize: number) {
    this.filePath = filePath;
    this.fileSize = fileSize;
  }

  private async getFileBuffer(): Promise<ArrayBuffer> {
    if (!this.fileBuffer) {
      this.fileBuffer = await StorageServiceManager.getFileBlob(this.filePath);
    }
    return this.fileBuffer;
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    const buffer = await this.getFileBuffer();
    const meta = await parquetMetadataAsync(buffer);
    const numRows = Number(meta.num_rows);
    const schema = meta.schema;

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
    const buffer = await this.getFileBuffer();

    const result = await parquetReadObjects({
      file: buffer,
      rowStart: offset,
      rowEnd: offset + limit,
    });

    return result as Record<string, unknown>[];
  }
}

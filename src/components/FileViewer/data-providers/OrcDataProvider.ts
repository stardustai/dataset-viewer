import { commands } from '../../../types/tauri-commands';

// ORC特定的类型定义
interface OrcColumn {
  name: string;
  type_name: string;
  logical_type?: string | null;
}

interface OrcRow {
  values: Record<string, unknown>;
}

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
 * ORC文件数据提供者
 * 通过Rust后端处理ORC文件读取
 */
export class OrcDataProvider implements DataProvider {
  private filePath: string;

  private metadata: DataMetadata | null = null;

  constructor(filePath: string, _fileSize: number) {
    this.filePath = filePath;
    // _fileSize参数保留用于接口兼容性
  }

  async loadMetadata(): Promise<DataMetadata> {
    if (this.metadata) {
      return this.metadata!;
    }

    try {
      // 调用Rust后端获取ORC文件元数据
      const result = await commands.orcGetMetadata(
        this.filePath,
        this.filePath.split('/').pop() || 'file.orc'
      );

      if (result.status === 'error') {
        throw new Error(`无法获取ORC文件元数据: ${result.error}`);
      }

      console.log('ORC元数据加载完成:', result.data);

      // 转换ORC元数据为通用格式
      this.metadata = {
        numRows: Number(result.data.num_rows),
        numColumns: result.data.num_columns,
        columns: result.data.columns.map((col: OrcColumn) => ({
          name: col.name,
          type: col.type_name,
          logicalType: col.logical_type || undefined,
        })),
        fileSize: Number(result.data.file_size),
      };

      return this.metadata;
    } catch (error) {
      console.error('Error loading ORC metadata:', error);
      throw new Error(`Failed to load ORC metadata: ${error}`);
    }
  }

  async loadData(offset: number, limit: number): Promise<Record<string, unknown>[]> {
    if (!this.metadata) {
      await this.loadMetadata();
    }

    // 边界校验和裁剪
    const totalRows = this.metadata?.numRows || 0;
    const validOffset = Math.max(0, Math.min(offset, totalRows));
    const validLimit = limit <= 0 ? 0 : Math.min(limit, totalRows - validOffset);

    if (validLimit <= 0) {
      return [];
    }

    try {
      // 调用Rust后端读取ORC文件数据
      const result = await commands.orcGetData(
        this.filePath,
        this.filePath.split('/').pop() || 'file.orc',
        validOffset.toString(),
        validLimit.toString()
      );

      if (result.status === 'error') {
        throw new Error(`无法获取ORC数据: ${result.error}`);
      }

      console.debug(
        `ORC数据加载完成: offset=${validOffset}, limit=${validLimit}, 实际返回=${result.data.length}行`
      );

      // 转换ORC数据行为Record格式
      return result.data.map((row: OrcRow) => row.values);
    } catch (error) {
      console.error('ORC数据加载失败:', error);
      throw new Error(`Failed to load ORC data: ${error}`);
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.metadata = null;
  }
}

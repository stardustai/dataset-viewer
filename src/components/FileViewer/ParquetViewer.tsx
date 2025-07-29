import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronUp,
  ChevronDown,
  Search,
  Database,
  Layers,
  BarChart3,
  Filter,
  X,
  Loader2
} from 'lucide-react';
import { StorageServiceManager } from '../../services/storage';
import { LoadingDisplay, ErrorDisplay } from '../common';
import { parquetReadObjects, parquetMetadataAsync } from 'hyparquet';

interface ParquetViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  onMetadataLoaded?: (metadata: ParquetMetadata) => void;
}

interface ParquetColumn {
  id: string;
  header: string;
  type: string;
  accessorKey: string;
}

interface ParquetMetadata {
  numRows: number;
  numColumns: number;
  columns: Array<{
    name: string;
    type: string;
    logicalType?: string;
  }>;
  fileSize: number;
}

const MAX_INITIAL_ROWS = 1000;
const CHUNK_SIZE = 500;

export const ParquetViewer: React.FC<ParquetViewerProps> = ({
  filePath,
  fileName,
  fileSize,
  onMetadataLoaded
}) => {
  // Data state
  const [data, setData] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<ParquetMetadata | null>(null);
  const [columns, setColumns] = useState<ParquetColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedRows, setLoadedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  // UI state
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 加载 Parquet 文件
  const loadParquetFile = async () => {
    setLoading(true);
    setError('');

    try {
      // 获取文件数据
      const arrayBuffer = await StorageServiceManager.getFileBlob(filePath);
      fileBufferRef.current = arrayBuffer;

      // 读取元数据
      const meta = await parquetMetadataAsync(arrayBuffer);
      const numRows = Number(meta.num_rows);
      const schema = meta.schema;

      // 解析列信息
      const columnInfo: ParquetColumn[] = [];
      if (schema && schema.length > 1) {
        // 跳过根schema节点
        for (let i = 1; i < schema.length; i++) {
          const field = schema[i];
          if (field.name) {
            columnInfo.push({
              id: field.name,
              header: field.name,
              type: field.type || 'UNKNOWN',
              accessorKey: field.name,
            });
          }
        }
      }

      const metadataObj = {
        numRows,
        numColumns: columnInfo.length,
        columns: columnInfo.map(c => ({
          name: c.header,
          type: c.type,
        })),
        fileSize,
      };

      setMetadata(metadataObj);
      setColumns(columnInfo);
      setTotalRows(numRows);

      // 通知父组件元数据已加载
      if (onMetadataLoaded) {
        onMetadataLoaded(metadataObj);
      }

      // 加载初始数据
      await loadInitialData(arrayBuffer, Math.min(MAX_INITIAL_ROWS, numRows));

    } catch (err) {
      console.error('Failed to load parquet file:', err);
      setError(`Failed to load parquet file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // 加载初始数据
  const loadInitialData = async (buffer: ArrayBuffer, rowCount: number) => {
    try {
      const result = await parquetReadObjects({
        file: buffer,
        rowStart: 0,
        rowEnd: rowCount,
      });

      setData(result);
      setLoadedRows(rowCount);
    } catch (err) {
      console.error('Failed to load initial data:', err);
      throw err;
    }
  };

  // 加载更多数据
  const loadMoreData = async () => {
    if (!fileBufferRef.current || loadingMore || loadedRows >= totalRows) return;

    setLoadingMore(true);
    try {
      const nextChunkSize = Math.min(CHUNK_SIZE, totalRows - loadedRows);
      const result = await parquetReadObjects({
        file: fileBufferRef.current,
        rowStart: loadedRows,
        rowEnd: loadedRows + nextChunkSize,
      });

      setData(prev => [...prev, ...result]);
      setLoadedRows(prev => prev + nextChunkSize);
    } catch (err) {
      console.error('Failed to load more data:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 创建表格列定义
  const tableColumns = useMemo(() => {
    const columnHelper = createColumnHelper<any>();

    return columns.map(col => {
      // 根据列名和类型智能设置宽度
      let defaultWidth = 150;
      let minWidth = 80;
      let maxWidth = 400;

      // 根据列名推断合适的宽度
      const colName = col.header.toLowerCase();
      if (colName.includes('id') || colName.includes('index')) {
        defaultWidth = 100;
        minWidth = 60;
        maxWidth = 150;
      } else if (colName.includes('timestamp') || colName.includes('time') || colName.includes('date')) {
        defaultWidth = 180;
        minWidth = 120;
        maxWidth = 220;
      } else if (colName.includes('name') || colName.includes('title') || colName.includes('description')) {
        defaultWidth = 200;
        minWidth = 100;
        maxWidth = 350;
      } else if (col.type.includes('DOUBLE') || col.type.includes('FLOAT')) {
        defaultWidth = 120;
        minWidth = 80;
        maxWidth = 180;
      } else if (col.type.includes('INT') || col.type.includes('LONG')) {
        defaultWidth = 100;
        minWidth = 60;
        maxWidth = 150;
      } else if (col.type.includes('BOOLEAN')) {
        defaultWidth = 80;
        minWidth = 60;
        maxWidth = 100;
      }

      return columnHelper.accessor(col.accessorKey, {
        id: col.id,
        header: () => (
          <div className="flex items-center space-x-1 w-full">
            <span className="font-medium text-gray-900 dark:text-gray-100 text-xs truncate">
              {col.header}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono hidden lg:inline truncate">
              {col.type}
            </span>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (value === null || value === undefined) {
            return <span className="text-gray-400 italic">null</span>;
          }

          // 处理数组类型
          if (Array.isArray(value)) {
            const arrayStr = JSON.stringify(value);
            if (arrayStr.length > 50) {
              return (
                <span
                  className="text-xs font-mono text-blue-600 dark:text-blue-400 cursor-help"
                  title={arrayStr}
                >
                  [{value.length} items]
                </span>
              );
            }
            return (
              <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                {arrayStr}
              </span>
            );
          }

          // 处理对象类型
          if (typeof value === 'object') {
            const objStr = JSON.stringify(value);
            if (objStr.length > 50) {
              return (
                <span
                  className="text-xs font-mono text-blue-600 dark:text-blue-400 cursor-help"
                  title={objStr}
                >
                  {'{...}'}
                </span>
              );
            }
            return (
              <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                {objStr}
              </span>
            );
          }

          // 处理数值类型
          if (typeof value === 'number') {
            // 如果是整数，直接显示
            if (Number.isInteger(value)) {
              return (
                <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {value.toLocaleString()}
                </span>
              );
            }
            // 如果是小数，限制小数位数
            const formatted = value.toFixed(6).replace(/\.?0+$/, '');
            return (
              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
                {formatted}
              </span>
            );
          }

          // 处理字符串类型
          const stringValue = String(value);
          if (stringValue.length > 100) {
            return (
              <span
                className="text-sm text-gray-900 dark:text-gray-100 cursor-help"
                title={stringValue}
              >
                {stringValue.substring(0, 97)}...
              </span>
            );
          }

          return (
            <span className="text-sm text-gray-900 dark:text-gray-100">
              {stringValue}
            </span>
          );
        },
        size: defaultWidth,
        minSize: minWidth,
        maxSize: maxWidth,
      });
    });
  }, [columns]);

  // 创建表格实例
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  // 虚拟化配置
  const { rows } = table.getRowModel();
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 40, // 增加行高以更好显示数据
    overscan: 10,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // 检测是否需要加载更多数据
  useEffect(() => {
    const [lastItem] = virtualRows.slice(-1);
    if (!lastItem) return;

    if (
      lastItem.index >= rows.length - 10 && // 接近底部
      !loadingMore &&
      loadedRows < totalRows
    ) {
      loadMoreData();
    }
  }, [virtualRows, rows.length, loadingMore, loadedRows, totalRows]);

  // 初始化
  useEffect(() => {
    loadParquetFile();
  }, [filePath]);

  if (loading) {
    return (
      <LoadingDisplay
        message={`Loading parquet file "${fileName}"...`}
        icon={Database}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={loadParquetFile}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Metadata Panel */}
      {showMetadata && metadata && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 lg:px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">Rows:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {metadata.numRows.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Columns:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {metadata.numColumns}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">Loaded:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {loadedRows.toLocaleString()} ({((loadedRows / totalRows) * 100).toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">File Size:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {formatFileSize(metadata.fileSize)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Search and Controls */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search in data..."
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              {globalFilter && (
                <button
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {table.getRowModel().rows.length !== data.length && (
              <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Showing {table.getRowModel().rows.length} of {data.length} loaded rows
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Show metadata"
            >
              <BarChart3 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={() => setShowColumnPanel(!showColumnPanel)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Column visibility"
            >
              <Layers className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Column Visibility Panel */}
      {showColumnPanel && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Column Visibility</h3>
            <button
              onClick={() => setShowColumnPanel(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {table.getAllLeafColumns().map(column => (
              <label key={column.id} className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700 dark:text-gray-300">{column.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={tableContainerRef}
          className="h-full overflow-auto"
          style={{ contain: 'strict' }}
        >
          {/* Table Header */}
          <div
            className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
            style={{ minWidth: `${table.getTotalSize()}px` }}
          >
            {table.getHeaderGroups().map(headerGroup => (
              <div
                key={headerGroup.id}
                className="flex"
                style={{ width: `${table.getTotalSize()}px` }}
              >
                {headerGroup.headers.map(header => (
                  <div
                    key={header.id}
                    className="relative bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 last:border-r-0"
                    style={{ width: header.getSize() }}
                  >
                    <div
                      className="px-2 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px]"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                      {header.column.getCanSort() && (
                        <div className="flex-shrink-0">
                          {{
                            asc: <ChevronUp className="w-3 h-3 text-blue-600" />,
                            desc: <ChevronDown className="w-3 h-3 text-blue-600" />,
                          }[header.column.getIsSorted() as string] ?? (
                            <div className="w-3 h-3 text-gray-400 hover:text-gray-600">
                              <Filter className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Column Resizer */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className="absolute right-0 top-0 h-full w-0.5 bg-gray-300 hover:bg-blue-500 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Virtualized Table Body */}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
              minWidth: `${table.getTotalSize()}px`
            }}
          >
            {virtualRows.map(virtualRow => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={`row-${virtualRow.index}-${row.id}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${table.getTotalSize()}px`,
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-600"
                >
                  {row.getVisibleCells().map(cell => (
                    <div
                      key={`cell-${virtualRow.index}-${cell.column.id}`}
                      className="px-2 py-2 border-r border-gray-100 dark:border-gray-600 last:border-r-0 flex items-center overflow-hidden"
                      style={{ width: cell.column.getSize() }}
                    >
                      <div className="w-full overflow-hidden">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Loading More Indicator */}
          {loadingMore && (
            <div className="flex justify-center py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more data...</span>
              </div>
            </div>
          )}

          {/* Load More Button */}
          {!loadingMore && loadedRows < totalRows && (
            <div className="flex justify-center py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={loadMoreData}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Load More ({(totalRows - loadedRows).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

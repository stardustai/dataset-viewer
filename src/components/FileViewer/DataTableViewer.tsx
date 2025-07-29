import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  Loader2,
  FileSpreadsheet,
  Maximize2,
  Copy
} from 'lucide-react';
import { LoadingDisplay, ErrorDisplay } from '../common';
import type { DataProvider, DataMetadata } from './providers';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';

interface DataColumn {
  id: string;
  header: string;
  type: string;
  accessorKey: string;
}

interface DataTableViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: 'parquet' | 'xlsx' | 'csv' | 'ods';
  onMetadataLoaded?: (metadata: DataMetadata) => void;
}

const MAX_INITIAL_ROWS = 1000;
const CHUNK_SIZE = 500;

export const DataTableViewer: React.FC<DataTableViewerProps> = ({
  filePath,
  fileName,
  fileSize,
  fileType,
  onMetadataLoaded
}) => {
  const { t } = useTranslation();
  // Data state
  const [data, setData] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<DataMetadata | null>(null);
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedRows, setLoadedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  // Sheet state (for XLSX)
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  // UI state
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showCellModal, setShowCellModal] = useState(false);
  const [modalCellData, setModalCellData] = useState<{
    value: any;
    column: string;
    row: number;
  } | null>(null);

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const dataProviderRef = useRef<DataProvider | null>(null);

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 打开单元格详情弹窗
  const openCellModal = (value: any, column: string, rowIndex: number) => {
    setModalCellData({ value, column, row: rowIndex });
    setShowCellModal(true);
  };

  // 渲染单元格内容的组件
  const CellContent: React.FC<{ 
    value: any; 
    column: string; 
    rowIndex: number;
    maxLength?: number;
  }> = ({ value, column, rowIndex, maxLength = 50 }) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic text-sm">{t('data.table.null.value')}</span>;
    }

    // 处理数组类型
    if (Array.isArray(value)) {
      const arrayStr = JSON.stringify(value);
      const isLong = arrayStr.length > maxLength;
      
      return (
        <div className="flex items-center space-x-2 w-full">
          <span 
            className={`text-xs font-mono text-blue-600 dark:text-blue-400 flex-1 min-w-0 ${
              isLong ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1 py-0.5' : ''
            }`}
            onClick={isLong ? () => openCellModal(value, column, rowIndex) : undefined}
            title={isLong ? t('data.table.cell.click.view') : arrayStr}
          >
            {isLong ? (
              <span className="truncate block">
                [{t('data.table.items.count', { count: value.length })}] {arrayStr.substring(0, maxLength - 15)}...
              </span>
            ) : (
              arrayStr
            )}
          </span>
          {isLong && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCellModal(value, column, rowIndex);
              }}
              className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('data.table.cell.view.full')}
            >
              <Maximize2 className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      );
    }

    // 处理对象类型
    if (typeof value === 'object') {
      const objStr = JSON.stringify(value, null, 2);
      const isLong = objStr.length > maxLength;
      
      return (
        <div className="flex items-center space-x-2 w-full">
          <span
            className={`text-xs font-mono text-blue-600 dark:text-blue-400 flex-1 min-w-0 ${
              isLong ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded px-1 py-0.5' : ''
            }`}
            onClick={isLong ? () => openCellModal(value, column, rowIndex) : undefined}
            title={isLong ? t('data.table.cell.click.view') : objStr}
          >
            {isLong ? (
              <span className="truncate block">
                {'{...} '}{objStr.substring(0, maxLength - 10)}...
              </span>
            ) : (
              objStr
            )}
          </span>
          {isLong && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCellModal(value, column, rowIndex);
              }}
              className="flex-shrink-0 p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors group"
              title={t('data.table.cell.view.full')}
            >
              <Maximize2 className="w-3 h-3 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
            </button>
          )}
        </div>
      );
    }

    // 处理数值类型
    if (typeof value === 'number') {
      const displayValue = Number.isInteger(value) 
        ? value.toLocaleString()
        : value.toFixed(6).replace(/\.?0+$/, '');
      
      return (
        <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">
          {displayValue}
        </span>
      );
    }

    // 处理字符串类型
    const stringValue = String(value);
    const isLong = stringValue.length > maxLength;
    
    return (
      <div className="flex items-center space-x-2 w-full">
        <span
          className={`text-sm text-gray-900 dark:text-gray-100 flex-1 min-w-0 ${
            isLong ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5' : ''
          }`}
          onClick={isLong ? () => openCellModal(value, column, rowIndex) : undefined}
          title={isLong ? t('data.table.cell.click.view') : stringValue}
        >
          <span className="block truncate">
            {isLong ? `${stringValue.substring(0, maxLength - 3)}...` : stringValue}
          </span>
        </span>
        {isLong && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openCellModal(value, column, rowIndex);
            }}
            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors group"
            title={t('data.table.cell.view.full')}
          >
            <Maximize2 className="w-3 h-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
          </button>
        )}
      </div>
    );
  };

  // 创建数据提供者
  const createDataProvider = async (): Promise<DataProvider> => {
    switch (fileType) {
      case 'parquet':
        const { ParquetDataProvider } = await import('./providers');
        return new ParquetDataProvider(filePath, fileSize);

      case 'xlsx':
      case 'ods':
        const { XlsxDataProvider } = await import('./providers');
        return new XlsxDataProvider(filePath, fileSize);

      case 'csv':
        const { CsvDataProvider } = await import('./providers');
        return new CsvDataProvider(filePath, fileSize);

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  };  // 加载数据
  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const provider = await createDataProvider();
      dataProviderRef.current = provider;

      // 加载元数据
      const meta = await provider.loadMetadata();
      setMetadata(meta);
      setTotalRows(meta.numRows);

      // 设置工作表信息（如果有）
      if (meta.sheets) {
        setSheetNames(meta.sheets);
      }

      // 解析列信息
      const columnInfo: DataColumn[] = meta.columns.map(col => ({
        id: col.name,
        header: col.name,
        type: col.type,
        accessorKey: col.name,
      }));
      setColumns(columnInfo);

      // 通知父组件元数据已加载
      if (onMetadataLoaded) {
        onMetadataLoaded(meta);
      }

      // 加载初始数据
      const initialRowCount = Math.min(MAX_INITIAL_ROWS, meta.numRows);
      const initialData = await provider.loadData(0, initialRowCount);
      setData(initialData);
      setLoadedRows(initialRowCount);

    } catch (err) {
      console.error('Failed to load data:', err);
      setError(t('data.table.error') + `: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // 加载更多数据
  const loadMoreData = async () => {
    if (!dataProviderRef.current || loadingMore || loadedRows >= totalRows) return;

    setLoadingMore(true);
    try {
      const nextChunkSize = Math.min(CHUNK_SIZE, totalRows - loadedRows);
      const moreData = await dataProviderRef.current.loadData(loadedRows, nextChunkSize);

      setData(prev => [...prev, ...moreData]);
      setLoadedRows(prev => prev + nextChunkSize);
    } catch (err) {
      console.error('Failed to load more data:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 切换工作表（仅 XLSX）
  const switchSheet = async (sheetIndex: number) => {
    if (!dataProviderRef.current?.switchSheet || sheetIndex === activeSheet) return;

    setLoading(true);
    try {
      await dataProviderRef.current.switchSheet(sheetIndex);
      setActiveSheet(sheetIndex);

      // 重新加载数据
      const initialRowCount = Math.min(MAX_INITIAL_ROWS, totalRows);
      const newData = await dataProviderRef.current.loadData(0, initialRowCount);
      setData(newData);
      setLoadedRows(initialRowCount);
    } catch (err) {
      console.error('Failed to switch sheet:', err);
    } finally {
      setLoading(false);
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
      } else if (col.type.includes('DOUBLE') || col.type.includes('FLOAT') || col.type.includes('number')) {
        defaultWidth = 120;
        minWidth = 80;
        maxWidth = 180;
      } else if (col.type.includes('INT') || col.type.includes('LONG') || col.type.includes('integer')) {
        defaultWidth = 100;
        minWidth = 60;
        maxWidth = 150;
      } else if (col.type.includes('BOOLEAN') || col.type.includes('boolean')) {
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
        cell: ({ getValue, row }) => {
          const value = getValue();
          return (
            <CellContent 
              value={value} 
              column={col.header} 
              rowIndex={row.index}
              maxLength={60}
            />
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
    estimateSize: () => 40,
    overscan: 10,
  });

  const virtualRows = virtualizer.getVirtualItems();

  // 检测是否需要加载更多数据
  useEffect(() => {
    const [lastItem] = virtualRows.slice(-1);
    if (!lastItem) return;

    if (
      lastItem.index >= rows.length - 10 &&
      !loadingMore &&
      loadedRows < totalRows
    ) {
      loadMoreData();
    }
  }, [virtualRows, rows.length, loadingMore, loadedRows, totalRows]);

  // 初始化
  useEffect(() => {
    loadData();
  }, [filePath]);

  // 根据文件类型获取对应的图标
  const getFileIcon = () => {
    switch (fileType) {
      case 'xlsx':
      case 'ods':
      case 'csv':
        return FileSpreadsheet;
      case 'parquet':
        return Database;
      default:
        return FileSpreadsheet;
    }
  };

  if (loading) {
    return (
      <LoadingDisplay
        message={`Loading ${fileType} file "${fileName}"...`}
        icon={getFileIcon()}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={loadData}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Sheet Tabs (XLSX only) */}
      {sheetNames.length > 1 && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6 py-3">
          <div className="flex items-center space-x-1 overflow-x-auto">
            <span className="text-sm text-gray-600 dark:text-gray-400 mr-3 whitespace-nowrap">{t('data.table.sheet')}:</span>
            {sheetNames.map((sheetName, index) => (
              <button
                key={index}
                onClick={() => switchSheet(index)}
                className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-all duration-200 ${
                  index === activeSheet
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-transparent'
                }`}
              >
                {sheetName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metadata Panel */}
      {showMetadata && metadata && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 lg:px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">{t('data.table.metadata.rows')}:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {metadata.numRows.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">{t('data.table.metadata.columns')}:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {metadata.numColumns}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">{t('data.table.metadata.loaded')}:</span>
              <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                {loadedRows.toLocaleString()} ({((loadedRows / totalRows) * 100).toFixed(1)}%)
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">{t('data.table.metadata.size')}:</span>
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
                placeholder={t('data.table.search.global')}
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
                {t('data.table.showing.rows', {
                  showing: table.getRowModel().rows.length,
                  total: data.length
                })}
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
                      className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px]"
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
                      className="px-3 py-2 border-r border-gray-100 dark:border-gray-600 last:border-r-0 flex items-center overflow-hidden"
                      style={{ width: cell.column.getSize() }}
                    >
                      <div className="w-full min-w-0">
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
                <span>{t('data.table.loading.more')}</span>
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
                {t('data.table.load.more')} ({(totalRows - loadedRows).toLocaleString()} remaining)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cell Detail Modal */}
      {showCellModal && modalCellData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {t('data.table.modal.title')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  列: {modalCellData.column} | 行: {modalCellData.row + 1}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={async () => {
                    const textToCopy = typeof modalCellData.value === 'object' 
                      ? JSON.stringify(modalCellData.value, null, 2)
                      : String(modalCellData.value);
                    const success = await copyToClipboard(textToCopy);
                    if (success) {
                      showCopyToast(t('copied.to.clipboard'));
                    }
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title={t('data.table.cell.copy')}
                >
                  <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </button>
                <button
                  onClick={() => setShowCellModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-auto max-h-[60vh]">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                {typeof modalCellData.value === 'object' ? (
                  <pre className="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap overflow-auto">
                    {JSON.stringify(modalCellData.value, null, 2)}
                  </pre>
                ) : (
                  <div className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {String(modalCellData.value)}
                  </div>
                )}
              </div>
              
              {/* Value Info */}
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('data.table.data.type')}:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                    {Array.isArray(modalCellData.value) 
                      ? t('data.table.array.items', { count: modalCellData.value.length })
                      : typeof modalCellData.value}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">{t('data.table.char.length')}:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                    {typeof modalCellData.value === 'object'
                      ? JSON.stringify(modalCellData.value).length
                      : String(modalCellData.value).length} {t('data.table.chars')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

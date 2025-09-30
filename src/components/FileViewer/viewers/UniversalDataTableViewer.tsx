import {
  type ColumnFiltersState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpDown, ChevronDown, ChevronUp, Database, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageClient } from '../../../services/storage/StorageClient';
import { ErrorDisplay, LoadingDisplay } from '../../common';
import { UnifiedContentModal } from '../common';
import type { DataMetadata, DataProvider } from '../data-providers';
import { CsvDataProvider, ParquetDataProvider, XlsxDataProvider } from '../data-providers';
import { DataTableCell, DataTableColumnPanel, DataTableControls } from '../table-components';

/**
 * 安全的JSON序列化函数，处理BigInt等特殊类型
 */
function safeStringify(value: any): string {
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        // 处理BigInt类型
        if (typeof val === 'bigint') {
          return val.toString() + 'n'; // 添加'n'后缀表示这是BigInt
        }
        // 处理Symbol类型
        if (typeof val === 'symbol') {
          return val.toString();
        }
        // 处理Function类型
        if (typeof val === 'function') {
          return '[Function]';
        }
        // 处理undefined
        if (val === undefined) {
          return '[undefined]';
        }
        return val;
      },
      2
    );
  } catch (error) {
    // 如果序列化失败，返回toString()结果
    try {
      return String(value);
    } catch (stringError) {
      return '[Object]';
    }
  }
}

interface DataColumn {
  id: string;
  header: string;
  type: string;
  accessorKey: string;
}

interface UniversalDataTableViewerProps {
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: 'parquet' | 'xlsx' | 'csv' | 'ods';
  onMetadataLoaded?: (metadata: DataMetadata) => void;
  previewContent?: Uint8Array;
  storageClient?: StorageClient;
}

const MAX_INITIAL_ROWS = 100; // 减少初始加载数量，提升响应速度
const CHUNK_SIZE = 200; // 减少每次加载的块大小

// Provider 工厂函数
function createProvider(
  filePath: string,
  fileSize: number,
  fileType: 'parquet' | 'xlsx' | 'csv' | 'ods',
  previewContent?: Uint8Array,
  storageClient?: StorageClient
): DataProvider {
  // 构建协议 URL
  const protocolUrl = storageClient ? storageClient.toProtocolUrl(filePath) : filePath;

  switch (fileType) {
    case 'parquet':
      return new ParquetDataProvider(protocolUrl, fileSize);
    case 'xlsx':
    case 'ods':
      return new XlsxDataProvider(protocolUrl, fileSize, previewContent);
    case 'csv':
      return new CsvDataProvider(protocolUrl, fileSize);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

export const UniversalDataTableViewer: React.FC<UniversalDataTableViewerProps> = ({
  filePath,
  fileName,
  fileSize,
  fileType,
  onMetadataLoaded,
  previewContent,
  storageClient,
}) => {
  const { t } = useTranslation();

  // Data state
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<DataColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedRows, setLoadedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [initialLoading, setInitialLoading] = useState(false); // 新增：初始数据加载状态

  // Sheet state (for XLSX/ODS)
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState('');

  // UI state
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [showContentModal, setShowContentModal] = useState(false);
  const [modalContentData, setModalContentData] = useState<{
    content: string;
    title: string;
    description?: React.ReactNode;
  } | null>(null);

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const dataProviderRef = useRef<DataProvider | null>(null);

  // 打开内容详情弹窗
  const openContentModal = (value: unknown, column: string, rowIndex: number) => {
    const content = typeof value === 'string' ? value : safeStringify(value);
    setModalContentData({
      content,
      title: t('data.table.cell.details'),
      description: <span>{t('cell.position', { column, row: rowIndex + 1 })}</span>,
    });
    setShowContentModal(true);
  };

  // 加载数据文件
  const loadDataFile = async () => {
    setLoading(true);
    setError('');

    try {
      // 创建数据提供器
      const provider = createProvider(filePath, fileSize, fileType, previewContent, storageClient);
      dataProviderRef.current = provider;

      // 初始化并获取元数据
      const meta = await provider.loadMetadata();
      setTotalRows(meta.numRows);

      // 设置工作表信息（如果适用）
      if (meta.sheets) {
        setSheetNames(meta.sheets);
      }

      // 设置列信息
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

      // 先清空loading状态和数据，立即显示表格结构
      setLoading(false);
      setData([]);
      setLoadedRows(0);

      // 让UI有时间渲染表格结构，然后开始渐进式加载数据
      await new Promise(resolve => setTimeout(resolve, 50));

      // 然后开始渐进式加载数据
      const initialRowCount = Math.min(MAX_INITIAL_ROWS, meta.numRows);
      await loadInitialDataProgressive(provider, initialRowCount);
    } catch (err) {
      console.error('Failed to load data file:', err);
      setError(
        `${t('error.failedToLoadDataFile')}: ${err instanceof Error ? err.message : t('error.unknown')}`
      );
      setLoading(false);
    }
  };

  // 渐进式加载初始数据
  const loadInitialDataProgressive = async (provider: DataProvider, totalRowsToLoad: number) => {
    try {
      setInitialLoading(true);
      const chunkSize = Math.min(50, totalRowsToLoad); // 每次加载50行
      let loadedCount = 0;
      let accumulatedData: Record<string, unknown>[] = [];

      while (loadedCount < totalRowsToLoad) {
        const remainingRows = totalRowsToLoad - loadedCount;
        const currentChunkSize = Math.min(chunkSize, remainingRows);

        // 加载当前块
        const chunk = await provider.loadData(loadedCount, currentChunkSize, activeSheet);
        accumulatedData = [...accumulatedData, ...chunk];
        loadedCount += currentChunkSize;

        // 立即更新UI显示当前已加载的数据
        setData([...accumulatedData]);
        setLoadedRows(loadedCount);

        // 如果不是最后一块，添加小的延迟让UI有时间更新
        if (loadedCount < totalRowsToLoad) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (err) {
      console.error('Failed to load initial data progressively:', err);
      throw err;
    } finally {
      setInitialLoading(false);
    }
  };

  // 加载更多数据（优化版本）
  const loadMoreData = async () => {
    if (!dataProviderRef.current || loadingMore || loadedRows >= totalRows) return;

    setLoadingMore(true);
    try {
      const nextChunkSize = Math.min(CHUNK_SIZE, totalRows - loadedRows);
      const result = await dataProviderRef.current.loadData(loadedRows, nextChunkSize, activeSheet);

      setData(prev => [...prev, ...result]);
      setLoadedRows(prev => prev + nextChunkSize);
    } catch (err) {
      console.error('Failed to load more data:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 切换工作表
  const handleSheetChange = async (sheetIndex: number) => {
    if (!dataProviderRef.current || sheetIndex === activeSheet) return;

    setActiveSheet(sheetIndex);
    setLoading(true);

    try {
      // 重置表格状态
      setSorting([]);
      setColumnFilters([]);
      setGlobalFilter('');

      // 如果支持工作表切换，先切换工作表
      if (dataProviderRef.current.switchSheet) {
        await dataProviderRef.current.switchSheet(sheetIndex);
      }

      // 重新获取元数据
      const meta = await dataProviderRef.current.loadMetadata();
      setTotalRows(meta.numRows);

      // 更新列信息
      const columnInfo: DataColumn[] = meta.columns.map(col => ({
        id: col.name,
        header: col.name,
        type: col.type,
        accessorKey: col.name,
      }));
      setColumns(columnInfo);

      // 重新加载当前工作表的数据
      const result = await dataProviderRef.current.loadData(
        0,
        Math.min(MAX_INITIAL_ROWS, meta.numRows),
        sheetIndex
      );
      setData(result);
      setLoadedRows(result.length);
    } catch (err) {
      console.error('Failed to switch sheet:', err);
      setError(
        `${t('error.failedToSwitchSheet')}: ${err instanceof Error ? err.message : t('error.unknown')}`
      );
    } finally {
      setLoading(false);
    }
  };

  // 根据列名和类型智能设置宽度
  const getColumnWidth = (col: DataColumn): number => {
    const colName = col.header.toLowerCase();

    if (colName.includes('id') || colName.includes('index')) return 100;
    if (colName.includes('timestamp') || colName.includes('time') || colName.includes('date'))
      return 180;
    if (colName.includes('name') || colName.includes('title') || colName.includes('description'))
      return 200;
    if (col.type.toLowerCase().includes('double') || col.type.toLowerCase().includes('float'))
      return 120;
    if (col.type.toLowerCase().includes('int') || col.type.toLowerCase().includes('long'))
      return 100;
    if (col.type.toLowerCase().includes('boolean')) return 80;

    return 150;
  };

  // 创建表格列定义
  const tableColumns = useMemo(() => {
    const columnHelper = createColumnHelper<Record<string, unknown>>();
    return columns.map(col => {
      return columnHelper.accessor(col.accessorKey as keyof Record<string, unknown>, {
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
        cell: ({ getValue, row }) => (
          <DataTableCell
            value={getValue()}
            column={col.header}
            rowIndex={row.index}
            onOpenModal={openContentModal}
          />
        ),
        size: getColumnWidth(col),
        minSize: 80,
        maxSize: 400,
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
    overscan: 20, // 预渲染行数以提升滚动体验
  });

  const virtualRows = virtualizer.getVirtualItems();

  // 检测是否需要加载更多数据
  useEffect(() => {
    const [lastItem] = virtualRows.slice(-1);
    if (!lastItem) return;

    if (lastItem.index >= rows.length - 10 && !loadingMore && loadedRows < totalRows) {
      loadMoreData();
    }
  }, [virtualRows, rows.length, loadingMore, loadedRows, totalRows]);

  // 初始化
  useEffect(() => {
    loadDataFile();
  }, [filePath, fileType]);

  if (loading) {
    return <LoadingDisplay message={t('data.table.loading', { fileName })} icon={Database} />;
  }

  if (error) {
    return <ErrorDisplay message={error} onRetry={loadDataFile} />;
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Controls */}
      <DataTableControls
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        showColumnPanel={showColumnPanel}
        onToggleColumnPanel={() => setShowColumnPanel(!showColumnPanel)}
        filteredCount={table.getRowModel().rows.length}
        totalLoadedCount={data.length}
        sheetNames={sheetNames}
        activeSheet={activeSheet}
        onSheetChange={handleSheetChange}
      />

      {/* Column Visibility Panel */}
      {showColumnPanel && (
        <DataTableColumnPanel table={table} onClose={() => setShowColumnPanel(false)} />
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <div ref={tableContainerRef} className="h-full overflow-auto" style={{ contain: 'strict' }}>
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
                            <ArrowUpDown className="w-3 h-3 text-gray-400 hover:text-gray-600" />
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
              minWidth: `${table.getTotalSize()}px`,
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

          {/* Loading More or Initial Loading Indicator */}
          {(loadingMore || initialLoading) && (
            <div className="flex justify-center py-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {initialLoading
                    ? t('data.table.loading.initial', {
                        loaded: loadedRows,
                        total: Math.min(MAX_INITIAL_ROWS, totalRows),
                      })
                    : t('data.table.loading.more')}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unified Content Modal */}
      {showContentModal && modalContentData && (
        <UnifiedContentModal
          isOpen={showContentModal}
          onClose={() => setShowContentModal(false)}
          content={modalContentData.content}
          title={modalContentData.title}
          description={modalContentData.description}
        />
      )}
    </div>
  );
};

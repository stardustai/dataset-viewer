import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StorageFile } from '../../types';
import { getFileType } from '../../utils/fileTypes';
import { FileIcon } from '../../utils/fileIcons';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatFileSize } from '../../utils/fileUtils';

interface VirtualizedFileListProps {
  files: StorageFile[];
  onFileClick: (file: StorageFile) => void;
  showHidden: boolean;
  sortField: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  height?: number;
  searchTerm?: string;
}

export const VirtualizedFileList: React.FC<VirtualizedFileListProps> = ({
  files,
  onFileClick,
  showHidden,
  sortField,
  sortDirection,
  height,
  searchTerm = ''
}) => {
  // Use custom hook for responsive behavior
  const isMobile = useIsMobile();

  // 过滤和排序文件
  const processedFiles = useMemo(() => {
    // 首先过滤掉空文件名和无效条目
    let filteredFiles = files.filter(file =>
      file.basename && file.basename.trim() !== ''
    );

    // 过滤隐藏文件
    filteredFiles = showHidden
      ? filteredFiles
      : filteredFiles.filter(file => !file.basename.startsWith('.'));

    // 根据搜索词过滤文件名
    if (searchTerm.trim()) {
      filteredFiles = filteredFiles.filter(file =>
        file.basename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 排序
    const sortedFiles = [...filteredFiles].sort((a, b) => {
      // 目录总是排在文件前面
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;

      let compareValue = 0;

      switch (sortField) {
        case 'name':
          compareValue = a.basename.toLowerCase().localeCompare(b.basename.toLowerCase());
          break;
        case 'size':
          compareValue = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          compareValue = new Date(a.lastmod).getTime() - new Date(b.lastmod).getTime();
          break;
      }

      return sortDirection === 'asc' ? compareValue : -compareValue;
    });

    return sortedFiles;
  }, [files, showHidden, sortField, sortDirection, searchTerm]);

  // 创建虚拟化容器引用
  const parentRef = React.useRef<HTMLDivElement>(null);

  // 虚拟化配置
  const virtualizer = useVirtualizer({
    count: processedFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // 每行高度
    overscan: 5, // 减少预渲染的行数以提升性能
  });

  // 渲染文件图标
  const renderFileIcon = (file: StorageFile) => {
    const fileType = file.type === 'directory' ? 'directory' : getFileType(file.filename);
    return <FileIcon fileType={fileType} size="md" className="mr-3" />;
  };



  // 格式化日期 - 移动端显示简洁格式
  const formatDate = (dateString: string): string => {
    // 如果日期字符串为空或无效，返回横杠
    if (!dateString || dateString.trim() === '') {
      return '—';
    }

    const date = new Date(dateString);
    
    // 如果日期无效，返回横杠
    if (isNaN(date.getTime())) {
      return '—';
    }

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isThisYear = date.getFullYear() === now.getFullYear();

    // 移动端使用简洁格式
    if (isMobile) {
      if (isToday) {
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      } else if (isThisYear) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString(undefined, { year: '2-digit', month: 'short' });
      }
    }

    // 桌面端使用完整格式
    return date.toLocaleString();
  };

  return (
    <div
      ref={parentRef}
      style={{ height: height ? `${height}px` : '100%' }}
      className="h-full overflow-auto"
      data-virtualized-container
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const file = processedFiles[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="border-b border-gray-200 dark:border-gray-700"
            >
              <div
                onClick={() => onFileClick(file)}
                className="flex items-center px-4 lg:px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors h-full"
              >
                {/* 文件图标和名称 */}
                <div className="flex items-center flex-1 min-w-0 pr-2 lg:pr-4">
                  {renderFileIcon(file)}
                  <span
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                    title={file.basename}
                  >
                    {file.basename}
                  </span>
                </div>

                {/* 文件大小 */}
                <div className="w-16 sm:w-20 lg:w-24 text-sm text-gray-500 dark:text-gray-400 text-right pr-2 lg:pr-4 flex-shrink-0">
                  {file.type === 'file' ? formatFileSize(file.size) : '—'}
                </div>

                {/* 修改时间 */}
                <div className="w-24 sm:w-32 lg:w-48 text-sm text-gray-500 dark:text-gray-400 text-right flex-shrink-0">
                  {formatDate(file.lastmod)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

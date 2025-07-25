import React, { useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Folder, FileText } from 'lucide-react';
import { ArchiveEntry } from '../types';

// 文件大小格式化工具函数
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface VirtualizedArchiveListProps {
  entries: ArchiveEntry[];
  onSelectEntry: (entry: ArchiveEntry) => void;
  selectedPath?: string;
  searchTerm: string;
  height?: number;
}

export const VirtualizedArchiveList: React.FC<VirtualizedArchiveListProps> = ({
  entries,
  onSelectEntry,
  selectedPath,
  searchTerm,
  height = 400
}) => {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // 过滤和排序条目
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    if (searchTerm) {
      filtered = entries.filter(entry =>
        entry.path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 按类型和名称排序：目录优先，然后按名称排序
    return filtered.sort((a, b) => {
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }
      return a.path.localeCompare(b.path);
    });
  }, [entries, searchTerm]);

  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      style={{ height: `${height}px`, overflow: 'auto' }}
      className="w-full"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const entry = filteredEntries[virtualItem.index];
          const isSelected = entry.path === selectedPath;

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
              className={`flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''
              }`}
              onClick={() => onSelectEntry(entry)}
            >
              {entry.is_dir ? (
                <Folder size={16} className="text-blue-500" />
              ) : (
                <FileText size={16} className="text-gray-500" />
              )}
              <span className="flex-1 truncate" title={entry.path}>
                {(() => {
                  // 获取文件/文件夹名称，处理末尾的斜杠
                  const path = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
                  const parts = path.split('/');
                  return parts[parts.length - 1] || entry.path;
                })()}
              </span>
              <span className="text-sm text-gray-500">
                {entry.is_dir ? '' : formatFileSize(entry.size)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

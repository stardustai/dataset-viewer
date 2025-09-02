import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import type { StorageFile } from '../../types';
import { FileIcon } from '../../utils/fileIcons';
import { getFileType } from '../../utils/fileTypes';
import { formatFileSize } from '../../utils/fileUtils';
import { ContextMenu } from '../common/ContextMenu';

interface VirtualizedFileListProps {
  files: StorageFile[];
  onFileClick: (file: StorageFile) => void;
  onFileOpenAsText?: (file: StorageFile) => void;
  height?: number;
  onScrollToBottom?: () => void;
}

export const VirtualizedFileList: React.FC<VirtualizedFileListProps> = ({
  files,
  onFileClick,
  onFileOpenAsText,
  height,
  onScrollToBottom,
}) => {
  // Use custom hook for responsive behavior
  const isMobile = useIsMobile();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    file: StorageFile | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    file: null,
  });

  // 直接使用传入的文件列表，不进行过滤和排序（由调用方处理）
  const processedFiles = files;

  // 创建虚拟化容器引用
  const parentRef = React.useRef<HTMLDivElement>(null);

  // 虚拟化配置
  const virtualizer = useVirtualizer({
    count: processedFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60, // 每行高度
    overscan: 5, // 减少预渲染的行数以提升性能
  });

  // 添加滚动到底部检测逻辑
  useEffect(() => {
    const container = parentRef.current;
    if (!container || !onScrollToBottom) return;

    let timeoutId: number | null = null;
    let lastScrollTop = 0;
    let lastScrollTime = Date.now();

    const handleScroll = () => {
      // 清除之前的延时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // 使用短延时来避免过于频繁的调用
      timeoutId = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;

        // 检查容器是否可滚动
        if (scrollHeight <= clientHeight) {
          // 如果内容高度小于等于容器高度，直接触发加载
          onScrollToBottom();
          return;
        }

        // 计算滚动速度
        const now = Date.now();
        const scrollDistance = scrollTop - lastScrollTop;
        const timeElapsed = now - lastScrollTime;
        const scrollSpeed = Math.abs(scrollDistance) / Math.max(timeElapsed, 1); // px/ms

        // 根据滚动速度动态调整阈值
        // 滚动越快，越早开始预加载
        const baseThreshold = 300; // 基础阈值 300px
        const speedMultiplier = Math.min(scrollSpeed * 50, 200); // 最多增加 200px
        const threshold = baseThreshold + speedMultiplier;

        const isNearBottom = scrollTop + clientHeight >= scrollHeight - threshold;

        if (isNearBottom) {
          onScrollToBottom();
        }

        // 更新滚动状态
        lastScrollTop = scrollTop;
        lastScrollTime = now;
      }, 100) as unknown as number; // 减少延时以更快响应
    };

    // 初始检查，如果内容不够高度，立即触发
    const checkInitialHeight = () => {
      const { scrollHeight, clientHeight } = container;
      if (scrollHeight <= clientHeight) {
        setTimeout(() => onScrollToBottom(), 100);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    checkInitialHeight();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [onScrollToBottom]);

  // 渲染文件图标
  const renderFileIcon = (file: StorageFile) => {
    const fileType = file.type === 'directory' ? 'directory' : getFileType(file.filename);
    return <FileIcon fileType={fileType} size="md" className="mr-3" />;
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent, file: StorageFile) => {
    // Only show context menu for files, not directories
    if (file.type !== 'file' || !onFileOpenAsText) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      file: null,
    });
  };

  const handleOpenAsText = () => {
    if (contextMenu.file && onFileOpenAsText) {
      onFileOpenAsText(contextMenu.file);
    }
  };
  const formatDate = (dateString: string): string => {
    // 如果日期字符串为空或无效，返回横杠
    if (!dateString || dateString.trim() === '') {
      return '—';
    }

    const date = new Date(dateString);

    // 如果日期无效，返回横杠
    if (Number.isNaN(date.getTime())) {
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
    <>
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
          {virtualizer.getVirtualItems().map(virtualItem => {
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
                  role="button"
                  tabIndex={0}
                  onClick={() => onFileClick(file)}
                  onContextMenu={e => handleContextMenu(e, file)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onFileClick(file);
                    }
                  }}
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

      {/* Context Menu */}
      {contextMenu.visible && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onOpenAsText={handleOpenAsText}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
};

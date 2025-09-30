import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';
import type { FC, MouseEvent } from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { defaultPluginAssociationService } from '../../services/defaultPluginAssociationService';
import { pluginFramework, type ViewerOption } from '../../services/plugin/pluginFramework';
import type { StorageFile } from '../../types';
import { FileIcon } from '../../utils/fileIcons';
import { getFileType } from '../../utils/fileTypes';
import { formatFileSize } from '../../utils/typeUtils';
import { ContextMenu } from '../common/ContextMenu';

interface FileGridViewProps {
  files: StorageFile[];
  onFileClick: (file: StorageFile) => void;
  onFileOpenAsText?: (file: StorageFile) => void;
  onFileOpenWithPlugin?: (file: StorageFile, pluginId: string) => void;
  onScrollToBottom?: () => void;
}

export const FileGridView: FC<FileGridViewProps> = ({
  files,
  onFileClick,
  onFileOpenAsText,
  onFileOpenWithPlugin,
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
    compatiblePlugins: ViewerOption[];
    defaultPluginId: string | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    file: null,
    compatiblePlugins: [],
    defaultPluginId: null,
  });

  // 创建虚拟化容器引用
  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (parentRef.current) {
        setContainerWidth(parentRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 根据屏幕宽度计算每行显示的列数
  const getColumnsCount = () => {
    if (containerWidth === 0) return 4; // 默认值

    // 移动端：2列
    if (isMobile) return 2;

    // 桌面端：根据宽度动态计算
    // 每个网格项宽度约 180px，加上间距
    const itemWidth = 180;
    const gap = 12;
    const padding = 48; // 左右padding
    const availableWidth = containerWidth - padding;
    const columns = Math.floor(availableWidth / (itemWidth + gap));

    // 最少2列，最多6列
    return Math.max(2, Math.min(6, columns));
  };

  const columnsCount = getColumnsCount();

  // 计算虚拟化的行数
  const rowCount = Math.ceil(files.length / columnsCount);

  // 虚拟化配置 - 按行虚拟化
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 132 : 148), // 每行高度：卡片高度 + 间距
    overscan: 3, // 预渲染行数
  });

  // 添加滚动到底部检测逻辑
  useEffect(() => {
    const container = parentRef.current;
    if (!container || !onScrollToBottom) return;

    let timeoutId: number | null = null;
    let lastScrollTop = 0;
    let lastScrollTime = Date.now();

    const handleScroll = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        const { scrollTop, scrollHeight, clientHeight } = container;

        if (scrollHeight <= clientHeight) {
          onScrollToBottom();
          return;
        }

        const now = Date.now();
        const scrollDistance = scrollTop - lastScrollTop;
        const timeElapsed = now - lastScrollTime;
        const scrollSpeed = Math.abs(scrollDistance) / Math.max(timeElapsed, 1);

        const baseThreshold = 300;
        const speedMultiplier = Math.min(scrollSpeed * 50, 200);
        const threshold = baseThreshold + speedMultiplier;

        const isNearBottom = scrollTop + clientHeight >= scrollHeight - threshold;

        if (isNearBottom) {
          onScrollToBottom();
        }

        lastScrollTop = scrollTop;
        lastScrollTime = now;
      }, 100) as unknown as number;
    };

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

  // Handle right-click context menu
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>, file: StorageFile) => {
    if (file.type !== 'file' || !onFileOpenAsText) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const compatiblePlugins = pluginFramework.getCompatiblePlugins(file.filename);
    const defaultPluginId = defaultPluginAssociationService.getDefaultPluginForFile(file.filename);

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file,
      compatiblePlugins,
      defaultPluginId,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      file: null,
      compatiblePlugins: [],
      defaultPluginId: null,
    });
  };

  const handleOpenAsText = () => {
    if (contextMenu.file && onFileOpenAsText) {
      onFileOpenAsText(contextMenu.file);
    }
  };

  const handleOpenWithPlugin = (pluginId: string, setAsDefault: boolean) => {
    if (!contextMenu.file || !onFileOpenWithPlugin) {
      return;
    }

    if (setAsDefault) {
      const extension = defaultPluginAssociationService.getExtensionFromFilename(
        contextMenu.file.filename
      );
      if (extension) {
        defaultPluginAssociationService.setDefaultPlugin(extension, pluginId);
      }
    }

    onFileOpenWithPlugin(contextMenu.file, pluginId);
  };

  // 渲染文件图标
  const renderFileIcon = (file: StorageFile) => {
    const fileType = file.type === 'directory' ? 'directory' : getFileType(file.filename);
    return <FileIcon fileType={fileType} size="lg" className="mb-2" filename={file.filename} />;
  };

  return (
    <div ref={parentRef} className="h-full overflow-auto py-2" data-virtualized-container="true">
      <div
        className="w-full relative"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const startIndex = virtualRow.index * columnsCount;
          const endIndex = Math.min(startIndex + columnsCount, files.length);
          const rowFiles = files.slice(startIndex, endIndex);

          return (
            <div
              key={virtualRow.key}
              className="absolute top-0 left-0 w-full px-5"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="grid gap-3 h-full items-center"
                style={{
                  gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))`,
                }}
              >
                {rowFiles.map((file, colIndex) => (
                  <div
                    key={`${startIndex + colIndex}-${file.filename}`}
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
                    className="flex flex-col items-center justify-center px-3 py-2.5 rounded-lg border border-gray-200/60 dark:border-gray-700/60 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 hover:border-indigo-400/60 dark:hover:border-indigo-500/60 cursor-pointer transition-all duration-200 group h-[136px]"
                  >
                    {/* 文件图标 */}
                    <div className="flex-shrink-0 my-2 scale-150">{renderFileIcon(file)}</div>

                    {/* 文件名 */}
                    <div
                      className="text-sm text-center font-medium text-gray-900 dark:text-gray-100 w-full truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
                      title={file.basename}
                    >
                      {file.basename}
                    </div>

                    {/* 文件大小 */}
                    {file.type === 'file' && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
                        {formatFileSize(file.size)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.file && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          compatiblePlugins={contextMenu.compatiblePlugins}
          defaultPluginId={contextMenu.defaultPluginId}
          onOpenAsText={handleOpenAsText}
          onOpenWithPlugin={handleOpenWithPlugin}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { X, Download, Check, AlertCircle, StopCircle, FolderOpen, Square, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatFileSize } from '../utils/fileUtils';
import { FolderDownloadService } from '../services/folderDownloadService';
import { commands } from '../types/tauri-commands';

interface DownloadProgressProps {
  isVisible: boolean;
  onClose: () => void;
}

interface DownloadState {
  filename: string;
  progress: number;
  downloaded: number;
  totalSize: number;
  status: 'preparing' | 'downloading' | 'completed' | 'error' | 'stopped';
  filePath?: string;
  error?: string;
  // 文件夹下载特有属性
  isFolder?: boolean;
  currentFile?: string;
  completedFiles?: number;
  totalFiles?: number;
}

// 错误信息翻译辅助函数
const translateDownloadError = (error: string, t: (key: string) => string): string => {
  // 检查是否是翻译键（以字母开头，包含点号）
  if (error.match(/^[a-zA-Z][a-zA-Z0-9.]+$/)) {
    return t(error);
  }

  // 否则返回原始错误信息
  return error;
};

// 下载项组件
const DownloadItem = ({
  download,
  onCancel,
  onRemove,
  onOpenLocation,
  t
}: {
  download: DownloadState;
  onCancel: (filename: string) => void;
  onRemove: (filename: string) => void;
  onOpenLocation: (filePath: string) => void;
  t: (key: string) => string;
}) => (
  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          {(download.status === 'downloading' || download.status === 'preparing') && (
            <div className="w-4 h-4 border-2 border-blue-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {download.status === 'completed' && (
            <Check className="w-4 h-4 text-green-500 dark:text-green-400" />
          )}
          {download.status === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
          )}
          {download.status === 'stopped' && (
            <Pause className="w-4 h-4 text-orange-500 dark:text-orange-400" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {download.filename}
          </span>
        </div>

        {(download.status === 'downloading' || download.status === 'preparing') && (
          <div className="mt-2">
            {download.status === 'preparing' ? (
              <div className="text-xs text-blue-600 dark:text-blue-400">
                {download.currentFile || '准备下载...'}
              </div>
            ) : (
              <>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{download.progress}%</span>
                  <span>
                    {formatFileSize(download.downloaded)}
                    {download.totalSize > 0 && ` / ${formatFileSize(download.totalSize)}`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${download.progress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {download.status === 'completed' && download.filePath && (
          <div className="mt-1">
            <div
              className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded transition-colors"
              onClick={() => onOpenLocation(download.filePath!)}
              title={t('download.open.location.tooltip')}
            >
              <FolderOpen className="w-3 h-3 text-gray-500 dark:text-gray-400" />
              <p className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">
                {t('download.saved.to')}: {download.filePath}
              </p>
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 ml-4">
              {formatFileSize(download.downloaded)} {t('download.completed')}
            </p>
          </div>
        )}

        {download.status === 'error' && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            {t('download.error')}: {translateDownloadError(download.error || '', t)}
          </p>
        )}

        {download.status === 'stopped' && (
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
            {download.currentFile || t('download.status.stopped')}
          </p>
        )}
      </div>

      {(download.status === 'downloading' || download.status === 'preparing') && (
        <button
          onClick={() => onCancel(download.filename)}
          className="ml-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          title={t('download.cancel.tooltip')}
        >
          <StopCircle className="w-4 h-4" />
        </button>
      )}

      {(download.status === 'completed' || download.status === 'error' || download.status === 'stopped') && (
        <button
          onClick={() => onRemove(download.filename)}
          className="ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          title={download.status === 'stopped' ? t('download.remove.stopped') : undefined}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  </div>
);

export default function DownloadProgress({ isVisible, onClose }: DownloadProgressProps) {
  const { t } = useTranslation();
  const [downloads, setDownloads] = useState(new Map<string, DownloadState>());
  const [isMinimized, setIsMinimized] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    const unlistenStart = listen('download-started', (event) => {
      const { filename, total_size } = event.payload as { filename: string; total_size: number };
      setDownloads(prev => new Map(prev.set(filename, {
        filename,
        progress: 0,
        downloaded: 0,
        totalSize: total_size,
        status: 'downloading'
      })));
    });

    const unlistenProgress = listen('download-progress', (event) => {
      const { filename, downloaded, total_size, progress } = event.payload as {
        filename: string;
        downloaded: number;
        total_size: number;
        progress: number;
      };

      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(filename);
        if (existing) {
          newMap.set(filename, {
            ...existing,
            progress,
            downloaded,
            totalSize: total_size
          });
        }
        return newMap;
      });
    });

    const unlistenCompleted = listen('download-completed', (event) => {
      const { filename, file_path } = event.payload as { filename: string; file_path: string };
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(filename);
        if (existing) {
          newMap.set(filename, {
            ...existing,
            status: 'completed',
            filePath: file_path,
            progress: 100
          });
        }
        return newMap;
      });
    });

    const unlistenError = listen('download-error', (event) => {
      const { filename, error } = event.payload as { filename: string; error: string };

      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(filename);
        if (existing) {
          // 如果错误信息包含"cancelled"，则标记为stopped而不是error
          const isCancelled = error.includes('cancelled');
          newMap.set(filename, {
            ...existing,
            status: isCancelled ? 'stopped' : 'error',
            error: isCancelled ? undefined : error
          });
        }
        return newMap;
      });
    });

    return () => {
      unlistenStart.then(fn => fn());
      unlistenProgress.then(fn => fn());
      unlistenCompleted.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, [isVisible]);

  const cancelDownload = async (filename: string) => {
    try {
      const timeoutMs = 5000; // 5秒

      await Promise.race([
        commands.downloadCancel(filename),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`取消下载超时 (${timeoutMs}ms)`));
          }, timeoutMs);
        })
      ]);
      // 立即更新为stopped状态，与全部取消保持一致
        setDownloads(prev => {
          const newMap = new Map(prev);
          const existing = newMap.get(filename);
          if (existing && existing.status === 'downloading') {
            newMap.set(filename, {
              ...existing,
              status: 'stopped'
            });
          }
          return newMap;
        });
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  const removeDownload = (filename: string) => {
    setDownloads(prev => {
      const newMap = new Map(prev);
      newMap.delete(filename);
      return newMap;
    });
  };

  const openFileLocation = async (filePath: string) => {
    try {
      await revealItemInDir(filePath);
    } catch (error) {
      console.error('Failed to open file location:', error);
    }
  };

  const clearCompleted = () => {
    setDownloads(prev => {
      const newMap = new Map();
      prev.forEach((download, filename) => {
        if (download.status === 'downloading') {
          newMap.set(filename, download);
        }
      });
      return newMap;
    });
  };

  const stopAllDownloads = async () => {
    try {
      // 先获取当前正在下载的文件名列表
      const activeDownloads = Array.from(downloads.values())
        .filter(d => d.status === 'downloading')
        .map(d => d.filename);

      await FolderDownloadService.stopAllDownloads();
      // 也取消后端的所有下载
      await commands.downloadCancelAll();

      // 立即更新前端状态为stopped
      if (activeDownloads.length > 0) {
        setDownloads(prev => {
          const newMap = new Map(prev);
          activeDownloads.forEach(filename => {
            const existing = newMap.get(filename);
            if (existing && existing.status === 'downloading') {
              newMap.set(filename, {
                ...existing,
                status: 'stopped'
              });
            }
          });
          return newMap;
        });
      }

      console.log('All downloads stopped');
    } catch (error) {
      console.error('Failed to stop all downloads:', error);
    }
  };

  // 当用户点击关闭时，如果有活跃下载，则最小化，否则完全关闭
  const handleClose = () => {
    const downloadList = Array.from(downloads.values()).reverse(); // 简单倒序，最新的在前面
    const hasActiveDownloads = downloadList.some(d => d.status === 'downloading');

    if (hasActiveDownloads) {
      setIsMinimized(true);
    } else {
      onClose();
    }
  };

  // 完全关闭（不管是否有活跃下载）
  const forceClose = () => {
    onClose();
  };

  // 展开最小化窗口
  const expandWindow = () => {
    setIsMinimized(false);
  };

  // 准备数据和虚拟化配置（必须在任何条件返回之前）
  const downloadList = Array.from(downloads.values()).reverse(); // 倒序显示，最新的在前面
  const shouldUseVirtualization = downloadList.length > 10;

  // 虚拟化配置 - 始终初始化，避免 hooks 规则违反
  const virtualizer = useVirtualizer({
    count: downloadList.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 80, // 每个下载项的估计高度
    overscan: 5,
  });

  // 如果没有下载或者组件不可见，什么都不显示
  if (!isVisible || downloads.size === 0) return null;

  const hasCompleted = downloadList.some(d => d.status === 'completed');
  const hasActiveDownloads = downloadList.some(d => d.status === 'downloading' || d.status === 'preparing');
  const activeDownloadCount = downloadList.filter(d => d.status === 'downloading' || d.status === 'preparing').length;
  const totalProgress = downloadList.length > 0
    ? Math.round(downloadList.reduce((sum, d) => sum + d.progress, 0) / downloadList.length)
    : 0;

  // 最小化模式：显示小的悬浮窗
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 cursor-pointer hover:shadow-2xl transition-shadow"
        onClick={expandWindow}
      >
        <div className="flex items-center px-3 py-2 space-x-2">
          <div className="w-3 h-3 border-2 border-blue-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {activeDownloadCount} {t('download.active')}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {totalProgress}%
          </span>
          {!hasActiveDownloads && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                forceClose();
              }}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
              title={t('download.close')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // 完整模式：显示详细的下载列表
  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <Download className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('download.progress.title')}</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">({downloads.size})</span>
        </div>
        <div className="flex items-center space-x-2">
          {hasActiveDownloads && (
            <button
              onClick={stopAllDownloads}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-1"
              title={t('download.stop.all')}
            >
              <Square className="w-3 h-3" />
              <span>{t('download.stop.all')}</span>
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {t('download.clear.completed')}
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title={hasActiveDownloads ? t('download.minimize') : t('download.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Downloads List */}
      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto"
        style={{ height: '20rem' }} // 固定高度用于虚拟化
      >
        {shouldUseVirtualization ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => (
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
              >
                <DownloadItem
                  download={downloadList[virtualItem.index]}
                  onCancel={cancelDownload}
                  onRemove={removeDownload}
                  onOpenLocation={openFileLocation}
                  t={t}
                />
              </div>
            ))}
          </div>
        ) : (
          downloadList.map((download) => (
            <DownloadItem
              key={download.filename}
              download={download}
              onCancel={cancelDownload}
              onRemove={removeDownload}
              onOpenLocation={openFileLocation}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
};

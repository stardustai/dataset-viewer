import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { X, Download, Check, AlertCircle, StopCircle, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatFileSize } from '../utils/fileUtils';

interface DownloadProgressProps {
  isVisible: boolean;
  onClose: () => void;
}

interface DownloadState {
  filename: string;
  progress: number;
  downloaded: number;
  totalSize: number;
  status: 'downloading' | 'completed' | 'error';
  filePath?: string;
  error?: string;
}

export const DownloadProgress: React.FC<DownloadProgressProps> = ({ isVisible, onClose }) => {
  const { t } = useTranslation();
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(new Map());

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
      
      // 如果是用户取消，直接移除下载项，不显示错误
      if (error === 'CANCELLED') {
        setDownloads(prev => {
          const newMap = new Map(prev);
          newMap.delete(filename);
          return newMap;
        });
        return;
      }
      
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(filename);
        if (existing) {
          newMap.set(filename, {
            ...existing,
            status: 'error',
            error
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
        invoke('cancel_download', { filename }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`取消下载超时 (${timeoutMs}ms)`));
          }, timeoutMs);
        })
      ]);
      // 立即更新状态为取消
      setDownloads(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(filename);
        if (existing && existing.status === 'downloading') {
          newMap.set(filename, {
            ...existing,
            status: 'error',
            error: t('download.cancelled')
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

  if (!isVisible || downloads.size === 0) return null;

  const downloadList = Array.from(downloads.values());
  const hasCompleted = downloadList.some(d => d.status === 'completed');

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
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {t('download.clear.completed')}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Downloads List */}
      <div className="max-h-80 overflow-y-auto">
        {downloadList.map((download) => (
          <div key={download.filename} className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  {download.status === 'downloading' && (
                    <div className="w-4 h-4 border-2 border-blue-500 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {download.status === 'completed' && (
                    <Check className="w-4 h-4 text-green-500 dark:text-green-400" />
                  )}
                  {download.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {download.filename}
                  </span>
                </div>

                {download.status === 'downloading' && (
                  <div className="mt-2">
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
                  </div>
                )}

                {download.status === 'completed' && download.filePath && (
                  <div className="mt-1">
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded transition-colors"
                      onClick={() => openFileLocation(download.filePath!)}
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
                    {t('download.error')}: {download.error}
                  </p>
                )}
              </div>

              {download.status === 'downloading' && (
                <button
                  onClick={() => cancelDownload(download.filename)}
                  className="ml-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={t('download.cancel.tooltip')}
                >
                  <StopCircle className="w-4 h-4" />
                </button>
              )}

              {(download.status === 'completed' || download.status === 'error') && (
                <button
                  onClick={() => removeDownload(download.filename)}
                  className="ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

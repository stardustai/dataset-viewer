import React, { useState, useEffect } from 'react';
import { Archive, Search, Copy, AlertCircle } from 'lucide-react';
import { ArchiveInfo, ArchiveEntry, FilePreview } from '../types';
import { CompressionService } from '../services/compression';
import { copyToClipboard, showCopyToast } from '../utils/clipboard';

import { VirtualizedArchiveList } from './VirtualizedArchiveList';
import { LoadingDisplay, ErrorDisplay, StatusDisplay } from './common';
import { useTranslation } from 'react-i18next';

// 文件大小格式化工具函数
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface ArchiveViewerProps {
  url: string;
  headers: Record<string, string>;
  filename: string;
}

interface LoadMoreProgress {
  currentChunk: number;
  totalSize: number;
  loadedSize: number;
}

export const ArchiveViewer: React.FC<ArchiveViewerProps> = ({
  url,
  headers,
  filename
}) => {
  const { t } = useTranslation();
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null); // 新增：专门用于预览错误
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreProgress, setLoadMoreProgress] = useState<LoadMoreProgress>({
    currentChunk: 0,
    totalSize: 0,
    loadedSize: 0
  });
  const [currentLoadedSize, setCurrentLoadedSize] = useState(128 * 1024); // 已加载的内容大小，初始为128KB

  useEffect(() => {
    loadArchiveInfo();
  }, [url, filename]);

  const loadArchiveInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // 对于大文件，只加载前几MB来分析结构
      const maxSize = 10 * 1024 * 1024; // 10MB
      const info = await CompressionService.analyzeArchive(
        url,
        headers,
        filename,
        maxSize
      );

      setArchiveInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载压缩文件失败');
    } finally {
      setLoading(false);
    }
  };

  const loadDetailedArchiveInfo = async () => {
    if (!filename.toLowerCase().endsWith('.zip')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const detailedInfo = await CompressionService.analyzeArchive(
        url,
        headers,
        filename
      );

      setArchiveInfo(detailedInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载详细信息失败');
    } finally {
      setLoading(false);
    }
  };

  const previewFile = async (entry: ArchiveEntry) => {
    // 检查是否为占位符条目（大文件的流式处理条目）
    // 占位符条目特征：is_dir=true, size=0, 且分析状态为Streaming
    if (entry.is_dir && entry.size === 0 && archiveInfo?.analysis_status?.Streaming !== undefined) {
      await loadDetailedArchiveInfo();
      return;
    }

    if (entry.is_dir) return;

    try {
      setPreviewLoading(true);
      setSelectedEntry(entry);
      setFilePreview(null);
      setPreviewError(null); // 清除之前的预览错误
      setCurrentLoadedSize(128 * 1024); // 重置为初始加载大小

      // 简化预览策略：直接尝试获取预览，后端会智能处理
      const preview = await CompressionService.extractFilePreview(
        url,
        headers,
        filename,
        entry.path,
        128 * 1024 // 128KB预览
      );
      setFilePreview(preview);

    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '预览文件失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadMoreContent = async (entry: ArchiveEntry) => {
    if (!filePreview || isLoadingMore) return;

    try {
      setIsLoadingMore(true);

      // 计算下一块要加载的大小（每次加载512KB或剩余大小）
      const chunkSize = 512 * 1024; // 512KB
      const nextLoadSize = Math.min(currentLoadedSize + chunkSize, entry.size);

      setLoadMoreProgress({
        currentChunk: 0,
        totalSize: entry.size,
        loadedSize: currentLoadedSize
      });

      // 模拟加载进度
      const startSize = currentLoadedSize;
      let currentProgress = startSize;
      const targetSize = nextLoadSize;

      const interval = setInterval(() => {
        currentProgress += (targetSize - startSize) * 0.1;
        if (currentProgress >= targetSize) {
          currentProgress = targetSize;
          clearInterval(interval);
        }
        setLoadMoreProgress(prev => ({
          ...prev,
          loadedSize: currentProgress
        }));
      }, 100);

      // 加载更多内容
      const expandedPreview = await CompressionService.extractFilePreview(
        url,
        headers,
        filename,
        entry.path,
        nextLoadSize // 加载到新的大小
      );

      clearInterval(interval);
      setFilePreview(expandedPreview);
      setCurrentLoadedSize(nextLoadSize);
      setPreviewError(null); // 清除预览错误

      setLoadMoreProgress(prev => ({
        ...prev,
        loadedSize: nextLoadSize
      }));

    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '加载更多内容失败');
    } finally {
      setIsLoadingMore(false);
      // 延迟重置进度，让用户看到加载完成状态
      setTimeout(() => {
        setLoadMoreProgress({
          currentChunk: 0,
          totalSize: 0,
          loadedSize: 0
        });
      }, 1000);
    }
  };

  // 复制压缩包内文件路径到剪贴板
  const copyFilePath = async (entry: ArchiveEntry) => {
    try {
      const fullPath = `${filename}:/${entry.path}`;
      const success = await copyToClipboard(fullPath);
      if (success) {
        showCopyToast(t('copied.to.clipboard'));
      } else {
        showCopyToast(t('copy.failed'));
      }
    } catch (err) {
      console.error('复制路径失败:', err);
      showCopyToast(t('copy.failed'));
    }
  };

  const filteredEntries = archiveInfo?.entries.filter(entry =>
    entry.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <LoadingDisplay
        message={t('loading.analyzing.archive')}
        icon={Archive}
      />
    );
  }

  if (error) {
    return (
      <ErrorDisplay
        message={error}
        onRetry={loadArchiveInfo}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex min-h-0">
        {/* 文件列表 */}
        <div className="w-1/2 border-r flex flex-col min-h-0">
          <div className="p-4 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder={t('search.files.placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden min-h-0">
            {filteredEntries.length > 0 ? (
              <VirtualizedArchiveList
                entries={filteredEntries}
                onSelectEntry={previewFile}
                selectedPath={selectedEntry?.path}
                searchTerm={searchTerm}
                height={600}
              />
            ) : searchTerm ? (
              <StatusDisplay
                type="noSearchResults"
                message="未找到匹配的文件"
                secondaryMessage={`请尝试不同的搜索关键词 "${searchTerm}"`}
              />
            ) : (
              <StatusDisplay
                type="archiveEmpty"
                message="压缩文件为空"
              />
            )}
          </div>
        </div>

        {/* 文件预览 */}
        <div className="w-1/2 flex flex-col min-h-0">
          {previewLoading ? (
            <LoadingDisplay message={t('loading.preview')} />
          ) : selectedEntry ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium truncate">{selectedEntry.path}</h3>
                      {/* 复制文件路径按钮 */}
                      <button
                        onClick={() => copyFilePath(selectedEntry)}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        title={t('copy.full.path')}
                      >
                        <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('file.size.label')}: {formatFileSize(selectedEntry.size)}
                      {selectedEntry.modified_time && (
                        <span className="ml-4">
                          {t('file.modified.time')}: {new Date(selectedEntry.modified_time).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 min-h-0">
                {previewError ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="mb-4">
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          预览失败
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                          {previewError}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPreviewError(null);
                          if (selectedEntry) {
                            previewFile(selectedEntry);
                          }
                        }}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
                      >
                        重试预览
                      </button>
                    </div>
                  </div>
                ) : filePreview ? (
                  <div className="h-full flex flex-col min-h-0">
                    <div className="flex-1 overflow-auto min-h-0">
                      <pre className="whitespace-pre-wrap text-sm font-mono p-4 bg-gray-50 dark:bg-gray-900 rounded border">
                        {filePreview.content}
                      </pre>
                    </div>

                    {selectedEntry && currentLoadedSize < selectedEntry.size && (
                      <div className="p-3 border-t bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                        {isLoadingMore && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{t('loading.more.content')}</span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {formatFileSize(loadMoreProgress.loadedSize)} / {formatFileSize(loadMoreProgress.totalSize)}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${loadMoreProgress.totalSize > 0 ? Math.min(100, (loadMoreProgress.loadedSize / loadMoreProgress.totalSize) * 100) : 0}%`
                                }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            已显示 {formatFileSize(currentLoadedSize)}，完整文件 {formatFileSize(selectedEntry.size)}
                            {currentLoadedSize < selectedEntry.size && (
                              <span className="text-gray-500">
                                {' '}（剩余 {formatFileSize(selectedEntry.size - currentLoadedSize)}）
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => loadMoreContent(selectedEntry)}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoadingMore}
                          >
                            {isLoadingMore ? '加载中...' :
                             (selectedEntry.size - currentLoadedSize > 512 * 1024 ? '加载更多 (512KB)' : '加载完整内容')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <StatusDisplay
                    type="previewEmpty"
                    message="正在准备预览..."
                  />
                )}
              </div>
            </div>
          ) : (
            <StatusDisplay
              type="previewEmpty"
              message="选择一个文件进行预览"
            />
          )}
        </div>
      </div>
    </div>
  );
};

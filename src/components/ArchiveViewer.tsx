import React, { useState, useEffect } from 'react';
import { Archive, Search, Play, Pause, RotateCcw } from 'lucide-react';
import { ArchiveInfo, ArchiveEntry, FilePreview, CompressedFileChunk, CompressedFileEvent } from '../types';
import { CompressionService } from '../services/compression';

import { VirtualizedArchiveList } from './VirtualizedArchiveList';
import { LoadingDisplay, ErrorDisplay, StatusDisplay } from './common';

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

interface StreamingContent {
  chunks: string[];
  isComplete: boolean;
  error?: string;
  totalChunks?: number;
  isPaused?: boolean;
}

interface StreamingProgress {
  currentChunk: number;
  totalSize: number;
  loadedSize: number;
}

export const ArchiveViewer: React.FC<ArchiveViewerProps> = ({
  url,
  headers,
  filename
}) => {
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [streamingContent, setStreamingContent] = useState<StreamingContent | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreProgress, setLoadMoreProgress] = useState<StreamingProgress>({
    currentChunk: 0,
    totalSize: 0,
    loadedSize: 0
  });
  const [currentLoadedSize, setCurrentLoadedSize] = useState(128 * 1024); // 已加载的内容大小，初始为128KB
  const [streamProgress, setStreamProgress] = useState<StreamingProgress>({
    currentChunk: 0,
    totalSize: 0,
    loadedSize: 0
  });

  useEffect(() => {
    loadArchiveInfo();
  }, [url, filename]);

  const loadArchiveInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      // 对于大文件，只加载前几MB来分析结构
      const maxSize = 10 * 1024 * 1024; // 10MB
      const info = await CompressionService.analyzeCompressedFile(
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

      const detailedInfo = await CompressionService.loadZipFileDetails(
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
      setStreamingContent(null);
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
      setError(err instanceof Error ? err.message : '预览文件失败');
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

      setLoadMoreProgress(prev => ({
        ...prev,
        loadedSize: nextLoadSize
      }));

    } catch (err) {
      setError(err instanceof Error ? err.message : '加载更多内容失败');
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

  const streamFile = async (entry: ArchiveEntry) => {
    try {
      setIsStreaming(true);
      const content: StreamingContent = {
        chunks: [],
        isComplete: false,
        isPaused: false
      };
      setStreamingContent(content);
      setStreamProgress({
        currentChunk: 0,
        totalSize: entry.size,
        loadedSize: 0
      });

      await CompressionService.streamCompressedFile(
        url,
        headers,
        filename,
        entry.path,
        8192, // 8KB chunks
        (chunk: CompressedFileChunk) => {
          setStreamingContent(prev => {
            if (!prev) return null;
            const newChunks = [...prev.chunks];
            newChunks[chunk.chunk_index] = chunk.content;
            return {
              ...prev,
              chunks: newChunks
            };
          });

          setStreamProgress(prev => ({
            ...prev,
            currentChunk: chunk.chunk_index + 1,
            loadedSize: prev.loadedSize + chunk.content.length
          }));
        },
        (event: CompressedFileEvent) => {
          setStreamingContent(prev => prev ? {
            ...prev,
            isComplete: true,
            totalChunks: event.total_chunks
          } : null);
          setIsStreaming(false);
        },
        (event: CompressedFileEvent) => {
          setStreamingContent(prev => prev ? {
            ...prev,
            error: event.error
          } : null);
          setIsStreaming(false);
        }
      );
    } catch (err) {
      setStreamingContent(prev => prev ? {
        ...prev,
        error: err instanceof Error ? err.message : '流式读取失败'
      } : null);
      setIsStreaming(false);
    }
  };

  const pauseResumeStream = () => {
    setStreamingContent(prev => prev ? {
      ...prev,
      isPaused: !prev.isPaused
    } : null);
  };

  const resetStream = () => {
    setStreamingContent(null);
    setIsStreaming(false);
    setStreamProgress({
      currentChunk: 0,
      totalSize: 0,
      loadedSize: 0
    });
  };

  const filteredEntries = archiveInfo?.entries.filter(entry =>
    entry.path.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <LoadingDisplay
        message="正在分析压缩文件..."
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
                placeholder="搜索文件..."
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
            <LoadingDisplay message="加载预览..." />
          ) : selectedEntry ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 border-b bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <h3 className="font-medium">{selectedEntry.path}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  大小: {formatFileSize(selectedEntry.size)}
                  {selectedEntry.modified_time && (
                    <span className="ml-4">
                      修改时间: {new Date(selectedEntry.modified_time).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex-1 overflow-auto p-4 min-h-0">
                {streamingContent ? (
                  <div className="h-full flex flex-col min-h-0">
                    {/* 流式控制栏 */}
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">流式加载进度:</span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            第 {streamProgress.currentChunk} 块
                            {streamingContent.totalChunks && ` / ${streamingContent.totalChunks}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isStreaming && (
                            <button
                              onClick={pauseResumeStream}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title={streamingContent.isPaused ? "继续" : "暂停"}
                            >
                              {streamingContent.isPaused ? <Play size={16} /> : <Pause size={16} />}
                            </button>
                          )}
                          <button
                            onClick={resetStream}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                            title="重置"
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </div>

                      {/* 进度条 */}
                      {streamProgress.totalSize > 0 && (
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, (streamProgress.loadedSize / streamProgress.totalSize) * 100)}%`
                            }}
                          />
                        </div>
                      )}

                      {/* 状态信息 */}
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {isStreaming && !streamingContent.isPaused && (
                          <span className="text-blue-600 dark:text-blue-400">正在加载...</span>
                        )}
                        {streamingContent.isPaused && (
                          <span className="text-yellow-600 dark:text-yellow-400">已暂停</span>
                        )}
                        {streamingContent.isComplete && (
                          <span className="text-green-600 dark:text-green-400">加载完成</span>
                        )}
                      </div>
                    </div>

                    {/* 内容显示 */}
                    <div className="flex-1 overflow-auto min-h-0">
                      {streamingContent.error ? (
                        <div className="p-4 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-400 rounded">
                          错误: {streamingContent.error}
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded border">
                          {streamingContent.chunks.join('')}
                        </pre>
                      )}
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
                              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">正在加载更多内容...</span>
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
                ) : null}
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

import React, { useState, useEffect } from 'react';
import { Archive, Search, Play, Pause, RotateCcw } from 'lucide-react';
import { ArchiveInfo, ArchiveEntry, FilePreview, CompressedFileChunk, CompressedFileEvent } from '../types';
import { CompressionService } from '../services/compression';
import { isStreamableArchive } from '../utils/fileTypes';
import { VirtualizedArchiveList } from './VirtualizedArchiveList';
import { LoadingDisplay, ErrorDisplay, StatusDisplay } from './common';

interface ArchiveViewerProps {
  url: string;
  headers: Record<string, string>;
  filename: string;
  onClose?: () => void;
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
  filename,
  onClose
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
    // 检查是否为占位符条目（需要加载详细信息）
    if (entry.is_dir && entry.path.includes('📁 ZIP Archive')) {
      await loadDetailedArchiveInfo();
      return;
    }

    if (entry.is_dir) return;

    try {
      setPreviewLoading(true);
      setSelectedEntry(entry);
      setFilePreview(null);
      setStreamingContent(null);

      // 对于小文件，直接获取预览
      if (entry.size < 1024 * 1024) { // 1MB以下
        const preview = await CompressionService.extractFilePreview(
          url,
          headers,
          filename,
          entry.path,
          64 * 1024 // 64KB预览
        );
        setFilePreview(preview);
      } else if (isStreamableArchive(filename)) {
        // 对于大文件，使用流式读取
        await streamFile(entry);
      } else {
        // 对于不支持流式读取的大文件，只显示基本信息
        setFilePreview({
          content: `文件太大，无法预览 (${CompressionService.formatFileSize(entry.size)})`,
          is_truncated: true,
          total_size: entry.size,
          encoding: 'utf-8'
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '预览文件失败');
    } finally {
      setPreviewLoading(false);
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
      {/* 头部信息 */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Archive size={24} className="text-blue-500" />
            <h2 className="text-lg font-semibold">{filename}</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>

        {archiveInfo && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400">类型:</span>
              <span className="ml-2 font-medium">{archiveInfo.compression_type.toUpperCase()}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">文件数:</span>
              <span className="ml-2 font-medium">{archiveInfo.total_entries}</span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">压缩后:</span>
              <span className="ml-2 font-medium">
                {CompressionService.formatFileSize(archiveInfo.total_compressed_size)}
              </span>
            </div>
            <div>
              <span className="text-gray-600 dark:text-gray-400">解压后:</span>
              <span className="ml-2 font-medium">
                {CompressionService.formatFileSize(archiveInfo.total_uncompressed_size)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {/* 文件列表 */}
        <div className="w-1/2 border-r flex flex-col">
          <div className="p-4 border-b">
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

          <div className="flex-1 overflow-hidden">
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
        <div className="w-1/2 flex flex-col">
          {previewLoading ? (
            <LoadingDisplay message="加载预览..." />
          ) : selectedEntry ? (
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b bg-gray-50 dark:bg-gray-800">
                <h3 className="font-medium">{selectedEntry.path}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  大小: {CompressionService.formatFileSize(selectedEntry.size)}
                  {selectedEntry.modified_time && (
                    <span className="ml-4">
                      修改时间: {new Date(selectedEntry.modified_time).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {streamingContent ? (
                  <div>
                    {/* 流式控制栏 */}
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
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
                ) : filePreview ? (
                  <div>
                    <pre className="whitespace-pre-wrap text-sm">
                      {filePreview.content}
                    </pre>

                    {filePreview.is_truncated && (
                      <div className="mt-4 p-2 bg-yellow-50 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 rounded text-sm">
                        内容已截断，显示前 {CompressionService.formatFileSize(filePreview.content.length)} 字节
                        {isStreamableArchive(filename) && selectedEntry.size > 1024 * 1024 && (
                          <button
                            onClick={() => streamFile(selectedEntry)}
                            className="ml-2 px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                            disabled={isStreaming}
                          >
                            {isStreaming ? '加载中...' : '流式加载完整内容'}
                          </button>
                        )}
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

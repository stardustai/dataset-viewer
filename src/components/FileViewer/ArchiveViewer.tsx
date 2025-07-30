import React, { useState, useEffect, useCallback } from 'react';
import { Archive, Copy, AlertCircle, Folder } from 'lucide-react';
import { ArchiveEntry, ArchiveInfo, FilePreview, StorageFile } from '../../types';
import { CompressionService } from '../../services/compression';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';
import { getFileType, isTextFile, isMediaFile, isDataFile, isSpreadsheetFile } from '../../utils/fileTypes';
import { configManager } from '../../config';

import { ArchiveFileBrowser } from '../FileBrowser/ArchiveFileBrowser';
import { VirtualizedTextViewer } from './VirtualizedTextViewer';
import { MediaViewer } from './MediaViewer';
import { UniversalDataTableViewer } from './UniversalDataTableViewer';
import { LoadingDisplay, ErrorDisplay, StatusDisplay, UnsupportedFormatDisplay } from '../common';
import { useTranslation } from 'react-i18next';

// 文件大小格式化工具函数
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 安全的日期格式化函数
const formatModifiedTime = (timeString: string | undefined): string | null => {
  if (!timeString) return null;

  try {
    // 尝试解析日期
    const date = new Date(timeString);

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleString();
  } catch {
    return null;
  }
};

// 错误信息翻译辅助函数
const translateError = (error: string, t: (key: string) => string): string => {
  // 检查是否是翻译键（以字母开头，包含点号）
  if (error.match(/^[a-zA-Z][a-zA-Z0-9.]+$/)) {
    return t(error);
  }
  // 否则返回原始错误信息
  return error;
};

// 从错误对象中提取错误信息的辅助函数
const extractErrorMessage = (err: unknown, fallbackKey: string, t: (key: string) => string): string => {
  if (err instanceof Error) {
    return err.message;
  } else if (typeof err === 'string') {
    return err;
  } else if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  } else {
    return t(fallbackKey);
  }
};

interface ArchiveViewerProps {
  url: string;
  headers: Record<string, string>;
  filename: string;
  // 新增：可选的存储客户端，用于本地文件处理
  storageClient?: any;
}

// 移除不再需要的LoadMoreProgress接口

export const ArchiveViewer: React.FC<ArchiveViewerProps> = ({
  url,
  headers,
  filename,
  storageClient
}) => {
  const { t } = useTranslation();
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>(''); // 文本文件内容
  
  // 分块加载相关状态
  const [isLargeFile, setIsLargeFile] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [loadedContentSize, setLoadedContentSize] = useState(0);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoLoadTriggered, setAutoLoadTriggered] = useState(false);
  const [currentFilePosition, setCurrentFilePosition] = useState(0);
  
  // 非文本文件手动加载状态
  const [manualLoadRequested, setManualLoadRequested] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    loadArchiveInfo();
  }, [url, filename]);

  const loadArchiveInfo = async () => {
    try {
      setLoading(true);
      setError(null);

      let info: ArchiveInfo;

      // 检查是否有存储客户端，如果有则优先使用存储客户端接口
      if (storageClient && storageClient.analyzeArchive) {
        // 使用存储客户端的统一接口
        const maxSize = 1024 * 1024; // 1MB
        info = await storageClient.analyzeArchive(url, filename, maxSize);
      } else {
        // 回退到直接的压缩服务接口
        const maxSize = 1024 * 1024; // 1MB
        info = await CompressionService.analyzeArchive(
          url,
          headers,
          filename,
          maxSize
        );
      }

      setArchiveInfo(info);
    } catch (err) {
      const errorMessage = extractErrorMessage(err, 'error.load.archive', t);
      setError(translateError(errorMessage, t));
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

      let detailedInfo: ArchiveInfo;

      if (storageClient && storageClient.analyzeArchive) {
        // 使用存储客户端的统一接口，不限制大小以获取详细信息
        detailedInfo = await storageClient.analyzeArchive(url, filename);
      } else {
        // 回退到直接的压缩服务接口
        detailedInfo = await CompressionService.analyzeArchive(
          url,
          headers,
          filename
        );
      }

      setArchiveInfo(detailedInfo);
    } catch (err) {
      const errorMessage = extractErrorMessage(err, 'error.load.details', t);
      setError(translateError(errorMessage, t));
    } finally {
      setLoading(false);
    }
  };

  const previewFile = async (entry: ArchiveEntry) => {
    // 检查是否为占位符条目（大文件的流式处理条目）
    if (entry.is_dir && entry.size === 0 && archiveInfo?.analysis_status?.Streaming !== undefined) {
      await loadDetailedArchiveInfo();
      return;
    }

    // 设置选中状态
    setSelectedEntry(entry);

    if (entry.is_dir) {
      // 对于文件夹，清除预览内容
      setFilePreview(null);
      setFileContent('');
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    try {
      setPreviewLoading(true);
      setFilePreview(null);
      setFileContent('');
      setPreviewError(null);
      
      // 重置分块加载状态
      setIsLargeFile(false);
      setTotalSize(0);
      setLoadedContentSize(0);
      setLoadedChunks(0);
      setCurrentFilePosition(0);
      setLoadingMore(false);
      setAutoLoadTriggered(false);
      
      // 重置手动加载状态
      setManualLoadRequested(false);
      setManualLoading(false);

      const config = configManager.getConfig();
      const fileSize = entry.size || 0;
      setTotalSize(fileSize);
      
      // 判断是否为大文件（仅对文本文件启用分块加载）
      const isTextFileType = isTextFile(entry.path);
      const shouldUseChunking = isTextFileType && fileSize > config.streaming.maxInitialLoad;
      setIsLargeFile(shouldUseChunking);
      
      // 对于非文本文件，检查是否需要自动加载
      if (!isTextFileType) {
        const isMediaFileType = isMediaFile(entry.path);
        const isDataFileType = isDataFile(entry.path) || isSpreadsheetFile(entry.path);
        const shouldAutoLoadMedia = isMediaFileType && fileSize < 1024 * 1024; // 1MB
        const shouldAutoLoadData = isDataFileType && fileSize < 1024 * 1024; // 1MB
        
        // 小于1MB的媒体文件和数据文件自动加载，其他非文本文件不加载
        if (!shouldAutoLoadMedia && !shouldAutoLoadData) {
          // 创建一个空的预览对象，只包含文件信息
          const emptyPreview: FilePreview = {
            content: new Uint8Array(0),
            is_truncated: true,
            total_size: fileSize,
            preview_size: 0
          };
          setFilePreview(emptyPreview);
          return;
        }
        
        // 小媒体文件和数据文件自动加载完整内容
        const loadSize = fileSize;
        let preview: FilePreview;

        if (storageClient && storageClient.getArchiveFilePreview) {
          preview = await storageClient.getArchiveFilePreview(
            url,
            filename,
            entry.path,
            loadSize
          );
        } else {
          preview = await CompressionService.extractFilePreview(
            url,
            headers,
            filename,
            entry.path,
            loadSize
          );
        }

        setFilePreview(preview);
        setManualLoadRequested(true); // 标记为已加载
        return;
      }
      
      // 文本文件的加载逻辑
      const initialLoadSize = shouldUseChunking ? config.streaming.maxInitialLoad : Math.min(fileSize, 128 * 1024);

      let preview: FilePreview;

      if (storageClient && storageClient.getArchiveFilePreview) {
        preview = await storageClient.getArchiveFilePreview(
          url,
          filename,
          entry.path,
          initialLoadSize
        );
      } else {
        preview = await CompressionService.extractFilePreview(
          url,
          headers,
          filename,
          entry.path,
          initialLoadSize
        );
      }

      setFilePreview(preview);
      
      // 解码文本内容用于文本查看器
      if (preview.content) {
        try {
          const textContent = new TextDecoder('utf-8', { fatal: false }).decode(preview.content);
          setFileContent(textContent);
          setLoadedContentSize(preview.content.length);
          setLoadedChunks(1);
          setCurrentFilePosition(0);
        } catch (decodeError) {
          console.error('Failed to decode text content:', decodeError);
          setPreviewError(t('error.decode.text'));
        }
      }

    } catch (err) {
      const errorMessage = extractErrorMessage(err, 'error.preview.file', t);
      setPreviewError(translateError(errorMessage, t));
    } finally {
      setPreviewLoading(false);
    }
  };

  // 获取文件类型信息
  const getFileTypeInfo = (entry: ArchiveEntry) => {
    const fileType = getFileType(entry.path);
    return {
      fileType,
      isText: isTextFile(entry.path),
      isMedia: isMediaFile(entry.path),
      isData: isDataFile(entry.path),
      isSpreadsheet: isSpreadsheetFile(entry.path)
    };
  };

  // 创建虚拟文件路径用于查看器组件
  const createVirtualFilePath = (entry: ArchiveEntry) => {
    return `archive://${filename}/${entry.path}`;
  };

  // 加载更多内容的函数
  const loadMoreContent = useCallback(async (entry: ArchiveEntry) => {
    if (!isLargeFile || loadingMore || !isTextFile(entry.path)) return;

    setLoadingMore(true);
    try {
      const config = configManager.getConfig();
      const nextPosition = currentFilePosition + loadedContentSize;
      if (nextPosition >= totalSize) {
        setLoadingMore(false);
        return;
      }

      const remainingSize = totalSize - nextPosition;
      const chunkSize = Math.min(config.streaming.chunkSize, remainingSize);

      let additionalPreview: FilePreview;
      if (storageClient && storageClient.getArchiveFilePreview && typeof storageClient.getArchiveFilePreview === 'function') {
        // 检查storageClient是否支持偏移量参数
        try {
          additionalPreview = await storageClient.getArchiveFilePreview(
            url,
            filename,
            entry.path,
            chunkSize,
            nextPosition
          );
        } catch (offsetError) {
          // 如果不支持偏移量，回退到加载完整文件
          console.warn('StorageClient does not support offset, loading full file:', offsetError);
          const fullPreview = await storageClient.getArchiveFilePreview(
            url,
            filename,
            entry.path,
            totalSize
          );
          if (fullPreview.content && fullPreview.content.length > loadedContentSize) {
            const remainingContent = fullPreview.content.slice(loadedContentSize);
            const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(remainingContent);
            setFileContent(prev => prev + additionalText);
            setLoadedContentSize(fullPreview.content.length);
            setLoadedChunks(prev => prev + 1);
          }
          setLoadingMore(false);
          return;
        }
      } else {
        // CompressionService 目前不支持偏移量，需要加载完整文件
        console.warn('CompressionService does not support offset loading, loading full file');
        const fullPreview = await CompressionService.extractFilePreview(
          url,
          headers,
          filename,
          entry.path,
          totalSize
        );
        if (fullPreview.content && fullPreview.content.length > loadedContentSize) {
          const remainingContent = fullPreview.content.slice(loadedContentSize);
          const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(remainingContent);
          setFileContent(prev => prev + additionalText);
          setLoadedContentSize(fullPreview.content.length);
          setLoadedChunks(prev => prev + 1);
        }
        setLoadingMore(false);
        return;
      }

      if (additionalPreview.content) {
        const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(additionalPreview.content);
        setFileContent(prev => prev + additionalText);
        setLoadedContentSize(prev => prev + additionalPreview.content!.length);
        setLoadedChunks(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to load more content:', err);
      setPreviewError(t('error.load.more'));
    } finally {
      setLoadingMore(false);
    }
  }, [url, headers, filename, storageClient, isLargeFile, loadingMore, currentFilePosition, loadedContentSize, totalSize, t]);

  // 滚动到底部时的回调
  const handleScrollToBottom = useCallback(async () => {
    if (!selectedEntry || !isLargeFile || loadingMore || autoLoadTriggered) return;

    const currentEndPosition = currentFilePosition + loadedContentSize;
    if (currentEndPosition >= totalSize) return;

    setAutoLoadTriggered(true);
    await loadMoreContent(selectedEntry);

    setTimeout(() => {
      setAutoLoadTriggered(false);
    }, 1000);
  }, [selectedEntry, isLargeFile, loadingMore, autoLoadTriggered, currentFilePosition, loadedContentSize, totalSize, loadMoreContent]);

  // 手动加载完整内容的函数（用于非文本文件）
  const loadFullContent = useCallback(async (entry: ArchiveEntry) => {
    if (manualLoading) return;

    setManualLoading(true);
    try {
      let fullPreview: FilePreview;
      if (storageClient && storageClient.getArchiveFilePreview) {
        fullPreview = await storageClient.getArchiveFilePreview(
          url,
          filename,
          entry.path,
          entry.size || undefined // 加载完整文件
        );
      } else {
        fullPreview = await CompressionService.extractFilePreview(
          url,
          headers,
          filename,
          entry.path,
          entry.size || undefined // 加载完整文件
        );
      }

      setFilePreview(fullPreview);
      setManualLoadRequested(true);
      
      // 如果是文本文件，也更新文本内容
      if (isTextFile(entry.path) && fullPreview.content) {
        try {
          const textContent = new TextDecoder('utf-8', { fatal: false }).decode(fullPreview.content);
          setFileContent(textContent);
          setLoadedContentSize(fullPreview.content.length);
        } catch (decodeError) {
          console.error('Failed to decode text content:', decodeError);
        }
      }
    } catch (err) {
      console.error('Failed to load full content:', err);
      setPreviewError(t('error.load.full.content'));
    } finally {
      setManualLoading(false);
    }
  }, [url, headers, filename, storageClient, manualLoading, t]);


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
      console.error('Failed to copy path:', err);
      showCopyToast(t('copy.failed'));
    }
  };

  // 不再需要过滤逻辑，由ArchiveFileBrowser处理

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
        {/* 使用ArchiveFileBrowser组件 */}
        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
          {archiveInfo && (
            <ArchiveFileBrowser
              archiveInfo={archiveInfo}
              onFileSelect={previewFile}
              onBack={() => window.history.back()}
              archiveFileName={filename}
            />
          )}
        </div>

        {/* 文件预览 */}
        <div className="w-1/2 flex flex-col min-h-0">
          {previewLoading ? (
            <LoadingDisplay message={t('loading.preview')} />
          ) : selectedEntry ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-4 -my-0.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
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
                      {(() => {
                        const formattedTime = formatModifiedTime(selectedEntry.modified_time);
                        return formattedTime ? (
                          <span className="ml-4">
                            {t('file.modified.time')}: {formattedTime}
                          </span>
                        ) : null;
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto min-h-0">
                {previewError ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="mb-4">
                        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          {t('preview.failed')}
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
                        {t('retry.preview')}
                      </button>
                    </div>
                  </div>
                ) : selectedEntry?.is_dir ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                        <Folder className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        {t('folder.selected')}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                        {t('folder.info.message')}
                      </p>
                    </div>
                  </div>
                ) : selectedEntry && filePreview ? (
                  (() => {
                    const { isText, isMedia, isData, isSpreadsheet, fileType } = getFileTypeInfo(selectedEntry);
                    const virtualFilePath = createVirtualFilePath(selectedEntry);
                    
                    if (isText && fileContent) {
                      return (
                        <div className="h-full flex flex-col">
                          <VirtualizedTextViewer
                            content={fileContent}
                            searchTerm=""
                            onSearchResults={() => {}}
                            className="flex-1"
                            height={400} // 默认高度，实际会被CSS覆盖
                            onScrollToBottom={isLargeFile ? handleScrollToBottom : undefined}
                          />
                          {isLargeFile && (
                            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center justify-between">
                                <span>
                                  {t('file.loaded.chunks', { chunks: loadedChunks, size: formatFileSize(loadedContentSize) })}
                                </span>
                                {loadingMore && (
                                  <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                    <span>{t('loading.more.content')}</span>
                                  </div>
                                )}
                                {!loadingMore && loadedContentSize < totalSize && (
                                  <span className="text-blue-600 dark:text-blue-400">
                                    {t('scroll.to.load.more')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } else if (isMedia) {
                      // 媒体文件：小于1MB自动加载，大于1MB需要手动加载
                      const fileSize = selectedEntry.size || 0;
                      const shouldAutoLoad = fileSize < 1024 * 1024; // 1MB
                      
                      if (!shouldAutoLoad && !manualLoadRequested) {
                        return (
                          <div className="flex flex-col items-center justify-center h-64 m-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                            <div className="text-center mb-4">
                              <div className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('file.not.loaded')}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {t('file.size')}: {formatFileSize(fileSize)}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {t('media.large.file.manual.load')}
                              </div>
                            </div>
                            <button
                              onClick={() => loadFullContent(selectedEntry)}
                              disabled={manualLoading}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              {manualLoading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  {t('loading')}
                                </>
                              ) : (
                                t('load.full.content')
                              )}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <MediaViewer
                          filePath={virtualFilePath}
                          fileName={selectedEntry.path}
                          fileType={fileType as 'image' | 'pdf' | 'video' | 'audio'}
                          fileSize={selectedEntry.size}
                          previewContent={filePreview.content}
                        />
                      );
                    } else if (isData || isSpreadsheet) {
                      // 数据文件：小于1MB自动加载，大于1MB需要手动加载
                      const fileSize = selectedEntry.size || 0;
                      const shouldAutoLoad = fileSize < 1024 * 1024; // 1MB
                      
                      if (!shouldAutoLoad && !manualLoadRequested) {
                        return (
                          <div className="flex flex-col items-center justify-center h-64 m-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                            <div className="text-center mb-4">
                              <div className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('file.not.loaded')}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {t('file.size')}: {formatFileSize(selectedEntry.size || 0)}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                {t('data.large.file.manual.load')}
                              </div>
                            </div>
                            <button
                              onClick={() => loadFullContent(selectedEntry)}
                              disabled={manualLoading}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              {manualLoading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  {t('loading')}
                                </>
                              ) : (
                                t('load.full.content')
                              )}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <UniversalDataTableViewer
                          filePath={virtualFilePath}
                          fileName={selectedEntry.path}
                          fileSize={selectedEntry.size}
                          fileType={isSpreadsheet ? 
                            (selectedEntry.path.toLowerCase().endsWith('.xlsx') || selectedEntry.path.toLowerCase().endsWith('.xls') ? 'xlsx' : 'ods') :
                            (selectedEntry.path.toLowerCase().endsWith('.parquet') || selectedEntry.path.toLowerCase().endsWith('.pqt') ? 'parquet' : 'csv')
                          }
                          previewContent={filePreview.content}
                        />
                      );
                    } else {
                      // 不支持的格式：检查是否已手动加载
                      if (!manualLoadRequested) {
                        return (
                          <div className="flex flex-col items-center justify-center h-64 m-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                            <div className="text-center mb-4">
                              <div className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                                {t('file.not.loaded')}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                                {t('file.size')}: {formatFileSize(selectedEntry.size || 0)}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-gray-500">
                                {t('viewer.unsupported.format')}
                              </div>
                            </div>
                            <button
                              onClick={() => loadFullContent(selectedEntry)}
                              disabled={manualLoading}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              {manualLoading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  {t('loading')}
                                </>
                              ) : (
                                t('load.full.content')
                              )}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <UnsupportedFormatDisplay
                          message={t('viewer.unsupported.format')}
                          secondaryMessage={t('viewer.download.to.view')}
                        />
                      );
                    }
                  })()
                ) : (
                  <StatusDisplay
                    type="previewEmpty"
                    message={t('preparing.preview')}
                  />
                )}
              </div>
            </div>
          ) : (
            <StatusDisplay
              type="previewEmpty"
              message={t('select.file.for.preview')}
            />
          )}
        </div>
      </div>
    </div>
  );
};

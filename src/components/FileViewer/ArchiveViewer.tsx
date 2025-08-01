import React, { useState, useEffect, useCallback } from 'react';
import { Archive, Copy, AlertCircle, Folder, Download } from 'lucide-react';
import { ArchiveEntry, ArchiveInfo, FilePreview } from '../../types';
import { CompressionService } from '../../services/compression';
import { StorageServiceManager } from '../../services/storage/StorageManager';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';
import { getFileType, isTextFile, isMediaFile, isDataFile, isSpreadsheetFile } from '../../utils/fileTypes';
import { formatFileSize, formatModifiedTime } from '../../utils/fileUtils';
import { configManager } from '../../config';

import { ArchiveFileBrowser } from '../FileBrowser/ArchiveFileBrowser';
import { VirtualizedTextViewer } from './VirtualizedTextViewer';
import { MediaViewer } from './MediaViewer';
import { UniversalDataTableViewer } from './UniversalDataTableViewer';
import { LoadingDisplay, ErrorDisplay, StatusDisplay, UnsupportedFormatDisplay } from '../common';
import { ManualLoadButton } from './ManualLoadButton';
import { useTranslation } from 'react-i18next';

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
  // 从localStorage获取隐藏文件显示偏好
  const [showHidden, setShowHidden] = useState(() => {
    try {
      const saved = localStorage.getItem('file-viewer-show-hidden');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // 保存隐藏文件显示偏好到localStorage
  useEffect(() => {
    try {
      localStorage.setItem('file-viewer-show-hidden', JSON.stringify(showHidden));
    } catch {
      // 忽略localStorage错误
    }
  }, [showHidden]);
  
  // 文件加载状态管理
  const [fileLoadState, setFileLoadState] = useState({
    isLargeFile: false,
    totalSize: 0,
    loadedContentSize: 0,
    loadedChunks: 0,
    currentFilePosition: 0,
    loadingMore: false,
    autoLoadTriggered: false,
    manualLoadRequested: false,
    manualLoading: false
  });

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
      
      // 重置文件加载状态
      setFileLoadState({
        isLargeFile: false,
        totalSize: 0,
        loadedContentSize: 0,
        loadedChunks: 0,
        currentFilePosition: 0,
        loadingMore: false,
        autoLoadTriggered: false,
        manualLoadRequested: false,
        manualLoading: false
      });

      const config = configManager.getConfig();
      const fileSize = entry.size || 0;
      
      // 判断是否为大文件（仅对文本文件启用分块加载）
      const isTextFileType = isTextFile(entry.path);
      const shouldUseChunking = isTextFileType && fileSize > config.streaming.maxInitialLoad;
      
      setFileLoadState(prev => ({
        ...prev,
        totalSize: fileSize,
        isLargeFile: shouldUseChunking
      }));
      
      // 对于非文本文件，检查是否需要自动加载
      if (!isTextFileType) {
        const isMediaFileType = isMediaFile(entry.path);
        const isDataFileType = isDataFile(entry.path) || isSpreadsheetFile(entry.path);
        const shouldAutoLoadMedia = isMediaFileType && fileSize < 10 * 1024 * 1024; // 10MB
        const shouldAutoLoadData = isDataFileType && fileSize < 10 * 1024 * 1024; // 10MB
        
        // 小于10MB的媒体文件和数据文件自动加载，其他非文本文件不加载
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
        setFileLoadState(prev => ({ ...prev, manualLoadRequested: true })); // 标记为已加载
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
          setFileLoadState(prev => ({
            ...prev,
            loadedContentSize: preview.content.length,
            loadedChunks: 1,
            currentFilePosition: 0
          }));
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
    if (!fileLoadState.isLargeFile || fileLoadState.loadingMore || !isTextFile(entry.path)) return;

    setFileLoadState(prev => ({ ...prev, loadingMore: true }));
    try {
      const config = configManager.getConfig();
      const nextPosition = fileLoadState.currentFilePosition + fileLoadState.loadedContentSize;
      if (nextPosition >= fileLoadState.totalSize) {
        setFileLoadState(prev => ({ ...prev, loadingMore: false }));
        return;
      }

      const remainingSize = fileLoadState.totalSize - nextPosition;
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
            fileLoadState.totalSize
          );
          if (fullPreview.content && fullPreview.content.length > fileLoadState.loadedContentSize) {
            const remainingContent = fullPreview.content.slice(fileLoadState.loadedContentSize);
            const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(remainingContent);
            setFileContent(prev => prev + additionalText);
            setFileLoadState(prev => ({
              ...prev,
              loadedContentSize: fullPreview.content!.length,
              loadedChunks: prev.loadedChunks + 1,
              loadingMore: false
            }));
          } else {
            setFileLoadState(prev => ({ ...prev, loadingMore: false }));
          }
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
          fileLoadState.totalSize
        );
        if (fullPreview.content && fullPreview.content.length > fileLoadState.loadedContentSize) {
          const remainingContent = fullPreview.content.slice(fileLoadState.loadedContentSize);
          const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(remainingContent);
          setFileContent(prev => prev + additionalText);
          setFileLoadState(prev => ({
            ...prev,
            loadedContentSize: fullPreview.content!.length,
            loadedChunks: prev.loadedChunks + 1,
            loadingMore: false
          }));
        } else {
          setFileLoadState(prev => ({ ...prev, loadingMore: false }));
        }
        return;
      }

      if (additionalPreview.content) {
        const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(additionalPreview.content);
        setFileContent(prev => prev + additionalText);
        setFileLoadState(prev => ({
          ...prev,
          loadedContentSize: prev.loadedContentSize + additionalPreview.content!.length,
          loadedChunks: prev.loadedChunks + 1
        }));
      }
    } catch (err) {
      console.error('Failed to load more content:', err);
      setPreviewError(t('error.load.more'));
    } finally {
      setFileLoadState(prev => ({ ...prev, loadingMore: false }));
    }
  }, [url, headers, filename, storageClient, fileLoadState.isLargeFile, fileLoadState.loadingMore, fileLoadState.currentFilePosition, fileLoadState.loadedContentSize, fileLoadState.totalSize, t]);

  // 滚动到底部时的回调
  const handleScrollToBottom = useCallback(async () => {
    if (!selectedEntry || !fileLoadState.isLargeFile || fileLoadState.loadingMore || fileLoadState.autoLoadTriggered) return;

    const currentEndPosition = fileLoadState.currentFilePosition + fileLoadState.loadedContentSize;
    if (currentEndPosition >= fileLoadState.totalSize) return;

    setFileLoadState(prev => ({ ...prev, autoLoadTriggered: true }));
    await loadMoreContent(selectedEntry);

    setTimeout(() => {
      setFileLoadState(prev => ({ ...prev, autoLoadTriggered: false }));
    }, 1000);
  }, [selectedEntry, fileLoadState.isLargeFile, fileLoadState.loadingMore, fileLoadState.autoLoadTriggered, fileLoadState.currentFilePosition, fileLoadState.loadedContentSize, fileLoadState.totalSize, loadMoreContent]);

  // 手动加载完整内容的函数（用于非文本文件）
  const loadFullContent = useCallback(async (entry: ArchiveEntry) => {
    if (fileLoadState.manualLoading) return;

    setFileLoadState(prev => ({ ...prev, manualLoading: true }));
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
      setFileLoadState(prev => ({ ...prev, manualLoadRequested: true }));
      
      // 如果是文本文件，也更新文本内容
      if (isTextFile(entry.path) && fullPreview.content) {
        try {
          const textContent = new TextDecoder('utf-8', { fatal: false }).decode(fullPreview.content);
          setFileContent(textContent);
          setFileLoadState(prev => ({ ...prev, loadedContentSize: fullPreview.content!.length }));
        } catch (decodeError) {
          console.error('Failed to decode text content:', decodeError);
        }
      }
    } catch (err) {
      console.error('Failed to load full content:', err);
      setPreviewError(t('error.load.full.content'));
    } finally {
      setFileLoadState(prev => ({ ...prev, manualLoading: false }));
    }
  }, [url, headers, filename, storageClient, fileLoadState.manualLoading, t]);


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

  // 下载压缩包内的单个文件
  const downloadFile = async (entry: ArchiveEntry) => {
    try {
      await StorageServiceManager.downloadArchiveFileWithProgress(
        url,
        filename,
        entry.path,
        entry.path.split('/').pop() || entry.path
      );
    } catch (err) {
      console.error('Failed to download file:', err);
      // 可以添加错误提示
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
              showHidden={showHidden}
              onShowHiddenChange={setShowHidden}
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
                      <div className="flex items-center space-x-1">
                        {/* 下载文件按钮 */}
                        {!selectedEntry.is_dir && (
                          <button
                            onClick={() => downloadFile(selectedEntry)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            title={t('viewer.download')}
                          >
                            <Download className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </button>
                        )}
                        {/* 复制文件路径按钮 */}
                        <button
                          onClick={() => copyFilePath(selectedEntry)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          title={t('copy.full.path')}
                        >
                          <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </div>
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
                            onScrollToBottom={fileLoadState.isLargeFile ? handleScrollToBottom : undefined}
                          />
                          {fileLoadState.isLargeFile && (
                            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                              <div className="flex items-center justify-between">
                                <span>
                                  {t('file.loaded.chunks', { chunks: fileLoadState.loadedChunks, size: formatFileSize(fileLoadState.loadedContentSize) })}
                                </span>
                                {fileLoadState.loadingMore && (
                                  <div className="flex items-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                    <span>{t('loading.more.content')}</span>
                                  </div>
                                )}
                                {!fileLoadState.loadingMore && fileLoadState.loadedContentSize < fileLoadState.totalSize && (
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
                      // 媒体文件：小于10MB自动加载，大于10MB需要手动加载
                      const fileSize = selectedEntry.size || 0;
                      const shouldAutoLoad = fileSize < 10 * 1024 * 1024; // 10MB
                      
                      if (!shouldAutoLoad && !fileLoadState.manualLoadRequested) {
                        return (
                          <ManualLoadButton
                            entry={selectedEntry}
                            onLoad={loadFullContent}
                            isLoading={fileLoadState.manualLoading}
                            loadType="media"
                          />
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
                      // 数据文件：小于10MB自动加载，大于10MB需要手动加载
                      const fileSize = selectedEntry.size || 0;
                      const shouldAutoLoad = fileSize < 10 * 1024 * 1024; // 10MB
                      
                      if (!shouldAutoLoad && !fileLoadState.manualLoadRequested) {
                        return (
                          <ManualLoadButton
                            entry={selectedEntry}
                            onLoad={loadFullContent}
                            isLoading={fileLoadState.manualLoading}
                            loadType="data"
                          />
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
                      if (!fileLoadState.manualLoadRequested) {
                        return (
                          <ManualLoadButton
                            entry={selectedEntry}
                            onLoad={loadFullContent}
                            isLoading={fileLoadState.manualLoading}
                            loadType="unsupported"
                          />
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

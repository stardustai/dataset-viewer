import React, { useState, useEffect, useCallback } from 'react';
import { Archive, Copy, Folder, Download, Loader2 } from 'lucide-react';
import { ArchiveEntry, ArchiveInfo, FilePreview } from '../../../types';
import { CompressionService } from '../../../services/compression';
import { StorageServiceManager } from '../../../services/storage/StorageManager';
import { copyToClipboard, showCopyToast, showToast } from '../../../utils/clipboard';
import { getFileType, isMediaFile, isDataFile, isSpreadsheetFile, isTextLikeFile } from '../../../utils/fileTypes';
import { formatFileSize, formatModifiedTime } from '../../../utils/fileUtils';
import { configManager } from '../../../config';

import { ArchiveFileBrowser } from '../../FileBrowser/ArchiveFileBrowser';
import { VirtualizedTextViewer } from './VirtualizedTextViewer';
import { MediaViewer } from './MediaViewer';
import { UniversalDataTableViewer } from './UniversalDataTableViewer';
import { LoadingDisplay, ErrorDisplay, StatusDisplay, UnsupportedFormatDisplay } from '../../common';
import { ManualLoadButton } from '../ManualLoadButton';
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
    totalSize: 0,
    loadedContentSize: 0,
    loadedChunks: 0,
    currentFilePosition: 0,
    loadingMore: false,
    autoLoadTriggered: false,
    manualLoadRequested: false,
    manualLoading: false
  });

  // 强制以文本方式查看的状态
  const [forceTextView, setForceTextView] = useState(false);

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

    // 重置强制文本查看状态
    setForceTextView(false);

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
        totalSize: 0,
        loadedContentSize: 0,
        loadedChunks: 0,
        currentFilePosition: 0,
        loadingMore: false,
        autoLoadTriggered: false,
        manualLoadRequested: false,
        manualLoading: false
      });

      const fileSize = entry.size || 0;

      // 判断是否为文本文件
      const isTextFileType = isTextLikeFile(entry.path);

      setFileLoadState(prev => ({
        ...prev,
        totalSize: fileSize
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
      // 对于较小的文本文件（<10MB），直接加载完整内容
      // 对于较大的文本文件，采用初始加载策略
      const shouldLoadCompleteText = fileSize < 10 * 1024 * 1024; // 10MB阈值
      const initialLoadSize = shouldLoadCompleteText ? fileSize : Math.min(fileSize, 128 * 1024);

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
      isText: isTextLikeFile(entry.path),
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
    if (fileLoadState.loadingMore || !isTextLikeFile(entry.path)) return;
    if (!filePreview?.is_truncated) return; // 如果文件已完整加载，不需要加载更多

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
            setFilePreview(fullPreview); // 更新filePreview状态，包括is_truncated
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
          setFilePreview(fullPreview); // 更新filePreview状态，包括is_truncated
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

        // 更新filePreview状态，特别是is_truncated状态
        setFilePreview(prev => prev ? {
          ...prev,
          content: prev.content ?
            new Uint8Array([...prev.content, ...additionalPreview.content!]) :
            additionalPreview.content!,
          is_truncated: additionalPreview.is_truncated,
          preview_size: (prev.preview_size || 0) + additionalPreview.content!.length
        } : additionalPreview);

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
  }, [url, headers, filename, storageClient, fileLoadState.loadingMore, fileLoadState.currentFilePosition, fileLoadState.loadedContentSize, fileLoadState.totalSize, filePreview?.is_truncated, t]);

  // 滚动到底部时的回调
  const handleScrollToBottom = useCallback(async () => {
    if (!selectedEntry || !filePreview?.is_truncated || fileLoadState.loadingMore || fileLoadState.autoLoadTriggered) return;
    if (!isTextLikeFile(selectedEntry.path)) return;

    const currentEndPosition = fileLoadState.currentFilePosition + fileLoadState.loadedContentSize;
    if (currentEndPosition >= fileLoadState.totalSize) return;

    setFileLoadState(prev => ({ ...prev, autoLoadTriggered: true }));
    await loadMoreContent(selectedEntry);

    setTimeout(() => {
      setFileLoadState(prev => ({ ...prev, autoLoadTriggered: false }));
    }, 1000);
  }, [selectedEntry, filePreview?.is_truncated, fileLoadState.loadingMore, fileLoadState.autoLoadTriggered, fileLoadState.currentFilePosition, fileLoadState.loadedContentSize, fileLoadState.totalSize, loadMoreContent]);

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
      if (isTextLikeFile(entry.path) && fullPreview.content) {
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

  // 强制以文本方式查看文件的函数
  const loadAsText = useCallback(async (entry: ArchiveEntry) => {
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

      // 强制以文本方式解码内容
      if (fullPreview.content) {
        try {
          const textContent = new TextDecoder('utf-8', { fatal: false }).decode(fullPreview.content);
          setFileContent(textContent);
          setFileLoadState(prev => ({ ...prev, loadedContentSize: fullPreview.content!.length }));
          setForceTextView(true); // 标记为强制文本查看
        } catch (decodeError) {
          console.error('Failed to decode text content:', decodeError);
          setPreviewError(t('error.decode.text'));
        }
      }
    } catch (err) {
      console.error('Failed to load as text:', err);
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
      // 获取默认下载路径
      const entryFilename = entry.path.split('/').pop() || entry.path;
      const defaultPath = await StorageServiceManager.getDefaultDownloadPath(entryFilename);
      console.log('Default download path for archive entry:', defaultPath);

      await StorageServiceManager.downloadArchiveFileWithProgress(
        url,
        filename,
        entry.path,
        entryFilename,
        defaultPath
      );
    } catch (err) {
      console.error('Failed to download file:', err);
      // 如果是用户取消操作，不显示错误弹窗
      const errorMessage = extractErrorMessage(err, 'error.unknown', t);
      if (errorMessage !== 'download.cancelled') {
				showToast(`${t('download.failed')}: ${errorMessage}`, 'error');
      }
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

						<div className="flex-1 flex flex-col overflow-auto min-h-0">
							{previewError ? (
								<ErrorDisplay
									message={previewError}
									onRetry={() => {
										setPreviewError(null);
										if (selectedEntry) {
											previewFile(selectedEntry);
										}
									}}
									className="h-full"
								/>
							) : selectedEntry?.is_dir ? (
								<StatusDisplay
									type="directoryEmpty"
									message={t('folder.selected')}
									secondaryMessage={t('folder.info.message')}
									icon={Folder}
									className="h-full"
								/>
							) : selectedEntry && filePreview ? (
								(() => {
									const { isText, isMedia, isData, isSpreadsheet, fileType } = getFileTypeInfo(selectedEntry);
									const virtualFilePath = createVirtualFilePath(selectedEntry);

									// 检查是否强制以文本方式查看或本身就是文本文件
									if ((isText || forceTextView) && fileContent) {
										return (
											<div className="h-full flex flex-col">
                									<VirtualizedTextViewer
													content={fileContent}
													searchTerm=""
													onSearchResults={() => {}}
													className="flex-1"
													onScrollToBottom={filePreview?.is_truncated ? handleScrollToBottom : undefined}
													fileName={selectedEntry.path}
													isMarkdown={false}
													isMarkdownPreviewOpen={false}
													setIsMarkdownPreviewOpen={() => {}}												/>
												{filePreview?.is_truncated && (
													<div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
														<div className="flex items-center justify-between">
															<span>
																{t('file.loaded.chunks', { chunks: fileLoadState.loadedChunks, size: formatFileSize(fileLoadState.loadedContentSize) })}
															</span>
															{fileLoadState.loadingMore && (
																<div className="flex items-center gap-2">
																	<Loader2 className="w-4 h-4 animate-spin text-blue-500" />
																	<span>{t('loading.more.content')}</span>
																</div>
															)}
															{!fileLoadState.loadingMore && filePreview?.is_truncated && (
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
										// 不支持的格式：只提供文本查看选项
										return (
											<UnsupportedFormatDisplay
												message={t('viewer.unsupported.format')}
												secondaryMessage={t('viewer.unsupported.format.message')}
												onOpenAsText={() => loadAsText(selectedEntry)}
												className="h-full"
											/>
										);
									}
								})()
							) : (
								<StatusDisplay
									type="previewEmpty"
									message={t('preparing.preview')}
									className="h-full"
								/>
							)}
						</div>
					</div>
				) : (
					<StatusDisplay
						type="previewEmpty"
						message={t('select.file.for.preview')}
						className="h-full"
					/>
				)}
			</div>
		</div>
  );
};

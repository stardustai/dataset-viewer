import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { StorageFile, SearchResult, FullFileSearchResult } from '../../types';
import { useStorageStore } from '../../stores/storageStore';
import type { StorageClient } from '../../services/storage/types';
import { LazyComponentWrapper } from './common';
import { pluginManager } from '../../services/plugin/pluginManager';
import { PluginViewer } from './PluginViewer';
import {
  VirtualizedTextViewer,
  WordViewer,
  PresentationViewer,
  MediaViewer,
  UniversalDataTableViewer,
  ArchiveViewer,
  PointCloudViewer,
} from './viewers';
import { UnsupportedFormatDisplay } from '../common';

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface FileViewerContentProps {
  loading?: boolean;
  error?: string | null;
  file: StorageFile;
  filePath: string;
  fileType: string;
  storageClient?: StorageClient;
  hasAssociatedFiles?: boolean;
  content: string;
  searchTerm: string;
  currentSearchIndex: number;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  fullFileSearchMode: boolean;
  calculateStartLineNumber?: (filePosition: number) => number;
  fileInfo: {
    fileType: string;
    isText: boolean;
    isMarkdown: boolean;
    isWord: boolean;
    isPresentation: boolean;
    isMedia: boolean;
    isArchive: boolean;
    isData: boolean;
    isSpreadsheet: boolean;
    isPointCloud: boolean;
    isTextBased: boolean;
    canPreview: () => boolean;
    needsSpecialViewer: () => boolean;
  };
  isLargeFile: boolean;
  loadingMore: boolean;
  loadingBefore?: boolean; // 新增：向前加载状态
  canLoadBefore?: boolean; // 新增：是否可以向前加载
  loadedChunks: number;
  loadedContentSize: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mainContainerRef: React.RefObject<HTMLDivElement | null>;
  loadMoreSectionRef: React.RefObject<HTMLDivElement | null>;
  isMarkdownPreviewOpen: boolean;
  setIsMarkdownPreviewOpen: (open: boolean) => void;
  handleSearchResults: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom: () => void;
  handleScrollToTop?: () => Promise<number | void>; // 新增：向前加载函数
  setPresentationMetadata: (metadata: any) => void;
  setDataMetadata: (metadata: any) => void;
  loadFileContent: (forceLoad?: boolean) => Promise<void>;
  forceTextMode?: boolean; // 新增属性，用于强制以文本格式打开
}

export const FileViewerContent = forwardRef<
  VirtualizedTextViewerRef | null,
  FileViewerContentProps
>(
  (
    {
      loading,
      error,
      file,
      filePath,
      fileType,
      storageClient,
      hasAssociatedFiles,
      content,
      searchTerm,
      currentSearchIndex,
      searchResults,
      fullFileSearchResults,
      fullFileSearchMode,
      calculateStartLineNumber,
      fileInfo,
      isLargeFile,
      loadingMore,
      loadingBefore,
      canLoadBefore,
      handleSearchResults,
      handleScrollToBottom,
      handleScrollToTop,
      setPresentationMetadata,
      setDataMetadata,
      isMarkdownPreviewOpen,
      setIsMarkdownPreviewOpen,
      loadFileContent,
      forceTextMode,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const { getFileUrl } = useStorageStore();
    const [openAsText, setOpenAsText] = useState(!!forceTextMode);

    // 处理加载状态
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        </div>
      );
    }

    // 处理错误状态
    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-red-600 dark:text-red-400">
            <p className="text-lg font-medium mb-2">{t('error')}</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      );
    }

    // 检查是否有插件可以处理此文件（但不在强制文本模式下）
    if (
      !forceTextMode &&
      !openAsText &&
      storageClient &&
      pluginManager.findViewerForFile(file.basename)
    ) {
      return (
        <PluginViewer
          file={file}
          filePath={filePath}
          content={content}
          storageClient={storageClient}
          isLargeFile={isLargeFile}
        />
      );
    }

    // 如果强制文本模式或用户选择以文本格式打开，或者是文本/Markdown文件
    if (forceTextMode || openAsText || fileInfo.isText || fileInfo.isMarkdown) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 顶部加载状态指示器 */}
          {isLargeFile && loadingBefore && canLoadBefore && (
            <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <VirtualizedTextViewer
              ref={ref}
              content={content}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
              onScrollToBottom={handleScrollToBottom}
              onScrollToTop={handleScrollToTop}
              startLineNumber={calculateStartLineNumber ? calculateStartLineNumber(0) : 1}
              currentSearchIndex={currentSearchIndex}
              searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
              fileName={file.basename}
              isMarkdown={fileInfo.isMarkdown && !openAsText}
              isMarkdownPreviewOpen={isMarkdownPreviewOpen}
              setIsMarkdownPreviewOpen={setIsMarkdownPreviewOpen}
            />
          </div>

          {/* 底部加载状态指示器 */}
          {isLargeFile && loadingMore && (
            <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (fileInfo.isWord) {
      return (
        <LazyComponentWrapper
          component={WordViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileSize: file.size,
          }}
        />
      );
    }

    if (fileInfo.isPresentation) {
      return (
        <LazyComponentWrapper
          component={PresentationViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            onMetadataLoaded: setPresentationMetadata,
          }}
        />
      );
    }

    if (fileInfo.isMedia) {
      return (
        <LazyComponentWrapper
          component={MediaViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileType: fileType as 'image' | 'pdf' | 'video' | 'audio',
            fileSize: file.size,
            hasAssociatedFiles,
          }}
        />
      );
    }

    if (fileInfo.isSpreadsheet) {
      return (
        <LazyComponentWrapper
          component={UniversalDataTableViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            fileType:
              file.basename.toLowerCase().endsWith('.xlsx') ||
              file.basename.toLowerCase().endsWith('.xls')
                ? 'xlsx'
                : file.basename.toLowerCase().endsWith('.ods')
                  ? 'ods'
                  : 'csv',
            onMetadataLoaded: setDataMetadata,
            storageClient,
          }}
        />
      );
    }

    if (fileInfo.isData) {
      return (
        <LazyComponentWrapper
          component={UniversalDataTableViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            fileType:
              file.basename.toLowerCase().endsWith('.parquet') ||
              file.basename.toLowerCase().endsWith('.pqt')
                ? 'parquet'
                : 'csv',
            onMetadataLoaded: setDataMetadata,
            storageClient,
          }}
        />
      );
    }

    if (fileInfo.isArchive) {
      return (
        <LazyComponentWrapper
          component={ArchiveViewer}
          props={{
            url: getFileUrl(filePath),
            filename: file.basename,
            storageClient,
          }}
        />
      );
    }

    if (fileInfo.isPointCloud) {
      return (
        <LazyComponentWrapper
          component={PointCloudViewer}
          props={{
            filePath,
            onMetadataLoaded: setDataMetadata,
          }}
          loadingText={t('loading.pointCloud', '正在加载点云渲染器...')}
          fallbackHeight="h-64"
        />
      );
    }

    return (
      <UnsupportedFormatDisplay
        message={t('viewer.unsupported.format')}
        secondaryMessage={t('viewer.download.to.view')}
        onOpenAsText={async () => {
          if (loadFileContent) {
            await loadFileContent(true); // 强制加载非文本文件
          }
          setOpenAsText(true);
        }}
      />
    );
  }
);

FileViewerContent.displayName = 'FileViewerContent';

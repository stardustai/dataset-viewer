import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { StorageFile, SearchResult, FullFileSearchResult } from '../../types';
import { StorageServiceManager } from '../../services/storage';
import { LazyComponentWrapper } from './common';
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
  storageClient?: any;
  hasAssociatedFiles?: boolean;
  content: string;
  searchTerm: string;
  currentSearchIndex: number;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  fullFileSearchMode: boolean;
  containerHeight: number;
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
  loadedChunks: number;
  loadedContentSize: number;
  containerRef: React.RefObject<HTMLDivElement>;
  mainContainerRef: React.RefObject<HTMLDivElement>;
  loadMoreSectionRef: React.RefObject<HTMLDivElement>;
  isMarkdownPreviewOpen: boolean;
  setIsMarkdownPreviewOpen: (open: boolean) => void;
  handleSearchResults: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom: () => void;
  setPresentationMetadata: (metadata: any) => void;
  setDataMetadata: (metadata: any) => void;
  loadFileContent: (forceLoad?: boolean) => Promise<void>;
}

export const FileViewerContent = forwardRef<VirtualizedTextViewerRef, FileViewerContentProps>(
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
      containerHeight,
      calculateStartLineNumber,
      fileInfo,
      isLargeFile,
      loadingMore,
      handleSearchResults,
      handleScrollToBottom,
      setPresentationMetadata,
      setDataMetadata,
      isMarkdownPreviewOpen,
      setIsMarkdownPreviewOpen,
      loadFileContent,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const [openAsText, setOpenAsText] = useState(false);

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

    if (fileInfo.isText || fileInfo.isMarkdown) {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 min-h-0">
            <VirtualizedTextViewer
              ref={ref}
              content={content}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
              onScrollToBottom={handleScrollToBottom}
              startLineNumber={calculateStartLineNumber ? calculateStartLineNumber(0) : 1}
              currentSearchIndex={currentSearchIndex}
              searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
              fileName={file.basename}
              isMarkdown={fileInfo.isMarkdown}
              height={containerHeight}
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
          }}
        />
      );
    }

    if (fileInfo.isArchive) {
      return (
        <LazyComponentWrapper
          component={ArchiveViewer}
          props={{
            url: StorageServiceManager.getFileUrl(filePath),
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

    // 如果用户选择以文本格式打开不支持的文件
    if (openAsText) {
      return (
        <>
          <div
            className="flex-1 relative overflow-hidden"
            style={{ height: `${containerHeight}px` }}
          >
            <VirtualizedTextViewer
              ref={ref}
              content={content}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
              onScrollToBottom={handleScrollToBottom}
              startLineNumber={calculateStartLineNumber ? calculateStartLineNumber(0) : 1}
              currentSearchIndex={currentSearchIndex}
              searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
              fileName={file.basename}
              isMarkdown={false}
              height={containerHeight}
              isMarkdownPreviewOpen={isMarkdownPreviewOpen}
              setIsMarkdownPreviewOpen={setIsMarkdownPreviewOpen}
            />
          </div>

          {/* 底部加载状态指示器 */}
          {isLargeFile && loadingMore && (
            <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            </div>
          )}
        </>
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

import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { StorageFile, SearchResult, FullFileSearchResult } from '../../types';
import { StorageServiceManager } from '../../services/storage';
import { VirtualizedTextViewer } from './viewers/VirtualizedTextViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { WordViewer } from './viewers/WordViewer';
import { PresentationViewer } from './viewers/PresentationViewer';
import { MediaViewer } from './viewers/MediaViewer';
import { UniversalDataTableViewer } from './viewers/UniversalDataTableViewer';
import { ArchiveViewer } from './viewers/ArchiveViewer';
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
    isTextBased: boolean;
    canPreview: () => boolean;
    needsSpecialViewer: () => boolean;
  };
  isLargeFile: boolean;
  loadingMore: boolean;
  loadedChunks: number;
  loadedContentSize: number;
  handleSearchResults?: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom?: () => void;
  setPresentationMetadata?: (metadata: { slideCount: number; size: { width: number; height: number } }) => void;
  setDataMetadata?: (metadata: { numRows: number; numColumns: number }) => void;
  textViewerRef?: any;
  containerRef?: any;
  mainContainerRef?: any;
  loadMoreSectionRef?: any;
}

export const FileViewerContent = forwardRef<VirtualizedTextViewerRef, FileViewerContentProps>((
  {
    loading,
    error,
    file,
    filePath,
    fileType,
    storageClient,
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
    loadedChunks,
    loadedContentSize,
    handleSearchResults,
    handleScrollToBottom,
    setPresentationMetadata,
    setDataMetadata
  },
  ref
) => {
  const { t } = useTranslation();

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

  if (fileInfo.isText) {
    return (
      <>
        <div className="flex-1 relative overflow-hidden">
          <VirtualizedTextViewer
            ref={ref}
            content={content}
            searchTerm={searchTerm}
            onSearchResults={handleSearchResults}
            onScrollToBottom={handleScrollToBottom}
            startLineNumber={calculateStartLineNumber ? calculateStartLineNumber(0) : 1}
            currentSearchIndex={currentSearchIndex}
            searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
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

  if (fileInfo.isMarkdown) {
    return (
      <MarkdownViewer
        content={content}
        fileName={file.basename}
        className="h-full"
        onScrollToBottom={isLargeFile ? handleScrollToBottom : undefined}
        isLargeFile={isLargeFile}
        loadingMore={loadingMore}
        loadedChunks={loadedChunks}
        loadedContentSize={loadedContentSize}
      />
    );
  }

  if (fileInfo.isWord) {
    return (
      <WordViewer
        filePath={filePath}
        fileName={file.basename}
        fileSize={file.size}
        className="h-full"
      />
    );
  }

  if (fileInfo.isPresentation) {
    return (
      <PresentationViewer
        filePath={filePath}
        fileName={file.basename}
        fileSize={file.size}
        className="h-full"
        onMetadataLoaded={setPresentationMetadata}
      />
    );
  }

  if (fileInfo.isMedia) {
    return (
      <MediaViewer
        filePath={filePath}
        fileName={file.basename}
        fileType={fileType as 'image' | 'pdf' | 'video' | 'audio'}
        fileSize={file.size}
      />
    );
  }

  if (fileInfo.isSpreadsheet) {
    return (
      <UniversalDataTableViewer
        filePath={filePath}
        fileName={file.basename}
        fileSize={file.size}
        fileType={file.basename.toLowerCase().endsWith('.xlsx') || file.basename.toLowerCase().endsWith('.xls') ? 'xlsx' :
                 file.basename.toLowerCase().endsWith('.ods') ? 'ods' : 'csv'}
        onMetadataLoaded={setDataMetadata}
      />
    );
  }

  if (fileInfo.isData) {
    return (
      <UniversalDataTableViewer
        filePath={filePath}
        fileName={file.basename}
        fileSize={file.size}
        fileType={file.basename.toLowerCase().endsWith('.parquet') || file.basename.toLowerCase().endsWith('.pqt') ? 'parquet' : 'csv'}
        onMetadataLoaded={setDataMetadata}
      />
    );
  }

  if (fileInfo.isArchive) {
    return (
      <ArchiveViewer
        url={StorageServiceManager.getFileUrl(filePath)}
        headers={StorageServiceManager.getHeaders()}
        filename={file.basename}
        storageClient={storageClient}
      />
    );
  }

  return (
    <UnsupportedFormatDisplay
      message={t('viewer.unsupported.format')}
      secondaryMessage={t('viewer.download.to.view')}
    />
  );
});

FileViewerContent.displayName = 'FileViewerContent';
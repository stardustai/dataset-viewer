import { Loader2 } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageClient } from '../../services/storage/types';
import type { FullFileSearchResult, SearchResult, StorageFile } from '../../types';
import { FileTypeRenderer } from './FileTypeRenderer';
import { TextViewer } from './TextViewer';

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
  loadingBefore?: boolean; // 新增：向前加载状态
  canLoadBefore?: boolean; // 新增：是否可以向前加载
  loadedChunks: number;
  loadedContentSize: number;
  containerRef: React.RefObject<HTMLDivElement>;
  mainContainerRef: React.RefObject<HTMLDivElement>;
  loadMoreSectionRef: React.RefObject<HTMLDivElement>;
  isMarkdownPreviewOpen: boolean;
  setIsMarkdownPreviewOpen: (open: boolean) => void;
  handleSearchResults: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom: () => void;
  handleScrollToTop?: () => Promise<number | void>; // 新增：向前加载函数
  setPresentationMetadata: (
    metadata: { slideCount: number; size: { width: number; height: number } } | null
  ) => void;
  setDataMetadata: (
    metadata: {
      numRows: number;
      numColumns: number;
      fileType?: string;
      extensions?: Record<string, unknown>;
    } | null
  ) => void;
  loadFileContent: (forceLoad?: boolean) => Promise<void>;
  forceTextMode?: boolean; // 新增属性，用于强制以文本格式打开
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

    // 如果强制文本模式或用户选择以文本格式打开，或者是文本/Markdown文件
    if (forceTextMode || openAsText || fileInfo.isText || fileInfo.isMarkdown) {
      return (
        <TextViewer
          ref={ref}
          file={file}
          content={content}
          searchTerm={searchTerm}
          currentSearchIndex={currentSearchIndex}
          searchResults={searchResults}
          fullFileSearchResults={fullFileSearchResults}
          fullFileSearchMode={fullFileSearchMode}
          containerHeight={containerHeight}
          calculateStartLineNumber={calculateStartLineNumber}
          fileInfo={fileInfo}
          isLargeFile={isLargeFile}
          loadingMore={loadingMore}
          loadingBefore={loadingBefore}
          canLoadBefore={canLoadBefore}
          isMarkdownPreviewOpen={isMarkdownPreviewOpen}
          setIsMarkdownPreviewOpen={setIsMarkdownPreviewOpen}
          handleSearchResults={handleSearchResults}
          handleScrollToBottom={handleScrollToBottom}
          handleScrollToTop={handleScrollToTop}
          openAsText={openAsText}
        />
      );
    }

    return (
      <FileTypeRenderer
        file={file}
        filePath={filePath}
        fileType={fileType}
        storageClient={storageClient}
        hasAssociatedFiles={hasAssociatedFiles}
        fileInfo={fileInfo}
        setPresentationMetadata={setPresentationMetadata}
        setDataMetadata={setDataMetadata}
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

import { Loader2 } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageClient } from '../../services/storage/types';
import type { FullFileSearchResult, SearchResult, StorageFile } from '../../types';
import { FileTypeRenderer } from './FileTypeRenderer';
import { TextViewer } from './TextViewer';
import { LazyComponentWrapper } from './common';
import { pluginManager } from '../../services/plugin/pluginManager';
import { PluginViewer } from './PluginViewer';
import {
  WordViewer,
  PresentationViewer,
  MediaViewer,
  UniversalDataTableViewer,
  ArchiveViewer,
  PointCloudViewer,
} from './viewers';

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

    // 检查是否有插件可以处理此文件（但不在强制文本模式下）
    if (!forceTextMode && !openAsText && pluginManager.findViewerForFile(file.basename)) {
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
        <TextViewer
          ref={ref}
          file={file}
          content={content}
          searchTerm={searchTerm}
          currentSearchIndex={currentSearchIndex}
          searchResults={searchResults}
          fullFileSearchResults={fullFileSearchResults}
          fullFileSearchMode={fullFileSearchMode}
          containerHeight={600}
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

    if (fileInfo.isWord) {
      return (
        <LazyComponentWrapper
          component={WordViewer}
          props={{
            filePath,
            fileName: file.basename,
            fileSize: Number(file.size),
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
            fileSize: Number(file.size),
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
            fileSize: Number(file.size),
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
            fileSize: Number(file.size),
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
            fileSize: Number(file.size),
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
            url: filePath,
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
            onMetadataLoaded: (metadata: any) => setDataMetadata(metadata),
          }}
          loadingText={t('loading.pointCloud', '正在加载点云渲染器...')}
          fallbackHeight="h-64"
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

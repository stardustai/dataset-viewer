import type { FC, KeyboardEvent } from 'react';
import { useRef, useState } from 'react';
import type { StorageClient } from '../../services/storage/types';
import type { StorageFile } from '../../types';
import { FileViewerContent } from './FileViewerContent';
import { FileViewerHeader } from './FileViewerHeader';
import { FileViewerSearchBar } from './FileViewerSearchBar';
import { useFileLoader } from './hooks/useFileLoader';
import { useFileSearch } from './hooks/useFileSearch';

// 定义 VirtualizedTextViewer 的 ref 接口
interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface FileViewerProps {
  file: StorageFile;
  filePath: string;
  storageClient?: StorageClient;
  hasAssociatedFiles?: boolean;
  onBack: () => void;
  hideBackButton?: boolean; // 新增属性，用于隐藏返回按钮
  forceTextMode?: boolean; // 新增属性，用于强制以文本格式打开
  pluginId?: string; // 新增属性，指定使用的插件ID
}

export const FileViewer: FC<FileViewerProps> = ({
  file,
  filePath,
  storageClient,
  hasAssociatedFiles,
  onBack,
  hideBackButton,
  forceTextMode,
  pluginId,
}) => {
  const fileLoader = useFileLoader(file, filePath, forceTextMode);

  // 创建需要的refs
  const textViewerRef = useRef<VirtualizedTextViewerRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSectionRef = useRef<HTMLDivElement | null>(null);
  const mainDivRef = useRef<HTMLDivElement | null>(null);

  // Markdown 预览状态
  const [isMarkdownPreviewOpen, setIsMarkdownPreviewOpen] = useState(false);

  const {
    content,
    loading,
    error,
    loadingMore,
    loadingBefore,
    currentFilePosition,
    currentStartPosition,
    loadedContentSize,
    totalSize,
    loadedChunks,
    isLargeFile,
    fileInfo,
    fileType,
    dataMetadata,
    presentationMetadata,
    handleScrollToBottom,
    handleScrollToTop,
    jumpToFilePercentage,
    calculateStartLineNumber,
    performFullFileSearch,
    setDataMetadata,
    setPresentationMetadata,
    showPercentInput,
    setShowPercentInput,
    percentValue,
    setPercentValue,
    searchTerm,
    setSearchTerm,
    searchResults,
    searchLoading,
    currentSearchIndex,
    fullFileSearchMode,
    setFullFileSearchMode,
    fullFileSearchResults,
    fullFileSearchLoading,
    searchResultsLimited,
    fullFileSearchLimited,
    loadFileContent,
  } = fileLoader;

  const fileSearch = useFileSearch({
    searchTerm,
    fullFileSearchMode,
    searchResults,
    fullFileSearchResults,
    currentSearchIndex,
    isLargeFile,
    filePath,
    totalSize,
    currentFilePosition,
    loadedContentSize,
    textViewerRef, // 传递textViewerRef
    performFullFileSearch,
    setSearchLoading: fileLoader.setSearchLoading,
    setFullFileSearchLoading: fileLoader.setFullFileSearchLoading,
    setSearchResults: fileLoader.setSearchResults,
    setFullFileSearchResults: fileLoader.setFullFileSearchResults,
    setCurrentSearchIndex: fileLoader.setCurrentSearchIndex,
    setSearchResultsLimited: fileLoader.setSearchResultsLimited,
    setFullFileSearchLimited: fileLoader.setFullFileSearchLimited,
    setBaselineStartLineNumber: fileLoader.setBaselineStartLineNumber,
    setContent: fileLoader.setContent,
    setCurrentFilePosition: fileLoader.setCurrentFilePosition,
    setLoadedContentSize: fileLoader.setLoadedContentSize,
    setLoading: fileLoader.setLoading,
    setError: fileLoader.setError,
  });

  const { handleSearchResults, nextResult, prevResult } = fileSearch;

  const handlePercentageJump = () => {
    const value = parseFloat(percentValue);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      jumpToFilePercentage(value);
      setShowPercentInput(false);
    }
  };

  const handlePercentKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePercentageJump();
    } else if (e.key === 'Escape') {
      setShowPercentInput(false);
      setPercentValue('');
    }
  };

  return (
    <div ref={mainDivRef} className="h-full bg-gray-50 dark:bg-gray-900 flex flex-col">
      <FileViewerHeader
        file={file}
        filePath={filePath}
        fileType={fileType}
        onBack={onBack}
        hideBackButton={hideBackButton}
        fileInfo={fileInfo}
        isLargeFile={isLargeFile}
        dataMetadata={dataMetadata}
        presentationMetadata={presentationMetadata}
        currentFilePosition={currentFilePosition}
        totalSize={totalSize}
      />

      {fileInfo.isTextBased && (
        <FileViewerSearchBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          fullFileSearchMode={fullFileSearchMode}
          setFullFileSearchMode={setFullFileSearchMode}
          searchLoading={searchLoading}
          fullFileSearchLoading={fullFileSearchLoading}
          searchResults={searchResults}
          fullFileSearchResults={fullFileSearchResults}
          currentSearchIndex={currentSearchIndex}
          searchResultsLimited={searchResultsLimited}
          fullFileSearchLimited={fullFileSearchLimited}
          isLargeFile={isLargeFile}
          showPercentInput={showPercentInput}
          setShowPercentInput={setShowPercentInput}
          percentValue={percentValue}
          setPercentValue={setPercentValue}
          onNextResult={nextResult}
          onPrevResult={prevResult}
          onPercentageJump={handlePercentageJump}
          onPercentKeyPress={handlePercentKeyPress}
          isMarkdown={fileInfo.isMarkdown}
          onMarkdownPreview={() => setIsMarkdownPreviewOpen(true)}
          fileName={file.filename}
        />
      )}

      <FileViewerContent
        ref={textViewerRef}
        loading={loading}
        error={error}
        file={file}
        filePath={filePath}
        storageClient={storageClient}
        hasAssociatedFiles={hasAssociatedFiles}
        fileInfo={fileInfo}
        fileType={fileType}
        content={content}
        searchTerm={searchTerm}
        handleSearchResults={handleSearchResults}
        handleScrollToBottom={handleScrollToBottom}
        handleScrollToTop={handleScrollToTop}
        calculateStartLineNumber={calculateStartLineNumber}
        currentSearchIndex={currentSearchIndex}
        fullFileSearchMode={fullFileSearchMode}
        fullFileSearchResults={fullFileSearchResults}
        searchResults={searchResults}
        isLargeFile={isLargeFile}
        loadingMore={loadingMore}
        loadingBefore={loadingBefore}
        canLoadBefore={currentStartPosition > 0}
        loadedChunks={loadedChunks}
        loadedContentSize={loadedContentSize}
        setPresentationMetadata={setPresentationMetadata}
        setDataMetadata={setDataMetadata}
        containerRef={containerRef}
        mainContainerRef={mainContainerRef}
        loadMoreSectionRef={loadMoreSectionRef}
        isMarkdownPreviewOpen={isMarkdownPreviewOpen}
        setIsMarkdownPreviewOpen={setIsMarkdownPreviewOpen}
        loadFileContent={loadFileContent}
        forceTextMode={forceTextMode}
        pluginId={pluginId}
      />
    </div>
  );
};

import React, { useRef, useState, useEffect } from 'react';
import { StorageFile } from '../../types';
import { FileViewerHeader } from './FileViewerHeader';
import { FileViewerSearchBar } from './FileViewerSearchBar';
import { FileViewerContent } from './FileViewerContent';
import { useFileLoader } from './hooks/useFileLoader';
import { useFileSearch } from './hooks/useFileSearch';

interface FileViewerProps {
  file: StorageFile;
  filePath: string;
  storageClient?: any;
  onBack: () => void;
}

export const FileViewer: React.FC<FileViewerProps> = ({ file, filePath, storageClient, onBack }) => {
  const fileLoader = useFileLoader(file, filePath);
  
  // 创建需要的refs
  const textViewerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreSectionRef = useRef<HTMLDivElement>(null);
  const mainDivRef = useRef<HTMLDivElement>(null);
  
  // 动态计算容器高度
  const [containerHeight, setContainerHeight] = useState<number>(600);

  useEffect(() => {
    const updateHeight = () => {
      if (mainDivRef.current) {
        const rect = mainDivRef.current.getBoundingClientRect();
        const headerHeight = 60; // 估算 header 高度
        const searchBarHeight = 50; // 估算搜索栏高度
        const availableHeight = rect.height - headerHeight - searchBarHeight;
        setContainerHeight(Math.max(400, availableHeight));
      }
    };

    updateHeight();
    
    const resizeObserver = new ResizeObserver(updateHeight);
    if (mainDivRef.current) {
      resizeObserver.observe(mainDivRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  const {
    content,
    loading,
    error,
    loadingMore,
    currentFilePosition,
    loadedContentSize,
    totalSize,
    loadedChunks,
    isLargeFile,
    fileInfo,
    fileType,
    dataMetadata,
    presentationMetadata,
    handleScrollToBottom,
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
    navigatingToResult
  } = fileLoader;



  const fileSearch = useFileSearch({
    searchTerm,
    fullFileSearchMode,
    searchResults,
    fullFileSearchResults,
    currentSearchIndex,
    navigatingToResult,
    isLargeFile,
    filePath,
    totalSize,
    performFullFileSearch,
    setSearchLoading: fileLoader.setSearchLoading,
    setFullFileSearchLoading: fileLoader.setFullFileSearchLoading,
    setSearchResults: fileLoader.setSearchResults,
    setFullFileSearchResults: fileLoader.setFullFileSearchResults,
    setCurrentSearchIndex: fileLoader.setCurrentSearchIndex,
    setSearchResultsLimited: fileLoader.setSearchResultsLimited,
    setFullFileSearchLimited: fileLoader.setFullFileSearchLimited,
    setNavigatingToResult: fileLoader.setNavigatingToResult,
    setBaselineStartLineNumber: fileLoader.setBaselineStartLineNumber,
    setContent: fileLoader.setContent,
    setCurrentFilePosition: fileLoader.setCurrentFilePosition,
    setLoadedContentSize: fileLoader.setLoadedContentSize,
    setLoading: fileLoader.setLoading,
    setError: fileLoader.setError
  });
  
  const {
    handleSearchResults,
    nextResult,
    prevResult
  } = fileSearch;

  const handlePercentageJump = () => {
    const value = parseFloat(percentValue);
    if (!isNaN(value) && value >= 0 && value <= 100) {
      jumpToFilePercentage(value);
      setShowPercentInput(false);
    }
  };

  const handlePercentKeyPress = (e: React.KeyboardEvent) => {
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
          fileInfo={fileInfo}
          isLargeFile={isLargeFile}
          dataMetadata={dataMetadata}
          presentationMetadata={presentationMetadata}
          currentFilePosition={currentFilePosition}
          loadedContentSize={loadedContentSize}
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
          />
        )}

      <FileViewerContent
        loading={loading}
        error={error}
        file={file}
        filePath={filePath}
        storageClient={storageClient}
        fileInfo={fileInfo}
        fileType={fileType}
        content={content}
        searchTerm={searchTerm}
        handleSearchResults={handleSearchResults}
        handleScrollToBottom={handleScrollToBottom}
        containerHeight={containerHeight}
        calculateStartLineNumber={calculateStartLineNumber}
        currentSearchIndex={currentSearchIndex}
        fullFileSearchMode={fullFileSearchMode}
        fullFileSearchResults={fullFileSearchResults}
        searchResults={searchResults}
        isLargeFile={isLargeFile}
        loadingMore={loadingMore}
        loadedChunks={loadedChunks}
        loadedContentSize={loadedContentSize}
        setPresentationMetadata={setPresentationMetadata}
        setDataMetadata={setDataMetadata}
        textViewerRef={textViewerRef}
        containerRef={containerRef}
        mainContainerRef={mainContainerRef}
        loadMoreSectionRef={loadMoreSectionRef}
      />
    </div>
  );
};

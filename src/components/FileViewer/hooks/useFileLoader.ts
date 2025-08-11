import { useState, useCallback, useEffect } from 'react';
import { StorageFile, SearchResult } from '../../../types';
import { StorageServiceManager } from '../../../services/storage';
import { configManager } from '../../../config';
import { getFileType } from '../../../utils/fileTypes';

export const useFileLoader = (file: StorageFile, filePath: string) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [isLargeFile, setIsLargeFile] = useState<boolean>(false);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [currentFilePosition, setCurrentFilePosition] = useState<number>(0);
  const [loadedContentSize, setLoadedContentSize] = useState<number>(0);
  const [loadedChunks, setLoadedChunks] = useState<number>(0);
  const [baselineStartLineNumber, setBaselineStartLineNumber] = useState<number>(1);
  const [dataMetadata, setDataMetadata] = useState<{ numRows: number; numColumns: number } | null>(null);
  const [presentationMetadata, setPresentationMetadata] = useState<{ slideCount: number; size: { width: number; height: number } } | null>(null);

  // 搜索相关状态
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [fullFileSearchResults, setFullFileSearchResults] = useState<Array<{ line: number; column: number; text: string; match: string; filePosition: number }>>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [fullFileSearchLoading, setFullFileSearchLoading] = useState<boolean>(false);
  const [searchResultsLimited, setSearchResultsLimited] = useState<boolean>(false);
  const [fullFileSearchLimited, setFullFileSearchLimited] = useState<boolean>(false);
  const [fullFileSearchMode, setFullFileSearchMode] = useState<boolean>(false);
  const [navigatingToResult, setNavigatingToResult] = useState<boolean>(false);

  // 百分比跳转相关状态
  const [showPercentInput, setShowPercentInput] = useState<boolean>(false);
  const [percentValue, setPercentValue] = useState<string>('');

  const config = configManager.getConfig();
  const fileType = getFileType(file.basename);
  
  // 创建文件信息对象，包含所有文件类型判断逻辑
  const fileInfo = {
    fileType: fileType,
    isText: fileType === 'text',
    isMarkdown: fileType === 'markdown',
    isWord: fileType === 'word',
    isPresentation: fileType === 'presentation',
    isMedia: ['image', 'pdf', 'video', 'audio'].includes(fileType),
    isArchive: fileType === 'archive',
    isData: fileType === 'data',
    isSpreadsheet: fileType === 'spreadsheet',
    // 辅助方法
    isTextBased: () => ['text', 'markdown'].includes(fileType),
    canPreview: () => !['archive', 'unknown'].includes(fileType),
    needsSpecialViewer: () => ['word', 'presentation', 'data', 'spreadsheet'].includes(fileType)
  };

  const loadFileContent = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 对于非文本文件，不需要加载内容
      if (!fileInfo.isTextBased()) {
        setLoading(false);
        return;
      }

      // 获取文件大小
      const fileSize = await StorageServiceManager.getFileSize(filePath);
      setTotalSize(fileSize);

      // 判断是否为大文件
      const isLarge = fileSize > config.streaming.maxInitialLoad;
      setIsLargeFile(isLarge);

      if (isLarge) {
        // 大文件：流式加载
        const chunkSize = config.streaming.chunkSize;
        const result = await StorageServiceManager.getFileContent(filePath, 0, chunkSize);
        setContent(result.content);
        setCurrentFilePosition(0);
        setLoadedContentSize(result.content.length);
        setLoadedChunks(1);
      } else {
        // 小文件：一次性加载
        const result = await StorageServiceManager.getFileContent(filePath);
        setContent(result.content);
        setCurrentFilePosition(0);
        setLoadedContentSize(result.content.length);
        setLoadedChunks(1);
      }
    } catch (err) {
      console.error('Failed to load file:', err);
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [filePath, fileInfo.isTextBased(), config.streaming.maxInitialLoad, config.streaming.chunkSize]);

  const handleScrollToBottom = useCallback(async () => {
    if (!isLargeFile || loadingMore) return;

    const nextPosition = currentFilePosition + loadedContentSize;
    if (nextPosition >= totalSize) return;

    try {
      setLoadingMore(true);
      const chunkSize = config.streaming.chunkSize;
      const endPosition = Math.min(nextPosition + chunkSize, totalSize);
      const result = await StorageServiceManager.getFileContent(filePath, nextPosition, endPosition - nextPosition);

      setContent(prev => prev + result.content);
      setLoadedContentSize(prev => prev + result.content.length);
      setLoadedChunks(prev => prev + 1);
    } catch (err) {
      console.error('Failed to load more content:', err);
      setError('Failed to load more content');
    } finally {
      setLoadingMore(false);
    }
  }, [isLargeFile, loadingMore, currentFilePosition, loadedContentSize, totalSize, filePath, config.streaming.chunkSize]);

  const jumpToFilePercentage = useCallback(async (percentage: number) => {
    if (!isLargeFile) return;

    try {
      setLoading(true);
      const targetPosition = Math.floor((totalSize * percentage) / 100);
      const chunkSize = config.streaming.chunkSize;
      const endPosition = Math.min(targetPosition + chunkSize, totalSize);

      const result = await StorageServiceManager.getFileContent(filePath, targetPosition, endPosition - targetPosition);
      setContent(result.content);
      setCurrentFilePosition(targetPosition);
      setLoadedContentSize(result.content.length);
      setLoadedChunks(1);

      // 估算起始行号
      const avgBytesPerLine = 50;
      const estimatedStartLine = Math.floor(targetPosition / avgBytesPerLine) + 1;
      setBaselineStartLineNumber(Math.max(1, estimatedStartLine));
    } catch (err) {
      console.error('Failed to jump to percentage:', err);
      setError('Failed to jump to file position');
    } finally {
      setLoading(false);
    }
  }, [isLargeFile, totalSize, filePath, config.streaming.chunkSize]);

  const calculateStartLineNumber = useCallback(() => {
    if (!isLargeFile) return 1;
    return baselineStartLineNumber;
  }, [isLargeFile, baselineStartLineNumber]);

  // 全文件搜索功能
  const performFullFileSearch = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) return [];

    // 对于小文件，直接在当前内容中搜索
    if (!isLargeFile) {
      const results: Array<{ line: number; column: number; text: string; match: string; filePosition: number }> = [];
      const lines = content.split('\n');
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      lines.forEach((line, lineIndex) => {
        let match;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          results.push({
            line: lineIndex + 1,
            column: match.index + 1,
            text: line,
            match: match[0],
            filePosition: 0
          });
        }
      });

      return results;
    }

    // 对于大文件，使用采样搜索
    setFullFileSearchLoading(true);
    try {
      const results: Array<{ line: number; column: number; text: string; match: string; filePosition: number }> = [];
      const sampleSize = 1024 * 512; // 512KB 采样块大小
      const maxSamples = 50; // 最多采样50个块
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      // 计算采样间隔
      const samplingInterval = Math.max(Math.floor(totalSize / maxSamples), sampleSize);

      let currentSamplePosition = 0;
      let approximateLineNumber = 1;

      while (currentSamplePosition < totalSize && results.length < 500) {
        const endPosition = Math.min(currentSamplePosition + sampleSize, totalSize);

        try {
          const sampleContent = await StorageServiceManager.getFileContent(filePath, currentSamplePosition, endPosition - currentSamplePosition);
          const sampleLines = sampleContent.content.split('\n');

          sampleLines.forEach((line, lineIndex) => {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(line)) !== null) {
              results.push({
                line: approximateLineNumber + lineIndex,
                column: match.index + 1,
                text: line,
                match: match[0],
                filePosition: currentSamplePosition
              });
            }
          });

          // 估算行号增量
          const avgBytesPerLine = sampleContent.content.length / sampleLines.length;
          approximateLineNumber += Math.floor(samplingInterval / avgBytesPerLine);

        } catch (err) {
          console.warn('Failed to sample at position', currentSamplePosition, err);
        }

        currentSamplePosition += samplingInterval;
      }

      // 检查是否因为结果数量达到限制而停止
      const isLimited = results.length >= 500 && currentSamplePosition < totalSize;
      setFullFileSearchLimited(isLimited);

      return results;
    } catch (err) {
      console.error('Full file search failed:', err);
      return [];
    } finally {
      setFullFileSearchLoading(false);
    }
  }, [isLargeFile, content, totalSize, filePath]);

  // 自动加载文件内容
  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  return {
    // 文件状态
    content,
    loading,
    error,
    loadingMore,
    isLargeFile,
    totalSize,
    currentFilePosition,
    loadedContentSize,
    loadedChunks,
    baselineStartLineNumber,
    dataMetadata,
    presentationMetadata,
    
    // 文件信息（包含类型和所有判断逻辑）
    fileInfo,
    // 为了向后兼容，保留 fileType
    fileType,
    
    // 搜索状态
    searchTerm,
    searchResults,
    fullFileSearchResults,
    currentSearchIndex,
    searchLoading,
    fullFileSearchLoading,
    searchResultsLimited,
    fullFileSearchLimited,
    fullFileSearchMode,
    navigatingToResult,
    
    // 百分比跳转状态
    showPercentInput,
    percentValue,
    
    // 状态设置函数
    setContent,
    setLoading,
    setError,
    setLoadingMore,
    setCurrentFilePosition,
    setLoadedContentSize,
    setLoadedChunks,
    setDataMetadata,
    setPresentationMetadata,
    setSearchTerm,
    setSearchResults,
    setFullFileSearchResults,
    setCurrentSearchIndex,
    setSearchLoading,
    setFullFileSearchLoading,
    setSearchResultsLimited,
    setFullFileSearchLimited,
    setFullFileSearchMode,
    setNavigatingToResult,
    setShowPercentInput,
    setPercentValue,
    setBaselineStartLineNumber,
    
    // 功能函数
    loadFileContent,
    handleScrollToBottom,
    jumpToFilePercentage,
    calculateStartLineNumber,
    performFullFileSearch
  };
};
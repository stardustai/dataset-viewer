import { useCallback, useEffect, useRef, useState } from 'react';
import { configManager } from '../../../config';
import { StorageServiceManager } from '../../../services/storage';
import type { FullFileSearchResult, SearchResult, StorageFile } from '../../../types';
import { getFileType } from '../../../utils/fileTypes';

export const useFileLoader = (file: StorageFile, filePath: string, forceTextMode?: boolean) => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [isLargeFile, setIsLargeFile] = useState<boolean>(false);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [currentFilePosition, setCurrentFilePosition] = useState<number>(0); // 文件中当前读取到的绝对位置
  const [currentStartPosition, setCurrentStartPosition] = useState<number>(0); // 当前内容窗口在文件中的起始位置
  const [loadedContentSize, setLoadedContentSize] = useState<number>(0); // 内存中已加载内容的总大小
  const [loadedChunks, setLoadedChunks] = useState<number>(0);
  const [baselineStartLineNumber, setBaselineStartLineNumber] = useState<number>(1);
  const [loadingBefore, setLoadingBefore] = useState<boolean>(false); // 向前加载状态
  const lastJumpTimestampRef = useRef<number>(0); // 上次跳转时间戳
  const [dataMetadata, setDataMetadata] = useState<{ numRows: number; numColumns: number } | null>(
    null
  );
  const [presentationMetadata, setPresentationMetadata] = useState<{
    slideCount: number;
    size: { width: number; height: number };
  } | null>(null);

  // 搜索相关状态
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [fullFileSearchResults, setFullFileSearchResults] = useState<FullFileSearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [fullFileSearchLoading, setFullFileSearchLoading] = useState<boolean>(false);
  const [searchResultsLimited, setSearchResultsLimited] = useState<boolean>(false);
  const [fullFileSearchLimited, setFullFileSearchLimited] = useState<boolean>(false);
  const [fullFileSearchMode, setFullFileSearchMode] = useState<boolean>(false);

  // 百分比跳转相关状态
  const [showPercentInput, setShowPercentInput] = useState<boolean>(false);
  const [percentValue, setPercentValue] = useState<string>('');

  const config = configManager.getConfig();
  const fileType = getFileType(file.basename);
  const isTextBased = ['text', 'markdown'].includes(fileType);

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
    isPointCloud: fileType === 'pointcloud',
    isTextBased: isTextBased,
    // 辅助方法
    canPreview: () => !['archive', 'unknown'].includes(fileType),
    needsSpecialViewer: () =>
      ['word', 'presentation', 'data', 'spreadsheet', 'pointcloud'].includes(fileType),
  };

  const loadFileContent = useCallback(
    async (forceLoad = false) => {
      try {
        setLoading(true);
        setError(null);

        // 对于非文本文件，不需要加载内容（除非强制加载或者启用了强制文本模式）
        if (!fileInfo.isTextBased && !forceLoad && !forceTextMode) {
          // 清除之前的文本相关状态
          setContent('');
          setTotalSize(0);
          setCurrentFilePosition(0);
          setCurrentStartPosition(0);
          setLoadedContentSize(0);
          setLoadedChunks(0);
          setError(null);
          setLoading(false);
          return;
        }

        // 获取文件大小
        const fileSize = await StorageServiceManager.getFileSize(filePath);
        setTotalSize(fileSize);

        // 判断是否为大文件
        const isLarge = fileSize > config.streaming.maxInitialLoad;
        setIsLargeFile(isLarge);

        // 根据文件大小选择加载策略
        const result = isLarge
          ? await StorageServiceManager.getFileContent(filePath, 0, config.streaming.chunkSize)
          : await StorageServiceManager.getFileContent(filePath);

        const byteLength = new TextEncoder().encode(result.content).length;
        setContent(result.content);
        setCurrentFilePosition(byteLength); // 文件位置：从0读取到byteLength（大文件）或整个文件（小文件）
        setCurrentStartPosition(0); // 窗口开始位置：从文件开头开始
        setLoadedContentSize(byteLength); // 内存中的内容大小
        setLoadedChunks(1);
        setBaselineStartLineNumber(1);
        // 初始加载时设置时间戳，避免立即触发向前加载
        lastJumpTimestampRef.current = Date.now();
      } catch (err) {
        console.error('Failed to load file:', err);
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    },
    [
      filePath,
      isTextBased,
      config.streaming.maxInitialLoad,
      config.streaming.chunkSize,
      forceTextMode,
    ]
  );

  const handleScrollToBottom = useCallback(async () => {
    if (!isLargeFile || loadingMore || loading) return;

    const nextPosition = currentFilePosition;
    if (nextPosition >= totalSize) return;

    try {
      setLoadingMore(true);
      const chunkSize = config.streaming.chunkSize;
      const endPosition = Math.min(nextPosition + chunkSize, totalSize);
      const result = await StorageServiceManager.getFileContent(
        filePath,
        nextPosition,
        endPosition - nextPosition
      );
      const byteLength = new TextEncoder().encode(result.content).length;

      setContent(prev => prev + result.content);
      setCurrentFilePosition(endPosition); // 文件位置：更新到读取结束位置
      setLoadedContentSize(prev => prev + byteLength); // 内存内容：累加新读取的内容
      setLoadedChunks(prev => prev + 1);
    } catch (err) {
      console.error('Failed to load more content:', err);
      setError('Failed to load more content');
    } finally {
      setLoadingMore(false);
    }
  }, [
    isLargeFile,
    loadingMore,
    loading,
    currentFilePosition,
    totalSize,
    filePath,
    config.streaming.chunkSize,
  ]);

  // 新增：向前加载函数（改进版）
  const handleScrollToTop = useCallback(
    async (userScrollDirection?: 'up' | 'down') => {
      if (!isLargeFile || loadingBefore || loading) return;

      // 检查是否已到达文件开头
      if (currentStartPosition <= 0) return;

      // 检查是否刚刚跳转（跳转后5秒内不触发向前加载）
      const currentTime = Date.now();
      if (currentTime - lastJumpTimestampRef.current < 5000) {
        return;
      }

      // 只有用户向上滚动时才触发向前加载
      if (userScrollDirection !== 'up') {
        return;
      }

      try {
        setLoadingBefore(true);
        const chunkSize = config.streaming.chunkSize;
        const startPosition = Math.max(0, currentStartPosition - chunkSize);
        const endPosition = currentStartPosition;

        const result = await StorageServiceManager.getFileContent(
          filePath,
          startPosition,
          endPosition - startPosition
        );
        const byteLength = new TextEncoder().encode(result.content).length;

        // 在内容前面插入新内容
        setContent(prev => result.content + prev);

        setCurrentStartPosition(startPosition); // 更新窗口开始位置
        setLoadedContentSize(prev => prev + byteLength); // 累加新读取的内容
        setLoadedChunks(prev => prev + 1);

        // 重新计算起始行号
        if (startPosition === 0) {
          setBaselineStartLineNumber(1);
        } else {
          // 估算新的起始行号（向前移动）
          const avgBytesPerLine = 50;
          const estimatedLinesAdded = Math.floor(byteLength / avgBytesPerLine);
          setBaselineStartLineNumber(prev => Math.max(1, prev - estimatedLinesAdded));
        }

        return byteLength; // 返回新增内容的字节数，用于调整滚动位置
      } catch (err) {
        console.error('Failed to load previous content:', err);
        setError('Failed to load previous content');
        return 0;
      } finally {
        setLoadingBefore(false);
      }
    },
    [
      isLargeFile,
      loadingBefore,
      loading,
      currentStartPosition,
      filePath,
      config.streaming.chunkSize,
    ]
  );

  const jumpToFilePercentage = useCallback(
    async (percentage: number) => {
      if (!isLargeFile) return;

      try {
        setLoading(true);

        // 设置跳转时间戳
        const jumpTime = Date.now();
        lastJumpTimestampRef.current = jumpTime;

        const targetPosition = Math.floor((totalSize * percentage) / 100);
        const chunkSize = config.streaming.chunkSize;
        const endPosition = Math.min(targetPosition + chunkSize, totalSize);

        const result = await StorageServiceManager.getFileContent(
          filePath,
          targetPosition,
          endPosition - targetPosition
        );
        const byteLength = new TextEncoder().encode(result.content).length;
        setContent(result.content);
        setCurrentFilePosition(endPosition); // 文件位置：跳转后的结束位置
        setCurrentStartPosition(targetPosition); // 窗口开始位置：跳转到的位置
        setLoadedContentSize(byteLength); // 内存内容：重置为当前块的大小
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
    },
    [isLargeFile, totalSize, filePath, config.streaming.chunkSize]
  );

  const calculateStartLineNumber = useCallback(() => {
    if (!isLargeFile) return 1;
    return baselineStartLineNumber;
  }, [isLargeFile, baselineStartLineNumber]);

  // 全文件搜索功能
  const performFullFileSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) return [];

      // 对于小文件，直接在当前内容中搜索
      if (!isLargeFile) {
        const results: FullFileSearchResult[] = [];
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
              filePosition: 0,
            });
          }
        });

        return results;
      }

      // 对于大文件，使用采样搜索
      setFullFileSearchLoading(true);
      try {
        const results: FullFileSearchResult[] = [];
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
            const sampleContent = await StorageServiceManager.getFileContent(
              filePath,
              currentSamplePosition,
              endPosition - currentSamplePosition
            );
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
                  filePosition: currentSamplePosition,
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
    },
    [isLargeFile, content, totalSize, filePath]
  );

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
    loadingBefore,
    isLargeFile,
    totalSize,
    currentFilePosition,
    currentStartPosition,
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

    // 百分比跳转状态
    showPercentInput,
    percentValue,

    // 状态设置函数
    setContent,
    setLoading,
    setError,
    setLoadingMore,
    setCurrentFilePosition,
    setCurrentStartPosition,
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
    setShowPercentInput,
    setPercentValue,
    setBaselineStartLineNumber,

    // 功能函数
    loadFileContent,
    handleScrollToBottom,
    handleScrollToTop,
    jumpToFilePercentage,
    calculateStartLineNumber,
    performFullFileSearch,
  };
};

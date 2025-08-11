import { useCallback, useEffect, useRef } from 'react';
import { SearchResult, FullFileSearchResult } from '../../../types';

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface UseFileSearchProps {
  searchTerm: string;
  fullFileSearchMode: boolean;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  currentSearchIndex: number;
  navigatingToResult: boolean;
  isLargeFile: boolean;
  filePath: string;
  totalSize: number;
  performFullFileSearch: (term: string) => Promise<FullFileSearchResult[]>;
  setSearchLoading: (loading: boolean) => void;
  setFullFileSearchLoading: (loading: boolean) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setFullFileSearchResults: (results: FullFileSearchResult[]) => void;
  setCurrentSearchIndex: (index: number) => void;
  setSearchResultsLimited: (limited: boolean) => void;
  setFullFileSearchLimited: (limited: boolean) => void;
  setNavigatingToResult: (navigating: boolean) => void;
  setBaselineStartLineNumber: (lineNumber: number) => void;
  setContent: (content: string) => void;
  setCurrentFilePosition: (position: number) => void;
  setLoadedContentSize: (size: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useFileSearch = ({
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
  setSearchLoading,
  setFullFileSearchLoading,
  setSearchResults,
  setFullFileSearchResults,
  setCurrentSearchIndex,
  setSearchResultsLimited,
  setFullFileSearchLimited,
  setNavigatingToResult,
  setBaselineStartLineNumber,
  setContent,
  setCurrentFilePosition,
  setLoadedContentSize,
  setLoading,
  setError
}: UseFileSearchProps) => {
  const textViewerRef = useRef<VirtualizedTextViewerRef>(null);

  const handleSearchResults = useCallback((results: SearchResult[], isLimited?: boolean) => {
    // 确保总是重置loading状态
    setSearchLoading(false);

    // 如果正在导航到搜索结果，不要重置搜索索引
    if (navigatingToResult) {
      setSearchResults(results);
      setSearchResultsLimited(isLimited || false);
      return;
    }

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
    setSearchResultsLimited(isLimited || false);
  }, [navigatingToResult, setSearchLoading, setSearchResults, setCurrentSearchIndex, setSearchResultsLimited]);

  const performSearch = useCallback(async (term: string) => {
    if (!term.trim() || term.trim().length < 2) {
      // 清空搜索结果，要求至少2个字符才开始搜索
      setSearchResults([]);
      setFullFileSearchResults([]);
      setCurrentSearchIndex(-1);
      setSearchLoading(false);
      setFullFileSearchLoading(false);
      setSearchResultsLimited(false);
      setFullFileSearchLimited(false);
      return;
    }

    if (fullFileSearchMode) {
      // 执行全文件搜索
      setFullFileSearchLoading(true);
      setSearchLoading(false); // 确保普通搜索loading状态关闭
      try {
        const results = await performFullFileSearch(term);
        setFullFileSearchResults(results);
        setCurrentSearchIndex(results.length > 0 ? 0 : -1);
      } catch (err) {
        console.error('Full file search failed:', err);
        setFullFileSearchResults([]);
        setCurrentSearchIndex(-1);
      } finally {
        setFullFileSearchLoading(false);
      }
    } else {
      // 执行当前内容搜索 - 这里只需要设置loading，实际搜索由VirtualizedTextViewer处理
      setSearchLoading(true);
      setFullFileSearchLoading(false); // 确保全文件搜索loading状态关闭

      // 添加超时保护，防止loading状态永远不被重置
      setTimeout(() => {
        // 如果750ms后loading状态仍然为true，强制重置（500ms FileViewer防抖 + 200ms VirtualizedTextViewer防抖 + 50ms缓冲）
        setSearchLoading(false);
      }, 750);

      // 注意：实际搜索逻辑在VirtualizedTextViewer的useEffect中处理，会调用handleSearchResults
    }
  }, [fullFileSearchMode, performFullFileSearch, setSearchResults, setFullFileSearchResults, setCurrentSearchIndex, setSearchLoading, setFullFileSearchLoading, setSearchResultsLimited, setFullFileSearchLimited]);

  // 处理全文件搜索结果导航
  const navigateToFullFileSearchResult = useCallback(async (result: FullFileSearchResult) => {
    if (!isLargeFile) {
      // 小文件直接滚动到行和列
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
      return;
    }

    // 大文件需要跳转到文件位置
    try {
      setNavigatingToResult(true); // 设置导航标志
      setLoading(true);

      // 跳转到搜索结果附近的文件位置
      const chunkSize = 1024 * 64; // 64KB chunk size
      const targetPosition = Math.max(0, result.filePosition - chunkSize / 2); // 在结果前加载一些内容
      const endPosition = Math.min(targetPosition + chunkSize * 2, totalSize); // 加载2倍chunk大小的内容

      const { StorageServiceManager } = await import('../../../services/storage');
      const newContent = await StorageServiceManager.getFileContent(filePath, targetPosition, endPosition - targetPosition);

      setContent(newContent.content);
      setCurrentFilePosition(targetPosition);
      setLoadedContentSize(newContent.content.length);

      // 计算新的起始行号
      const avgBytesPerLine = 50; // 估算值
      const estimatedStartLine = Math.floor(targetPosition / avgBytesPerLine) + 1;

      // 设置基准起始行号（基于搜索结果导航位置）
      setBaselineStartLineNumber(Math.max(1, estimatedStartLine));

      // 等待内容更新后，滚动到目标行
      setTimeout(() => {
        if (textViewerRef.current) {
          const targetLineInNewContent = Math.max(1, result.line - estimatedStartLine + 1);
          textViewerRef.current.scrollToLine(targetLineInNewContent, result.column);
        }
        // 导航完成后重置标志
        setTimeout(() => {
          setNavigatingToResult(false);
        }, 500);
      }, 100);

    } catch (err) {
      console.error('Failed to navigate to search result:', err);
      setError('Failed to navigate to search result');
      setNavigatingToResult(false);
    } finally {
      setLoading(false);
    }
  }, [isLargeFile, filePath, totalSize, setNavigatingToResult, setLoading, setContent, setCurrentFilePosition, setLoadedContentSize, setBaselineStartLineNumber, setError]);

  const navigateToResult = useCallback((index: number) => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (index < 0 || index >= currentResults.length) return;

    setCurrentSearchIndex(index);
    const result = currentResults[index];

    if (fullFileSearchMode && 'filePosition' in result) {
      // 全文件搜索结果导航
      navigateToFullFileSearchResult(result as FullFileSearchResult);
    } else {
      // 当前内容搜索结果导航
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
    }
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, navigateToFullFileSearchResult, setCurrentSearchIndex]);

  const nextResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % currentResults.length;
    navigateToResult(nextIndex);
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, currentSearchIndex, navigateToResult]);

  const prevResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;
    const prevIndex = currentSearchIndex === 0 ? currentResults.length - 1 : currentSearchIndex - 1;
    navigateToResult(prevIndex);
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, currentSearchIndex, navigateToResult]);

  // 监听搜索词变化，触发搜索
  useEffect(() => {
    // 如果正在导航到搜索结果，不要重新执行搜索
    if (navigatingToResult) return;

    const timeoutId = setTimeout(() => {
      performSearch(searchTerm);
    }, 500); // 增加到500ms防抖，减少搜索频率

    return () => clearTimeout(timeoutId);
  }, [searchTerm, performSearch, navigatingToResult]);

  // 监听搜索模式变化，重新执行搜索
  useEffect(() => {
    // 如果正在导航到搜索结果，不要重新执行搜索
    if (navigatingToResult) return;

    if (searchTerm.trim()) {
      // 保存当前搜索索引
      const currentIndex = currentSearchIndex;
      performSearch(searchTerm);
      // 搜索完成后恢复索引（如果可能的话）
      setTimeout(() => {
        const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
        if (currentResults.length > 0 && currentIndex >= 0 && currentIndex < currentResults.length) {
          setCurrentSearchIndex(currentIndex);
        }
      }, 100);
    }
  }, [fullFileSearchMode, searchTerm, performSearch, navigatingToResult, currentSearchIndex, fullFileSearchResults, searchResults, setCurrentSearchIndex]);

  return {
    textViewerRef,
    handleSearchResults,
    performSearch,
    navigateToResult,
    nextResult,
    prevResult,
    navigateToFullFileSearchResult
  };
};
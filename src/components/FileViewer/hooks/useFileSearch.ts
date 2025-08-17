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
  isLargeFile: boolean;
  filePath: string;
  totalSize: number;
  textViewerRef: React.RefObject<VirtualizedTextViewerRef>;
  performFullFileSearch: (term: string) => Promise<FullFileSearchResult[]>;
  setSearchLoading: (loading: boolean) => void;
  setFullFileSearchLoading: (loading: boolean) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setFullFileSearchResults: (results: FullFileSearchResult[]) => void;
  setCurrentSearchIndex: (index: number) => void;
  setSearchResultsLimited: (limited: boolean) => void;
  setFullFileSearchLimited: (limited: boolean) => void;
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
  isLargeFile,
  filePath,
  totalSize,
  textViewerRef,
  performFullFileSearch,
  setSearchLoading,
  setFullFileSearchLoading,
  setSearchResults,
  setFullFileSearchResults,
  setCurrentSearchIndex,
  setSearchResultsLimited,
  setFullFileSearchLimited,
  setBaselineStartLineNumber,
  setContent,
  setCurrentFilePosition,
  setLoadedContentSize,
  setLoading,
  setError
}: UseFileSearchProps) => {
  // 防止重复搜索的引用
  const lastSearchTermRef = useRef<string>('');
  const lastSearchModeRef = useRef<boolean>(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchResults = useCallback((results: SearchResult[], isLimited?: boolean) => {
    setSearchLoading(false);
    setSearchResults(results);
    setSearchResultsLimited(isLimited || false);

    // 新搜索时总是重置索引到第一个结果
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  }, [setSearchLoading, setSearchResults, setCurrentSearchIndex, setSearchResultsLimited]);

  const performSearch = useCallback(async (term: string, forceSearch: boolean = false) => {
    const trimmedTerm = term.trim();

    // 清空搜索的条件
    if (!trimmedTerm || trimmedTerm.length < 2) {
      setSearchResults([]);
      setFullFileSearchResults([]);
      setCurrentSearchIndex(-1);
      setSearchLoading(false);
      setFullFileSearchLoading(false);
      setSearchResultsLimited(false);
      setFullFileSearchLimited(false);
      lastSearchTermRef.current = '';
      return;
    }

    // 防止重复搜索
    if (!forceSearch &&
        trimmedTerm === lastSearchTermRef.current &&
        fullFileSearchMode === lastSearchModeRef.current) {
      return;
    }

    lastSearchTermRef.current = trimmedTerm;
    lastSearchModeRef.current = fullFileSearchMode;

    if (fullFileSearchMode) {
      // 全文件搜索
      setFullFileSearchLoading(true);
      setSearchLoading(false);
      try {
        const results = await performFullFileSearch(trimmedTerm);
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
      // 当前内容搜索 - 由 VirtualizedTextViewer 处理
      setSearchLoading(true);
      setFullFileSearchLoading(false);

      // 超时保护
      setTimeout(() => {
        setSearchLoading(false);
      }, 1000);
    }
  }, [fullFileSearchMode, performFullFileSearch, setSearchResults, setFullFileSearchResults, setCurrentSearchIndex, setSearchLoading, setFullFileSearchLoading, setSearchResultsLimited, setFullFileSearchLimited]);

  // 全文件搜索结果导航
  const navigateToFullFileSearchResult = useCallback(async (result: FullFileSearchResult) => {
    if (!isLargeFile) {
      // 小文件直接滚动
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
      return;
    }

    // 大文件需要加载新内容
    try {
      setLoading(true);
      const chunkSize = 1024 * 64;
      const targetPosition = Math.max(0, result.filePosition - chunkSize / 2);
      const endPosition = Math.min(targetPosition + chunkSize * 2, totalSize);

      const { StorageServiceManager } = await import('../../../services/storage');
      const newContent = await StorageServiceManager.getFileContent(filePath, targetPosition, endPosition - targetPosition);

      setContent(newContent.content);
      setCurrentFilePosition(targetPosition);
      setLoadedContentSize(newContent.content.length);

      const avgBytesPerLine = 50;
      const estimatedStartLine = Math.floor(targetPosition / avgBytesPerLine) + 1;
      setBaselineStartLineNumber(Math.max(1, estimatedStartLine));

      // 滚动到目标行
      setTimeout(() => {
        if (textViewerRef.current) {
          const targetLineInNewContent = Math.max(1, result.line - estimatedStartLine + 1);
          textViewerRef.current.scrollToLine(targetLineInNewContent, result.column);
        }
      }, 100);

    } catch (err) {
      console.error('Failed to navigate to search result:', err);
      setError('Failed to navigate to search result');
    } finally {
      setLoading(false);
    }
  }, [isLargeFile, filePath, totalSize, textViewerRef, setLoading, setContent, setCurrentFilePosition, setLoadedContentSize, setBaselineStartLineNumber, setError]);

  // 导航到搜索结果
  const navigateToResult = useCallback((index: number) => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (index < 0 || index >= currentResults.length) return;

    setCurrentSearchIndex(index);
    const result = currentResults[index];

    if (fullFileSearchMode && 'filePosition' in result) {
      navigateToFullFileSearchResult(result as FullFileSearchResult);
    } else {
      if (textViewerRef.current) {
        textViewerRef.current.scrollToLine(result.line, result.column);
      }
    }
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, setCurrentSearchIndex, navigateToFullFileSearchResult, textViewerRef]);

  // 下一个搜索结果（简化版本）
  const nextResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;

    const nextIndex = (currentSearchIndex + 1) % currentResults.length;
    navigateToResult(nextIndex);
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, currentSearchIndex, navigateToResult]);

  // 上一个搜索结果（简化版本）
  const prevResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;

    const prevIndex = currentSearchIndex === 0 ? currentResults.length - 1 : currentSearchIndex - 1;
    navigateToResult(prevIndex);
  }, [fullFileSearchMode, fullFileSearchResults, searchResults, currentSearchIndex, navigateToResult]);

  // 搜索词变化时的处理 - 使用防抖避免频繁搜索
  useEffect(() => {
    // 清理之前的定时器
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 设置新的定时器
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchTerm);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, performSearch]);

  // 搜索模式变化时强制重新搜索
  useEffect(() => {
    if (searchTerm.trim() && searchTerm.trim().length >= 2) {
      performSearch(searchTerm, true); // 强制搜索
    }
  }, [fullFileSearchMode, searchTerm, performSearch]);

  return {
    handleSearchResults,
    performSearch,
    navigateToResult,
    nextResult,
    prevResult,
    navigateToFullFileSearchResult
  };
};

import { useCallback, useEffect, useRef } from 'react';
import { useStorageStore } from '../../../stores/storageStore';
import type { FullFileSearchResult, SearchResult } from '../../../types';

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
  currentFilePosition: number;
  loadedContentSize: number;
  textViewerRef: React.RefObject<VirtualizedTextViewerRef | null>;
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
  currentFilePosition,
  loadedContentSize,
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
  setError,
}: UseFileSearchProps) => {
  // 获取存储服务
  const { getFileContent } = useStorageStore();

  // 防止重复搜索和导航期间搜索的引用
  const lastSearchTermRef = useRef<string>('');
  const lastSearchModeRef = useRef<boolean>(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef<boolean>(false);

  // 清理定时器的函数
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchResults = useCallback(
    (results: SearchResult[], isLimited?: boolean) => {
      setSearchLoading(false);
      setSearchResults(results);
      setSearchResultsLimited(isLimited || false);

      // 新搜索时总是重置索引到第一个结果
      setCurrentSearchIndex(results.length > 0 ? 0 : -1);
    },
    [setSearchLoading, setSearchResults, setCurrentSearchIndex, setSearchResultsLimited]
  );

  const performSearch = useCallback(
    async (term: string, forceSearch: boolean = false) => {
      const trimmedTerm = term.trim();

      // 导航期间跳过搜索，除非强制搜索
      if (isNavigatingRef.current && !forceSearch) {
        return;
      }

      // 清空搜索条件
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
      if (
        !forceSearch &&
        trimmedTerm === lastSearchTermRef.current &&
        fullFileSearchMode === lastSearchModeRef.current
      ) {
        return;
      }

      lastSearchTermRef.current = trimmedTerm;
      lastSearchModeRef.current = fullFileSearchMode;

      if (fullFileSearchMode) {
        // 全文件搜索
        setFullFileSearchLoading(true);
        setSearchLoading(false);
        setFullFileSearchResults([]); // 清空之前的结果
        try {
          const results = await performFullFileSearch(trimmedTerm);
          setFullFileSearchResults(results);
          setCurrentSearchIndex(results.length > 0 ? 0 : -1);
          setFullFileSearchLimited(results.length >= 500); // 假设500是全文件搜索限制
        } catch (err) {
          console.error('Full file search failed:', err);
          setFullFileSearchResults([]);
          setCurrentSearchIndex(-1);
          setFullFileSearchLimited(false);
        } finally {
          setFullFileSearchLoading(false);
        }
      } else {
        // 当前内容搜索 - 完全由 VirtualizedTextViewer 处理
        // 这里只需要清空全文件搜索的相关状态，不设置loading
        setFullFileSearchLoading(false);
        setFullFileSearchResults([]); // 清空全文件搜索结果
        setFullFileSearchLimited(false);
        // 注意：不设置 setSearchLoading(true)，让 VirtualizedTextViewer 自己管理
      }
    },
    [
      fullFileSearchMode,
      performFullFileSearch,
      setSearchResults,
      setFullFileSearchResults,
      setCurrentSearchIndex,
      setSearchLoading,
      setFullFileSearchLoading,
      setSearchResultsLimited,
      setFullFileSearchLimited,
    ]
  );

  // 全文件搜索结果导航
  const navigateToFullFileSearchResult = useCallback(
    async (result: FullFileSearchResult) => {
      if (!isLargeFile) {
        // 小文件直接滚动
        if (textViewerRef.current) {
          textViewerRef.current.scrollToLine(result.line, result.column);
        }
        return;
      }

      // 大文件：检查目标搜索结果是否在当前已加载的内容块中
      const chunkSize = 64 * 1024; // 64KB
      const targetPosition = result.filePosition;

      // 获取当前已加载内容的范围
      const currentChunkStart = currentFilePosition;
      const currentChunkEnd = currentChunkStart + loadedContentSize;

      // 如果目标位置在当前加载的内容范围内，直接滚动到目标行
      if (targetPosition >= currentChunkStart && targetPosition <= currentChunkEnd) {
        if (textViewerRef.current) {
          // 计算目标行在当前内容中的相对位置
          const avgBytesPerLine = 50;
          const estimatedStartLine = Math.floor(currentChunkStart / avgBytesPerLine) + 1;
          const targetLineInCurrentContent = Math.max(1, result.line - estimatedStartLine + 1);
          textViewerRef.current.scrollToLine(targetLineInCurrentContent, result.column);
        }
        return;
      }

      // 如果目标位置不在当前内容中，才重新加载内容
      try {
        setLoading(true);
        isNavigatingRef.current = true; // 防止加载新内容时触发重新搜索

        const newTargetPosition = Math.max(0, targetPosition - chunkSize / 2);
        const endPosition = Math.min(newTargetPosition + chunkSize * 2, totalSize);

        const newContent = await getFileContent(filePath, {
          start: newTargetPosition,
          length: endPosition - newTargetPosition,
        });

        setContent(newContent.content);
        setCurrentFilePosition(newTargetPosition);
        setLoadedContentSize(newContent.content.length);

        // 估算起始行号
        const avgBytesPerLine = 50;
        const estimatedStartLine = Math.floor(newTargetPosition / avgBytesPerLine) + 1;
        setBaselineStartLineNumber(Math.max(1, estimatedStartLine));

        // 延迟滚动，等待内容渲染完成
        setTimeout(() => {
          if (textViewerRef.current) {
            const targetLineInNewContent = Math.max(1, result.line - estimatedStartLine + 1);
            textViewerRef.current.scrollToLine(targetLineInNewContent, result.column);
          }
          isNavigatingRef.current = false; // 导航完成，重置标志
        }, 150);
      } catch (err) {
        console.error('Failed to navigate to search result:', err);
        setError('Failed to navigate to search result');
        isNavigatingRef.current = false; // 确保在错误时也重置标志
      } finally {
        setLoading(false);
      }
    },
    [
      isLargeFile,
      filePath,
      totalSize,
      textViewerRef,
      setLoading,
      setContent,
      setCurrentFilePosition,
      setLoadedContentSize,
      setBaselineStartLineNumber,
      setError,
    ]
  );

  // 统一的搜索结果导航
  const navigateToResult = useCallback(
    (index: number) => {
      const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
      if (index < 0 || index >= currentResults.length) return;

      setCurrentSearchIndex(index);
      const result = currentResults[index];

      if (fullFileSearchMode && 'filePosition' in result) {
        // 全文件搜索结果
        navigateToFullFileSearchResult(result as FullFileSearchResult);
      } else {
        // 当前内容搜索结果，直接滚动
        if (textViewerRef.current) {
          textViewerRef.current.scrollToLine(result.line, result.column);
        }
      }
    },
    [
      fullFileSearchMode,
      fullFileSearchResults,
      searchResults,
      setCurrentSearchIndex,
      navigateToFullFileSearchResult,
      textViewerRef,
    ]
  );

  // 下一个/上一个搜索结果
  const nextResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;

    const nextIndex = (currentSearchIndex + 1) % currentResults.length;
    navigateToResult(nextIndex);
  }, [
    fullFileSearchMode,
    fullFileSearchResults,
    searchResults,
    currentSearchIndex,
    navigateToResult,
  ]);

  const prevResult = useCallback(() => {
    const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
    if (currentResults.length === 0) return;

    const prevIndex = currentSearchIndex === 0 ? currentResults.length - 1 : currentSearchIndex - 1;
    navigateToResult(prevIndex);
  }, [
    fullFileSearchMode,
    fullFileSearchResults,
    searchResults,
    currentSearchIndex,
    navigateToResult,
  ]);

  // 搜索词变化时的防抖处理
  useEffect(() => {
    // 导航期间不执行搜索
    if (isNavigatingRef.current) {
      return;
    }

    // 清理之前的定时器
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 如果搜索词为空，立即清空结果
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
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

    // 防抖：300ms后执行搜索
    searchTimeoutRef.current = setTimeout(() => {
      // 再次检查导航状态
      if (!isNavigatingRef.current) {
        performSearch(searchTerm);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, performSearch]);

  // 搜索模式切换时立即重新搜索
  useEffect(() => {
    // 导航期间不切换搜索模式
    if (isNavigatingRef.current) {
      return;
    }

    if (searchTerm.trim() && searchTerm.trim().length >= 2) {
      performSearch(searchTerm, true); // 强制搜索
    }
  }, [fullFileSearchMode, performSearch]); // 移除 searchTerm 依赖，避免重复触发

  return {
    handleSearchResults,
    performSearch,
    navigateToResult,
    nextResult,
    prevResult,
    navigateToFullFileSearchResult,
  };
};

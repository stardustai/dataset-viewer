import { useCallback, useEffect, useRef } from 'react';

interface SearchResult {
  line: number;
  column: number;
  text: string;
  match: string;
}

interface UseTextViewerSearchProps {
  searchTerm: string;
  visibleLines: Array<{ line: string; originalIndex: number }>;
  startLineNumber: number;
  onSearchResults?: (results: SearchResult[], isLimited?: boolean) => void;
}

const MAX_SEARCH_RESULTS = 1000;
const MAX_LINE_LENGTH = 10000;

export const useTextViewerSearch = ({
  searchTerm,
  visibleLines,
  startLineNumber,
  onSearchResults,
}: UseTextViewerSearchProps) => {
  const lastSearchTermRef = useRef<string>('');
  const lastVisibleLinesCountRef = useRef<number>(0);

  const performSearch = useCallback(
    (term: string) => {
      if (!term || term.length < 2) {
        onSearchResults?.([], false);
        return;
      }

      const results: SearchResult[] = [];
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      for (const { line, originalIndex } of visibleLines) {
        if (results.length >= MAX_SEARCH_RESULTS) break;

        const searchLine =
          line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) : line;
        let match;
        regex.lastIndex = 0;

        while ((match = regex.exec(searchLine)) !== null && results.length < MAX_SEARCH_RESULTS) {
          results.push({
            line: startLineNumber + originalIndex,
            column: match.index + 1,
            text: line.length > 200 ? line.substring(0, 200) + '...' : line,
            match: match[0],
          });

          if (regex.lastIndex === match.index) regex.lastIndex++;
        }
      }

      onSearchResults?.(results, results.length >= MAX_SEARCH_RESULTS);
    },
    [onSearchResults, startLineNumber, visibleLines]
  );

  useEffect(() => {
    const currentVisibleCount = visibleLines.length;
    const shouldSearch =
      searchTerm !== lastSearchTermRef.current ||
      Math.abs(currentVisibleCount - lastVisibleLinesCountRef.current) > 100;

    if (shouldSearch) {
      lastSearchTermRef.current = searchTerm;
      lastVisibleLinesCountRef.current = currentVisibleCount;
      performSearch(searchTerm);
    }
  }, [searchTerm, performSearch, visibleLines.length]);

  const searchRegex =
    searchTerm && searchTerm.length >= 2
      ? new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
      : null;

  const searchResultsMap = new Map();

  return {
    searchRegex,
    searchResultsMap,
    performSearch,
  };
};

import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedTextViewerProps {
  content: string;
  searchTerm?: string;
  onSearchResults?: (results: Array<{ line: number; column: number; text: string; match: string }>, isLimited?: boolean) => void;
  onScrollToBottom?: () => void;
  className?: string;
  height?: number;
  startLineNumber?: number;
  currentSearchIndex?: number;
  searchResults?: Array<{ line: number; column: number; text: string; match: string }>;
}

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

const MAX_SEARCH_RESULTS = 1000;

export const VirtualizedTextViewer = forwardRef<VirtualizedTextViewerRef, VirtualizedTextViewerProps>(({
  content,
  searchTerm = '',
  onSearchResults,
  onScrollToBottom,
  className = '',
  height,
  startLineNumber = 1,
  currentSearchIndex = -1,
  searchResults = [],
}, ref) => {
  // 将内容分割为行
  const lines = useMemo(() => content.split('\n'), [content]);

  // Refs
  const parentRef = useRef<HTMLDivElement>(null);
  const highlightCacheRef = useRef<Map<string, React.ReactNode>>(new Map());

  // 虚拟化配置 - 使用固定行高简化实现
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24, // 固定行高
    overscan: 10,
  });

  // 搜索功能
  const performSearch = useCallback((term: string) => {
    if (!term.trim() || !onSearchResults) {
      onSearchResults?.([], false);
      highlightCacheRef.current.clear();
      return;
    }

    try {
      const results: Array<{ line: number; column: number; text: string; match: string }> = [];
      const searchRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      let resultCount = 0;

      for (let i = 0; i < lines.length && resultCount < MAX_SEARCH_RESULTS; i++) {
        const line = lines[i];
        let match;
        searchRegex.lastIndex = 0;

        while ((match = searchRegex.exec(line)) !== null && resultCount < MAX_SEARCH_RESULTS) {
          results.push({
            line: startLineNumber + i,
            column: match.index + 1,
            text: line,
            match: match[0]
          });
          resultCount++;

          if (searchRegex.lastIndex === match.index) {
            searchRegex.lastIndex++;
          }
        }
      }

      const isLimited = resultCount >= MAX_SEARCH_RESULTS;
      onSearchResults(results, isLimited);
      highlightCacheRef.current.clear();
    } catch (error) {
      console.warn('Search failed:', error);
      onSearchResults([], false);
    }
  }, [lines, startLineNumber, onSearchResults]);

  // 搜索效果
  useEffect(() => {
    performSearch(searchTerm);
  }, [searchTerm, performSearch]);

  // 当前搜索索引变化时清理缓存
  useEffect(() => {
    highlightCacheRef.current.clear();
  }, [currentSearchIndex]);

  // 高亮渲染函数
  const renderLineWithHighlight = useCallback((text: string, lineIndex: number) => {
    if (!searchTerm || searchTerm.length < 2) {
      return text;
    }

    const cacheKey = `${searchTerm}-${lineIndex}-${currentSearchIndex}`;
    if (highlightCacheRef.current.has(cacheKey)) {
      return highlightCacheRef.current.get(cacheKey);
    }

    try {
      const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedTerm})`, 'gi');

      // 当前行号（基于 startLineNumber）
      const currentLineNumber = startLineNumber + lineIndex;

      // 获取当前活跃的搜索结果
      const activeResult = currentSearchIndex >= 0 && searchResults[currentSearchIndex]
        ? searchResults[currentSearchIndex]
        : null;

      // 查找所有匹配
      const matches: Array<{ start: number; end: number; text: string; isActive: boolean }> = [];
      let match;
      regex.lastIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        const isActiveMatch = activeResult &&
          activeResult.line === currentLineNumber &&
          activeResult.column === match.index + 1 &&
          activeResult.match === match[0];

        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          isActive: !!isActiveMatch
        });

        // 防止无限循环
        if (regex.lastIndex === match.index) {
          regex.lastIndex++;
        }
      }

      if (matches.length === 0) {
        highlightCacheRef.current.set(cacheKey, text);
        return text;
      }

      // 构建高亮结果
      const result: React.ReactNode[] = [];
      let lastIndex = 0;

      matches.forEach((match, index) => {
        // 添加匹配前的文本
        if (match.start > lastIndex) {
          result.push(text.slice(lastIndex, match.start));
        }

        // 添加高亮的匹配文本
        const highlightClass = match.isActive
          ? "search-highlight-active"
          : "search-highlight";

        result.push(
          <mark key={`match-${index}`} className={highlightClass}>
            {match.text}
          </mark>
        );

        lastIndex = match.end;
      });

      // 添加最后剩余的文本
      if (lastIndex < text.length) {
        result.push(text.slice(lastIndex));
      }

      highlightCacheRef.current.set(cacheKey, result);
      return result;
    } catch (error) {
      return text;
    }
  }, [searchTerm, currentSearchIndex, searchResults, startLineNumber]);

  // 滚动方法
  const scrollToLine = useCallback((lineNumber: number) => {
    const index = lineNumber - startLineNumber;
    if (index >= 0 && index < lines.length) {
      virtualizer.scrollToIndex(index, { align: 'center' });
    }
  }, [virtualizer, startLineNumber, lines.length]);

  const scrollToPercentage = useCallback((percentage: number) => {
    if (lines.length > 0) {
      const targetIndex = Math.floor((lines.length - 1) * (percentage / 100));
      virtualizer.scrollToIndex(targetIndex, { align: 'start' });
    }
  }, [virtualizer, lines.length]);

  const jumpToFilePosition = useCallback((filePosition: number) => {
    if (lines.length === 0 || filePosition < 0) return;

    let cumulativeLength = 0;
    for (let i = 0; i < lines.length; i++) {
      if (cumulativeLength + lines[i].length >= filePosition) {
        scrollToLine(startLineNumber + i);
        return;
      }
      cumulativeLength += lines[i].length + 1; // +1 for newline
    }

    scrollToLine(startLineNumber + lines.length - 1);
  }, [lines, scrollToLine, startLineNumber]);

  // 暴露方法
  useImperativeHandle(ref, () => ({
    scrollToLine,
    scrollToPercentage,
    jumpToFilePosition,
  }), [scrollToLine, scrollToPercentage, jumpToFilePosition]);

  // 滚动到当前搜索结果
  useEffect(() => {
    if (currentSearchIndex >= 0 && searchResults[currentSearchIndex]) {
      scrollToLine(searchResults[currentSearchIndex].line);
    }
  }, [currentSearchIndex, searchResults, scrollToLine]);

  // 滚动到底部检测
  useEffect(() => {
    const handleScroll = () => {
      if (!parentRef.current || !onScrollToBottom) return;

      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;

      if (isNearBottom) {
        onScrollToBottom();
      }
    };

    const element = parentRef.current;
    if (element) {
      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }
  }, [onScrollToBottom]);

  return (
    <div
      ref={parentRef}
      className={`w-full overflow-auto bg-white dark:bg-gray-900 ${className}`}
      style={{ height: height ? `${height}px` : '100%' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: 'max-content',
          minWidth: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            className="absolute top-0 left-0 w-full"
            style={{
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
              minWidth: 'max-content',
            }}
          >
            <div className="grid grid-cols-[56px_1fr] text-[13px] font-mono leading-6 h-full min-w-max">
              {/* 行号 */}
              <div className="text-right pr-2 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 select-none">
                {startLineNumber + virtualItem.index}
              </div>

              {/* 代码内容 */}
              <div className="pl-2 pr-4 text-gray-900 dark:text-gray-100 whitespace-pre">
                {renderLineWithHighlight(lines[virtualItem.index] || '', virtualItem.index)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

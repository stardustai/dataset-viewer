import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy } from 'lucide-react';
import { copyToClipboard, showCopyToast } from '../utils/clipboard';

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
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

// 行内容弹窗组件
const LineContentModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lineNumber: number;
  content: string;
  searchTerm?: string;
}> = ({ isOpen, onClose, lineNumber, content, searchTerm }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // 处理点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') onClose();
      });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', (e) => {
        if (e.key === 'Escape') onClose();
      });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 高亮搜索词
  const renderHighlightedContent = (text: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      return text;
    }

    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
        return (
          <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[72vh] flex flex-col"
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('line.content', { line: lineNumber })}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
          >
            ×
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 font-mono text-sm whitespace-pre-wrap break-words">
            {renderHighlightedContent(content)}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          <span>{t('characters')}: {content.length}</span>
          <button
            onClick={async () => {
              const success = await copyToClipboard(content);
              if (success) {
                showCopyToast(t('copied.to.clipboard'));
              } else {
                showCopyToast(t('copy.failed'));
              }
            }}
            className="flex items-center space-x-2 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <Copy className="w-4 h-4" />
            <span>{t('copy.line.content')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const contentRef = useRef<HTMLDivElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const highlightCacheRef = useRef<Map<string, React.ReactNode>>(new Map());
  const textMeasureRef = useRef<HTMLCanvasElement | null>(null);

  // 弹窗状态
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    lineNumber: number;
    content: string;
  }>({
    isOpen: false,
    lineNumber: 0,
    content: '',
  });

  // 处理行点击
  const handleLineClick = useCallback((lineIndex: number) => {
    const lineNumber = startLineNumber + lineIndex;
    const lineContent = lines[lineIndex] || '';
    setModalState({
      isOpen: true,
      lineNumber,
      content: lineContent,
    });
  }, [startLineNumber, lines]);

  // 关闭弹窗
  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // 虚拟化配置 - 使用固定行高简化实现
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => contentRef.current,
    estimateSize: () => 24, // 固定行高
    overscan: 10,
  });

  // 动态计算行号区域宽度
  const calculateLineNumberWidth = useMemo(() => {
    const maxLineNumber = startLineNumber + lines.length - 1;
    const digits = Math.max(3, String(maxLineNumber).length); // 至少3位数宽度
    return Math.max(60, digits * 8 + 16); // 每位数8px + 左右padding 16px，最小60px
  }, [startLineNumber, lines.length]);

  // 使用 Canvas 精确测量文本宽度
  const measureTextWidth = useCallback((text: string) => {
    if (!textMeasureRef.current) {
      textMeasureRef.current = document.createElement('canvas');
    }

    const canvas = textMeasureRef.current;
    const context = canvas.getContext('2d');
    if (!context) return text.length * 8; // 备用方案

    // 设置与实际渲染相同的字体
    context.font = '13px ui-monospace, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';
    return context.measureText(text).width;
  }, []);

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
  const scrollToLine = useCallback((lineNumber: number, column?: number) => {
    const index = lineNumber - startLineNumber;
    if (index >= 0 && index < lines.length) {
      virtualizer.scrollToIndex(index, { align: 'center' });

      // 如果提供了列号，等待纵向滚动完成后再进行横向滚动
      if (column !== undefined && contentRef.current) {
        setTimeout(() => {
          const container = contentRef.current;
          if (!container) return;

          const padding = 8; // 左侧padding

          // 获取目标行的实际文本内容，更准确地计算位置
          const targetLineContent = lines[index] || '';
          const textBeforeColumn = targetLineContent.substring(0, column - 1);

          // 使用 Canvas 精确测量文本宽度
          const actualTextWidth = measureTextWidth(textBeforeColumn);
          const targetX = padding + actualTextWidth;

          // 获取容器的可视区域宽度
          const containerWidth = container.clientWidth;
          const scrollLeft = container.scrollLeft;
          const visibleStart = scrollLeft;
          const visibleEnd = scrollLeft + containerWidth;

          // 如果目标位置不在可视区域内，则滚动到合适位置
          if (targetX < visibleStart || targetX > visibleEnd - 100) { // 留一些边距
            // 将目标位置滚动到可视区域的左侧1/4位置，便于查看上下文
            const newScrollLeft = Math.max(0, targetX - containerWidth / 4);
            container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
          }
        }, 150); // 增加到150ms让纵向滚动更充分完成
      }
    }
  }, [virtualizer, startLineNumber, lines.length, lines, measureTextWidth]);

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
      const result = searchResults[currentSearchIndex];
      scrollToLine(result.line, result.column);
    }
  }, [currentSearchIndex, searchResults, scrollToLine]);

  // 滚动到底部检测和行号同步
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || !lineNumberRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;

      // 同步行号区域的垂直滚动
      lineNumberRef.current.scrollTop = scrollTop;

      // 检查是否接近底部
      if (onScrollToBottom) {
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
        if (isNearBottom) {
          onScrollToBottom();
        }
      }
    };

    const element = contentRef.current;
    if (element) {
      element.addEventListener('scroll', handleScroll);
      return () => element.removeEventListener('scroll', handleScroll);
    }
  }, [onScrollToBottom]);

  return (
    <div
      ref={parentRef}
      className={`w-full h-full flex bg-white dark:bg-gray-900 ${className}`}
      style={{ height: height ? `${height}px` : '100%' }}
    >
      {/* 固定的行号区域 */}
      <div
        ref={lineNumberRef}
        className="bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden"
        style={{ width: `${calculateLineNumberWidth}px` }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const currentLineNumber = startLineNumber + virtualItem.index;
            const isCurrentSearchLine = currentSearchIndex >= 0 &&
              searchResults[currentSearchIndex] &&
              searchResults[currentSearchIndex].line === currentLineNumber;

            return (
              <div
                key={`line-${virtualItem.key}`}
                className={`absolute w-full text-right pr-2 text-[13px] font-mono leading-6 select-none ${
                  isCurrentSearchLine
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-semibold'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {/* 当前搜索行指示器 */}
                {isCurrentSearchLine && (
                  <div className="absolute left-1 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
                {currentLineNumber}
              </div>
            );
          })}
        </div>
      </div>

      {/* 可滚动的内容区域 */}
      <div
        ref={contentRef}
        className="flex-1 overflow-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: 'max-content',
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const currentLineNumber = startLineNumber + virtualItem.index;
            const isCurrentSearchLine = currentSearchIndex >= 0 &&
              searchResults[currentSearchIndex] &&
              searchResults[currentSearchIndex].line === currentLineNumber;

            return (
              <div
                key={`content-${virtualItem.key}`}
                className={`absolute top-0 left-0 w-full cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  isCurrentSearchLine ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                }`}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                  minWidth: 'max-content',
                }}
                onClick={() => handleLineClick(virtualItem.index)}
                title="点击查看完整行内容"
              >
                <div className="text-[13px] font-mono leading-6 h-full pl-2 pr-4 text-gray-900 dark:text-gray-100 whitespace-pre">
                  {renderLineWithHighlight(lines[virtualItem.index] || '', virtualItem.index)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 行内容弹窗 */}
      <LineContentModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        lineNumber={modalState.lineNumber}
        content={modalState.content}
        searchTerm={searchTerm}
      />
    </div>
  );
});

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getLanguageFromFileName, isLanguageSupported, highlightLine } from '../../../utils/syntaxHighlighter';
import { useTheme } from '../../../hooks/useTheme';
import { useSyntaxHighlighting } from '../../../hooks/useSyntaxHighlighting';
import { LineContentModal } from './LineContentModal';
import { MarkdownPreviewModal } from './MarkdownPreviewModal';
import { FoldingIndicator, useFoldingLogic } from './CodeFoldingControls';
import type { FoldableRange } from '../../../utils/codeFolding';

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
  fileName?: string;
  isMarkdown?: boolean;
  isMarkdownPreviewOpen?: boolean;
  setIsMarkdownPreviewOpen?: (open: boolean) => void;
}

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

const MAX_SEARCH_RESULTS = 1000;
const MAX_LINE_LENGTH = 10000;
const TRUNCATE_LENGTH = 200;

export const VirtualizedTextViewer = forwardRef<VirtualizedTextViewerRef, VirtualizedTextViewerProps>(({
    content,
    searchTerm = '',
    onSearchResults,
    onScrollToBottom,
    className = '',
    startLineNumber = 1,
    currentSearchIndex = -1,
    searchResults = [],
    fileName = '',
    isMarkdown = false,
    isMarkdownPreviewOpen = false,
    setIsMarkdownPreviewOpen,
  },
  ref
) => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const { enabled: syntaxHighlightingEnabled } = useSyntaxHighlighting();
  const containerRef = useRef<HTMLDivElement>(null);

  // 简化状态管理
  const [modalState, setModalState] = useState({ isOpen: false, lineNumber: 0, content: '' });
  const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [expandedLongLines, setExpandedLongLines] = useState<Set<number>>(new Set());

  const lines = content.split('\n');

  // 使用新的折叠逻辑 hook
  const {
    supportsFolding,
    foldableRanges,
    collapsedRanges,
    visibleLines,
    getFoldableRangeAtLine,
    toggleFoldingRange
  } = useFoldingLogic({
    lines,
    fileName
  });

  // 简化计算
  const lineNumberWidth = Math.max(40, (startLineNumber + lines.length - 1).toString().length * 8 + 24);
  const detectedLanguage = syntaxHighlightingEnabled && fileName ? getLanguageFromFileName(fileName) : 'text';
  const shouldHighlight = syntaxHighlightingEnabled && isLanguageSupported(detectedLanguage);

  // 自动加载逻辑 + 清空高亮缓存
  useEffect(() => {
    // 自动加载
    if (lines.length < 30 && onScrollToBottom) {
      const timer = setTimeout(onScrollToBottom, 100);
      return () => clearTimeout(timer);
    }

    // 内容变化时清空高亮缓存
    setHighlightedLines(new Map());
  }, [lines.length, onScrollToBottom, detectedLanguage, isDark]);

  // 搜索相关
  const searchResultsMap = new Map(searchResults.map(result => [result.line, true]));
  const searchRegex = searchTerm && searchTerm.length >= 2
    ? new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    : null;

  // 高亮行的异步处理和缓存
  const highlightVisibleLines = useCallback(async (virtualItems: any[]) => {
    if (!shouldHighlight || isHighlighting) return;

    setIsHighlighting(true);
    const lineIndexesToHighlight: number[] = [];

    // 找出需要高亮但尚未缓存的行，并跳过超长行
    virtualItems.forEach(item => {
      const lineLength = lines[item.index]?.length || 0;
      if (!highlightedLines.has(item.index) && lineLength < MAX_LINE_LENGTH) {
        lineIndexesToHighlight.push(item.index);
      }
    });

    if (lineIndexesToHighlight.length === 0) {
      setIsHighlighting(false);
      return;
    }

    try {
      const linesToHighlight = lineIndexesToHighlight.map(index => lines[index] || '');
      const results = await Promise.all(
        linesToHighlight.map(line =>
          highlightLine(line, detectedLanguage, isDark ? 'dark' : 'light')
        )
      );

      setHighlightedLines(prev => {
        const newMap = new Map(prev);
        lineIndexesToHighlight.forEach((lineIndex, i) => {
          newMap.set(lineIndex, results[i]);
        });
        return newMap;
      });
    } catch (error) {
      console.error('Error highlighting lines:', error);
    } finally {
      setIsHighlighting(false);
    }
  }, [shouldHighlight, isHighlighting, highlightedLines, lines, detectedLanguage, isDark]);

  const virtualizer = useVirtualizer({
    count: visibleLines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 24, // 固定行高
    overscan: 3,
    measureElement: undefined,
  });

  // 当虚拟项改变时，触发可见行的语法高亮
  useEffect(() => {
    if (shouldHighlight) {
      const virtualItems = virtualizer.getVirtualItems();
      const lineIndexesToHighlight = virtualItems.map(item => visibleLines[item.index]?.originalIndex).filter(index => index !== undefined);
      highlightVisibleLines(virtualItems.map((item, i) => ({ ...item, index: lineIndexesToHighlight[i] })).filter(item => item.index !== undefined));
    }
  }, [virtualizer.getVirtualItems(), shouldHighlight, highlightVisibleLines, visibleLines]);

  const performSearch = useCallback((term: string) => {
    if (!term || term.length < 2) {
      onSearchResults?.([], false);
      return;
    }

    const results: Array<{ line: number; column: number; text: string; match: string }> = [];
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    for (const { line, originalIndex } of visibleLines) {
      if (results.length >= MAX_SEARCH_RESULTS) break;

      const searchLine = line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) : line;
      let match;
      regex.lastIndex = 0;

      while ((match = regex.exec(searchLine)) !== null && results.length < MAX_SEARCH_RESULTS) {
        results.push({
          line: startLineNumber + originalIndex,
          column: match.index + 1,
          text: line.length > 200 ? line.substring(0, 200) + '...' : line,
          match: match[0]
        });

        if (regex.lastIndex === match.index) regex.lastIndex++;
      }
    }

    onSearchResults?.(results, results.length >= MAX_SEARCH_RESULTS);
  }, [onSearchResults, startLineNumber, visibleLines]);

  useEffect(() => {
    performSearch(searchTerm);
  }, [searchTerm, performSearch]);

  const renderLineWithHighlight = useCallback((line: string, _lineIndex: number, originalLineIndex: number) => {
    const currentLineNumber = startLineNumber + originalLineIndex;
    const isLongLine = line.length > 500;
    const isExpanded = expandedLongLines.has(originalLineIndex);

    // 性能优化：只在支持折叠时检查折叠范围
    let foldableRange: FoldableRange | null = null;
    let isRangeCollapsed = false;

    if (supportsFolding) {
      // 使用优化的缓存函数而不是每次线性查找
      foldableRange = getFoldableRangeAtLine(originalLineIndex);
      isRangeCollapsed = foldableRange ? collapsedRanges.has(foldableRange.id) : false;
    }

    // 对于超长行，如果未展开则截断显示
    let displayLine = line;
    let showExpandButton = false;

    if (isLongLine && !isExpanded && line.length > TRUNCATE_LENGTH) {
      displayLine = line.substring(0, TRUNCATE_LENGTH) + '...';
      showExpandButton = true;
    }

    // 获取语法高亮的内容（仅对较短的行或已展开的行进行语法高亮）
    let processedLine = displayLine;
    if (shouldHighlight && highlightedLines.has(originalLineIndex) && (line.length < MAX_LINE_LENGTH || isExpanded)) {
      const highlighted = highlightedLines.get(originalLineIndex);
      if (highlighted && highlighted !== line) {
        processedLine = highlighted;
      }
    }

    // 如果没有搜索词，直接返回
    if (!searchRegex) {
      return (
        <div className="flex items-center">
          <span className={shouldHighlight && processedLine !== displayLine ? 'contents' : ''}>
            {shouldHighlight && processedLine !== displayLine ?
              <span dangerouslySetInnerHTML={{ __html: processedLine }} /> :
              processedLine
            }
          </span>
          {/* 代码折叠指示器 */}
          {foldableRange && (
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
          )}
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(originalLineIndex);
                  } else {
                    newSet.add(originalLineIndex);
                  }
                  return newSet;
                });
              }}
            >
              {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
            </button>
          )}
        </div>
      );
    }

    // 使用Map快速查找，避免线性搜索
    if (!searchResultsMap.has(currentLineNumber)) {
      return (
        <div className="flex items-center">
          <span className={shouldHighlight && processedLine !== displayLine ? 'contents' : ''}>
            {shouldHighlight && processedLine !== displayLine ?
              <span dangerouslySetInnerHTML={{ __html: processedLine }} /> :
              processedLine
            }
          </span>
          {/* 代码折叠指示器 */}
          {foldableRange && (
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
          )}
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(originalLineIndex);
                  } else {
                    newSet.add(originalLineIndex);
                  }
                  return newSet;
                });
              }}
            >
              {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
            </button>
          )}
        </div>
      );
    }

    // 处理搜索高亮（对于长行，优化搜索性能）
    const searchDisplayLine = isLongLine && !isExpanded ? displayLine : line;

    if (shouldHighlight && processedLine !== displayLine && searchDisplayLine.length < MAX_LINE_LENGTH) {
      // 对于已经语法高亮的代码，创建一个临时元素来提取纯文本
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = processedLine;
      const textContent = tempDiv.textContent || tempDiv.innerText || '';

      // 在纯文本中查找搜索词并高亮
      searchRegex.lastIndex = 0;
      const parts = textContent.split(searchRegex);

      if (parts.length === 1) {
        return (
          <div className="flex items-center">
            <span dangerouslySetInnerHTML={{ __html: processedLine }} />
            {/* 代码折叠指示器 */}
            {foldableRange && (
              <FoldingIndicator
                isCollapsed={isRangeCollapsed}
                onToggle={() => toggleFoldingRange(foldableRange.id)}
              />
            )}
            {showExpandButton && (
              <button
                className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedLongLines(prev => {
                    const newSet = new Set(prev);
                    if (isExpanded) {
                      newSet.delete(originalLineIndex);
                    } else {
                      newSet.add(originalLineIndex);
                    }
                    return newSet;
                  });
                }}
              >
                {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
              </button>
            )}
          </div>
        );
      }

      // 简化处理：当有搜索结果时，显示带搜索高亮的原始文本，而不是语法高亮
      searchRegex.lastIndex = 0;
      const textParts = searchDisplayLine.split(searchRegex);

      return (
        <div className="flex items-center">
          <span>
            {textParts.map((part, index) => {
              searchRegex.lastIndex = 0;
              if (searchRegex.test(part)) {
                const isCurrentMatch = currentSearchIndex >= 0 &&
                  searchResults[currentSearchIndex] &&
                  searchResults[currentSearchIndex].line === currentLineNumber;

                return (
                  <mark
                    key={index}
                    className={isCurrentMatch
                      ? 'bg-blue-300 dark:bg-blue-600 text-blue-900 dark:text-blue-100'
                      : 'bg-yellow-200 dark:bg-yellow-800'
                    }
                  >
                    {part}
                  </mark>
                );
              }
              return part;
            })}
          </span>
          {/* 代码折叠指示器 */}
          {foldableRange && (
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
          )}
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(originalLineIndex);
                  } else {
                    newSet.add(originalLineIndex);
                  }
                  return newSet;
                });
              }}
            >
              {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
            </button>
          )}
        </div>
      );
    } else {
      // 普通文本的搜索高亮处理
      searchRegex.lastIndex = 0;
      const parts = searchDisplayLine.split(searchRegex);

      return (
        <div className="flex items-center">
          <span>
            {parts.map((part, index) => {
              searchRegex.lastIndex = 0;
              if (searchRegex.test(part)) {
                const isCurrentMatch = currentSearchIndex >= 0 &&
                  searchResults[currentSearchIndex] &&
                  searchResults[currentSearchIndex].line === currentLineNumber;

                return (
                  <mark
                    key={index}
                    className={isCurrentMatch
                      ? 'bg-blue-300 dark:bg-blue-600 text-blue-900 dark:text-blue-100'
                      : 'bg-yellow-200 dark:bg-yellow-800'
                    }
                  >
                    {part}
                  </mark>
                );
              }
              return part;
            })}
          </span>
          {/* 代码折叠指示器 */}
          {foldableRange && (
            <FoldingIndicator
              isCollapsed={isRangeCollapsed}
              onToggle={() => toggleFoldingRange(foldableRange.id)}
            />
          )}
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(originalLineIndex);
                  } else {
                    newSet.add(originalLineIndex);
                  }
                  return newSet;
                });
              }}
            >
              {isExpanded ? t('collapse.long.line') : t('expand.long.line')}
            </button>
          )}
        </div>
      );
    }
  }, [searchRegex, searchResultsMap, searchResults, currentSearchIndex, startLineNumber, shouldHighlight, highlightedLines, expandedLongLines, setExpandedLongLines, foldableRanges, collapsedRanges, toggleFoldingRange, t, supportsFolding, getFoldableRangeAtLine]);

  const handleLineClick = (originalLineIndex: number) => {
    setModalState({
      isOpen: true,
      lineNumber: startLineNumber + originalLineIndex,
      content: lines[originalLineIndex] || ''
    });
  };

  const handleContentClick = (originalLineIndex: number, event: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection?.toString().length || (event.target as HTMLElement).closest('button')) {
      return;
    }
    handleLineClick(originalLineIndex);
  };

  const closeModal = () => setModalState(prev => ({ ...prev, isOpen: false }));

  useImperativeHandle(ref, () => ({
    scrollToLine: (lineNumber: number) => {
      const targetIndex = lineNumber - startLineNumber;
      // 在可见行中找到对应的虚拟行索引
      const visibleIndex = visibleLines.findIndex(item => item.originalIndex === targetIndex);
      if (visibleIndex >= 0) {
        virtualizer.scrollToIndex(visibleIndex, { align: 'center' });
      }
    },
    scrollToPercentage: (percentage: number) => {
      const targetIndex = Math.floor((visibleLines.length - 1) * (percentage / 100));
      virtualizer.scrollToIndex(targetIndex, { align: 'start' });
    },
    jumpToFilePosition: (filePosition: number) => {
      let currentPosition = 0;
      let targetLineIndex = 0;

      for (let i = 0; i < lines.length; i++) {
        if (currentPosition >= filePosition) {
          targetLineIndex = i;
          break;
        }
        currentPosition += lines[i].length + 1;
      }

      // 在可见行中找到对应的虚拟行索引
      const visibleIndex = visibleLines.findIndex(item => item.originalIndex === targetLineIndex);
      if (visibleIndex >= 0) {
        virtualizer.scrollToIndex(visibleIndex, { align: 'center' });
      }
    }
  }), [virtualizer, lines, startLineNumber, visibleLines]);

  // 行号区域引用
  const lineNumberRef = useRef<HTMLDivElement>(null);

  // 滚动同步和滚动到底部检测
  useEffect(() => {
    const container = containerRef.current;
    const lineNumberContainer = lineNumberRef.current;
    if (!container) return;

    const handleScroll = () => {
      // 同步行号区域滚动
      if (lineNumberContainer) {
        lineNumberContainer.scrollTop = container.scrollTop;
      }

      // 滚动到底部检测
      if (onScrollToBottom) {
        const { scrollTop, scrollHeight, clientHeight } = container;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;

        if (isNearBottom) {
          onScrollToBottom();
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onScrollToBottom]);

  return (
    <>
      <div className="w-full h-full relative flex">
        {/* 固定行号区域 */}
          <div
            ref={lineNumberRef}
            className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden relative z-10"
            style={{
              width: `${lineNumberWidth}px`,
              pointerEvents: 'none'
            }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const visibleLineItem = visibleLines[virtualItem.index];
              if (!visibleLineItem) return null;

              const { originalIndex } = visibleLineItem;
              const currentLineNumber = startLineNumber + originalIndex;
              const isCurrentSearchLine = currentSearchIndex >= 0 &&
                searchResults[currentSearchIndex] &&
                searchResults[currentSearchIndex].line === currentLineNumber;

              return (
                 <div
                   key={`line-${virtualItem.key}`}
                   className={`absolute top-0 left-0 w-full text-right pr-2 text-[13px] font-mono leading-6 select-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                     isCurrentSearchLine
                       ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-semibold'
                       : 'text-gray-500 dark:text-gray-400'
                   }`}
                   style={{
                     height: `${virtualItem.size}px`,
                     transform: `translateY(${virtualItem.start}px)`,
                     pointerEvents: 'auto'
                   }}
                   onClick={() => handleLineClick(originalIndex)}
                   title="点击查看完整行内容"
                 >
                  {isCurrentSearchLine && (
                    <div className="absolute left-1 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}
                  {currentLineNumber}
                </div>
              );
            })}
          </div>
        </div>

        {/* 内容滚动区域 */}
        <div
          ref={containerRef}
          className={`flex-1 bg-white dark:bg-gray-900 overflow-auto ${className}`}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const visibleLineItem = visibleLines[virtualItem.index];
              if (!visibleLineItem) return null;

              const { line: lineContent, originalIndex } = visibleLineItem;
              const currentLineNumber = startLineNumber + originalIndex;
              const isCurrentSearchLine = currentSearchIndex >= 0 &&
                searchResults[currentSearchIndex] &&
                searchResults[currentSearchIndex].line === currentLineNumber;

              return (
                <div
                  key={`content-${virtualItem.key}`}
                  className={`absolute top-0 left-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    isCurrentSearchLine ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  onClick={(event) => handleContentClick(originalIndex, event)}
                  title="点击查看完整行内容"
                >
                  <div className={`text-[13px] font-mono leading-6 h-full pl-2 pr-4 whitespace-pre ${
                    shouldHighlight ? '' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    <div className="min-w-max">
                      {renderLineWithHighlight(lineContent, virtualItem.index, originalIndex)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <LineContentModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        lineNumber={modalState.lineNumber}
        content={modalState.content}
        searchTerm={searchTerm}
      />

      {isMarkdown && setIsMarkdownPreviewOpen && (
        <MarkdownPreviewModal
          isOpen={isMarkdownPreviewOpen}
          onClose={() => setIsMarkdownPreviewOpen(false)}
          content={content}
          fileName={fileName}
        />
      )}
    </>
  );
});

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

import React, {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getLanguageFromFileName,
  isLanguageSupported,
  highlightLine,
} from '../../../utils/syntaxHighlighter';
import { useTheme } from '../../../hooks/useTheme';
import { useSyntaxHighlighting } from '../../../hooks/useSyntaxHighlighting';
import { UnifiedContentModal } from '../common/UnifiedContentModal';
import { MarkdownPreviewModal } from './MarkdownPreviewModal';
import { FoldingIndicator, useFoldingLogic } from './CodeFoldingControls';
import type { FoldableRange } from '../../../utils/folding';

interface VirtualizedTextViewerProps {
  content: string;
  searchTerm?: string;
  onSearchResults?: (
    results: Array<{ line: number; column: number; text: string; match: string }>,
    isLimited?: boolean
  ) => void;
  onScrollToBottom?: () => void;
  onScrollToTop?: (userScrollDirection?: 'up' | 'down') => Promise<number | void>; // 新增：向前加载回调，包含滚动方向
  className?: string;
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
const LONG_LINE_THRESHOLD = 300;

// 滚动检测常量
const SCROLL_TOP_THRESHOLD = 50; // 滚动到顶部的阈值
const SCROLL_BOTTOM_THRESHOLD = 100; // 滚动到底部的阈值
const SCROLL_DIRECTION_THRESHOLD = 5; // 滚动方向检测阈值
const CONSECUTIVE_SCROLL_REQUIRED = 2; // 需要连续滚动的次数
const LOAD_LOCK_TIMEOUT = 2000; // 加载锁定时间

export const VirtualizedTextViewer = forwardRef<
  VirtualizedTextViewerRef,
  VirtualizedTextViewerProps
>(
  (
    {
      content,
      searchTerm = '',
      onSearchResults,
      onScrollToBottom,
      onScrollToTop,
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
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      content?: string;
      title?: string;
      searchTerm?: string;
      fileName?: string;
      description?: React.ReactNode;
    }>({ isOpen: false });
    const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map());
    const [isHighlighting, setIsHighlighting] = useState(false);
    const [expandedLongLines, setExpandedLongLines] = useState<Set<number>>(new Set());
    const [shouldAdjustScrollAfterPrepend, setShouldAdjustScrollAfterPrepend] = useState(false);
    const [scrollAdjustmentData, setScrollAdjustmentData] = useState<{
      previousScrollTop: number;
      previousLinesCount: number;
      visibleStartIndex: number; // 用户当前看到的第一个虚拟行索引
      scrollOffsetInFirstItem: number; // 在第一个可见项中的偏移
    } | null>(null);
    const lastScrollTopLoadCheck = useRef<number>(-1);
    const scrollTopLoadInProgress = useRef<boolean>(false);
    const lastScrollTop = useRef<number>(0);
    const scrollDirection = useRef<'up' | 'down' | 'none'>('none');
    const consecutiveUpScrollCount = useRef<number>(0);

    const lines = useMemo(() => content.split('\n'), [content]);

    // 虚拟化器状态
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
      start: 0,
      end: 100,
    });

    // 使用新的折叠逻辑 hook（按需计算）
    const {
      supportsFolding,
      foldableRanges,
      collapsedRanges,
      visibleLines,
      getFoldableRangeAtLine,
      toggleFoldingRange,
    } = useFoldingLogic({
      lines,
      fileName,
      visibleRange,
    });

    // 简化计算
    const lineNumberWidth = Math.max(
      40,
      (startLineNumber + lines.length - 1).toString().length * 8 + 24
    );
    const detectedLanguage =
      syntaxHighlightingEnabled && fileName ? getLanguageFromFileName(fileName) : 'text';
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
    const searchRegex =
      searchTerm && searchTerm.length >= 2
        ? new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        : null;

    // 高亮行的异步处理和缓存
    const highlightVisibleLines = useCallback(
      async (virtualItems: any[]) => {
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
      },
      [shouldHighlight, isHighlighting, highlightedLines, lines, detectedLanguage, isDark]
    );

    const virtualizer = useVirtualizer({
      count: visibleLines.length,
      getScrollElement: () => containerRef.current,
      estimateSize: () => 24, // 固定行高
      overscan: 30,
      measureElement: undefined,
    });

    // 更新可见范围用于按需折叠计算
    useEffect(() => {
      const virtualItems = virtualizer.getVirtualItems();
      if (virtualItems.length > 0) {
        const start = Math.max(0, virtualItems[0].index - 50); // 扩展范围确保不遗漏
        const end = Math.min(
          visibleLines.length - 1,
          virtualItems[virtualItems.length - 1].index + 50
        );

        // 将虚拟行索引转换回原始行索引
        const startOriginalIndex = visibleLines[start]?.originalIndex || 0;
        const endOriginalIndex = visibleLines[end]?.originalIndex || lines.length - 1;

        setVisibleRange({
          start: Math.max(0, startOriginalIndex - 20),
          end: Math.min(lines.length - 1, endOriginalIndex + 20),
        });
      }
    }, [virtualizer.getVirtualItems(), visibleLines, lines.length]);

    // 当虚拟项改变时，触发可见行的语法高亮
    useEffect(() => {
      if (shouldHighlight) {
        const virtualItems = virtualizer.getVirtualItems();
        const lineIndexesToHighlight = virtualItems
          .map(item => visibleLines[item.index]?.originalIndex)
          .filter(index => index !== undefined);
        highlightVisibleLines(
          virtualItems
            .map((item, i) => ({ ...item, index: lineIndexesToHighlight[i] }))
            .filter(item => item.index !== undefined)
        );
      }
    }, [virtualizer.getVirtualItems(), shouldHighlight, highlightVisibleLines, visibleLines]);

    const performSearch = useCallback(
      (term: string) => {
        if (!term || term.length < 2) {
          onSearchResults?.([], false);
          return;
        }

        const results: Array<{ line: number; column: number; text: string; match: string }> = [];
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

    // 使用 ref 来存储最后执行的搜索词，避免内容变化时重复搜索
    const lastSearchTermRef = useRef<string>('');
    const lastVisibleLinesCountRef = useRef<number>(0);

    useEffect(() => {
      // 只有搜索词真正变化，或者可见行发生了显著变化时才执行搜索
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

    const renderLineWithHighlight = useCallback(
      (line: string, _lineIndex: number, originalLineIndex: number) => {
        const currentLineNumber = startLineNumber + originalLineIndex;
        const isLongLine = line.length > LONG_LINE_THRESHOLD;
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
        if (
          shouldHighlight &&
          highlightedLines.has(originalLineIndex) &&
          (line.length < MAX_LINE_LENGTH || isExpanded)
        ) {
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
                {shouldHighlight && processedLine !== displayLine ? (
                  <span dangerouslySetInnerHTML={{ __html: processedLine }} />
                ) : (
                  processedLine
                )}
              </span>
              {/* 代码折叠指示器 */}
              {foldableRange && (
                <div className="flex items-center">
                  <FoldingIndicator
                    isCollapsed={isRangeCollapsed}
                    onToggle={() => toggleFoldingRange(foldableRange.id)}
                  />
                  {/* 显示折叠摘要信息 */}
                  {isRangeCollapsed && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                      {foldableRange.summary}
                    </span>
                  )}
                  {/* 大节点指示器 */}
                  {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
                    <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                      {t('large.node', 'Large Node')} (
                      {foldableRange.endLine - foldableRange.startLine + 1} lines)
                    </span>
                  )}
                </div>
              )}
              {showExpandButton && (
                <button
                  className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  onClick={e => {
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
                {shouldHighlight && processedLine !== displayLine ? (
                  <span dangerouslySetInnerHTML={{ __html: processedLine }} />
                ) : (
                  processedLine
                )}
              </span>
              {/* 代码折叠指示器 */}
              {foldableRange && (
                <div className="flex items-center">
                  <FoldingIndicator
                    isCollapsed={isRangeCollapsed}
                    onToggle={() => toggleFoldingRange(foldableRange.id)}
                  />
                  {/* 显示折叠摘要信息 */}
                  {isRangeCollapsed && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                      {foldableRange.summary}
                    </span>
                  )}
                  {/* 大节点指示器 */}
                  {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
                    <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                      {t('large.node', 'Large Node')} (
                      {foldableRange.endLine - foldableRange.startLine + 1} lines)
                    </span>
                  )}
                </div>
              )}
              {showExpandButton && (
                <button
                  className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  onClick={e => {
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

        // 获取当前活跃搜索结果的详细信息
        const currentActiveResult =
          currentSearchIndex >= 0 ? searchResults[currentSearchIndex] : null;
        const searchDisplayLine = isLongLine && !isExpanded ? displayLine : line;

        // 简化的搜索高亮渲染
        const renderSearchHighlight = (text: string) => {
          const parts: React.ReactNode[] = [];
          let lastIndex = 0;
          let match;

          searchRegex.lastIndex = 0;
          while ((match = searchRegex.exec(text)) !== null) {
            // 添加匹配前的文本
            if (match.index > lastIndex) {
              parts.push(text.slice(lastIndex, match.index));
            }

            // 检查这个匹配是否是当前活跃的匹配
            const isActiveMatch =
              currentActiveResult &&
              currentActiveResult.line === currentLineNumber &&
              currentActiveResult.column === match.index + 1;

            parts.push(
              <mark
                key={`match-${match.index}`}
                className={isActiveMatch ? 'search-highlight-active' : 'search-highlight'}
              >
                {match[0]}
              </mark>
            );

            lastIndex = match.index + match[0].length;

            // 防止无限循环
            if (match.index === searchRegex.lastIndex) {
              searchRegex.lastIndex++;
            }
          }

          // 添加最后剩余的文本
          if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
          }

          return parts;
        };

        if (
          shouldHighlight &&
          processedLine !== displayLine &&
          searchDisplayLine.length < MAX_LINE_LENGTH
        ) {
          // 对于已经语法高亮的代码，创建一个临时元素来提取纯文本
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = processedLine;
          const textContent = tempDiv.textContent || tempDiv.innerText || '';

          // 如果纯文本中没有搜索匹配，直接返回语法高亮版本
          searchRegex.lastIndex = 0;
          if (!searchRegex.test(textContent)) {
            return (
              <div className="flex items-center">
                <span dangerouslySetInnerHTML={{ __html: processedLine }} />
                {/* 代码折叠指示器 */}
                {foldableRange && (
                  <div className="flex items-center">
                    <FoldingIndicator
                      isCollapsed={isRangeCollapsed}
                      onToggle={() => toggleFoldingRange(foldableRange.id)}
                    />
                    {/* 显示折叠摘要信息 */}
                    {isRangeCollapsed && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                        {foldableRange.summary}
                      </span>
                    )}
                    {/* 大节点指示器 */}
                    {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
                      <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                        {t('large.node', 'Large Node')} (
                        {foldableRange.endLine - foldableRange.startLine + 1} lines)
                      </span>
                    )}
                  </div>
                )}
                {showExpandButton && (
                  <button
                    className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    onClick={e => {
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
        }

        // 普通文本或有搜索匹配时的高亮处理
        return (
          <div className="flex items-center">
            <span>{renderSearchHighlight(searchDisplayLine)}</span>
            {/* 代码折叠指示器 */}
            {foldableRange && (
              <div className="flex items-center">
                <FoldingIndicator
                  isCollapsed={isRangeCollapsed}
                  onToggle={() => toggleFoldingRange(foldableRange.id)}
                />
                {/* 显示折叠摘要信息 */}
                {isRangeCollapsed && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 italic">
                    {foldableRange.summary}
                  </span>
                )}
                {/* 大节点指示器 */}
                {!isRangeCollapsed && foldableRange.endLine - foldableRange.startLine > 100 && (
                  <span className="ml-2 px-1 text-xs bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 rounded">
                    {t('large.node', 'Large Node')} (
                    {foldableRange.endLine - foldableRange.startLine + 1} lines)
                  </span>
                )}
              </div>
            )}
            {showExpandButton && (
              <button
                className="ml-2 px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                onClick={e => {
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
      },
      [
        searchRegex,
        searchResultsMap,
        searchResults,
        currentSearchIndex,
        startLineNumber,
        shouldHighlight,
        highlightedLines,
        expandedLongLines,
        setExpandedLongLines,
        foldableRanges,
        collapsedRanges,
        toggleFoldingRange,
        t,
        supportsFolding,
        getFoldableRangeAtLine,
      ]
    );

    const handleLineClick = (originalLineIndex: number) => {
      const content = lines[originalLineIndex] || '';
      const lineNumber = startLineNumber + originalLineIndex;

      // 计算内容统计信息
      const characters = content.length;

      setModalState({
        isOpen: true,
        content,
        title: t('line.content.title', { line: lineNumber }),
        description: <span>{t('content.stats.chars', { characters })}</span>,
        searchTerm,
        fileName,
      });
    };

    const handleContentClick = (originalLineIndex: number, event: React.MouseEvent) => {
      const selection = window.getSelection();
      if (selection?.toString().length || (event.target as HTMLElement).closest('button')) {
        return;
      }
      handleLineClick(originalLineIndex);
    };

    const closeModal = () => setModalState({ isOpen: false });

    // 记录临时展开的行（用于自动收起）
    const tempExpandedLineRef = useRef<number | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        scrollToLine: (lineNumber: number, column?: number) => {
          // 计算目标行在原始文本中的索引
          const targetOriginalIndex = lineNumber - startLineNumber;

          // 在可见行中找到对应的虚拟行索引
          const visibleIndex = visibleLines.findIndex(
            item => item.originalIndex === targetOriginalIndex
          );

          if (visibleIndex >= 0) {
            // 找到了对应的可见行，滚动到该位置
            virtualizer.scrollToIndex(visibleIndex, { align: 'center' });

            // 如果指定了列位置，处理横向滚动
            if (column && column > 0) {
              // 检查这行是否是长行且被折叠了（使用正确的长行判断逻辑）
              const targetLine = lines[targetOriginalIndex] || '';
              const isLongLine = targetLine.length > LONG_LINE_THRESHOLD; // 使用长行阈值常量
              const isCurrentlyExpanded = expandedLongLines.has(targetOriginalIndex);
              const needsExpansion = isLongLine && !isCurrentlyExpanded;

              // 如果需要展开，先展开
              if (needsExpansion) {
                // 收起之前临时展开的行
                if (
                  tempExpandedLineRef.current !== null &&
                  tempExpandedLineRef.current !== targetOriginalIndex
                ) {
                  setExpandedLongLines(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(tempExpandedLineRef.current!);
                    return newSet;
                  });
                }

                // 展开当前行
                setExpandedLongLines(prev => new Set([...prev, targetOriginalIndex]));
                tempExpandedLineRef.current = targetOriginalIndex;
              }

              setTimeout(
                () => {
                  const container = containerRef.current;
                  if (container) {
                    const charWidth = 7.8; // 13px字体的近似字符宽度
                    const targetScrollLeft = Math.max(
                      0,
                      (column - 1) * charWidth - container.clientWidth / 3
                    );

                    container.scrollTo({
                      left: targetScrollLeft,
                      behavior: 'smooth',
                    });
                  }
                },
                needsExpansion ? 150 : 100
              ); // 展开需要稍长的等待时间
            }
          } else if (targetOriginalIndex >= 0 && targetOriginalIndex < lines.length) {
            // 目标行存在但不在可见行列表中（可能因为代码折叠）
            // 尝试滚动到最接近的可见行
            let closestVisibleIndex = 0;
            let minDistance = Infinity;

            visibleLines.forEach((item, index) => {
              const distance = Math.abs(item.originalIndex - targetOriginalIndex);
              if (distance < minDistance) {
                minDistance = distance;
                closestVisibleIndex = index;
              }
            });

            virtualizer.scrollToIndex(closestVisibleIndex, { align: 'center' });

            // 如果有列位置，也处理横向滚动
            if (column && column > 0) {
              // 检查是否需要展开长行
              if (targetOriginalIndex >= 0 && targetOriginalIndex < lines.length) {
                const targetLine = lines[targetOriginalIndex];
                const isLongLine = targetLine.length > LONG_LINE_THRESHOLD; // 使用长行阈值常量
                const isCurrentlyExpanded = expandedLongLines.has(targetOriginalIndex);
                const needsExpansion = isLongLine && !isCurrentlyExpanded;

                if (needsExpansion) {
                  // 收起之前临时展开的行
                  if (
                    tempExpandedLineRef.current !== null &&
                    tempExpandedLineRef.current !== targetOriginalIndex
                  ) {
                    setExpandedLongLines(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(tempExpandedLineRef.current!);
                      return newSet;
                    });
                  }

                  // 展开当前行
                  setExpandedLongLines(prev => new Set([...prev, targetOriginalIndex]));
                  tempExpandedLineRef.current = targetOriginalIndex;
                }
              }

              setTimeout(() => {
                const container = containerRef.current;
                if (container) {
                  const charWidth = 7.8;
                  const targetScrollLeft = Math.max(
                    0,
                    (column - 1) * charWidth - container.clientWidth / 3
                  );

                  container.scrollTo({
                    left: targetScrollLeft,
                    behavior: 'smooth',
                  });
                }
              }, 100);
            }
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
          const visibleIndex = visibleLines.findIndex(
            item => item.originalIndex === targetLineIndex
          );
          if (visibleIndex >= 0) {
            virtualizer.scrollToIndex(visibleIndex, { align: 'center' });
          }
        },
      }),
      [virtualizer, lines, startLineNumber, visibleLines]
    );

    // 行号区域引用
    const lineNumberRef = useRef<HTMLDivElement>(null);

    // 滚动同步和滚动检测（支持双向加载）
    useEffect(() => {
      const container = containerRef.current;
      const lineNumberContainer = lineNumberRef.current;
      if (!container) return;

      const handleScroll = async () => {
        // 同步行号区域滚动
        if (lineNumberContainer) {
          lineNumberContainer.scrollTop = container.scrollTop;
        }

        const { scrollTop, scrollHeight, clientHeight } = container;

        // 检测滚动方向
        const currentScrollTop = scrollTop;
        const scrollDelta = currentScrollTop - lastScrollTop.current;

        if (Math.abs(scrollDelta) > SCROLL_DIRECTION_THRESHOLD) {
          // 忽略小幅度滚动
          if (scrollDelta > 0) {
            scrollDirection.current = 'down';
            consecutiveUpScrollCount.current = 0;
          } else {
            scrollDirection.current = 'up';
            consecutiveUpScrollCount.current += 1;
          }
        }

        lastScrollTop.current = currentScrollTop;

        // 滚动到顶部检测（向前加载）- 更严格的条件
        if (
          onScrollToTop &&
          scrollTop <= SCROLL_TOP_THRESHOLD &&
          !scrollTopLoadInProgress.current &&
          scrollDirection.current === 'up' &&
          consecutiveUpScrollCount.current >= CONSECUTIVE_SCROLL_REQUIRED
        ) {
          // 需要连续向上滚动

          // 防抖：避免在相同位置重复触发
          if (Math.abs(scrollTop - lastScrollTopLoadCheck.current) < 10) {
            return;
          }

          scrollTopLoadInProgress.current = true;
          lastScrollTopLoadCheck.current = scrollTop;

          // 记录当前滚动位置和虚拟化器状态，用于精确恢复
          const currentScrollTop = scrollTop;
          const currentLinesCount = lines.length;
          const virtualItems = virtualizer.getVirtualItems();
          const firstVisibleItem = virtualItems[0];

          try {
            const addedBytes = await onScrollToTop(scrollDirection.current);
            if (addedBytes && addedBytes > 0) {
              // 设置滚动调整数据，基于虚拟化器状态进行精确恢复
              setScrollAdjustmentData({
                previousScrollTop: currentScrollTop,
                previousLinesCount: currentLinesCount,
                visibleStartIndex: firstVisibleItem?.index || 0,
                scrollOffsetInFirstItem: firstVisibleItem
                  ? currentScrollTop - firstVisibleItem.start
                  : 0,
              });
              setShouldAdjustScrollAfterPrepend(true);

              // 重置连续滚动计数，避免立即再次触发
              consecutiveUpScrollCount.current = 0;
            }
          } catch (error) {
            console.error('Error in forward loading:', error);
          } finally {
            // 延迟重置锁，避免立即再次触发
            setTimeout(() => {
              scrollTopLoadInProgress.current = false;
            }, LOAD_LOCK_TIMEOUT);
          }
        }

        // 滚动到底部检测（向后加载）- 只在向下滚动时触发
        if (onScrollToBottom && scrollDirection.current === 'down') {
          const isNearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_THRESHOLD;

          if (isNearBottom) {
            onScrollToBottom();
          }
        }
      };

      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }, [onScrollToBottom, onScrollToTop, lines.length]);

    // 内容变化后调整滚动位置（向前加载后） - 精确恢复用户视觉位置
    useEffect(() => {
      if (shouldAdjustScrollAfterPrepend && scrollAdjustmentData) {
        const container = containerRef.current;
        if (container) {
          // 计算实际新增的行数
          const currentLinesCount = lines.length;
          const actualAddedLines = currentLinesCount - scrollAdjustmentData.previousLinesCount;

          if (actualAddedLines > 0) {
            // 计算新的虚拟行索引：原来的索引 + 新增的行数
            const newVisibleStartIndex = scrollAdjustmentData.visibleStartIndex + actualAddedLines;

            // 使用虚拟化器精确滚动到对应位置
            requestAnimationFrame(() => {
              virtualizer.scrollToIndex(newVisibleStartIndex, {
                align: 'start',
              });

              // 微调滚动位置，加上在第一个项目内的偏移
              setTimeout(() => {
                if (scrollAdjustmentData.scrollOffsetInFirstItem > 0) {
                  container.scrollTop += scrollAdjustmentData.scrollOffsetInFirstItem;
                }

                // 更新滚动方向跟踪，避免触发其他加载
                lastScrollTop.current = container.scrollTop;
                scrollDirection.current = 'none';
                consecutiveUpScrollCount.current = 0;
              }, 0);
            });
          }
        }

        // 重置状态
        setShouldAdjustScrollAfterPrepend(false);
        setScrollAdjustmentData(null);
      }
    }, [shouldAdjustScrollAfterPrepend, scrollAdjustmentData, lines.length, virtualizer]);

    return (
      <>
        <div className="w-full h-full relative flex">
          {/* 固定行号区域 */}
          <div
            ref={lineNumberRef}
            className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden relative z-10"
            style={{
              width: `${lineNumberWidth}px`,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map(virtualItem => {
                const visibleLineItem = visibleLines[virtualItem.index];
                if (!visibleLineItem) return null;

                const { originalIndex } = visibleLineItem;
                const currentLineNumber = startLineNumber + originalIndex;
                const isCurrentSearchLine =
                  currentSearchIndex >= 0 &&
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
                      pointerEvents: 'auto',
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
              {virtualizer.getVirtualItems().map(virtualItem => {
                const visibleLineItem = visibleLines[virtualItem.index];
                if (!visibleLineItem) return null;

                const { line: lineContent, originalIndex } = visibleLineItem;
                const currentLineNumber = startLineNumber + originalIndex;
                const isCurrentSearchLine =
                  currentSearchIndex >= 0 &&
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
                    onClick={event => handleContentClick(originalIndex, event)}
                    title="点击查看完整行内容"
                  >
                    <div
                      className={`text-[13px] font-mono leading-6 h-full pl-2 pr-4 whitespace-pre ${
                        shouldHighlight ? '' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
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

        <UnifiedContentModal
          isOpen={modalState.isOpen}
          onClose={closeModal}
          content={modalState.content || ''}
          title={modalState.title || ''}
          searchTerm={modalState.searchTerm}
          fileName={modalState.fileName}
          description={modalState.description}
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
  }
);

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

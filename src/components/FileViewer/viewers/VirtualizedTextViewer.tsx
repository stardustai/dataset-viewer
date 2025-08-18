import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X } from 'lucide-react';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import DOMPurify from 'dompurify';
import { getLanguageFromFileName, isLanguageSupported, highlightLine } from '../../../utils/syntaxHighlighter';
import { useTheme } from '../../../hooks/useTheme';
import { useSyntaxHighlighting } from '../../../hooks/useSyntaxHighlighting';
import { LineContentModal } from './LineContentModal';

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

const MarkdownPreviewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  content: string;
  fileName: string;
}> = ({ isOpen, onClose, content, fileName }) => {
  const { t } = useTranslation();
  const [parsedContent, setParsedContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !content) return;

    setIsLoading(true);

    const parseMarkdown = async () => {
      try {
        const contentWithoutFrontMatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

        const parsed = micromark(contentWithoutFrontMatter, {
          allowDangerousHtml: true,
          extensions: [gfm()],
          htmlExtensions: [gfmHtml()]
        });

        setParsedContent(parsed);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        setParsedContent(content);
      } finally {
        setIsLoading(false);
      }
    };

    parseMarkdown();
  }, [isOpen, content]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 shadow-xl w-full h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('markdown.preview')} - {fileName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-600 dark:text-gray-400">
                {t('markdown.parsing')}
              </div>
            </div>
          ) : (
            <div
              className="prose prose-gray dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedContent) }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const MAX_SEARCH_RESULTS = 1000;
const MAX_LINE_LENGTH = 10000; // 超过此长度的行将被截断显示
const LONG_LINE_THRESHOLD = 500; // 超过此长度认为是长行
const TRUNCATE_LENGTH = 200; // 截断显示的字符数

export const VirtualizedTextViewer = forwardRef<VirtualizedTextViewerRef, VirtualizedTextViewerProps>((
  {
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
  const [modalState, setModalState] = useState({
    isOpen: false,
    lineNumber: 0,
    content: ''
  });

  // 语法高亮相关状态
  const [highlightedLines, setHighlightedLines] = useState<Map<number, string>>(new Map());
  const [isHighlighting, setIsHighlighting] = useState(false);

  // 展开的长行状态
  const [expandedLongLines, setExpandedLongLines] = useState<Set<number>>(new Set());

  const lines = useMemo(() => content.split('\n'), [content]);

  // 自动加载逻辑：当行数少于30行时，自动触发加载更多
  useEffect(() => {
    if (lines.length < 30 && onScrollToBottom) {
      const timer = setTimeout(() => {
        onScrollToBottom();
      }, 100); // 延迟100ms避免频繁触发

      return () => clearTimeout(timer);
    }
  }, [lines.length, onScrollToBottom]);

  // 计算每行是否为长行
  const lineMetrics = useMemo(() => {
    return lines.map((line, index) => {
      const length = line.length;
      const isLong = length > LONG_LINE_THRESHOLD;
      const isExpanded = expandedLongLines.has(index);

      return {
        isLong,
        length,
        isExpanded
      };
    });
  }, [lines, expandedLongLines]);

  const calculateLineNumberWidth = useMemo(() => {
    const maxLineNumber = startLineNumber + lines.length - 1;
    return Math.max(40, maxLineNumber.toString().length * 8 + 16);
  }, [lines.length, startLineNumber]);

  // 检测编程语言
  const detectedLanguage = useMemo(() => {
    if (!syntaxHighlightingEnabled || !fileName) return 'text';
    return getLanguageFromFileName(fileName);
  }, [syntaxHighlightingEnabled, fileName]);

  const shouldHighlight = useMemo(() => {
    return syntaxHighlightingEnabled && isLanguageSupported(detectedLanguage);
  }, [syntaxHighlightingEnabled, detectedLanguage]);

  // 创建搜索结果的Map以提高查找性能
  const searchResultsMap = useMemo(() => {
    const map = new Map<number, boolean>();
    searchResults.forEach(result => {
      map.set(result.line, true);
    });
    return map;
  }, [searchResults]);

  // 缓存搜索正则表达式
  const searchRegex = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return null;
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(${escapedTerm})`, 'gi');
  }, [searchTerm]);

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
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 24, // 固定行高
    overscan: 3,
    measureElement: undefined,
  });

  // 当虚拟项改变时，触发可见行的语法高亮
  useEffect(() => {
    if (shouldHighlight) {
      const virtualItems = virtualizer.getVirtualItems();
      highlightVisibleLines(virtualItems);
    }
  }, [virtualizer.getVirtualItems(), shouldHighlight, highlightVisibleLines]);

  // 当语言或主题变化时，清空缓存
  useEffect(() => {
    setHighlightedLines(new Map());
  }, [detectedLanguage, isDark]);

  const performSearch = useCallback((term: string) => {
    if (!term || term.length < 2) {
      onSearchResults?.([], false);
      return;
    }

    const results: Array<{ line: number; column: number; text: string; match: string }> = [];
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedTerm, 'gi');
    let isLimited = false;

    for (let i = 0; i < lines.length && results.length < MAX_SEARCH_RESULTS; i++) {
      const line = lines[i];

      // 对于超长行，限制搜索范围以提高性能
      const searchLine = line.length > MAX_LINE_LENGTH ?
        line.substring(0, MAX_LINE_LENGTH) :
        line;

      let match;
      regex.lastIndex = 0;

      while ((match = regex.exec(searchLine)) !== null && results.length < MAX_SEARCH_RESULTS) {
        results.push({
          line: startLineNumber + i,
          column: match.index + 1,
          text: line.length > 200 ? line.substring(0, 200) + '...' : line, // 截断显示的文本
          match: match[0]
        });

        if (regex.lastIndex === match.index) {
          regex.lastIndex++;
        }
      }
    }

    if (results.length >= MAX_SEARCH_RESULTS) {
      isLimited = true;
    }

    onSearchResults?.(results, isLimited);
  }, [lines, onSearchResults, startLineNumber]);

  useEffect(() => {
    performSearch(searchTerm);
  }, [searchTerm, performSearch]);

  const renderLineWithHighlight = useCallback((line: string, lineIndex: number) => {
    const currentLineNumber = startLineNumber + lineIndex;
    const lineMetric = lineMetrics[lineIndex];
    const isLongLine = lineMetric?.isLong || false;
    const isExpanded = lineMetric?.isExpanded || false;

    // 对于超长行，如果未展开则截断显示
    let displayLine = line;
    let showExpandButton = false;

    if (isLongLine && !isExpanded && line.length > TRUNCATE_LENGTH) {
      displayLine = line.substring(0, TRUNCATE_LENGTH) + '...';
      showExpandButton = true;
    }

    // 获取语法高亮的内容（仅对较短的行或已展开的行进行语法高亮）
    let processedLine = displayLine;
    if (shouldHighlight && highlightedLines.has(lineIndex) && (line.length < MAX_LINE_LENGTH || isExpanded)) {
      const highlighted = highlightedLines.get(lineIndex);
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
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(lineIndex);
                  } else {
                    newSet.add(lineIndex);
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
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(lineIndex);
                  } else {
                    newSet.add(lineIndex);
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
            {showExpandButton && (
              <button
                className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedLongLines(prev => {
                    const newSet = new Set(prev);
                    if (isExpanded) {
                      newSet.delete(lineIndex);
                    } else {
                      newSet.add(lineIndex);
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
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(lineIndex);
                  } else {
                    newSet.add(lineIndex);
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
          {showExpandButton && (
            <button
              className="ml-2 px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedLongLines(prev => {
                  const newSet = new Set(prev);
                  if (isExpanded) {
                    newSet.delete(lineIndex);
                  } else {
                    newSet.add(lineIndex);
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
  }, [searchRegex, searchResultsMap, searchResults, currentSearchIndex, startLineNumber, shouldHighlight, highlightedLines, lineMetrics, expandedLongLines, setExpandedLongLines]);

  const handleLineClick = useCallback((lineIndex: number) => {
    const lineContent = lines[lineIndex] || '';
    const lineNumber = startLineNumber + lineIndex;

    setModalState({
      isOpen: true,
      lineNumber,
      content: lineContent
    });
  }, [lines, startLineNumber]);

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToLine: (lineNumber: number) => {
      const targetIndex = lineNumber - startLineNumber;
      if (targetIndex >= 0 && targetIndex < lines.length) {
        virtualizer.scrollToIndex(targetIndex, { align: 'center' });
      }
    },
    scrollToPercentage: (percentage: number) => {
      const targetIndex = Math.floor((lines.length - 1) * (percentage / 100));
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

      virtualizer.scrollToIndex(targetLineIndex, { align: 'center' });
    }
  }), [virtualizer, lines, startLineNumber]);

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
              width: `${calculateLineNumberWidth}px`,
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
              const currentLineNumber = startLineNumber + virtualItem.index;
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
                   onClick={() => handleLineClick(virtualItem.index)}
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
              const currentLineNumber = startLineNumber + virtualItem.index;
              const isCurrentSearchLine = currentSearchIndex >= 0 &&
                searchResults[currentSearchIndex] &&
                searchResults[currentSearchIndex].line === currentLineNumber;
              const lineContent = lines[virtualItem.index] || '';

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
                  onClick={() => handleLineClick(virtualItem.index)}
                  title="点击查看完整行内容"
                >
                  <div className={`text-[13px] font-mono leading-6 h-full pl-2 pr-4 whitespace-pre ${
                    shouldHighlight ? '' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    <div className="min-w-max">
                      {renderLineWithHighlight(lineContent, virtualItem.index)}
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

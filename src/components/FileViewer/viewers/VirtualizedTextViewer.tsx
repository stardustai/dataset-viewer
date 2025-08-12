import React, { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy, Braces, X } from 'lucide-react';
import { copyToClipboard, showCopyToast } from '../../../utils/clipboard';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import DOMPurify from 'dompurify';

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

const LineContentModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lineNumber: number;
  content: string;
  searchTerm?: string;
}> = ({ isOpen, onClose, lineNumber, content, searchTerm }) => {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const [isFormatted, setIsFormatted] = useState(false);

  const isLikelyJSON = (text: string): boolean => {
    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  };

  const formatJSON = (text: string): string => {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  };

  const currentContent = isFormatted ? formatJSON(content) : content;
  const currentContentLabel = isFormatted ? t('formatted.json') : t('original.content');

  const toggleFormatView = () => {
    setIsFormatted(!isFormatted);
  };

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

  const renderHighlightedContent = useCallback((text: string) => {
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
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[72vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('line.content', { line: lineNumber })}
            </h3>
            {isFormatted && (
              <span className="text-sm px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                {currentContentLabel}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {isLikelyJSON(content) && (
              <button
                onClick={toggleFormatView}
                className="flex items-center space-x-2 px-3 py-1 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                title={isFormatted ? t('original.content') : t('format.json')}
              >
                <Braces className="w-4 h-4" />
                <span>{isFormatted ? t('original.content') : t('format.json')}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 font-mono text-sm whitespace-pre-wrap break-words">
            {renderHighlightedContent(currentContent)}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
          <span>{t('characters')}: {currentContent.length}</span>
          <button
            onClick={async () => {
              const success = await copyToClipboard(currentContent);
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
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);
  const [modalState, setModalState] = useState({
    isOpen: false,
    lineNumber: 0,
    content: ''
  });

  const lines = useMemo(() => content.split('\n'), [content]);
  const calculateLineNumberWidth = useMemo(() => {
    const maxLineNumber = startLineNumber + lines.length - 1;
    return Math.max(40, maxLineNumber.toString().length * 8 + 16);
  }, [lines.length, startLineNumber]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => contentRef.current,
    estimateSize: () => 24,
    overscan: 10,
  });

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
      let match;
      regex.lastIndex = 0;
      
      while ((match = regex.exec(line)) !== null && results.length < MAX_SEARCH_RESULTS) {
        results.push({
          line: startLineNumber + i,
          column: match.index + 1,
          text: line,
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
    if (!searchTerm || searchTerm.length < 2) {
      return line;
    }

    const currentLineNumber = startLineNumber + lineIndex;
    const currentSearchResult = searchResults.find(result => result.line === currentLineNumber);
    
    if (!currentSearchResult) {
      return line;
    }

    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const parts = line.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
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
    });
  }, [searchTerm, searchResults, currentSearchIndex, startLineNumber]);

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

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || !onScrollToBottom) return;
      
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      
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
    <div className={`w-full h-full flex flex-col bg-white dark:bg-gray-900 overflow-auto ${className}`}>
      <div
        ref={containerRef}
        className="flex-1 flex bg-white dark:bg-gray-900"
      >
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
                  {isCurrentSearchLine && (
                    <div className="absolute left-1 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full"></div>
                  )}
                  {currentLineNumber}
                </div>
              );
            })}
          </div>
        </div>

        <div
          ref={contentRef}
          className="flex-1 overflow-auto bg-white dark:bg-gray-900"
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
                  key={virtualItem.key}
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
    </div>
  );
});

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

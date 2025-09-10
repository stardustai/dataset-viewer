import { useVirtualizer } from '@tanstack/react-virtual';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FullFileSearchResult, SearchResult } from '../../../types';
import type { FoldableRange } from '../../../utils/folding';
import { UnifiedContentModal } from '../common/UnifiedContentModal';
import { TextViewerLine } from './components/TextViewerLine';
import { useTextViewerHighlighting } from './hooks/useTextViewerHighlighting';
import { useTextViewerScroll } from './hooks/useTextViewerScroll';
import { useTextViewerSearch } from './hooks/useTextViewerSearch';

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface VirtualizedTextViewerProps {
  content: string;
  searchTerm: string;
  handleSearchResults?: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom?: () => Promise<void>;
  handleScrollToTop?: () => Promise<void>;
  containerHeight: number;
  calculateStartLineNumber: (lineIndex: number) => number;
  currentSearchIndex: number;
  fullFileSearchMode: boolean;
  fullFileSearchResults: FullFileSearchResult[];
  searchResults: SearchResult[];
  fileName?: string;
}

const VirtualizedTextViewer = forwardRef<VirtualizedTextViewerRef, VirtualizedTextViewerProps>(
  (
    {
      content,
      searchTerm,
      handleSearchResults,
      handleScrollToBottom,
      handleScrollToTop,
      containerHeight,
      calculateStartLineNumber,
      currentSearchIndex,
      fullFileSearchMode,
      fullFileSearchResults,
      searchResults,
      fileName = '',
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [modalState, setModalState] = useState<{
      isOpen: boolean;
      content: string;
      title: string;
    }>({ isOpen: false, content: '', title: '' });

    const lines = useMemo(() => content.split('\n'), [content]);
    const startLineNumber = calculateStartLineNumber(0);
    const lineNumberRef = useRef<HTMLDivElement>(null);

    // Create visible lines (excluding folded ranges)
    const visibleLines = useMemo(() => {
      const result: Array<{ line: string; originalIndex: number }> = [];

      for (let i = 0; i < lines.length; i++) {
        result.push({ line: lines[i], originalIndex: i });
      }

      return result;
    }, [lines]);

    // Virtual scrolling setup
    const virtualizer = useVirtualizer({
      count: visibleLines.length,
      getScrollElement: () => containerRef.current,
      estimateSize: () => 24,
      overscan: 50,
    });

    // Use custom hooks
    useTextViewerSearch({
      searchTerm,
      visibleLines,
      startLineNumber,
      onSearchResults: handleSearchResults || (() => {}),
    });

    const highlightHook = useTextViewerHighlighting({
      fileName,
      lines,
    });

    useTextViewerScroll({
      onScrollToBottom: handleScrollToBottom || (() => {}),
      onScrollToTop: handleScrollToTop || (() => Promise.resolve()),
      lines,
      virtualizer,
      containerRef,
      lineNumberRef,
    });

    // Extract values from hooks
    const { shouldHighlight, highlightedLines } = highlightHook;

    // Folding logic
    const foldableRanges: FoldableRange[] = [];
    const collapsedRanges = new Set<string>();
    const toggleFoldingRange = (_id: string) => {
      // Implementation for toggling folding range
    };
    const expandedLongLines = new Set<number>();
    const setExpandedLongLines = useState(new Set<number>())[1];

    // Modal handlers
    const closeModal = useCallback(() => {
      setModalState({ isOpen: false, content: '', title: '' });
    }, []);

    // Scroll functions
    const scrollToLine = useCallback(
      (lineNumber: number, _column?: number) => {
        const index = Math.max(0, lineNumber - startLineNumber);
        if (index >= 0 && index < visibleLines.length) {
          virtualizer.scrollToIndex(index, { align: 'center' });
        }
      },
      [startLineNumber, visibleLines.length, virtualizer]
    );

    const scrollToPercentage = useCallback(
      (percentage: number) => {
        const index = Math.floor((lines.length * percentage) / 100);
        virtualizer.scrollToIndex(index, { align: 'center' });
      },
      [lines.length, virtualizer]
    );

    const jumpToFilePosition = useCallback(
      (filePosition: number) => {
        // Implementation for jumping to file position
        const lineIndex = Math.floor(filePosition / 100); // Simplified calculation
        scrollToLine(lineIndex + startLineNumber);
      },
      [scrollToLine, startLineNumber]
    );

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToLine,
        scrollToPercentage,
        jumpToFilePosition,
      }),
      [scrollToLine, scrollToPercentage, jumpToFilePosition]
    );

    // Setup scroll handler
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleScroll = () => {
        // Handle scroll logic here
      };

      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    return (
      <div className="flex h-full">
        {/* Line numbers */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-600">
          <div ref={lineNumberRef} className="overflow-hidden" style={{ height: containerHeight }}>
            {virtualizer.getVirtualItems().map(virtualItem => {
              const { originalIndex } = visibleLines[virtualItem.index];
              const _lineNumber = startLineNumber + originalIndex;
              const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
              const isCurrentSearchLine =
                currentSearchIndex >= 0 && currentResults[currentSearchIndex]?.line === _lineNumber;

              return (
                <div
                  key={virtualItem.key}
                  className={`px-2 text-right text-xs font-mono leading-6 ${
                    isCurrentSearchLine ? 'bg-blue-200 dark:bg-blue-800' : ''
                  }`}
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {_lineNumber}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-white dark:bg-gray-900"
          style={{ height: containerHeight }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map(virtualItem => {
              const { line, originalIndex } = visibleLines[virtualItem.index];
              // const lineNumber = startLineNumber + originalIndex;

              // Create search regex
              const searchRegex = searchTerm
                ? new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                : null;

              // Find foldable range for this line
              const foldableRange =
                foldableRanges.find(
                  range => originalIndex >= range.startLine && originalIndex <= range.endLine
                ) || null;

              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TextViewerLine
                    line={line}
                    originalLineIndex={originalIndex}
                    startLineNumber={startLineNumber}
                    searchRegex={searchRegex}
                    searchResults={searchResults}
                    currentSearchIndex={currentSearchIndex}
                    shouldHighlight={shouldHighlight}
                    highlightedLines={highlightedLines}
                    expandedLongLines={expandedLongLines}
                    setExpandedLongLines={setExpandedLongLines}
                    foldableRange={foldableRange}
                    collapsedRanges={collapsedRanges}
                    toggleFoldingRange={toggleFoldingRange}
                    supportsFolding={true}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {modalState.isOpen && (
          <UnifiedContentModal
            isOpen={modalState.isOpen}
            onClose={closeModal}
            content={modalState.content}
            title={modalState.title}
          />
        )}
      </div>
    );
  }
);

VirtualizedTextViewer.displayName = 'VirtualizedTextViewer';

export default VirtualizedTextViewer;
export type { VirtualizedTextViewerRef };

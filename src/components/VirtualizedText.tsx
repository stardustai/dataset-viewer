import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

interface VirtualizedTextProps {
  content: string;
  searchTerm?: string;
  onSearchResults?: (results: Array<{ line: number; column: number; text: string; match: string }>) => void;
  className?: string;
}

interface VirtualizedTextRef {
  scrollToLine: (lineNumber: number) => void;
  scrollToPercentage: (percentage: number) => void;
  toggleWordWrap: () => void;
  getWordWrapEnabled: () => boolean;
}

const ITEM_HEIGHT = 28; // 增加行高以避免文字重叠
const BUFFER_SIZE = 10; // Number of extra items to render outside viewport

export const VirtualizedText = forwardRef<VirtualizedTextRef, VirtualizedTextProps>(({
  content,
  searchTerm = '',
  onSearchResults,
  className = '',
}, ref) => {
  const [containerHeight, setContainerHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);
  const [wordWrapEnabled, setWordWrapEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lines = content.split('\n');

  // Calculate visible range with more conservative estimation
  const calculateVisibleRange = () => {
    if (!wordWrapEnabled) {
      // Non-wrapped mode: simple calculation
      const estimatedStartIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
      const estimatedEndIndex = Math.min(
        lines.length - 1,
        Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER_SIZE * 2
      );
      return { startIndex: estimatedStartIndex, endIndex: estimatedEndIndex };
    } else {
      // Wrapped mode: more conservative approach
      // Since wrapped lines can vary in height, we render more lines to be safe
      const averageWrappedHeight = ITEM_HEIGHT * 2; // Conservative estimate
      const estimatedStartIndex = Math.max(0, Math.floor(scrollTop / averageWrappedHeight) - BUFFER_SIZE * 2);
      const estimatedEndIndex = Math.min(
        lines.length - 1,
        Math.ceil((scrollTop + containerHeight) / averageWrappedHeight) + BUFFER_SIZE * 4
      );
      return { startIndex: estimatedStartIndex, endIndex: estimatedEndIndex };
    }
  };

  const { startIndex, endIndex } = calculateVisibleRange();

  // Search functionality
  useEffect(() => {
    if (!searchTerm || !onSearchResults) return;

    const results: Array<{ line: number; column: number; text: string; match: string }> = [];
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

    lines.forEach((line, lineIndex) => {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          line: lineIndex + 1,
          column: match.index + 1,
          text: line,
          match: match[0],
        });
      }
    });

    onSearchResults(results);
  }, [searchTerm, content, lines, onSearchResults]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
        // Force re-render when container size changes to recalculate totalHeight
        setScrollTop(prev => prev);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Highlight search terms
  const highlightText = (text: string) => {
    if (!searchTerm) return null; // 返回 null 表示不需要高亮

    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return text.replace(regex, (match) => `<mark class="bg-yellow-200 px-1 rounded">${match}</mark>`);
  };

  // Scroll to line
  const scrollToLine = useCallback((lineNumber: number) => {
    const targetScrollTop = (lineNumber - 1) * ITEM_HEIGHT;
    if (containerRef.current) {
      containerRef.current.scrollTop = targetScrollTop;
    }
  }, []);

  // Scroll to percentage
  const scrollToPercentage = useCallback((percentage: number) => {
    if (!containerRef.current) return;

    const clampedPercentage = Math.max(0, Math.min(100, percentage));

    // Calculate target line based on percentage of total lines
    const targetLine = Math.floor((lines.length * clampedPercentage) / 100);
    const targetScrollTop = Math.max(0, targetLine * ITEM_HEIGHT);

    // Ensure we don't scroll beyond the content
    const maxScrollTop = containerRef.current.scrollHeight - containerRef.current.clientHeight;
    const finalScrollTop = Math.min(targetScrollTop, maxScrollTop);

    containerRef.current.scrollTop = finalScrollTop;
  }, [lines.length]);

  // Toggle word wrap
  const toggleWordWrap = useCallback(() => {
    setWordWrapEnabled(prev => !prev);
  }, []);

  // Get word wrap status
  const getWordWrapEnabled = useCallback(() => {
    return wordWrapEnabled;
  }, [wordWrapEnabled]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    scrollToLine,
    scrollToPercentage,
    toggleWordWrap,
    getWordWrapEnabled,
  }), [scrollToLine, scrollToPercentage, toggleWordWrap, getWordWrapEnabled]);

  const visibleLines = lines.slice(startIndex, endIndex + 1);

  // Calculate total height more accurately for word wrap
  const calculateTotalHeight = () => {
    if (!wordWrapEnabled) {
      return lines.length * ITEM_HEIGHT;
    }

    // For wrapped lines, we need to dynamically calculate based on container width
    if (!containerRef.current) {
      // Fallback if container not ready
      return lines.length * ITEM_HEIGHT * 2; // Conservative estimate
    }

    const containerWidth = containerRef.current.clientWidth;
    const lineNumberWidth = 60; // width of line number area (w-12 + mr-4)
    const padding = 32; // horizontal padding
    const availableWidth = containerWidth - lineNumberWidth - padding;

    // Estimate character width (this is approximate for monospace font)
    const charWidth = 8; // approximately 8px per character for text-sm font-mono
    const charsPerLine = Math.floor(availableWidth / charWidth);

    if (charsPerLine <= 0) {
      return lines.length * ITEM_HEIGHT * 2;
    }

    let totalEstimatedHeight = 0;
    lines.forEach(line => {
      // Calculate how many visual lines this text line will take
      const estimatedLines = Math.max(1, Math.ceil(line.length / charsPerLine));
      totalEstimatedHeight += estimatedLines * ITEM_HEIGHT;
    });

    return totalEstimatedHeight;
  };

  const totalHeight = calculateTotalHeight();
  const offsetY = startIndex * ITEM_HEIGHT;

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      onScroll={handleScroll}
      style={{ height: '100%' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleLines.map((line, index) => {
            const lineNumber = startIndex + index + 1;
            return (
              <div
                key={lineNumber}
                id={`line-${lineNumber}`}
                className="hover:bg-gray-50 py-1 px-2 -mx-2 rounded flex items-start"
                style={{
                  minHeight: ITEM_HEIGHT,
                  lineHeight: '1.4'
                }}
              >
                <span className="inline-block w-12 text-gray-400 select-none text-right mr-4 flex-shrink-0 text-sm font-mono pt-0.5">
                  {lineNumber}
                </span>
                {searchTerm ? (
                  <span
                    className={`flex-1 text-sm font-mono ${
                      wordWrapEnabled
                        ? 'whitespace-pre-wrap break-all'
                        : 'whitespace-pre overflow-x-auto'
                    }`}
                    dangerouslySetInnerHTML={{ __html: highlightText(line) || ' ' }}
                  />
                ) : (
                  <span
                    className={`flex-1 text-sm font-mono ${
                      wordWrapEnabled
                        ? 'whitespace-pre-wrap break-all'
                        : 'whitespace-pre overflow-x-auto'
                    }`}
                  >
                    {line || ' '}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

VirtualizedText.displayName = 'VirtualizedText';

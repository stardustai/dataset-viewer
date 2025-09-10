import { useEffect, useRef, useState } from 'react';

interface ScrollAdjustmentData {
  previousScrollTop: number;
  previousLinesCount: number;
  visibleStartIndex: number;
  scrollOffsetInFirstItem: number;
}

// Virtualizer 接口定义
interface Virtualizer {
  getVirtualItems(): Array<{
    index: number;
    start: number;
    size: number;
    end: number;
    key: React.Key;
  }>;
  getTotalSize(): number;
  scrollToIndex(index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }): void;
  measure(): void;
}

interface UseTextViewerScrollProps {
  onScrollToBottom?: () => void;
  onScrollToTop?: (userScrollDirection?: 'up' | 'down') => Promise<number | void>;
  lines: string[];
  virtualizer: Virtualizer;
  containerRef: React.RefObject<HTMLDivElement>;
  lineNumberRef: React.RefObject<HTMLDivElement>;
}

const SCROLL_TOP_THRESHOLD = 50;
const SCROLL_BOTTOM_THRESHOLD = 100;
const SCROLL_DIRECTION_THRESHOLD = 5;
const CONSECUTIVE_SCROLL_REQUIRED = 2;
const LOAD_LOCK_TIMEOUT = 2000;

export const useTextViewerScroll = ({
  onScrollToBottom,
  onScrollToTop,
  lines,
  virtualizer,
  containerRef,
  lineNumberRef,
}: UseTextViewerScrollProps) => {
  const [shouldAdjustScrollAfterPrepend, setShouldAdjustScrollAfterPrepend] = useState(false);
  const [scrollAdjustmentData, setScrollAdjustmentData] = useState<ScrollAdjustmentData | null>(
    null
  );
  const lastScrollTopLoadCheck = useRef<number>(-1);
  const scrollTopLoadInProgress = useRef<boolean>(false);
  const lastScrollTop = useRef<number>(0);
  const scrollDirection = useRef<'up' | 'down' | 'none'>('none');
  const consecutiveUpScrollCount = useRef<number>(0);

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
        if (scrollDelta > 0) {
          scrollDirection.current = 'down';
          consecutiveUpScrollCount.current = 0;
        } else {
          scrollDirection.current = 'up';
          consecutiveUpScrollCount.current += 1;
        }
      }

      lastScrollTop.current = currentScrollTop;

      // 滚动到顶部检测（向前加载）
      if (
        onScrollToTop &&
        scrollTop <= SCROLL_TOP_THRESHOLD &&
        !scrollTopLoadInProgress.current &&
        scrollDirection.current === 'up' &&
        consecutiveUpScrollCount.current >= CONSECUTIVE_SCROLL_REQUIRED
      ) {
        if (Math.abs(scrollTop - lastScrollTopLoadCheck.current) < 10) {
          return;
        }

        scrollTopLoadInProgress.current = true;
        lastScrollTopLoadCheck.current = scrollTop;

        const currentScrollTop = scrollTop;
        const currentLinesCount = lines.length;
        const virtualItems = virtualizer.getVirtualItems();
        const firstVisibleItem = virtualItems[0];

        try {
          const addedBytes = await onScrollToTop(scrollDirection.current);
          if (addedBytes && addedBytes > 0) {
            setScrollAdjustmentData({
              previousScrollTop: currentScrollTop,
              previousLinesCount: currentLinesCount,
              visibleStartIndex: firstVisibleItem?.index || 0,
              scrollOffsetInFirstItem: firstVisibleItem
                ? currentScrollTop - firstVisibleItem.start
                : 0,
            });
            setShouldAdjustScrollAfterPrepend(true);
            consecutiveUpScrollCount.current = 0;
          }
        } catch (error) {
          console.error('Error in forward loading:', error);
        } finally {
          setTimeout(() => {
            scrollTopLoadInProgress.current = false;
          }, LOAD_LOCK_TIMEOUT);
        }
      }

      // 滚动到底部检测（向后加载）
      if (onScrollToBottom && scrollDirection.current === 'down') {
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_BOTTOM_THRESHOLD;
        if (isNearBottom) {
          onScrollToBottom();
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [onScrollToBottom, onScrollToTop, lines.length, virtualizer, containerRef, lineNumberRef]);

  // 内容变化后调整滚动位置（向前加载后）
  useEffect(() => {
    if (shouldAdjustScrollAfterPrepend && scrollAdjustmentData) {
      const container = containerRef.current;
      if (container) {
        const currentLinesCount = lines.length;
        const actualAddedLines = currentLinesCount - scrollAdjustmentData.previousLinesCount;

        if (actualAddedLines > 0) {
          const newVisibleStartIndex = scrollAdjustmentData.visibleStartIndex + actualAddedLines;

          requestAnimationFrame(() => {
            virtualizer.scrollToIndex(newVisibleStartIndex, {
              align: 'start',
            });

            setTimeout(() => {
              if (scrollAdjustmentData.scrollOffsetInFirstItem > 0) {
                container.scrollTop += scrollAdjustmentData.scrollOffsetInFirstItem;
              }

              lastScrollTop.current = container.scrollTop;
              scrollDirection.current = 'none';
              consecutiveUpScrollCount.current = 0;
            }, 0);
          });
        }
      }

      setShouldAdjustScrollAfterPrepend(false);
      setScrollAdjustmentData(null);
    }
  }, [
    shouldAdjustScrollAfterPrepend,
    scrollAdjustmentData,
    lines.length,
    virtualizer,
    containerRef,
  ]);

  return {
    scrollDirection: scrollDirection.current,
    lastScrollTop: lastScrollTop.current,
  };
};

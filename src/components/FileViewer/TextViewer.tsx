import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { FullFileSearchResult, SearchResult, StorageFile } from '../../types';
import { VirtualizedTextViewer } from './viewers';
import type { VirtualizedTextViewerRef } from './viewers/VirtualizedTextViewer';

interface TextViewerProps {
  file: StorageFile;
  content: string;
  searchTerm: string;
  currentSearchIndex: number;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  fullFileSearchMode: boolean;
  containerHeight: number;
  calculateStartLineNumber?: (filePosition: number) => number;
  fileInfo: {
    isMarkdown: boolean;
  };
  isLargeFile: boolean;
  loadingMore: boolean;
  loadingBefore?: boolean;
  canLoadBefore?: boolean;
  isMarkdownPreviewOpen: boolean;
  setIsMarkdownPreviewOpen: (open: boolean) => void;
  handleSearchResults: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom: () => void;
  handleScrollToTop?: () => Promise<number | void>;
  openAsText: boolean;
}

export const TextViewer = forwardRef<VirtualizedTextViewerRef, TextViewerProps>(
  (
    {
      file,
      content,
      searchTerm,
      currentSearchIndex,
      searchResults,
      fullFileSearchResults,
      fullFileSearchMode,
      containerHeight,
      calculateStartLineNumber,
      isLargeFile,
      loadingMore,
      loadingBefore,
      canLoadBefore,
      handleSearchResults,
      handleScrollToBottom,
      handleScrollToTop,
    },
    ref
  ) => {
    const { t } = useTranslation();

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* 顶部加载状态指示器 */}
        {isLargeFile && loadingBefore && canLoadBefore && (
          <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('loading')}</span>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <VirtualizedTextViewer
            ref={ref}
            content={content}
            searchTerm={searchTerm}
            handleScrollToBottom={async () => {
              handleScrollToBottom();
            }}
            handleScrollToTop={
              handleScrollToTop
                ? async () => {
                    await handleScrollToTop();
                  }
                : undefined
            }
            handleSearchResults={handleSearchResults}
            containerHeight={containerHeight}
            calculateStartLineNumber={calculateStartLineNumber || (() => 1)}
            currentSearchIndex={currentSearchIndex}
            fullFileSearchMode={fullFileSearchMode}
            fullFileSearchResults={fullFileSearchResults}
            searchResults={searchResults}
            fileName={file.basename}
          />
        </div>

        {/* 底部加载状态指示器 */}
        {isLargeFile && loadingMore && (
          <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('loading')}</span>
            </div>
          </div>
        )}
      </div>
    );
  }
);

TextViewer.displayName = 'TextViewer';

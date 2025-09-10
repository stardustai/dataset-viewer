import { ChevronDown, ChevronUp } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { FullFileSearchResult, SearchResult } from '../../../types';

interface SearchResultsProps {
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  currentSearchIndex: number;
  searchResultsLimited: boolean;
  fullFileSearchLimited: boolean;
  fullFileSearchMode: boolean;
  isLargeFile: boolean;
  onPrevResult: () => void;
  onNextResult: () => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  searchResults,
  fullFileSearchResults,
  currentSearchIndex,
  searchResultsLimited,
  fullFileSearchLimited,
  fullFileSearchMode,
  isLargeFile,
  onPrevResult,
  onNextResult,
}) => {
  const { t } = useTranslation();

  const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
  const isCurrentResultsLimited = fullFileSearchMode ? fullFileSearchLimited : searchResultsLimited;
  const limitText = fullFileSearchMode
    ? t('search.results.limited.500')
    : t('search.results.limited.5000');
  const limitDescription = fullFileSearchMode
    ? t('search.sampling.description')
    : t('search.too.many.results');

  if (currentResults.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2 lg:space-x-3">
      <div className="flex flex-col">
        <div className="flex items-center space-x-1 lg:space-x-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {t('viewer.search.results', {
              current: currentSearchIndex + 1,
              total: currentResults.length,
            })}
          </span>
          {currentSearchIndex >= 0 && currentResults[currentSearchIndex] && (
            <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-full text-xs font-medium">
              {t('line.number', { line: currentResults[currentSearchIndex].line })}
            </span>
          )}
          {fullFileSearchMode && isLargeFile && (
            <span className="hidden sm:inline text-orange-600 dark:text-orange-400 text-xs">
              {t('search.sampling')}
            </span>
          )}
          {isCurrentResultsLimited && (
            <span className="hidden sm:block text-xs text-orange-500 dark:text-orange-400 mt-1">
              {limitText}
            </span>
          )}
        </div>
        {isCurrentResultsLimited && (
          <span className="hidden sm:block text-xs text-blue-500 dark:text-blue-400 mt-1">
            {limitDescription}
          </span>
        )}
      </div>
      <div className="flex items-center space-x-1">
        <button
          onClick={onPrevResult}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('viewer.previous.result')}
          disabled={currentResults.length === 0}
        >
          <ChevronUp className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <button
          onClick={onNextResult}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('viewer.next.result')}
          disabled={currentResults.length === 0}
        >
          <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
      </div>
    </div>
  );
};

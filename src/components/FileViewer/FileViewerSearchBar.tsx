import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Loader2,
  ChevronUp,
  ChevronDown,
  X,
  Move,
  Percent,
  Eye,
  Code
} from 'lucide-react';
import { SearchResult, FullFileSearchResult } from '../../types';
import { getLanguageFromFileName, isLanguageSupported } from '../../utils/syntaxHighlighter';

interface FileViewerSearchBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  fullFileSearchMode: boolean;
  setFullFileSearchMode: (mode: boolean) => void;
  searchLoading: boolean;
  fullFileSearchLoading: boolean;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  currentSearchIndex: number;
  searchResultsLimited: boolean;
  fullFileSearchLimited: boolean;
  isLargeFile: boolean;
  showPercentInput: boolean;
  setShowPercentInput: (show: boolean) => void;
  percentValue: string;
  setPercentValue: (value: string) => void;
  onPrevResult: () => void;
  onNextResult: () => void;
  onPercentageJump: () => void;
  onPercentKeyPress: (e: React.KeyboardEvent) => void;
  isMarkdown?: boolean;
  onMarkdownPreview?: () => void;
  enableSyntaxHighlighting?: boolean;
  setEnableSyntaxHighlighting?: (enable: boolean) => void;
  fileName?: string;
}

export const FileViewerSearchBar: React.FC<FileViewerSearchBarProps> = ({
  searchTerm,
  setSearchTerm,
  fullFileSearchMode,
  setFullFileSearchMode,
  searchLoading,
  fullFileSearchLoading,
  searchResults,
  fullFileSearchResults,
  currentSearchIndex,
  searchResultsLimited,
  fullFileSearchLimited,
  isLargeFile,
  showPercentInput,
  setShowPercentInput,
  percentValue,
  setPercentValue,
  onPrevResult,
  onNextResult,
  onPercentageJump,
  onPercentKeyPress,
  isMarkdown,
  onMarkdownPreview,
  enableSyntaxHighlighting,
  setEnableSyntaxHighlighting,
  fileName
}) => {
  const { t } = useTranslation();

  const currentResults = fullFileSearchMode ? fullFileSearchResults : searchResults;
  const isCurrentResultsLimited = fullFileSearchMode ? fullFileSearchLimited : searchResultsLimited;
  const limitText = fullFileSearchMode ? t('search.results.limited.500') : t('search.results.limited.5000');
  const limitDescription = fullFileSearchMode ? t('search.sampling.description') : t('search.too.many.results');

  // 检查是否支持语法高亮
  const detectedLanguage = getLanguageFromFileName(fileName || '');
  const canHighlight = isLanguageSupported(detectedLanguage);

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col lg:flex-row lg:items-center space-y-2 lg:space-y-0 lg:space-x-4">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={fullFileSearchMode ?
            (isLargeFile ? t('search.entire.file.large') : t('search.entire.file')) :
            t('search.loaded.content')
          }
          className="w-full pl-10 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between lg:justify-start space-x-2 lg:space-x-4">
        {searchLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
        {fullFileSearchLoading && <Loader2 className="w-4 h-4 animate-spin text-green-600" />}

        {isLargeFile && (
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={fullFileSearchMode}
                onChange={(e) => setFullFileSearchMode(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
              />
              <span className="whitespace-nowrap">{t('search.entire.file')}</span>
            </label>
          </div>
        )}

        {currentResults.length > 0 && (
          <div className="flex items-center space-x-2 lg:space-x-3">
            <div className="flex flex-col">
              <div className="flex items-center space-x-1 lg:space-x-2">
                <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {t('viewer.search.results', {
                    current: currentSearchIndex + 1,
                    total: currentResults.length
                  })}
                </span>
                {currentSearchIndex >= 0 && currentResults[currentSearchIndex] && (
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-full text-xs font-medium">
                    {t('line.number', { line: currentResults[currentSearchIndex].line })}
                  </span>
                )}
                {fullFileSearchMode && isLargeFile && (
                  <span className="hidden sm:inline text-orange-600 dark:text-orange-400 text-xs">{t('search.sampling')}</span>
                )}
                {isCurrentResultsLimited && (
                  <span className="hidden sm:block text-xs text-orange-500 dark:text-orange-400 mt-1">{limitText}</span>
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
        )}

        {/* Navigation controls */}
        <div className="flex items-center space-x-2">
          {!showPercentInput ? (
            <button
              onClick={() => setShowPercentInput(true)}
              className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              title={isLargeFile ? t('viewer.jump.percent.large') : t('viewer.jump.percent')}
            >
              <Percent className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          ) : (
            <div className="flex items-center space-x-1">
              <input
                type="number"
                min="0"
                max="100"
                value={percentValue}
                onChange={(e) => setPercentValue(e.target.value)}
                onKeyDown={onPercentKeyPress}
                placeholder="0-100"
                className="w-16 lg:w-20 px-2 lg:px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">%</span>
              <button
                onClick={onPercentageJump}
                className="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600"
                title={t('viewer.jump')}
              >
                <Move className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          )}

          {/* Markdown preview button */}
          {isMarkdown && onMarkdownPreview && (
            <button
              onClick={onMarkdownPreview}
              className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              title={t('markdown.preview')}
            >
              <Eye className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          )}

          {/* Syntax highlighting toggle */}
          {canHighlight && setEnableSyntaxHighlighting && (
            <button
              onClick={() => setEnableSyntaxHighlighting(!enableSyntaxHighlighting)}
              className={`px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors border border-gray-300 dark:border-gray-600 ${
                enableSyntaxHighlighting
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-gray-800'
              }`}
              title={enableSyntaxHighlighting ?
                t('syntax.highlighting.disable') + ` (${detectedLanguage})` :
                t('syntax.highlighting.enable') + ` (${detectedLanguage})`
              }
            >
              <Code className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

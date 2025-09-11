import type React from 'react';
import type { FullFileSearchResult, SearchResult } from '../../types';
import { NavigationControls } from './SearchBar/NavigationControls';
import { SearchInput } from './SearchBar/SearchInput';
import { SearchModeToggle } from './SearchBar/SearchModeToggle';
import { SearchResults } from './SearchBar/SearchResults';

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
  fileName,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col lg:flex-row lg:items-center space-y-2 lg:space-y-0 lg:space-x-4">
      <SearchInput
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        fullFileSearchMode={fullFileSearchMode}
        isLargeFile={isLargeFile}
      />

      <div className="flex items-center justify-between lg:justify-start space-x-2 lg:space-x-4">
        <SearchModeToggle
          fullFileSearchMode={fullFileSearchMode}
          setFullFileSearchMode={setFullFileSearchMode}
          searchLoading={searchLoading}
          fullFileSearchLoading={fullFileSearchLoading}
          isLargeFile={isLargeFile}
        />

        <SearchResults
          searchResults={searchResults}
          fullFileSearchResults={fullFileSearchResults}
          currentSearchIndex={currentSearchIndex}
          searchResultsLimited={searchResultsLimited}
          fullFileSearchLimited={fullFileSearchLimited}
          fullFileSearchMode={fullFileSearchMode}
          isLargeFile={isLargeFile}
          onPrevResult={onPrevResult}
          onNextResult={onNextResult}
        />

        <NavigationControls
          showPercentInput={showPercentInput}
          setShowPercentInput={setShowPercentInput}
          percentValue={percentValue}
          setPercentValue={setPercentValue}
          onPercentageJump={onPercentageJump}
          onPercentKeyPress={onPercentKeyPress}
          isLargeFile={isLargeFile}
          isMarkdown={isMarkdown}
          onMarkdownPreview={onMarkdownPreview}
          fileName={fileName}
        />
      </div>
    </div>
  );
};

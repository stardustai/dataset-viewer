import { Search, X } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface SearchInputProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  fullFileSearchMode: boolean;
  isLargeFile: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  searchTerm,
  setSearchTerm,
  fullFileSearchMode,
  isLargeFile,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
      <input
        type="text"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        placeholder={
          fullFileSearchMode
            ? isLargeFile
              ? t('search.entire.file.large')
              : t('search.entire.file')
            : t('search.loaded.content')
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
  );
};

import { Loader2 } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface SearchModeToggleProps {
  fullFileSearchMode: boolean;
  setFullFileSearchMode: (mode: boolean) => void;
  searchLoading: boolean;
  fullFileSearchLoading: boolean;
  isLargeFile: boolean;
}

export const SearchModeToggle: React.FC<SearchModeToggleProps> = ({
  fullFileSearchMode,
  setFullFileSearchMode,
  searchLoading,
  fullFileSearchLoading,
  isLargeFile,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center space-x-2">
      {searchLoading && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
      {fullFileSearchLoading && <Loader2 className="w-4 h-4 animate-spin text-green-600" />}

      {isLargeFile && (
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={fullFileSearchMode}
              onChange={e => setFullFileSearchMode(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 dark:bg-gray-700"
            />
            <span className="whitespace-nowrap">{t('search.entire.file')}</span>
          </label>
        </div>
      )}
    </div>
  );
};

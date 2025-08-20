import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ChevronDown } from 'lucide-react';

interface LoadMoreButtonProps {
  onLoadMore: () => void;
  isLoading: boolean;
  filesCount: number;
  hasMore: boolean;
  className?: string;
}

export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({
  onLoadMore,
  isLoading,
  filesCount,
  hasMore,
  className = ''
}) => {
  const { t } = useTranslation();

  if (!hasMore) return null;

  return (
    <div className={`flex justify-center py-4 ${className}`}>
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('directory.loading.more')}
          </>
        ) : (
          <>
            <ChevronDown className="mr-2 h-4 w-4" />
            {t('directory.load.more')}
          </>
        )}
      </button>
      {!isLoading && filesCount > 0 && (
        <div className="ml-3 text-sm text-gray-500 dark:text-gray-400 self-center">
          {t('directory.loaded.files', { count: filesCount })}
        </div>
      )}
    </div>
  );
};
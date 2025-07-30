import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArchiveEntry } from '../../types';
import { formatFileSize } from '../../utils/fileUtils';

interface ManualLoadButtonProps {
  entry: ArchiveEntry;
  onLoad: (entry: ArchiveEntry) => void;
  isLoading: boolean;
  loadType: 'media' | 'data' | 'unsupported';
}

export const ManualLoadButton: React.FC<ManualLoadButtonProps> = ({
  entry,
  onLoad,
  isLoading,
  loadType
}) => {
  const { t } = useTranslation();

  const getLoadTypeMessage = () => {
    switch (loadType) {
      case 'media':
        return t('media.large.file.manual.load');
      case 'data':
        return t('data.large.file.manual.load');
      case 'unsupported':
        return t('viewer.unsupported.format');
      default:
        return t('file.requires.manual.load');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-64 m-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
      <div className="text-center mb-4">
        <div className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('file.not.loaded')}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          {t('file.size')}: {formatFileSize(entry.size || 0)}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {getLoadTypeMessage()}
        </div>
      </div>
      <button
        onClick={() => onLoad(entry)}
        disabled={isLoading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {t('loading')}
          </>
        ) : (
          t('load.full.content')
        )}
      </button>
    </div>
  );
};
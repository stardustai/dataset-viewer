import React from 'react';
import { useTranslation } from 'react-i18next';
import type { DataMetadata } from '../providers';
import { formatFileSize } from '../../../utils/fileUtils';

interface DataTableMetadataProps {
  metadata: DataMetadata;
  loadedRows: number;
  totalRows: number;
  fileSize: number;
}

export const DataTableMetadata: React.FC<DataTableMetadataProps> = ({
  metadata,
  loadedRows,
  totalRows,
  fileSize
}) => {
  const { t } = useTranslation();



  return (
    <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 lg:px-6 py-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-600 dark:text-gray-400">
            {t('data.table.metadata.rows')}:
          </span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {metadata.numRows.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">
            {t('data.table.metadata.columns')}:
          </span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {metadata.numColumns}
          </span>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">
            {t('data.table.metadata.loaded')}:
          </span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {loadedRows.toLocaleString()} ({((loadedRows / totalRows) * 100).toFixed(1)}%)
          </span>
        </div>
        <div>
          <span className="text-gray-600 dark:text-gray-400">
            {t('data.table.metadata.fileSize')}:
          </span>
          <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
            {formatFileSize(fileSize)}
          </span>
        </div>
      </div>
    </div>
  );
};

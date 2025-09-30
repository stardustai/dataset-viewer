import type { Table } from '@tanstack/react-table';
import { X } from 'lucide-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface DataTableColumnPanelProps {
  table: Table<any>;
  onClose: () => void;
}

export const DataTableColumnPanel: FC<DataTableColumnPanelProps> = ({ table, onClose }) => {
  const { t } = useTranslation();

  return (
    <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          {t('data.table.columns.visibility')}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {table.getAllLeafColumns().map(column => (
          <label key={column.id} className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-gray-700 dark:text-gray-300">{column.id}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

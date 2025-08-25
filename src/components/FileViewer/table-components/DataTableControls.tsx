import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Layers, X } from 'lucide-react';

interface DataTableControlsProps {
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  showColumnPanel: boolean;
  onToggleColumnPanel: () => void;
  filteredCount: number;
  totalLoadedCount: number;
  sheetNames?: string[];
  activeSheet?: number;
  onSheetChange?: (sheetIndex: number) => void;
}

export const DataTableControls: React.FC<DataTableControlsProps> = ({
  globalFilter,
  onGlobalFilterChange,
  showColumnPanel,
  onToggleColumnPanel,
  filteredCount,
  totalLoadedCount,
  sheetNames = [],
  activeSheet = 0,
  onSheetChange
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Sheet Tabs (for multi-sheet files) */}
      {sheetNames.length > 1 && onSheetChange && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 lg:px-6 py-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
              {sheetNames.map((name, index) => (
                <button
                  key={index}
                  onClick={() => onSheetChange(index)}
                  className={`
                    px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 rounded-md border
                    ${activeSheet === index
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 border-transparent'
                    }
                  `}
                >
                  {name || `Sheet ${index + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 lg:px-6 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-1">
            {/* Search Input */}
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder={t('data.table.search.placeholder')}
                value={globalFilter}
                onChange={(e) => onGlobalFilterChange(e.target.value)}
                className="w-full pl-10 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              {globalFilter && (
                <button
                  onClick={() => onGlobalFilterChange('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Results Info */}
              {filteredCount !== totalLoadedCount && (
                <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                  {t('data.table.showing.filtered', {
                    showing: filteredCount,
                    total: totalLoadedCount
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 lg:space-x-3 flex-shrink-0">
            <button
              onClick={onToggleColumnPanel}
              className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors ${
                showColumnPanel ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'
              }`}
              title={t('data.table.columns.toggle')}
            >
              <Layers className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

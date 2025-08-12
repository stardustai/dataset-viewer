import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../../utils/clipboard';

interface CellDetailModalProps {
  data: {
    value: any;
    column: string;
    row: number;
  };
  onClose: () => void;
}

export const CellDetailModal: React.FC<CellDetailModalProps> = ({
  data,
  onClose
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textValue = typeof data.value === 'string'
      ? data.value
      : JSON.stringify(data.value, null, 2);

    const success = await copyToClipboard(textValue);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderValue = () => {
    if (typeof data.value === 'string') {
      return (
        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono">
          {data.value}
        </pre>
      );
    }

    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-mono">
        {JSON.stringify(data.value, null, 2)}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-[80vh] w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {t('data.table.cell.details')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('data.table.cell.location', {
                column: data.column,
                row: data.row + 1
              })}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={t('data.table.cell.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {renderValue()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};

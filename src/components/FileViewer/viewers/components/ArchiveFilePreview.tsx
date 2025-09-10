import { Copy, Folder, Loader2 } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { ArchiveEntry, FilePreview } from '../../../../types';
import { copyToClipboard, showCopyToast } from '../../../../utils/clipboard';

import { formatFileSize, formatModifiedTime } from '../../../../utils/fileUtils';
import { ErrorDisplay, StatusDisplay } from '../../../common';

interface ArchiveFilePreviewProps {
  selectedEntry: ArchiveEntry | null;
  filePreview: FilePreview | null;
  previewError: string | null;
  previewLoading: boolean;
  onRetryPreview: () => void;
}

export const ArchiveFilePreview: React.FC<ArchiveFilePreviewProps> = ({
  selectedEntry,
  filePreview,
  previewError,
  previewLoading,
  onRetryPreview,
}) => {
  const { t } = useTranslation();

  const handleCopyPath = async () => {
    if (selectedEntry) {
      await copyToClipboard(selectedEntry.path);
      showCopyToast(t('copied.to.clipboard'));
    }
  };

  if (previewLoading) {
    return (
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        <div className="h-full flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('loading.preview')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedEntry) {
    return (
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        <StatusDisplay
          type="previewEmpty"
          message={t('select.file.for.preview')}
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto min-h-0">
      {/* 文件信息头部 */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
              {selectedEntry.path.split('/').pop()}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPath}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                title={t('copy.path')}
              >
                <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('file.size.label')}: {formatFileSize(selectedEntry.size)}
            {(() => {
              const formattedTime = formatModifiedTime(selectedEntry.modified_time || undefined);
              return formattedTime ? (
                <span className="ml-4">
                  {t('file.modified.time')}: {formattedTime}
                </span>
              ) : null;
            })()}
          </p>
        </div>
      </div>

      {/* 文件内容预览 */}
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        {previewError ? (
          <ErrorDisplay message={previewError} onRetry={onRetryPreview} className="h-full" />
        ) : selectedEntry.is_dir ? (
          <StatusDisplay
            type="directoryEmpty"
            message={t('folder.selected')}
            secondaryMessage={t('folder.info.message')}
            icon={Folder}
            className="h-full"
          />
        ) : selectedEntry && filePreview ? (
          <div className="flex-1 overflow-auto">
            <div className="p-4">
              <p className="text-gray-600 dark:text-gray-400">{t('file.preview.available')}</p>
            </div>
          </div>
        ) : (
          <StatusDisplay type="previewEmpty" message={t('preparing.preview')} className="h-full" />
        )}
      </div>
    </div>
  );
};

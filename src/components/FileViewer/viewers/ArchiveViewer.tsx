import { Archive } from 'lucide-react';
import type React from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageClient } from '../../../services/storage/types';
import type { ArchiveEntry } from '../../../types';
import { ErrorDisplay, LoadingDisplay } from '../../common';
import { ArchiveFileBrowser } from '../../FileBrowser/ArchiveFileBrowser';
import { ArchiveFilePreview } from './components/ArchiveFilePreview';
import { useArchiveFileLoader } from './hooks/useArchiveFileLoader';
import { useArchiveInfo } from './hooks/useArchiveInfo';

interface ArchiveViewerProps {
  url: string;
  filename: string;
  storageClient?: StorageClient;
}

export const ArchiveViewer: React.FC<ArchiveViewerProps> = ({ url, filename, storageClient }) => {
  const { t } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState<ArchiveEntry | null>(null);

  const { archiveInfo, loading, error, loadDetailedArchiveInfo } = useArchiveInfo({
    url,
    filename,
    storageClient,
    t,
  });

  const { filePreview, previewLoading, previewError, loadFilePreview } = useArchiveFileLoader({
    url,
    filename,
    storageClient,
    t,
  });
  // 从localStorage获取隐藏文件显示偏好
  const [showHidden, setShowHidden] = useState(() => {
    const saved = localStorage.getItem('archiveViewer.showHidden');
    return saved ? JSON.parse(saved) : false;
  });

  // 保存隐藏文件显示偏好到localStorage
  const toggleShowHidden = useCallback(() => {
    const newValue = !showHidden;
    setShowHidden(newValue);
    localStorage.setItem('archiveViewer.showHidden', JSON.stringify(newValue));
  }, [showHidden]);

  const previewFile = async (entry: ArchiveEntry) => {
    // 检查是否为占位符条目（大文件的流式处理条目）
    if (entry.path === '...' && entry.size === '...') {
      // 这是一个占位符，触发加载详细信息
      await loadDetailedArchiveInfo();
      return;
    }

    setSelectedEntry(entry);

    // 如果是目录，不需要预览
    if (entry.is_dir) {
      return;
    }

    // 使用hook的loadFilePreview函数
    await loadFilePreview(entry);
  };

  if (loading) {
    return <LoadingDisplay message={t('loading.analyzing.archive')} icon={Archive} />;
  }

  if (error) {
    return <ErrorDisplay message={error} />;
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* 使用ArchiveFileBrowser组件 */}
      <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
        {archiveInfo && (
          <ArchiveFileBrowser
            archiveInfo={archiveInfo}
            onFileSelect={previewFile}
            onBack={() => window.history.back()}
            showHidden={showHidden}
            onShowHiddenChange={toggleShowHidden}
          />
        )}
      </div>

      {/* 文件预览 */}
      <div className="w-1/2 flex flex-col min-h-0">
        {previewLoading ? (
          <LoadingDisplay message={t('loading.preview')} />
        ) : selectedEntry ? (
          <ArchiveFilePreview
            selectedEntry={selectedEntry}
            filePreview={filePreview}
            previewLoading={previewLoading}
            previewError={previewError}
            onRetryPreview={() => loadFilePreview(selectedEntry)}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Archive className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">{t('select.file.for.preview')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                {t('select.file.message')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

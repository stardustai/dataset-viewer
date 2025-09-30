import { AlertCircle, Download, RefreshCw, X } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsStorage } from '../services/settingsStorage';
import { updateService } from '../services/updateService';
import type { UpdateCheckResult } from '../types';

interface UpdateNotificationProps {
  onClose: () => void;
}

export const UpdateNotification: FC<UpdateNotificationProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = async (force: boolean = false) => {
    setIsChecking(true);
    setError(null);

    try {
      const result = await updateService.checkForUpdates(force);
      setUpdateInfo(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('update.check.failed'));
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  const handleDownload = async () => {
    try {
      await updateService.openDownloadPage();
    } catch (err) {
      setError(t('update.download.failed'));
    }
  };

  if (!updateInfo && !isChecking && !error) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 max-w-sm z-50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          {isChecking ? (
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
          ) : error ? (
            <AlertCircle className="w-5 h-5 text-red-500" />
          ) : updateInfo?.hasUpdate ? (
            <Download className="w-5 h-5 text-green-500" />
          ) : (
            <RefreshCw className="w-5 h-5 text-gray-500" />
          )}
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {isChecking
              ? t('checking.updates')
              : error
                ? t('update.check.failed')
                : updateInfo?.hasUpdate
                  ? t('update.available')
                  : t('no.updates')}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</div>}

      {updateInfo && !isChecking && !error && (
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          <div>
            {t('current.version')}: v{updateInfo.currentVersion}
          </div>
          {updateInfo.hasUpdate && (
            <>
              <div>
                {t('latest.version')}: v{updateInfo.latestVersion}
              </div>
              {updateInfo.fileSize && (
                <div>
                  {t('file.size')}: {updateInfo.fileSize}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex space-x-2">
        {updateInfo?.hasUpdate && !isChecking && (
          <button
            onClick={handleDownload}
            className="flex items-center space-x-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
          >
            <Download className="w-3 h-3" />
            <span>{t('download.update')}</span>
          </button>
        )}

        <button
          onClick={() => checkForUpdates(true)}
          disabled={isChecking}
          className="flex items-center space-x-1 px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
          <span>{t('check.updates')}</span>
        </button>
      </div>
    </div>
  );
};

// Hook for managing update notifications
export const useUpdateNotification = () => {
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    // 启动时检查更新，但只有在用户启用了自动检查时才进行
    const checkOnStartup = async () => {
      const autoCheckEnabled = settingsStorage.getSetting('autoCheckUpdates');
      if (!autoCheckEnabled) {
        console.log('Auto check updates is disabled, skipping startup check');
        return;
      }

      try {
        const result = await updateService.checkForUpdates();
        if (result.hasUpdate) {
          setShowNotification(true);
        }
      } catch (error) {
        console.error('Failed to check for updates on startup:', error);
      }
    };

    checkOnStartup();
  }, []);

  const showUpdateDialog = () => setShowNotification(true);
  const hideUpdateDialog = () => setShowNotification(false);

  return {
    showNotification,
    showUpdateDialog,
    hideUpdateDialog,
  };
};

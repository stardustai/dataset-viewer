import React, { useState } from 'react';
import { Settings, Download, RefreshCw, Check, X, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { updateService } from '../../services/updateService';
import { useTheme } from '../../hooks/useTheme';
import type { UpdateCheckResult } from '../../types';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);

  const checkForUpdates = async () => {
    setIsChecking(true);
    try {
      const result = await updateService.checkForUpdates(true);
      setUpdateInfo(result);
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownload = async () => {
    try {
      await updateService.openDownloadPage();
    } catch (error) {
      console.error('Failed to open download page:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Theme Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.theme')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'light', labelKey: 'theme.light', icon: Sun },
                { value: 'dark', labelKey: 'theme.dark', icon: Moon },
                { value: 'system', labelKey: 'theme.system', icon: Settings }
              ].map(({ value, labelKey, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value as any)}
                  className={`flex flex-col items-center justify-center space-y-2 px-3 py-3 rounded-lg transition-colors ${
                    theme === value
                      ? 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                      : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{t(labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Update Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('settings.update')}</h3>

            {/* Auto Check Toggle */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">{t('auto.check.updates')}</span>
              <button
                onClick={() => setAutoCheck(!autoCheck)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoCheck ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    autoCheck ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Manual Check */}
            <div className="space-y-3">
              <button
                onClick={checkForUpdates}
                disabled={isChecking}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                <span className="text-sm">{isChecking ? t('checking.updates') : t('check.updates')}</span>
              </button>

              {/* Update Info */}
              {updateInfo && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-start space-x-2">
                    {updateInfo.hasUpdate ? (
                      <Download className="w-4 h-4 text-green-500 mt-0.5" />
                    ) : (
                      <Check className="w-4 h-4 text-green-500 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {updateInfo.hasUpdate ? t('update.available') : t('no.updates')}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        {t('current.version')}: v{updateInfo.currentVersion}
                      </div>
                      {updateInfo.hasUpdate && (
                        <>
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            {t('latest.version')}: v{updateInfo.latestVersion}
                          </div>
                          {updateInfo.fileSize && (
                            <div className="text-xs text-gray-600 dark:text-gray-300">
                              {t('file.size')}: {updateInfo.fileSize}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {updateInfo.hasUpdate && (
                    <button
                      onClick={handleDownload}
                      className="mt-3 w-full flex items-center justify-center space-x-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm"
                    >
                      <Download className="w-3 h-3" />
                      <span>{t('download.update')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* About */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">{t('about')}</h3>
            <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <div>Dataset Viewer</div>
              <div>{t('app.description')}</div>
              <div>{t('app.features')}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm"
          >
            {t('ok')}
          </button>
        </div>
      </div>
    </div>
  );
};

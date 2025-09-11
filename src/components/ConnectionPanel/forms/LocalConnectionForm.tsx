import { Folder, FolderOpen, FolderSearch } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { commands } from '../../../types/tauri-commands';
import { ConnectButton, ErrorDisplay } from '../common';
import type { UnifiedConnectionFormProps } from './types';

interface LocalConnectionFormProps extends UnifiedConnectionFormProps {
  config: {
    rootPath?: string;
  };
}

export const LocalConnectionForm: React.FC<LocalConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
}) => {
  const { t } = useTranslation();

  // 常用本机路径建议
  const commonPaths = [
    { label: t('local.path.documents'), path: '~/Documents' },
    { label: t('local.path.downloads'), path: '~/Downloads' },
    { label: t('local.path.desktop'), path: '~/Desktop' },
    { label: t('local.path.home'), path: '~' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (config.rootPath?.trim()) {
      onConnect();
    }
  };

  const handlePathChange = (path: string) => {
    onChange({ ...config, rootPath: path });
  };

  // 快速选择路径
  const handleQuickSelect = (path: string) => {
    handlePathChange(path);
  };

  // 选择目录
  const handleSelectDirectory = async () => {
    try {
      const result = await commands.systemSelectFolder(t('local.select.directory'));
      if (result.status === 'ok' && result.data) {
        handlePathChange(result.data);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 路径输入 */}
      <div>
        <label
          htmlFor="rootPath"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          {t('local.root.path')}
        </label>
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Folder className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              id="rootPath"
              type="text"
              value={config.rootPath || ''}
              onChange={e => handlePathChange(e.target.value)}
              placeholder={t('local.path.placeholder')}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>
          <button
            type="button"
            onClick={handleSelectDirectory}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            title={t('local.select.directory')}
          >
            <FolderSearch className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 快速选择常用路径 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('local.quick.select')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {commonPaths.map(({ label, path }) => (
            <button
              key={path}
              type="button"
              onClick={() => handleQuickSelect(path)}
              className="flex items-center space-x-2 p-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <FolderOpen className="w-3 h-3" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <ErrorDisplay error={error || ''} />

      <ConnectButton connecting={connecting} connectText={t('local.connect')} />

      {/* 权限说明 */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>
          <span className="font-medium">{t('local.permission.notice')}：</span>
          {t('local.permission.description')}
        </p>
      </div>
    </form>
  );
};

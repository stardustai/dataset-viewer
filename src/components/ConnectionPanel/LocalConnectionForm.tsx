import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen, FolderSearch } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface LocalConnectionFormProps {
  onConnect: (rootPath: string) => void;
  connecting: boolean;
  error?: string;
  defaultPath?: string; // 新增：默认路径
}

export const LocalConnectionForm: React.FC<LocalConnectionFormProps> = ({
  onConnect,
  connecting,
  error,
  defaultPath
}) => {
  const { t } = useTranslation();
  const [rootPath, setRootPath] = useState(defaultPath || '');

  // 当 defaultPath 属性变化时，更新输入框的值
  useEffect(() => {
    if (defaultPath) {
      setRootPath(defaultPath);
    }
  }, [defaultPath]);

  // 常用本机路径建议
  const commonPaths = [
    { label: t('local.path.documents'), path: '~/Documents' },
    { label: t('local.path.downloads'), path: '~/Downloads' },
    { label: t('local.path.desktop'), path: '~/Desktop' },
    { label: t('local.path.home'), path: '~' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rootPath.trim()) {
      onConnect(rootPath.trim());
    }
  };

  const handleQuickSelect = (path: string) => {
    setRootPath(path);
  };

  const handleSelectDirectory = async () => {
    try {
      // 使用 Tauri 的对话框 API 选择目录
      const selected = await invoke<string | null>('system_select_folder');
      if (selected) {
        setRootPath(selected);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };



  return (
    <form onSubmit={handleSubmit} className="space-y-4">{/* 统一使用 space-y-4 */}
      <div>
        <label htmlFor="rootPath" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('local.root.path')}
        </label>
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Folder className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              id="rootPath"
              type="text"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
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



      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={connecting || !rootPath.trim()}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                 text-white font-medium py-2 px-4 rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                 disabled:cursor-not-allowed"
      >
        {connecting ? t('connecting') : t('local.connect')}
      </button>

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

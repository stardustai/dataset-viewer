import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen, FolderSearch, Smartphone } from 'lucide-react';
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
  const [showMobilePathSelector, setShowMobilePathSelector] = useState(false);

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
      const selected = await invoke<string | null>('show_folder_dialog');
      if (selected) {
        setRootPath(selected);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
      // 在移动端平台上，显示路径选择器
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        setShowMobilePathSelector(true);
      }
    }
  };

  const commonMobilePaths = [
    { path: '/storage/emulated/0/Download', label: t('local.mobile.path.downloads'), icon: '📥' },
    { path: '/storage/emulated/0/Documents', label: t('local.mobile.path.documents'), icon: '📄' },
    { path: '/storage/emulated/0/Pictures', label: t('local.mobile.path.pictures'), icon: '🖼️' },
    { path: '/storage/emulated/0/DCIM', label: t('local.mobile.path.camera'), icon: '📷' },
    { path: '/data/data/ai.stardust.dataset-viewer/files', label: t('local.mobile.path.app.data'), icon: '📱' }
  ];

  const handleMobilePathSelect = (path: string) => {
    setRootPath(path);
    setShowMobilePathSelector(false);
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

      {/* 移动端路径选择器 */}
      {showMobilePathSelector && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 m-4 max-w-md w-full max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <Smartphone className="w-5 h-5 mr-2" />
                {t('local.mobile.path.selector.title')}
              </h3>
              <button
                onClick={() => setShowMobilePathSelector(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2 mb-4">
              {commonMobilePaths.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleMobilePathSelect(item.path)}
                  className="w-full flex items-center space-x-3 p-3 text-left border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{item.path}</div>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('local.mobile.manual.input')}</p>
              <input
                type="text"
                placeholder={t('local.mobile.manual.placeholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement;
                    if (target.value.trim()) {
                      handleMobilePathSelect(target.value.trim());
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

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

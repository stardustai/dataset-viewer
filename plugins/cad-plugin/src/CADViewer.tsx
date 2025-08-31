import React from 'react';
import { PluginViewerProps } from './plugin-types';

export const CADViewer: React.FC<PluginViewerProps> = ({
  file,
  content: _content, // 标记为未使用
  storageClient: _storageClient, // 标记为未使用
  containerHeight,
  isLargeFile,
  onError: _onError, // 标记为未使用
  onLoadingChange,
  t
}) => {
  React.useEffect(() => {
    // 对于静态内容，直接设置为不加载状态
    onLoadingChange(false);
  }, [onLoadingChange]);

  // 创建安全的翻译函数，如果主应用没有提供则返回原始键
  const translate = (key: string, options?: { [key: string]: any }) => {
    if (!t) return key;
    return t(key, options);
  };

  return (
    <div
      className="flex flex-col bg-gray-100 dark:bg-gray-900"
      style={{ height: containerHeight }}
    >
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">🔧</div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            {translate('cad.viewer')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {translate('cad.previewing', { filename: file.filename })}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            {translate('cad.fileSize', { size: (file.size / 1024 / 1024).toFixed(2) })}
          </p>
          {isLargeFile && (
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
              {translate('cad.largeFile.warning')}
            </p>
          )}
          <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-yellow-800 dark:text-yellow-200">
              {translate('cad.developing')}
            </p>
            <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-2">
              {translate('cad.supportedFormats')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

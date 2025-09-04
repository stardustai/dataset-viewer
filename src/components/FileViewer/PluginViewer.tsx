import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { pluginManager } from '../../services/plugin/pluginManager';
import { LoadingDisplay, ErrorDisplay } from '../common/StatusDisplay';
import type { StorageFile } from '../../types';

interface PluginViewerProps {
  file: StorageFile;
  filePath: string;
  content?: string | ArrayBuffer;
  storageClient: any;
  isLargeFile: boolean;
}

export const PluginViewer: React.FC<PluginViewerProps> = ({
  file,
  filePath,
  content,
  storageClient,
  isLargeFile,
}) => {
  const { t } = useTranslation();
  const [pluginComponent, setPluginComponent] = useState<React.ComponentType<any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPluginViewer = async () => {
      try {
        setLoading(true);
        setError(null);

        // 通过插件管理器查找合适的插件
        const plugin = pluginManager.findViewerForFile(file.basename);

        if (!plugin) {
          setError(t('plugin.notFound', { filename: file.basename }));
          setLoading(false);
          return;
        }

        // 设置插件组件
        setPluginComponent(() => plugin.component);
        // 插件组件加载完成，初始设置为不加载，让插件自己决定是否需要 loading
        setLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to load plugin viewer:', errorMessage);
        setError(errorMessage);
        setLoading(false);
      }
    };

    loadPluginViewer();
  }, [file.basename, t]);

  if (loading && !error) {
    return <LoadingDisplay message={t('plugin.loading')} className="h-full" />;
  }

  if (error) {
    return <ErrorDisplay message={error} className="h-full" />;
  }

  if (!pluginComponent) {
    return <ErrorDisplay message={t('plugin.noSuitablePlugin')} className="h-full" />;
  }

  const PluginComponent = pluginComponent;

  return (
    <div className="flex-1 overflow-hidden">
      <PluginComponent
        file={{
          filename: file.basename,
          size: file.size,
          path: filePath,
        }}
        content={content}
        storageClient={storageClient}
        isLargeFile={isLargeFile}
        onError={(error: string) => setError(error)}
        language={i18n.language}
        t={t}
      />
    </div>
  );
};

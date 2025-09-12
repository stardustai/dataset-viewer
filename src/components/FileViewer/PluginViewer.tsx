import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { pluginManager } from '../../services/plugin/pluginManager';
import { LoadingDisplay, ErrorDisplay } from '../common/StatusDisplay';
import type { StorageFile } from '../../types';
import type { FileAccessor, PluginViewerProps } from '../../types/plugin-framework';

interface LocalPluginViewerProps {
  file: StorageFile;
  filePath: string;
  content?: string | ArrayBuffer;
  storageClient: any;
  isLargeFile: boolean;
}

/**
 * 创建文件访问器适配器，将 storageClient 包装为 FileAccessor 接口
 */
const createFileAccessor = (storageClient: any, filePath: string): FileAccessor => ({
  getFullContent: async (): Promise<ArrayBuffer> => {
    const blob = await storageClient.downloadFile(filePath);
    return await blob.arrayBuffer();
  },

  getRangeContent: async (start: number, end?: number): Promise<ArrayBuffer> => {
    // 如果 storageClient 支持范围请求，使用它；否则获取全部内容后截取
    if (storageClient.downloadFileRange) {
      const blob = await storageClient.downloadFileRange(filePath, start, end);
      return await blob.arrayBuffer();
    } else {
      // 回退到获取全部内容
      const fullContent = await storageClient.downloadFile(filePath);
      const arrayBuffer = await fullContent.arrayBuffer();
      const endPos = end ?? arrayBuffer.byteLength;
      return arrayBuffer.slice(start, endPos);
    }
  },

  getTextContent: async (encoding: string = 'utf-8'): Promise<string> => {
    const arrayBuffer = await storageClient
      .downloadFile(filePath)
      .then((blob: Blob) => blob.arrayBuffer());
    const decoder = new TextDecoder(encoding);
    return decoder.decode(arrayBuffer);
  },
});

export const PluginViewer: React.FC<LocalPluginViewerProps> = ({
  file,
  filePath,
  content,
  storageClient,
  isLargeFile,
}) => {
  const { t } = useTranslation();
  const [pluginComponent, setPluginComponent] =
    useState<React.ComponentType<PluginViewerProps> | null>(null);
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
          name: file.basename,
          size: parseInt(file.size) || 0,
          path: filePath,
        }}
        content={content}
        fileAccessor={createFileAccessor(storageClient, filePath)}
        isLargeFile={isLargeFile}
        onError={(error: string) => setError(error)}
        onLoadingChange={(loading: boolean) => setLoading(loading)}
        language={i18n.language}
        t={t}
      />
    </div>
  );
};

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { pluginManager } from '../../services/plugin/pluginManager';
import { LoadingDisplay, ErrorDisplay } from '../common/StatusDisplay';
import type { StorageFile } from '../../types';
import type { FileAccessor, PluginViewerProps } from '@dataset-viewer/sdk';
import type { StorageClient } from '../../services/storage/types';

interface LocalPluginViewerProps {
  file: StorageFile;
  filePath: string;
  content?: string | ArrayBuffer;
  storageClient: StorageClient;
  isLargeFile: boolean;
}

/**
 * 创建文件访问器适配器，将 storageClient 包装为 FileAccessor 接口
 */
const createFileAccessor = (storageClient: StorageClient, filePath: string): FileAccessor => ({
  getFullContent: async (): Promise<ArrayBuffer> => {
    const blob = await storageClient.downloadFile(filePath);
    return await blob.arrayBuffer();
  },

  getRangeContent: async (start: number, end?: number): Promise<ArrayBuffer> => {
    if (start < 0) throw new Error('start must be >= 0');
    if (end !== undefined && end < start) throw new Error('end must be >= start');

    // 计算要读取的长度
    const length = end !== undefined ? end - start : undefined;

    const fileContent = await storageClient.getFileContent(filePath, { start, length });
    // 将文本内容转换为 ArrayBuffer
    const encoder = new TextEncoder();
    return encoder.encode(fileContent.content).buffer;
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
  const pluginComponent = useRef<React.ComponentType<PluginViewerProps> | null>(null);
  const [pluginNamespace, setPluginNamespace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 使用 useCallback 缓存回调函数，避免无限循环
  const handleError = useCallback((error: string) => {
    setError(error);
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setLoading(loading);
  }, []);

  // 使用 useMemo 缓存 fileAccessor，避免每次渲染都创建新实例
  const fileAccessor = useMemo(
    () => createFileAccessor(storageClient, filePath),
    [storageClient, filePath]
  );

  // 缓存文件对象，避免每次渲染都创建新实例
  const fileObj = useMemo(
    () => ({
      name: file.basename,
      size: parseInt(file.size) || 0,
      path: filePath,
    }),
    [file.basename, file.size, filePath]
  );

  // 缓存插件翻译函数，避免每次渲染都创建新实例
  const pluginT = useMemo(() => {
    if (!pluginNamespace) return () => '';
    return (key: string, options?: any): string => {
      const result = i18n.t(key, { ...options, ns: pluginNamespace });
      return typeof result === 'string' ? result : String(result);
    };
  }, [pluginNamespace]);

  useEffect(() => {
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

      // 设置插件组件和命名空间
      pluginComponent.current = plugin.component as React.ComponentType<PluginViewerProps>;
      setPluginNamespace(`plugin:${plugin.metadata.id}`);
      // 插件组件加载完成，初始设置为不加载，让插件自己决定是否需要 loading
      setLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load plugin viewer:', errorMessage);
      setError(errorMessage);
      setLoading(false);
    }
  }, [file.basename]);

  if (loading && !error) {
    return <LoadingDisplay message={t('plugin.loading')} className="h-full" />;
  }

  if (error) {
    return <ErrorDisplay message={error} className="h-full" />;
  }

  if (!pluginComponent || !pluginNamespace) {
    return <ErrorDisplay message={t('plugin.noSuitablePlugin')} className="h-full" />;
  }

  const PluginComponent = pluginComponent.current!;

  return (
    <div className="flex-1 overflow-hidden">
      <PluginComponent
        file={fileObj}
        content={content}
        fileAccessor={fileAccessor}
        isLargeFile={isLargeFile}
        onError={handleError}
        onLoadingChange={handleLoadingChange}
        language={i18n.language}
        t={pluginT}
      />
    </div>
  );
};

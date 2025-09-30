import type { FileAccessor, PluginViewerProps } from '@dataset-viewer/sdk';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { pluginManager } from '../../services/plugin/pluginManager';
import type { StorageClient } from '../../services/storage/types';
import type { StorageFile } from '../../types';
import { ErrorDisplay, LoadingDisplay } from '../common/StatusDisplay';

interface LocalPluginViewerProps {
  file: StorageFile;
  filePath: string;
  content?: string | ArrayBuffer;
  storageClient: StorageClient;
  isLargeFile: boolean;
  pluginId?: string; // 新增：指定使用的插件ID
}

/**
 * 创建文件访问器适配器，将 storageClient 包装为 FileAccessor 接口
 */
const createFileAccessor = (storageClient: StorageClient, filePath: string): FileAccessor => ({
  getFullContent: async (): Promise<ArrayBuffer> => {
    const blob = await storageClient.getFileAsBlob(filePath);
    return await blob.arrayBuffer();
  },

  getRangeContent: async (start: number, end?: number): Promise<ArrayBuffer> => {
    if (start < 0) throw new Error('start must be >= 0');
    if (end !== undefined && end < start) throw new Error('end must be >= start');

    // 计算要读取的长度
    const length = end !== undefined ? end - start : undefined;

    // 直接获取二进制数据，避免不必要的文本转换
    const uint8Array = await storageClient.readFileBytes(filePath, start, length);
    // 创建新的 ArrayBuffer 来确保类型兼容性
    const arrayBuffer = new ArrayBuffer(uint8Array.length);
    new Uint8Array(arrayBuffer).set(uint8Array);
    return arrayBuffer;
  },

  getTextContent: async (): Promise<string> => {
    // 直接使用 getFileContent，它已经包含了智能编码检测
    const fileContent = await storageClient.getFileContent(filePath);
    return fileContent.content;
  },
});

export const PluginViewer: React.FC<LocalPluginViewerProps> = ({
  file,
  filePath,
  content,
  storageClient,
  isLargeFile,
  pluginId,
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

      // 如果指定了 pluginId，则使用指定的插件；否则通过插件管理器自动查找
      let plugin;
      if (pluginId) {
        plugin = pluginManager.getPluginById(pluginId);
        if (!plugin) {
          setError(t('plugin.notFound', { filename: file.basename }));
          setLoading(false);
          return;
        }
      } else {
        // 通过插件管理器查找合适的插件
        plugin = pluginManager.findViewerForFile(file.basename);
        if (!plugin) {
          setError(t('plugin.notFound', { filename: file.basename }));
          setLoading(false);
          return;
        }
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
  }, [file.basename, pluginId, t]);

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
        language={i18n.language}
        t={pluginT}
      />
    </div>
  );
};

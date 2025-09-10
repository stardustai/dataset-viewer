import { useCallback, useEffect, useState } from 'react';
import { CompressionService } from '../../../../services/compression';
import type { StorageClient } from '../../../../services/storage/types';
import type { ArchiveInfo } from '../../../../types';

interface UseArchiveInfoProps {
  url: string;
  filename: string;
  storageClient?: StorageClient;
  t: (key: string) => string;
}

// 从错误对象中提取错误信息的辅助函数
const extractErrorMessage = (
  err: unknown,
  fallbackKey: string,
  t: (key: string) => string
): string => {
  if (err instanceof Error) {
    return err.message;
  } else if (typeof err === 'string') {
    return err;
  } else if (err && typeof err === 'object' && 'message' in err) {
    return String(err.message);
  } else {
    return t(fallbackKey);
  }
};

// 错误信息翻译辅助函数
const translateError = (error: string, t: (key: string) => string): string => {
  // 检查是否是翻译键（以字母开头，包含点号）
  if (error.match(/^[a-zA-Z][a-zA-Z0-9.]+$/)) {
    return t(error);
  }
  // 否则返回原始错误信息
  return error;
};

export const useArchiveInfo = ({ url, filename, storageClient, t }: UseArchiveInfoProps) => {
  const [archiveInfo, setArchiveInfo] = useState<ArchiveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadArchiveInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let info: ArchiveInfo;

      // 检查是否有存储客户端，如果有则优先使用存储客户端接口
      if (storageClient && storageClient.analyzeArchive) {
        // 使用存储客户端的统一接口
        const maxSize = 1024 * 1024; // 1MB
        info = await storageClient.analyzeArchive(url, filename, maxSize);
      } else {
        // 回退到直接的压缩服务接口
        const maxSize = 1024 * 1024; // 1MB
        info = await CompressionService.analyzeArchive(url, filename, maxSize);
      }

      setArchiveInfo(info);
    } catch (err) {
      const errorMessage = extractErrorMessage(err, 'error.load.archive', t);
      setError(translateError(errorMessage, t));
    } finally {
      setLoading(false);
    }
  }, [url, filename, storageClient, t]);

  const loadDetailedArchiveInfo = useCallback(async () => {
    if (!filename.toLowerCase().endsWith('.zip')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let detailedInfo: ArchiveInfo;

      if (storageClient && storageClient.analyzeArchive) {
        // 使用存储客户端的统一接口，不限制大小以获取详细信息
        detailedInfo = await storageClient.analyzeArchive(url, filename);
      } else {
        // 回退到直接的压缩服务接口
        detailedInfo = await CompressionService.analyzeArchive(
          url,
          filename,
          undefined // 无大小限制
        );
      }

      setArchiveInfo(detailedInfo);
    } catch (err) {
      const errorMessage = extractErrorMessage(err, 'error.load.details', t);
      setError(translateError(errorMessage, t));
    } finally {
      setLoading(false);
    }
  }, [url, filename, storageClient, t]);

  useEffect(() => {
    loadArchiveInfo();
  }, [loadArchiveInfo]);

  return {
    archiveInfo,
    loading,
    error,
    setError,
    loadDetailedArchiveInfo,
    reloadArchiveInfo: loadArchiveInfo,
  };
};

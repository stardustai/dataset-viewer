import { useCallback, useState } from 'react';
import { CompressionService } from '../../../../services/compression';
import type { StorageClient } from '../../../../services/storage/types';
import type { ArchiveEntry, FilePreview } from '../../../../types';
import {
  isDataFile,
  isMediaFile,
  isSpreadsheetFile,
  isTextLikeFile,
} from '../../../../utils/fileTypes';
import { safeParseInt } from '../../../../utils/typeUtils';

interface FileLoadState {
  totalSize: number;
  loadedContentSize: number;
  loadedChunks: number;
  currentFilePosition: number;
  loadingMore: boolean;
  autoLoadTriggered: boolean;
  manualLoadRequested: boolean;
  manualLoading: boolean;
}

interface UseArchiveFileLoaderProps {
  url: string;
  filename: string;
  storageClient?: StorageClient;
  t: (key: string) => string;
}

export const useArchiveFileLoader = ({
  url,
  filename,
  storageClient,
  t,
}: UseArchiveFileLoaderProps) => {
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileLoadState, setFileLoadState] = useState<FileLoadState>({
    totalSize: 0,
    loadedContentSize: 0,
    loadedChunks: 0,
    currentFilePosition: 0,
    loadingMore: false,
    autoLoadTriggered: false,
    manualLoadRequested: false,
    manualLoading: false,
  });

  const resetFileState = useCallback(() => {
    setFilePreview(null);
    setFileContent('');
    setPreviewError(null);
    setFileLoadState({
      totalSize: 0,
      loadedContentSize: 0,
      loadedChunks: 0,
      currentFilePosition: 0,
      loadingMore: false,
      autoLoadTriggered: false,
      manualLoadRequested: false,
      manualLoading: false,
    });
  }, []);

  const loadFilePreview = useCallback(
    async (entry: ArchiveEntry) => {
      try {
        setPreviewLoading(true);
        resetFileState();

        const fileSize = safeParseInt(entry.size) || 0;
        const isTextFileType = isTextLikeFile(entry.path);

        setFileLoadState(prev => ({ ...prev, totalSize: fileSize }));

        // 非文本文件的处理逻辑
        if (!isTextFileType) {
          const isMediaFileType = isMediaFile(entry.path);
          const isDataFileType = isDataFile(entry.path) || isSpreadsheetFile(entry.path);
          const shouldAutoLoadMedia = isMediaFileType && fileSize < 10 * 1024 * 1024;
          const shouldAutoLoadData = isDataFileType && fileSize < 10 * 1024 * 1024;

          if (!shouldAutoLoadMedia && !shouldAutoLoadData) {
            const emptyPreview: FilePreview = {
              content: new Uint8Array(0),
              is_truncated: true,
              total_size: entry.size,
              preview_size: 0,
            };
            setFilePreview(emptyPreview);
            return;
          }

          const loadSize = fileSize;
          let preview: FilePreview;

          if (storageClient && storageClient.getArchiveFilePreview) {
            preview = await storageClient.getArchiveFilePreview(
              url,
              filename,
              entry.path,
              loadSize
            );
          } else {
            preview = await CompressionService.extractFilePreview(
              url,
              filename,
              entry.path,
              loadSize
            );
          }

          setFilePreview(preview);
          setFileLoadState(prev => ({ ...prev, manualLoadRequested: true }));
          return;
        }

        // 文本文件的处理逻辑
        const shouldLoadCompleteText = fileSize < 10 * 1024 * 1024;
        const initialLoadSize = shouldLoadCompleteText ? fileSize : Math.min(fileSize, 128 * 1024);

        let preview: FilePreview;

        if (storageClient && storageClient.getArchiveFilePreview) {
          preview = await storageClient.getArchiveFilePreview(
            url,
            filename,
            entry.path,
            initialLoadSize
          );
        } else {
          preview = await CompressionService.extractFilePreview(
            url,
            filename,
            entry.path,
            initialLoadSize
          );
        }

        setFilePreview(preview);

        if (preview.content) {
          try {
            const textContent = new TextDecoder('utf-8', { fatal: false }).decode(preview.content);
            setFileContent(textContent);
            setFileLoadState(prev => ({
              ...prev,
              loadedContentSize: preview.content!.length,
              loadedChunks: 1,
              currentFilePosition: 0,
            }));
          } catch (decodeError) {
            console.error('Failed to decode text content:', decodeError);
            setPreviewError(t('error.decode.text'));
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('error.load.preview');
        setPreviewError(errorMessage);
      } finally {
        setPreviewLoading(false);
      }
    },
    [url, filename, storageClient, t, resetFileState]
  );

  const loadMoreContent = useCallback(
    async (entry: ArchiveEntry) => {
      if (fileLoadState.loadingMore || !filePreview?.is_truncated) return;

      try {
        setFileLoadState(prev => ({ ...prev, loadingMore: true }));

        const chunkSize = 128 * 1024;
        const startPosition = fileLoadState.currentFilePosition + fileLoadState.loadedContentSize;
        const loadSize = Math.min(chunkSize, fileLoadState.totalSize - startPosition);

        if (loadSize <= 0) {
          setFileLoadState(prev => ({ ...prev, loadingMore: false }));
          return;
        }

        let additionalPreview: FilePreview;

        if (storageClient && storageClient.getArchiveFilePreview) {
          try {
            additionalPreview = await storageClient.getArchiveFilePreview(
              url,
              filename,
              entry.path,
              loadSize,
              startPosition
            );
          } catch (offsetError) {
            console.warn('Storage client does not support offset loading, loading full file');
            const fullPreview = await storageClient.getArchiveFilePreview(
              url,
              filename,
              entry.path,
              fileLoadState.totalSize
            );
            if (
              fullPreview.content &&
              fullPreview.content.length > fileLoadState.loadedContentSize
            ) {
              const remainingContent = fullPreview.content.slice(fileLoadState.loadedContentSize);
              const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(
                remainingContent
              );
              setFileContent(prev => prev + additionalText);
              setFilePreview(fullPreview);
              setFileLoadState(prev => ({
                ...prev,
                loadedContentSize: fullPreview.content!.length,
                loadedChunks: prev.loadedChunks + 1,
                loadingMore: false,
              }));
            } else {
              setFileLoadState(prev => ({ ...prev, loadingMore: false }));
            }
            return;
          }
        } else {
          console.warn('CompressionService does not support offset loading, loading full file');
          const fullPreview = await CompressionService.extractFilePreview(
            url,
            filename,
            entry.path,
            fileLoadState.totalSize
          );
          if (fullPreview.content && fullPreview.content.length > fileLoadState.loadedContentSize) {
            const remainingContent = fullPreview.content.slice(fileLoadState.loadedContentSize);
            const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(
              remainingContent
            );
            setFileContent(prev => prev + additionalText);
            setFilePreview(fullPreview);
            setFileLoadState(prev => ({
              ...prev,
              loadedContentSize: fullPreview.content!.length,
              loadedChunks: prev.loadedChunks + 1,
              loadingMore: false,
            }));
          } else {
            setFileLoadState(prev => ({ ...prev, loadingMore: false }));
          }
          return;
        }

        if (additionalPreview.content) {
          const additionalText = new TextDecoder('utf-8', { fatal: false }).decode(
            additionalPreview.content
          );
          setFileContent(prev => prev + additionalText);

          setFilePreview(prev =>
            prev
              ? {
                  ...prev,
                  content: prev.content
                    ? new Uint8Array([...prev.content, ...additionalPreview.content!])
                    : additionalPreview.content!,
                  is_truncated: additionalPreview.is_truncated,
                  preview_size: (prev.preview_size || 0) + additionalPreview.content!.length,
                }
              : additionalPreview
          );

          setFileLoadState(prev => ({
            ...prev,
            loadedContentSize: prev.loadedContentSize + additionalPreview.content!.length,
            loadedChunks: prev.loadedChunks + 1,
          }));
        }
      } catch (err) {
        console.error('Failed to load more content:', err);
        setPreviewError(t('error.load.more'));
      } finally {
        setFileLoadState(prev => ({ ...prev, loadingMore: false }));
      }
    },
    [url, filename, storageClient, fileLoadState, filePreview?.is_truncated, t]
  );

  const loadFullContent = useCallback(
    async (entry: ArchiveEntry) => {
      try {
        setFileLoadState(prev => ({ ...prev, manualLoading: true }));
        setPreviewError(null);

        const fileSize = safeParseInt(entry.size) || 0;
        let preview: FilePreview;

        if (storageClient && storageClient.getArchiveFilePreview) {
          preview = await storageClient.getArchiveFilePreview(url, filename, entry.path, fileSize);
        } else {
          preview = await CompressionService.extractFilePreview(
            url,
            filename,
            entry.path,
            fileSize
          );
        }

        setFilePreview(preview);
        setFileLoadState(prev => ({ ...prev, manualLoadRequested: true }));

        if (isTextLikeFile(entry.path) && preview.content) {
          try {
            const textContent = new TextDecoder('utf-8', { fatal: false }).decode(preview.content);
            setFileContent(textContent);
            setFileLoadState(prev => ({
              ...prev,
              loadedContentSize: preview.content!.length,
              loadedChunks: 1,
              currentFilePosition: 0,
            }));
          } catch (decodeError) {
            console.error('Failed to decode text content:', decodeError);
            setPreviewError(t('error.decode.text'));
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('error.load.full');
        setPreviewError(errorMessage);
      } finally {
        setFileLoadState(prev => ({ ...prev, manualLoading: false }));
      }
    },
    [url, filename, storageClient, t]
  );

  return {
    filePreview,
    previewLoading,
    previewError,
    fileContent,
    fileLoadState,
    setPreviewError,
    loadFilePreview,
    loadMoreContent,
    loadFullContent,
    resetFileState,
  };
};

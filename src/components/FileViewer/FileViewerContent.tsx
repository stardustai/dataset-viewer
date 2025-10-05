import { Loader2 } from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { pluginFramework } from '../../services/plugin/pluginFramework';
import { pluginManager } from '../../services/plugin/pluginManager';
import type { StorageClient } from '../../services/storage/types';
import { useStorageStore } from '../../stores/storageStore';
import type { FullFileSearchResult, SearchResult, StorageFile } from '../../types';
import { UnsupportedFormatDisplay } from '../common';
import { LazyComponentWrapper } from './common';
import { PluginViewer } from './PluginViewer';
import {
  ArchiveViewer,
  MediaViewer,
  PointCloudViewer,
  PresentationViewer,
  UniversalDataTableViewer,
  VirtualizedTextViewer,
  WordViewer,
} from './viewers';

interface VirtualizedTextViewerRef {
  scrollToLine: (lineNumber: number, column?: number) => void;
  scrollToPercentage: (percentage: number) => void;
  jumpToFilePosition: (filePosition: number) => void;
}

interface FileViewerContentProps {
  loading?: boolean;
  error?: string | null;
  file: StorageFile;
  filePath: string;
  fileType: string;
  storageClient?: StorageClient;
  hasAssociatedFiles?: boolean;
  content: string;
  searchTerm: string;
  currentSearchIndex: number;
  searchResults: SearchResult[];
  fullFileSearchResults: FullFileSearchResult[];
  fullFileSearchMode: boolean;
  calculateStartLineNumber?: (filePosition: number) => number;
  fileInfo: {
    fileType: string;
    isText: boolean;
    isMarkdown: boolean;
    isWord: boolean;
    isPresentation: boolean;
    isMedia: boolean;
    isArchive: boolean;
    isData: boolean;
    isSpreadsheet: boolean;
    isPointCloud: boolean;
    isTextBased: boolean;
    canPreview: () => boolean;
    needsSpecialViewer: () => boolean;
  };
  isLargeFile: boolean;
  loadingMore: boolean;
  loadingBefore?: boolean; // 新增：向前加载状态
  canLoadBefore?: boolean; // 新增：是否可以向前加载
  loadedChunks: number;
  loadedContentSize: number;
  containerRef: RefObject<HTMLDivElement | null>;
  mainContainerRef: RefObject<HTMLDivElement | null>;
  loadMoreSectionRef: RefObject<HTMLDivElement | null>;
  isMarkdownPreviewOpen: boolean;
  setIsMarkdownPreviewOpen: (open: boolean) => void;
  handleSearchResults: (results: SearchResult[], isLimited?: boolean) => void;
  handleScrollToBottom: () => void;
  handleScrollToTop?: () => Promise<number | void>; // 新增：向前加载函数
  setPresentationMetadata: (metadata: any) => void;
  setDataMetadata: (metadata: any) => void;
  loadFileContent: (forceLoad?: boolean) => Promise<void>;
  forceTextMode?: boolean; // 新增属性，用于强制以文本格式打开
  pluginId?: string; // 新增属性，指定使用的插件ID
}

export const FileViewerContent = forwardRef<
  VirtualizedTextViewerRef | null,
  FileViewerContentProps
>(
  (
    {
      loading,
      error,
      file,
      filePath,
      fileType,
      storageClient,
      hasAssociatedFiles,
      content,
      searchTerm,
      currentSearchIndex,
      searchResults,
      fullFileSearchResults,
      fullFileSearchMode,
      calculateStartLineNumber,
      fileInfo,
      isLargeFile,
      loadingMore,
      loadingBefore,
      canLoadBefore,
      handleSearchResults,
      handleScrollToBottom,
      handleScrollToTop,
      setPresentationMetadata,
      setDataMetadata,
      isMarkdownPreviewOpen,
      setIsMarkdownPreviewOpen,
      loadFileContent,
      forceTextMode,
      pluginId,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const { getFileUrl } = useStorageStore();
    const [openAsText, setOpenAsText] = useState(!!forceTextMode);

    // 构建内置查看器的配置
    const getBuiltInViewerConfig = (viewerId: string) => {
      const ext = file.basename.toLowerCase();
      const configs: Record<string, { component: any; props: any }> = {
        'builtin:word': {
          component: WordViewer,
          props: { filePath, fileName: file.basename, fileSize: file.size },
        },
        'builtin:presentation': {
          component: PresentationViewer,
          props: {
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            onMetadataLoaded: setPresentationMetadata,
          },
        },
        'builtin:media': {
          component: MediaViewer,
          props: {
            filePath,
            fileName: file.basename,
            fileType: fileType as 'image' | 'pdf' | 'video' | 'audio',
            fileSize: file.size,
            hasAssociatedFiles,
          },
        },
        'builtin:spreadsheet': {
          component: UniversalDataTableViewer,
          props: {
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            fileType:
              ext.endsWith('.xlsx') || ext.endsWith('.xls')
                ? 'xlsx'
                : ext.endsWith('.ods')
                  ? 'ods'
                  : 'csv',
            onMetadataLoaded: setDataMetadata,
            storageClient,
          },
        },
        'builtin:data': {
          component: UniversalDataTableViewer,
          props: {
            filePath,
            fileName: file.basename,
            fileSize: file.size,
            fileType: ext.endsWith('.parquet') || ext.endsWith('.pqt') ? 'parquet' : 'csv',
            onMetadataLoaded: setDataMetadata,
            storageClient,
          },
        },
        'builtin:archive': {
          component: ArchiveViewer,
          props: {
            url: getFileUrl(filePath),
            filename: file.basename,
            storageClient,
          },
        },
        'builtin:pointcloud': {
          component: PointCloudViewer,
          props: { filePath, onMetadataLoaded: setDataMetadata },
        },
      };
      return configs[viewerId];
    };

    // 渲染文本/Markdown查看器
    const renderTextViewer = (isMarkdownMode = false) => {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 顶部加载状态指示器 */}
          {isLargeFile && loadingBefore && canLoadBefore && (
            <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex-shrink-0">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <VirtualizedTextViewer
              ref={ref}
              content={content}
              searchTerm={searchTerm}
              onSearchResults={handleSearchResults}
              onScrollToBottom={handleScrollToBottom}
              onScrollToTop={handleScrollToTop}
              startLineNumber={calculateStartLineNumber ? calculateStartLineNumber(0) : 1}
              currentSearchIndex={currentSearchIndex}
              searchResults={fullFileSearchMode ? fullFileSearchResults : searchResults}
              fileName={file.basename}
              isMarkdown={isMarkdownMode && !openAsText}
              isMarkdownPreviewOpen={isMarkdownPreviewOpen}
              setIsMarkdownPreviewOpen={setIsMarkdownPreviewOpen}
            />
          </div>

          {/* 底部加载状态指示器 */}
          {isLargeFile && loadingMore && (
            <div className="flex justify-center py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex-shrink-0">
              <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            </div>
          )}
        </div>
      );
    };

    // 渲染内置查看器
    const renderBuiltInViewer = (viewerId: string) => {
      // 特殊处理文本和 Markdown 查看器
      if (viewerId === 'builtin:text') {
        return renderTextViewer(false);
      }
      if (viewerId === 'builtin:markdown') {
        return renderTextViewer(true);
      }

      const config = getBuiltInViewerConfig(viewerId);
      if (!config) return null;

      return <LazyComponentWrapper component={config.component} props={config.props} />;
    };

    // 处理加载状态
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        </div>
      );
    }

    // 处理错误状态
    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-red-600 dark:text-red-400">
            <p className="text-lg font-medium mb-2">{t('error')}</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      );
    }

    // 如果指定了 pluginId，优先使用指定的查看器
    if (pluginId && !forceTextMode) {
      // 检查是否是内置查看器
      if (pluginId.startsWith('builtin:')) {
        const builtInViewer = pluginFramework.getBuiltInViewer(pluginId);
        if (builtInViewer) {
          return renderBuiltInViewer(pluginId);
        }
      } else if (storageClient) {
        // 外部插件
        return (
          <PluginViewer
            file={file}
            filePath={filePath}
            content={content}
            storageClient={storageClient}
            isLargeFile={isLargeFile}
            pluginId={pluginId}
          />
        );
      }
    }

    // 检查是否有插件可以处理此文件（但不在强制文本模式下）
    if (
      !forceTextMode &&
      !openAsText &&
      storageClient &&
      pluginManager.findViewerForFile(file.basename)
    ) {
      return (
        <PluginViewer
          file={file}
          filePath={filePath}
          content={content}
          storageClient={storageClient}
          isLargeFile={isLargeFile}
        />
      );
    }

    // 如果强制文本模式或用户选择以文本格式打开
    if (forceTextMode || openAsText) {
      return renderTextViewer(fileInfo.isMarkdown);
    }

    // 自动检测文件类型并使用对应的内置查看器
    const builtInViewerMap: Record<string, string> = {
      isText: 'builtin:text',
      isMarkdown: 'builtin:markdown',
      isWord: 'builtin:word',
      isPresentation: 'builtin:presentation',
      isMedia: 'builtin:media',
      isSpreadsheet: 'builtin:spreadsheet',
      isData: 'builtin:data',
      isArchive: 'builtin:archive',
      isPointCloud: 'builtin:pointcloud',
    };

    for (const [key, viewerId] of Object.entries(builtInViewerMap)) {
      if (fileInfo[key as keyof typeof fileInfo]) {
        return renderBuiltInViewer(viewerId);
      }
    }

    return (
      <UnsupportedFormatDisplay
        message={t('viewer.unsupported.format')}
        secondaryMessage={t('viewer.download.to.view')}
        onOpenAsText={async () => {
          if (loadFileContent) {
            await loadFileContent(true); // 强制加载非文本文件
          }
          setOpenAsText(true);
        }}
      />
    );
  }
);

FileViewerContent.displayName = 'FileViewerContent';

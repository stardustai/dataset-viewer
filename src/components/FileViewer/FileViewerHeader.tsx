import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, Copy } from 'lucide-react';
import { StorageFile } from '../../types';
import { StorageServiceManager } from '../../services/storage';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { FileIcon } from '../../utils/fileIcons';
import { copyToClipboard, showCopyToast, showToast } from '../../utils/clipboard';
import { formatFileSize } from '../../utils/fileUtils';

interface FileViewerHeaderProps {
  file: StorageFile;
  filePath: string;
  fileType: string;
  onBack: () => void;
  hideBackButton?: boolean; // 新增属性，用于隐藏返回按钮
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
    isTextBased: boolean;
    canPreview: () => boolean;
    needsSpecialViewer: () => boolean;
  };
  isLargeFile?: boolean;
  dataMetadata?: {
    numRows: number;
    numColumns: number;
    fileType?: string;
    extensions?: any; // 扩展字段，允许任何格式添加自己的特定信息
  } | null;
  presentationMetadata?: { slideCount: number; size: { width: number; height: number } } | null;
  currentFilePosition?: number;
  totalSize?: number;
}

export const FileViewerHeader: React.FC<FileViewerHeaderProps> = ({
  file,
  filePath,
  fileType,
  onBack,
  hideBackButton = false,
  fileInfo,
  isLargeFile = false,
  dataMetadata,
  presentationMetadata,
  currentFilePosition = 0,
  totalSize = 0,
}) => {
  const { t } = useTranslation();

  const getFileExtension = (filename: string): string => {
    return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  };

  const getLanguageFromExtension = (ext: string): string => {
    const languageMap: { [key: string]: string } = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      json: 'json',
      html: 'html',
      css: 'css',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      php: 'php',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
      md: 'markdown',
    };
    return languageMap[ext] || 'text';
  };

  const downloadFile = async () => {
    try {
      console.log('Starting download for file:', file.basename, 'Path:', filePath);

      // 不传 savePath，让后端自动使用默认下载路径
      const result = await StorageServiceManager.downloadFileWithProgress(filePath, file.basename);
      console.log('Download initiated:', result);

      // 下载进度将通过事件系统处理，这里不需要显示 alert
      // 用户可以在下载进度组件中看到状态
    } catch (err) {
      console.error('Failed to start download:', err);
      // 如果是用户取消操作，不显示错误弹窗
      const errorMessage =
        err instanceof Error ? err.message : typeof err === 'string' ? err : t('error.unknown');
      if (errorMessage !== 'download.cancelled') {
        showToast(`${t('download.failed')}: ${errorMessage}`, 'error');
      }
    }
  };

  // 复制完整路径到剪贴板
  const copyFullPath = async () => {
    try {
      const connection = StorageServiceManager.getConnection();
      if (!connection) return;

      // 使用 StorageServiceManager.getFileUrl 获取正确的 URL
      // 这样可以正确处理 HuggingFace 等特殊协议
      const fullPath = StorageServiceManager.getFileUrl(filePath);

      const success = await copyToClipboard(fullPath);
      if (success) {
        showCopyToast(t('copied.to.clipboard'));
      } else {
        showCopyToast(t('copy.failed'));
      }
    } catch (err) {
      console.error('复制路径失败:', err);
      showCopyToast(t('copy.failed'));
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 lg:space-x-4 min-w-0 flex-1">
          {!hideBackButton && (
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              title={t('viewer.go.back')}
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          )}

          <div className="flex items-center space-x-2 lg:space-x-3 min-w-0 flex-1">
            <FileIcon fileType={fileType} size="lg" filename={file.basename} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1 lg:space-x-2">
                <h1
                  className="text-base lg:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-32 sm:max-w-48 lg:max-w-lg"
                  title={file.basename}
                >
                  {file.basename}
                </h1>
                {/* 复制完整路径按钮 */}
                <button
                  onClick={copyFullPath}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                  title={t('copy.full.path')}
                >
                  <Copy className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 truncate">
                {formatFileSize(file.size)} •{' '}
                {
                  // 检查是否有扩展字段中的点云信息
                  dataMetadata && dataMetadata.extensions && 'pointCount' in dataMetadata.extensions
                    ? `${(dataMetadata.extensions as any).pointCount.toLocaleString()} points • ${(dataMetadata.extensions as any).hasColor ? 'RGB' : 'XYZ'}${(dataMetadata.extensions as any).hasIntensity ? '+I' : ''}`
                    : // 通用数据文件（表格、CSV等）
                      (fileInfo.isData || fileInfo.isSpreadsheet) && dataMetadata
                      ? `${dataMetadata.numRows.toLocaleString()} rows • ${dataMetadata.numColumns} columns`
                      : // 演示文件
                        fileInfo.isPresentation && presentationMetadata
                        ? `${presentationMetadata.slideCount} slides • ${presentationMetadata.size.width} × ${presentationMetadata.size.height} pt`
                        : // 文本文件
                          fileInfo.isText
                          ? getLanguageFromExtension(getFileExtension(file.basename))
                          : fileType
                }
                {isLargeFile && (
                  <span className="hidden sm:inline">
                    {' • '}
                    {t('viewer.position.info', {
                      current: formatFileSize(currentFilePosition),
                      total: formatFileSize(totalSize),
                      percent: ((currentFilePosition / totalSize) * 100).toFixed(1),
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
          <LanguageSwitcher />
          {/* 响应式下载按钮 */}
          <button
            onClick={downloadFile}
            className="flex items-center space-x-2 p-2 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
            title={t('viewer.download')}
          >
            <Download className="w-4 h-4" />
            <span className="hidden lg:inline">{t('viewer.download')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

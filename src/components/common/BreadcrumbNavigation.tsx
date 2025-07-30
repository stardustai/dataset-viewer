import React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, ArrowLeft, ChevronRight, Copy } from 'lucide-react';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';

interface BreadcrumbNavigationProps {
  currentPath: string;
  onNavigateHome: () => void;
  onNavigateBack?: () => void;
  onNavigateToSegment: (index: number) => void;
  onCopyPath?: () => void;
  showBackButton?: boolean;
  showCopyButton?: boolean;
  showHomeIcon?: boolean;
  homeLabel?: string;
  className?: string;
  compact?: boolean; // 紧凑模式，用于ArchiveTreeList
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  currentPath,
  onNavigateHome,
  onNavigateBack,
  onNavigateToSegment,
  onCopyPath,
  showBackButton = true,
  showCopyButton = true,
  showHomeIcon = false,
  homeLabel,
  className = '',
  compact = false
}) => {
  const { t } = useTranslation();

  const getPathSegments = () => {
    if (currentPath === '') return [];
    return currentPath.split('/').filter(Boolean);
  };

  const copyCurrentPath = async () => {
    if (onCopyPath) {
      onCopyPath();
    } else {
      const pathToCopy = currentPath || '/';
      const success = await copyToClipboard(pathToCopy);
      if (success) {
        showCopyToast(t('copied.to.clipboard'));
      } else {
        showCopyToast(t('copy.failed'));
      }
    }
  };

  const defaultHomeLabel = homeLabel || (compact ? t('archive.root') : t('home'));

  if (compact) {
    // 紧凑模式，用于ArchiveTreeList
    return (
      <div className={`flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 ${className}`}>
        <span 
          className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200"
          onClick={onNavigateHome}
        >
          {defaultHomeLabel}
        </span>
        {getPathSegments().map((part, index) => (
          <React.Fragment key={index}>
            <span>/</span>
            <span 
              className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200"
              onClick={() => onNavigateToSegment(index)}
            >
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  // 标准模式，用于FileBrowser和ArchiveFileBrowser
  return (
    <div className={`flex items-center space-x-2 min-w-0 flex-1 ${className}`}>
      {/* Home图标按钮 */}
      {showHomeIcon && (
        <button
          onClick={onNavigateHome}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
          title={defaultHomeLabel}
        >
          <Home className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
      )}

      {/* 返回按钮 */}
      {showBackButton && onNavigateBack && currentPath !== '' && (
        <button
          onClick={onNavigateBack}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
          title={t('go.up')}
        >
          <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
      )}

      {/* 面包屑导航 */}
      <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-300 min-w-0 flex-1 overflow-hidden">
        {/* 根目录按钮 */}
        <span
          onClick={onNavigateHome}
          className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex-shrink-0"
        >
          {defaultHomeLabel}
        </span>

        {/* 路径段 */}
        {getPathSegments().map((segment, index) => (
          <React.Fragment key={index}>
            <ChevronRight className="w-3 h-3 lg:w-4 lg:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span
              onClick={() => onNavigateToSegment(index)}
              className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate max-w-16 sm:max-w-24 lg:max-w-32"
              title={segment}
            >
              {segment}
            </span>
          </React.Fragment>
        ))}
      </div>

        {/* 复制完整路径按钮 */}
        {showCopyButton && (
          <button
            onClick={copyCurrentPath}
            className="ml-1 lg:ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
            title={t('copy.full.path')}
          >
            <Copy className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>
  );
};
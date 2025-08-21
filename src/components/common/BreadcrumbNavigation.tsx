import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, ArrowLeft, ChevronRight, Copy, Edit3, Check, X } from 'lucide-react';
import { copyToClipboard, showCopyToast } from '../../utils/clipboard';
import { StorageServiceManager } from '../../services/storage';
import { parseUserInput } from '../../utils/pathUtils';

interface BreadcrumbNavigationProps {
  currentPath: string;
  onNavigateHome: () => void;
  onNavigateBack?: () => void;
  onNavigateToSegment: (index: number) => void;
  onCopyPath?: () => void;
  onNavigateToPath?: (path: string) => void; // 新增：直接导航到指定路径
  showBackButton?: boolean;
  showCopyButton?: boolean;
  showHomeIcon?: boolean;
  showEditButton?: boolean; // 新增：是否显示编辑按钮
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
  onNavigateToPath,
  showBackButton = true,
  showCopyButton = true,
  showHomeIcon = false,
  showEditButton = true,
  homeLabel,
  className = '',
  compact = false
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [inputPath, setInputPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const getPathSegments = () => {
    if (currentPath === '') return [];
    return currentPath.split('/').filter(Boolean);
  };

  // 进入编辑模式
  const enterEditMode = () => {
    if (!onNavigateToPath) return;

    // 尝试获取完整的协议URL作为初始值
    // 这样用户可以看到和复制功能一致的格式
    try {
      const fullUrl = StorageServiceManager.getFileUrl(currentPath);
      setInputPath(fullUrl);
    } catch {
      // 如果出错，使用当前路径作为初始值
      setInputPath(currentPath || '');
    }

    setIsEditing(true);
  };

  // 退出编辑模式
  const exitEditMode = () => {
    setIsEditing(false);
    setInputPath('');
  };

  // 延迟退出编辑模式（用于处理失焦事件）
  const handleBlur = () => {
    // 延迟执行，确保onClick事件能先执行
    setTimeout(() => {
      exitEditMode();
    }, 150);
  };

  // 确认路径导航
  const confirmNavigation = () => {
    if (!onNavigateToPath) {
      exitEditMode();
      return;
    }

    // 如果输入为空，退出编辑模式
    if (!inputPath.trim()) {
      exitEditMode();
      return;
    }

    // 使用通用路径解析工具
    const cleanPath = parseUserInput(inputPath, currentPath);

    onNavigateToPath(cleanPath);
    exitEditMode();
  };

  // 键盘事件处理
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      confirmNavigation();
    } else if (e.key === 'Escape') {
      exitEditMode();
    }
  };

  // 自动聚焦到输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

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
    // 紧凑模式，用于ArchiveTreeList，暂不支持编辑功能
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

      {/* 面包屑导航或路径编辑器 */}
      <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-300 min-w-0 flex-1">
        {isEditing ? (
          /* 路径编辑模式 */
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-w-0"
              placeholder={t('breadcrumb.path.placeholder', 'Enter path...')}
            />
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // 防止输入框失焦
                confirmNavigation();
              }}
              className="p-1 hover:bg-green-100 dark:hover:bg-green-900/20 rounded transition-colors flex-shrink-0"
              title={t('breadcrumb.confirm', 'Confirm')}
            >
              <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
            </button>
            <button
              onMouseDown={(e) => {
                e.preventDefault(); // 防止输入框失焦
                exitEditMode();
              }}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
              title={t('breadcrumb.cancel', 'Cancel')}
            >
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        ) : (
          /* 正常面包屑显示 */
          <div className="flex items-center space-x-1 min-w-0 overflow-x-auto flex-1 scrollbar-none">
            {/* 根目录按钮 */}
            <span
              onClick={onNavigateHome}
              className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-1 rounded transition-all duration-200 flex-shrink-0 font-medium whitespace-nowrap min-w-12"
            >
              {defaultHomeLabel}
            </span>

            {/* 路径段 */}
            {getPathSegments().map((segment, index) => (
              <React.Fragment key={index}>
                <ChevronRight className="w-3 h-3 lg:w-4 lg:h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span
                  onClick={() => onNavigateToSegment(index)}
                  className="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-1 text-center rounded transition-all duration-200 font-medium min-w-16 max-w-40 truncate"
                  title={segment}
                >
                  {segment}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* 编辑和复制按钮 */}
      <div className="flex items-center space-x-1 flex-shrink-0">
        {/* 路径编辑按钮 */}
        {showEditButton && onNavigateToPath && !isEditing && (
          <button
            onClick={enterEditMode}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('breadcrumb.edit.path', 'Edit path')}
          >
            <Edit3 className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}

        {/* 复制完整路径按钮 */}
        {showCopyButton && (
          <button
            onClick={copyCurrentPath}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title={t('copy.full.path')}
          >
            <Copy className="w-3 h-3 lg:w-4 lg:h-4 text-gray-500 dark:text-gray-400" />
          </button>
        )}
      </div>
    </div>
  );
};

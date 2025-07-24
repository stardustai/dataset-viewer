import React from 'react';
import {
  Loader2,
  Archive,
  Search,
  File,
  FileText,
  Folder,
  EyeOff,
  AlertTriangle,
  LucideIcon
} from 'lucide-react';

export type StatusType =
  | 'loading'
  | 'error'
  | 'empty'
  | 'notFound'
  | 'unsupported'
  | 'hiddenFiles'
  | 'noSearchResults'
  | 'archiveEmpty'
  | 'previewEmpty'
  | 'directoryEmpty';

interface StatusDisplayProps {
  type: StatusType;
  message: string;
  secondaryMessage?: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  className?: string;
}

const defaultIcons: Record<StatusType, LucideIcon> = {
  loading: Loader2,
  error: AlertTriangle,
  empty: File,
  notFound: Search,
  unsupported: FileText,
  hiddenFiles: EyeOff,
  noSearchResults: Search,
  archiveEmpty: Archive,
  previewEmpty: Archive,
  directoryEmpty: Folder,
};

const getIconProps = (type: StatusType) => {
  const baseProps = "mx-auto w-12 h-12 text-gray-400 dark:text-gray-500 mb-4";

  if (type === 'loading') {
    return `${baseProps} animate-spin`;
  }

  return baseProps;
};

export const StatusDisplay: React.FC<StatusDisplayProps> = ({
  type,
  message,
  secondaryMessage,
  icon,
  action,
  className = "",
}) => {
  const IconComponent = icon || defaultIcons[type];
  const iconClassName = getIconProps(type);

  return (
    <div className={`flex-1 flex items-center justify-center bg-white dark:bg-gray-800 ${className}`}>
      <div className="text-center py-12">
        <IconComponent className={iconClassName} />
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
        {secondaryMessage && (
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            {secondaryMessage}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className={`mt-2 text-sm ${
              action.variant === 'primary'
                ? 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700'
                : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
            }`}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};

// 预定义的常用状态组件
export const LoadingDisplay: React.FC<{
  message?: string;
  icon?: LucideIcon;
  className?: string;
}> = ({
  message = "正在加载...",
  icon,
  className
}) => (
  <StatusDisplay type="loading" message={message} icon={icon} className={className} />
);

export const ErrorDisplay: React.FC<{
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({ message, onRetry, className }) => (
  <StatusDisplay
    type="error"
    message={message}
    action={onRetry ? { label: "重试", onClick: onRetry, variant: "secondary" } : undefined}
    className={className}
  />
);

export const EmptyDisplay: React.FC<{
  message: string;
  secondaryMessage?: string;
  className?: string;
}> = ({ message, secondaryMessage, className }) => (
  <StatusDisplay
    type="empty"
    message={message}
    secondaryMessage={secondaryMessage}
    className={className}
  />
);

export const UnsupportedFormatDisplay: React.FC<{
  message?: string;
  secondaryMessage?: string;
  className?: string;
}> = ({
  message = "不支持的文件格式",
  secondaryMessage = "请尝试下载文件以查看内容",
  className
}) => (
  <StatusDisplay
    type="unsupported"
    message={message}
    secondaryMessage={secondaryMessage}
    className={className}
  />
);

export const HiddenFilesDisplay: React.FC<{
  onShowHidden: () => void;
  className?: string;
}> = ({ onShowHidden, className }) => (
  <StatusDisplay
    type="hiddenFiles"
    message="所有文件都是隐藏文件"
    action={{ label: "显示隐藏文件", onClick: onShowHidden, variant: "secondary" }}
    className={className}
  />
);

export const NoSearchResultsDisplay: React.FC<{
  searchTerm: string;
  onClearSearch: () => void;
  className?: string;
}> = ({ searchTerm, onClearSearch, className }) => (
  <StatusDisplay
    type="noSearchResults"
    message="未找到匹配的文件"
    secondaryMessage={`请尝试不同的搜索关键词 "${searchTerm}"`}
    action={{ label: "清除搜索", onClick: onClearSearch, variant: "secondary" }}
    className={className}
  />
);

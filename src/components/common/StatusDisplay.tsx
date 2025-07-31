import React from 'react';
import { useTranslation } from 'react-i18next';
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

type StatusType =
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
  secondaryAction?: {
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
  secondaryAction,
  className = "",
}) => {
  const IconComponent = icon || defaultIcons[type];
  const iconClassName = getIconProps(type);

  return (
    <div className={`flex-1 flex items-center justify-center min-h-0 bg-white dark:bg-gray-800 ${className}`}>
      <div className="text-center py-12">
        <IconComponent className={iconClassName} />
        <p className="text-gray-500 dark:text-gray-400">{message}</p>
        {secondaryMessage && (
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            {secondaryMessage}
          </p>
        )}
        {(action || secondaryAction) && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
            {action && (
              <button
                onClick={action.onClick}
                className={`text-sm ${
                  action.variant === 'primary'
                    ? 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700'
                    : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
                }`}
              >
                {action.label}
              </button>
            )}
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className={`text-sm ${
                  secondaryAction.variant === 'primary'
                    ? 'px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700'
                    : 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300'
                }`}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>
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
  message,
  icon,
  className
}) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="loading"
      message={message || t('status.loading')}
      icon={icon}
      className={className}
    />
  );
};

export const ErrorDisplay: React.FC<{
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({ message, onRetry, className }) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="error"
      message={message}
      action={onRetry ? { label: t('status.retry'), onClick: onRetry, variant: "secondary" } : undefined}
      className={className}
    />
  );
};

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
  message,
  secondaryMessage,
  className
}) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="unsupported"
      message={message || t('status.unsupported.format')}
      secondaryMessage={secondaryMessage || t('status.unsupported.download')}
      className={className}
    />
  );
};

export const HiddenFilesDisplay: React.FC<{
  onShowHidden: () => void;
  className?: string;
}> = ({ onShowHidden, className }) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="hiddenFiles"
      message={t('status.all.files.hidden')}
      action={{ label: t('status.show.hidden.files'), onClick: onShowHidden, variant: "secondary" }}
      className={className}
    />
  );
};

export const NoSearchResultsDisplay: React.FC<{
  searchTerm: string;
  onClearSearch: () => void;
  className?: string;
}> = ({ searchTerm, onClearSearch, className }) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="noSearchResults"
      message={t('status.no.matching.files')}
      secondaryMessage={t('status.try.different.keywords', { searchTerm })}
      action={{ label: t('status.clear.search'), onClick: onClearSearch, variant: "secondary" }}
      className={className}
    />
  );
};

export const NoLocalResultsDisplay: React.FC<{
  searchTerm: string;
  onRemoteSearch: () => void;
  className?: string;
}> = ({ searchTerm, onRemoteSearch, className }) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="noSearchResults"
      message={t('status.no.local.results')}
      secondaryMessage={t('status.try.remote.search', { searchTerm })}
      action={{ label: t('status.search.remote'), onClick: onRemoteSearch, variant: "secondary" }}
      className={className}
    />
  );
};

export const NoRemoteResultsDisplay: React.FC<{
  searchTerm: string;
  onClearSearch: () => void;
  className?: string;
}> = ({ searchTerm, onClearSearch, className }) => {
  const { t } = useTranslation();
  return (
    <StatusDisplay
      type="noSearchResults"
      message={t('status.no.matching.files')}
      secondaryMessage={t('status.try.different.keywords', { searchTerm })}
      action={{ label: t('status.clear.search'), onClick: onClearSearch, variant: "secondary" }}
      className={className}
    />
  );
};

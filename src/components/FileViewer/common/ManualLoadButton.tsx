import { AlertTriangle, Database, FileText, Image, Loader2, Zap } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { ArchiveEntry } from '../../../types';
import { formatFileSize } from '../../../utils/fileUtils';
import { StatusDisplay } from '../../common';

interface ManualLoadButtonProps {
  entry: ArchiveEntry;
  onLoad: (entry: ArchiveEntry) => void;
  isLoading: boolean;
  loadType: 'media' | 'data' | 'pointCloud' | 'unsupported';
}

export const ManualLoadButton: React.FC<ManualLoadButtonProps> = ({
  entry,
  onLoad,
  isLoading,
  loadType,
}) => {
  const { t } = useTranslation();

  const getLoadTypeMessage = () => {
    switch (loadType) {
      case 'media':
        return t('media.large.file.manual.load');
      case 'data':
        return t('data.large.file.manual.load');
      case 'pointCloud':
        return t('pointcloud.file.manual.load');
      case 'unsupported':
        return t('viewer.unsupported.format');
      default:
        return t('file.requires.manual.load');
    }
  };

  const getIcon = () => {
    if (isLoading) return Loader2;

    switch (loadType) {
      case 'media':
        return Image;
      case 'data':
        return Database;
      case 'pointCloud':
        return Zap;
      case 'unsupported':
        return AlertTriangle;
      default:
        return FileText;
    }
  };

  const getMessage = () => {
    if (isLoading) {
      return t('loading');
    }
    return `${t('file.not.loaded')} (${formatFileSize(entry.size || 0)})`;
  };

  return (
    <StatusDisplay
      type={isLoading ? 'loading' : 'unsupported'}
      message={getMessage()}
      secondaryMessage={isLoading ? undefined : getLoadTypeMessage()}
      icon={getIcon()}
      action={
        isLoading
          ? undefined
          : {
              label: t('load.full.content'),
              onClick: () => onLoad(entry),
              variant: 'primary',
            }
      }
      className="h-full"
    />
  );
};

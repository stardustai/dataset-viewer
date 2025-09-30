import { ChevronDown } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StorageClientType } from '../services/storage/types';
import { storageIconMap } from '../utils/connectionIcons';

interface StorageTypeSelectorProps {
  selectedType: StorageClientType;
  onTypeChange: (type: StorageClientType) => void;
}

export const StorageTypeSelector: FC<StorageTypeSelectorProps> = ({
  selectedType,
  onTypeChange,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // 第一行的存储类型（常用的4个）
  const primaryStorageTypes = [
    {
      type: 'webdav' as StorageClientType,
      label: t('storage.type.webdav'),
      icon: storageIconMap.webdav,
      description: t('storage.type.webdav.description'),
    },
    {
      type: 'oss' as StorageClientType,
      label: t('storage.type.s3'),
      icon: storageIconMap.oss,
      description: t('storage.type.s3.description'),
    },
    {
      type: 'huggingface' as StorageClientType,
      label: t('storage.type.huggingface'),
      icon: storageIconMap.huggingface,
      description: t('storage.type.huggingface.description'),
    },
    {
      type: 'local' as StorageClientType,
      label: t('storage.type.local'),
      icon: storageIconMap.local,
      description: t('storage.type.local.description'),
    },
  ];

  // 第二行的存储类型（展开后显示）
  const secondaryStorageTypes = [
    {
      type: 'ssh' as StorageClientType,
      label: t('storage.type.ssh'),
      icon: storageIconMap.ssh,
      description: t('storage.type.ssh.description'),
    },
    {
      type: 'smb' as StorageClientType,
      label: t('storage.type.smb'),
      icon: storageIconMap.smb,
      description: t('storage.type.smb.description'),
    },
  ];

  // 当选择的类型在第二行时，自动展开选择器
  useEffect(() => {
    const isSecondaryType = secondaryStorageTypes.some(type => type.type === selectedType);
    if (isSecondaryType) {
      setIsExpanded(true);
    }
  }, [selectedType]);

  const renderStorageButton = ({ type, label, icon: Icon, description }: any) => (
    <button
      key={type}
      type="button"
      onClick={() => onTypeChange(type)}
      className={`relative p-2 border rounded-md text-center transition-all hover:shadow-sm group ${
        selectedType === type
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
      }`}
      title={description}
    >
      <div className="flex flex-col items-center space-y-1">
        <Icon
          className={`w-4 h-4 ${
            selectedType === type
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-gray-600 dark:text-gray-300'
          }`}
        />
        <span
          className={`text-xs font-medium ${
            selectedType === type
              ? 'text-indigo-900 dark:text-indigo-100'
              : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {label}
        </span>
      </div>
    </button>
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('storage.type.select')}
      </label>

      <div className="space-y-2">
        {/* 第一行 - 主要存储类型 */}
        <div className="grid grid-cols-4 gap-2">{primaryStorageTypes.map(renderStorageButton)}</div>

        {/* 展开按钮 - 在第一行下面中间位置 */}
        {!isExpanded && (
          <div className="flex justify-center !-mb-3">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 第二行 - 扩展存储类型 */}
        {isExpanded && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {secondaryStorageTypes.map(renderStorageButton)}
            {/* 占位元素保持对齐 */}
            {Array.from({ length: 4 - secondaryStorageTypes.length }).map((_, index) => (
              <div key={`placeholder-${index}`} className="invisible p-2"></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

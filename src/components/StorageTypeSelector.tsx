import React from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Folder, Cloud, Bot } from 'lucide-react';
import { StorageClientType } from '../services/storage/types';

interface StorageTypeSelectorProps {
  selectedType: StorageClientType;
  onTypeChange: (type: StorageClientType) => void;
}

export const StorageTypeSelector: React.FC<StorageTypeSelectorProps> = ({
  selectedType,
  onTypeChange
}) => {
  const { t } = useTranslation();

  // 检测是否为安卓平台
  const isAndroid = typeof navigator !== 'undefined' && 
    /android/i.test(navigator.userAgent);

  const allStorageTypes = [
    {
      type: 'webdav' as StorageClientType,
      label: t('storage.type.webdav'),
      icon: Server,
      description: t('storage.type.webdav.description')
    },
    {
      type: 'oss' as StorageClientType,
      label: t('storage.type.oss'),
      icon: Cloud,
      description: t('storage.type.oss.description')
    },
    {
      type: 'huggingface' as StorageClientType,
      label: t('storage.type.huggingface'),
      icon: Bot,
      description: t('storage.type.huggingface.description')
    },
    {
      type: 'local' as StorageClientType,
      label: t('storage.type.local'),
      icon: Folder,
      description: t('storage.type.local.description')
    }
  ];

  // 在安卓平台上过滤掉本地文件类型
  const storageTypes = isAndroid 
    ? allStorageTypes.filter(type => type.type !== 'local')
    : allStorageTypes;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('storage.type.select')}
      </label>

      <div className="grid grid-cols-4 gap-2">
        {storageTypes.map(({ type, label, icon: Icon, description }) => (
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
              <Icon className={`w-4 h-4 ${
                selectedType === type
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-300'
              }`} />
              <span className={`text-xs font-medium ${
                selectedType === type
                  ? 'text-indigo-900 dark:text-indigo-100'
                  : 'text-gray-900 dark:text-gray-100'
              }`}>
                {label}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

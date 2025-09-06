import React from 'react';
import { useTranslation } from 'react-i18next';
import { StorageClientType, ConnectionConfig } from '../../services/storage/types';
import { StoredConnection } from '../../services/connectionStorage';
import { ConnectionSelector } from './ConnectionSelector';
import { StorageTypeSelector } from '../StorageTypeSelector';
import {
  LocalConnectionForm,
  OSSConnectionForm,
  WebDAVConnectionForm,
  HuggingFaceConnectionForm,
  SSHConnectionForm,
  SMBConnectionForm,
} from './forms';

interface ConnectionFormContainerProps {
  storageType: StorageClientType;
  selectedStoredConnection: StoredConnection | null;
  formData: Record<string, any>;
  connecting: boolean;
  error: string;
  isPasswordFromStorage: boolean;
  onStorageTypeChange: (type: StorageClientType) => void;
  onStoredConnectionSelect: (connection: StoredConnection) => void;
  onConnect: () => void;
  onFormDataChange: (updates: Partial<Record<string, any>>) => void;
}

export const ConnectionFormContainer: React.FC<ConnectionFormContainerProps> = ({
  storageType,
  selectedStoredConnection,
  formData,
  connecting,
  error,
  isPasswordFromStorage,
  onStorageTypeChange,
  onStoredConnectionSelect,
  onConnect,
  onFormDataChange,
}) => {
  const { t } = useTranslation();

  // 创建表单更新助手函数
  const handleFormUpdate = (field: string, value: any) => {
    onFormDataChange({ [field]: value });
  };

  // 创建表单提交处理器
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onConnect();
  };

  return (
    <div className="w-full max-w-none sm:max-w-md mx-0 sm:mx-auto lg:mx-0 h-full sm:h-auto">
      <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-xl shadow-xl p-4 sm:p-6 w-full h-full sm:h-auto flex flex-col justify-center">
        {/* 移动端标题和描述 */}
        <div className="lg:hidden text-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('app.name')}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('app.tagline')}</p>
        </div>

        <div className="space-y-4">
          {/* 已保存的连接 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('saved.connections')}
            </label>
            <ConnectionSelector
              selectedConnection={selectedStoredConnection}
              onSelect={onStoredConnectionSelect}
            />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                {t('or.new.connection')}
              </span>
            </div>
          </div>

          {/* 存储类型选择器 */}
          <StorageTypeSelector selectedType={storageType} onTypeChange={onStorageTypeChange} />

          {/* 根据存储类型显示不同的表单 */}
          {storageType === 'webdav' ? (
            <WebDAVConnectionForm
              url={formData.url || ''}
              username={formData.username || ''}
              password={formData.password || ''}
              connecting={connecting}
              error={error}
              isPasswordFromStorage={isPasswordFromStorage}
              onUrlChange={value => handleFormUpdate('url', value)}
              onUsernameChange={value => handleFormUpdate('username', value)}
              onPasswordChange={value => {
                handleFormUpdate('password', value);
                // 当密码被清空时，标记为不再来自存储
                if (value === '') {
                  handleFormUpdate('isPasswordFromStorage', false);
                }
              }}
              onSubmit={handleSubmit}
            />
          ) : storageType === 'ssh' ? (
            <SSHConnectionForm
              config={{
                type: 'ssh',
                url: formData.url || '',
                username: formData.username || '',
                password: formData.password || '',
                port: formData.port || 22,
                privateKeyPath: formData.privateKeyPath || '~/.ssh/id_rsa',
                passphrase: formData.passphrase || '',
                rootPath: formData.rootPath || '/',
              }}
              onChange={config => {
                const updates: Record<string, any> = {};
                if (config.url !== undefined) updates.url = config.url;
                if (config.username !== undefined) updates.username = config.username;
                if (config.password !== undefined) {
                  updates.password = config.password;
                  // 当密码被清空时，标记为不再来自存储
                  if (config.password === '') {
                    updates.isPasswordFromStorage = false;
                  }
                }
                if (config.port !== undefined) updates.port = config.port;
                if (config.privateKeyPath !== undefined)
                  updates.privateKeyPath = config.privateKeyPath;
                if (config.passphrase !== undefined) updates.passphrase = config.passphrase;
                if (config.rootPath !== undefined) updates.rootPath = config.rootPath;
                onFormDataChange(updates);
              }}
              connecting={connecting}
              error={error}
              onConnect={handleSubmit}
              isPasswordFromStorage={isPasswordFromStorage}
            />
          ) : storageType === 'smb' ? (
            <SMBConnectionForm
              config={{
                type: 'smb',
                url: formData.url || '',
                username: formData.username || '',
                password: formData.password || '',
                share: formData.share || '',
                domain: formData.domain || '',
              }}
              onChange={config => {
                const updates: Record<string, any> = {};
                if (config.url !== undefined) updates.url = config.url;
                if (config.username !== undefined) updates.username = config.username;
                if (config.password !== undefined) {
                  updates.password = config.password;
                  // 当密码被清空时，标记为不再来自存储
                  if (config.password === '') {
                    updates.isPasswordFromStorage = false;
                  }
                }
                if (config.share !== undefined) updates.share = config.share;
                if (config.domain !== undefined) updates.domain = config.domain;
                onFormDataChange(updates);
              }}
              connecting={connecting}
              error={error}
              onConnect={handleSubmit}
              isPasswordFromStorage={isPasswordFromStorage}
            />
          ) : storageType === 'local' ? (
            <LocalConnectionForm
              defaultPath={formData.rootPath || ''}
              connecting={connecting}
              error={error}
              onConnect={(rootPath: string) => {
                handleFormUpdate('rootPath', rootPath);
                handleSubmit();
              }}
            />
          ) : storageType === 'oss' ? (
            <OSSConnectionForm
              selectedConnection={selectedStoredConnection}
              connecting={connecting}
              error={error}
              onConnect={async (config: ConnectionConfig) => {
                // 更新formData以保存配置
                onFormDataChange({
                  endpoint: config.endpoint,
                  bucket: config.bucket,
                  region: config.region,
                  platform: config.platform,
                });
                // 触发连接
                handleSubmit();
              }}
            />
          ) : storageType === 'huggingface' ? (
            <HuggingFaceConnectionForm
              selectedConnection={selectedStoredConnection}
              isConnecting={connecting}
              onConnect={async (config: ConnectionConfig) => {
                // 更新formData以保存配置
                onFormDataChange({
                  apiToken: config.apiToken,
                  organization: config.organization,
                });
                // 触发连接
                handleSubmit();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

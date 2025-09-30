import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredConnection } from '../../services/connectionStorage';
import type { StorageClientType } from '../../services/storage/types';
import { StorageTypeSelector } from '../StorageTypeSelector';
import { ConnectionSelector } from './ConnectionSelector';
import {
  HuggingFaceConnectionForm,
  LocalConnectionForm,
  OSSConnectionForm,
  SMBConnectionForm,
  SSHConnectionForm,
  WebDAVConnectionForm,
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
              config={{
                url: formData.url || '',
                username: formData.username || '',
                password: formData.password || '',
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
                onFormDataChange(updates);
              }}
              connecting={connecting}
              error={error}
              isPasswordFromStorage={isPasswordFromStorage}
              onConnect={onConnect}
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
              config={{
                rootPath: formData.rootPath || '',
              }}
              onChange={(config: { rootPath?: string }) => {
                onFormDataChange(config);
              }}
              connecting={connecting}
              error={error}
              onConnect={onConnect}
            />
          ) : storageType === 'oss' ? (
            <OSSConnectionForm
              config={{
                endpoint: formData.endpoint || '',
                accessKey: formData.accessKey || '',
                secretKey: formData.secretKey || '',
                bucket: formData.bucket || '',
                region: formData.region || '',
                platform: formData.platform || 'aliyun',
              }}
              onChange={(config: any) => {
                const updates: Record<string, any> = {};
                if (config.endpoint !== undefined) updates.endpoint = config.endpoint;
                if (config.accessKey !== undefined) updates.accessKey = config.accessKey;
                if (config.secretKey !== undefined) {
                  updates.secretKey = config.secretKey;
                  // 当密钥被清空时，标记为不再来自存储
                  if (config.secretKey === '') {
                    updates.isPasswordFromStorage = false;
                  }
                }
                if (config.bucket !== undefined) updates.bucket = config.bucket;
                if (config.region !== undefined) updates.region = config.region;
                if (config.platform !== undefined) updates.platform = config.platform;
                // 如果 config 中包含 isPasswordFromStorage，则传递它
                if (config.isPasswordFromStorage !== undefined) {
                  updates.isPasswordFromStorage = config.isPasswordFromStorage;
                }
                onFormDataChange(updates);
              }}
              connecting={connecting}
              error={error}
              isPasswordFromStorage={isPasswordFromStorage}
              onConnect={onConnect}
            />
          ) : storageType === 'huggingface' ? (
            <HuggingFaceConnectionForm
              config={{
                apiToken: formData.apiToken || '',
                organization: formData.organization || '',
              }}
              onChange={config => {
                const updates: Record<string, any> = {};
                if (config.apiToken !== undefined) {
                  updates.apiToken = config.apiToken;
                  // 当API token被清空时，标记为不再来自存储
                  if (config.apiToken === '') {
                    updates.isPasswordFromStorage = false;
                  }
                }
                if (config.organization !== undefined) updates.organization = config.organization;
                onFormDataChange(updates);
              }}
              connecting={connecting}
              error={error}
              isPasswordFromStorage={isPasswordFromStorage}
              onConnect={onConnect}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

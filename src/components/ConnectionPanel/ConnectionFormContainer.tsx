import React from 'react';
import { useTranslation } from 'react-i18next';
import { StorageClientType, ConnectionConfig } from '../../services/storage/types';
import { StoredConnection } from '../../services/connectionStorage';
import { ConnectionSelector } from './ConnectionSelector';
import { StorageTypeSelector } from '../StorageTypeSelector';
import { LocalConnectionForm } from './LocalConnectionForm';
import { OSSConnectionForm } from './OSSConnectionForm';
import { WebDAVConnectionForm } from './WebDAVConnectionForm';
import { HuggingFaceConnectionForm } from './HuggingFaceConnectionForm';
import { SMBConnectionForm } from './SMBConnectionForm';

interface ConnectionFormContainerProps {
  storageType: StorageClientType;
  selectedStoredConnection: StoredConnection | null;
  url: string;
  username: string;
  password: string;
  connecting: boolean;
  error: string;
  isPasswordFromStorage: boolean;
  defaultLocalPath: string;
  smbShare: string;
  smbDomain: string;
  onStorageTypeChange: (type: StorageClientType) => void;
  onStoredConnectionSelect: (connection: StoredConnection) => void;
  onWebDAVConnect: (e: React.FormEvent) => void;
  onSMBConnect: (config: ConnectionConfig) => Promise<void>;
  onLocalConnect: (rootPath: string) => void;
  onOSSConnect: (config: ConnectionConfig) => Promise<void>;
  onHuggingFaceConnect: (config: ConnectionConfig) => Promise<void>;
  onUrlChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordFocus: () => void;
  onSmbShareChange: (value: string) => void;
  onSmbDomainChange: (value: string) => void;
}

export const ConnectionFormContainer: React.FC<ConnectionFormContainerProps> = ({
  storageType,
  selectedStoredConnection,
  url,
  username,
  password,
  connecting,
  error,
  isPasswordFromStorage,
  defaultLocalPath,
  smbShare,
  smbDomain,
  onStorageTypeChange,
  onStoredConnectionSelect,
  onWebDAVConnect,
  onSMBConnect,
  onLocalConnect,
  onOSSConnect,
  onHuggingFaceConnect,
  onUrlChange,
  onUsernameChange,
  onPasswordChange,
  onPasswordFocus,
  onSmbShareChange,
  onSmbDomainChange,
}) => {
  const { t } = useTranslation();

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
              onSelect={onStoredConnectionSelect}
              selectedConnection={selectedStoredConnection}
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
              url={url}
              username={username}
              password={password}
              connecting={connecting}
              error={error}
              isPasswordFromStorage={isPasswordFromStorage}
              onUrlChange={onUrlChange}
              onUsernameChange={onUsernameChange}
              onPasswordChange={onPasswordChange}
              onPasswordFocus={onPasswordFocus}
              onSubmit={onWebDAVConnect}
            />
          ) : storageType === 'smb' ? (
            <SMBConnectionForm
              config={{
                type: 'smb',
                url,
                username,
                password,
                share: smbShare,
                domain: smbDomain,
              }}
              onChange={(config) => {
                if (config.url !== undefined) onUrlChange(config.url);
                if (config.username !== undefined) onUsernameChange(config.username);
                if (config.password !== undefined) onPasswordChange(config.password);
                if (config.share !== undefined) onSmbShareChange(config.share);
                if (config.domain !== undefined) onSmbDomainChange(config.domain);
              }}
              connecting={connecting}
              error={error}
              onConnect={() => {
                // Create config and call onSMBConnect
                const config: ConnectionConfig = {
                  type: 'smb',
                  url: url.trim(),
                  username: username.trim(),
                  password: isPasswordFromStorage && selectedStoredConnection?.config.password
                    ? selectedStoredConnection.config.password
                    : password,
                  share: smbShare.trim(),
                  domain: smbDomain.trim() || undefined,
                  name: selectedStoredConnection
                    ? selectedStoredConnection.name
                    : `SMB (${url.trim()}/${smbShare.trim()})`,
                };
                onSMBConnect(config);
              }}
              isPasswordFromStorage={isPasswordFromStorage}
              onPasswordFocus={onPasswordFocus}
            />
          ) : storageType === 'local' ? (
            <LocalConnectionForm
              onConnect={onLocalConnect}
              connecting={connecting}
              error={error}
              defaultPath={
                selectedStoredConnection?.config.type === 'local'
                  ? selectedStoredConnection.config.rootPath || ''
                  : defaultLocalPath
              }
            />
          ) : storageType === 'oss' ? (
            <OSSConnectionForm
              onConnect={onOSSConnect}
              connecting={connecting}
              error={error}
              selectedConnection={selectedStoredConnection}
            />
          ) : storageType === 'huggingface' ? (
            <HuggingFaceConnectionForm
              onConnect={onHuggingFaceConnect}
              isConnecting={connecting}
              selectedConnection={selectedStoredConnection}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

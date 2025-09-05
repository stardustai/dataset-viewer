import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import type { ConnectionConfig } from '../../../services/storage/types';
import { ConnectButton, ErrorDisplay } from '../common';

interface SMBConnectionFormProps {
  config: Partial<ConnectionConfig>;
  onChange: (config: Partial<ConnectionConfig>) => void;
  connecting: boolean;
  error?: string;
  onConnect: () => void;
  isPasswordFromStorage?: boolean;
  onPasswordFocus?: () => void;
  showAdvancedOptions?: boolean;
}

export const SMBConnectionForm: React.FC<SMBConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
  isPasswordFromStorage,
  onPasswordFocus,
  showAdvancedOptions,
}) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  // 提取 SMB 特定配置
  const server = config.url || '';
  const username = config.username || '';
  const password = config.password || '';
  const share = config.share || '';
  const domain = config.domain || '';

  const handleServerChange = (value: string) => {
    onChange({
      ...config,
      url: value,
    });
  };

  const handleUsernameChange = (value: string) => {
    onChange({
      ...config,
      username: value,
    });
  };

  const handlePasswordChange = (value: string) => {
    onChange({
      ...config,
      password: value,
    });
  };

  const handleShareChange = (value: string) => {
    onChange({
      ...config,
      share: value,
    });
  };

  const handleDomainChange = (value: string) => {
    onChange({
      ...config,
      domain: value,
    });
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onConnect();
      }}
      className="space-y-4"
    >
      {/* SMB服务器和共享名称 - 在同一行 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label
            htmlFor="smb-server"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('smb.server')}
          </label>
          <input
            id="smb-server"
            type="text"
            value={server}
            onChange={e => handleServerChange(e.target.value)}
            placeholder={t('smb.server.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
            required
          />
        </div>
        <div>
          <label
            htmlFor="smb-share"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('smb.share')}
          </label>
          <input
            id="smb-share"
            type="text"
            value={share}
            onChange={e => handleShareChange(e.target.value)}
            placeholder={t('smb.share.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
            required
          />
        </div>
      </div>

      {/* 用户名 */}
      <div>
        <label
          htmlFor="smb-username"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('username')}
        </label>
        <input
          id="smb-username"
          type="text"
          value={username}
          onChange={e => handleUsernameChange(e.target.value)}
          placeholder={t('username.placeholder')}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          disabled={connecting}
          required
        />
      </div>

      {/* 密码 */}
      <div>
        <label
          htmlFor="smb-password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('password')}
        </label>
        <div className="mt-1 relative">
          <input
            id="smb-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => handlePasswordChange(e.target.value)}
            onFocus={onPasswordFocus}
            placeholder={isPasswordFromStorage ? t('password.saved') : t('password.placeholder')}
            className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 pr-10 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
            required
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5 text-gray-400" />
            ) : (
              <Eye className="h-5 w-5 text-gray-400" />
            )}
          </button>
        </div>
        {isPasswordFromStorage && (
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{t('password.click.new')}</p>
        )}
      </div>

      {/* 高级选项 */}
      {showAdvancedOptions && (
        <div>
          <label
            htmlFor="smb-domain"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('smb.domain')} {t('optional')}
          </label>
          <input
            id="smb-domain"
            type="text"
            value={domain}
            onChange={e => handleDomainChange(e.target.value)}
            placeholder={t('smb.domain.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('smb.domain.description')}
          </p>
        </div>
      )}

      {/* 错误消息 */}
      <ErrorDisplay error={error || ''} />

      {/* 连接按钮 */}
      <ConnectButton connecting={connecting} />
    </form>
  );
};

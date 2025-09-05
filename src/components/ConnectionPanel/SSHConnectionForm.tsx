import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { ConnectionConfig } from '../../services/storage/types';

interface SSHConnectionFormProps {
  config: Partial<ConnectionConfig>;
  onChange: (config: Partial<ConnectionConfig>) => void;
  connecting: boolean;
  error?: string;
  onConnect: () => void;
  isPasswordFromStorage?: boolean;
  onPasswordFocus?: () => void;
}

export const SSHConnectionForm: React.FC<SSHConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
  isPasswordFromStorage,
  onPasswordFocus,
}) => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  // 提取 SSH 特定配置
  const server = config.url || '';
  const username = config.username || '';
  const password = config.password || '';
  const port = config.port || 22;
  const privateKeyPath = config.privateKeyPath || '';
  const passphrase = config.passphrase || '';
  const remotePath = config.rootPath || '/';

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

  const handlePortChange = (value: string) => {
    const portNum = parseInt(value, 10);
    onChange({
      ...config,
      port: isNaN(portNum) ? 22 : portNum,
    });
  };

  const handlePrivateKeyPathChange = (value: string) => {
    onChange({
      ...config,
      privateKeyPath: value,
    });
  };

  const handlePassphraseChange = (value: string) => {
    onChange({
      ...config,
      passphrase: value,
    });
  };

  const handleRemotePathChange = (value: string) => {
    onChange({
      ...config,
      rootPath: value,
    });
  };

  // SSH 连接可以使用密码或私钥，所以至少需要其中一个
  const hasAuth = password || privateKeyPath;
  const isFormValid = server && username && hasAuth && remotePath;

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (isFormValid) {
          onConnect();
        }
      }}
      className="space-y-4"
    >
      {/* 服务器地址 */}
      <div>
        <label
          htmlFor="ssh-server"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('ssh.server')}
        </label>
        <input
          id="ssh-server"
          type="text"
          value={server}
          onChange={e => handleServerChange(e.target.value)}
          placeholder={t('ssh.server.placeholder')}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          disabled={connecting}
          required
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('ssh.server.description')}
        </p>
      </div>

      {/* 端口和用户名 - 放在一行 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="ssh-port"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('ssh.port')}
          </label>
          <input
            id="ssh-port"
            type="number"
            value={port}
            onChange={e => handlePortChange(e.target.value)}
            placeholder={t('ssh.port.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
            min="1"
            max="65535"
          />
        </div>
        <div className="col-span-2">
          <label
            htmlFor="ssh-username"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('ssh.username')}
          </label>
          <input
            id="ssh-username"
            type="text"
            value={username}
            onChange={e => handleUsernameChange(e.target.value)}
            placeholder={t('ssh.username.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
            required
          />
        </div>
      </div>

      {/* 认证方式选择 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">认证方式</h3>

        {/* 私钥文件 */}
        <div>
          <label
            htmlFor="ssh-private-key"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            {t('ssh.private.key')} {t('optional')}
          </label>
          <input
            id="ssh-private-key"
            type="text"
            value={privateKeyPath}
            onChange={e => handlePrivateKeyPathChange(e.target.value)}
            placeholder={t('ssh.private.key.placeholder')}
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={connecting}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('ssh.private.key.description')}
          </p>
        </div>

        {/* 私钥密码 */}
        {privateKeyPath && (
          <div>
            <label
              htmlFor="ssh-passphrase"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('ssh.passphrase')} {t('optional')}
            </label>
            <div className="mt-1 relative">
              <input
                id="ssh-passphrase"
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={e => handlePassphraseChange(e.target.value)}
                placeholder={t('ssh.passphrase.placeholder')}
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 pr-10 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={connecting}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassphrase(!showPassphrase)}
              >
                {showPassphrase ? (
                  <EyeOff className="h-5 w-5 text-gray-400" />
                ) : (
                  <Eye className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('ssh.passphrase.description')}
            </p>
          </div>
        )}

        {/* 密码认证 */}
        {!privateKeyPath && (
          <div>
            <label
              htmlFor="ssh-password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('ssh.password')}
            </label>
            <div className="mt-1 relative">
              <input
                id="ssh-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => handlePasswordChange(e.target.value)}
                onFocus={onPasswordFocus}
                placeholder={
                  isPasswordFromStorage ? t('password.saved') : t('ssh.password.placeholder')
                }
                className="block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 pr-10 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={connecting}
                required={!privateKeyPath}
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
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                {t('password.click.new')}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('ssh.password.description')}
            </p>
          </div>
        )}
      </div>

      {/* 远程路径 */}
      <div>
        <label
          htmlFor="ssh-path"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('ssh.path')}
        </label>
        <input
          id="ssh-path"
          type="text"
          value={remotePath}
          onChange={e => handleRemotePathChange(e.target.value)}
          placeholder={t('ssh.path.placeholder')}
          className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          disabled={connecting}
          required
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('ssh.path.description')}</p>
      </div>

      {/* 错误消息 */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div className="text-sm text-red-700 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* 连接按钮 */}
      <button
        type="submit"
        disabled={connecting || !isFormValid}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                 text-white font-medium py-2 px-4 rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                 disabled:cursor-not-allowed"
      >
        {connecting ? (
          <div className="flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-white mr-2" />
            {t('connecting')}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <Terminal className="w-4 h-4 mr-2" />
            {t('connect')}
          </div>
        )}
      </button>
    </form>
  );
};

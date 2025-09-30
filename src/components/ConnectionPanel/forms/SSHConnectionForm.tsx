import { FolderSearch } from 'lucide-react';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { commands } from '../../../types/tauri-commands';
import { PasswordInput } from '../../common';
import { ConnectButton, ErrorDisplay } from '../common';
import type { UnifiedConnectionFormProps } from './types';

interface SSHConnectionFormProps extends UnifiedConnectionFormProps {
  config: {
    type?: string;
    url?: string;
    username?: string;
    password?: string;
    port?: number;
    privateKeyPath?: string;
    passphrase?: string;
    rootPath?: string;
  };
}

export const SSHConnectionForm: FC<SSHConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
  isPasswordFromStorage,
}) => {
  const { t } = useTranslation();
  const [authMode, setAuthMode] = useState<'password' | 'privateKey'>('password');

  // 提取 SSH 特定配置
  const server = config.url || '';
  const username = config.username || '';
  const password = config.password || '';
  const port = config.port || 22;
  const privateKeyPath = config.privateKeyPath || '~/.ssh/id_rsa';
  const remotePath = config.rootPath || '/';

  // 根据现有配置自动选择认证方式
  // 初始化认证模式，只在组件初始化时执行
  useEffect(() => {
    // 如果配置中有私钥路径且没有密码，默认使用私钥认证
    if (privateKeyPath && !password) {
      setAuthMode('privateKey');
    } else if (!privateKeyPath && password) {
      // 如果有密码但没有私钥路径，使用密码认证
      setAuthMode('password');
    }
    // 如果都有或都没有，保持当前模式不变
  }, []); // 空依赖数组，只在初始化时执行

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
    // 通过 onChange 更新配置
    onChange({
      ...config,
      password: value,
    });

    // 如果密码为空且之前是从存储来的，需要额外处理
    // 这通常发生在用户点击存储的密码输入框时
    // PasswordInput 组件会自动调用 onChange('') 来清空密码
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

  const handleRemotePathChange = (value: string) => {
    onChange({
      ...config,
      rootPath: value,
    });
  };

  const handleSelectPrivateKeyFile = async () => {
    try {
      // 使用 Tauri 的对话框 API 选择私钥文件
      const result = await commands.systemSelectFile(t('ssh.select.private.key'));
      if (result.status === 'ok' && result.data) {
        handlePrivateKeyPathChange(result.data);
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error);
    }
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onConnect();
      }}
      className="space-y-4"
    >
      {/* SSH 服务器和端口 - 在同一行 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
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
        </div>
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
      </div>

      {/* SSH 用户名和远程路径 - 在同一行 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
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
        <div className="col-span-2">
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
        </div>
      </div>

      {/* 认证方式 - 统一区域 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('ssh.authentication')}
          </label>
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password');
                // 切换到密码认证时清除私钥相关字段
                onChange({
                  ...config,
                  privateKeyPath: '',
                });
              }}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                authMode === 'password'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {t('ssh.password')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('privateKey');
                // 切换到私钥认证时清除密码字段
                onChange({
                  ...config,
                  password: '',
                });
              }}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                authMode === 'privateKey'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {t('ssh.private.key')}
            </button>
          </div>
        </div>

        {authMode === 'password' ? (
          /* 密码认证 */
          <div className="mt-1">
            <PasswordInput
              id="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder={t('ssh.password.placeholder')}
              isFromStorage={isPasswordFromStorage}
            />
          </div>
        ) : (
          /* 私钥认证 */
          <div className="flex space-x-2">
            <input
              id="ssh-private-key"
              type="text"
              value={privateKeyPath}
              onChange={e => handlePrivateKeyPathChange(e.target.value)}
              placeholder={t('ssh.private.key.placeholder')}
              className="flex-1 mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              disabled={connecting}
              required
            />
            <button
              type="button"
              onClick={handleSelectPrivateKeyFile}
              className="mt-1 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              title={t('ssh.select.private.key')}
              disabled={connecting}
            >
              <FolderSearch className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 错误消息 */}
      <ErrorDisplay error={error || ''} />

      {/* 连接按钮 */}
      <ConnectButton connecting={connecting} />
    </form>
  );
};

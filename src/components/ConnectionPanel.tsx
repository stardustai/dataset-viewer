import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, User, Lock } from 'lucide-react';
import { webdavService } from '../services/webdav';
import { DemoServerList } from './DemoServerList';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { ConnectionSelector } from './ConnectionSelector';
import { StoredConnection } from '../services/connectionStorage';

interface ConnectionPanelProps {
  onConnect: () => void;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ onConnect }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [selectedStoredConnection, setSelectedStoredConnection] = useState<StoredConnection | null>(null);
  const [isPasswordFromStorage, setIsPasswordFromStorage] = useState(false); // 密码是否来自存储

  useEffect(() => {
    // 检查用户是否主动断开了连接
    const wasDisconnected = localStorage.getItem('userDisconnected') === 'true';

    // 只有在用户没有主动断开连接的情况下才自动加载默认连接
    if (!wasDisconnected) {
      const defaultConnection = webdavService.getDefaultConnection();
      if (defaultConnection) {
        handleSelectStoredConnection(defaultConnection);
      }
    }

    // 清除断开连接标记，因为用户现在在连接页面
    localStorage.removeItem('userDisconnected');
  }, []);

  const handleSelectStoredConnection = (connection: StoredConnection) => {
    setUrl(connection.url);
    setUsername(connection.username);
    if (connection.password) {
      setPassword('••••••••'); // 显示占位符而不是真实密码
      setIsPasswordFromStorage(true);
    } else {
      setPassword('');
      setIsPasswordFromStorage(false);
    }
    setSelectedStoredConnection(connection);
    setError(''); // 清除之前的错误
  };

  const handleDemoSelect = (demoUrl: string, demoUsername: string, demoPassword: string) => {
    setUrl(demoUrl);
    setUsername(demoUsername);
    setPassword(demoPassword);
    setIsPasswordFromStorage(false); // demo密码可以编辑
    setSelectedStoredConnection(null);
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setError('');

    try {
      // 生成连接名称（如果是新连接）
      const connectionName = selectedStoredConnection ?
        selectedStoredConnection.name :
        `${username}@${new URL(url).hostname}`;

      // 如果密码来自存储，使用存储的真实密码；否则使用输入的密码
      const actualPassword = isPasswordFromStorage && selectedStoredConnection?.password
        ? selectedStoredConnection.password
        : password;

      // 默认保存连接，但不保存密码
      const success = await webdavService.connect(url, username, actualPassword, true, connectionName, false);
      if (success) {
        // 如果是从存储的连接连接成功，设置为默认连接
        if (selectedStoredConnection) {
          webdavService.setDefaultConnection(selectedStoredConnection.id);
        }
        onConnect();
      } else {
        setError(t('error.credentials'));
      }
    } catch (err) {
      setError(t('error.connection.failed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* 语言切换器和主题切换器 - 右上角 */}
      <div className="absolute top-4 right-4 flex items-center space-x-3">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center lg:items-start">
        {/* 左侧 - 连接表单 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 w-full max-w-md lg:max-w-lg">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
              <Server className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('webdav.browser')}</h1>
            <p className="text-gray-600 dark:text-gray-300">{t('connect.server')}</p>
          </div>

          <form onSubmit={handleConnect} className="space-y-6">
            {/* 存储的连接选择器 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('saved.connections')}
              </label>
              <ConnectionSelector
                onSelect={handleSelectStoredConnection}
                selectedConnection={selectedStoredConnection}
              />
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">{t('or.new.connection')}</span>
              </div>
            </div>

            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('server.url')}
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setSelectedStoredConnection(null); // 清除选中的连接
                  if (isPasswordFromStorage) {
                    setPassword(''); // 如果之前是存储的密码，清除它
                    setIsPasswordFromStorage(false);
                  }
                }}
                placeholder={t('server.url.placeholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('username')}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSelectedStoredConnection(null); // 清除选中的连接
                    if (isPasswordFromStorage) {
                      setPassword(''); // 如果之前是存储的密码，清除它
                      setIsPasswordFromStorage(false);
                    }
                  }}
                  placeholder={t('username.placeholder')}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('password')}
                {isPasswordFromStorage && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(使用已保存的密码)</span>
                )}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    if (!isPasswordFromStorage) {
                      setPassword(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (isPasswordFromStorage) {
                      // 如果点击已保存的密码字段，清除并允许输入新密码
                      setPassword('');
                      setIsPasswordFromStorage(false);
                    }
                  }}
                  placeholder={isPasswordFromStorage ? '点击输入新密码' : t('password.placeholder')}
                  className={`w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    isPasswordFromStorage
                      ? 'bg-gray-50 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  } placeholder-gray-500 dark:placeholder-gray-400`}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={connecting}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {connecting ? t('connecting') : t('connect')}
            </button>
          </form>
        </div>

        {/* 右侧 - 快速开始和演示 */}
        <div className="w-full max-w-md lg:max-w-lg">
          <DemoServerList onSelectDemo={handleDemoSelect} />
        </div>
      </div>
    </div>
  );
};

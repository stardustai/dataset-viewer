import { Lock, User } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

interface WebDAVConnectionFormProps {
  url: string;
  username: string;
  password: string;
  connecting: boolean;
  error: string;
  isPasswordFromStorage: boolean;
  onUrlChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordFocus: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const WebDAVConnectionForm: React.FC<WebDAVConnectionFormProps> = ({
  url,
  username,
  password,
  connecting,
  error,
  isPasswordFromStorage,
  onUrlChange,
  onUsernameChange,
  onPasswordChange,
  onPasswordFocus,
  onSubmit,
}) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="url"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          {t('server.url')}
        </label>
        <input
          id="url"
          type="url"
          value={url}
          onChange={e => onUrlChange(e.target.value)}
          placeholder={t('server.url.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          {t('username')}
        </label>
        <div className="relative">
          <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            id="username"
            type="text"
            value={username}
            onChange={e => onUsernameChange(e.target.value)}
            placeholder={t('username.placeholder')}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            required
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          {t('password')}
          {isPasswordFromStorage && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              ({t('password.saved')})
            </span>
          )}
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => {
              if (!isPasswordFromStorage) {
                onPasswordChange(e.target.value);
              }
            }}
            onFocus={onPasswordFocus}
            placeholder={
              isPasswordFromStorage ? t('password.click.new') : t('password.placeholder')
            }
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
  );
};

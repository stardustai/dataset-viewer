import { User } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '../../common';
import { ConnectButton, ErrorDisplay } from '../common';
import type { UnifiedConnectionFormProps } from './types';

export const WebDAVConnectionForm: React.FC<UnifiedConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  isPasswordFromStorage = false,
  onConnect,
}) => {
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect();
  };

  const handleFieldChange = (field: string, value: string) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          value={config.url || ''}
          onChange={e => handleFieldChange('url', e.target.value)}
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
            value={config.username || ''}
            onChange={e => handleFieldChange('username', e.target.value)}
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
        <PasswordInput
          id="password"
          value={config.password || ''}
          onChange={value => handleFieldChange('password', value)}
          placeholder={t('password.placeholder')}
          isFromStorage={isPasswordFromStorage}
          required
        />
      </div>

      <ErrorDisplay error={error || ''} />

      <ConnectButton connecting={connecting} />
    </form>
  );
};

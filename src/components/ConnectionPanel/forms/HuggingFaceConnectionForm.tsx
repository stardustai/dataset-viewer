import { Bot } from 'lucide-react';
import type { FC, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '../../common';
import { ConnectButton, ErrorDisplay } from '../common';
import type { UnifiedConnectionFormProps } from './types';

interface HuggingFaceConnectionFormProps extends UnifiedConnectionFormProps {
  config: {
    apiToken?: string;
    organization?: string;
  };
}

export const HuggingFaceConnectionForm: FC<HuggingFaceConnectionFormProps> = ({
  config,
  onChange,
  connecting,
  error,
  onConnect,
  isPasswordFromStorage = false,
}) => {
  const { t } = useTranslation();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onConnect();
  };

  const handleFieldChange = (field: string, value: string) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Organization */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <Bot className="inline w-4 h-4 mr-1" />
          {t('huggingface.organization')}
          <span className="text-gray-500 ml-1">{t('optional')}</span>
        </label>
        <input
          type="text"
          value={config.organization || ''}
          onChange={e => handleFieldChange('organization', e.target.value)}
          placeholder={t('huggingface.organization.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('huggingface.organization.help')}
        </p>
      </div>

      {/* API Token */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('huggingface.apiToken')}
          <span className="text-gray-500 ml-1">{t('optional')}</span>
          {isPasswordFromStorage && (
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              ({t('password.saved')})
            </span>
          )}
        </label>
        <PasswordInput
          id="apiToken"
          value={config.apiToken || ''}
          onChange={value => handleFieldChange('apiToken', value)}
          placeholder={t('huggingface.apiToken.placeholder')}
          isFromStorage={isPasswordFromStorage}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('huggingface.apiToken.help')}
        </p>
      </div>

      <ErrorDisplay error={error || ''} />

      {/* 连接按钮 */}
      <ConnectButton connecting={connecting} />

      {/* 帮助信息 */}
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
        <p>{t('huggingface.help.token.title')}</p>
        <p>
          1. {t('huggingface.help.token.step1')}
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline mx-1"
          >
            huggingface.co/settings/tokens
          </a>
        </p>
        <p>2. {t('huggingface.help.token.step2')}</p>
        <p>3. {t('huggingface.help.token.step3')}</p>
      </div>
    </form>
  );
};

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Bot, Loader2 } from 'lucide-react';
import { ConnectionConfig } from '../../services/storage/types';
import { StoredConnection } from '../../services/connectionStorage';

interface HuggingFaceConnectionFormProps {
  onConnect: (config: ConnectionConfig) => Promise<void>;
  isConnecting: boolean;
  selectedConnection?: StoredConnection | null;
}

export const HuggingFaceConnectionForm: React.FC<HuggingFaceConnectionFormProps> = ({
  onConnect,
  isConnecting,
  selectedConnection,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    apiToken: '',
    organization: '',
  });

  // 当选中连接变化时，更新表单
  useEffect(() => {
    if (selectedConnection && selectedConnection.url.startsWith('huggingface://')) {
      // 从 metadata 获取信息
      const organization = selectedConnection.metadata?.organization || '';
      const apiToken = selectedConnection.metadata?.apiToken || '';

      setFormData({
        organization: organization,
        apiToken: apiToken ? '••••••••' : '', // 显示占位符表示已保存的 token
      });
    } else if (!selectedConnection) {
      // 清空表单
      setFormData({
        apiToken: '',
        organization: '',
      });
    }
  }, [selectedConnection]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 如果 API token 是占位符且有选中的连接，使用真实的 token
    const actualApiToken =
      formData.apiToken === '••••••••' && selectedConnection
        ? selectedConnection.metadata?.apiToken || ''
        : formData.apiToken;

    // 检查组织名是否发生变化
    const originalOrg = selectedConnection?.metadata?.organization || '';
    const currentOrg = formData.organization || '';
    const orgChanged = originalOrg !== currentOrg;

    const config: ConnectionConfig = {
      type: 'huggingface',
      apiToken: actualApiToken || undefined,
      organization: formData.organization || undefined,
      url: 'https://huggingface.co', // 固定URL
      name: orgChanged ? undefined : selectedConnection?.name, // 如果组织名变化，清除名称让系统重新生成
    };

    await onConnect(config);
  };

  const handleInputChange =
    (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData(prev => ({
        ...prev,
        [field]: e.target.value.trim(),
      }));
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
          value={formData.organization}
          onChange={handleInputChange('organization')}
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
          <Lock className="inline w-4 h-4 mr-1" />
          {t('huggingface.apiToken')}
          <span className="text-gray-500 ml-1">{t('optional')}</span>
        </label>
        <input
          type="password"
          value={formData.apiToken}
          onChange={handleInputChange('apiToken')}
          placeholder={t('huggingface.apiToken.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('huggingface.apiToken.help')}
        </p>
      </div>

      {/* 连接按钮 */}
      <button
        type="submit"
        disabled={isConnecting}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400
                 text-white font-medium py-2 px-4 rounded-md transition-colors
                 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                 disabled:cursor-not-allowed"
      >
        {isConnecting ? (
          <div className="flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-white mr-2" />
            {t('connecting')}
          </div>
        ) : (
          t('connect')
        )}
      </button>

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

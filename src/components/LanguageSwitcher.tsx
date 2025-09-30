import { Globe } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { settingsStorage } from '../services/settingsStorage';

export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
    // 保存语言设置到持久化存储
    settingsStorage.updateSetting('language', newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center space-x-2 p-2 sm:px-3 sm:py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
      title={t('language')}
    >
      <Globe className="w-4 h-4" />
      <span className="hidden lg:inline">{i18n.language === 'zh' ? 'English' : '中文'}</span>
    </button>
  );
};

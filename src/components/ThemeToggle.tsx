import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const themes = [
    { key: 'light' as const, icon: Sun, label: t('theme.light') },
    { key: 'dark' as const, icon: Moon, label: t('theme.dark') },
    { key: 'system' as const, icon: Monitor, label: t('theme.system') },
  ];

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      {themes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          className={`
            flex items-center space-x-1 px-3 py-1.5 rounded-md transition-all duration-200
            ${theme === key
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }
          `}
          title={label}
        >
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
};

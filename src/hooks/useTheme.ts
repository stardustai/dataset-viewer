import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { settingsStorage } from '../services/settingsStorage';

type Theme = 'light' | 'dark' | 'system';

// 获取初始主题状态（避免闪烁）
const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system';
  return settingsStorage.getSetting('theme');
};

// 获取初始暗色状态
const getInitialDarkState = (): boolean => {
  if (typeof window === 'undefined') return false;

  const theme = getInitialTheme();

  if (theme === 'dark') return true;
  if (theme === 'light') return false;

  // 只有在系统模式下才检测系统主题
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return systemPrefersDark;
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isDark, setIsDark] = useState(getInitialDarkState);

  useEffect(() => {
    const root = window.document.documentElement;

    // 应用主题到DOM的通用函数
    const applyThemeToDOM = (shouldBeDark: boolean) => {
      if (shouldBeDark) {
        root.classList.add('dark');
        if (settingsStorage.getSetting('usePureBlackBg')) {
          root.classList.add('pure-black-bg');
        } else {
          root.classList.remove('pure-black-bg');
        }
      } else {
        root.classList.remove('dark');
        root.classList.remove('pure-black-bg');
      }
    };

    // 计算应该使用的主题状态
    let shouldBeDark = false;
    if (theme === 'dark') {
      shouldBeDark = true;
    } else if (theme === 'light') {
      shouldBeDark = false;
    } else {
      // 系统模式
      shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // 立即同步更新状态和DOM
    setIsDark(shouldBeDark);
    applyThemeToDOM(shouldBeDark);

    // 异步同步窗口主题
    invoke('set_window_theme', { theme }).catch(error => {
      console.warn('Failed to sync window theme:', error);
    });

    // 只在系统模式下监听系统主题变化
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemThemeChange = () => {
        const newSystemDark = mediaQuery.matches;
        setIsDark(newSystemDark);
        applyThemeToDOM(newSystemDark);
      };

      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }
  }, [theme]);

  const setAndStoreTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    settingsStorage.updateSetting('theme', newTheme);
  };

  return {
    theme,
    setTheme: setAndStoreTheme,
    isDark,
  };
};

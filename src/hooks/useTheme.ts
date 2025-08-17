import { useState, useEffect } from 'react';
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
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemPrefersDark;
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isDark, setIsDark] = useState(getInitialDarkState);

  useEffect(() => {
    const root = window.document.documentElement;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const updateTheme = () => {
      let shouldBeDark = false;

      if (theme === 'dark') {
        shouldBeDark = true;
      } else if (theme === 'light') {
        shouldBeDark = false;
      } else {
        shouldBeDark = systemPrefersDark;
      }

      setIsDark(shouldBeDark);

      // 添加平滑过渡
      root.style.transition = 'background-color 0.2s ease-in-out';

      if (shouldBeDark) {
        root.classList.add('dark');
        // 添加纯黑色背景类名
        if (settingsStorage.getSetting('usePureBlackBg')) {
          root.classList.add('pure-black-bg');
        } else {
          root.classList.remove('pure-black-bg');
        }
      } else {
        root.classList.remove('dark');
        root.classList.remove('pure-black-bg');
      }

      // 清除过渡效果以避免影响其他动画
      setTimeout(() => {
        root.style.transition = '';
      }, 200);
    };

    // 立即更新主题，避免延迟
    updateTheme();

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
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

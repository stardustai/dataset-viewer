import { useState, useEffect, useCallback } from 'react';

const SYNTAX_HIGHLIGHTING_KEY = 'dataset-viewer-syntax-highlighting';

/**
 * 获取全局语法高亮状态
 */
function isGlobalSyntaxHighlightingEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SYNTAX_HIGHLIGHTING_KEY);
    if (stored === null) {
      return true; // 默认启用
    }
    return stored !== 'false';
  } catch (error) {
    console.error('Failed to load syntax highlighting settings:', error);
    return true; // 出错时默认启用
  }
}

/**
 * 全局启用/禁用语法高亮
 */
function setGlobalSyntaxHighlighting(enabled: boolean): void {
  try {
    localStorage.setItem(SYNTAX_HIGHLIGHTING_KEY, enabled.toString());
    // 触发自定义事件通知所有组件更新
    window.dispatchEvent(new CustomEvent('syntax-highlighting-changed'));
  } catch (error) {
    console.error('Failed to save syntax highlighting settings:', error);
  }
}

/**
 * 自定义hook来管理全局语法高亮状态
 * 这个hook会监听localStorage的变化并自动更新组件
 */
export function useSyntaxHighlighting() {
  const [enabled, setEnabled] = useState(isGlobalSyntaxHighlightingEnabled);

  // 提供切换功能的回调
  const toggleSyntaxHighlighting = useCallback(
    (newEnabled?: boolean) => {
      const targetState = newEnabled !== undefined ? newEnabled : !enabled;
      setGlobalSyntaxHighlighting(targetState);
    },
    [enabled]
  );

  useEffect(() => {
    // 监听storage事件，当其他标签页或组件改变设置时同步更新
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SYNTAX_HIGHLIGHTING_KEY) {
        setEnabled(isGlobalSyntaxHighlightingEnabled());
      }
    };

    // 监听自定义事件，用于同一页面内的设置变化
    const handleSyntaxHighlightingChange = () => {
      setEnabled(isGlobalSyntaxHighlightingEnabled());
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('syntax-highlighting-changed', handleSyntaxHighlightingChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('syntax-highlighting-changed', handleSyntaxHighlightingChange);
    };
  }, []);

  return { enabled, toggleSyntaxHighlighting };
}

// 导出独立的函数供非React组件使用
export { isGlobalSyntaxHighlightingEnabled, setGlobalSyntaxHighlighting };

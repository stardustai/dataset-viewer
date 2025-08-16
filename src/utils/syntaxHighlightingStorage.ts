/**
 * 语法高亮设置存储工具
 */

const SYNTAX_HIGHLIGHTING_KEY = 'dataset-viewer-syntax-highlighting';

export interface SyntaxHighlightingSettings {
  enabled: boolean;
  enabledLanguages: Set<string>;
}

// 默认设置
const defaultSettings: SyntaxHighlightingSettings = {
  enabled: false,
  enabledLanguages: new Set()
};

/**
 * 获取语法高亮设置
 */
export function getSyntaxHighlightingSettings(): SyntaxHighlightingSettings {
  try {
    const stored = localStorage.getItem(SYNTAX_HIGHLIGHTING_KEY);
    if (!stored) {
      return { ...defaultSettings, enabledLanguages: new Set() };
    }

    const parsed = JSON.parse(stored);
    return {
      enabled: Boolean(parsed.enabled),
      enabledLanguages: new Set(parsed.enabledLanguages || [])
    };
  } catch (error) {
    console.error('Failed to load syntax highlighting settings:', error);
    return { ...defaultSettings, enabledLanguages: new Set() };
  }
}

/**
 * 保存语法高亮设置
 */
export function saveSyntaxHighlightingSettings(settings: SyntaxHighlightingSettings): void {
  try {
    const toSave = {
      enabled: settings.enabled,
      enabledLanguages: Array.from(settings.enabledLanguages)
    };
    localStorage.setItem(SYNTAX_HIGHLIGHTING_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save syntax highlighting settings:', error);
  }
}

/**
 * 检查特定语言是否启用了语法高亮
 */
export function isLanguageHighlightingEnabled(language: string): boolean {
  const settings = getSyntaxHighlightingSettings();
  return settings.enabled && settings.enabledLanguages.has(language);
}

/**
 * 为特定语言切换语法高亮
 */
export function toggleLanguageHighlighting(language: string, enabled: boolean): void {
  const settings = getSyntaxHighlightingSettings();

  if (enabled) {
    settings.enabledLanguages.add(language);
  } else {
    settings.enabledLanguages.delete(language);
  }

  // 如果没有任何语言启用，关闭全局开关
  if (settings.enabledLanguages.size === 0) {
    settings.enabled = false;
  } else {
    settings.enabled = true;
  }

  saveSyntaxHighlightingSettings(settings);
}

/**
 * 全局启用/禁用语法高亮
 */
export function setGlobalSyntaxHighlighting(enabled: boolean): void {
  const settings = getSyntaxHighlightingSettings();
  settings.enabled = enabled;

  // 如果全局禁用，清空所有语言设置
  if (!enabled) {
    settings.enabledLanguages.clear();
  }

  saveSyntaxHighlightingSettings(settings);
}

/**
 * 获取全局语法高亮状态
 */
export function isGlobalSyntaxHighlightingEnabled(): boolean {
  const settings = getSyntaxHighlightingSettings();
  return settings.enabled;
}

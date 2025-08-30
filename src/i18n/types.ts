// 导出所有翻译键的类型定义
import { zh } from './locales/zh';

export type TranslationKeys = keyof typeof zh;

// 为了确保中英文翻译键保持一致，可以使用这个工具类型
export type RequiredTranslation<T> = {
  [K in keyof T]: T[K];
};

// 导出语言类型
export type SupportedLanguage = 'zh' | 'en';

// 导出翻译命名空间（如果将来需要）
export interface TranslationNamespaces {
  common: typeof import('./locales/zh/common').common;
  connection: typeof import('./locales/zh/connection').connection;
  fileBrowser: typeof import('./locales/zh/fileBrowser').fileBrowser;
  fileViewer: typeof import('./locales/zh/fileViewer').fileViewer;
  errors: typeof import('./locales/zh/errors').errors;
  settings: typeof import('./locales/zh/settings').settings;
}

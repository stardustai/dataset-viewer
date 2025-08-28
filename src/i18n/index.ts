import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { settingsStorage } from '../services/settingsStorage';
import { en } from './locales/en';
import { zh } from './locales/zh';

const resources = {
  zh: { translation: zh },
  en: { translation: en },
};

// 从设置存储中获取语言偏好
const getInitialLanguage = (): string => {
  try {
    return settingsStorage.getSetting('language');
  } catch (error) {
    console.warn('Failed to get language setting, using default:', error);
    return 'zh';
  }
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhTranslation from './locales/zh.json';
import enTranslation from './locales/en.json';

// 語系翻譯對照表
const resources = {
  zh: {
    translation: zhTranslation
  },
  en: {
    translation: enTranslation
  }
};

const savedLanguage = localStorage.getItem('app_lang') || 'zh';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'zh',
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// 語系翻譯對照表
const resources = {
  zh: {
    translation: {
      nav: {
        borrow: { title: '裝備租借', subtitle: 'Equipments Rental' },
        register: { title: '資料填寫', subtitle: 'Register' },
        payment: { title: '繳費系統', subtitle: 'Payment System' },
        dashboard: { title: '個人主頁', subtitle: 'My Dashboard' },
        history: { title: '歷史紀錄', subtitle: 'Payment History' },
        achievements: { title: '出隊足跡', subtitle: 'Mountaineering Footprint' },
        
        menuDashboard: '👤 個人主頁',
        menuRegister: '📝 資料填寫',
        menuBorrow: '🎒 裝備租借',
        menuPayment: '💳 繳費系統',
        menuHistory: '📜 繳費紀錄',
        menuAchievements: '🏆 出隊足跡',
      }
    }
  },
  en: {
    translation: {
      nav: {
        borrow: { title: 'Equipment Rental', subtitle: 'Equipments Rental' },
        register: { title: 'Registration', subtitle: 'Register' },
        payment: { title: 'Payment System', subtitle: 'Payment System' },
        dashboard: { title: 'My Dashboard', subtitle: 'My Dashboard' },
        history: { title: 'Payment History', subtitle: 'Payment History' },
        achievements: { title: 'Footprints', subtitle: 'Mountaineering Footprint' },

        menuDashboard: '👤 Dashboard',
        menuRegister: '📝 Register',
        menuBorrow: '🎒 Rental',
        menuPayment: '💳 Payment',
        menuHistory: '📜 History',
        menuAchievements: '🏆 Footprint',
      }
    }
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

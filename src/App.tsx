import { useState, useEffect, Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Award, FileText, ClipboardList, CreditCard, User, Compass, Languages, AlertCircle, Calendar, Users, PackageCheck, Layers, BookOpen, History as HistoryIcon } from 'lucide-react';
import { SystemGuideModal } from './components/common/SystemGuideModal';
import liff from '@line/liff';
import { getCache, setCache } from './utils/cacheUtils';
import { LIFF_URLS } from './constants/liff';
import { fetchMemberProfileFromSupabase, checkOfficerStatusFromSupabase, supabase } from './utils/supabaseClient';
import './App.css';

const Borrow = lazy(() => import('./pages/Borrow'));
const Payment = lazy(() => import('./pages/Payment'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const History = lazy(() => import('./pages/History'));
const Achievements = lazy(() => import('./pages/Achievements'));
const AdminEvents = lazy(() => import('./pages/AdminEvents'));
const AdminEventsHistory = lazy(() => import('./pages/AdminEventsHistory'));
const ConfirmPayment = lazy(() => import('./pages/ConfirmPayment'));
const AdminMembers = lazy(() => import('./pages/AdminMembers'));
const MemberDetailEdit = lazy(() => import('./pages/MemberDetailEdit'));
const MemberRecords = lazy(() => import('./pages/MemberRecords'));
const AdminFinance = lazy(() => import('./pages/AdminFinance'));
const AdminLoans = lazy(() => import('./pages/AdminLoans'));
const AdminInventory = lazy(() => import('./pages/AdminInventory'));

// 電腦版幹部工作站 (Web Admin Workstation)
const WebAdminLayout = lazy(() => import('./pages/web-admin/WebAdminLayout').then(m => ({ default: m.WebAdminLayout })));
const WebAdminLogin = lazy(() => import('./pages/web-admin/WebAdminLogin').then(m => ({ default: m.WebAdminLogin })));
const WebAdminCallback = lazy(() => import('./pages/web-admin/WebAdminCallback').then(m => ({ default: m.WebAdminCallback })));
const WebAdminEvents = lazy(() => import('./pages/web-admin/WebAdminEvents').then(m => ({ default: m.WebAdminEvents })));
const WebAdminRoster = lazy(() => import('./pages/web-admin/WebAdminRoster').then(m => ({ default: m.WebAdminRoster })));
const WebAdminLoans = lazy(() => import('./pages/web-admin/WebAdminLoans').then(m => ({ default: m.WebAdminLoans })));
const WebAdminMembers = lazy(() => import('./pages/web-admin/WebAdminMembers').then(m => ({ default: m.WebAdminMembers })));
const WebAdminFinance = lazy(() => import('./pages/web-admin/WebAdminFinance').then(m => ({ default: m.WebAdminFinance })));
const WebAdminInventory = lazy(() => import('./pages/web-admin/WebAdminInventory').then(m => ({ default: m.WebAdminInventory })));

function ExternalBrowserBlockScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px', textAlign: 'center'
    }}>
      <AlertCircle size={64} color="#ef4444" style={{ marginBottom: '16px' }} />
      <h2 style={{ color: '#1e293b', marginBottom: '12px', fontSize: '20px', fontWeight: 'bold' }}>請使用 LINE 官方帳號開啟</h2>
      <p style={{ color: '#64748b', marginBottom: '24px', fontSize: '15px', lineHeight: '1.6', maxWidth: '320px' }}>
        本系統為台科登山社 LINE 官方帳號專用系統，為確保您的操作與資料安全，請由手機 LINE 官方帳號圖文選單開啟。
      </p>
      <a 
        href="line://" 
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#06c755', color: '#fff', fontWeight: 'bold', padding: '12px 24px',
          borderRadius: '8px', textDecoration: 'none', fontSize: '16px',
          boxShadow: '0 4px 6px -1px rgba(6, 199, 85, 0.2)'
        }}
      >
        開啟 LINE
      </a>
    </div>
  );
}


// 解析 LIFF 傳入的初始路徑 (解決 liff.state 傳參導致重定向遺失的問題)
const getInitialRedirectPath = () => {
  const searchParams = new URLSearchParams(window.location.search);
  let statePath = searchParams.get('liff.state');

  if (!statePath && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    statePath = hashParams.get('liff.state');
  }

  // 確保路徑為合法子路徑且不重複導向
  if (statePath && (statePath.startsWith('/borrow') || statePath.startsWith('/payment') || statePath.startsWith('/register') || statePath.startsWith('/dashboard') || statePath.startsWith('/history') || statePath.startsWith('/achievements') || statePath.startsWith('/admin-web') || statePath.startsWith('/admin') || statePath.startsWith('/confirm-payment'))) {
    return statePath;
  }

  return '/borrow';
};
function GlobalHeader({ pictureUrl, displayName, isOfficer }: { pictureUrl: string; displayName: string; isOfficer?: boolean }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // 切換語言
  const toggleLanguage = () => {
    const nextLang = i18n.language === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(nextLang);
    localStorage.setItem('app_lang', nextLang);
    localStorage.setItem('app_lang_manual', 'true');
  };

  // 根據當前路由，動態決定左側的 Logo、標題與副標題（子路由如 /dashboard/achievements, /payment/history 需優先判斷）
  const getHeaderDetails = () => {
    const path = location.pathname;
    if (path.includes('/admin/members') && path.includes('/records')) {
      return { title: '個人歷史全紀錄', subtitle: '活動、裝備與繳費歷程', icon: <FileText size={24} color="#059669" /> };
    }
    if (path.includes('/admin/members')) {
      return { title: t('nav.adminMembers.title', '社員資料'), subtitle: t('nav.adminMembers.subtitle', 'Members'), icon: <Users size={24} color="#059669" /> };
    }
    if (path.includes('/admin/finance')) {
      return { title: t('nav.adminFinance.title', '財務對帳'), subtitle: t('nav.adminFinance.subtitle', 'Finance'), icon: <CreditCard size={24} color="#059669" /> };
    }
    if (path.includes('/admin/loans')) {
      return { title: t('nav.adminLoans.title', '租借管理'), subtitle: t('nav.adminLoans.subtitle', 'Loans'), icon: <PackageCheck size={24} color="#059669" /> };
    }
    if (path.includes('/admin/inventory')) {
      return { title: t('nav.adminInventory.title', '裝備庫存'), subtitle: t('nav.adminInventory.subtitle', 'Inventory'), icon: <Layers size={24} color="#059669" /> };
    }
    if (path.includes('/admin/events/history')) {
      return { title: '歷史活動歸檔', subtitle: 'Past Events Archive', icon: <HistoryIcon size={24} color="#059669" /> };
    }
    if (path.includes('/admin')) {
      return { title: t('nav.adminEvents.title', '活動管理'), subtitle: t('nav.adminEvents.subtitle', 'Events'), icon: <Calendar size={24} color="#059669" /> };
    }
    if (path.includes('/achievements')) {
      return { title: t('nav.achievements.title'), subtitle: t('nav.achievements.subtitle'), icon: <Award size={24} color="#059669" /> };
    }
    if (path.includes('/history')) {
      return { title: t('nav.history.title'), subtitle: t('nav.history.subtitle'), icon: <FileText size={24} color="#059669" /> };
    }
    if (path.includes('/register')) {
      return { title: t('nav.register.title'), subtitle: t('nav.register.subtitle'), icon: <ClipboardList size={24} color="#059669" /> };
    }
    if (path.includes('/payment')) {
      return { title: t('nav.payment.title'), subtitle: t('nav.payment.subtitle'), icon: <CreditCard size={24} color="#059669" /> };
    }
    if (path.includes('/dashboard')) {
      return { title: t('nav.dashboard.title'), subtitle: t('nav.dashboard.subtitle'), icon: <User size={24} color="#059669" /> };
    }
    if (path.includes('/confirm-payment')) {
      return { title: '繳費單核銷', subtitle: '線上對帳審核系統', icon: <CreditCard size={24} color="#059669" /> };
    }
    // 預設為裝備租借
    return { title: t('nav.borrow.title'), subtitle: t('nav.borrow.subtitle'), icon: <Compass size={24} color="#059669" /> };
  };

  const { title, subtitle, icon } = getHeaderDetails();

  // 點擊空白處（非選單處）關閉選單
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const container = document.querySelector('.avatar-dropdown-container');
      if (container && !container.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [isOpen]);

  const handleNav = (path: string, externalUrl?: string) => {
    setIsOpen(false);
    if (externalUrl && liff.isInClient()) {
      // 在 LINE Client 內，若有獨立 LIFF 網址則開啟
      liff.openWindow({ url: externalUrl, external: false });
    } else {
      // 瀏覽器/本地開發或無獨立 LIFF ID 時直接以路由切換
      navigate(path);
    }
  };

  return (
    <>
      <header className="app-header" style={{ position: 'sticky', top: 0, width: '100%', boxSizing: 'border-box' }}>
      <div className="header-logo">
        <span className="logo-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        <div className="logo-text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* 語言切換按鈕 */}
        <button
          className="lang-switch-btn"
          onClick={toggleLanguage}
          title="Switch Language"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
        >
          <Languages size={15} />
          <span>{i18n.language === 'zh' ? 'EN' : '中'}</span>
        </button>

        <div className="avatar-dropdown-container" style={{ position: 'relative' }}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              outline: 'none'
            }}
          >
            {pictureUrl ? (
              <img
                src={pictureUrl}
                alt="Avatar"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '2px solid #10b981',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                fontWeight: 'bold'
              }}>
                {displayName ? displayName.charAt(0) : '山'}
              </div>
            )}
          </button>

          {isOpen && (
            <>
              <div className="dropdown-menu animate-fade-in" style={{
                position: 'absolute',
                top: '48px',
                right: 0,
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0',
                padding: '6px 0',
                width: 'max-content',
                minWidth: '120px',
                zIndex: 1000,
                textAlign: 'left'
              }}>
                <div
                  onClick={() => handleNav('/dashboard', LIFF_URLS.DASHBOARD)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <User size={15} color="#64748b" />
                  <span>{t('nav.menuDashboard')}</span>
                </div>
                <div
                  onClick={() => handleNav('/register', LIFF_URLS.REGISTER)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <ClipboardList size={15} color="#64748b" />
                  <span>{t('nav.menuRegister')}</span>
                </div>
                <div
                  onClick={() => handleNav('/borrow', LIFF_URLS.BORROW)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Compass size={15} color="#64748b" />
                  <span>{t('nav.menuBorrow')}</span>
                </div>
                <div
                  onClick={() => handleNav('/payment', LIFF_URLS.PAYMENT)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <CreditCard size={15} color="#64748b" />
                  <span>{t('nav.menuPayment')}</span>
                </div>
                <div
                  onClick={() => handleNav('/history', LIFF_URLS.HISTORY)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <FileText size={15} color="#64748b" />
                  <span>{t('nav.menuHistory')}</span>
                </div>
                <div
                  onClick={() => handleNav('/achievements', LIFF_URLS.ACHIEVEMENTS)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Award size={15} color="#64748b" />
                  <span>{t('nav.menuAchievements')}</span>
                </div>
                {isOfficer && (
                  <>
                    <div style={{ margin: '4px 0', borderTop: '1px solid #e2e8f0' }} />
                    <div
                      onClick={() => handleNav('/admin/events', LIFF_URLS.ADMIN_EVENTS)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ecfdf5')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Calendar size={15} color="#059669" />
                      <span>{t('nav.menuAdminEvents', '活動管理')}</span>
                    </div>
                    <div
                      onClick={() => handleNav('/admin/members')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ecfdf5')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Users size={15} color="#059669" />
                      <span>{t('nav.menuAdminMembers', '社員資料')}</span>
                    </div>
                    <div
                      onClick={() => handleNav('/admin/finance')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ecfdf5')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <CreditCard size={15} color="#059669" />
                      <span>{t('nav.menuAdminFinance', '財務對帳')}</span>
                    </div>
                    <div
                      onClick={() => handleNav('/admin/loans')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ecfdf5')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <PackageCheck size={15} color="#059669" />
                      <span>{t('nav.menuAdminLoans', '租借管理')}</span>
                    </div>
                    <div
                      onClick={() => handleNav('/admin/inventory')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#059669',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        transition: 'background 0.15s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#ecfdf5')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Layers size={15} color="#059669" />
                      <span>{t('nav.menuAdminInventory', '裝備庫存')}</span>
                    </div>
                  </>
                )}

                {/* 使用指南 (所有社員均可隨時開啟查閱) */}
                <div style={{ margin: '4px 0', borderTop: '1px solid #e2e8f0' }} />
                <div
                  onClick={() => {
                    setIsOpen(false);
                    setIsGuideOpen(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', transition: 'background 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <BookOpen size={15} color="#64748b" />
                  <span>{t('nav.menuGuide', '使用指南')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      </header>

      {/* 社員系統使用指南導覽燈箱 */}
      <SystemGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
}

// 檢查個人必填項目是否已填寫的包裹組件
function ProfileCheck({ userId, children }: { userId: string; children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const checkProfile = async () => {
      // 本地開發與測試環境直接跳過檢查，不阻擋
      if (!userId || userId === 'TEST_USER_ID') {
        setLoading(false);
        return;
      }

      // 快取檢查：若本次 session 已經驗證過個人資料完整，0ms 立即放行
      const cacheKey = `profile_complete_${userId}`;
      const cached = getCache<boolean>(cacheKey);
      if (cached === true) {
        setIsComplete(true);
        setLoading(false);
        return;
      }

      try {
        // 優先從 Supabase 秒級驗證個人資料完整性
        const sbProfile = await fetchMemberProfileFromSupabase(userId);
        if (sbProfile) {
          const nameOk = sbProfile.name ? sbProfile.name.trim() !== '' : false;
          const deptOk = sbProfile.department ? sbProfile.department.trim() !== '' : false;
          const studentIdOk = sbProfile.studentId ? sbProfile.studentId.trim() !== '' : false;
          const phoneOk = sbProfile.phone ? sbProfile.phone.trim() !== '' : false;
          const emailOk = sbProfile.email ? sbProfile.email.trim() !== '' : false;
          const lineIdOk = sbProfile.realLineId ? sbProfile.realLineId.trim() !== '' : false;

          if (nameOk && deptOk && studentIdOk && phoneOk && emailOk && lineIdOk) {
            setIsComplete(true);
            setCache(cacheKey, true, 600); // 快取 10 分鐘，後續切換路由 0ms
          } else {
            setIsComplete(false);
            setShowModal(true);
          }
        } else {
          // 非社員或未填寫個人資料
          setIsComplete(false);
          setShowModal(true);
        }
      } catch (sbErr: any) {
        console.error('[App] Supabase 個人資料驗證失敗:', sbErr);
        // 連線失敗時預設不阻擋，以免影響出隊租借
        setIsComplete(true);
      }

      setLoading(false);
    };

    checkProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>確認個人資料完整性中...</p>
      </div>
    );
  }

  if (!isComplete && showModal) {
    return (
      <div className="modal-overlay" style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
        backdropFilter: 'blur(4px)'
      }}>
        <div className="modal-content" style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '28px 24px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <AlertCircle size={48} color="#ef4444" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#1e293b' }}>個人資料不完整</h3>
          <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', marginBottom: '24px' }}>
            您尚未填寫完整的社員個人資料，請先完成必填欄位（姓名、系所、學號、手機、Email、LINE ID）後，方可使用裝備租借與繳費系統。
          </p>
          <button
            onClick={() => {
              window.location.href = 'https://liff.line.me/2009217429-AhPRqAHg';
            }}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '15px',
              cursor: 'pointer',
              width: '100%',
              transition: 'background-color 0.2s'
            }}
          >
            前往填寫資料
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppContent({ liffInit }: { liffInit: { loading: boolean; error: unknown; userId: string; displayName: string; pictureUrl: string } }) {
  const location = useLocation();
  const navigate = useNavigate();

  // 必須用 useState 初始化：liff.init() 完成後 LIFF SDK 會清除 URL 的 liff.state 參數，需在初始化前鎖定初始路徑
  // 若每次 render 重新計算，loading→false 的重新渲染時會找不到 liff.state 而 fallback 到 /borrow
  const [redirectPath] = useState(() => getInitialRedirectPath());
  const [isOfficer, setIsOfficer] = useState<boolean>(() => {
    if (!liffInit.userId || liffInit.userId === 'TEST_USER_ID') return false;
    const cached = getCache<boolean>(`officer_status_${liffInit.userId}`);
    return cached === true;
  });

  // 雙平台核銷跳轉保證：若偵測到 liff.state 為 /confirm-payment，立即無條件強制導向正確路由 (防止停在 /dashboard 或 /borrow)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    let statePath = searchParams.get('liff.state');
    if (!statePath && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      statePath = hashParams.get('liff.state');
    }
    if (statePath && statePath.startsWith('/confirm-payment') && !location.pathname.startsWith('/confirm-payment')) {
      navigate(statePath, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    let ignore = false;
    if (!liffInit.userId || liffInit.userId === 'TEST_USER_ID') {
      return;
    }
    const cacheKey = `officer_status_${liffInit.userId}`;

    // 優先從 Supabase 秒開檢查幹部身分 (< 30ms)
    checkOfficerStatusFromSupabase(liffInit.userId).then((sbOfficer) => {
      if (ignore) return;
      if (sbOfficer !== null) {
        setIsOfficer(sbOfficer.isOfficer);
        setCache(cacheKey, sbOfficer.isOfficer, 300);
      }
    }).catch((err) => console.error('[App] Supabase 幹部身分檢查失敗:', err));

    return () => {
      ignore = true;
    };
  }, [liffInit.userId]);

  if (liffInit.loading) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>驗證登入中，請稍候...</p>
      </div>
    );
  }

  return (
    <div className="router-wrapper" style={{ position: 'relative' }}>
      {/* 載入完成後渲染全域導航頭貼選單 (核銷頁面與電腦版工作站豁免) */}
      {!location.pathname.startsWith('/confirm-payment') && !location.pathname.startsWith('/admin-web') && liffInit.userId && (
        <GlobalHeader pictureUrl={liffInit.pictureUrl} displayName={liffInit.displayName} isOfficer={isOfficer} />
      )}

      {/* 路由主體頁面 (以 Suspense 支援動態程式碼分割非同步載入) */}
      <Suspense fallback={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>載入頁面中 Loading...</p>
        </div>
      }>
        <Routes>
          <Route path="/" element={<Navigate to={redirectPath} replace />} />
          <Route path="/index.html" element={<Navigate to={redirectPath} replace />} />
          <Route path="/borrow" element={
            <ProfileCheck userId={liffInit.userId}>
              <Borrow userId={liffInit.userId} isOfficer={isOfficer} />
            </ProfileCheck>
          } />
          <Route path="/payment" element={
            <ProfileCheck userId={liffInit.userId}>
              <Payment userId={liffInit.userId} />
            </ProfileCheck>
          } />
          <Route path="/register" element={<Register userId={liffInit.userId} />} />
          <Route path="/dashboard" element={<Dashboard userId={liffInit.userId} />} />
          <Route path="/history" element={
            <ProfileCheck userId={liffInit.userId}>
              <History userId={liffInit.userId} />
            </ProfileCheck>
          } />
          <Route path="/payment/history" element={
            <ProfileCheck userId={liffInit.userId}>
              <History userId={liffInit.userId} />
            </ProfileCheck>
          } />
          <Route path="/achievements" element={
            <ProfileCheck userId={liffInit.userId}>
              <Achievements userId={liffInit.userId} />
            </ProfileCheck>
          } />
          <Route path="/dashboard/achievements" element={
            <ProfileCheck userId={liffInit.userId}>
              <Achievements userId={liffInit.userId} />
            </ProfileCheck>
          } />
          <Route path="/admin/events/history" element={<AdminEventsHistory userId={liffInit.userId} />} />
          <Route path="/admin/events" element={<AdminEvents userId={liffInit.userId} />} />
          <Route path="/admin/members" element={<AdminMembers userId={liffInit.userId} />} />
          <Route path="/admin/members/:userId/records" element={<MemberRecords officerUserId={liffInit.userId} />} />
          <Route path="/admin/members/:userId" element={<MemberDetailEdit officerUserId={liffInit.userId} />} />
          <Route path="/admin/finance" element={<AdminFinance userId={liffInit.userId} />} />
          <Route path="/admin/loans" element={<AdminLoans userId={liffInit.userId} />} />
          <Route path="/admin/inventory" element={<AdminInventory userId={liffInit.userId} />} />
          <Route path="/admin" element={<Navigate to="/admin/events" replace />} />
          {/* 免 Google/LINE 登入之單鍵安全核銷頁面 */}
          <Route path="/confirm-payment" element={<ConfirmPayment />} />
          {/* 電腦版幹部工作站 (Web Admin Workstation) */}
          <Route path="/admin-web/login" element={<WebAdminLogin />} />
          <Route path="/admin-web/callback" element={<WebAdminCallback />} />
          <Route path="/admin-web" element={<WebAdminLayout />}>
            <Route index element={<Navigate to="/admin-web/events" replace />} />
            <Route path="events" element={<WebAdminEvents />} />
            <Route path="roster" element={<WebAdminRoster />} />
            <Route path="loans" element={<WebAdminLoans />} />
            <Route path="members" element={<WebAdminMembers />} />
            <Route path="finance" element={<WebAdminFinance />} />
            <Route path="inventory" element={<WebAdminInventory />} />
          </Route>
          {/* 萬用路由：避免 any 其他路徑或 LIFF 狀態字串導致白畫面 */}
          <Route path="*" element={<Navigate to="/borrow" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  const [isBlocked, setIsBlocked] = useState(false);
  const [liffInit, setLiffInit] = useState<{
    loading: boolean;
    error: unknown;
    userId: string;
    displayName: string;
    pictureUrl: string;
  }>({
    loading: true,
    error: null,
    userId: '',
    displayName: '',
    pictureUrl: ''
  });

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        let liffId = '2009217429-zXvGeSrI'; // default (borrow)
        const path = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);

        let statePath = searchParams.get('liff.state') || '';
        if (!statePath && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          statePath = hashParams.get('liff.state') || '';
        }

        // 核銷與電腦版幹部工作站專用直通通道：完全免連線 LINE LIFF，秒開渲染 (電腦、手機外部瀏覽器暢通無阻)
        if (path.includes('/confirm-payment') || statePath.includes('/confirm-payment') || path.startsWith('/admin-web') || statePath.startsWith('/admin-web')) {
          setLiffInit({ loading: false, error: null, userId: '', displayName: '', pictureUrl: '' });
          return;
        }

        if (path.includes('/register') || statePath.includes('/register')) {
          liffId = '2009217429-AhPRqAHg';
        } else if (path.includes('/payment') || statePath.includes('/payment')) {
          liffId = '2009217429-u7OCkmQO';
        } else if (path.includes('/history') || statePath.includes('/history')) {
          liffId = '2009217429-FRB6rjph';
        } else if (path.includes('/admin') || statePath.includes('/admin')) {
          liffId = '2009217429-DSYjXqNK';
        } else if (path.includes('/dashboard') || statePath.includes('/dashboard') || path.includes('/achievements') || statePath.includes('/achievements') || path.includes('/confirm-payment') || statePath.includes('/confirm-payment')) {
          liffId = '2009217429-jvj3ydDT';
        }

        await liff.init({ liffId });

        if (!liff.isInClient() && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          setIsBlocked(true);
          setLiffInit({ loading: false, error: null, userId: '', displayName: '', pictureUrl: '' });
          return;
        }

        let userId = 'TEST_USER_ID';
        let displayName = '山友';
        let pictureUrl = '';

        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          userId = profile.userId;
          displayName = profile.displayName;
          pictureUrl = profile.pictureUrl || '';

          if (userId && pictureUrl && userId !== 'TEST_USER_ID') {
            (async () => {
              try {
                await supabase
                  ?.from('members')
                  .update({ avatar_url: pictureUrl, updated_at: new Date().toISOString() })
                  .eq('line_user_id', userId);
              } catch (syncErr) {
                console.warn('[App] 背景同步 LINE 頭像警告:', syncErr);
              }
            })();
          }
        } else {
          // 若在 LINE 內部但未登入，且非 /confirm-payment，強制導向 LINE 登入
          if (liff.isInClient() && !path.includes('/confirm-payment') && !statePath.includes('/confirm-payment')) {
            liff.login({ redirectUri: window.location.href });
            return; // 登入會跳轉，直接 return
          }
        }

        setLiffInit({ loading: false, error: null, userId, displayName, pictureUrl });
      } catch (err: unknown) {
        console.error('LIFF 初始化失敗:', err);
        setLiffInit({ loading: false, error: err, userId: 'TEST_USER_ID', displayName: '測試山友', pictureUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=150' });
      }
    };

    initializeLiff();
  }, []);

  if (isBlocked) {
    return <ExternalBrowserBlockScreen />;
  }

  return (
    <BrowserRouter>
      <AppContent liffInit={liffInit} />
    </BrowserRouter>
  );
}

export default App;

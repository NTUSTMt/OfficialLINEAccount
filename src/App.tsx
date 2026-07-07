import { useState, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import liff from '@line/liff';
import Borrow from './pages/Borrow';
import Payment from './pages/Payment';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Achievements from './pages/Achievements';
import './App.css';

// 解析 LIFF 傳入的初始路徑 (解決 liff.state 傳參導致重定向遺失的問題)
const getInitialRedirectPath = () => {
  const searchParams = new URLSearchParams(window.location.search);
  let statePath = searchParams.get('liff.state');
  
  if (!statePath && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    statePath = hashParams.get('liff.state');
  }

  // 確保路徑為合法子路徑且不重複導向
  if (statePath && (statePath.startsWith('/borrow') || statePath.startsWith('/payment') || statePath.startsWith('/register') || statePath.startsWith('/dashboard') || statePath.startsWith('/history') || statePath.startsWith('/achievements'))) {
    return statePath;
  }
  
  return '/borrow';
};

// 全域導覽 Header & 頭貼選單組件 (統一全頁面頂部 Header 樣式)
function GlobalHeader({ pictureUrl, displayName }: { pictureUrl: string; displayName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // 根據當前路由，動態決定左側的 Logo、標題與副標題
  const getHeaderDetails = () => {
    const path = location.pathname;
    if (path.includes('/register')) {
      return { title: '填寫資料', subtitle: 'Register', icon: '📝' };
    }
    if (path.includes('/payment')) {
      return { title: '繳費對帳', subtitle: 'Payment System', icon: '💳' };
    }
    if (path.includes('/dashboard')) {
      return { title: '個人主頁', subtitle: 'My Dashboard', icon: '👤' };
    }
    if (path.includes('/history')) {
      return { title: '歷史紀錄', subtitle: 'Payment History', icon: '📜' };
    }
    if (path.includes('/achievements')) {
      return { title: '出隊足跡', subtitle: 'Mountaineering Footprint', icon: '🏆' };
    }
    // 預設為裝備租借
    return { title: '裝備租借', subtitle: 'Equipments Rental', icon: '🏕️' };
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

  const handleNav = (path: string, externalUrl: string) => {
    setIsOpen(false);
    if (liff.isInClient()) {
      // 在 LINE Client 內，開啟對應的 LIFF 連結以加載正確的 LIFF ID 上下文
      liff.openWindow({ url: externalUrl, external: false });
    } else {
      // 瀏覽器/本地開發環境直接以路由切換
      navigate(path);
    }
  };

  return (
    <header className="app-header" style={{ position: 'sticky', top: 0, width: '100%', boxSizing: 'border-box' }}>
      <div className="header-logo">
        <span className="logo-icon">{icon}</span>
        <div className="logo-text">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

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
              width: '140px',
              zIndex: 1000,
              textAlign: 'left'
            }}>
               <div 
                onClick={() => handleNav('/dashboard', 'https://liff.line.me/2009217429-jvj3ydDT')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                👤 個人主頁
              </div>
              <div 
                onClick={() => handleNav('/achievements', 'https://liff.line.me/2009217429-jvj3ydDT/achievements')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🏆 出隊足跡
              </div>
              <div 
                onClick={() => handleNav('/register', 'https://liff.line.me/2009217429-AhPRqAHg')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                📝 資料填寫
              </div>
              <div 
                onClick={() => handleNav('/borrow', 'https://liff.line.me/2009217429-zXvGeSrI')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                🎒 裝備租借
              </div>
              <div 
                onClick={() => handleNav('/payment', 'https://liff.line.me/2009217429-u7OCkmQO')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                💳 繳費系統
              </div>
              <div 
                onClick={() => handleNav('/history', 'https://liff.line.me/2009217429-u7OCkmQO/history')}
                style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '14px', color: '#334155', fontWeight: 'bold', transition: 'background 0.2s' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                📜 歷史紀錄
              </div>
            </div>
          </>
        )}
      </div>
    </header>
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

      try {
        const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';
        const res = await fetch(`${GAS_API_URL}?action=get_profile&userId=${userId}`);
        const result = await res.json();
        
        if (result.status === 'success' && result.isMember && result.profile) {
          const p = result.profile;
          // 檢查 6 個必填欄位 (姓名、系所、學號、手機、Email、LINE ID) 是否非空
          const nameOk = p.name ? String(p.name).trim() !== '' : false;
          const deptOk = p.department ? String(p.department).trim() !== '' : false;
          const studentIdOk = p.studentId ? String(p.studentId).trim() !== '' : false;
          const phoneOk = p.phone ? String(p.phone).trim() !== '' : false;
          const emailOk = p.email ? String(p.email).trim() !== '' : false;
          const lineIdOk = p.realLineId ? String(p.realLineId).trim() !== '' : false;
          
          if (nameOk && deptOk && studentIdOk && phoneOk && emailOk && lineIdOk) {
            setIsComplete(true);
          } else {
            setIsComplete(false);
            setShowModal(true);
          }
        } else {
          // 非社員或無 profile 資料
          setIsComplete(false);
          setShowModal(true);
        }
      } catch (err) {
        console.error('檢查個人資料失敗:', err);
        // 連線失敗時預設不阻擋，以免影響出隊租借
        setIsComplete(true);
      } finally {
        setLoading(false);
      }
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
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

function AppContent({ liffInit }: { liffInit: { loading: boolean; error: any; userId: string; displayName: string; pictureUrl: string } }) {
  // ⚠️ 必須用 useState 初始化：liff.init() 完成後 LIFF SDK 會清除 URL 的 liff.state 參數，
  // 若每次 render 重新計算，loading→false 的重新渲染時會找不到 liff.state 而 fallback 到 /borrow
  const [redirectPath] = useState(() => getInitialRedirectPath());

  return (
    <div className="router-wrapper" style={{ position: 'relative' }}>
      {/* 載入完成後渲染全域導航頭貼選單 */}
      {!liffInit.loading && liffInit.userId && (
        <GlobalHeader pictureUrl={liffInit.pictureUrl} displayName={liffInit.displayName} />
      )}

      {/* 路由主體頁面 */}
      <Routes>
        <Route path="/" element={
          liffInit.loading ? (
            <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
              <div className="spinner"></div>
              <p>驗證登入中，請稍候...</p>
            </div>
          ) : (
            <Navigate to={redirectPath} replace />
          )
        } />
        <Route path="/index.html" element={
          liffInit.loading ? (
            <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
              <div className="spinner"></div>
              <p>驗證登入中，請稍候...</p>
            </div>
          ) : (
            <Navigate to={redirectPath} replace />
          )
        } />
        <Route path="/borrow" element={
          <ProfileCheck userId={liffInit.userId}>
            <Borrow userId={liffInit.userId} />
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
        <Route path="/achievements" element={
          <ProfileCheck userId={liffInit.userId}>
            <Achievements userId={liffInit.userId} />
          </ProfileCheck>
        } />
        {/* 萬用路由：避免 any 其他路徑或 LIFF 狀態字串導致白畫面 */}
        <Route path="*" element={<Navigate to="/borrow" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  const [liffInit, setLiffInit] = useState({
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

        if (path.includes('/register') || statePath.includes('/register')) {
          liffId = '2009217429-AhPRqAHg';
        } else if (path.includes('/payment') || statePath.includes('/payment') || path.includes('/history') || statePath.includes('/history')) {
          liffId = '2009217429-u7OCkmQO';
        } else if (path.includes('/dashboard') || statePath.includes('/dashboard') || path.includes('/achievements') || statePath.includes('/achievements')) {
          liffId = '2009217429-jvj3ydDT';
        }

        await liff.init({ liffId });
        let userId = 'TEST_USER_ID';
        let displayName = '山友';
        let pictureUrl = '';
        
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          userId = profile.userId;
          displayName = profile.displayName;
          pictureUrl = profile.pictureUrl || '';
        } else {
          // 若在 LINE 內部但未登入，強制導向 LINE 登入
          if (liff.isInClient()) {
            liff.login({ redirectUri: window.location.href });
            return; // 登入會跳轉，直接 return
          }
        }
        
        setLiffInit({ loading: false, error: null, userId, displayName, pictureUrl });
      } catch (err: any) {
        console.error('LIFF 初始化失敗:', err);
        setLiffInit({ loading: false, error: err, userId: 'TEST_USER_ID', displayName: '測試山友', pictureUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=150' });
      }
    };

    initializeLiff();
  }, []);

  return (
    <BrowserRouter>
      <AppContent liffInit={liffInit} />
    </BrowserRouter>
  );
}

export default App;

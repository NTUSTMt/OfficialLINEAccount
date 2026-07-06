import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import liff from '@line/liff';
import Borrow from './pages/Borrow';
import Payment from './pages/Payment';
import Register from './pages/Register';
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
  if (statePath && (statePath.startsWith('/borrow') || statePath.startsWith('/payment') || statePath.startsWith('/register'))) {
    return statePath;
  }
  
  return '/borrow';
};

function AppContent({ liffInit }: { liffInit: { loading: boolean; error: any; userId: string } }) {
  const location = useLocation();
  const redirectPath = getInitialRedirectPath();

  // 當處於註冊頁面時，隱藏底部 Tab Bar
  const showBottomNav = location.pathname !== '/register';

  return (
    <div className="router-wrapper">
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
        <Route path="/borrow" element={<Borrow userId={liffInit.userId} />} />
        <Route path="/payment" element={<Payment userId={liffInit.userId} />} />
        <Route path="/register" element={<Register userId={liffInit.userId} />} />
        {/* 萬用路由：避免任何其他路徑或 LIFF 狀態字串導致白畫面 */}
        <Route path="*" element={<Navigate to="/borrow" replace />} />
      </Routes>

      {/* 底部導覽 Tab Bar (手機 App 質感) */}
      {showBottomNav && (
        <nav className="bottom-nav-bar">
          <NavLink 
            to="/borrow" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">🏕️</span>
            <span className="nav-label">器材借用</span>
          </NavLink>
          <NavLink 
            to="/payment" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">💰</span>
            <span className="nav-label">繳費對帳</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function App() {
  const [liffInit, setLiffInit] = useState({ loading: true, error: null, userId: '' });

  useEffect(() => {
    const initializeLiff = async () => {
      try {
        await liff.init({ liffId: '2009217429-zXvGeSrI' });
        let userId = 'TEST_USER_ID';
        
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          userId = profile.userId;
        } else {
          // 若在 LINE 內部但未登入，強制導向 LINE 登入
          if (liff.isInClient()) {
            liff.login({ redirectUri: window.location.href });
            return; // 登入會跳轉，直接 return
          }
        }
        
        setLiffInit({ loading: false, error: null, userId });
      } catch (err: any) {
        console.error('LIFF 初始化失敗:', err);
        setLiffInit({ loading: false, error: err, userId: 'TEST_USER_ID' });
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

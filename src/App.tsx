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
  // ⚠️ 必須用 useState 初始化：liff.init() 完成後 LIFF SDK 會清除 URL 的 liff.state 參數，
  // 若每次 render 重新計算，loading→false 的重新渲染時會找不到 liff.state 而 fallback 到 /borrow
  const [redirectPath] = useState(() => getInitialRedirectPath());

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
    </div>
  );
}

function App() {
  const [liffInit, setLiffInit] = useState({ loading: true, error: null, userId: '' });

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
        } else if (path.includes('/payment') || statePath.includes('/payment')) {
          liffId = '2009217429-u7OCkmQO';
        }

        await liff.init({ liffId });
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

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import liff from '@line/liff';
import Borrow from './pages/Borrow';
import Payment from './pages/Payment';
import './App.css';

function App() {
  const [liffInit, setLiffInit] = useState({ loading: true, error: null, userId: 'TEST_USER_ID' });

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
            liff.login();
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

  if (liffInit.loading) {
    return (
      <div className="loading-state" style={{ minHeight: '100vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>驗證登入中，請稍候...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="router-wrapper">
        {/* 路由主體頁面 */}
        <Routes>
          <Route path="/" element={<Navigate to="/borrow" replace />} />
          <Route path="/borrow" element={<Borrow userId={liffInit.userId} />} />
          <Route path="/payment" element={<Payment userId={liffInit.userId} />} />
        </Routes>

        {/* 底部導覽 Tab Bar (手機 App 質感) */}
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
      </div>
    </BrowserRouter>
  );
}

export default App;

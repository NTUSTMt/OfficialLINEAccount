import { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

function AppContent({ liffInit }: { liffInit: { loading: boolean; error: any; userId: string } }) {
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
        {/* 萬用路由：避免 any 其他路徑或 LIFF 狀態字串導致白畫面 */}
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

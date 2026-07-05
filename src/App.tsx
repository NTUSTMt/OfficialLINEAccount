import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Borrow from './pages/Borrow';
import Payment from './pages/Payment';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="router-wrapper">
        {/* 路由主體頁面 */}
        <Routes>
          <Route path="/" element={<Navigate to="/borrow" replace />} />
          <Route path="/borrow" element={<Borrow />} />
          <Route path="/payment" element={<Payment />} />
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

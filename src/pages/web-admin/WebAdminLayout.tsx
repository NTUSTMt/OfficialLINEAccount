import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { Mountain, LogOut, Calendar, Users, CreditCard, Package, RefreshCw } from 'lucide-react';
import { getWebSession, webLogout, type WebAuthSession } from '../../utils/webAuth';
import './webAdmin.css';

export const WebAdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<WebAuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentSession = getWebSession();
    if (!currentSession) {
      navigate('/admin-web', { replace: true });
      return;
    }

    if (!currentSession.isOfficer) {
      navigate('/admin-web?unauthorized=true', { replace: true });
      return;
    }

    setSession(currentSession);
    setLoading(false);
  }, [navigate]);

  if (loading || !session) {
    return (
      <div className="web-admin-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--wa-text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} />
          <span>正在驗證幹部身分憑證...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="web-admin-wrapper">
      <header className="web-admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <NavLink to="/admin-web/events" className="web-admin-brand">
            <Mountain size={22} color="var(--wa-primary)" />
            <span>台科登山社</span>
            <span className="web-admin-brand-badge">電腦工作站</span>
          </NavLink>

          <nav className="web-admin-nav">
            <NavLink
              to="/admin-web/events"
              className={({ isActive }) => `web-admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <Calendar size={16} />
              <span>活動名冊審核</span>
            </NavLink>

            <NavLink
              to="/admin-web/members"
              className={({ isActive }) => `web-admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <Users size={16} />
              <span>社員名冊</span>
            </NavLink>

            <NavLink
              to="/admin-web/finance"
              className={({ isActive }) => `web-admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <CreditCard size={16} />
              <span>財務對帳</span>
            </NavLink>

            <NavLink
              to="/admin-web/inventory"
              className={({ isActive }) => `web-admin-nav-item ${isActive ? 'active' : ''}`}
            >
              <Package size={16} />
              <span>裝備庫存</span>
            </NavLink>
          </nav>
        </div>

        <div className="web-admin-user-section">
          <div className="web-admin-user-info">
            {session.pictureUrl ? (
              <img src={session.pictureUrl} alt={session.displayName} className="web-admin-avatar" />
            ) : (
              <div className="web-admin-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Mountain size={18} />
              </div>
            )}
            <div className="web-admin-user-meta">
              <span className="web-admin-user-name">{session.displayName || '登山社幹部'}</span>
              <span className="web-admin-user-role">{session.officerRole || '社團幹部'}</span>
            </div>
          </div>

          <button
            type="button"
            className="web-admin-logout-btn"
            onClick={webLogout}
            title="登出工作站"
          >
            <LogOut size={14} />
            <span>登出</span>
          </button>
        </div>
      </header>

      <main className="web-admin-main">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
};

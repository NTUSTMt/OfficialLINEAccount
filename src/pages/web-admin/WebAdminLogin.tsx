import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mountain, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { getWebSession, initiateLineLogin } from '../../utils/webAuth';
import './webAdmin.css';

export const WebAdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isUnauthorized = searchParams.get('unauthorized') === 'true';

  useEffect(() => {
    const session = getWebSession();
    if (session && session.isOfficer) {
      navigate('/admin-web/events', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="web-admin-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="web-admin-login-box">
        <div style={{ display: 'inline-flex', padding: 14, background: 'rgba(16, 185, 129, 0.12)', borderRadius: 16, marginBottom: 16 }}>
          <Mountain size={44} color="var(--wa-primary)" />
        </div>

        <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--wa-text)' }}>
          台科登山社 幹部工作站
        </h1>
        <p style={{ color: 'var(--wa-text-muted)', fontSize: '0.88rem', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          NTUST Hiking Club Officer Administration Workstation
        </p>

        {isUnauthorized && (
          <div
            className="web-admin-error-banner"
            style={{ marginBottom: 20, textAlign: 'left' }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>權限不足 (403 Forbidden)</strong>
              <div style={{ marginTop: 4 }}>
                您已成功通過 LINE 登入，但此帳號未登記為登山社現任幹部，無法存取電腦版管理後台。請確認是否登入正確之幹部個人帳號，或聯絡管理員確認幹部名冊。
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'left', background: 'var(--wa-bg)', padding: '16px', borderRadius: '8px', fontSize: '0.84rem', color: 'var(--wa-text-muted)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--wa-text)', fontWeight: 600, marginBottom: 8 }}>
            <ShieldCheck size={16} color="var(--wa-primary)" />
            <span>電腦版安全登入與個資防護聲明</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>身分驗證直通 LINE 官方 OAuth2，絕不在本機暫存密碼。</li>
            <li>簽發 8 小時有效專屬 Custom JWT，關閉瀏覽器即自動銷毀。</li>
            <li>所有名冊調閱、審核操作與異常 IP 登入均自動記入稽核日誌。</li>
          </ul>
        </div>

        <button
          type="button"
          className="web-admin-line-login-btn"
          onClick={() => initiateLineLogin()}
        >
          <span>使用 LINE 帳號登入</span>
          <ExternalLink size={18} />
        </button>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, AlertCircle, ArrowLeft } from 'lucide-react';
import { handleLineCallback } from '../../utils/webAuth';
import './webAdmin.css';

export const WebAdminCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setErrorMsg('[回傳參數不足]: URL 中未包含 code 或 state 授權參數');
      return;
    }

    let isMounted = true;

    handleLineCallback(code, state)
      .then((session) => {
        if (!isMounted) return;
        if (session.isOfficer) {
          navigate('/admin-web/events', { replace: true });
        } else {
          navigate('/admin-web?unauthorized=true', { replace: true });
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error('[WebAdminCallback] 換票例外:', err);
        setErrorMsg(err.message || String(err));
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams, navigate]);

  return (
    <div className="web-admin-wrapper" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="web-admin-login-box" style={{ maxWidth: 540 }}>
        {errorMsg ? (
          <div>
            <div style={{ display: 'inline-flex', padding: 14, background: 'rgba(239, 68, 68, 0.12)', borderRadius: 16, marginBottom: 16 }}>
              <AlertCircle size={40} color="var(--wa-danger)" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--wa-danger)' }}>
              登入授權交換失敗
            </h2>
            <div className="web-admin-error-banner" style={{ textAlign: 'left', marginBottom: 20 }}>
              {errorMsg}
            </div>
            <button
              type="button"
              className="web-admin-btn web-admin-btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => navigate('/admin-web')}
            >
              <ArrowLeft size={16} />
              <span>返回重新登入</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
            <RefreshCw className="animate-spin" size={36} color="var(--wa-primary)" />
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>
              正在向 LINE 官方驗證授權並簽發憑證...
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--wa-text-muted)' }}>
              安全通道建立中，請稍候片刻
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

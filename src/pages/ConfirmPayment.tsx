import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Loader2, Info } from 'lucide-react';
import { verifyPaymentByTokenFromSupabase, type VerifyPaymentResult } from '../utils/supabaseClient';
import { GAS_API_URL } from '../constants/api';
import { LIFF_URLS } from '../constants/liff';
import liff from '@line/liff';

export default function ConfirmPayment() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const [resultData, setResultData] = useState<VerifyPaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const paymentId = searchParams.get('paymentId') || '';
  const token = searchParams.get('token') || searchParams.get('verifyToken') || '';

  const handleOpenAdmin = () => {
    if (liff.isInClient()) {
      navigate('/admin/events');
    } else {
      // 🛡️ 外部瀏覽器：透過 LIFF 網址開啟，強制由 LINE 進行幹部身分驗證，杜絕未授權存取
      window.location.href = LIFF_URLS.ADMIN_EVENTS;
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function executeVerification() {
      if (!paymentId || !token) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage('缺少必要的單號 (paymentId) 或安全金鑰 (token) 參數');
        }
        return;
      }

      try {
        // ⚡ 1. 直連 Supabase RPC 執行安全 Token 單鍵核銷 (< 50ms)
        const res = await verifyPaymentByTokenFromSupabase(paymentId, token);

        if (!isMounted) return;

        if (!res.success) {
          setStatus('error');
          setErrorMessage(res.error || '核銷失敗，請確認核銷金鑰是否正確');
          return;
        }

        setResultData(res);

        if (res.alreadyConfirmed) {
          setStatus('already');
        } else {
          setStatus('success');

          // 2. ⚡ 非同步推播 LINE 通知 (社員個人 + 幹部管理群組)
          try {
            fetch(GAS_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify({
                action: 'notify_payment_confirmed',
                paymentId: res.paymentId,
                userName: res.userName,
                amount: res.amount,
                items: res.items,
                lineUserId: res.lineUserId,
                confirmedBy: 'Email 單鍵核銷'
              })
            }).catch(() => {});
          } catch (e) {
            console.warn('[ConfirmPayment] 推播通知例外:', e);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err?.message || String(err));
        }
      }
    }

    executeVerification();

    return () => {
      isMounted = false;
    };
  }, [paymentId, token]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        border: '1px solid #e2e8f0',
        padding: '32px 24px',
        textAlign: 'center'
      }}>
        {status === 'loading' && (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#059669'
            }}>
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>
              正在核銷款項...
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
              系統正在驗證安全金鑰並直連更新 Supabase 資料庫，請稍候
            </p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#15803d',
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.2)'
            }}>
              <CheckCircle2 size={44} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#15803d', margin: '0 0 6px 0' }}>
              繳費核銷成功！
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 24px 0' }}>
              狀態已更新為【已核銷 Confirmed】，並同步連動更新對應之報名與租借狀態
            </p>

            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'left',
              marginBottom: '24px',
              fontSize: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>申報人</span>
                <strong style={{ color: '#0f172a' }}>{resultData?.userName || '社員'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>繳費單號</span>
                <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: '600' }}>{resultData?.paymentId || paymentId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#64748b' }}>核銷金額</span>
                <strong style={{ color: '#15803d', fontSize: '16px' }}>${resultData?.amount} 元</strong>
              </div>
              <div style={{ padding: '6px 0' }}>
                <div style={{ color: '#64748b', marginBottom: '4px' }}>核銷品項</div>
                <div style={{ color: '#334155', fontWeight: '500', lineHeight: 1.5 }}>
                  {resultData?.items || '社團相關費用'}
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '13px',
              color: '#1d4ed8',
              textAlign: 'left',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <ShieldCheck size={18} style={{ flexShrink: 0 }} />
              <span>系統已自動推播【🎉 繳費成功通知】至該社員 LINE 聊天室與幹部群組！</span>
            </div>

            <button
              onClick={handleOpenAdmin}
              style={{
                width: '100%',
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)'
              }}
            >
              {liff.isInClient() ? '進入幹部審核中心' : '由 LINE 開啟幹部審核中心'} <ArrowRight size={16} />
            </button>
          </div>
        )}

        {status === 'already' && (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: '#475569'
            }}>
              <Info size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 6px 0' }}>
              此繳費單先前已完成核銷
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 20px 0' }}>
              單號：<span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{paymentId}</span> 已在先前由幹部完成核銷，不需重複處理。
            </p>

            <button
              onClick={handleOpenAdmin}
              style={{
                width: '100%',
                backgroundColor: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {liff.isInClient() ? '前往幹部審核中心' : '由 LINE 前往幹部審核中心'}
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fef2f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: '#dc2626'
            }}>
              <AlertTriangle size={36} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 8px 0' }}>
              核銷操作失敗
            </h2>
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px',
              color: '#991b1b',
              fontSize: '14px',
              textAlign: 'left',
              wordBreak: 'break-word',
              marginBottom: '20px'
            }}>
              <strong>錯誤原因：</strong> {errorMessage}
            </div>

            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px 0' }}>
              請檢查 Email 連結是否完整，或直接在 LINE 幹部群組使用核銷指令。
            </p>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              重新整理再試一次
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

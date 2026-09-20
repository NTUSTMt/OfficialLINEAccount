import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { GAS_API_URL } from '../constants/api';
import { fetchDashboardFromSupabase, cancelEquipmentLoanInSupabase, cancelEventSignupInSupabase, getLastSupabaseError } from '../utils/supabaseClient';
import {
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CalendarCheck,
  Package,
  Calendar,
  FileText,
  Users
} from 'lucide-react';
import '../App.css';

interface ProfileData {
  name: string;
  department: string;
  studentId: string;
  isOfficial: boolean;
  isOfficer?: boolean;
  officerRole?: string;
  expireDate: string;
  preferredLanguage?: string;
}

interface ActivityData {
  eventId: string;
  eventName: string;
  eventNameEn?: string;
  eventNameZh?: string;
  date: string;
  reviewStatus: string;
  payStatus: string;
  code?: string;
  lineGroupUrl?: string | null;
}

interface EquipmentData {
  orderId: string;
  itemName: string;
  pickupDate: string;
  returnDate: string;
  status: string;
  payStatus?: string;
}

interface DashboardData {
  profile: ProfileData;
  activities: ActivityData[];
  equipments: EquipmentData[];
}

function Dashboard({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(() => {
    if (userId === 'TEST_USER_ID') {
      return {
        displayName: '測試山友',
        pictureUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=150',
      };
    }
    return null;
  });

  const getReviewStatusText = (status: string) => {
    if (status.includes('已繳費') || status.includes('Paid')) return t('dashboard.status.confirmedPaid', '正取 (已繳費)');
    if (status.includes('正取')) return t('dashboard.status.confirmed');
    if (status.includes('有意願') || status.toLowerCase().includes('interested')) return t('dashboard.status.backupWilling', '備取 (有意願)');
    if (status.includes('備取')) return t('dashboard.status.backup');
    if (status.includes('待退款')) return t('dashboard.status.cancelledRefund', '已取消 (待退款)');
    if (status.includes('取消')) return t('dashboard.status.cancelled');
    if (status.includes('已結束')) return t('dashboard.status.ended');
    if (status.includes('審核')) return t('dashboard.status.reviewing');
    return status;
  };

  const getPayStatusText = (status: string) => {
    if (!status) return t('dashboard.status.unreported');
    if (status.includes('已繳') || status.includes('Paid')) return t('dashboard.status.paid');
    if (status.includes('待確認') || status.includes('Checking')) return t('dashboard.status.checking');
    if (status.includes('未繳') || status.includes('Unpaid')) return t('dashboard.status.unpaid');
    return status;
  };

  const getEquipmentStatusText = (status: string) => {
    if (status.includes('待退款')) return t('dashboard.status.cancelledRefund', '已取消 (待退款)');
    if (status.includes('已取消') || status.includes('Cancelled')) return t('dashboard.status.cancelled', '已取消');
    if (status.includes('已歸還')) return t('dashboard.status.returned');
    if (status.includes('使用中')) return t('dashboard.status.using');
    if (status.includes('待領取') || status.includes('To Be Collected')) return t('dashboard.status.toBeCollected');
    return status;
  };

  // 取消預約相關狀態
  const [isCanceling, setIsCanceling] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [targetActivity, setTargetActivity] = useState<{ code: string; eventName: string } | null>(null);

  useEffect(() => {
    let ignore = false;

    let loadedFromSupabase = false;
    const loadDashboard = async () => {
      try {
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          if (!ignore) {
            setLineProfile({
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl,
            });
          }
        }

        const requestUserId = userId || 'TEST_USER_ID';
        let sbErrorDetail: string | null = null;

        // ⚡ 1. 優先嘗試由 Supabase 極速讀取個人儀表板 (< 100ms 秒開)
        try {
          const sbData = await fetchDashboardFromSupabase(requestUserId);
          if (!ignore && sbData && sbData.profile && sbData.profile.name) {
            setData(sbData);
            setLoading(false);
            loadedFromSupabase = true;

            // 依社員偏好語言同步前端 i18n 語系 (若使用者未手動點擊切換過)
            const prefLang = sbData.profile.preferredLanguage;
            if (prefLang && localStorage.getItem('app_lang_manual') !== 'true') {
              if (i18n.language !== prefLang) {
                i18n.changeLanguage(prefLang);
                localStorage.setItem('app_lang', prefLang);
              }
            }
          } else {
            sbErrorDetail = getLastSupabaseError();
          }
        } catch (sbErr: any) {
          console.warn('[Dashboard] Supabase 讀取例外，啟用 GAS 備援:', sbErr);
          sbErrorDetail = sbErr?.message || String(sbErr);
        }

        // 🐢 2. 背景或備援向 GAS 請求最新即時狀態
        try {
          const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_my_status&userId=${requestUserId}`));
          const result = await res.json();

          if (!ignore) {
            if (result.status === 'success' && result.data) {
              setData(result.data);
            } else if (!loadedFromSupabase) {
              const gasMsg = result.message || 'GAS 未回傳資料';
              const fullMsg = sbErrorDetail
                ? `[Supabase RPC 錯誤]: ${sbErrorDetail}\n[GAS 備援回應]: ${gasMsg}`
                : gasMsg;
              setError(fullMsg);
            }
          }
        } catch (gasFetchErr: any) {
          if (!ignore && !loadedFromSupabase) {
            const gasErrMsg = gasFetchErr?.message || String(gasFetchErr);
            const fullMsg = sbErrorDetail
              ? `[Supabase RPC 錯誤]: ${sbErrorDetail}\n[GAS 連線錯誤]: ${gasErrMsg}`
              : `網路或伺服器連線異常: ${gasErrMsg}`;
            setError(fullMsg);
          }
        }
      } catch (err: any) {
        console.error('載入儀表板失敗:', err);
        if (!ignore && !loadedFromSupabase) {
          setError(err?.message || String(err));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, [userId, refreshKey, t]);

  // 取消裝備預約
  const handleCancelLoan = async (orderId: string) => {
    const confirmed = window.confirm(t('dashboard.confirm.cancelLoan'));
    if (!confirmed) return;

    setIsCanceling(true);
    try {
      // ⚡ 100% 直連 Supabase 取消裝備預約 (自動釋放庫存並排入 sync_queue)
      const result = await cancelEquipmentLoanInSupabase(userId || 'TEST_USER_ID', orderId);

      if (result.success) {
        // ⭐️ 發送取消裝備雙軌推播 (幹部 Gmail/LINE + 個人取消憑證)
        const targetEq = data?.equipments.find(e => e.orderId === orderId);
        const isPaid = targetEq ? (targetEq.status.includes('已繳費') || targetEq.status.includes('Paid') || targetEq.status.includes('待退款')) : false;
        const borrowerName = data?.profile?.name || lineProfile?.displayName || '社員';

        try {
          const payload = withAuthPayload({
            action: 'notify_loan_cancelled',
            loanId: orderId,
            userId: userId || 'TEST_USER_ID',
            borrowerName: borrowerName,
            borrowerLineId: '',
            itemsSummary: targetEq?.itemName ? [targetEq.itemName] : [],
            isPaid: isPaid,
            pickupDate: targetEq?.pickupDate || '',
            returnDate: targetEq?.returnDate || ''
          });
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
          }).catch(e => console.warn('通知取消裝備失敗:', e));
        } catch (notifyErr) {
          console.warn('組裝裝備取消通知酬載失敗:', notifyErr);
        }

        alert(t('dashboard.alert.cancelLoanSuccess'));
        setRefreshKey(k => k + 1);
      } else {
        alert(t('dashboard.alert.cancelFailed', { message: result.message || t('dashboard.alert.contactAdmin') }));
      }
    } catch (err) {
      console.error('取消裝備預約失敗:', err);
      alert(t('dashboard.error.networkError'));
    } finally {
      setIsCanceling(false);
    }
  };

  // 點擊取消活動報名按鈕
  const handleCancelActivityClick = (act: ActivityData) => {
    const cancelTargetId = act.code || act.eventId;
    if (!cancelTargetId) {
      alert(t('dashboard.alert.noEventCode'));
      return;
    }

    const isConfirmedUser = act.reviewStatus.indexOf('正取') > -1;

    if (isConfirmedUser) {
      // 正取：需要跳出填寫原因 Modal
      setTargetActivity({ code: cancelTargetId, eventName: act.eventName });
      setCancelReason('');
      setShowCancelReasonModal(true);
    } else {
      // 備取或審核中：直接二次確認取消
      const confirmed = window.confirm(t('dashboard.confirm.cancelActivity', { name: act.eventName }));
      if (!confirmed) return;
      submitActivityCancellationDirect(cancelTargetId);
    }
  };

  // 直接取消活動報名 (非正取)
  const submitActivityCancellationDirect = async (code: string) => {
    setIsCanceling(true);
    try {
      // ⚡ 100% 直連 Supabase 取消活動報名
      const result = await cancelEventSignupInSupabase(userId || 'TEST_USER_ID', code);

      if (result.success) {
        // ⭐️ 發送活動取消推播通知 (個人憑證)
        const targetAct = data?.activities.find(a => (a.code === code || a.eventId === code));
        const eventName = targetAct?.eventName || '社團活動';
        const eventId = targetAct?.eventId || code;
        const reviewStatus = targetAct?.reviewStatus || '備取/審核中';
        const isPaid = targetAct ? (targetAct.payStatus.includes('已繳') || targetAct.payStatus.includes('Paid')) : false;
        const userName = data?.profile?.name || lineProfile?.displayName || '社員';

        try {
          const payload = withAuthPayload({
            action: 'notify_event_cancelled',
            eventId: eventId,
            eventName: eventName,
            userId: userId || 'TEST_USER_ID',
            userName: userName,
            reviewStatus: reviewStatus,
            cancelReason: '自願取消',
            isPaid: isPaid
          });
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
          }).catch(e => console.warn('通知取消活動失敗:', e));
        } catch (notifyErr) {
          console.warn('組裝活動取消通知酬載失敗:', notifyErr);
        }

        alert(t('dashboard.alert.cancelActivitySuccess'));
        setRefreshKey(k => k + 1);
      } else {
        alert(t('dashboard.alert.cancelFailed', { message: result.message || t('dashboard.alert.contactAdmin') }));
      }
    } catch (err) {
      console.error('取消活動報名失敗:', err);
      alert(t('dashboard.error.networkError'));
    } finally {
      setIsCanceling(false);
    }
  };

  // 提交正取取消原因與取消活動報名
  const submitActivityCancellationWithReason = async () => {
    if (!targetActivity) return;
    if (!cancelReason.trim()) {
      alert(t('dashboard.alert.inputReason'));
      return;
    }

    setIsCanceling(true);
    try {
      // ⚡ 100% 直連 Supabase 取消正取活動報名 (附帶原因)
      const result = await cancelEventSignupInSupabase(
        userId || 'TEST_USER_ID',
        targetActivity.code,
        cancelReason.trim()
      );

      if (result.success) {
        // ⭐️ 發送正取取消推播通知 (正取緊急遞補通知 + 個人憑證)
        const targetAct = data?.activities.find(a => (a.code === targetActivity.code || a.eventId === targetActivity.code));
        const eventName = targetActivity.eventName || targetAct?.eventName || '社團活動';
        const eventId = targetAct?.eventId || targetActivity.code;
        const isPaid = targetAct ? (targetAct.payStatus.includes('已繳') || targetAct.payStatus.includes('Paid')) : false;
        const userName = data?.profile?.name || lineProfile?.displayName || '社員';

        try {
          const payload = withAuthPayload({
            action: 'notify_event_cancelled',
            eventId: eventId,
            eventName: eventName,
            userId: userId || 'TEST_USER_ID',
            userName: userName,
            reviewStatus: '正取',
            cancelReason: cancelReason.trim(),
            isPaid: isPaid
          });
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            mode: 'no-cors'
          }).catch(e => console.warn('通知正取取消失敗:', e));
        } catch (notifyErr) {
          console.warn('組裝正取取消通知酬載失敗:', notifyErr);
        }

        alert(t('dashboard.alert.cancelConfirmedSuccess'));
        setShowCancelReasonModal(false);
        setTargetActivity(null);
        setCancelReason('');
        setRefreshKey(k => k + 1);
      } else {
        alert(t('dashboard.alert.cancelFailed', { message: result.message || t('dashboard.alert.contactAdmin') }));
      }
    } catch (err) {
      console.error('取消正取活動失敗:', err);
      alert(t('dashboard.error.networkError'));
    } finally {
      setIsCanceling(false);
    }
  };

  // 輔助函式：判斷是否過期
  const isPastDue = (dateStr: string) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(dateStr.replace(/\//g, '-'));
    return !isNaN(targetDate.getTime()) && targetDate < today;
  };

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>{t('dashboard.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state-container" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px', display: 'block' }} />
        <h3>{t('dashboard.error.title')}</h3>
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px 16px',
          margin: '16px auto 24px auto',
          maxWidth: '560px',
          textAlign: 'left',
          fontSize: '12px',
          color: '#991b1b',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: '1.5'
        }}>
          <strong>原始錯誤細節 (Original Error Details):</strong><br />
          {error}
        </div>
        <button className="btn btn-primary" onClick={() => setRefreshKey(k => k + 1)} style={{ padding: '10px 24px' }}>
          {t('dashboard.error.retry')}
        </button>
      </div>
    );
  }

  const profile = data?.profile;
  const activities = data?.activities || [];
  const equipments = data?.equipments || [];

  return (
    <div className="dashboard-container animate-fade-in" style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      
      {/* 區塊一：數位社員證 */}
      <div 
        className={`membership-card ${profile?.isOfficial ? 'official' : 'expired'}`}
        style={{
          borderRadius: '20px',
          padding: '24px',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '28px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
          background: profile?.isOfficial 
            ? 'linear-gradient(135deg, #065f46 0%, #047857 50%, #10b981 100%)' 
            : 'linear-gradient(135deg, #475569 0%, #64748b 100%)',
          minHeight: '180px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        {/* 背景裝飾高山紋理 */}
        <div style={{
          position: 'absolute',
          right: '-20px',
          bottom: '-20px',
          opacity: 0.15,
          pointerEvents: 'none'
        }}>
          <svg width="200" height="200" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 90L40 40L60 70L80 30L95 90Z" />
          </svg>
        </div>

        {/* 卡片頭部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lineProfile?.pictureUrl ? (
              <img 
                src={lineProfile.pictureUrl} 
                alt="Avatar" 
                style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.6)' }} 
              />
            ) : (
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={24} color="rgba(255,255,255,0.9)" />
              </div>
            )}
            <div style={{ textAlign: 'left' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', textAlign: 'left' }}>{lineProfile?.displayName || '山友'}</h4>
              <p style={{ margin: 0, fontSize: '11px', opacity: 0.8, textAlign: 'left' }}>LINE Account Connected</p>
            </div>
          </div>
          <div 
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 'bold',
              backgroundColor: profile?.isOfficial ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {profile?.isOfficial ? (
              <>
                <CheckCircle2 size={13} color="#ffffff" />
                <span>{t('dashboard.card.official')}</span>
              </>
            ) : profile?.expireDate?.includes('尚未') ? (
              <>
                <XCircle size={13} color="#ffffff" />
                <span>{t('dashboard.card.nonMember')}</span>
              </>
            ) : (
              <>
                <AlertTriangle size={13} color="#ffffff" />
                <span>{t('dashboard.card.expired')}</span>
              </>
            )}
          </div>
        </div>

        {/* 卡片中部：真實姓名、系所學號 */}
        <div style={{ marginTop: '24px', zIndex: 1 }}>
          <div style={{ fontSize: '22px', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '4px' }}>
            {profile?.name || t('dashboard.card.noName')}
          </div>
          <div style={{ fontSize: '13px', opacity: 0.9 }}>
            {profile?.department || t('dashboard.card.noDept')} • {profile?.studentId || t('dashboard.card.studentId')}
          </div>
        </div>

        {/* 卡片底部：社籍有效期限 */}
        <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '12px' }}>
          <div>
            <span style={{ opacity: 0.7, display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Expiry Date</span>
            <span style={{ fontWeight: '600' }}>{profile?.expireDate || t('dashboard.card.notActivated')}</span>
          </div>
        </div>
      </div>

      {/* 幹部專屬功能入口 (僅幹部可見) */}
      {profile?.isOfficer && (
        <div
          style={{
            marginBottom: '28px',
            padding: '16px 20px',
            backgroundColor: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={24} color="#059669" />
            </div>
            <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#065f46', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                幹部專屬管理中心
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#047857', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile.officerRole ? `${profile.officerRole} · ` : ''}活動發布、編輯與名單審核
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/admin/events')}
            className="btn btn-primary"
            style={{
              width: 'auto',
              flexShrink: 0,
              padding: '8px 16px',
              fontSize: '13px',
              borderRadius: '10px',
              backgroundColor: '#059669',
              border: 'none',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>進入管理</span>
            <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* 區塊二：活動報名追蹤 */}
      <div className="section-container" style={{ marginBottom: '28px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarCheck size={18} color="#059669" />
          <span>{t('dashboard.activity.title', { count: activities.length })}</span>
        </h3>
        {activities.length === 0 ? (
          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
            {t('dashboard.activity.empty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activities.map((act, index) => {
              const isUnpaid = act.reviewStatus.indexOf('正取') > -1 && act.reviewStatus.indexOf('取消') === -1 && act.payStatus !== '已繳費 Paid' && act.payStatus !== '待確認 Checking';
              return (
                <div 
                  key={index}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {(i18n.language || '').startsWith('en')
                          ? (act.eventNameEn || act.eventName)
                          : (act.eventNameZh || act.eventName)}
                      </h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={13} color="#64748b" />
                        <span>{t('dashboard.activity.date', { date: act.date || t('dashboard.activity.unscheduled') })}</span>
                      </p>
                    </div>
                    
                    {/* 動態狀態標籤 */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span 
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          color: act.reviewStatus.indexOf('已取消 (待退款)') > -1
                            ? '#c2410c'
                            : act.reviewStatus.indexOf('正取') > -1 
                            ? '#047857' 
                            : act.reviewStatus.indexOf('備取') > -1 
                            ? '#b45309' 
                            : act.reviewStatus.indexOf('審核') > -1 
                            ? '#2563eb' 
                            : '#64748b',
                          backgroundColor: act.reviewStatus.indexOf('已取消 (待退款)') > -1 
                            ? '#ffedd5' 
                            : act.reviewStatus.indexOf('正取') > -1 
                            ? '#d1fae5' 
                            : act.reviewStatus.indexOf('備取') > -1 
                            ? '#fef3c7' 
                            : act.reviewStatus.indexOf('審核') > -1 
                            ? '#dbeafe' 
                            : '#f1f5f9'
                        }}
                      >
                        {getReviewStatusText(act.reviewStatus)}
                      </span>
                      <span 
                        style={{
                          fontSize: '10px',
                          color: act.payStatus.includes('已繳') ? '#047857' : act.payStatus.includes('待確認') ? '#2563eb' : '#ef4444'
                        }}
                      >
                        {getPayStatusText(act.payStatus)}
                      </span>
                    </div>
                  </div>

                  {/* 行動按鈕區 */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                    {act.reviewStatus.indexOf('取消') === -1 && act.reviewStatus.indexOf('已結束') === -1 && (
                      <button
                        onClick={() => handleCancelActivityClick(act)}
                        disabled={isCanceling}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #fca5a5',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          cursor: isCanceling ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: isCanceling ? 0.6 : 1
                        }}
                        onMouseOver={(e) => {
                          if (!isCanceling) e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {t('dashboard.activity.cancelBtn')}
                      </button>
                    )}

                    {/* 正取社員專屬：加入活動專屬群組按鈕 */}
                    {act.reviewStatus.indexOf('正取') > -1 && act.reviewStatus.indexOf('取消') === -1 && act.lineGroupUrl && (
                      <a
                        href={act.lineGroupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          backgroundColor: '#059669',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#047857';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#059669';
                        }}
                      >
                        <Users size={14} />
                        <span>{t('dashboard.activity.joinGroup', '加入活動群組')}</span>
                      </a>
                    )}

                    {isUnpaid && (
                      <button
                        onClick={() => navigate('/payment')}
                        disabled={isCanceling}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          padding: '8px 16px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '13px',
                          cursor: isCanceling ? 'not-allowed' : 'pointer',
                          transition: 'background-color 0.2s',
                          opacity: isCanceling ? 0.6 : 1
                        }}
                        onMouseOver={(e) => {
                          if (!isCanceling) e.currentTarget.style.backgroundColor = '#2563eb';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = '#3b82f6';
                        }}
                      >
                        {t('dashboard.activity.payBtn')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 區塊三：裝備租借清單 */}
      <div className="section-container">
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={18} color="#059669" />
          <span>{t('dashboard.equipment.title', { count: equipments.length })}</span>
        </h3>
        {equipments.length === 0 ? (
          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
            {t('dashboard.equipment.empty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {equipments.map((eq, index) => {
              const isOverdue = eq.status.indexOf('已歸還') === -1 && isPastDue(eq.returnDate);
              return (
                <div 
                  key={index}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FileText size={12} color="#64748b" />
                      <span>{t('dashboard.equipment.orderId', { id: eq.orderId })}</span>
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span 
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          color: eq.status.indexOf('待退款') > -1 ? '#c2410c' : eq.status.indexOf('已歸還') > -1 ? '#047857' : eq.status.indexOf('使用中') > -1 ? '#2563eb' : '#b45309',
                          backgroundColor: eq.status.indexOf('待退款') > -1 ? '#ffedd5' : eq.status.indexOf('已歸還') > -1 ? '#d1fae5' : eq.status.indexOf('使用中') > -1 ? '#dbeafe' : '#fef3c7'
                        }}
                      >
                        {getEquipmentStatusText(eq.status)}
                      </span>
                      {eq.payStatus && (
                        <span 
                          style={{
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: (eq.payStatus.includes('已繳') || eq.payStatus.includes('Paid')) ? '#047857' : (eq.payStatus.includes('待確認') || eq.payStatus.includes('Checking')) ? '#2563eb' : '#ef4444'
                          }}
                        >
                          {getPayStatusText(eq.payStatus)}
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 style={{ margin: '4px 0 6px 0', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {eq.itemName}
                  </h4>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                    <span>{t('dashboard.equipment.pickup', { date: eq.pickupDate || t('dashboard.activity.unscheduled') })}</span>
                    <span style={{ color: isOverdue ? '#ef4444' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {isOverdue && <AlertTriangle size={12} color="#ef4444" />}
                      <span>{t('dashboard.equipment.return', { date: eq.returnDate || t('dashboard.activity.unscheduled') })} {isOverdue && t('dashboard.equipment.overdue')}</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    {eq.payStatus && (eq.payStatus.includes('未繳') || eq.payStatus.includes('Unpaid')) && eq.status.indexOf('已取消') === -1 && (
                      <button
                        onClick={() => navigate('/payment')}
                        style={{
                          backgroundColor: '#059669',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        {t('dashboard.action.pay', '前往繳費')}
                      </button>
                    )}

                    {eq.status === '待領取 To Be Collected' && (
                      <button
                        onClick={() => handleCancelLoan(eq.orderId)}
                        disabled={isCanceling}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #fca5a5',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          cursor: isCanceling ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: isCanceling ? 0.6 : 1
                        }}
                        onMouseOver={(e) => {
                          if (!isCanceling) e.currentTarget.style.backgroundColor = '#fef2f2';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {t('dashboard.equipment.cancelBtn')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 取消正取活動原因 Modal */}
      {showCancelReasonModal && targetActivity && (
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
            maxWidth: '450px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            boxSizing: 'border-box',
            textAlign: 'left'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={20} color="#ef4444" />
              <span>{t('dashboard.modal.title')}</span>
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' }}>
              {t('dashboard.modal.description', { name: targetActivity.eventName })}
            </p>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="required" style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>
                {t('dashboard.modal.reasonLabel')}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('dashboard.modal.reasonPlaceholder')}
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCancelReasonModal(false);
                  setTargetActivity(null);
                  setCancelReason('');
                }}
                disabled={isCanceling}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: isCanceling ? 'not-allowed' : 'pointer'
                }}
              >
                {t('dashboard.modal.keepBtn')}
              </button>
              <button
                type="button"
                onClick={submitActivityCancellationWithReason}
                disabled={isCanceling || !cancelReason.trim()}
                style={{
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: (isCanceling || !cancelReason.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (isCanceling || !cancelReason.trim()) ? 0.6 : 1
                }}
              >
                {isCanceling ? t('dashboard.modal.processing') : t('dashboard.modal.confirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;

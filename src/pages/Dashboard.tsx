import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import '../App.css';

interface ProfileData {
  name: string;
  department: string;
  studentId: string;
  isOfficial: boolean;
  expireDate: string;
}

interface ActivityData {
  eventId: string;
  eventName: string;
  date: string;
  reviewStatus: string;
  payStatus: string;
  code?: string;
}

interface EquipmentData {
  orderId: string;
  itemName: string;
  pickupDate: string;
  returnDate: string;
  status: string;
}

interface DashboardData {
  profile: ProfileData;
  activities: ActivityData[];
  equipments: EquipmentData[];
}

function Dashboard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);

  const getReviewStatusText = (status: string) => {
    if (status.includes('正取')) return t('dashboard.status.confirmed');
    if (status.includes('備取')) return t('dashboard.status.backup');
    if (status.includes('審核')) return t('dashboard.status.reviewing');
    if (status.includes('取消')) return t('dashboard.status.cancelled');
    if (status.includes('已結束')) return t('dashboard.status.ended');
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

  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. 取得 LINE Profile
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        setLineProfile({
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
        });
      } else if (userId === 'TEST_USER_ID') {
        setLineProfile({
          displayName: '測試山友',
          pictureUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=150',
        });
      }

      // 2. 獲取個人總覽狀態
      const requestUserId = userId || 'TEST_USER_ID';
      const res = await fetch(`${GAS_API_URL}?action=get_my_status&userId=${requestUserId}`);
      const result = await res.json();

      if (result.status === 'success' && result.data) {
        setData(result.data);
      } else {
        setError(result.message || t('dashboard.error.loadProfileFailed'));
      }
    } catch (err) {
      console.error('載入儀表板失敗:', err);
      setError(t('dashboard.error.networkError'));
    } finally {
      setLoading(false);
    }
  };

  // 取消裝備預約
  const handleCancelLoan = async (orderId: string) => {
    const confirmed = window.confirm(t('dashboard.confirm.cancelLoan'));
    if (!confirmed) return;

    setIsCanceling(true);
    try {
      const payload = {
        action: 'liff_cancel_loan',
        userId: userId || 'TEST_USER_ID',
        targetId: orderId,
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('dashboard.alert.cancelLoanSuccess'));
        fetchData();
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
    if (!act.code) {
      alert(t('dashboard.alert.noEventCode'));
      return;
    }

    const isConfirmedUser = act.reviewStatus.indexOf('正取') > -1;

    if (isConfirmedUser) {
      // 正取：需要跳出填寫原因 Modal
      setTargetActivity({ code: act.code, eventName: act.eventName });
      setCancelReason('');
      setShowCancelReasonModal(true);
    } else {
      // 備取或審核中：直接二次確認取消
      const confirmed = window.confirm(t('dashboard.confirm.cancelActivity', { name: act.eventName }));
      if (!confirmed) return;
      submitActivityCancellationDirect(act.code);
    }
  };

  // 直接取消活動報名 (非正取)
  const submitActivityCancellationDirect = async (code: string) => {
    setIsCanceling(true);
    try {
      const payload = {
        action: 'liff_cancel_event',
        userId: userId || 'TEST_USER_ID',
        targetId: code,
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('dashboard.alert.cancelActivitySuccess'));
        fetchData();
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
      const payload = {
        action: 'liff_cancel_event',
        userId: userId || 'TEST_USER_ID',
        targetId: targetActivity.code,
        reason: cancelReason,
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('dashboard.alert.cancelConfirmedSuccess'));
        setShowCancelReasonModal(false);
        setTargetActivity(null);
        setCancelReason('');
        fetchData();
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

  useEffect(() => {
    fetchData();
  }, [userId]);

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
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
        <h3>{t('dashboard.error.title')}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <button className="btn btn-primary" onClick={fetchData} style={{ padding: '10px 24px' }}>
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
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                👤
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
              border: '1px solid rgba(255,255,255,0.3)'
            }}
          >
            {profile?.isOfficial ? t('dashboard.card.official') : profile?.expireDate?.includes('尚未') ? t('dashboard.card.nonMember') : t('dashboard.card.expired')}
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

      {/* 區塊二：活動報名追蹤 */}
      <div className="section-container" style={{ marginBottom: '28px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '14px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {t('dashboard.activity.title', { count: activities.length })}
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
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{act.eventName}</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                        {t('dashboard.activity.date', { date: act.date || t('dashboard.activity.unscheduled') })}
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
                          color: act.reviewStatus.indexOf('正取') > -1 ? '#047857' : act.reviewStatus.indexOf('備取') > -1 ? '#b45309' : act.reviewStatus.indexOf('審核') > -1 ? '#2563eb' : '#64748b',
                          backgroundColor: act.reviewStatus.indexOf('正取') > -1 ? '#d1fae5' : act.reviewStatus.indexOf('備取') > -1 ? '#fef3c7' : act.reviewStatus.indexOf('審核') > -1 ? '#dbeafe' : '#f1f5f9'
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
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
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
          {t('dashboard.equipment.title', { count: equipments.length })}
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
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('dashboard.equipment.orderId', { id: eq.orderId })}
                    </span>
                    <span 
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        color: eq.status.indexOf('已歸還') > -1 ? '#047857' : eq.status.indexOf('使用中') > -1 ? '#2563eb' : '#b45309',
                        backgroundColor: eq.status.indexOf('已歸還') > -1 ? '#d1fae5' : eq.status.indexOf('使用中') > -1 ? '#dbeafe' : '#fef3c7'
                      }}
                    >
                      {getEquipmentStatusText(eq.status)}
                    </span>
                  </div>

                  <h4 style={{ margin: '4px 0 6px 0', fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                    {eq.itemName}
                  </h4>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px dashed var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                    <span>{t('dashboard.equipment.pickup', { date: eq.pickupDate || t('dashboard.activity.unscheduled') })}</span>
                    <span style={{ color: isOverdue ? '#ef4444' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal' }}>
                      {t('dashboard.equipment.return', { date: eq.returnDate || t('dashboard.activity.unscheduled') })} {isOverdue && t('dashboard.equipment.overdue')}
                    </span>
                  </div>

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
                        alignSelf: 'flex-end',
                        marginTop: '4px',
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
              {t('dashboard.modal.title')}
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

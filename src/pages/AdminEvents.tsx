import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getDirectImageUrl } from '../utils/image';

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

export interface AdminEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  deadline: string;
  cost: string;
  status: '開放' | '未來開放' | '關閉' | string;
  shortDesc: string;
  fullDesc: string;
  imageUrl: string;
  stats: {
    total: number;
    accepted: number;
    waitlisted: number;
    pending: number;
  };
  rowNumber?: number;
}

export interface SignupApplicant {
  rowNumber: number;
  signupCode: string;
  userId: string;
  name: string;
  gender: string;
  phone: string;
  lineId: string;
  strengthProof: string;
  isOfficial: string;
  reviewResult: string;
  notifyStatus: string;
  payStatus: string;
  remark?: string;
}

interface AdminEventsProps {
  userId: string;
}

export default function AdminEvents({ userId }: AdminEventsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 權限與初始化狀態
  const [authLoading, setAuthLoading] = useState(true);
  const [isOfficer, setIsOfficer] = useState(false);

  // 分頁狀態: 'list' | 'create'
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isEditing, setIsEditing] = useState(false);

  // 活動清單狀態
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 表單狀態
  const [formData, setFormData] = useState({
    eventId: '',
    name: '',
    startDate: '',
    endDate: '',
    deadline: '',
    cost: '',
    status: '未來開放',
    shortDesc: '',
    fullDesc: '',
    imageUrl: '',
    notifyOfficerGroup: true
  });
  const [selectedFile, setSelectedFile] = useState<{ base64: string; name: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [submittingForm, setSubmittingForm] = useState(false);

  // 審核名單 Modal 狀態
  const [selectedEventForSignups, setSelectedEventForSignups] = useState<AdminEvent | null>(null);
  const [signupsList, setSignupsList] = useState<SignupApplicant[]>([]);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [signupFilter, setSignupFilter] = useState<'all' | 'accepted' | 'waitlisted' | 'pending'>('all');
  const [updatingSignupCode, setUpdatingSignupCode] = useState<string | null>(null);
  const [sendingNotifications, setSendingNotifications] = useState(false);
  const [expandedSignupCode, setExpandedSignupCode] = useState<string | null>(null);
  const [copiedLineId, setCopiedLineId] = useState<string | null>(null);

  // 1. 驗證幹部身分
  useEffect(() => {
    const verifyOfficer = async () => {
      setAuthLoading(true);
      if (!userId || userId === 'TEST_USER_ID') {
        // 本地開發與測試環境預設賦予幹部權限
        setIsOfficer(true);
        setAuthLoading(false);
        fetchEvents();
        return;
      }

      try {
        const res = await fetch(`${GAS_API_URL}?action=check_officer_status&userId=${userId}`);
        const data = await res.json();
        if (data.status === 'success' && data.isOfficer) {
          setIsOfficer(true);
          fetchEvents();
        } else {
          setIsOfficer(false);
        }
      } catch (err) {
        console.error('幹部權限驗證失敗:', err);
        setIsOfficer(false);
      } finally {
        setAuthLoading(false);
      }
    };

    verifyOfficer();
  }, [userId]);

  // 2. 獲取後台所有活動清單
  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`${GAS_API_URL}?action=get_admin_events&userId=${userId || 'TEST_USER_ID'}`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.events)) {
        setEvents(data.events);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error('獲取後台活動失敗:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // 3. 處理表單圖片選取與壓縮
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert(t('register.alert.fileTooLarge', { name: file.name }) || '檔案超過 10MB 限制！');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 1200;
        const maxHeight = 1200;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setSelectedFile({ base64: compressedBase64, name: file.name });
        setPreviewImage(compressedBase64);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 4. 重置表單為發布新活動
  const resetFormForCreate = () => {
    setIsEditing(false);
    setFormData({
      eventId: '',
      name: '',
      startDate: '',
      endDate: '',
      deadline: '',
      cost: '',
      status: '未來開放',
      shortDesc: '',
      fullDesc: '',
      imageUrl: '',
      notifyOfficerGroup: true
    });
    setSelectedFile(null);
    setPreviewImage('');
    setActiveTab('create');
  };

  // 5. 進入編輯活動模式
  const handleStartEdit = (evt: AdminEvent) => {
    setIsEditing(true);
    setFormData({
      eventId: evt.id,
      name: evt.name,
      startDate: evt.startDate ? evt.startDate.replace(/\//g, '-') : '',
      endDate: evt.endDate ? evt.endDate.replace(/\//g, '-') : '',
      deadline: evt.deadline ? evt.deadline.replace(/\//g, '-') : '',
      cost: evt.cost,
      status: evt.status,
      shortDesc: evt.shortDesc,
      fullDesc: evt.fullDesc,
      imageUrl: evt.imageUrl,
      notifyOfficerGroup: false
    });
    setSelectedFile(null);
    setPreviewImage(evt.imageUrl ? (getDirectImageUrl(evt.imageUrl, 800) || evt.imageUrl) : '');
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 6. 提交活動建立或更新
  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.startDate || !formData.deadline || !formData.cost.trim() || !formData.shortDesc.trim()) {
      alert(t('adminEvents.alerts.fillRequired'));
      return;
    }

    setSubmittingForm(true);
    try {
      const payload = {
        action: 'save_event',
        userId: userId || 'TEST_USER_ID',
        eventId: formData.eventId,
        name: formData.name.trim(),
        startDate: formData.startDate.replace(/-/g, '/'),
        endDate: formData.endDate ? formData.endDate.replace(/-/g, '/') : formData.startDate.replace(/-/g, '/'),
        deadline: formData.deadline.replace(/-/g, '/'),
        cost: formData.cost.trim(),
        status: formData.status,
        shortDesc: formData.shortDesc.trim(),
        fullDesc: formData.fullDesc.trim(),
        imageUrl: formData.imageUrl,
        coverImageFile: selectedFile,
        notifyOfficerGroup: formData.notifyOfficerGroup
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('adminEvents.alerts.saveSuccess'));
        resetFormForCreate();
        setActiveTab('list');
        fetchEvents();
      } else {
        alert(t('adminEvents.alerts.error', { message: result.message || '儲存失敗' }));
      }
    } catch (err) {
      console.error('儲存活動失敗:', err);
      alert('連線失敗，請檢查網路狀態！');
    } finally {
      setSubmittingForm(false);
    }
  };

  // 7. 快速切換活動狀態
  const handleQuickStatusChange = async (eventId: string, newStatus: string) => {
    try {
      const payload = {
        action: 'update_event_status',
        userId: userId || 'TEST_USER_ID',
        eventId: eventId,
        status: newStatus
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.status === 'success') {
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e))
        );
      } else {
        alert(t('adminEvents.alerts.error', { message: result.message || '更新狀態失敗' }));
      }
    } catch (err) {
      console.error('更新活動狀態失敗:', err);
    }
  };

  // 8. 開啟審核名冊 Modal
  const handleOpenSignupsModal = async (evt: AdminEvent) => {
    setSelectedEventForSignups(evt);
    setLoadingSignups(true);
    setSignupFilter('all');
    try {
      const res = await fetch(`${GAS_API_URL}?action=get_event_signups&eventId=${evt.id}&userId=${userId || 'TEST_USER_ID'}`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.signups)) {
        setSignupsList(data.signups);
      } else {
        setSignupsList([]);
      }
    } catch (err) {
      console.error('讀取報名名冊失敗:', err);
      setSignupsList([]);
    } finally {
      setLoadingSignups(false);
    }
  };

  // 9. 更新個別報名審核結果 (正取 / 備取 / 審核中)
  const handleUpdateApplicantResult = async (signupCode: string, newResult: string) => {
    setUpdatingSignupCode(signupCode);
    try {
      const payload = {
        action: 'update_signup_status',
        userId: userId || 'TEST_USER_ID',
        eventId: selectedEventForSignups?.id,
        signupCode: signupCode,
        reviewResult: newResult
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.status === 'success') {
        setSignupsList((prev) =>
          prev.map((s) => (s.signupCode === signupCode ? { ...s, reviewResult: newResult, notifyStatus: '' } : s))
        );
        fetchEvents(); // 同步更新統計徽章
      } else {
        alert(t('adminEvents.alerts.error', { message: result.message || '更新失敗' }));
      }
    } catch (err) {
      console.error('更新審核狀態失敗:', err);
    } finally {
      setUpdatingSignupCode(null);
    }
  };

  // 10. 一鍵發送審核結果推播通知
  const handleSendNotifications = async () => {
    if (!selectedEventForSignups) return;

    const unnotifiedCount = signupsList.filter(
      (s) =>
        (s.reviewResult.indexOf('正取') > -1 || s.reviewResult.indexOf('備取') > -1) &&
        s.notifyStatus !== '已通知'
    ).length;

    if (unnotifiedCount === 0) {
      alert(t('adminEvents.alerts.noPendingNotification'));
      return;
    }

    if (!window.confirm(t('adminEvents.alerts.confirmSendNotifications'))) {
      return;
    }

    setSendingNotifications(true);
    try {
      const payload = {
        action: 'send_event_notifications',
        userId: userId || 'TEST_USER_ID',
        eventId: selectedEventForSignups.id
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('adminEvents.alerts.notificationsSent', { count: result.notifiedCount || unnotifiedCount }));
        // 更新本地名單之通知狀態
        setSignupsList((prev) =>
          prev.map((s) =>
            s.reviewResult.indexOf('正取') > -1 || s.reviewResult.indexOf('備取') > -1
              ? { ...s, notifyStatus: '已通知' }
              : s
          )
        );
      } else {
        alert(t('adminEvents.alerts.error', { message: result.message || '推播通知失敗' }));
      }
    } catch (err) {
      console.error('發送通知失敗:', err);
      alert('連線失敗，請稍後再試！');
    } finally {
      setSendingNotifications(false);
    }
  };

  // 篩選後活動列表
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesStatus = statusFilter === 'all' || evt.status === statusFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        evt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [events, statusFilter, searchQuery]);

  // 篩選後報名者列表
  const filteredSignups = useMemo(() => {
    return signupsList.filter((s) => {
      if (signupFilter === 'accepted') return s.reviewResult.indexOf('正取') > -1;
      if (signupFilter === 'waitlisted') return s.reviewResult.indexOf('備取') > -1;
      if (signupFilter === 'pending') return s.reviewResult.indexOf('正取') === -1 && s.reviewResult.indexOf('備取') === -1;
      return true;
    });
  }, [signupsList, signupFilter]);

  // 未授權或載入狀態渲染
  if (authLoading) {
    return (
      <div className="loading-state" style={{ minHeight: '70vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>{t('adminEvents.verifying')}</p>
      </div>
    );
  }

  if (!isOfficer) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '500px', margin: '60px auto', padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '12px' }}>
          {t('adminEvents.unauthorizedTitle')}
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', marginBottom: '20px' }}>
          {t('adminEvents.unauthorizedDesc')}
        </p>

        {userId && (
          <div style={{
            margin: '0 auto 24px',
            padding: '12px 16px',
            backgroundColor: '#f1f5f9',
            borderRadius: '10px',
            border: '1px dashed #cbd5e1',
            textAlign: 'left'
          }}>
            <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>
              您的 LINE 系統識別碼 (User ID)：
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <code style={{ fontSize: '12px', color: '#0f172a', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {userId}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(userId);
                  alert('已成功複製您的 LINE 系統識別碼！請將此碼貼至試算表 Officers 的「幹部識別碼」欄位。');
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  backgroundColor: '#e2e8f0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}
              >
                複製
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/dashboard')}
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold' }}
        >
          {t('adminEvents.backHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="admin-events-container animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
      
      {/* 頁籤切換 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '8px'
      }}>
        <button
          onClick={() => { setActiveTab('list'); setIsEditing(false); }}
          style={{
            background: activeTab === 'list' ? '#059669' : 'transparent',
            color: activeTab === 'list' ? 'white' : '#475569',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {t('adminEvents.tabList')} ({events.length})
        </button>
        <button
          onClick={resetFormForCreate}
          style={{
            background: activeTab === 'create' ? '#059669' : 'transparent',
            color: activeTab === 'create' ? 'white' : '#475569',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {isEditing ? t('adminEvents.tabEdit') : t('adminEvents.tabCreate')}
        </button>
      </div>

      {/* ============================================================ */}
      {/* 區塊一：活動列表與審核總覽 (Tab: list) */}
      {/* ============================================================ */}
      {activeTab === 'list' && (
        <div>
          {/* 搜尋與篩選列 */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="🔍 搜尋活動名稱或代號..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', '開放', '未來開放', '關閉'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    border: '1px solid',
                    cursor: 'pointer',
                    backgroundColor: statusFilter === st ? '#1e293b' : '#f8fafc',
                    color: statusFilter === st ? 'white' : '#64748b',
                    borderColor: statusFilter === st ? '#1e293b' : '#cbd5e1'
                  }}
                >
                  {st === 'all' ? '全部' : st}
                </button>
              ))}
            </div>
          </div>

          {loadingEvents ? (
            <div className="loading-state" style={{ minHeight: '40vh' }}>
              <div className="spinner"></div>
              <p>載入活動名單中...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
              <span style={{ fontSize: '40px' }}>🏔️</span>
              <p style={{ marginTop: '12px', color: '#64748b', fontSize: '15px' }}>{t('adminEvents.empty')}</p>
              <button
                onClick={resetFormForCreate}
                className="btn btn-primary"
                style={{ marginTop: '12px', padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                {t('adminEvents.tabCreate')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredEvents.map((evt) => {
                const imgDirect = evt.imageUrl ? (getDirectImageUrl(evt.imageUrl, 400) || evt.imageUrl) : '';
                const hasPending = evt.stats.pending > 0;

                return (
                  <div
                    key={evt.id}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '16px',
                      border: '1px solid #e2e8f0',
                      padding: '16px',
                      boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                      transition: 'transform 0.2s, box-shadow 0.2s'
                    }}
                  >
                    {/* 1. 卡片頂部列：狀態標籤 + ID + 狀態快速切換 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      borderBottom: '1px solid #f1f5f9',
                      paddingBottom: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 'bold',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          backgroundColor: evt.status === '開放' ? '#dcfce7' : evt.status === '未來開放' ? '#ffedd5' : '#f1f5f9',
                          color: evt.status === '開放' ? '#15803d' : evt.status === '未來開放' ? '#c2410c' : '#64748b',
                          border: `1px solid ${evt.status === '開放' ? '#bbf7d0' : evt.status === '未來開放' ? '#fed7aa' : '#e2e8f0'}`
                        }}>
                          {evt.status === '開放' ? '🟢 開放報名' : evt.status === '未來開放' ? '🟠 未來開放' : '⚪ 已關閉'}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          color: '#64748b',
                          fontFamily: 'monospace',
                          backgroundColor: '#f8fafc',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0'
                        }}>
                          #{evt.id}
                        </span>
                      </div>

                      {/* 快速切換狀態選單 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>狀態:</span>
                        <select
                          value={evt.status}
                          onChange={(e) => handleQuickStatusChange(evt.id, e.target.value)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: '#f8fafc',
                            color: '#1e293b',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="開放">開放</option>
                          <option value="未來開放">未來開放</option>
                          <option value="關閉">關閉</option>
                        </select>
                      </div>
                    </div>

                    {/* 2. 主視覺縮圖與活動標題 */}
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '96px',
                          height: '76px',
                          borderRadius: '12px',
                          backgroundColor: '#f1f5f9',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        {imgDirect ? (
                          <img src={imgDirect} alt={evt.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: '28px', opacity: 0.6 }}>⛰️</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{
                          margin: 0,
                          fontSize: '17px',
                          fontWeight: 'bold',
                          color: '#0f172a',
                          lineHeight: '1.4',
                          wordBreak: 'break-word'
                        }}>
                          {evt.name}
                        </h3>
                        {evt.shortDesc && (
                          <p style={{
                            margin: '4px 0 0',
                            fontSize: '12px',
                            color: '#64748b',
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {evt.shortDesc}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 3. 核心時程與費用資訊格 (Info Chips) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '8px'
                    }}>
                      <div style={{
                        backgroundColor: '#f8fafc',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>📅 出隊日程</span>
                        <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 'bold' }}>
                          {evt.startDate} ~ {evt.endDate}
                        </span>
                      </div>

                      <div style={{
                        backgroundColor: '#f8fafc',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>⏰ 報名截止</span>
                        <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 'bold' }}>
                          {evt.deadline}
                        </span>
                      </div>

                      <div style={{
                        backgroundColor: '#f8fafc',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>💰 活動費用</span>
                        <span style={{ fontSize: '12px', color: '#059669', fontWeight: 'bold' }}>
                          NT$ {evt.cost}
                        </span>
                      </div>
                    </div>

                    {/* 4. 報名數據指標看板 (4 色獨立膠囊卡片) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '8px'
                    }}>
                      {/* 總報名 */}
                      <div style={{
                        backgroundColor: '#eff6ff',
                        borderRadius: '10px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        border: '1px solid #dbeafe'
                      }}>
                        <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '500' }}>總報名</div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1d4ed8', marginTop: '2px' }}>
                          {evt.stats.total}
                        </div>
                      </div>

                      {/* 正取 */}
                      <div style={{
                        backgroundColor: '#ecfdf5',
                        borderRadius: '10px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        border: '1px solid #a7f3d0'
                      }}>
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: '500' }}>正取</div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#047857', marginTop: '2px' }}>
                          {evt.stats.accepted}
                        </div>
                      </div>

                      {/* 備取 */}
                      <div style={{
                        backgroundColor: '#fff7ed',
                        borderRadius: '10px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        border: '1px solid #fed7aa'
                      }}>
                        <div style={{ fontSize: '11px', color: '#ea580c', fontWeight: '500' }}>備取</div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#c2410c', marginTop: '2px' }}>
                          {evt.stats.waitlisted}
                        </div>
                      </div>

                      {/* 待審核 */}
                      <div style={{
                        backgroundColor: hasPending ? '#fef2f2' : '#f8fafc',
                        borderRadius: '10px',
                        padding: '8px 4px',
                        textAlign: 'center',
                        border: `1px solid ${hasPending ? '#fecaca' : '#e2e8f0'}`,
                        position: 'relative'
                      }}>
                        {hasPending && (
                          <span style={{
                            position: 'absolute',
                            top: '4px',
                            right: '6px',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#ef4444'
                          }} />
                        )}
                        <div style={{ fontSize: '11px', color: hasPending ? '#dc2626' : '#64748b', fontWeight: 'bold' }}>
                          待審核
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: hasPending ? '#b91c1c' : '#64748b', marginTop: '2px' }}>
                          {evt.stats.pending}
                        </div>
                      </div>
                    </div>

                    {/* 5. 卡片底部操作按鈕組 */}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: '12px'
                    }}>
                      <button
                        onClick={() => handleStartEdit(evt)}
                        style={{
                          flex: 1,
                          padding: '9px 14px',
                          borderRadius: '10px',
                          border: '1.5px solid #cbd5e1',
                          backgroundColor: 'white',
                          color: '#334155',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s'
                        }}
                      >
                        ✏️ {t('adminEvents.btnEdit')}
                      </button>

                      <button
                        onClick={() => handleOpenSignupsModal(evt)}
                        style={{
                          flex: 1.3,
                          padding: '9px 16px',
                          borderRadius: '10px',
                          border: 'none',
                          backgroundColor: '#059669',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span>📋 {t('adminEvents.btnSignups')}</span>
                        {hasPending ? (
                          <span style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '999px',
                            fontWeight: 'bold'
                          }}>
                            {evt.stats.pending} 待審
                          </span>
                        ) : (
                          <span style={{ opacity: 0.85, fontSize: '12px' }}>({evt.stats.total})</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 區塊二：發布新活動 / 編輯活動表單 (Tab: create) */}
      {/* ============================================================ */}
      {activeTab === 'create' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          
          {/* 左欄：表單 */}
          <form
            onSubmit={handleSubmitEvent}
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a', textAlign: 'left' }}>
                {isEditing ? t('adminEvents.editTitle') : t('adminEvents.createTitle')}
              </h3>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetFormForCreate}
                  style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {t('adminEvents.cancelEdit')}
                </button>
              )}
            </div>

            {/* 活動名稱 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
                {t('adminEvents.nameLabel')}
              </label>
              <input
                type="text"
                required
                value={formData.name}
                placeholder={t('adminEvents.namePlaceholder')}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
              />
            </div>

            {/* 活動代號 (選填或顯示) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px', textAlign: 'left' }}>
                {t('adminEvents.eventIdLabel')}
              </label>
              <input
                type="text"
                disabled={isEditing}
                value={formData.eventId}
                placeholder={t('adminEvents.eventIdHelp')}
                onChange={(e) => setFormData({ ...formData, eventId: e.target.value.toUpperCase() })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  backgroundColor: isEditing ? '#f8fafc' : 'white',
                  fontFamily: 'monospace',
                  textAlign: 'left'
                }}
              />
            </div>

            {/* 活動狀態 (發布設定高亮選單) */}
            <div style={{
              backgroundColor: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1.5px solid #e2e8f0',
              textAlign: 'left'
            }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', textAlign: 'left' }}>
                📌 {t('adminEvents.statusLabel')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  boxSizing: 'border-box',
                  fontWeight: 'bold',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: formData.status === '開放' ? '#15803d' : formData.status === '未來開放' ? '#c2410c' : '#64748b'
                }}
              >
                <option value="未來開放">🟠 未來開放 (預設預告，暫不開放社員報名填寫)</option>
                <option value="開放">🟢 開放報名 (發布後社員即可開始報名填表)</option>
                <option value="關閉">⚪ 關閉活動 (僅幹部可見，暫不對外開放)</option>
              </select>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', textAlign: 'left', lineHeight: '1.4' }}>
                {formData.status === '未來開放'
                  ? '💡 目前設定為「未來開放」，社員可見活動資訊預告，但無法點擊報名。'
                  : formData.status === '開放'
                  ? '💡 目前設定為「開放報名」，發布後社員即可立即開始報名。'
                  : '💡 目前設定為「關閉活動」，活動不對外公開。'}
              </p>
            </div>

            {/* 日期區間與截止日 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
                  {t('adminEvents.startDateLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', textAlign: 'left' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
                  {t('adminEvents.endDateLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', textAlign: 'left' }}
                />
              </div>
            </div>

            {/* 報名截止日與費用 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
                  {t('adminEvents.deadlineLabel')}
                </label>
                <input
                  type="date"
                  required
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', textAlign: 'left' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
                  {t('adminEvents.costLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.cost}
                  placeholder={t('adminEvents.costPlaceholder')}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', textAlign: 'left' }}
                />
              </div>
            </div>

            {/* 封面照片直接上傳 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                {t('adminEvents.coverImageLabel')}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: '#f1f5f9',
                    border: '1.5px dashed #94a3b8',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: '#334155'
                  }}
                >
                  {previewImage ? t('adminEvents.coverChangeBtn') : t('adminEvents.coverUploadBtn')}
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {previewImage && (
                  <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>✓ 已選擇照片</span>
                )}
              </div>
            </div>

            {/* 簡介 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                {t('adminEvents.shortDescLabel')}
              </label>
              <textarea
                required
                rows={3}
                value={formData.shortDesc}
                placeholder={t('adminEvents.shortDescPlaceholder')}
                onChange={(e) => setFormData({ ...formData, shortDesc: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {/* 詳細行程與裝備要求 */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                {t('adminEvents.fullDescLabel')}
              </label>
              <textarea
                rows={5}
                value={formData.fullDesc}
                placeholder={t('adminEvents.fullDescPlaceholder')}
                onChange={(e) => setFormData({ ...formData, fullDesc: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {/* 推播至幹部群組選取 */}
            {!isEditing && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.notifyOfficerGroup}
                  onChange={(e) => setFormData({ ...formData, notifyOfficerGroup: e.target.checked })}
                />
                <span>{t('adminEvents.notifyOfficerGroup')}</span>
              </label>
            )}

            {/* 提交按鈕 */}
            <button
              type="submit"
              disabled={submittingForm}
              className="btn btn-primary"
              style={{
                marginTop: '10px',
                padding: '12px 24px',
                borderRadius: '10px',
                fontWeight: 'bold',
                fontSize: '15px',
                backgroundColor: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {submittingForm && <div className="spinner" style={{ width: '16px', height: '16px' }}></div>}
              {submittingForm
                ? t('adminEvents.submitting')
                : isEditing
                ? t('adminEvents.submitUpdate')
                : t('adminEvents.submitCreate')}
            </button>
          </form>

          {/* 右欄：所見即所得 LINE Carousel 卡片模擬預覽 */}
          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 'bold', color: '#1e293b' }}>
              {t('adminEvents.previewTitle')}
            </h4>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              {t('adminEvents.previewDesc')}
            </p>

            {/* LINE Flex 卡片容器 */}
            <div style={{
              maxWidth: '300px',
              margin: '0 auto',
              backgroundColor: 'white',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
              border: '1px solid #e2e8f0'
            }}>
              {/* 封面圖 */}
              <div style={{ width: '100%', height: '160px', backgroundColor: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {previewImage ? (
                  <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <span style={{ fontSize: '36px' }}>🏔️</span>
                    <p style={{ margin: 0, fontSize: '11px' }}>封面照片預覽</p>
                  </div>
                )}
              </div>

              {/* 卡片主體 */}
              <div style={{ padding: '16px', textAlign: 'left' }}>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: formData.status === '開放' ? '#1DB446' : formData.status === '未來開放' ? '#FF9800' : '#888888'
                }}>
                  {formData.status === '開放' ? '開放 Open' : formData.status === '未來開放' ? '未來開放 Coming Soon' : '已關閉 Closed'}
                </span>

                <h3 style={{ margin: '6px 0 10px', fontSize: '18px', fontWeight: 'bold', color: '#111111', lineHeight: '1.3' }}>
                  {formData.name || '未命名活動名稱'}
                </h3>

                <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 'bold', color: '#666666' }}>
                  💰 費用 Cost: {formData.cost || '尚未訂定'}
                </p>

                <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888888' }}>
                  📅 活動時間 Event Date:
                </p>
                <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 'bold', color: '#333333' }}>
                  {formData.startDate || 'YYYY/MM/DD'} ~ {formData.endDate || 'YYYY/MM/DD'}
                </p>

                <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#888888' }}>
                  ⏰ 截止報名 Deadline:
                </p>
                <p style={{ margin: '0 0 10px', fontSize: '12px', fontWeight: 'bold', color: '#E53935' }}>
                  {formData.deadline || 'YYYY/MM/DD'}
                </p>

                <p style={{ margin: '0', fontSize: '12px', color: '#777777', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {formData.shortDesc || '這裡會呈現活動的重點亮點簡述...'}
                </p>
              </div>

              {/* 卡片按鈕 */}
              <div style={{ padding: '0 16px 16px' }}>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    padding: '10px 0',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: formData.status === '開放' ? '#1DB446' : '#CCCCCC',
                    color: 'white',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'default'
                  }}
                >
                  {formData.status === '開放' ? '一鍵報名 Sign Up' : '⏳ 尚未開放 Not Open'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 區塊三：報名社員審核名冊 Modal */}
      {/* ============================================================ */}
      {selectedEventForSignups && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '20px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {/* Modal 頂部 Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8fafc'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
                  {t('adminEvents.modalTitle', { eventName: selectedEventForSignups.name })}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  {t('adminEvents.totalCount', { count: signupsList.length })} · 代號: {selectedEventForSignups.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedEventForSignups(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* 篩選標籤 */}
            <div style={{ padding: '12px 24px', display: 'flex', gap: '8px', borderBottom: '1px solid #f1f5f9', overflowX: 'auto' }}>
              {(['all', 'accepted', 'waitlisted', 'pending'] as const).map((filterKey) => {
                const count = signupsList.filter((s) => {
                  if (filterKey === 'accepted') return s.reviewResult.indexOf('正取') > -1;
                  if (filterKey === 'waitlisted') return s.reviewResult.indexOf('備取') > -1;
                  if (filterKey === 'pending') return s.reviewResult.indexOf('正取') === -1 && s.reviewResult.indexOf('備取') === -1;
                  return true;
                }).length;

                return (
                  <button
                    key={filterKey}
                    onClick={() => setSignupFilter(filterKey)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: signupFilter === filterKey ? '#059669' : '#f1f5f9',
                      color: signupFilter === filterKey ? 'white' : '#475569',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t(`adminEvents.filter${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}`, { count })}
                  </button>
                );
              })}
            </div>

            {/* 名冊內容區 (滾動) */}
            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loadingSignups ? (
                <div className="loading-state" style={{ minHeight: '30vh' }}>
                  <div className="spinner"></div>
                  <p>載入報名社員名單中...</p>
                </div>
              ) : filteredSignups.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <p>{t('adminEvents.noSignups')}</p>
                </div>
              ) : (
                filteredSignups.map((s) => {
                  const cardId = s.signupCode || String(s.rowNumber);
                  const isExpanded = expandedSignupCode === cardId;
                  const isAccepted = s.reviewResult.indexOf('正取') > -1;
                  const isWaitlisted = s.reviewResult.indexOf('備取') > -1;

                  return (
                    <div
                      key={cardId}
                      onClick={() => setExpandedSignupCode(isExpanded ? null : cardId)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: `1.5px solid ${isExpanded ? '#059669' : isAccepted ? '#bbf7d0' : isWaitlisted ? '#fed7aa' : '#e2e8f0'}`,
                        backgroundColor: isAccepted ? '#f0fdf4' : isWaitlisted ? '#fff7ed' : '#ffffff',
                        boxShadow: isExpanded ? '0 4px 12px rgba(5, 150, 105, 0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: isExpanded ? '12px' : '0',
                        textAlign: 'left'
                      }}
                    >
                      {/* 收合態 / 頂部摘要列 (永遠可見) */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </h4>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>({s.gender || '未填'})</span>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: s.isOfficial === '是' ? '#dcfce7' : '#f1f5f9',
                            color: s.isOfficial === '是' ? '#15803d' : '#64748b',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap'
                          }}>
                            {s.isOfficial === '是' ? '正式社員' : '非社員'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {/* 審核狀態膠囊 */}
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: 'bold',
                            backgroundColor: isAccepted ? '#dcfce7' : isWaitlisted ? '#ffedd5' : '#f1f5f9',
                            color: isAccepted ? '#15803d' : isWaitlisted ? '#c2410c' : '#64748b',
                            border: `1px solid ${isAccepted ? '#bbf7d0' : isWaitlisted ? '#fed7aa' : '#cbd5e1'}`
                          }}>
                            {isAccepted ? '正取' : isWaitlisted ? '備取' : '待審'}
                          </span>

                          {/* 通知狀態 */}
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: s.notifyStatus === '已通知' ? '#dcfce7' : '#fee2e2',
                            color: s.notifyStatus === '已通知' ? '#15803d' : '#b91c1c',
                            fontWeight: 'bold'
                          }}>
                            {s.notifyStatus === '已通知' ? t('adminEvents.notifiedBadge') : t('adminEvents.unnotifiedBadge')}
                          </span>

                          {/* 展開指示圖示 */}
                          <span style={{
                            fontSize: '10px',
                            color: '#94a3b8',
                            display: 'inline-block',
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s'
                          }}>
                            ▼
                          </span>
                        </div>
                      </div>

                      {/* 展開態內容：聯絡方式與審核操作 */}
                      {isExpanded && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            borderTop: '1px solid #e2e8f0',
                            paddingTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          {/* 聯絡資訊 Chips */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '13px' }}>
                            {/* LINE ID 一鍵複製 */}
                            <div
                              onClick={() => {
                                if (s.lineId) {
                                  navigator.clipboard.writeText(s.lineId);
                                  setCopiedLineId(cardId);
                                  setTimeout(() => setCopiedLineId(null), 1800);
                                }
                              }}
                              title="點擊複製 LINE ID"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: copiedLineId === cardId ? '#dcfce7' : '#f1f5f9',
                                border: `1px solid ${copiedLineId === cardId ? '#86efac' : '#cbd5e1'}`,
                                padding: '5px 10px',
                                borderRadius: '6px',
                                cursor: s.lineId ? 'pointer' : 'default',
                                color: copiedLineId === cardId ? '#15803d' : '#334155',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                              }}
                            >
                              <span>💬 LINE:</span>
                              <span style={{ fontWeight: 'bold' }}>{s.lineId || '未留'}</span>
                              {s.lineId && (
                                <span style={{ fontSize: '11px', color: copiedLineId === cardId ? '#15803d' : '#059669', fontWeight: 'bold' }}>
                                  {copiedLineId === cardId ? '✅ 已複製！' : '📋 點擊複製'}
                                </span>
                              )}
                            </div>

                            {/* 電話 (點擊撥號) */}
                            {s.phone ? (
                              <a
                                href={`tel:${s.phone}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontWeight: '500'
                                }}
                              >
                                📞 {s.phone}
                              </a>
                            ) : (
                              <span style={{ color: '#94a3b8', padding: '5px 8px' }}>📞 無電話</span>
                            )}

                            {/* 體能證明連結 */}
                            {s.strengthProof ? (
                              <a
                                href={s.strengthProof.split(',')[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  color: '#1d4ed8',
                                  textDecoration: 'underline',
                                  fontWeight: 'bold'
                                }}
                              >
                                📷 {t('adminEvents.viewProof')}
                              </a>
                            ) : (
                              <span style={{ color: '#94a3b8', padding: '5px 8px' }}>📷 無證明照片</span>
                            )}
                          </div>

                          {/* 審核操作按鈕組 */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '2px',
                            borderTop: '1px dashed #e2e8f0',
                            paddingTop: '10px'
                          }}>
                            {updatingSignupCode === s.signupCode ? (
                              <div className="spinner" style={{ width: '20px', height: '20px', margin: '4px auto' }}></div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApplicantResult(s.signupCode, '正取')}
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: isAccepted ? '#16a34a' : '#e2e8f0',
                                    color: isAccepted ? 'white' : '#475569',
                                    transition: 'all 0.2s',
                                    boxShadow: isAccepted ? '0 2px 4px rgba(22, 163, 74, 0.25)' : 'none'
                                  }}
                                >
                                  ✅ {t('adminEvents.btnAccept')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApplicantResult(s.signupCode, '備取')}
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: isWaitlisted ? '#ea580c' : '#e2e8f0',
                                    color: isWaitlisted ? 'white' : '#475569',
                                    transition: 'all 0.2s',
                                    boxShadow: isWaitlisted ? '0 2px 4px rgba(234, 88, 12, 0.25)' : 'none'
                                  }}
                                >
                                  ⏳ {t('adminEvents.btnWaitlist')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApplicantResult(s.signupCode, '審核中 Checking')}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    fontSize: '12px',
                                    border: '1px solid #cbd5e1',
                                    backgroundColor: 'white',
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    fontWeight: '500'
                                  }}
                                >
                                  🔄 {t('adminEvents.btnReset')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal 底部固定操作欄 */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => setSelectedEventForSignups(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'white',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                {t('adminEvents.closeBtn')}
              </button>

              <button
                type="button"
                disabled={sendingNotifications || signupsList.length === 0}
                onClick={handleSendNotifications}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.2)'
                }}
              >
                {sendingNotifications && <div className="spinner" style={{ width: '14px', height: '14px' }}></div>}
                {sendingNotifications
                  ? t('adminEvents.sendingNotifications')
                  : t('adminEvents.btnSendNotifications')}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

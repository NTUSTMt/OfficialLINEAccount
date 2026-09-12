import React, { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { appendAuthToken, withAuthPayload, gasGet } from '../utils/api';
import { getDirectImageUrl } from '../utils/image';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import { GAS_API_URL } from '../constants/api';
import { fetchEventsFromSupabase } from '../utils/supabaseClient';
import type { AdminEvent, SignupApplicant } from '../types/event';
import { AdminEventCard } from '../components/admin/AdminEventCard';
import { AdminEventForm, type AdminEventFormData } from '../components/admin/AdminEventForm';
import { AdminSignupsModal } from '../components/admin/AdminSignupsModal';
import { ApplicantModals } from '../components/admin/ApplicantModals';
import { openExternalUrl, parseProofUrls } from '../utils/applicantUtils';
import {
  Search,
  RotateCw,
  Lock,
  Mountain,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

interface AdminEventsProps {
  userId: string;
}

const CACHE_KEY_ADMIN_EVENTS = 'admin_events_list';
const CACHE_KEY_SIGNUPS_PREFIX = 'admin_event_signups_';

export default function AdminEvents({ userId }: AdminEventsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 權限與初始化狀態 (支援快取秒開呈現)
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    const cachedEvents = getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS);
    return !cachedEvents || cachedEvents.length === 0;
  });
  const [isOfficer, setIsOfficer] = useState<boolean>(() => {
    const cachedEvents = getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS);
    return Boolean(cachedEvents && cachedEvents.length > 0);
  });

  // 分頁狀態: 'list' | 'create'
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isEditing, setIsEditing] = useState(false);

  // 活動清單狀態
  const [events, setEvents] = useState<AdminEvent[]>(() => {
    return getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS) || [];
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [eventSortBy, setEventSortBy] = useState<'startDate' | 'deadline' | 'status'>('deadline');
  const [eventSortOrder, setEventSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isRefreshingEvents, setIsRefreshingEvents] = useState(false);

  // 表單狀態
  const [formData, setFormData] = useState<AdminEventFormData>({
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
  const [updatingSignupCode, setUpdatingSignupCode] = useState<string | null>(null);
  const [sendingNotifications, setSendingNotifications] = useState(false);
  const [profileModalApplicant, setProfileModalApplicant] = useState<SignupApplicant | null>(null);
  const [proofModalData, setProofModalData] = useState<{
    name: string;
    urls: string[];
  } | null>(null);

  // 1. 獲取後台所有活動清單與檢驗幹部身分
  const fetchEvents = async (forceRefresh: boolean = false) => {
    if (forceRefresh) {
      setIsRefreshingEvents(true);
      removeCache(CACHE_KEY_ADMIN_EVENTS);
    }

    if (!events.length) {
      setLoadingEvents(true);
    }

    try {
      let sbEvents: AdminEvent[] | null = null;
      if (!forceRefresh) {
        try {
          sbEvents = await fetchEventsFromSupabase();
          if (sbEvents && sbEvents.length > 0) {
            setIsOfficer(true);
            setEvents(sbEvents);
            setLoadingEvents(false);
          }
        } catch (sbErr) {
          console.warn('[AdminEvents] Supabase 活動讀取例外:', sbErr);
          sbEvents = null;
        }
      }

      const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_admin_events&userId=${userId || 'TEST_USER_ID'}`));
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.events)) {
        setIsOfficer(true);
        setEvents(data.events);
        setCache(CACHE_KEY_ADMIN_EVENTS, data.events, 180);
      } else if (!sbEvents) {
        setIsOfficer(false);
      }
    } catch (err) {
      console.error('獲取管理端活動失敗:', err);
    } finally {
      setAuthLoading(false);
      setLoadingEvents(false);
      setIsRefreshingEvents(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function loadInitial() {
      try {
        let sbEvents: AdminEvent[] | null = null;
        try {
          sbEvents = await fetchEventsFromSupabase();
        } catch (sbErr) {
          console.warn('[AdminEvents] Supabase 初始讀取例外:', sbErr);
          sbEvents = null;
        }

        if (sbEvents && sbEvents.length > 0 && !ignore) {
          setIsOfficer(true);
          setEvents(sbEvents);
          setCache(CACHE_KEY_ADMIN_EVENTS, sbEvents, 180);
          setAuthLoading(false);
          setLoadingEvents(false);
        }

        const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_admin_events&userId=${userId || 'TEST_USER_ID'}`));
        const data = await res.json();
        if (!ignore && data.status === 'success' && Array.isArray(data.events)) {
          setIsOfficer(true);
          setEvents(data.events);
          setCache(CACHE_KEY_ADMIN_EVENTS, data.events, 180);
        } else if (!ignore && !sbEvents) {
          setIsOfficer(false);
        }
      } catch (err) {
        console.error('後台活動載入失敗:', err);
      } finally {
        if (!ignore) {
          setAuthLoading(false);
          setLoadingEvents(false);
        }
      }
    }

    loadInitial();

    return () => {
      ignore = true;
    };
  }, [userId]);

  // 處理表單圖片選取與壓縮
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

  // 重置表單為發布新活動
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

  // 進入編輯活動模式
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

  // 提交活動建立或更新
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
        body: JSON.stringify(withAuthPayload(payload)),
        redirect: 'follow'
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(t('adminEvents.alerts.saveSuccess'));
        resetFormForCreate();
        setActiveTab('list');
        removeCache(CACHE_KEY_ADMIN_EVENTS);
        fetchEvents(true);
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

  // 快速切換活動狀態
  const handleQuickStatusChange = async (eventId: string, newStatus: string) => {
    try {
      const query = new URLSearchParams({
        action: 'update_event_status',
        userId: userId || 'TEST_USER_ID',
        eventId: eventId,
        status: newStatus
      });

      const result = await gasGet(appendAuthToken(`${GAS_API_URL}?${query.toString()}`));

      if (result?.status === 'success') {
        setEvents((prev) => {
          const next = prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e));
          setCache(CACHE_KEY_ADMIN_EVENTS, next, 180);
          return next;
        });
      } else {
        alert(t('adminEvents.alerts.error', { message: result?.message || '更新狀態失敗' }));
      }
    } catch (err) {
      console.error('更新活動狀態失敗:', err);
    }
  };

  // 開啟審核名冊 Modal
  const handleOpenSignupsModal = async (evt: AdminEvent, forceRefresh: boolean = false) => {
    setSelectedEventForSignups(evt);

    const cacheKey = CACHE_KEY_SIGNUPS_PREFIX + evt.id;
    if (!forceRefresh) {
      const cachedSignups = getCache<SignupApplicant[]>(cacheKey);
      if (cachedSignups && cachedSignups.length > 0) {
        setSignupsList(cachedSignups);
        setLoadingSignups(false);
        return;
      }
    }

    setLoadingSignups(true);
    try {
      const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_event_signups&eventId=${evt.id}&userId=${userId || 'TEST_USER_ID'}`));
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.signups)) {
        setSignupsList(data.signups);
        setCache(cacheKey, data.signups, 120);
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

  // 查看體能證明
  const handleViewProof = (applicant: SignupApplicant) => {
    const urls = parseProofUrls(applicant.strengthProof);
    if (urls.length === 0) {
      if (applicant.strengthProof && applicant.strengthProof.trim() !== '') {
        alert(`未包含有效的檔案或照片連結，登記內容為：\n${applicant.strengthProof.trim()}`);
      } else {
        alert('此報名者尚未提供體能證明照片或連結。');
      }
      return;
    }

    if (urls.length === 1) {
      openExternalUrl(urls[0]);
    } else {
      setProofModalData({
        name: applicant.name,
        urls: urls
      });
    }
  };

  // 更新個別報名審核結果 (正取 / 備取 / 審核中)
  const handleUpdateApplicantResult = async (applicant: SignupApplicant, newResult: string) => {
    const applicantKey = String(applicant.rowNumber);
    setUpdatingSignupCode(applicantKey);
    try {
      const query = new URLSearchParams({
        action: 'update_signup_status',
        userId: userId || 'TEST_USER_ID',
        eventId: selectedEventForSignups?.id || '',
        signupCode: applicant.signupCode || '',
        targetUserId: applicant.userId || '',
        rowNumber: applicant.rowNumber ? String(applicant.rowNumber) : '',
        name: applicant.name || '',
        reviewResult: newResult
      });

      const result = await gasGet(appendAuthToken(`${GAS_API_URL}?${query.toString()}`));

      if (result?.status === 'success') {
        const oldResult = applicant.reviewResult || '';
        const getCategory = (res: string) => {
          if (res.indexOf('正取') > -1) return 'accepted';
          if (res.indexOf('備取') > -1) return 'waitlisted';
          return 'pending';
        };
        const oldCat = getCategory(oldResult);
        const newCat = getCategory(newResult);

        setSignupsList((prev) => {
          const updated = prev.map((s) => {
            const isMatch = s.rowNumber === applicant.rowNumber;
            return isMatch ? { ...s, reviewResult: newResult, notifyStatus: '' } : s;
          });
          if (selectedEventForSignups?.id) {
            setCache(CACHE_KEY_SIGNUPS_PREFIX + selectedEventForSignups.id, updated, 120);
          }
          return updated;
        });

        if (profileModalApplicant && profileModalApplicant.rowNumber === applicant.rowNumber) {
          setProfileModalApplicant((prev) => prev ? { ...prev, reviewResult: newResult } : null);
        }

        if (oldCat !== newCat && selectedEventForSignups?.id) {
          setEvents((prevEvents) => {
            const nextEvents = prevEvents.map((e) => {
              if (e.id !== selectedEventForSignups.id) return e;
              const nextStats = { ...e.stats };
              if (nextStats[oldCat] > 0) nextStats[oldCat]--;
              nextStats[newCat] = (nextStats[newCat] || 0) + 1;
              return { ...e, stats: nextStats };
            });
            setCache(CACHE_KEY_ADMIN_EVENTS, nextEvents, 180);
            return nextEvents;
          });

          setSelectedEventForSignups((prev) => {
            if (!prev) return prev;
            const nextStats = { ...prev.stats };
            if (nextStats[oldCat] > 0) nextStats[oldCat]--;
            nextStats[newCat] = (nextStats[newCat] || 0) + 1;
            return { ...prev, stats: nextStats };
          });
        }
      } else {
        alert(t('adminEvents.alerts.error', { message: result?.message || '更新失敗' }));
      }
    } catch (err) {
      console.error('更新審核狀態失敗:', err);
      alert(t('adminEvents.alerts.error', { message: err instanceof Error ? err.message : '網路連線失敗或後端未回應' }));
    } finally {
      setUpdatingSignupCode(null);
    }
  };

  // 一鍵發送審核結果推播通知
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
      const query = new URLSearchParams({
        action: 'send_event_notifications',
        userId: userId || 'TEST_USER_ID',
        eventId: selectedEventForSignups.id
      });

      const result = await gasGet(appendAuthToken(`${GAS_API_URL}?${query.toString()}`));

      if (result?.status === 'success') {
        alert(t('adminEvents.alerts.notificationsSent', { count: result?.notifiedCount || unnotifiedCount }));
        setSignupsList((prev) => {
          const updated = prev.map((s) =>
            s.reviewResult.indexOf('正取') > -1 || s.reviewResult.indexOf('備取') > -1
              ? { ...s, notifyStatus: '已通知' }
              : s
          );
          if (selectedEventForSignups?.id) {
            setCache(CACHE_KEY_SIGNUPS_PREFIX + selectedEventForSignups.id, updated, 120);
          }
          return updated;
        });
      } else {
        alert(t('adminEvents.alerts.error', { message: result?.message || '推播通知失敗' }));
      }
    } catch (err) {
      console.error('發送通知失敗:', err);
      alert('連線失敗，請稍後再試！');
    } finally {
      setSendingNotifications(false);
    }
  };

  // 篩選與排序後活動列表
  const filteredEvents = useMemo(() => {
    const list = events.filter((evt) => {
      const matchesStatus = statusFilter === 'all' || evt.status === statusFilter;
      const matchesSearch =
        searchQuery.trim() === '' ||
        evt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });

    return [...list].sort((a, b) => {
      let comparison = 0;
      if (eventSortBy === 'startDate') {
        const timeA = a.startDate ? new Date(a.startDate.replace(/\./g, '/')).getTime() : 0;
        const timeB = b.startDate ? new Date(b.startDate.replace(/\./g, '/')).getTime() : 0;
        comparison = (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      } else if (eventSortBy === 'deadline') {
        const timeA = a.deadline ? new Date(a.deadline.replace(/\./g, '/')).getTime() : 0;
        const timeB = b.deadline ? new Date(b.deadline.replace(/\./g, '/')).getTime() : 0;
        comparison = (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      } else if (eventSortBy === 'status') {
        const getStatusWeight = (st: string) => {
          if (st.includes('開放報名') || st === '開放') return 1;
          if (st.includes('審核')) return 2;
          if (st.includes('未來開放')) return 3;
          if (st.includes('截止')) return 4;
          if (st.includes('結束') || st === '關閉') return 5;
          return 9;
        };
        comparison = getStatusWeight(a.status) - getStatusWeight(b.status);
      }
      return eventSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [events, statusFilter, searchQuery, eventSortBy, eventSortOrder]);

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
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={40} color="#ef4444" />
          </div>
        </div>
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
                type="button"
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
          type="button"
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
        alignItems: 'center',
        marginBottom: '20px',
        backgroundColor: 'white',
        padding: '6px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        gap: '6px'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            background: activeTab === 'list' ? '#059669' : 'transparent',
            color: activeTab === 'list' ? 'white' : '#475569',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            textAlign: 'center'
          }}
        >
          {t('adminEvents.tabList', '活動總覽與審核')}
        </button>
        <button
          type="button"
          onClick={resetFormForCreate}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            background: activeTab === 'create' ? '#059669' : 'transparent',
            color: activeTab === 'create' ? 'white' : '#475569',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            textAlign: 'center'
          }}
        >
          {isEditing ? t('adminEvents.tabEdit', '編輯活動') : `+ ${t('adminEvents.tabCreate', '發布新活動')}`}
        </button>
      </div>

      {/* 區塊一：活動列表與審核總覽 (Tab: list) */}
      {activeTab === 'list' && (
        <div>
          {/* 搜尋與篩選列 */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder="搜尋活動名稱或代號..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => fetchEvents(true)}
                disabled={isRefreshingEvents || loadingEvents}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '10px',
                  border: '1.5px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  cursor: (isRefreshingEvents || loadingEvents) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
                title={t('adminEvents.refresh', '重新整理')}
              >
                <RotateCw size={13} style={{ animation: isRefreshingEvents ? 'spin 1s linear infinite' : 'none' }} />
                <span>{isRefreshingEvents ? t('adminEvents.refreshing', '更新中...') : t('adminEvents.refresh', '重新整理')}</span>
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {(['all', '開放', '未來開放', '關閉'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
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

              {/* 活動清單排序控制項 */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#ffffff',
                padding: '4px 8px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '12px'
              }}>
                <ArrowUpDown size={13} color="#64748b" />
                <select
                  value={eventSortBy}
                  onChange={(e) => setEventSortBy(e.target.value as 'startDate' | 'deadline' | 'status')}
                  style={{
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#334155',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="startDate">{t('adminEvents.sort.startDate', '活動日期')}</option>
                  <option value="deadline">{t('adminEvents.sort.deadline', '截止時間')}</option>
                  <option value="status">{t('adminEvents.sort.status', '活動狀態')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => setEventSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    border: 'none',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                >
                  {eventSortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                  <span>{eventSortOrder === 'asc' ? t('adminEvents.sort.asc', '升冪') : t('adminEvents.sort.desc', '降冪')}</span>
                </button>
              </div>
            </div>
          </div>

          {loadingEvents ? (
            <div className="loading-state" style={{ minHeight: '40vh' }}>
              <div className="spinner"></div>
              <p>載入活動名單中...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
              <Mountain size={44} color="#94a3b8" style={{ margin: '0 auto 10px', display: 'block' }} />
              <p style={{ margin: 0, color: '#64748b', fontSize: '15px' }}>{t('adminEvents.empty')}</p>
              <button
                type="button"
                onClick={resetFormForCreate}
                className="btn btn-primary"
                style={{ marginTop: '12px', padding: '8px 20px', borderRadius: '8px', fontWeight: 'bold' }}
              >
                {t('adminEvents.tabCreate')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredEvents.map((evt) => (
                <AdminEventCard
                  key={evt.id}
                  evt={evt}
                  onEdit={handleStartEdit}
                  onOpenSignups={handleOpenSignupsModal}
                  onQuickStatusChange={handleQuickStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 區塊二：發布新活動 / 編輯活動表單 (Tab: create) */}
      {activeTab === 'create' && (
        <AdminEventForm
          isEditing={isEditing}
          formData={formData}
          setFormData={setFormData}
          previewImage={previewImage}
          onImageChange={handleImageChange}
          submittingForm={submittingForm}
          onSubmit={handleSubmitEvent}
          onCancelEdit={resetFormForCreate}
        />
      )}

      {/* 區塊三：報名社員審核名冊 Modal */}
      {selectedEventForSignups && (
        <AdminSignupsModal
          event={selectedEventForSignups}
          signupsList={signupsList}
          loadingSignups={loadingSignups}
          onClose={() => setSelectedEventForSignups(null)}
          onRefresh={() => handleOpenSignupsModal(selectedEventForSignups, true)}
          onUpdateApplicantResult={handleUpdateApplicantResult}
          updatingSignupCode={updatingSignupCode}
          sendingNotifications={sendingNotifications}
          onSendNotifications={handleSendNotifications}
          onViewProof={handleViewProof}
          onViewProfile={(applicant) => setProfileModalApplicant(applicant)}
        />
      )}

      {/* 體能證明清單與個人詳細資料 Modal */}
      <ApplicantModals
        proofModalData={proofModalData}
        onCloseProof={() => setProofModalData(null)}
        profileModalApplicant={profileModalApplicant}
        onCloseProfile={() => setProfileModalApplicant(null)}
        onUpdateApplicantResult={handleUpdateApplicantResult}
        updatingSignupCode={updatingSignupCode}
      />
    </div>
  );
}

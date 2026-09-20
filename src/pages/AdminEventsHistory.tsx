import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mountain, CheckCircle2, Lock } from 'lucide-react';
import { appendAuthToken } from '../utils/api';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import { GAS_API_URL } from '../constants/api';
import {
  fetchAdminEventsFromSupabase,
  fetchAdminEventSignupsFromSupabase,
  registerOfficerToSupabase,
  getLastSupabaseError
} from '../utils/supabaseClient';
import type { AdminEvent, SignupApplicant } from '../types/event';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import { AdminHistoryEventCard } from '../components/admin/AdminHistoryEventCard';
import { ApplicantModals } from '../components/admin/ApplicantModals';
import { isEventArchived, getEventYear } from '../utils/eventArchiveUtils';
import { safeNavigateBack } from '../utils/navigationUtils';

interface AdminEventsHistoryProps {
  userId: string;
}

const CACHE_KEY_ADMIN_EVENTS = 'admin_events_list';
const CACHE_KEY_SIGNUPS_PREFIX = 'admin_event_signups_';

const HISTORY_SORT_OPTIONS: SortOption[] = [
  { key: 'startDate', label: '依活動出隊日' },
  { key: 'deadline', label: '依報名截止日' }
];

export default function AdminEventsHistory({ userId }: AdminEventsHistoryProps) {
  const navigate = useNavigate();

  // 權限與初始化狀態
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    if (!userId || userId === 'TEST_USER_ID') return false;
    const cachedEvents = getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS);
    return !cachedEvents || cachedEvents.length === 0;
  });
  const [isOfficer, setIsOfficer] = useState<boolean>(() => {
    if (!userId || userId === 'TEST_USER_ID') return false;
    const cachedEvents = getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS);
    return Boolean(cachedEvents && cachedEvents.length > 0);
  });

  // 所有活動清單狀態
  const [events, setEvents] = useState<AdminEvent[]>(() => {
    return getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS) || [];
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [isRefreshingEvents, setIsRefreshingEvents] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 搜尋、篩選與排序
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventSortBy, setEventSortBy] = useState<'startDate' | 'deadline'>('startDate');
  const [eventSortOrder, setEventSortOrder] = useState<'asc' | 'desc'>('desc');

  // 各活動報名名冊延遲載入快取與狀態
  const [signupsMap, setSignupsMap] = useState<Record<string, SignupApplicant[]>>({});
  const [loadingSignupsMap, setLoadingSignupsMap] = useState<Record<string, boolean>>({});

  // 人員個人資料與體能證明彈窗
  const [profileModalApplicant, setProfileModalApplicant] = useState<SignupApplicant | null>(null);
  const [proofModalData, setProofModalData] = useState<{
    name: string;
    urls: string[];
  } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 1. 抓取所有活動資料
  const fetchEvents = async (forceRefresh: boolean = false) => {
    if (!userId || userId === 'TEST_USER_ID') {
      setIsOfficer(false);
      setAuthLoading(false);
      setLoadingEvents(false);
      setIsRefreshingEvents(false);
      return;
    }

    if (forceRefresh) {
      setIsRefreshingEvents(true);
      removeCache(CACHE_KEY_ADMIN_EVENTS);
    }

    if (!events.length) {
      setLoadingEvents(true);
    }

    try {
      let loadedFromSb = false;
      let sbErrorDetail: string | null = null;

      try {
        const sbRes = await fetchAdminEventsFromSupabase(userId);
        if (sbRes && sbRes.isOfficer) {
          loadedFromSb = true;
          setIsOfficer(true);
          setEvents(sbRes.events);
          setCache(CACHE_KEY_ADMIN_EVENTS, sbRes.events, 180);
          setLoadingEvents(false);
          setAuthLoading(false);
          setErrorNotice(null);
          if (forceRefresh) {
            setToastMessage('已同步最新資料！');
          }
        } else {
          sbErrorDetail = getLastSupabaseError();
        }
      } catch (sbErr: any) {
        sbErrorDetail = sbErr?.message || String(sbErr);
      }

      if (!loadedFromSb) {
        try {
          const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_admin_events&userId=${userId}`));
          const data = await res.json();
          if (data.status === 'success' && Array.isArray(data.events)) {
            setIsOfficer(true);
            setEvents(data.events);
            setCache(CACHE_KEY_ADMIN_EVENTS, data.events, 180);
            if (forceRefresh) {
              setToastMessage('已同步最新資料！');
            }
            if (sbErrorDetail) {
              setErrorNotice(`[Supabase 載入異常已改走 GAS 備援]: ${sbErrorDetail}`);
            } else {
              setErrorNotice(null);
            }
            if (userId && userId !== 'TEST_USER_ID') {
              registerOfficerToSupabase(userId, data.officerName, data.officerRole).catch(() => {});
            }
          } else if (!loadedFromSb) {
            setIsOfficer(false);
            if (sbErrorDetail) {
              setErrorNotice(`[Supabase RPC 錯誤]: ${sbErrorDetail}`);
            }
          }
        } catch (gasErr: any) {
          if (sbErrorDetail) {
            setErrorNotice(`[Supabase 錯誤]: ${sbErrorDetail}\n[GAS 連線錯誤]: ${gasErr?.message || String(gasErr)}`);
          }
        }
      }
    } catch (err: any) {
      setErrorNotice(err?.message || String(err));
    } finally {
      setAuthLoading(false);
      setLoadingEvents(false);
      setIsRefreshingEvents(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      if (!userId || userId === 'TEST_USER_ID') {
        if (!ignore) {
          setIsOfficer(false);
          setAuthLoading(false);
          setLoadingEvents(false);
        }
        return;
      }

      try {
        const sbRes = await fetchAdminEventsFromSupabase(userId);
        if (sbRes && sbRes.isOfficer && !ignore) {
          setIsOfficer(true);
          setEvents(sbRes.events);
          setCache(CACHE_KEY_ADMIN_EVENTS, sbRes.events, 180);
          setAuthLoading(false);
          setLoadingEvents(false);
          return;
        }

        const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_admin_events&userId=${userId}`));
        const data = await res.json();
        if (!ignore && data.status === 'success' && Array.isArray(data.events)) {
          setIsOfficer(true);
          setEvents(data.events);
          setCache(CACHE_KEY_ADMIN_EVENTS, data.events, 180);
        } else if (!ignore) {
          setIsOfficer(false);
        }
      } catch (err) {
        console.error('歷史活動載入失敗:', err);
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

  // 2. 僅篩選出「完全結束滿兩週（14天）」的歷史活動
  const historyEvents = useMemo(() => {
    return events.filter((evt) => isEventArchived(evt, 14));
  }, [events]);

  // 動態提取所有歷史活動的年份選項
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    historyEvents.forEach((evt) => {
      const y = getEventYear(evt);
      if (y && y !== '其他年份') {
        yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [historyEvents]);

  // 篩選列群組
  const filterGroups: FilterGroup[] = useMemo(() => [
    {
      key: 'year',
      label: '出隊年份',
      selected: yearFilter,
      onChange: setYearFilter,
      options: [
        { value: 'all', label: '全部年份' },
        ...availableYears.map((y) => ({ value: y, label: `${y} 年` }))
      ]
    },
    {
      key: 'status',
      label: '活動狀態',
      selected: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: '全部狀態' },
        { value: '關閉', label: '已關閉' },
        { value: '開放', label: '開放中' }
      ]
    }
  ], [yearFilter, statusFilter, availableYears]);

  // 3. 搜尋、篩選與排序後的歷史活動清單
  const filteredHistoryEvents = useMemo(() => {
    const list = historyEvents.filter((evt) => {
      // 關鍵字搜尋
      const matchesSearch =
        searchQuery.trim() === '' ||
        evt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.id.toLowerCase().includes(searchQuery.toLowerCase());

      // 年份篩選
      const matchesYear = yearFilter === 'all' || getEventYear(evt) === yearFilter;

      // 狀態篩選
      const matchesStatus = statusFilter === 'all' || evt.status === statusFilter;

      return matchesSearch && matchesYear && matchesStatus;
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
      }
      return eventSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [historyEvents, searchQuery, yearFilter, statusFilter, eventSortBy, eventSortOrder]);

  // 4. 展開卡片時 Lazy Load 報名名冊
  const handleCardExpandChange = async (eventId: string, isExpanded: boolean) => {
    if (!isExpanded) return;
    if (signupsMap[eventId]) return; // 已有快取

    // 先查 localStorage 快取
    const cachedSignups = getCache<SignupApplicant[]>(`${CACHE_KEY_SIGNUPS_PREFIX}${eventId}`);
    if (cachedSignups && cachedSignups.length > 0) {
      setSignupsMap((prev) => ({ ...prev, [eventId]: cachedSignups }));
      return;
    }

    setLoadingSignupsMap((prev) => ({ ...prev, [eventId]: true }));
    try {
      const sbSignups = await fetchAdminEventSignupsFromSupabase(userId || 'TEST_USER_ID', eventId);
      if (sbSignups && sbSignups.length > 0) {
        setSignupsMap((prev) => ({ ...prev, [eventId]: sbSignups }));
        setCache(`${CACHE_KEY_SIGNUPS_PREFIX}${eventId}`, sbSignups, 300);
      } else {
        // GAS 備援
        const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_event_signups&eventId=${eventId}&userId=${userId}`));
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.signups)) {
          setSignupsMap((prev) => ({ ...prev, [eventId]: data.signups }));
          setCache(`${CACHE_KEY_SIGNUPS_PREFIX}${eventId}`, data.signups, 300);
        }
      }
    } catch (err) {
      console.warn(`[AdminEventsHistory] 載入活動 ${eventId} 名冊例外:`, err);
    } finally {
      setLoadingSignupsMap((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  // 鑑權未通過呈現
  if (authLoading) {
    return (
      <div>
        <AdminSubNav />
        <div className="loading-state" style={{ minHeight: '60vh' }}>
          <div className="spinner"></div>
          <p>驗證幹部管理權限中...</p>
        </div>
      </div>
    );
  }

  if (!isOfficer) {
    return (
      <div style={{ maxWidth: '480px', margin: '60px auto', padding: '24px', textAlign: 'center' }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          backgroundColor: '#fee2e2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <Lock size={28} color="#ef4444" />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>
          權限不足 (Access Denied)
        </h3>
        <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.5', marginBottom: '20px' }}>
          您尚未具備社團幹部管理權限，無法存取歷史活動歸檔資料庫。
        </p>
        <button
          type="button"
          onClick={() => safeNavigateBack(navigate, '/admin/events')}
          className="btn btn-primary"
          style={{ width: '100%', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold' }}
        >
          返回上一頁
        </button>
      </div>
    );
  }

  return (
    <div>
      <AdminSubNav />
      <div
        className="admin-events-history-container animate-fade-in"
        style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', textAlign: 'left' }}
      >
        {/* 錯誤/診斷提示 Banner */}
        {errorNotice && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#991b1b',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            <strong>系統提示 (Diagnostics):</strong><br />
            {errorNotice}
          </div>
        )}

        {/* 同步成功提示 Toast */}
        {toastMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              color: '#065f46',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '12px',
              fontSize: '13px',
              fontWeight: 600
            }}
          >
            <CheckCircle2 size={16} color="#059669" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Notion 搜尋、篩選、排序、重新整理欄位（左側附帶返回活動管理純圖示按鈕） */}
        <NotionFilterBar
          prefixElement={
            <button
              type="button"
              onClick={() => safeNavigateBack(navigate, '/admin/events')}
              title="返回上一頁"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
            >
              <ArrowLeft size={18} />
            </button>
          }
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜尋歷史活動名稱或代號..."
          filters={filterGroups}
          sortOptions={HISTORY_SORT_OPTIONS}
          sortBy={eventSortBy}
          sortOrder={eventSortOrder}
          onSortChange={(k, o) => {
            setEventSortBy(k as any);
            setEventSortOrder(o);
          }}
          onRefresh={() => fetchEvents(true)}
          isRefreshing={isRefreshingEvents || loadingEvents}
        />

        {/* 歷史活動清單 */}
        {loadingEvents ? (
          <div className="loading-state" style={{ minHeight: '40vh' }}>
            <div className="spinner"></div>
            <p>載入歷史活動清單中...</p>
          </div>
        ) : filteredHistoryEvents.length === 0 ? (
          <div
            style={{
              padding: '60px 20px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1'
            }}
          >
            <Mountain size={44} color="#94a3b8" style={{ margin: '0 auto 10px', display: 'block' }} />
            <p style={{ margin: 0, color: '#64748b', fontSize: '15px', fontWeight: 600 }}>
              尚無符合條件的歷史活動
            </p>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '12px' }}>
              僅結束逾 14 天的活動才會歸檔至此處
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredHistoryEvents.map((evt) => (
              <AdminHistoryEventCard
                key={evt.id}
                evt={evt}
                signups={signupsMap[evt.id] || []}
                loadingSignups={Boolean(loadingSignupsMap[evt.id])}
                onExpandChange={(isExpanded) => handleCardExpandChange(evt.id, isExpanded)}
                onViewProfile={(applicant) => setProfileModalApplicant(applicant)}
              />
            ))}
          </div>
        )}

        {/* 報名者個人詳細資料彈窗（唯讀模式） */}
        <ApplicantModals
          proofModalData={proofModalData}
          onCloseProof={() => setProofModalData(null)}
          profileModalApplicant={profileModalApplicant}
          onCloseProfile={() => setProfileModalApplicant(null)}
          isReadOnly={true}
        />
      </div>
    </div>
  );
}

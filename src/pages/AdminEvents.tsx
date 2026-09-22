import React, { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { appendAuthToken, withAuthPayload, gasGet } from '../utils/api';
import { getDirectImageUrl } from '../utils/image';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import { GAS_API_URL } from '../constants/api';
import {
  fetchAdminEventsFromSupabase,
  fetchAdminEventSignupsFromSupabase,
  updateSignupStatusInSupabase,
  updateEventStatusInSupabase,
  saveEventToSupabase,
  registerOfficerToSupabase,
  getLastSupabaseError
} from '../utils/supabaseClient';
import type { AdminEvent, SignupApplicant } from '../types/event';
import { AdminEventCard } from '../components/admin/AdminEventCard';
import { AdminEventForm, type AdminEventFormData } from '../components/admin/AdminEventForm';
import { AdminSignupsModal } from '../components/admin/AdminSignupsModal';
import { ApplicantModals } from '../components/admin/ApplicantModals';
import { openExternalUrl, parseProofUrls } from '../utils/applicantUtils';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import {
  Lock,
  Mountain,
  ArrowLeft,
  CheckCircle2,
  History
} from 'lucide-react';
import { isEventArchived } from '../utils/eventArchiveUtils';
import { safeNavigateBack } from '../utils/navigationUtils';

interface AdminEventsProps {
  userId: string;
}

const CACHE_KEY_ADMIN_EVENTS = 'admin_events_list';
const CACHE_KEY_SIGNUPS_PREFIX = 'admin_event_signups_';

const EVENT_SORT_OPTIONS: SortOption[] = [
  { key: 'deadline', label: '依報名截止日' },
  { key: 'startDate', label: '依活動出隊日' },
  { key: 'status', label: '依活動狀態' }
];

export default function AdminEvents({ userId }: AdminEventsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 權限與初始化狀態 (支援快取秒開呈現，若未經 LINE 授權或為測試帳號絕不放行)
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

  // 分頁狀態: 'list' | 'create'
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isEditing, setIsEditing] = useState(false);

  // 活動清單狀態
  const [events, setEvents] = useState<AdminEvent[]>(() => {
    return getCache<AdminEvent[]>(CACHE_KEY_ADMIN_EVENTS) || [];
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [eventSortBy, setEventSortBy] = useState<'startDate' | 'deadline' | 'status'>('deadline');
  const [eventSortOrder, setEventSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isRefreshingEvents, setIsRefreshingEvents] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 活動狀態篩選群組
  const eventFilters: FilterGroup[] = useMemo(() => [
    {
      key: 'status',
      label: '活動狀態',
      selected: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: '全部活動' },
        { value: '開放', label: '開放中' },
        { value: '未來開放', label: '未來開放' },
        { value: '關閉', label: '已關閉' }
      ]
    }
  ], [statusFilter]);

  // 表單狀態
  const [activeLangTab, setActiveLangTab] = useState<'zh' | 'en'>('zh');
  const [savingDraft, setSavingDraft] = useState(false);
  const [formData, setFormData] = useState<AdminEventFormData>({
    eventId: '',
    name: '',
    nameEn: '',
    startDate: '',
    endDate: '',
    deadline: '',
    cost: '',
    status: '未來開放',
    shortDesc: '',
    shortDescEn: '',
    fullDesc: '',
    fullDescEn: '',
    imageUrl: '',
    lineGroupUrl: '',
    notifyOfficerGroup: true
  });
  const [selectedFile, setSelectedFile] = useState<{ base64: string; name: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [submittingForm, setSubmittingForm] = useState(false);
  const [creatingSheetEventId, setCreatingSheetEventId] = useState<string | null>(null);

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
    // 嚴格鑑權防護：無有效 LINE User ID 或為測試帳號時，拒絕讀取後台資料
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
        // 1. 無論是否 forceRefresh，一律優先從 Supabase 秒級讀取活動清單與報名人數統計 (< 50ms)
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
        console.warn('[AdminEvents] Supabase 活動讀取例外:', sbErr);
        sbErrorDetail = sbErr?.message || String(sbErr);
      }

      // 2. 僅在 Supabase 讀取失敗或未命中幹部時，才無縫由 GAS 備援
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

            // 若經由 GAS 認證為幹部，自動同步至 Supabase officers 表，下次即可享受 < 50ms 秒開
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
      console.error('獲取管理端活動失敗:', err);
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
      // 嚴格鑑權防護：無有效 LINE User ID 時直接判定無權限
      if (!userId || userId === 'TEST_USER_ID') {
        if (!ignore) {
          setIsOfficer(false);
          setAuthLoading(false);
          setLoadingEvents(false);
        }
        return;
      }

      try {
        let loadedFromSb = false;
        try {
          // 1. 優先從 Supabase 讀取 (< 50ms)
          const sbRes = await fetchAdminEventsFromSupabase(userId);
          if (sbRes && sbRes.isOfficer && !ignore) {
            loadedFromSb = true;
            setIsOfficer(true);
            setEvents(sbRes.events);
            setCache(CACHE_KEY_ADMIN_EVENTS, sbRes.events, 180);
            setAuthLoading(false);
            setLoadingEvents(false);
          }
        } catch (sbErr) {
          console.warn('[AdminEvents] Supabase 初始讀取例外:', sbErr);
        }

        // 2. 若 Supabase 尚未建置該幹部快取，無縫由 GAS 備援
        if (!loadedFromSb) {
          const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_admin_events&userId=${userId}`));
          const data = await res.json();
          if (!ignore && data.status === 'success' && Array.isArray(data.events)) {
            setIsOfficer(true);
            setEvents(data.events);
            setCache(CACHE_KEY_ADMIN_EVENTS, data.events, 180);

            if (userId && userId !== 'TEST_USER_ID') {
              registerOfficerToSupabase(userId, data.officerName, data.officerRole).catch(() => {});
            }
          } else if (!ignore && !loadedFromSb) {
            setIsOfficer(false);
          }
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
    setActiveLangTab('zh');
    setFormData({
      eventId: '',
      name: '',
      nameEn: '',
      startDate: '',
      endDate: '',
      deadline: '',
      cost: '',
      status: '未來開放',
      shortDesc: '',
      shortDescEn: '',
      fullDesc: '',
      fullDescEn: '',
      imageUrl: '',
      lineGroupUrl: '',
      notifyOfficerGroup: true
    });
    setSelectedFile(null);
    setPreviewImage('');
    setActiveTab('create');
  };

  // 進入編輯活動模式
  const handleStartEdit = (evt: AdminEvent) => {
    setIsEditing(true);
    setActiveLangTab('zh');
    setFormData({
      eventId: evt.id,
      name: evt.name,
      nameEn: evt.nameEn || '',
      startDate: evt.startDate ? evt.startDate.replace(/\//g, '-') : '',
      endDate: evt.endDate ? evt.endDate.replace(/\//g, '-') : '',
      deadline: evt.deadline ? evt.deadline.replace(/\//g, '-') : '',
      cost: evt.cost,
      status: evt.status,
      shortDesc: evt.shortDesc,
      shortDescEn: evt.shortDescEn || '',
      fullDesc: evt.fullDesc,
      fullDescEn: evt.fullDescEn || '',
      imageUrl: evt.imageUrl,
      lineGroupUrl: evt.lineGroupUrl || '',
      notifyOfficerGroup: false
    });
    setSelectedFile(null);
    setPreviewImage(evt.imageUrl ? (getDirectImageUrl(evt.imageUrl, 800) || evt.imageUrl) : '');
    setActiveTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 暫存活動草稿 (儲存至 Supabase，狀態為草稿/關閉，不需全填即可隨時存檔，不觸發 Google Drive / 試算表耗時建立)
  const handleSaveDraft = async () => {
    const trimmedNameZh = formData.name.trim();
    const trimmedNameEn = formData.nameEn.trim();
    if (!trimmedNameZh && !trimmedNameEn) {
      alert('暫存草稿請至少填寫中文或英文活動名稱！');
      return;
    }

    setSavingDraft(true);
    try {
      const groupUrlTrimmed = (formData.lineGroupUrl || '').trim();
      const todayStr = new Date().toISOString().split('T')[0];

      const res = await saveEventToSupabase(userId || 'TEST_USER_ID', {
        eventId: formData.eventId,
        name: trimmedNameZh || trimmedNameEn || '未命名草稿活動',
        nameEn: trimmedNameEn,
        startDate: formData.startDate || todayStr,
        endDate: formData.endDate || formData.startDate || todayStr,
        deadline: formData.deadline || todayStr,
        cost: formData.cost.trim() || '0',
        status: formData.status || '關閉',
        shortDesc: formData.shortDesc.trim(),
        shortDescEn: formData.shortDescEn.trim(),
        fullDesc: formData.fullDesc.trim(),
        fullDescEn: formData.fullDescEn.trim(),
        imageUrl: formData.imageUrl,
        lineGroupUrl: groupUrlTrimmed
      });

      if (res.success) {
        if (res.eventId && !formData.eventId) {
          setFormData((prev) => ({ ...prev, eventId: res.eventId! }));
        }
        alert(t('adminEvents.draftSavedAlert', '活動草稿已成功暫存！'));
        removeCache(CACHE_KEY_ADMIN_EVENTS);
        fetchEvents(true);
      } else {
        alert('暫存草稿失敗，請檢查網路連線或稍後再試。');
      }
    } catch (draftErr: any) {
      console.error('[AdminEvents] 暫存草稿例外:', draftErr);
      alert(`暫存草稿失敗: ${draftErr?.message || String(draftErr)}`);
    } finally {
      setSavingDraft(false);
    }
  };

  // 提交活動建立或更新 (確認發布：嚴格檢核中英文必填欄位完整度)
  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. 中文必填檢查
    const missingZh: string[] = [];
    if (!formData.name.trim()) missingZh.push('中文活動名稱');
    if (!formData.startDate) missingZh.push('活動開始日期');
    if (!formData.deadline) missingZh.push('報名截止日期');
    if (!formData.cost.trim()) missingZh.push('預計費用');
    if (!formData.shortDesc.trim()) missingZh.push('活動精簡簡介 (中文)');

    if (missingZh.length > 0) {
      alert(`請確認中文必填項目皆已填寫完畢：\n• ${missingZh.join('\n• ')}`);
      setActiveLangTab('zh');
      return;
    }

    // 2. 英文必填檢查 (依照需求：中英文皆須填寫完畢方可確認發布)
    const missingEn: string[] = [];
    if (!formData.nameEn.trim()) missingEn.push('活動英文名稱 (English Name)');
    if (!formData.shortDescEn.trim()) missingEn.push('活動精簡簡介 (English Short Desc)');

    if (missingEn.length > 0) {
      alert(`確認發布需要中英文資料皆填寫完畢，請補填以下英文欄位：\n• ${missingEn.join('\n• ')}`);
      setActiveLangTab('en');
      return;
    }

    const groupUrlTrimmed = (formData.lineGroupUrl || '').trim();
    // 依據規格：新建立活動強制必填活動群組連結
    if (!formData.eventId && !groupUrlTrimmed) {
      alert('請填寫活動專屬群組連結 (LINE Group URL)！');
      return;
    }
    // 格式防呆檢查：僅限一般 LINE 群組邀請連結，不支援 LINE 社群 (OpenChat)
    if (groupUrlTrimmed) {
      const lineGroupRegex = /^https:\/\/(?:line\.me\/(?:R\/)?ti\/g\/[a-zA-Z0-9_\-]+|line\.me\/R\/ti\/g\/|line\.me\/ti\/g\/)/i;
      if (!lineGroupRegex.test(groupUrlTrimmed) || groupUrlTrimmed.includes('/ti/g2/')) {
        alert('活動群組連結格式不正確！僅限一般 LINE 群組邀請連結（https://line.me/R/ti/g/... 或 https://line.me/ti/g/...），不支援 LINE 社群 (OpenChat)。');
        return;
      }
    }

    setSubmittingForm(true);
    try {
      // 若為「編輯舊活動」(formData.eventId 已存在)，才可在背景立即更新 Supabase
      // 若為「新活動建立」(formData.eventId 為空)，不可在未確定 ID 時發送 RPC，避免產生 E20260912_... 時間戳重複紀錄
      if (formData.eventId) {
        saveEventToSupabase(userId || 'TEST_USER_ID', {
          eventId: formData.eventId,
          name: formData.name.trim(),
          nameEn: formData.nameEn.trim(),
          startDate: formData.startDate,
          endDate: formData.endDate || formData.startDate,
          deadline: formData.deadline,
          cost: formData.cost.trim(),
          status: formData.status,
          shortDesc: formData.shortDesc.trim(),
          shortDescEn: formData.shortDescEn.trim(),
          fullDesc: formData.fullDesc.trim(),
          fullDescEn: formData.fullDescEn.trim(),
          imageUrl: formData.imageUrl,
          lineGroupUrl: groupUrlTrimmed
        }).catch(sbErr => {
          console.warn('[AdminEvents] Supabase 儲存活動例外:', sbErr);
        });
      }

      // 2. 發送 GAS 請求處理 Google Drive 資料夾建立、試算表範本複製、圖片上傳與幹部群組推播
      const payload = {
        action: 'save_event',
        userId: userId || 'TEST_USER_ID',
        eventId: formData.eventId,
        name: formData.name.trim(),
        nameEn: formData.nameEn.trim(),
        startDate: formData.startDate.replace(/-/g, '/'),
        endDate: formData.endDate ? formData.endDate.replace(/-/g, '/') : formData.startDate.replace(/-/g, '/'),
        deadline: formData.deadline.replace(/-/g, '/'),
        cost: formData.cost.trim(),
        status: formData.status,
        shortDesc: formData.shortDesc.trim(),
        shortDescEn: formData.shortDescEn.trim(),
        fullDesc: formData.fullDesc.trim(),
        fullDescEn: formData.fullDescEn.trim(),
        imageUrl: formData.imageUrl,
        lineGroupUrl: groupUrlTrimmed,
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
        // 若為新活動建立，GAS 會自動完成 Drive/Sheet 建立並將統一 eventId (如 E2609-02) 完整 Upsert 至 Supabase
        // 前端再次以確定之 eventId 及雲端連結呼叫 saveEventToSupabase，確保本地狀態與 Supabase 完全同步
        if (!formData.eventId && result.eventId) {
          saveEventToSupabase(userId || 'TEST_USER_ID', {
            eventId: result.eventId,
            name: formData.name.trim(),
            nameEn: formData.nameEn.trim(),
            startDate: formData.startDate,
            endDate: formData.endDate || formData.startDate,
            deadline: formData.deadline,
            cost: formData.cost.trim(),
            status: formData.status,
            shortDesc: formData.shortDesc.trim(),
            shortDescEn: formData.shortDescEn.trim(),
            fullDesc: formData.fullDesc.trim(),
            fullDescEn: formData.fullDescEn.trim(),
            imageUrl: result.imageUrl || formData.imageUrl,
            driveFolderUrl: result.driveFolderUrl,
            spreadsheetUrl: result.spreadsheetUrl,
            spreadsheetId: result.spreadsheetId,
            lineGroupUrl: groupUrlTrimmed
          }).catch(err => console.warn('[AdminEvents] 前端確認同步 Supabase 警告:', err));
        }

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
    // 1. 優先極速更新 Supabase (< 30ms)
    updateEventStatusInSupabase(userId || 'TEST_USER_ID', eventId, newStatus).catch(sbErr => {
      console.warn('[AdminEvents] Supabase 活動狀態更新例外:', sbErr);
    });

    // 2. 立即無延遲更新前端 UI 與快取
    setEvents((prev) => {
      const next = prev.map((e) => (e.id === eventId ? { ...e, status: newStatus } : e));
      setCache(CACHE_KEY_ADMIN_EVENTS, next, 180);
      return next;
    });

    // 3. Supabase 已透過 Triggers 自動排入 sync_queue，由背景 Worker 平滑同步至 Google Sheets，無須前端呼叫 GAS 改試算表
  };

  // 幹部專用：一鍵建立活動專屬獨立試算表與雲端資料夾，或於開啟試算表時先同步最新名冊再跳轉開啟
  const handleCreateEventSheet = async (eventId: string, silent: boolean = false, openAfterSync: boolean = false) => {
    if (!userId || userId === 'TEST_USER_ID') {
      if (!silent) alert(t('adminEvents.errorNoUser', '無法取得使用者身分或權限不足'));
      return;
    }

    setCreatingSheetEventId(eventId);
    try {
      const query = new URLSearchParams({
        action: 'create_event_sheet',
        userId: userId,
        eventId: eventId
      });

      const result = await gasGet<any>(appendAuthToken(`${GAS_API_URL}?${query.toString()}`));

      if (result.status === 'success') {
        const targetUrl = result.spreadsheetUrl || events.find(e => e.id === eventId)?.spreadsheetUrl;
        setEvents((prev) => {
          const next = prev.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  spreadsheetUrl: result.spreadsheetUrl || e.spreadsheetUrl,
                  spreadsheetId: result.spreadsheetId || e.spreadsheetId,
                  driveFolderUrl: result.driveFolderUrl || e.driveFolderUrl
                }
              : e
          );
          setCache(CACHE_KEY_ADMIN_EVENTS, next, 180);
          return next;
        });

        const syncMsg = result.message || '試算表同步成功！';
        setToastMessage(syncMsg);

        if (openAfterSync && targetUrl) {
          try {
            if (liff && typeof liff.isInClient === 'function' && liff.isInClient()) {
              liff.openWindow({ url: targetUrl, external: true });
            } else {
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
          } catch (openErr) {
            console.warn('[handleCreateEventSheet] 開啟試算表異常:', openErr);
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        }

        if (!silent) {
          alert(syncMsg);
        }
      } else {
        const errMsg = result.message || '建立或同步活動試算表失敗';
        setToastMessage('[錯誤] ' + errMsg);
        alert('[錯誤] 同步試算表失敗: ' + errMsg);
      }
    } catch (err: any) {
      const exMsg = err?.message || String(err);
      console.error('[handleCreateEventSheet] 例外:', err);
      const targetUrl = events.find((e) => e.id === eventId)?.spreadsheetUrl;
      const isWebKitLoadFailed = exMsg.toLowerCase().includes('load failed') || exMsg.toLowerCase().includes('failed to fetch');

      if (isWebKitLoadFailed && targetUrl) {
        // iOS WebKit 跨域 302 重導向限制：後端 GAS 實際上已順利接收並在背景執行試算表同步
        const backgroundMsg = '已發送同步請求至 Google 試算表！名冊將於背景完成更新。';
        setToastMessage(backgroundMsg);

        if (openAfterSync) {
          try {
            if (liff && typeof liff.isInClient === 'function' && liff.isInClient()) {
              liff.openWindow({ url: targetUrl, external: true });
            } else {
              window.open(targetUrl, '_blank', 'noopener,noreferrer');
            }
          } catch (openErr) {
            console.warn('[handleCreateEventSheet] 外部開啟分頁異常:', openErr);
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
          }
        }

        if (!silent) {
          alert(backgroundMsg);
        }
      } else {
        setToastMessage('[錯誤] 試算表連線異常: ' + exMsg);
        alert('[錯誤] 建立或同步試算表異常: ' + exMsg);
      }
    } finally {
      setCreatingSheetEventId(null);
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
        // 先顯示快取以提供極速體驗，但不阻斷後續從 Supabase 取得最新權威名單
      } else {
        setLoadingSignups(true);
      }
    } else {
      setLoadingSignups(true);
    }
    let loadedFromSb = false;
    try {
      try {
        // 1. 無論是否 forceRefresh，一律優先從 Supabase 秒開讀取報名名冊 (< 50ms)
        const sbSignups = await fetchAdminEventSignupsFromSupabase(userId || 'TEST_USER_ID', evt.id);
        if (sbSignups) {
          loadedFromSb = true;
          setSignupsList(sbSignups);
          setCache(cacheKey, sbSignups, 120);
          setLoadingSignups(false);
          if (forceRefresh) {
            setToastMessage('已同步最新資料！');
          }
        }
      } catch (sbErr) {
        console.warn('[AdminEvents] Supabase 報名名冊讀取例外:', sbErr);
      }

      // 2. 僅在 Supabase 尚未配置或讀取失敗時，由 GAS 備援
      if (!loadedFromSb) {
        const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_event_signups&eventId=${evt.id}&userId=${userId || 'TEST_USER_ID'}`));
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.signups)) {
          setSignupsList(data.signups);
          setCache(cacheKey, data.signups, 120);
          if (forceRefresh) {
            setToastMessage('已同步最新資料！');
          }
        } else if (!loadedFromSb) {
          setSignupsList([]);
        }
      }
    } catch (err) {
      console.error('讀取報名名冊失敗:', err);
      if (!loadedFromSb) setSignupsList([]);
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
    const targetSignupCode = (applicant.signupCode || (applicant as any).id || '').trim();

    try {
      if (!targetSignupCode) {
        throw new Error('缺少報名序號/代碼 (Missing Signup Code)');
      }

      // 1. 優先極速更新 Supabase (< 30ms)
      const sbSuccess = await updateSignupStatusInSupabase(
        userId || 'TEST_USER_ID',
        selectedEventForSignups?.id || '',
        targetSignupCode,
        newResult
      );

      if (!sbSuccess) {
        const lastErr = getLastSupabaseError() || 'Supabase RPC 審核狀態寫入被拒絕或失敗';
        throw new Error(lastErr);
      }

      // 2. 審核狀態已成功寫入 Supabase (並由 Triggers 自動排入 sync_queue 供試算表背景同步)
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
          const isMatch = s.rowNumber === applicant.rowNumber || s.signupCode === targetSignupCode;
          return isMatch ? { ...s, reviewResult: newResult, notifyStatus: '' } : s;
        });
        if (selectedEventForSignups?.id) {
          setCache(CACHE_KEY_SIGNUPS_PREFIX + selectedEventForSignups.id, updated, 120);
        }
        return updated;
      });

      if (profileModalApplicant && (profileModalApplicant.rowNumber === applicant.rowNumber || profileModalApplicant.signupCode === targetSignupCode)) {
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
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error('更新審核狀態失敗:', err);
      alert(`更新審核狀態失敗: ${errMsg}`);
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

    // 依據規格防呆：若名冊中有正取人員待發送，但活動尚未填寫群組連結，阻擋推播並提示
    const hasUnnotifiedAccepted = signupsList.some(
      (s) => s.reviewResult.indexOf('正取') > -1 && s.notifyStatus !== '已通知'
    );
    if (hasUnnotifiedAccepted && !selectedEventForSignups.lineGroupUrl) {
      alert('此活動尚未設定專屬群組連結 (LINE Group URL)！\n\n系統規範在發送「正取通知」前，必須先於活動編輯頁面設定群組邀請連結，供社員一鍵入群。請先點選「編輯活動」填寫群組連結後再發送推播！');
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

  // 篩選進行中與結束未滿 14 天之活動（結束逾 14 天者自動歸檔至歷史活動頁）
  const activeEvents = useMemo(() => {
    return events.filter((evt) => !isEventArchived(evt, 14));
  }, [events]);

  const archivedCount = useMemo(() => {
    return events.filter((evt) => isEventArchived(evt, 14)).length;
  }, [events]);

  // 篩選與排序後活動列表
  const filteredEvents = useMemo(() => {
    const list = activeEvents.filter((evt) => {
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

        {userId && userId !== 'TEST_USER_ID' ? (
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
        ) : (
          <a
            href="https://liff.line.me/2009217429-DSYjXqNK"
            style={{
              display: 'block',
              width: '100%',
              padding: '12px 24px',
              borderRadius: '12px',
              fontWeight: 'bold',
              backgroundColor: '#06c755',
              color: '#fff',
              textDecoration: 'none',
              marginBottom: '16px',
              boxSizing: 'border-box'
            }}
          >
            由 LINE 開啟以驗證幹部身分
          </a>
        )}

        <button
          type="button"
          onClick={() => safeNavigateBack(navigate, '/dashboard')}
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
      <div className="admin-events-container animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', textAlign: 'left' }}>
      {/* 錯誤/警告提示 Banner */}
      {errorNotice && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#991b1b',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: '1.5'
        }}>
          <strong>系統提示 (Diagnostics):</strong><br />
          {errorNotice}
        </div>
      )}

      {/* 區塊一：活動列表與審核總覽 (Tab: list) */}
      {activeTab === 'list' && (
        <div>
          {/* 同步成功提示 Toast */}
          {toastMessage && (
            <div style={{
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
              fontWeight: 600,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}>
              <CheckCircle2 size={16} color="#059669" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Notion 搜尋、篩選、排序、重新整理、歷史活動與發布活動列 */}
          <NotionFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="搜尋活動名稱或代號..."
            filters={eventFilters}
            sortOptions={EVENT_SORT_OPTIONS}
            sortBy={eventSortBy}
            sortOrder={eventSortOrder}
            onSortChange={(k, o) => {
              setEventSortBy(k as any);
              setEventSortOrder(o);
            }}
            onRefresh={() => fetchEvents(true)}
            isRefreshing={isRefreshingEvents || loadingEvents}
            extraBeforeAdd={
              <button
                type="button"
                onClick={() => navigate('/admin/events/history')}
                title={`歷史活動歸檔 (${archivedCount} 場)`}
                style={{
                  position: 'relative',
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
                <History size={18} />
                {archivedCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    backgroundColor: '#64748b',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '1px 5px',
                    borderRadius: '10px',
                    lineHeight: 1
                  }}>
                    {archivedCount}
                  </span>
                )}
              </button>
            }
            onAdd={resetFormForCreate}
            addTooltip="發布新活動"
          />

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
                  onCreateSheet={handleCreateEventSheet}
                  isCreatingSheet={creatingSheetEventId === evt.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 區塊二：發布新活動 / 編輯活動表單 (Tab: create) */}
      {activeTab === 'create' && (
        <div>
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={16} />
              <span>返回活動列表</span>
            </button>
            {/* 中英分頁切換按鈕 (取代原本的「發布新活動」文字) */}
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              backgroundColor: '#f1f5f9',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => setActiveLangTab('zh')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: activeLangTab === 'zh' ? '#ffffff' : 'transparent',
                  color: activeLangTab === 'zh' ? '#059669' : '#64748b',
                  boxShadow: activeLangTab === 'zh' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{t('adminEvents.tabZh', '中文 (ZH)')}</span>
                {formData.name.trim() && formData.shortDesc.trim() && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveLangTab('en')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: 'none',
                  backgroundColor: activeLangTab === 'en' ? '#ffffff' : 'transparent',
                  color: activeLangTab === 'en' ? '#059669' : '#64748b',
                  boxShadow: activeLangTab === 'en' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>{t('adminEvents.tabEn', 'English (EN)')}</span>
                {formData.nameEn.trim() && formData.shortDescEn.trim() && (
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                )}
              </button>
            </div>
          </div>
          <AdminEventForm
            isEditing={isEditing}
            formData={formData}
            setFormData={setFormData}
            previewImage={previewImage}
            onImageChange={handleImageChange}
            submittingForm={submittingForm}
            onSubmit={handleSubmitEvent}
            onCancelEdit={() => setActiveTab('list')}
            activeLangTab={activeLangTab}
            setActiveLangTab={setActiveLangTab}
            onSaveDraft={handleSaveDraft}
            savingDraft={savingDraft}
          />
        </div>
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
    </div>
  );
}

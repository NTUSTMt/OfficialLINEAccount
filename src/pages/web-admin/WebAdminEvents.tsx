import React, { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Plus,
  Edit3,
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  X,
  Save,
  CheckCircle2,
  Mountain,
  Link2,
  ImageIcon,
  Check,
  Globe,
  Trash2
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import { getDirectImageUrl } from '../../utils/image';
import { GAS_API_URL } from '../../constants/api';
import { withAuthPayload } from '../../utils/api';
import './webAdmin.css';

interface AdminEventRecord {
  id: string;
  title: string;
  title_en?: string;
  start_date: string;
  end_date: string;
  deadline?: string;
  fee?: number | string;
  status: string;
  summary?: string;
  summary_en?: string;
  itinerary?: string;
  itinerary_en?: string;
  cover_image?: string;
  cover_image_url?: string;
  line_group_url?: string;
  folder_url?: string;
  drive_folder_url?: string;
  signup_sheet_url?: string;
  spreadsheet_url?: string;
  sheet_id?: string;
}

// 判定截止日期是否已過
const isDeadlinePassed = (deadlineStr?: string): boolean => {
  if (!deadlineStr) return false;
  try {
    const clean = deadlineStr.replace(/\//g, '-').trim();
    const m = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 23, 59, 59, 999);
      return !isNaN(d.getTime()) && Date.now() > d.getTime();
    }
  } catch {
    return false;
  }
  return false;
};

// 計算衍生狀態：開放、未來開放、關閉、已截止
const getComputedEventStatus = (status: string, deadline?: string): '開放' | '未來開放' | '關閉' | '已截止' => {
  if (status === '開放' || status === '開放報名中' || status === '開放中') {
    return isDeadlinePassed(deadline) ? '已截止' : '開放';
  }
  if (status === '未來開放') {
    return '未來開放';
  }
  if (status === '已截止' || status === '報名已截止') {
    return '已截止';
  }
  return '關閉';
};

// 狀態對應色彩設定
const STATUS_STYLE_MAP: Record<string, { bgColor: string; color: string; borderColor: string; dotColor: string }> = {
  開放: {
    bgColor: '#dcfce7',
    color: '#15803d',
    borderColor: '#bbf7d0',
    dotColor: '#16a34a',
  },
  未來開放: {
    bgColor: '#ffedd5',
    color: '#c2410c',
    borderColor: '#fed7aa',
    dotColor: '#ea580c',
  },
  已截止: {
    bgColor: '#fef2f2',
    color: '#b91c1c',
    borderColor: '#fecaca',
    dotColor: '#dc2626',
  },
  關閉: {
    bgColor: '#f1f5f9',
    color: '#475569',
    borderColor: '#e2e8f0',
    dotColor: '#94a3b8',
  },
};

export const WebAdminEvents: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const navigate = useNavigate();
  const [events, setEvents] = useState<AdminEventRecord[]>([]);
  const [signupCounts, setSignupCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 篩選、搜尋與排序狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('startDateDesc');

  // 置中彈窗狀態 (新增 / 編輯活動)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifyOfficerGroup, setNotifyOfficerGroup] = useState(false);

  // 本機圖片選取狀態
  const [selectedFile, setSelectedFile] = useState<{ base64: string; name: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string>('');

  // 表單資料狀態 (包含共用設定與中英文雙欄獨立內容)
  const [formData, setFormData] = useState({
    id: '',
    status: '開放',
    start_date: '',
    end_date: '',
    deadline: '',
    fee: '',
    line_group_url: '',
    cover_image_url: '',
    title: '',
    summary: '',
    itinerary: '',
    title_en: '',
    summary_en: '',
    itinerary_en: '',
  });

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 1. 載入活動列表與報名人數
  const loadEvents = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [eventsRes, signupsRes] = await Promise.all([
        client.from('events').select('*').order('start_date', { ascending: false }),
        client.from('event_signups').select('id, event_id, status'),
      ]);

      if (eventsRes.error) {
        throw new Error(`[載入活動失敗]: ${eventsRes.error.message} (代碼: ${eventsRes.error.code || 'UNKNOWN'})`);
      }

      const list: AdminEventRecord[] = (eventsRes.data || []).map((e: any) => ({
        ...e,
        cover_image: e.cover_image_url || e.cover_image || '',
      }));

      const countsMap: Record<string, number> = {};
      (signupsRes.data || []).forEach((s: any) => {
        if (s.event_id && s.status && !s.status.includes('取消') && !s.status.includes('Cancelled')) {
          countsMap[s.event_id] = (countsMap[s.event_id] || 0) + 1;
        }
      });

      setEvents(list);
      setSignupCounts(countsMap);

      logWebAuditAction(client, session.userId, 'VIEW_EVENTS_LIST', 'events', undefined, {
        count: list.length,
      });
    } catch (err: any) {
      console.error('[WebAdminEvents] loadEvents error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [client]);

  // 2. 本機圖片選取與壓縮處理
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg(`[檔案過大]: 圖片「${file.name}」超過 10MB 限制`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 2048;
        const maxHeight = 2048;

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

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.88);
        setSelectedFile({ base64: compressedBase64, name: file.name });
        setPreviewImage(compressedBase64);
        setFormData((prev) => ({ ...prev, cover_image_url: compressedBase64 }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 3. 開啟新增彈窗
  const handleOpenCreate = () => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `E${yy}${mm}-`;

    let maxSeq = 0;
    events.forEach((e) => {
      if (e.id.startsWith(prefix)) {
        const seqPart = parseInt(e.id.slice(prefix.length), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) {
          maxSeq = seqPart;
        }
      }
    });
    const nextSeq = String(maxSeq + 1).padStart(2, '0');

    setEditingEventId(null);
    setSelectedFile(null);
    setPreviewImage('');
    setNotifyOfficerGroup(false);
    setFormData({
      id: `${prefix}${nextSeq}`,
      status: '開放',
      start_date: '',
      end_date: '',
      deadline: '',
      fee: '0',
      line_group_url: '',
      cover_image_url: '',
      title: '',
      summary: '',
      itinerary: '',
      title_en: '',
      summary_en: '',
      itinerary_en: '',
    });
    setModalOpen(true);
    setErrorMsg(null);
  };

  // 4. 開啟編輯彈窗
  const handleOpenEdit = (event: AdminEventRecord) => {
    setEditingEventId(event.id);
    setSelectedFile(null);
    setNotifyOfficerGroup(false);
    const existingImg = event.cover_image_url || event.cover_image || '';
    setPreviewImage(existingImg ? (getDirectImageUrl(existingImg, 600) || existingImg) : '');
    setFormData({
      id: event.id,
      status: event.status === '開放報名中' ? '開放' : event.status || '開放',
      start_date: event.start_date || '',
      end_date: event.end_date || '',
      deadline: event.deadline ? event.deadline.split('T')[0] : '',
      fee: event.fee !== undefined ? String(event.fee) : '0',
      line_group_url: event.line_group_url || '',
      cover_image_url: existingImg,
      title: event.title || '',
      summary: event.summary || '',
      itinerary: event.itinerary || '',
      title_en: event.title_en || '',
      summary_en: event.summary_en || '',
      itinerary_en: event.itinerary_en || '',
    });
    setModalOpen(true);
    setErrorMsg(null);
  };

  // 5. 刪除活動（連帶清除報名名冊與心得，並跳出二次確認）
  const handleDeleteEvent = async () => {
    if (!editingEventId) return;

    try {
      setDeleting(true);
      setErrorMsg(null);

      // 查詢該活動目前報名人數
      const { count, error: countErr } = await client
        .from('event_signups')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', editingEventId);

      if (countErr) {
        throw new Error(`[查詢報名名冊失敗]: ${countErr.message}`);
      }

      const signupCount = count || 0;
      const confirmPrompt = signupCount > 0
        ? `此活動目前已有 ${signupCount} 位社員報名！\n\n刪除活動將一併清除該活動的所有報名名冊與心得紀錄。\n\n確定要強制刪除活動「[${formData.id}] ${formData.title}」嗎？此動作無法復原！`
        : `確定要刪除活動「[${formData.id}] ${formData.title}」嗎？此動作無法復原！`;

      if (!window.confirm(confirmPrompt)) {
        setDeleting(false);
        return;
      }

      // 1. 刪除關聯心得 (reflections)
      const { error: refErr } = await client
        .from('reflections')
        .delete()
        .eq('event_id', editingEventId);
      if (refErr) {
        throw new Error(`[清除活動心得失敗]: ${refErr.message}`);
      }

      // 2. 刪除關聯報名名冊 (event_signups)
      const { error: signupDelErr } = await client
        .from('event_signups')
        .delete()
        .eq('event_id', editingEventId);
      if (signupDelErr) {
        throw new Error(`[清除活動報名名冊失敗]: ${signupDelErr.message}`);
      }

      // 3. 刪除活動本體 (events)
      const { error: eventDelErr } = await client
        .from('events')
        .delete()
        .eq('id', editingEventId);
      if (eventDelErr) {
        throw new Error(`[刪除活動失敗]: ${eventDelErr.message}`);
      }

      await logWebAuditAction(client, session.userId, 'DELETE_EVENT', 'events', editingEventId, {
        id: editingEventId,
        title: formData.title,
        deletedSignupsCount: signupCount,
      });

      setSuccessMsg(`活動「[${formData.id}] ${formData.title}」已成功刪除！`);
      setModalOpen(false);
      loadEvents();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('[WebAdminEvents] handleDeleteEvent error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setDeleting(false);
    }
  };

  // 5. 儲存活動 (新增或修改)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.title.trim()) {
      setErrorMsg('[驗證失敗]: 活動代號與中文活動名稱為必填項目');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setErrorMsg('[驗證失敗]: 出隊開始日期與出隊結束日期均為必填項目');
      return;
    }

    if (!formData.deadline) {
      setErrorMsg('[驗證失敗]: 報名截止日期為必填項目');
      return;
    }

    const zhLength = (formData.summary || '').length + (formData.itinerary || '').length;
    if (zhLength > 1400) {
      setErrorMsg(`[字數超出限制]: 中文簡介與行程合計共 ${zhLength} 字，超過 LINE 卡片傳送上限 1400 字！`);
      return;
    }

    const enLength = (formData.summary_en || '').length + (formData.itinerary_en || '').length;
    if (enLength > 1400) {
      setErrorMsg(`[字數超出限制]: 英文簡介與行程合計共 ${enLength} 字，超過 LINE 卡片傳送上限 1400 字！`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      let finalCoverUrl = formData.cover_image_url.trim();

      // 若有新選取之本機圖檔，先呼叫 GAS API 壓縮上傳至 Google Drive 取得永續直連網址
      if (selectedFile) {
        try {
          const uploadPayload = {
            action: 'upload_image_to_drive',
            base64Data: selectedFile.base64,
            fileName: `event_${formData.id}_cover_${Date.now()}.jpg`,
            folderName: `活動封面_${formData.id}`
          };

          const gasRes = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(withAuthPayload(uploadPayload)),
            redirect: 'follow',
          });

          if (gasRes.ok) {
            const gasData = await gasRes.json();
            if (gasData.status === 'success' && gasData.imageUrl) {
              finalCoverUrl = gasData.imageUrl;
            }
          }
        } catch (uploadErr) {
          console.warn('[WebAdminEvents] 本機圖檔上傳 Drive 失敗，採用既有網址:', uploadErr);
        }
      }

      // 使用 save_admin_event_rpc 預存程序 (SECURITY DEFINER，完全豁免 RLS 42501，自帶 sync_queue 佇列同步)
      const eventData = {
        eventId: editingEventId || formData.id.trim(),
        name: formData.title.trim(),
        nameEn: formData.title_en.trim(),
        startDate: formData.start_date,
        endDate: formData.end_date || formData.start_date,
        deadline: formData.deadline ? `${formData.deadline} 23:59:59+08` : (formData.start_date ? `${formData.start_date} 23:59:59+08` : ''),
        cost: String(formData.fee || 0),
        status: formData.status,
        shortDesc: formData.summary.trim(),
        shortDescEn: formData.summary_en.trim(),
        fullDesc: formData.itinerary.trim(),
        fullDescEn: formData.itinerary_en.trim(),
        imageUrl: finalCoverUrl || formData.cover_image_url || '',
        lineGroupUrl: formData.line_group_url.trim(),
      };

      const { data: rpcRes, error } = await client.rpc('save_admin_event_rpc', {
        p_officer_line_user_id: session.userId,
        p_event_data: eventData,
      });

      if (error) {
        throw new Error(`[${editingEventId ? '更新' : '新增'}活動失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      if (rpcRes?.status === 'error') {
        throw new Error(`[${editingEventId ? '更新' : '新增'}活動失敗]: ${rpcRes.message || '權限不足或資料格式錯誤'}`);
      }

      const savedEventId = rpcRes?.eventId || editingEventId || formData.id.trim();

      await logWebAuditAction(
        client,
        session.userId,
        editingEventId ? 'UPDATE_EVENT' : 'CREATE_EVENT',
        'events',
        savedEventId,
        eventData
      );

      if (editingEventId) {
        setSuccessMsg(`活動「${formData.title}」已成功更新！`);
      } else {
        setSuccessMsg(`新活動「${formData.title}」已成功建立！`);
      }

      // 若勾選推播至幹部群組
      if (notifyOfficerGroup) {
        try {
          const query = new URLSearchParams({
            action: 'notify_officer_event',
            userId: session.userId,
            eventId: savedEventId,
            name: formData.title.trim(),
            startDate: formData.start_date || '',
            endDate: formData.end_date || formData.start_date || '',
            deadline: formData.deadline || '',
            cost: String(formData.fee || 0),
            status: formData.status,
            isUpdate: String(!!editingEventId),
          });
          await fetch(`${GAS_API_URL}?${query.toString()}`);
        } catch (pushErr) {
          console.warn('[WebAdminEvents] 推播幹部群組失敗 (不影響活動儲存):', pushErr);
        }
      }

      setModalOpen(false);
      loadEvents();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('[WebAdminEvents] handleSaveEvent error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  // 各狀態數量統計
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      開放: 0,
      未來開放: 0,
      已截止: 0,
      關閉: 0,
    };
    events.forEach((e) => {
      const comp = getComputedEventStatus(e.status, e.deadline);
      counts[comp] = (counts[comp] || 0) + 1;
    });
    return counts;
  }, [events]);

  // 篩選與排序後的活動清單
  const filteredAndSortedEvents = useMemo(() => {
    const filtered = events.filter((e) => {
      const compStatus = getComputedEventStatus(e.status, e.deadline);

      const matchSearch =
        !searchQuery ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.title_en && e.title_en.toLowerCase().includes(searchQuery.toLowerCase())) ||
        e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.summary && e.summary.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'ALL' || compStatus === statusFilter;

      return matchSearch && matchStatus;
    });

    // 排序
    return filtered.sort((a, b) => {
      if (sortBy === 'startDateDesc') {
        return (b.start_date || '').localeCompare(a.start_date || '');
      }
      if (sortBy === 'startDateAsc') {
        return (a.start_date || '').localeCompare(b.start_date || '');
      }
      if (sortBy === 'deadlineAsc') {
        return (a.deadline || '9999').localeCompare(b.deadline || '9999');
      }
      if (sortBy === 'deadlineDesc') {
        return (b.deadline || '').localeCompare(a.deadline || '');
      }
      if (sortBy === 'idDesc') {
        return b.id.localeCompare(a.id);
      }
      if (sortBy === 'idAsc') {
        return a.id.localeCompare(b.id);
      }
      if (sortBy === 'statusOrder') {
        const orderWeight: Record<string, number> = { 開放: 1, 未來開放: 2, 已截止: 3, 關閉: 4 };
        const wA = orderWeight[getComputedEventStatus(a.status, a.deadline)] || 9;
        const wB = orderWeight[getComputedEventStatus(b.status, b.deadline)] || 9;
        return wA - wB;
      }
      return 0;
    });
  }, [events, searchQuery, statusFilter, sortBy]);

  // 中英文簡介與行程合計字數 (上限 1400 字，對應 LINE Flex 傳送限制)
  const zhTotalCount = (formData.summary || '').length + (formData.itinerary || '').length;
  const isZhOver = zhTotalCount > 1400;
  const enTotalCount = (formData.summary_en || '').length + (formData.itinerary_en || '').length;
  const isEnOver = enTotalCount > 1400;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 頂部操作工具列 */}
      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              placeholder="搜尋活動名稱、編號、簡介..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32, width: 220 }}
            />
          </div>

          {/* 狀態篩選：精準對齊真實狀態與截止日計算 */}
          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">全部狀態 ({events.length})</option>
            <option value="開放">開放中 ({statusCounts['開放'] || 0})</option>
            <option value="未來開放">未來開放 ({statusCounts['未來開放'] || 0})</option>
            <option value="已截止">已截止 ({statusCounts['已截止'] || 0})</option>
            <option value="關閉">已關閉 ({statusCounts['關閉'] || 0})</option>
          </select>

          {/* 多維度排序功能 */}
          <select
            className="web-admin-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            title="活動排序方式"
          >
            <option value="startDateDesc">出隊日期 (由新到舊)</option>
            <option value="startDateAsc">出隊日期 (由舊到新)</option>
            <option value="deadlineAsc">截止日期 (即將截止優先)</option>
            <option value="deadlineDesc">截止日期 (較晚截止優先)</option>
            <option value="idDesc">活動代號 (由新到舊)</option>
            <option value="idAsc">活動代號 (由舊到新)</option>
            <option value="statusOrder">活動狀態 (開放中優先)</option>
          </select>
        </div>

        <div className="web-admin-toolbar-right">
          {/* 純圖示重新整理按鈕 */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadEvents}
            title="重新整理活動清單"
            style={{ padding: '7px 10px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* 新增活動按鈕 */}
          <button
            type="button"
            className="web-admin-btn"
            onClick={handleOpenCreate}
          >
            <Plus size={16} />
            <span>新增活動</span>
          </button>
        </div>
      </div>

      {/* 成功與錯誤提示 */}
      {successMsg && (
        <div style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', border: '1px solid rgba(5, 150, 105, 0.3)', color: '#047857', padding: '10px 16px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 活動清單：LINE 風格頂部大圖卡片網格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--wa-text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 12px' }} />
          <div>活動資料載入中...</div>
        </div>
      ) : filteredAndSortedEvents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--wa-text-muted)', backgroundColor: 'var(--wa-surface)', borderRadius: 12, border: '1px dashed var(--wa-border)' }}>
          <Calendar size={36} style={{ margin: '0 auto 12px', color: 'var(--wa-text-muted)' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>目前無符合條件之活動</div>
          <div style={{ fontSize: '0.84rem', marginTop: 4 }}>請嘗試更換篩選條件或點擊「新增活動」建立。</div>
        </div>
      ) : (
        <div className="wa-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))' }}>
          {filteredAndSortedEvents.map((event) => {
            const computedStatus = getComputedEventStatus(event.status, event.deadline);
            const statusMeta = STATUS_STYLE_MAP[computedStatus] || STATUS_STYLE_MAP['關閉'];
            const rawCover = event.cover_image_url || event.cover_image || '';
            const cdnCover = rawCover ? (getDirectImageUrl(rawCover, 600) || rawCover) : '';

            return (
              <div key={event.id} className="wa-event-card">
                {/* 卡片頂部封面圖容器 (比例接近 LINE Flex 卡片) */}
                <div className="wa-event-card-cover">
                  {cdnCover ? (
                    <img
                      src={cdnCover}
                      alt={event.title}
                      className="wa-event-card-img"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fb = e.currentTarget.parentElement?.querySelector('.wa-event-card-fallback');
                        if (fb) (fb as HTMLElement).style.display = 'flex';
                      }}
                    />
                  ) : null}

                  <div
                    className="wa-event-card-fallback"
                    style={{ display: cdnCover ? 'none' : 'flex' }}
                  >
                    <Mountain size={28} />
                    <span>{event.id}</span>
                  </div>

                  {/* 圖片左上角：活動代號 */}
                  <div className="wa-event-badge-id">
                    {event.id}
                  </div>

                  {/* 圖片右上角：報名狀態與已報名人數 (如：8・開放) */}
                  <div
                    className="wa-event-badge-status"
                    style={{
                      backgroundColor: statusMeta.bgColor,
                      color: statusMeta.color,
                      border: `1px solid ${statusMeta.borderColor}`,
                    }}
                  >
                    <span
                      className="wa-event-badge-status-dot"
                      style={{ backgroundColor: statusMeta.dotColor }}
                    />
                    <span>{`${signupCounts[event.id] || 0}・${computedStatus}`}</span>
                  </div>
                </div>

                {/* 圖片下方為文字空間，文字皆靠左 */}
                <div className="wa-event-card-body">
                  {/* 名稱（中文 英文 只需要用空白隔開） */}
                  <h3 className="wa-event-card-title">
                    {event.title}{event.title_en ? ` ${event.title_en}` : ''}
                  </h3>

                  {/* 最多三行的簡介 */}
                  <p className="wa-event-card-summary" title={event.summary || ''}>
                    {event.summary || '尚無活動簡介說明'}
                  </p>

                  {/* 底部固定區域：活動日期、截止日期、預計費用、分隔線與操作按鈕，固定置底不因簡介字數少而浮動 */}
                  <div className="wa-event-card-footer">
                    {/* 活動詳細資訊 */}
                    <div className="wa-event-card-meta">
                      <div className="wa-event-card-meta-row">
                        <span className="wa-event-card-meta-label">活動日期：</span>
                        <span className="wa-event-card-meta-val">
                          {event.start_date ? event.start_date.replace(/-/g, '/') : '-'}
                          {event.end_date && event.end_date !== event.start_date ? ` ~ ${event.end_date.replace(/-/g, '/')}` : ''}
                        </span>
                      </div>

                      <div className="wa-event-card-meta-row">
                        <span className="wa-event-card-meta-label">截止日期：</span>
                        <span className="wa-event-card-meta-val">
                          {event.deadline ? event.deadline.split('T')[0].replace(/-/g, '/') : '-'}
                        </span>
                      </div>

                      <div className="wa-event-card-meta-row">
                        <span className="wa-event-card-meta-label">預計費用：</span>
                        <span className="wa-event-card-meta-val" style={{ color: 'var(--wa-primary)', fontWeight: 700 }}>
                          NT$ {Number(event.fee || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <hr className="wa-event-card-divider" />

                    {/* 底部操作按鈕：編輯活動 與 報名名冊 */}
                    <div className="wa-event-card-actions">
                      <button
                        type="button"
                        className="web-admin-btn web-admin-btn-secondary"
                        style={{ flex: 1, fontSize: '0.82rem', padding: '6px 12px' }}
                        onClick={() => handleOpenEdit(event)}
                      >
                        <Edit3 size={14} />
                        <span>編輯活動</span>
                      </button>

                      <button
                        type="button"
                        className="web-admin-btn"
                        style={{ flex: 1, fontSize: '0.82rem', padding: '6px 12px' }}
                        onClick={() => navigate(`/admin-web/roster?eventId=${event.id}`)}
                      >
                        <Users size={14} />
                        <span>報名名冊</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 置中活動新增 / 編輯彈窗 (Centered Modal) */}
      {modalOpen && (
        <div className="wa-modal-backdrop" onClick={() => !saving && !deleting && setModalOpen(false)}>
          <div className="wa-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* 彈窗頂部 */}
            <div className="wa-modal-header">
              <h2 className="wa-modal-title">
                <Calendar size={20} color="var(--wa-primary)" />
                <span>{editingEventId ? `編輯活動 [${formData.id}]` : '新增活動'}</span>
              </h2>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => !saving && setModalOpen(false)}
                title="關閉視窗"
              >
                <X size={18} />
              </button>
            </div>

            {/* 彈窗內容區 (可滾動) */}
            <form onSubmit={handleSaveEvent} style={{ display: 'contents' }}>
              <div className="wa-modal-body">
                {/* 區塊 1：共用設定區 (Shared Settings) */}
                <div style={{ backgroundColor: '#f8fafc', padding: '16px 18px', borderRadius: 12, border: '1px solid var(--wa-border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--wa-text)', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>
                    活動基本與共用設定
                  </div>

                  {/* 第一列：活動代號 與 活動狀態 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="wa-form-label">活動代號 *</label>
                      <input
                        type="text"
                        required
                        disabled={Boolean(editingEventId)}
                        className="web-admin-input"
                        value={formData.id}
                        onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase().trim() })}
                        style={{ fontFamily: 'monospace', width: '100%', backgroundColor: editingEventId ? '#f1f5f9' : '#ffffff' }}
                        placeholder="例如: E2609-01"
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">活動狀態 *</label>
                      <select
                        className="web-admin-select"
                        style={{ width: '100%' }}
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      >
                        <option value="開放">開放 (正式開放報名填表)</option>
                        <option value="未來開放">未來開放 (僅預告，暫不開放報名)</option>
                        <option value="關閉">關閉 (不公開活動)</option>
                      </select>
                    </div>
                  </div>

                  {/* 第二列：出隊日期區間 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="wa-form-label">出隊開始日期 *</label>
                      <input
                        type="date"
                        required
                        className="web-admin-input"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">出隊結束日期 *</label>
                      <input
                        type="date"
                        required
                        className="web-admin-input"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  {/* 第三列：報名截止日 與 預計費用 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="wa-form-label">報名截止日期 *</label>
                      <input
                        type="date"
                        required
                        className="web-admin-input"
                        value={formData.deadline}
                        onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">預計費用 (NT$) *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        className="web-admin-input"
                        value={formData.fee}
                        onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                        style={{ width: '100%' }}
                        placeholder="例如: 3500"
                      />
                    </div>
                  </div>

                  {/* 第四列：LINE 群組邀請連結 (保密) */}
                  <div>
                    <label className="wa-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Link2 size={14} color="var(--wa-primary)" />
                      <span>活動專屬 LINE 群組邀請連結 (保密)</span>
                    </label>
                    <input
                      type="url"
                      className="web-admin-input"
                      value={formData.line_group_url}
                      onChange={(e) => setFormData({ ...formData, line_group_url: e.target.value })}
                      style={{ width: '100%' }}
                      placeholder="https://line.me/R/ti/g/... 或 https://line.me/ti/g/..."
                    />
                    <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 4, textAlign: 'left' }}>
                      此連結為出隊專屬保密資訊，僅在幹部審核為正取並推播時提供正取社員加入。
                    </div>
                  </div>

                  {/* 第五列：封面照片設定 (支援檔案選取與 URL 雙軌) */}
                  <div>
                    <label className="wa-form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={14} color="var(--wa-primary)" />
                      <span>活動封面照片</span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          backgroundColor: '#ffffff',
                          border: '1.5px dashed var(--wa-border)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: 'var(--wa-text)',
                        }}
                      >
                        <ImageIcon size={15} />
                        <span>{selectedFile ? '更換圖片檔案' : '選取本機圖片'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          style={{ display: 'none' }}
                        />
                      </label>

                      <span style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)' }}>或直接貼上圖片網址：</span>

                      <input
                        type="url"
                        className="web-admin-input"
                        placeholder="https://lh3.googleusercontent.com/... 或 https://..."
                        value={formData.cover_image_url}
                        onChange={(e) => {
                          setFormData({ ...formData, cover_image_url: e.target.value });
                          setSelectedFile(null);
                          setPreviewImage(e.target.value);
                        }}
                        style={{ flex: 1, minWidth: 220 }}
                      />
                    </div>

                    {/* 圖片預覽縮圖 */}
                    {previewImage && (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 120, height: 70, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--wa-border)', backgroundColor: '#000' }}>
                          <img
                            src={previewImage}
                            alt="預覽"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                        {selectedFile && (
                          <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Check size={14} />
                            <span>已選取圖檔：{selectedFile.name} (儲存時將自動壓縮上傳)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 第六列：推播到幹部群組勾選框 (在封面照片下方) */}
                  <div style={{ padding: '10px 14px', backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid var(--wa-border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className="wa-checkbox"
                        checked={notifyOfficerGroup}
                        onChange={(e) => setNotifyOfficerGroup(e.target.checked)}
                      />
                      <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--wa-text)' }}>
                        同步推播活動資訊至幹部群組 (LINE)
                      </span>
                    </label>
                    <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 4, textAlign: 'left' }}>
                      勾選後儲存時將自動向 LINE 幹部群組發送活動出隊摘要訊息
                    </div>
                  </div>
                </div>

                {/* 區塊 2：中英文雙欄對稱編輯區 (Bilingual 2-Column Grid) */}
                <div className="wa-bilingual-grid">
                  {/* 左欄：中文內容 (Traditional Chinese) */}
                  <div className="wa-bilingual-col">
                    <div className="wa-bilingual-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Globe size={15} color="var(--wa-primary)" />
                        <span>中文內容 (Traditional Chinese)</span>
                      </div>
                    </div>

                    <div>
                      <label className="wa-form-label">活動名稱 (中文) *</label>
                      <input
                        type="text"
                        required
                        className="web-admin-input"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="例如: 雪山主東峰雪期攀登"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">活動簡介 (中文)</label>
                      <textarea
                        className="web-admin-textarea"
                        rows={4}
                        value={formData.summary}
                        onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                        placeholder="請填寫簡短吸引人的中文出隊介紹..."
                        style={{ width: '100%', minHeight: 110, backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">詳細行程與裝備要求 (中文)</label>
                      <textarea
                        className="web-admin-textarea"
                        rows={12}
                        value={formData.itinerary}
                        onChange={(e) => setFormData({ ...formData, itinerary: e.target.value })}
                        placeholder="D0 台北集合出發&#10;D1 登山口 -> 七卡山莊 -> 三六九山莊&#10;D2 主峰登頂 -> 下山返程..."
                        style={{ width: '100%', minHeight: 260, backgroundColor: '#ffffff' }}
                      />
                      <div style={{ textAlign: 'left', fontSize: '0.76rem', color: isZhOver ? '#dc2626' : 'var(--wa-text-muted)', marginTop: 4 }}>
                        中文總字數 (簡介+行程)：{zhTotalCount} / 1400 字 (LINE 卡片傳送上限)
                        {isZhOver && ' (已超出上限)'}
                      </div>
                    </div>
                  </div>

                  {/* 右欄：英文內容 (English Translation) */}
                  <div className="wa-bilingual-col">
                    <div className="wa-bilingual-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Globe size={15} color="#2563eb" />
                        <span>英文內容 (English Translation)</span>
                      </div>
                    </div>

                    <div>
                      <label className="wa-form-label">Event Title (English)</label>
                      <input
                        type="text"
                        className="web-admin-input"
                        value={formData.title_en}
                        onChange={(e) => setFormData({ ...formData, title_en: e.target.value })}
                        placeholder="e.g. Snow Mountain Main & East Peak"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">Short Summary (English)</label>
                      <textarea
                        className="web-admin-textarea"
                        rows={4}
                        value={formData.summary_en}
                        onChange={(e) => setFormData({ ...formData, summary_en: e.target.value })}
                        placeholder="Brief summary in English for international members..."
                        style={{ width: '100%', minHeight: 110, backgroundColor: '#ffffff' }}
                      />
                    </div>

                    <div>
                      <label className="wa-form-label">Detailed Itinerary & Gear (English)</label>
                      <textarea
                        className="web-admin-textarea"
                        rows={12}
                        value={formData.itinerary_en}
                        onChange={(e) => setFormData({ ...formData, itinerary_en: e.target.value })}
                        placeholder="Day 0: Meet in Taipei&#10;Day 1: Trailhead -> 369 Cabin&#10;Day 2: Summit -> Return..."
                        style={{ width: '100%', minHeight: 260, backgroundColor: '#ffffff' }}
                      />
                      <div style={{ textAlign: 'left', fontSize: '0.76rem', color: isEnOver ? '#dc2626' : 'var(--wa-text-muted)', marginTop: 4 }}>
                        English Total (Summary+Itinerary): {enTotalCount} / 1400 chars (LINE Flex Limit)
                        {isEnOver && ' (Exceeded limit)'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 彈窗底部固定按鈕列 */}
              <div className="wa-modal-footer">
                {editingEventId && (
                  <button
                    type="button"
                    className="web-admin-btn"
                    style={{
                      marginRight: 'auto',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                    }}
                    onClick={handleDeleteEvent}
                    disabled={saving || deleting}
                  >
                    <Trash2 size={15} />
                    <span>{deleting ? '刪除中...' : '刪除活動'}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="web-admin-btn web-admin-btn-secondary"
                  onClick={() => !saving && !deleting && setModalOpen(false)}
                  disabled={saving || deleting}
                >
                  <span>取消</span>
                </button>

                <button
                  type="submit"
                  className="web-admin-btn"
                  disabled={saving || deleting}
                >
                  <Save size={15} />
                  <span>{saving ? '處理中...' : editingEventId ? '儲存活動變更' : '新增活動'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

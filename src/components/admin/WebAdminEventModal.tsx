import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Calendar,
  Check,
  Globe,
  ImageIcon,
  Link2,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { GAS_API_URL } from '../../constants/api';
import type { ScheduleFeedItem } from '../../types/schedule';
import { translateEventViaAi, withAuthPayload } from '../../utils/api';
import { buildTaiwanIsoString, parseTaiwanDeadline } from '../../utils/dateUtils';
import { getDirectImageUrl, validateImageUploadFile } from '../../utils/image';
import { detectScheduleConflicts } from '../../utils/scheduleHighlightUtils';
import { logWebAuditAction, type WebAuthSession } from '../../utils/webAuth';

export interface AdminEventRecord {
  id: string;
  title: string;
  title_en?: string;
  summary?: string;
  summary_en?: string;
  itinerary?: string;
  itinerary_en?: string;
  start_date?: string;
  end_date?: string;
  deadline?: string;
  fee?: number;
  status: string;
  cover_image_url?: string;
  line_group_url?: string;
  updated_at?: string;
}

export interface EventFormData {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  deadline: string;
  deadline_time: string;
  fee: string;
  line_group_url: string;
  cover_image_url: string;
  title: string;
  summary: string;
  itinerary: string;
  title_en: string;
  summary_en: string;
  itinerary_en: string;
}

const createEmptyEventFormData = (
  overrides?: Partial<EventFormData>,
): EventFormData => ({
  id: '',
  status: '未來開放',
  start_date: '',
  end_date: '',
  deadline: '',
  deadline_time: '23:59',
  fee: '',
  line_group_url: '',
  cover_image_url: '',
  title: '',
  summary: '',
  itinerary: '',
  title_en: '',
  summary_en: '',
  itinerary_en: '',
  ...overrides,
});

interface WebAdminEventModalProps {
  isOpen: boolean;
  editingEvent?: AdminEventRecord | null;
  initialFormOverrides?: Partial<EventFormData>;
  conflictSourceItems?: ScheduleFeedItem[];
  session: WebAuthSession;
  client: SupabaseClient;
  onClose: () => void;
  onSaved: (result: {
    action: 'create' | 'update' | 'delete';
    eventId: string;
    title: string;
  }) => void;
  onError?: (message: string) => void;
}

/**
 * 共用活動新增 / 編輯彈窗
 * - 預設狀態為「未來開放」，非「開放」狀態時僅活動代號、中文名稱與起訖日期為必填
 * - 支援即時非阻擋式排程衝突提醒
 */
export const WebAdminEventModal: React.FC<WebAdminEventModalProps> = ({
  isOpen,
  editingEvent = null,
  initialFormOverrides,
  conflictSourceItems = [],
  session,
  client,
  onClose,
  onSaved,
  onError,
}) => {
  const editingEventId = editingEvent?.id || null;

  const [formData, setFormData] = useState<EventFormData>(() =>
    createEmptyEventFormData(initialFormOverrides),
  );
  const [selectedFile, setSelectedFile] = useState<{ base64: string; name: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string>('');
  const [notifyOfficerGroup, setNotifyOfficerGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationSnapshot, setTranslationSnapshot] = useState<{
    title_en: string;
    summary_en: string;
    itinerary_en: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setModalError(null);
    setTranslationSnapshot(null);
    setSelectedFile(null);

    if (editingEvent) {
      const parsedDl = parseTaiwanDeadline(editingEvent.deadline || '');
      setPreviewImage(
        (editingEvent.cover_image_url ? getDirectImageUrl(editingEvent.cover_image_url) : '') || '',
      );
      setNotifyOfficerGroup(false);
      setFormData(
        createEmptyEventFormData({
          id: editingEvent.id || '',
          status: editingEvent.status || '未來開放',
          start_date: editingEvent.start_date ? String(editingEvent.start_date).slice(0, 10) : '',
          end_date: editingEvent.end_date ? String(editingEvent.end_date).slice(0, 10) : '',
          deadline: parsedDl.date,
          deadline_time: parsedDl.time || '23:59',
          fee: editingEvent.fee !== undefined && editingEvent.fee !== null ? String(editingEvent.fee) : '',
          line_group_url: editingEvent.line_group_url || '',
          cover_image_url: editingEvent.cover_image_url || '',
          title: editingEvent.title || '',
          summary: editingEvent.summary || '',
          itinerary: editingEvent.itinerary || '',
          title_en: editingEvent.title_en || '',
          summary_en: editingEvent.summary_en || '',
          itinerary_en: editingEvent.itinerary_en || '',
        }),
      );
    } else {
      setPreviewImage('');
      setNotifyOfficerGroup(false);
      setFormData(createEmptyEventFormData(initialFormOverrides));
    }
  }, [isOpen, editingEvent, initialFormOverrides]);

  const isOpenStatus = formData.status === '開放';
  const zhTotalCount = (formData.summary || '').length + (formData.itinerary || '').length;
  const enTotalCount = (formData.summary_en || '').length + (formData.itinerary_en || '').length;
  const isZhOver = zhTotalCount > 1400;
  const isEnOver = enTotalCount > 1400;

  const scheduleConflicts = useMemo(
    () =>
      detectScheduleConflicts(
        formData.start_date,
        formData.end_date || formData.start_date,
        conflictSourceItems,
        editingEventId,
      ),
    [formData.start_date, formData.end_date, conflictSourceItems, editingEventId],
  );

  if (!isOpen) return null;

  const reportError = (msg: string) => {
    setModalError(msg);
    if (onError) onError(msg);
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageUploadFile(file, 10 * 1024 * 1024);
    if (!validation.valid) {
      reportError(`[檔案驗證失敗]: ${validation.error || '圖片不合法'}`);
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
        } else if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.88);
        setSelectedFile({ base64: compressedBase64, name: file.name });
        setPreviewImage(compressedBase64);
        setFormData((prev) => ({ ...prev, cover_image_url: '' }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAiTranslate = async () => {
    if (isTranslating) return;
    if (!formData.title && !formData.summary && !formData.itinerary) {
      alert('請先填寫中文活動名稱、簡介或行程內容');
      return;
    }

    setIsTranslating(true);
    setTranslationSnapshot({
      title_en: formData.title_en || '',
      summary_en: formData.summary_en || '',
      itinerary_en: formData.itinerary_en || '',
    });

    const res = await translateEventViaAi(
      {
        title: formData.title || '',
        summary: formData.summary || '',
        itinerary: formData.itinerary || '',
      },
      session?.userId,
    );

    setIsTranslating(false);

    if (!res.success || !res.translation) {
      alert(`AI 翻譯失敗: ${res.error || '未知錯誤'}`);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      title_en: res.translation!.title_en || prev.title_en,
      summary_en: res.translation!.summary_en || prev.summary_en,
      itinerary_en: res.translation!.itinerary_en || prev.itinerary_en,
    }));
  };

  const handleUndoTranslation = () => {
    if (!translationSnapshot) return;
    setFormData((prev) => ({
      ...prev,
      title_en: translationSnapshot.title_en,
      summary_en: translationSnapshot.summary_en,
      itinerary_en: translationSnapshot.itinerary_en,
    }));
    setTranslationSnapshot(null);
  };

  const handleDeleteEvent = async () => {
    if (!editingEventId) return;

    try {
      setDeleting(true);
      setModalError(null);

      const { count, error: countErr } = await client
        .from('event_signups')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', editingEventId);

      if (countErr) {
        throw new Error(`[查詢報名名冊失敗]: ${countErr.message}`);
      }

      const signupCount = count || 0;
      const confirmPrompt =
        signupCount > 0
          ? `此活動目前已有 ${signupCount} 位社員報名！\n\n刪除活動將一併清除該活動的所有報名名冊與心得紀錄。\n\n確定要強制刪除活動「[${formData.id}] ${formData.title}」嗎？此動作無法復原！`
          : `確定要刪除活動「[${formData.id}] ${formData.title}」嗎？此動作無法復原！`;

      if (!window.confirm(confirmPrompt)) {
        setDeleting(false);
        return;
      }

      const { error: refErr } = await client
        .from('reflections')
        .delete()
        .eq('event_id', editingEventId);
      if (refErr) {
        throw new Error(`[清除活動心得失敗]: ${refErr.message}`);
      }

      const { error: signupDelErr } = await client
        .from('event_signups')
        .delete()
        .eq('event_id', editingEventId);
      if (signupDelErr) {
        throw new Error(`[清除活動報名名冊失敗]: ${signupDelErr.message}`);
      }

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

      onSaved({ action: 'delete', eventId: editingEventId, title: formData.title });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WebAdminEventModal] handleDeleteEvent error:', err);
      reportError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.title.trim()) {
      reportError('[驗證失敗]: 活動代號與中文活動名稱為必填項目');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      reportError('[驗證失敗]: 出隊開始日期與出隊結束日期均為必填項目');
      return;
    }

    if (isOpenStatus && !formData.deadline) {
      reportError('[驗證失敗]: 活動狀態為「開放」時，報名截止日期為必填項目');
      return;
    }

    if (zhTotalCount > 1400) {
      reportError(
        `[字數超出限制]: 中文簡介與行程合計共 ${zhTotalCount} 字，超過 LINE 卡片傳送上限 1400 字！`,
      );
      return;
    }

    if (enTotalCount > 1400) {
      reportError(
        `[字數超出限制]: 英文簡介與行程合計共 ${enTotalCount} 字，超過 LINE 卡片傳送上限 1400 字！`,
      );
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      let finalCoverUrl = formData.cover_image_url.trim();

      if (selectedFile) {
        const uploadPayload = {
          action: 'upload_drive_file',
          userId: session.userId || 'officer',
          folderType: 'events',
          files: [
            {
              name: `event_${formData.id.trim()}_cover_${Date.now()}.jpg`,
              base64: selectedFile.base64,
            },
          ],
        };

        const gasRes = await fetch(GAS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(withAuthPayload(uploadPayload)),
          redirect: 'follow',
        });

        if (!gasRes.ok) {
          throw new Error(`[封面圖片上傳失敗]: GAS 回應狀態碼 ${gasRes.status}`);
        }

        const gasData = await gasRes.json();
        const validUrls =
          gasData.urls || gasData.uploadedUrls || (gasData.imageUrl ? [gasData.imageUrl] : []);
        if (gasData.status === 'success' && Array.isArray(validUrls) && validUrls.length > 0) {
          finalCoverUrl = validUrls[0];
        } else {
          throw new Error(
            `[封面圖片上傳失敗]: ${gasData.message || '無法從 Google Drive 取得檔案直連網址'}`,
          );
        }
      }

      if (finalCoverUrl.startsWith('data:image/')) {
        finalCoverUrl = '';
      }

      const eventData = {
        eventId: editingEventId || formData.id.trim(),
        name: formData.title.trim(),
        nameEn: formData.title_en.trim(),
        startDate: formData.start_date,
        endDate: formData.end_date || formData.start_date,
        deadline: formData.deadline
          ? buildTaiwanIsoString(formData.deadline, formData.deadline_time)
          : formData.start_date
            ? buildTaiwanIsoString(formData.start_date, '23:59')
            : '',
        cost: String(formData.fee || 0),
        status: formData.status,
        shortDesc: formData.summary.trim(),
        shortDescEn: formData.summary_en.trim(),
        fullDesc: formData.itinerary.trim(),
        fullDescEn: formData.itinerary_en.trim(),
        imageUrl: finalCoverUrl,
        lineGroupUrl: formData.line_group_url.trim(),
      };

      const { data: rpcRes, error } = await client.rpc('save_admin_event_rpc', {
        p_officer_line_user_id: session.userId,
        p_event_data: eventData,
      });

      if (error) {
        throw new Error(
          `[${editingEventId ? '更新' : '新增'}活動失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`,
        );
      }

      if (rpcRes?.status === 'error') {
        throw new Error(
          `[${editingEventId ? '更新' : '新增'}活動失敗]: ${rpcRes.message || '權限不足或資料格式錯誤'}`,
        );
      }

      const savedEventId = rpcRes?.eventId || editingEventId || formData.id.trim();

      await logWebAuditAction(
        client,
        session.userId,
        editingEventId ? 'UPDATE_EVENT' : 'CREATE_EVENT',
        'events',
        savedEventId,
        eventData,
      );

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
          console.warn('[WebAdminEventModal] 推播幹部群組失敗 (不影響活動儲存):', pushErr);
        }
      }

      onSaved({
        action: editingEventId ? 'update' : 'create',
        eventId: savedEventId,
        title: formData.title.trim(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[WebAdminEventModal] handleSaveEvent error:', err);
      reportError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="wa-modal-backdrop"
      onClick={() => !saving && !deleting && onClose()}
    >
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
            onClick={() => !saving && !deleting && onClose()}
            title="關閉視窗"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSaveEvent} style={{ display: 'contents' }}>
          <div className="wa-modal-body">
            {modalError && (
              <div className="web-admin-error-banner" style={{ marginBottom: 12 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* 區塊 1：共用設定區 */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                padding: '16px 18px',
                borderRadius: 12,
                border: '1px solid var(--wa-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'var(--wa-text)',
                  borderBottom: '1px solid #e2e8f0',
                  paddingBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span>活動基本與共用設定</span>
                {!isOpenStatus && (
                  <span style={{ fontSize: '0.76rem', fontWeight: 500, color: 'var(--wa-text-muted)' }}>
                    非「開放」狀態僅代號、名稱與出隊日期為必填
                  </span>
                )}
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
                    onChange={(e) =>
                      setFormData({ ...formData, id: e.target.value.toUpperCase().trim() })
                    }
                    style={{
                      fontFamily: 'monospace',
                      width: '100%',
                      backgroundColor: editingEventId ? '#f1f5f9' : '#ffffff',
                    }}
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
                    <option value="未來開放">未來開放 (僅預告，暫不開放報名)</option>
                    <option value="開放">開放 (正式開放報名填表)</option>
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

              {/* 即時排程衝突提示（非阻擋式） */}
              {scheduleConflicts.length > 0 && (
                <div className="wa-conflict-banner">
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>
                      排程衝突提示：此時段與下列 {scheduleConflicts.length} 筆日程重疊（仍可儲存）
                    </span>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', lineHeight: 1.5 }}>
                      {scheduleConflicts.map((c) => (
                        <li key={c.id}>
                          [{c.typeLabel}] {c.title}（{c.dateRange}）
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* 第三列：報名截止日 與 預計費用 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 16,
                }}
              >
                <div>
                  <label className="wa-form-label">
                    報名截止日期{isOpenStatus ? ' *' : ' (選填)'}
                  </label>
                  <input
                    type="date"
                    required={isOpenStatus}
                    className="web-admin-input"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="wa-form-label">
                    截止時間 (台灣時間){isOpenStatus ? ' *' : ''}
                  </label>
                  <input
                    type="time"
                    required={isOpenStatus}
                    className="web-admin-input"
                    value={formData.deadline_time || '23:59'}
                    onChange={(e) => setFormData({ ...formData, deadline_time: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="wa-form-label">
                    預計費用 (NT$){isOpenStatus ? ' *' : ' (選填)'}
                  </label>
                  <input
                    type="number"
                    required={isOpenStatus}
                    min="0"
                    className="web-admin-input"
                    value={formData.fee}
                    onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                    style={{ width: '100%' }}
                    placeholder="例如: 3500"
                  />
                </div>
              </div>

              {/* 第四列：LINE 群組邀請連結 */}
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

              {/* 第五列：封面照片設定 */}
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

                  <span style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)' }}>
                    或直接貼上圖片網址：
                  </span>

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

                {previewImage && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 120,
                        height: 70,
                        borderRadius: 8,
                        overflow: 'hidden',
                        border: '1px solid var(--wa-border)',
                        backgroundColor: '#000',
                      }}
                    >
                      <img
                        src={previewImage}
                        alt="預覽"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    {selectedFile && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: '#059669',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Check size={14} />
                        <span>已選取圖檔：{selectedFile.name} (儲存時將自動壓縮上傳)</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 第六列：推播到幹部群組勾選框 */}
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#ffffff',
                  borderRadius: 8,
                  border: '1px solid var(--wa-border)',
                }}
              >
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

            {/* 區塊 2：中英文雙欄對稱編輯區 */}
            <div className="wa-bilingual-grid">
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
                    placeholder={'D0 台北集合出發\nD1 登山口 -> 七卡山莊 -> 三六九山莊\nD2 主峰登頂 -> 下山返程...'}
                    style={{ width: '100%', minHeight: 260, backgroundColor: '#ffffff' }}
                  />
                  <div
                    style={{
                      textAlign: 'left',
                      fontSize: '0.76rem',
                      color: isZhOver ? '#dc2626' : 'var(--wa-text-muted)',
                      marginTop: 4,
                    }}
                  >
                    中文總字數 (簡介+行程)：{zhTotalCount} / 1400 字 (LINE 卡片傳送上限)
                    {isZhOver && ' (已超出上限)'}
                  </div>
                </div>
              </div>

              <div className="wa-bilingual-col">
                <div
                  className="wa-bilingual-header"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Globe size={15} color="#2563eb" />
                    <span>英文內容</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {translationSnapshot && (
                      <button
                        type="button"
                        className="web-admin-btn"
                        onClick={handleUndoTranslation}
                        style={{ padding: '2px 8px', fontSize: '0.75rem', height: 26 }}
                        title="還原為翻譯前之內容"
                      >
                        一鍵還原
                      </button>
                    )}
                    <button
                      type="button"
                      className="web-admin-btn web-admin-btn-primary"
                      onClick={handleAiTranslate}
                      disabled={isTranslating}
                      style={{
                        padding: '2px 10px',
                        fontSize: '0.75rem',
                        height: 26,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      title="使用 AI 自動將中文名稱、簡介與行程翻譯為英文"
                    >
                      {isTranslating ? (
                        <>
                          <RefreshCw size={12} className="wa-spin" />
                          <span>翻譯中...</span>
                        </>
                      ) : (
                        <span>AI 一鍵雙語翻譯</span>
                      )}
                    </button>
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
                    placeholder={'Day 0: Meet in Taipei\nDay 1: Trailhead -> 369 Cabin\nDay 2: Summit -> Return...'}
                    style={{ width: '100%', minHeight: 260, backgroundColor: '#ffffff' }}
                  />
                  <div
                    style={{
                      textAlign: 'left',
                      fontSize: '0.76rem',
                      color: isEnOver ? '#dc2626' : 'var(--wa-text-muted)',
                      marginTop: 4,
                    }}
                  >
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
              onClick={() => !saving && !deleting && onClose()}
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
  );
};

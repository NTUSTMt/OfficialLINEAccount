import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Plus,
  Edit3,
  Users,
  RefreshCw,
  AlertCircle,
  X,
  CheckCircle2,
  Mountain,
  Clock,
  Hash,
  CircleDot
} from 'lucide-react';
import { WebAdminToolbar } from '../../components/admin/WebAdminToolbar';
import {
  WebAdminEventModal,
  type AdminEventRecord as ModalAdminEventRecord,
  type EventFormData,
} from '../../components/admin/WebAdminEventModal';
import type { ScheduleFeedItem } from '../../types/schedule';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import { getDirectImageUrl } from '../../utils/image';
import { formatTaiwanDateTime, isTaiwanDeadlinePassed } from '../../utils/dateUtils';
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

// 判定截止日期是否已過 (以台灣時間為準)
const isDeadlinePassed = (deadlineStr?: string): boolean => {
  return isTaiwanDeadlinePassed(deadlineStr);
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
  const [editingEvent, setEditingEvent] = useState<ModalAdminEventRecord | null>(null);
  const [createInitialOverrides, setCreateInitialOverrides] = useState<Partial<EventFormData> | undefined>(undefined);

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

  // 2. 開啟新增彈窗
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

    setEditingEvent(null);
    setCreateInitialOverrides({
      id: `${prefix}${nextSeq}`,
      status: '未來開放',
    });
    setModalOpen(true);
    setErrorMsg(null);
  };

  // 3. 開啟編輯彈窗
  const handleOpenEdit = (event: AdminEventRecord) => {
    setCreateInitialOverrides(undefined);
    setEditingEvent({
      id: event.id,
      title: event.title,
      title_en: event.title_en,
      summary: event.summary,
      summary_en: event.summary_en,
      itinerary: event.itinerary,
      itinerary_en: event.itinerary_en,
      start_date: event.start_date,
      end_date: event.end_date,
      deadline: event.deadline,
      fee: event.fee !== undefined && event.fee !== '' ? Number(event.fee) : undefined,
      status: event.status,
      cover_image_url: event.cover_image_url || event.cover_image || '',
      line_group_url: event.line_group_url,
    });
    setModalOpen(true);
    setErrorMsg(null);
  };

  // 4. 排程衝突檢查來源 (以現有活動起訖日為主)
  const conflictSourceItems = useMemo<ScheduleFeedItem[]>(() => {
    return events
      .filter((ev) => Boolean(ev.start_date))
      .map((ev) => ({
        item_id: `event:${ev.id}`,
        source_type: 'event',
        title: ev.title,
        sub_text: '',
        start_time: ev.start_date,
        end_time: ev.end_date || ev.start_date,
        is_all_day: true,
        is_macro: true,
        status: ev.status,
        status_badge: ev.status,
        link_path: '',
        details: { event_id: ev.id },
      }));
  }, [events]);

  const handleModalSaved = (result: {
    action: 'create' | 'update' | 'delete';
    eventId: string;
    title: string;
  }) => {
    setModalOpen(false);
    setEditingEvent(null);
    if (result.action === 'delete') {
      setSuccessMsg(`活動「[${result.eventId}] ${result.title}」已成功刪除！`);
    } else if (result.action === 'update') {
      setSuccessMsg(`活動「${result.title}」已成功更新！`);
    } else {
      setSuccessMsg(`新活動「${result.title}」已成功建立！`);
    }
    loadEvents();
    setTimeout(() => setSuccessMsg(null), 3000);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 頂部操作工具列 (Notion 極簡無框工具列) */}
      <WebAdminToolbar
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: '搜尋活動名稱、編號、簡介...',
        }}
        filters={[
          {
            key: 'status',
            label: '活動狀態',
            selected: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'ALL', label: `全部狀態 (${events.length})`, icon: <CircleDot size={13} /> },
              { value: '開放', label: `開放中 (${statusCounts['開放'] || 0})`, icon: <CheckCircle2 size={13} /> },
              { value: '未來開放', label: `未來開放 (${statusCounts['未來開放'] || 0})`, icon: <Clock size={13} /> },
              { value: '已截止', label: `已截止 (${statusCounts['已截止'] || 0})`, icon: <AlertCircle size={13} /> },
              { value: '關閉', label: `已關閉 (${statusCounts['關閉'] || 0})`, icon: <X size={13} /> },
            ],
          },
        ]}
        sort={{
          value: sortBy,
          defaultValue: 'startDateDesc',
          onChange: setSortBy,
          options: [
            { value: 'startDateDesc', label: '出隊日期 (由新到舊)', icon: <Calendar size={13} /> },
            { value: 'startDateAsc', label: '出隊日期 (由舊到新)', icon: <Calendar size={13} /> },
            { value: 'deadlineAsc', label: '截止日期 (即將截止優先)', icon: <Clock size={13} /> },
            { value: 'deadlineDesc', label: '截止日期 (較晚截止優先)', icon: <Clock size={13} /> },
            { value: 'idDesc', label: '活動代號 (由新到舊)', icon: <Hash size={13} /> },
            { value: 'idAsc', label: '活動代號 (由舊到新)', icon: <Hash size={13} /> },
            { value: 'statusOrder', label: '活動狀態 (開放中優先)', icon: <CircleDot size={13} /> },
          ],
        }}
        refresh={{
          onClick: loadEvents,
          loading,
          title: '重新整理活動清單',
        }}
        primaryAction={{
          label: '新增活動',
          icon: <Plus size={15} />,
          onClick: handleOpenCreate,
        }}
      />

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
                          {event.deadline ? formatTaiwanDateTime(event.deadline, true) : '-'}
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
      <WebAdminEventModal
        isOpen={modalOpen}
        editingEvent={editingEvent}
        initialFormOverrides={createInitialOverrides}
        conflictSourceItems={conflictSourceItems}
        session={session}
        client={client}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        onSaved={handleModalSaved}
        onError={(msg) => setErrorMsg(msg)}
      />
    </div>
  );
};

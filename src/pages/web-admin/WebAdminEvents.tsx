import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Calendar,
  Search,
  Copy,
  Check,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface EventItem {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface SignupRow {
  id: string;
  event_id: string;
  line_user_id: string;
  name?: string;
  line_id?: string;
  status: string;
  payment_status: string;
  created_at: string;
  members?: {
    name?: string;
    department?: string;
    student_id?: string;
    identity_status?: string;
    phone?: string;
    id_card?: string;
    birthday?: string;
    emergency_contact_name?: string;
    emergency_contact_rel?: string;
    emergency_contact_phone?: string;
    medical_history?: string;
    outdoor_experience?: string;
  } | null;
}

export const WebAdminEvents: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 批次選擇
  const [selectedSignupIds, setSelectedSignupIds] = useState<Set<string>>(new Set());
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 1. 載入所有活動列表
  const loadEvents = async () => {
    setLoadingEvents(true);
    setErrorMsg(null);
    try {
      const { data, error } = await client
        .from('events')
        .select('id, title, start_date, end_date, status')
        .order('start_date', { ascending: false });

      if (error) {
        throw new Error(`[讀取活動列表失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      const list = (data || []) as EventItem[];
      setEvents(list);
      if (list.length > 0 && !selectedEventId) {
        setSelectedEventId(list[0].id);
      }
    } catch (err: any) {
      console.error('[WebAdminEvents] loadEvents error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [client]);

  // 2. 載入所選活動之報名名冊
  const loadSignups = async (eventId: string) => {
    if (!eventId) return;
    setLoadingSignups(true);
    setErrorMsg(null);
    setSelectedSignupIds(new Set());

    try {
      const { data, error } = await client
        .from('event_signups')
        .select(`
          id,
          event_id,
          line_user_id,
          name,
          line_id,
          status,
          payment_status,
          created_at,
          members:line_user_id (
            name,
            department,
            student_id,
            identity_status,
            phone,
            id_card,
            birthday,
            emergency_contact_name,
            emergency_contact_rel,
            emergency_contact_phone,
            medical_history,
            outdoor_experience
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`[讀取活動名冊失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setSignups((data || []) as unknown as SignupRow[]);

      // 寫入讀取稽核日誌
      logWebAuditAction(client, session.userId, 'VIEW_ROSTER', 'event', eventId, {
        recordCount: data?.length || 0,
      });
    } catch (err: any) {
      console.error('[WebAdminEvents] loadSignups error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingSignups(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadSignups(selectedEventId);
    }
  }, [selectedEventId]);

  // 3. 過濾清單
  const filteredSignups = useMemo(() => {
    return signups.filter((row) => {
      const mem = row.members || {};
      const matchKeyword =
        !searchKeyword ||
        (row.name && row.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (mem.name && mem.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (mem.student_id && mem.student_id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (mem.id_card && mem.id_card.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (mem.phone && mem.phone.includes(searchKeyword)) ||
        (row.id && row.id.toLowerCase().includes(searchKeyword.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'CONFIRMED' && row.status.includes('正取')) ||
        (statusFilter === 'WAITLIST' && row.status.includes('備取')) ||
        (statusFilter === 'CHECKING' && (row.status.includes('審核') || row.status.includes('Checking'))) ||
        (statusFilter === 'CANCELLED' && row.status.includes('取消'));

      return matchKeyword && matchStatus;
    });
  }, [signups, searchKeyword, statusFilter]);

  // 統計數據
  const stats = useMemo(() => {
    let total = signups.length;
    let confirmed = 0;
    let waitlist = 0;
    let paid = 0;

    signups.forEach((s) => {
      if (s.status.includes('正取')) confirmed++;
      if (s.status.includes('備取')) waitlist++;
      if (s.payment_status.includes('已繳費')) paid++;
    });

    return { total, confirmed, waitlist, paid };
  }, [signups]);

  // 4. 單筆即時更新狀態 (單元格快速下拉切換)
  const handleUpdateStatus = async (signupId: string, newStatus: string) => {
    setUpdatingId(signupId);
    setErrorMsg(null);
    try {
      const { error } = await client
        .from('event_signups')
        .update({ status: newStatus })
        .eq('id', signupId);

      if (error) {
        throw new Error(`[更新報名狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setSignups((prev) =>
        prev.map((s) => (s.id === signupId ? { ...s, status: newStatus } : s))
      );

      logWebAuditAction(client, session.userId, 'UPDATE_SIGNUP_STATUS', 'event_signup', signupId, {
        newStatus,
      });
    } catch (err: any) {
      console.error('[WebAdminEvents] handleUpdateStatus error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 5. 批次更新狀態
  const handleBatchUpdateStatus = async (targetStatus: string) => {
    if (selectedSignupIds.size === 0) return;
    const ids = Array.from(selectedSignupIds);
    setLoadingSignups(true);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('event_signups')
        .update({ status: targetStatus })
        .in('id', ids);

      if (error) {
        throw new Error(`[批次更新報名狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setSignups((prev) =>
        prev.map((s) => (ids.includes(s.id) ? { ...s, status: targetStatus } : s))
      );

      setSelectedSignupIds(new Set());

      logWebAuditAction(client, session.userId, 'BATCH_UPDATE_SIGNUP_STATUS', 'event_signup', undefined, {
        targetStatus,
        count: ids.length,
        ids,
      });
    } catch (err: any) {
      console.error('[WebAdminEvents] handleBatchUpdateStatus error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoadingSignups(false);
    }
  };

  // 6. 全選 / 取消全選
  const handleToggleSelectAll = () => {
    if (selectedSignupIds.size === filteredSignups.length) {
      setSelectedSignupIds(new Set());
    } else {
      setSelectedSignupIds(new Set(filteredSignups.map((s) => s.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedSignupIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSignupIds(next);
  };

  // 7. 一鍵複製勾選名冊為 TSV (供保險/入山入園表格直接貼上)
  const handleCopyRosterTsv = async () => {
    const targetRows =
      selectedSignupIds.size > 0
        ? signups.filter((s) => selectedSignupIds.has(s.id))
        : filteredSignups;

    if (targetRows.length === 0) return;

    const headers = [
      '姓名',
      '身分證字號',
      '出生年月日',
      '系所',
      '學號',
      '手機電話',
      '緊急聯絡人',
      '關係',
      '緊急聯絡人電話',
      '身分別',
      '審核狀態',
      '繳費狀態',
      '特殊病史飲食',
      '登山經驗'
    ];

    const lines = [headers.join('\t')];

    targetRows.forEach((row) => {
      const m = row.members || {};
      const line = [
        m.name || row.name || '',
        m.id_card || '',
        m.birthday || '',
        m.department || '',
        m.student_id || '',
        m.phone || '',
        m.emergency_contact_name || '',
        m.emergency_contact_rel || '',
        m.emergency_contact_phone || '',
        m.identity_status || '',
        row.status || '',
        row.payment_status || '',
        (m.medical_history || '').replace(/[\r\n\t]/g, ' '),
        (m.outdoor_experience || '').replace(/[\r\n\t]/g, ' ')
      ];
      lines.push(line.join('\t'));
    });

    const tsvContent = lines.join('\n');
    try {
      await navigator.clipboard.writeText(tsvContent);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);

      logWebAuditAction(client, session.userId, 'EXPORT_ROSTER_CLIPBOARD', 'event', selectedEventId, {
        rowCount: targetRows.length,
      });
    } catch (copyErr) {
      console.error('[WebAdminEvents] 複製至剪貼簿例外:', copyErr);
      setErrorMsg('[複製失敗]: 瀏覽器阻擋剪貼簿寫入權限，請確認權限設定');
    }
  };

  return (
    <>
      {/* 錯誤橫幅 (透明化顯示所有具體錯誤) */}
      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* 頂部操作工具列 */}
      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--wa-primary)" />
            <select
              className="web-admin-select"
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              disabled={loadingEvents}
              style={{ fontWeight: 600, minWidth: 260 }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({ev.start_date || '未定'}) [{ev.status}]
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              style={{ paddingLeft: 30, width: 220 }}
              placeholder="搜尋姓名、學號、證號、電話..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">全部狀態 ({signups.length})</option>
            <option value="CONFIRMED">正取名單 ({stats.confirmed})</option>
            <option value="WAITLIST">備取名單 ({stats.waitlist})</option>
            <option value="CHECKING">審核中</option>
            <option value="CANCELLED">已取消</option>
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={() => loadSignups(selectedEventId)}
            disabled={loadingSignups}
            title="重新整理名冊"
          >
            <RefreshCw size={14} className={loadingSignups ? 'animate-spin' : ''} />
            <span>重新整理</span>
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          {/* 數據統計標籤 */}
          <div style={{ display: 'flex', gap: 10, fontSize: '0.82rem' }}>
            <span className="web-admin-badge web-admin-badge-info">
              總報名: {stats.total}
            </span>
            <span className="web-admin-badge web-admin-badge-success">
              正取: {stats.confirmed}
            </span>
            <span className="web-admin-badge web-admin-badge-warning">
              備取: {stats.waitlist}
            </span>
            <span className="web-admin-badge web-admin-badge-neutral">
              已繳費: {stats.paid}
            </span>
          </div>

          {/* 批次操作按鈕組 */}
          {selectedSignupIds.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)' }}>
                已選取 {selectedSignupIds.size} 筆:
              </span>
              <button
                type="button"
                className="web-admin-btn"
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                onClick={() => handleBatchUpdateStatus('正取 Confirmed')}
              >
                批次設為正取
              </button>
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                onClick={() => handleBatchUpdateStatus('備取 Waitlist')}
              >
                批次設為備取
              </button>
              <button
                type="button"
                className="web-admin-btn web-admin-btn-danger"
                style={{ fontSize: '0.8rem', padding: '5px 10px' }}
                onClick={() => handleBatchUpdateStatus('已取消 Cancelled')}
              >
                批次取消
              </button>
            </div>
          )}

          {/* 一鍵複製為 TSV */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={handleCopyRosterTsv}
            title="複製為試算表格格式 (可直接貼入 Google Sheets / Excel / 保險申報表)"
          >
            {copiedSuccess ? <Check size={14} color="var(--wa-primary)" /> : <Copy size={14} />}
            <span>{copiedSuccess ? '已複製到剪貼簿!' : '複製名冊 (TSV)'}</span>
          </button>
        </div>
      </div>

      {/* 高密度試算表名冊網格 (Sheets Data Grid) */}
      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredSignups.length > 0 && selectedSignupIds.size === filteredSignups.length}
                  onChange={handleToggleSelectAll}
                />
              </th>
              <th>序號</th>
              <th>姓名</th>
              <th>審核狀態</th>
              <th>繳費狀態</th>
              <th>學號</th>
              <th>系所</th>
              <th>身分別</th>
              <th>身分證字號 (明文)</th>
              <th>出生年月日</th>
              <th>手機號碼</th>
              <th>緊急聯絡人</th>
              <th>聯絡人電話</th>
              <th>病史飲食備註</th>
              <th>登山經歷</th>
              <th>報名時間</th>
            </tr>
          </thead>
          <tbody>
            {filteredSignups.length === 0 ? (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  {loadingSignups ? '資料載入中...' : '此活動目前無符合條件之報名者'}
                </td>
              </tr>
            ) : (
              filteredSignups.map((row, idx) => {
                const m = row.members || {};
                const isSelected = selectedSignupIds.has(row.id);
                const isConfirmed = row.status.includes('正取');
                const isWaitlist = row.status.includes('備取');
                const isCancelled = row.status.includes('取消');

                return (
                  <tr key={row.id} className={isSelected ? 'selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(row.id)}
                      />
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{m.name || row.name || '未填寫'}</td>
                    <td>
                      <select
                        className="web-admin-select"
                        style={{
                          fontSize: '0.78rem',
                          padding: '3px 8px',
                          color: isConfirmed ? '#34d399' : isWaitlist ? '#fbbf24' : isCancelled ? '#f87171' : 'var(--wa-text)',
                          fontWeight: 600,
                        }}
                        value={row.status}
                        disabled={updatingId === row.id}
                        onChange={(e) => handleUpdateStatus(row.id, e.target.value)}
                      >
                        <option value="正取 Confirmed">正取 Confirmed</option>
                        <option value="備取 Waitlist">備取 Waitlist</option>
                        <option value="審核中 Checking">審核中 Checking</option>
                        <option value="已取消 Cancelled">已取消 Cancelled</option>
                      </select>
                    </td>
                    <td>
                      <span
                        className={`web-admin-badge ${
                          row.payment_status.includes('已繳費')
                            ? 'web-admin-badge-success'
                            : row.payment_status.includes('待確認')
                            ? 'web-admin-badge-warning'
                            : 'web-admin-badge-danger'
                        }`}
                      >
                        {row.payment_status || '未繳費'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.student_id || '-'}</td>
                    <td>{m.department || '-'}</td>
                    <td>{m.identity_status || '-'}</td>
                    {/* 身分證字號：依 Grill-me 決策直接明文呈現 */}
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#93c5fd' }}>
                      {m.id_card || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.birthday || '-'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.phone || '-'}</td>
                    <td>
                      {m.emergency_contact_name || '-'}
                      {m.emergency_contact_rel ? ` (${m.emergency_contact_rel})` : ''}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.emergency_contact_phone || '-'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.medical_history || ''}>
                      {m.medical_history || '-'}
                    </td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.outdoor_experience || ''}>
                      {m.outdoor_experience || '-'}
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.76rem' }}>
                      {row.created_at ? new Date(row.created_at).toLocaleString('zh-TW', { hour12: false }) : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

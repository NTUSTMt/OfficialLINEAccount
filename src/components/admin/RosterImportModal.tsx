import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  Search,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Shield,
  ArrowRight
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import {
  generateSignupId,
  checkProfileCompleteness,
  partitionImportCandidates,
  buildImportNotes,
  type ImportCandidate,
  type ExistingSignupMinimal
} from '../../utils/rosterImportUtils';

export interface RosterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEventId: string;
  targetEventTitle: string;
  existingSignups: ExistingSignupMinimal[];
  session: WebAuthSession;
  onSuccess: () => Promise<void>;
}

interface EventOption {
  id: string;
  title: string;
  start_date: string;
}

export const RosterImportModal: React.FC<RosterImportModalProps> = ({
  isOpen,
  onClose,
  targetEventId,
  targetEventTitle,
  existingSignups,
  session,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'from_event' | 'from_members'>('from_event');
  const [eventsList, setEventsList] = useState<EventOption[]>([]);
  const [selectedSourceEventId, setSelectedSourceEventId] = useState<string>('');
  const [sourceSignups, setSourceSignups] = useState<ImportCandidate[]>([]);
  const [loadingSourceSignups, setLoadingSourceSignups] = useState(false);

  // 社員清單狀態
  const [allMembers, setAllMembers] = useState<ImportCandidate[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [onlyOfficers, setOnlyOfficers] = useState(false);

  // 選取名單
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // 匯入設定 (從活動匯入)
  const [eventTargetStatus, setEventTargetStatus] = useState<string>('KEEP');
  const [eventTargetPaymentStatus, setEventTargetPaymentStatus] = useState<string>('KEEP');
  const [eventKeepNotes, setEventKeepNotes] = useState(true);

  // 匯入設定 (從社員名冊新增)
  const [memberTargetStatus, setMemberTargetStatus] = useState<string>('正取 Confirmed');
  const [memberTargetPaymentStatus, setMemberTargetPaymentStatus] = useState<string>('未繳費 Unpaid');
  const [memberCustomNotes, setMemberCustomNotes] = useState<string>('');

  // 執行與錯誤狀態
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const client = useMemo(() => createAuthenticatedSupabaseClient(session.jwt), [session.jwt]);

  // 重設狀態並載入活動列表
  useEffect(() => {
    if (!isOpen) {
      setSelectedUserIds(new Set());
      setErrorMessage(null);
      setSuccessCount(null);
      return;
    }

    const fetchEvents = async () => {
      try {
        const { data, error } = await client
          .from('events')
          .select('id, title, start_date')
          .neq('id', targetEventId)
          .order('start_date', { ascending: false });

        if (error) {
          setErrorMessage(`[載入活動清單失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
          return;
        }

        if (data && data.length > 0) {
          setEventsList(data);
          setSelectedSourceEventId(data[0].id);
        }
      } catch (err: any) {
        setErrorMessage(`[載入活動清單例外]: ${err.message || String(err)}`);
      }
    };

    fetchEvents();
  }, [isOpen, targetEventId, client]);

  // 載入指定來源活動的名冊
  useEffect(() => {
    if (!isOpen || !selectedSourceEventId) return;

    const fetchSourceSignups = async () => {
      setLoadingSourceSignups(true);
      setErrorMessage(null);
      setSelectedUserIds(new Set());

      try {
        const { data, error } = await client
          .from('event_signups')
          .select(`
            id,
            line_user_id,
            name,
            line_id,
            status,
            payment_status,
            notes,
            is_official_member_snapshot,
            members (
              phone,
              student_id,
              department,
              id_card,
              emergency_contact_name,
              is_officer,
              officer_role
            )
          `)
          .eq('event_id', selectedSourceEventId)
          .order('created_at', { ascending: true });

        if (error) {
          setErrorMessage(`[讀取來源活動名冊失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
          return;
        }

        const candidates: ImportCandidate[] = (data || []).map((row: any) => {
          const m = Array.isArray(row.members) ? row.members[0] : row.members;
          return {
            line_user_id: row.line_user_id,
            name: row.name,
            line_id: row.line_id,
            is_official_member: row.is_official_member_snapshot,
            status: row.status,
            payment_status: row.payment_status,
            notes: row.notes,
            phone: m?.phone,
            student_id: m?.student_id,
            department: m?.department,
            id_card: m?.id_card,
            emergency_contact_name: m?.emergency_contact_name,
            is_officer: m?.is_officer,
            officer_role: m?.officer_role,
          };
        });

        setSourceSignups(candidates);
      } catch (err: any) {
        setErrorMessage(`[讀取來源名冊例外]: ${err.message || String(err)}`);
      } finally {
        setLoadingSourceSignups(false);
      }
    };

    fetchSourceSignups();
  }, [isOpen, selectedSourceEventId, client]);

  // 載入社員名冊 (當切換至從社員名冊新增分頁時)
  useEffect(() => {
    if (!isOpen || activeTab !== 'from_members' || allMembers.length > 0) return;

    const fetchMembers = async () => {
      setLoadingMembers(true);
      setErrorMessage(null);

      try {
        const { data, error } = await client
          .from('members')
          .select('line_user_id, name, line_id, phone, student_id, department, id_card, emergency_contact_name, is_officer, officer_role, is_official_member')
          .order('name', { ascending: true });

        if (error) {
          setErrorMessage(`[讀取社員名冊失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
          return;
        }

        setAllMembers(data || []);
      } catch (err: any) {
        setErrorMessage(`[讀取社員名冊例外]: ${err.message || String(err)}`);
      } finally {
        setLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [isOpen, activeTab, allMembers.length, client]);

  // 目標活動既有名冊映射與分流比對
  const existingMap = useMemo(() => {
    const map = new Map<string, ExistingSignupMinimal>();
    for (const es of existingSignups) {
      if (es.line_user_id) {
        map.set(es.line_user_id, es);
      }
    }
    return map;
  }, [existingSignups]);

  // 來源活動名稱
  const selectedSourceEvent = useMemo(() => {
    return eventsList.find((e) => e.id === selectedSourceEventId);
  }, [eventsList, selectedSourceEventId]);

  // 社員篩選列表
  const filteredMembers = useMemo(() => {
    return allMembers.filter((m) => {
      if (onlyOfficers && !m.is_officer) return false;
      if (!memberSearch.trim()) return true;
      const q = memberSearch.trim().toLowerCase();
      const matchName = (m.name || '').toLowerCase().includes(q);
      const matchStudent = (m.student_id || '').toLowerCase().includes(q);
      const matchDept = (m.department || '').toLowerCase().includes(q);
      const matchPhone = (m.phone || '').toLowerCase().includes(q);
      return matchName || matchStudent || matchDept || matchPhone;
    });
  }, [allMembers, onlyOfficers, memberSearch]);

  if (!isOpen) return null;

  // 勾選切換
  const handleToggleSelect = (userId: string, disabled: boolean) => {
    if (disabled || submitting) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // 快捷全選 (從活動)
  const handleQuickSelectEvent = (type: 'all' | 'confirmed' | 'waitlisted' | 'clear') => {
    if (type === 'clear') {
      setSelectedUserIds(new Set());
      return;
    }

    const next = new Set<string>();
    for (const s of sourceSignups) {
      const exist = existingMap.get(s.line_user_id);
      const isActiveConflict = exist && !exist.status.includes('取消') && !exist.status.toLowerCase().includes('cancelled');
      if (isActiveConflict) continue;

      if (type === 'all') {
        next.add(s.line_user_id);
      } else if (type === 'confirmed' && s.status && s.status.includes('正取')) {
        next.add(s.line_user_id);
      } else if (type === 'waitlisted' && s.status && s.status.includes('備取')) {
        next.add(s.line_user_id);
      }
    }
    setSelectedUserIds(next);
  };

  // 執行批次匯入
  const handleExecuteImport = async () => {
    if (selectedUserIds.size === 0 || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessCount(null);

    try {
      const currentCandidates = activeTab === 'from_event' ? sourceSignups : allMembers;
      const selectedCandidates = currentCandidates.filter((c) => selectedUserIds.has(c.line_user_id));

      const { conflicts, reactivates, inserts } = partitionImportCandidates(selectedCandidates, existingSignups);

      if (conflicts.length > 0 && inserts.length === 0 && reactivates.length === 0) {
        throw new Error('所選人員皆已在目前活動名冊中，無法重複加入。');
      }

      const sourceTitle = activeTab === 'from_event' ? (selectedSourceEvent?.title || '其他活動') : null;

      // 1. 處理需要 UPDATE 重啟的已取消紀錄
      for (const item of reactivates) {
        let finalStatus = activeTab === 'from_event'
          ? (eventTargetStatus === 'KEEP' ? (item.status || '審核中 Checking') : eventTargetStatus)
          : memberTargetStatus;

        let finalPaymentStatus = activeTab === 'from_event'
          ? (eventTargetPaymentStatus === 'KEEP' ? (item.payment_status || '未繳費 Unpaid') : eventTargetPaymentStatus)
          : memberTargetPaymentStatus;

        const combinedNotes = activeTab === 'from_event'
          ? (eventKeepNotes ? buildImportNotes(item.notes, sourceTitle, '重啟報名') : buildImportNotes(null, sourceTitle, '重啟報名'))
          : buildImportNotes(null, null, memberCustomNotes);

        const { error: updateError } = await client
          .from('event_signups')
          .update({
            status: finalStatus,
            payment_status: finalPaymentStatus,
            notes: combinedNotes,
            cancel_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.existingSignupId);

        if (updateError) {
          throw new Error(`[重啟隊員 ${item.name || item.line_user_id} 失敗]: ${updateError.message} (代碼: ${updateError.code || 'UNKNOWN'})`);
        }
      }

      // 2. 處理需要 INSERT 的全新紀錄
      if (inserts.length > 0) {
        const rowsToInsert = inserts.map((item) => {
          let finalStatus = activeTab === 'from_event'
            ? (eventTargetStatus === 'KEEP' ? (item.status || '審核中 Checking') : eventTargetStatus)
            : memberTargetStatus;

          let finalPaymentStatus = activeTab === 'from_event'
            ? (eventTargetPaymentStatus === 'KEEP' ? (item.payment_status || '未繳費 Unpaid') : eventTargetPaymentStatus)
            : memberTargetPaymentStatus;

          const combinedNotes = activeTab === 'from_event'
            ? (eventKeepNotes ? buildImportNotes(item.notes, sourceTitle, null) : buildImportNotes(null, sourceTitle, null))
            : buildImportNotes(null, null, memberCustomNotes);

          return {
            id: generateSignupId(),
            event_id: targetEventId,
            line_user_id: item.line_user_id,
            name: item.name || '',
            line_id: item.line_id || null,
            status: finalStatus,
            payment_status: finalPaymentStatus,
            is_official_member_snapshot: item.is_official_member ?? false,
            notes: combinedNotes,
            notification_status: '未發送',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });

        const { error: insertError } = await client
          .from('event_signups')
          .insert(rowsToInsert);

        if (insertError) {
          throw new Error(`[批次寫入名冊失敗]: ${insertError.message} (代碼: ${insertError.code || 'UNKNOWN'})`);
        }
      }

      // 3. 記錄稽核日誌
      const totalCount = reactivates.length + inserts.length;
      await logWebAuditAction(client, session.userId, 'BATCH_IMPORT_SIGNUPS', 'event_signups', targetEventId, {
        total_imported: totalCount,
        reactivated_count: reactivates.length,
        inserted_count: inserts.length,
        source_type: activeTab,
        source_event_id: activeTab === 'from_event' ? selectedSourceEventId : null,
      });

      setSuccessCount(totalCount);

      // 呼叫外部重整
      await onSuccess();

      // 延遲關閉讓使用者看到成功提示
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div
        className="wa-modal-container"
        style={{ maxWidth: '880px', width: '95vw', height: '88vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="wa-modal-header">
          <div>
            <h3 className="wa-modal-title">
              <Users size={20} color="var(--wa-primary)" />
              <span>新增 / 導入活動名冊人員</span>
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', marginTop: '4px' }}>
              目標活動：<strong style={{ color: 'var(--wa-text-primary)' }}>{targetEventTitle}</strong>
            </div>
          </div>
          <button
            type="button"
            className="wa-modal-close-btn"
            onClick={onClose}
            disabled={submitting}
            aria-label="關閉"
            style={{
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              outline: 'none',
              color: '#64748b',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Safari 膠囊分頁切換列 */}
        <div className="wa-segmented-tabs-wrapper">
          <div className="wa-segmented-tabs">
            <button
              type="button"
              className={`wa-segmented-tab ${activeTab === 'from_event' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('from_event');
                setSelectedUserIds(new Set());
                setErrorMessage(null);
              }}
            >
              <Calendar size={16} />
              <span>從其他活動名冊複製 (備案轉隊)</span>
            </button>

            <button
              type="button"
              className={`wa-segmented-tab ${activeTab === 'from_members' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('from_members');
                setSelectedUserIds(new Set());
                setErrorMessage(null);
              }}
            >
              <Shield size={16} />
              <span>從社員名冊新增 (含幹部篩選)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="wa-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {errorMessage && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: '0.88rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMessage}</div>
            </div>
          )}

          {successCount !== null && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#f0fdf4',
              color: '#16a34a',
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.88rem'
            }}>
              <CheckCircle2 size={18} />
              <div>成功導入 {successCount} 位隊員！名冊更新中...</div>
            </div>
          )}

          {/* TAB 1: 從其他活動複製 */}
          {activeTab === 'from_event' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 活動下拉選擇 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--wa-text-secondary)', minWidth: '90px' }}>
                  選擇來源活動：
                </label>
                <select
                  className="wa-modal-select"
                  style={{ flex: 1, minWidth: '260px' }}
                  value={selectedSourceEventId}
                  onChange={(e) => setSelectedSourceEventId(e.target.value)}
                  disabled={submitting || eventsList.length === 0}
                >
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} ({ev.start_date || '無日期'})
                    </option>
                  ))}
                </select>
                {loadingSourceSignups && <RefreshCw size={18} className="animate-spin" color="var(--wa-primary)" />}
              </div>

              {/* 匯入規則設定區塊 */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--wa-border)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>入隊狀態：</span>
                  <select
                    className="wa-modal-select"
                    style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                    value={eventTargetStatus}
                    onChange={(e) => setEventTargetStatus(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="KEEP">維持原錄取狀態</option>
                    <option value="正取 Confirmed">統一設為 正取 Confirmed</option>
                    <option value="備取 Waitlisted">統一設為 備取 Waitlisted</option>
                    <option value="審核中 Checking">統一設為 審核中 Checking</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>繳費狀態：</span>
                  <select
                    className="wa-modal-select"
                    style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                    value={eventTargetPaymentStatus}
                    onChange={(e) => setEventTargetPaymentStatus(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="KEEP">維持原繳費狀態 (已繳費帶註記)</option>
                    <option value="未繳費 Unpaid">統一設為 未繳費 Unpaid</option>
                    <option value="已繳費 Paid">統一設為 已繳費 Paid</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={eventKeepNotes}
                    onChange={(e) => setEventKeepNotes(e.target.checked)}
                    disabled={submitting}
                  />
                  <span>保留備註</span>
                </label>
              </div>

              {/* 快捷勾選按鈕 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="wa-modal-btn-pill"
                    onClick={() => handleQuickSelectEvent('confirmed')}
                    disabled={submitting || sourceSignups.length === 0}
                  >
                    全選正取
                  </button>
                  <button
                    type="button"
                    className="wa-modal-btn-pill"
                    onClick={() => handleQuickSelectEvent('waitlisted')}
                    disabled={submitting || sourceSignups.length === 0}
                  >
                    全選備取
                  </button>
                  <button
                    type="button"
                    className="wa-modal-btn-pill"
                    onClick={() => handleQuickSelectEvent('all')}
                    disabled={submitting || sourceSignups.length === 0}
                  >
                    全選所有可用
                  </button>
                  <button
                    type="button"
                    className="wa-modal-btn-pill"
                    style={{ color: 'var(--wa-text-muted)' }}
                    onClick={() => handleQuickSelectEvent('clear')}
                    disabled={submitting || selectedUserIds.size === 0}
                  >
                    清空選取
                  </button>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-muted)' }}>
                  已選取 <strong style={{ color: 'var(--wa-primary)' }}>{selectedUserIds.size}</strong> 位隊員
                </div>
              </div>

              {/* 名冊表格清單 */}
              <div style={{ border: '1px solid var(--wa-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--wa-border)', textAlign: 'left' }}>
                      <th style={{ width: '40px', padding: '10px 12px' }}>選取</th>
                      <th style={{ padding: '10px 12px' }}>姓名 / 身分</th>
                      <th style={{ padding: '10px 12px' }}>原錄取狀態</th>
                      <th style={{ padding: '10px 12px' }}>原繳費狀態</th>
                      <th style={{ padding: '10px 12px' }}>電話 / 系所</th>
                      <th style={{ padding: '10px 12px' }}>目標活動狀態比對</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceSignups.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--wa-text-muted)' }}>
                          {loadingSourceSignups ? '正在讀取名冊...' : '此活動尚無報名人員'}
                        </td>
                      </tr>
                    ) : (
                      sourceSignups.map((item) => {
                        const exist = existingMap.get(item.line_user_id);
                        const isCancelled = exist && (exist.status.includes('取消') || exist.status.toLowerCase().includes('cancelled'));
                        const isActiveConflict = exist && !isCancelled;
                        const isSelected = selectedUserIds.has(item.line_user_id);

                        return (
                          <tr
                            key={item.line_user_id}
                            style={{
                              borderBottom: '1px solid var(--wa-border)',
                              backgroundColor: isActiveConflict ? '#f8fafc' : (isSelected ? 'rgba(3, 105, 161, 0.05)' : 'transparent'),
                              opacity: isActiveConflict ? 0.6 : 1,
                              cursor: isActiveConflict ? 'not-allowed' : 'pointer'
                            }}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.tagName && target.tagName.toLowerCase() === 'input') return;
                              handleToggleSelect(item.line_user_id, !!isActiveConflict);
                            }}
                          >
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="checkbox"
                                className="wa-modal-checkbox"
                                checked={isSelected}
                                disabled={!!isActiveConflict || submitting}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => handleToggleSelect(item.line_user_id, !!isActiveConflict)}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--wa-text-primary)' }}>{item.name || '無姓名'}</div>
                              {item.is_officer && (
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 6px', borderRadius: '4px' }}>
                                  幹部 {item.officer_role ? `(${item.officer_role})` : ''}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                backgroundColor: item.status?.includes('正取') ? '#dcfce7' : (item.status?.includes('備取') ? '#fef9c3' : '#f1f5f9'),
                                color: item.status?.includes('正取') ? '#15803d' : (item.status?.includes('備取') ? '#a16207' : '#475569')
                              }}>
                                {item.status || '審核中'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                backgroundColor: item.payment_status?.includes('已繳費') ? '#dcfce7' : '#fee2e2',
                                color: item.payment_status?.includes('已繳費') ? '#15803d' : '#b91c1c'
                              }}>
                                {item.payment_status || '未繳費'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--wa-text-secondary)', fontSize: '0.8rem' }}>
                              <div>{item.phone || '-'}</div>
                              <div>{item.department || '-'}</div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {isActiveConflict ? (
                                <span style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: 600 }}>
                                  已在此名冊中 ({exist.status})
                                </span>
                              ) : isCancelled ? (
                                <span style={{ color: '#ea580c', fontSize: '0.78rem', fontWeight: 600 }}>
                                  重啟報名 (曾取消)
                                </span>
                              ) : (
                                <span style={{ color: '#16a34a', fontSize: '0.78rem' }}>
                                  可全新導入
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: 從社員名冊新增 */}
          {activeTab === 'from_members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 搜尋與篩選列 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="wa-modal-input"
                    style={{ paddingLeft: '32px', width: '100%' }}
                    placeholder="搜尋姓名、學號、系所或電話..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <button
                  type="button"
                  className="wa-modal-btn-pill"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: onlyOfficers ? '#0284c7' : '#ffffff',
                    color: onlyOfficers ? '#ffffff' : '#334155',
                    borderColor: onlyOfficers ? '#0284c7' : '#cbd5e1'
                  }}
                  onClick={() => setOnlyOfficers(!onlyOfficers)}
                  disabled={submitting}
                >
                  <Shield size={16} />
                  <span>僅顯示幹部</span>
                </button>

                <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-muted)' }}>
                  已選取 <strong style={{ color: 'var(--wa-primary)' }}>{selectedUserIds.size}</strong> 位人員
                </div>
              </div>

              {/* 匯入設定區塊 */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--wa-border)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>入隊狀態：</span>
                  <select
                    className="wa-modal-select"
                    style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                    value={memberTargetStatus}
                    onChange={(e) => setMemberTargetStatus(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="正取 Confirmed">正取 Confirmed</option>
                    <option value="備取 Waitlisted">備取 Waitlisted</option>
                    <option value="審核中 Checking">審核中 Checking</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>繳費狀態：</span>
                  <select
                    className="wa-modal-select"
                    style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                    value={memberTargetPaymentStatus}
                    onChange={(e) => setMemberTargetPaymentStatus(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="未繳費 Unpaid">未繳費 Unpaid</option>
                    <option value="已繳費 Paid">已繳費 Paid</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: '200px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>自訂備註：</span>
                  <input
                    type="text"
                    className="wa-modal-input"
                    style={{ padding: '4px 8px', fontSize: '0.85rem', width: '100%' }}
                    placeholder="如：幹部口頭報名隨隊..."
                    value={memberCustomNotes}
                    onChange={(e) => setMemberCustomNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              {/* 社員表格 */}
              <div style={{ border: '1px solid var(--wa-border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--wa-border)', textAlign: 'left' }}>
                      <th style={{ width: '40px', padding: '10px 12px' }}>選取</th>
                      <th style={{ padding: '10px 12px' }}>姓名 / 身分</th>
                      <th style={{ padding: '10px 12px' }}>學號 / 系所</th>
                      <th style={{ padding: '10px 12px' }}>聯絡電話</th>
                      <th style={{ padding: '10px 12px' }}>個資出隊完整度</th>
                      <th style={{ padding: '10px 12px' }}>目標活動狀態比對</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingMembers ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--wa-text-muted)' }}>
                          正在載入社員名冊...
                        </td>
                      </tr>
                    ) : filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--wa-text-muted)' }}>
                          無符合條件之人員
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((item) => {
                        const exist = existingMap.get(item.line_user_id);
                        const isCancelled = exist && (exist.status.includes('取消') || exist.status.toLowerCase().includes('cancelled'));
                        const isActiveConflict = exist && !isCancelled;
                        const isSelected = selectedUserIds.has(item.line_user_id);
                        const isComplete = checkProfileCompleteness(item);

                        return (
                          <tr
                            key={item.line_user_id}
                            style={{
                              borderBottom: '1px solid var(--wa-border)',
                              backgroundColor: isActiveConflict ? '#f8fafc' : (isSelected ? 'rgba(3, 105, 161, 0.05)' : 'transparent'),
                              opacity: isActiveConflict ? 0.6 : 1,
                              cursor: isActiveConflict ? 'not-allowed' : 'pointer'
                            }}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (target.tagName && target.tagName.toLowerCase() === 'input') return;
                              handleToggleSelect(item.line_user_id, !!isActiveConflict);
                            }}
                          >
                            <td style={{ padding: '10px 12px' }}>
                              <input
                                type="checkbox"
                                className="wa-modal-checkbox"
                                checked={isSelected}
                                disabled={!!isActiveConflict || submitting}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => handleToggleSelect(item.line_user_id, !!isActiveConflict)}
                              />
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--wa-text-primary)' }}>{item.name || '無姓名'}</div>
                              {item.is_officer && (
                                <span style={{ fontSize: '0.72rem', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 6px', borderRadius: '4px' }}>
                                  幹部 {item.officer_role ? `(${item.officer_role})` : ''}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--wa-text-secondary)', fontSize: '0.8rem' }}>
                              <div>{item.student_id || '-'}</div>
                              <div>{item.department || '-'}</div>
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--wa-text-secondary)', fontSize: '0.8rem' }}>
                              {item.phone || '-'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {isComplete ? (
                                <span style={{ color: '#16a34a', fontSize: '0.78rem' }}>完整</span>
                              ) : (
                                <span style={{
                                  backgroundColor: '#ffedd5',
                                  color: '#c2410c',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600
                                }}>
                                  個資待補齊
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {isActiveConflict ? (
                                <span style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: 600 }}>
                                  已在此名冊中 ({exist.status})
                                </span>
                              ) : isCancelled ? (
                                <span style={{ color: '#ea580c', fontSize: '0.78rem', fontWeight: 600 }}>
                                  重啟報名 (曾取消)
                                </span>
                              ) : (
                                <span style={{ color: '#16a34a', fontSize: '0.78rem' }}>
                                  可直接新增
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="wa-modal-footer">
          <button
            type="button"
            className="wa-modal-btn-pill"
            style={{ padding: '8px 18px', fontSize: '0.88rem' }}
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            className="wa-modal-btn-primary"
            onClick={handleExecuteImport}
            disabled={submitting || selectedUserIds.size === 0}
          >
            {submitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>處理中...</span>
              </>
            ) : (
              <>
                <ArrowRight size={16} />
                <span>確認加入名冊 ({selectedUserIds.size} 人)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

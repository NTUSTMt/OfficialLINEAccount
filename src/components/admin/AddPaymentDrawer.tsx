import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  Search,
  CheckSquare,
  Square,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Bell,
  DollarSign,
  Calendar,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import type { AdminEvent, SignupApplicant } from '../../types/event';
import type { AdminMemberListItem, NewPaymentRequest } from '../../types/admin';
import {
  createManualPaymentRequestsInSupabase,
  fetchAdminEventSignupsFromSupabase,
} from '../../utils/supabaseClient';
import { notifyDispatcher } from '../../utils/api';
import '../../pages/web-admin/webAdmin.css';

export interface AddPaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: AdminEvent[];
  members: AdminMemberListItem[];
  officerUserId: string;
  onSuccess?: () => void;
}

export type PaymentCategoryType = 'activity' | 'equipment' | 'membership' | 'general';

export interface SelectedMemberItem {
  line_user_id: string;
  name: string;
  info: string;
  amount: number;
}

export const AddPaymentDrawer: React.FC<AddPaymentDrawerProps> = ({
  isOpen,
  onClose,
  events,
  members,
  officerUserId,
  onSuccess,
}) => {
  // 基本款項欄位
  const [title, setTitle] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [category, setCategory] = useState<PaymentCategoryType>('activity');
  const [uniformAmount, setUniformAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // 名冊勾選模式: 'event' (從活動成員選取) vs 'roster' (從全社名冊搜尋選取)
  const [selectionMode, setSelectionMode] = useState<'event' | 'roster'>('event');

  // 活動報名成員狀態
  const [eventApplicants, setEventApplicants] = useState<SignupApplicant[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [applicantFilter, setApplicantFilter] = useState<'all' | 'accepted'>('all');

  // 全社名冊搜尋狀態
  const [rosterSearch, setRosterSearch] = useState('');

  // 已選取成員清單 (Keyed by line_user_id)
  const [selectedMembers, setSelectedMembers] = useState<Record<string, SelectedMemberItem>>({});

  // 通知設定 (預設勾選)
  const [sendNotification, setSendNotification] = useState(true);

  // 提交狀態
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 當開啟或關聯活動變更時，若選了活動，載入活動成員
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (selectedEventId) {
      setLoadingApplicants(true);
      fetchAdminEventSignupsFromSupabase(officerUserId, selectedEventId)
        .then((applicants) => {
          setEventApplicants(applicants || []);
          setLoadingApplicants(false);
        })
        .catch((err) => {
          console.error('[AddPaymentDrawer] 載入活動名冊失敗:', err);
          setEventApplicants([]);
          setLoadingApplicants(false);
        });
    } else {
      setEventApplicants([]);
      setLoadingApplicants(false);
      // 若無關聯活動，自動切換至全社搜尋模式
      setSelectionMode('roster');
    }
  }, [isOpen, selectedEventId, officerUserId]);

  // 重設表單
  const handleResetForm = () => {
    setTitle('');
    setSelectedEventId('');
    setCategory('activity');
    setUniformAmount(0);
    setNotes('');
    setSelectionMode('event');
    setEventApplicants([]);
    setSelectedMembers({});
    setSendNotification(true);
    setRosterSearch('');
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleClose = () => {
    handleResetForm();
    onClose();
  };

  // 關聯活動變更處理
  const handleEventChange = (eventId: string) => {
    setSelectedEventId(eventId);
    if (eventId) {
      setSelectionMode('event');
      // 自動帶入活動名稱為預設標題 (若尚未填寫)
      if (!title.trim()) {
        const ev = events.find((e) => e.id === eventId);
        if (ev) {
          setTitle(`${ev.name} 活動費用`);
          const costNum = Number(ev.cost);
          if (!isNaN(costNum) && costNum > 0) {
            setUniformAmount(costNum);
          }
        }
      }
    } else {
      setSelectionMode('roster');
    }
  };

  // 活動報名成員依篩選條件過濾
  const filteredEventApplicants = useMemo(() => {
    if (applicantFilter === 'accepted') {
      return eventApplicants.filter((a) => {
        const res = a.reviewResult || '';
        return res.includes('正取') || res.toLowerCase().includes('confirmed');
      });
    }
    return eventApplicants;
  }, [eventApplicants, applicantFilter]);

  // 全社名冊搜尋過濾
  const filteredRosterMembers = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) {
      return members.slice(0, 30);
    }
    return members.filter((m) => {
      const nameMatch = m.name?.toLowerCase().includes(q);
      const studentIdMatch = m.student_id?.toLowerCase().includes(q);
      const deptMatch = m.department?.toLowerCase().includes(q);
      return nameMatch || studentIdMatch || deptMatch;
    });
  }, [members, rosterSearch]);

  // 切換選取單一成員
  const toggleMemberSelection = (item: {
    line_user_id: string;
    name: string;
    info: string;
  }) => {
    if (!item.line_user_id) {
      return;
    }
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      if (copy[item.line_user_id]) {
        delete copy[item.line_user_id];
      } else {
        copy[item.line_user_id] = {
          line_user_id: item.line_user_id,
          name: item.name,
          info: item.info,
          amount: uniformAmount || 0,
        };
      }
      return copy;
    });
  };

  // 全選活動報名者
  const handleSelectAllEventApplicants = () => {
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      filteredEventApplicants.forEach((a) => {
        const uid = a.userId || a.lineId;
        if (uid) {
          copy[uid] = {
            line_user_id: uid,
            name: a.name,
            info: [a.studentId, a.department].filter(Boolean).join(' ') || (a.reviewResult || '活動報名者'),
            amount: uniformAmount || 0,
          };
        }
      });
      return copy;
    });
  };

  // 全消活動報名者 (僅移除當前活動列表中的成員)
  const handleDeselectAllEventApplicants = () => {
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      filteredEventApplicants.forEach((a) => {
        const uid = a.userId || a.lineId;
        if (uid && copy[uid]) {
          delete copy[uid];
        }
      });
      return copy;
    });
  };

  // 全選搜尋到的全社成員
  const handleSelectAllRosterSearch = () => {
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      filteredRosterMembers.forEach((m) => {
        if (m.line_user_id) {
          copy[m.line_user_id] = {
            line_user_id: m.line_user_id,
            name: m.name,
            info: [m.student_id, m.department].filter(Boolean).join(' ') || '社員名冊',
            amount: uniformAmount || 0,
          };
        }
      });
      return copy;
    });
  };

  // 全消所有已選成員
  const handleClearAllSelected = () => {
    setSelectedMembers({});
  };

  // 批次套用統一金額至所有已選成員
  const handleApplyUniformAmountToAll = () => {
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((uid) => {
        copy[uid].amount = uniformAmount || 0;
      });
      return copy;
    });
  };

  // 修改個別成員應繳金額
  const handleUpdateMemberAmount = (userId: string, newAmount: number) => {
    setSelectedMembers((prev) => {
      if (!prev[userId]) return prev;
      return {
        ...prev,
        [userId]: {
          ...prev[userId],
          amount: newAmount,
        },
      };
    });
  };

  // 從已選名冊中移除個別成員
  const handleRemoveSelectedMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
  };

  // 轉換款項類別至 target_type
  const resolveTargetType = (cat: PaymentCategoryType): 'event' | 'loan' | 'membership' | 'general' => {
    switch (cat) {
      case 'activity':
        return 'event';
      case 'equipment':
        return 'loan';
      case 'membership':
        return 'membership';
      default:
        return 'general';
    }
  };

  // 提交處理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorMessage('請填寫款項名稱');
      return;
    }

    const selectedList = Object.values(selectedMembers);
    if (selectedList.length === 0) {
      setErrorMessage('請至少選取一位應繳費成員');
      return;
    }

    setIsSubmitting(true);

    try {
      const targetType = resolveTargetType(category);
      const requests: NewPaymentRequest[] = selectedList.map((m) => ({
        line_user_id: m.line_user_id,
        name: m.name,
        type: cleanTitle,
        amount: Number(m.amount) || 0,
        target_type: targetType,
        target_id: selectedEventId || null,
        notes: notes.trim(),
        notification_status: sendNotification ? '已通知' : '未通知',
      }));

      const res = await createManualPaymentRequestsInSupabase(requests, officerUserId);
      if (!res.success) {
        setErrorMessage(`[建立款項失敗]: ${res.error || '寫入資料庫發生錯誤'}`);
        setIsSubmitting(false);
        return;
      }

      // 若勾選立即透過 LINE 發送繳費通知卡片
      if (sendNotification) {
        let notifyFailCount = 0;
        for (const m of selectedList) {
          if (!m.line_user_id) continue;
          try {
            const payload = {
              lineUserId: m.line_user_id,
              userName: m.name,
              title: cleanTitle,
              amount: Number(m.amount) || 0,
              notes: notes.trim(),
              bankInfo: {
                bankCode: '700 (中華郵政)',
                accountNumber: '0001236 0543210',
                accountName: '國立臺灣科技大學登山社',
              },
            };
            const notifyRes = await notifyDispatcher('notify_payment_reminder', payload);
            if (!notifyRes.success) {
              notifyFailCount++;
              console.warn(`[AddPaymentDrawer] LINE 通知發送未完全成功 (${m.name}):`, notifyRes.message);
            }
          } catch (notifErr) {
            notifyFailCount++;
            console.error(`[AddPaymentDrawer] LINE 通知推播例外 (${m.name}):`, notifErr);
          }
        }

        if (notifyFailCount > 0) {
          console.warn(`[AddPaymentDrawer] 建立成功，但有 ${notifyFailCount} 筆 LINE 通知推播失敗`);
        }
      }

      setSuccessMessage(`成功建立 ${res.count} 筆款項請求！`);
      setTimeout(() => {
        setIsSubmitting(false);
        if (onSuccess) {
          onSuccess();
        }
        handleClose();
      }, 700);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  const selectedList = Object.values(selectedMembers);
  const totalAmount = selectedList.reduce((acc, cur) => acc + (Number(cur.amount) || 0), 0);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="wa-drawer-backdrop" onClick={handleClose}>
      <div
        className="wa-drawer-panel wa-add-payment-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 抽屜標頭 */}
        <div className="wa-drawer-header">
          <div>
            <h2 className="wa-drawer-title">新增繳費 / 追加款項</h2>
            <div className="wa-drawer-subtitle" style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
              批次建立活動費用、裝備賠償或追加款項，並可直接推播繳費通知
            </div>
          </div>
          <button
            type="button"
            className="wa-drawer-close-btn"
            onClick={handleClose}
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </div>

        {/* 抽屜主體 */}
        <form onSubmit={handleSubmit} className="wa-drawer-body wa-add-payment-form">
          {/* 錯誤提示 (錯誤透明度) */}
          {errorMessage && (
            <div className="wa-drawer-alert wa-drawer-alert-danger">
              <AlertCircle size={18} />
              <div className="wa-drawer-alert-content">
                <div className="wa-drawer-alert-title">操作失敗</div>
                <div className="wa-drawer-alert-desc">{errorMessage}</div>
              </div>
            </div>
          )}

          {/* 成功提示 */}
          {successMessage && (
            <div className="wa-drawer-alert wa-drawer-alert-success">
              <CheckCircle2 size={18} />
              <div className="wa-drawer-alert-content">
                <div className="wa-drawer-alert-title">處理完成</div>
                <div className="wa-drawer-alert-desc">{successMessage}</div>
              </div>
            </div>
          )}

          {/* 基本設定區塊 */}
          <div className="wa-drawer-section">
            <h3 className="wa-drawer-section-title">
              <Calendar size={16} />
              <span>基本款項資訊</span>
            </h3>

            <div className="wa-form-grid">
              {/* 款項名稱 */}
              <div className="wa-form-group full-width">
                <label className="wa-form-label">
                  款項名稱 <span className="wa-required">*</span>
                </label>
                <input
                  type="text"
                  className="wa-form-input"
                  placeholder="例如：加購高山瓦斯罐 / 慶功宴費用 / 活動保險追加款"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* 關聯活動 */}
              <div className="wa-form-group">
                <label className="wa-form-label">關聯活動</label>
                <select
                  className="wa-form-select"
                  value={selectedEventId}
                  onChange={(e) => handleEventChange(e.target.value)}
                >
                  <option value="">無關聯特定活動</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} ({ev.startDate || '未定日期'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 款項類別 */}
              <div className="wa-form-group">
                <label className="wa-form-label">款項類別</label>
                <select
                  className="wa-form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PaymentCategoryType)}
                >
                  <option value="activity">活動費用 (activity)</option>
                  <option value="equipment">裝備租借 (equipment)</option>
                  <option value="membership">社籍社費 (membership)</option>
                  <option value="general">其他款項 (general)</option>
                </select>
              </div>

              {/* 統一金額 */}
              <div className="wa-form-group">
                <label className="wa-form-label">
                  統一金額 (NT$)
                  <span className="wa-label-tip">新選取成員預設帶入金額</span>
                </label>
                <div className="wa-input-with-button">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="wa-form-input"
                    placeholder="0"
                    value={uniformAmount || ''}
                    onChange={(e) => setUniformAmount(Number(e.target.value) || 0)}
                  />
                  {selectedList.length > 0 && (
                    <button
                      type="button"
                      className="wa-btn-secondary-sm"
                      onClick={handleApplyUniformAmountToAll}
                      title="將此金額批次套用至已選成員"
                    >
                      套用至已選
                    </button>
                  )}
                </div>
              </div>

              {/* 備註說明 */}
              <div className="wa-form-group full-width">
                <label className="wa-form-label">備註說明 (選填)</label>
                <textarea
                  className="wa-form-textarea"
                  rows={2}
                  placeholder="例如：請於出隊前完成繳費並回傳末五碼；包含保險與高山接駁攤提。"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 成員選取區塊 (雙模式) */}
          <div className="wa-drawer-section">
            <div className="wa-section-header-row">
              <h3 className="wa-drawer-section-title">
                <Users size={16} />
                <span>應繳費成員選取</span>
              </h3>

              {/* 雙模式切換頁籤 */}
              <div className="wa-subtab-container">
                <button
                  type="button"
                  className={`wa-subtab-btn ${selectionMode === 'event' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('event')}
                  disabled={!selectedEventId}
                  title={!selectedEventId ? '請先選擇關聯活動' : '從活動成員選取'}
                >
                  從活動成員選取
                </button>
                <button
                  type="button"
                  className={`wa-subtab-btn ${selectionMode === 'roster' ? 'active' : ''}`}
                  onClick={() => setSelectionMode('roster')}
                >
                  從全社名冊搜尋選取
                </button>
              </div>
            </div>

            {/* Mode 1: 從活動成員選取 */}
            {selectionMode === 'event' && (
              <div className="wa-selection-box">
                {!selectedEventId ? (
                  <div className="wa-selection-empty">
                    請先於上方選取「關聯活動」，即可快速選取該活動之報名或正取社員。
                  </div>
                ) : loadingApplicants ? (
                  <div className="wa-selection-loading">
                    <RefreshCw size={16} className="wa-spinner" />
                    <span>讀取活動報名名冊中...</span>
                  </div>
                ) : eventApplicants.length === 0 ? (
                  <div className="wa-selection-empty">
                    此活動目前尚無任何報名紀錄。
                  </div>
                ) : (
                  <>
                    <div className="wa-selection-controls">
                      <div className="wa-filter-chips">
                        <button
                          type="button"
                          className={`wa-chip ${applicantFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setApplicantFilter('all')}
                        >
                          全部報名者 ({eventApplicants.length})
                        </button>
                        <button
                          type="button"
                          className={`wa-chip ${applicantFilter === 'accepted' ? 'active' : ''}`}
                          onClick={() => setApplicantFilter('accepted')}
                        >
                          僅正取名單
                        </button>
                      </div>

                      <div className="wa-btn-group">
                        <button
                          type="button"
                          className="wa-btn-text-sm"
                          onClick={handleSelectAllEventApplicants}
                        >
                          <CheckSquare size={14} />
                          <span>全選</span>
                        </button>
                        <button
                          type="button"
                          className="wa-btn-text-sm"
                          onClick={handleDeselectAllEventApplicants}
                        >
                          <Square size={14} />
                          <span>全消</span>
                        </button>
                      </div>
                    </div>

                    <div className="wa-applicant-checklist">
                      {filteredEventApplicants.map((app) => {
                        const uid = app.userId || app.lineId;
                        const isSelected = Boolean(uid && selectedMembers[uid]);
                        const infoText = [app.studentId, app.department].filter(Boolean).join(' ') || (app.reviewResult || '報名者');

                        return (
                          <div
                            key={app.signupCode || app.rowNumber || uid}
                            className={`wa-checklist-item ${isSelected ? 'selected' : ''}`}
                            onClick={() =>
                              toggleMemberSelection({
                                line_user_id: uid,
                                name: app.name,
                                info: infoText,
                              })
                            }
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="wa-checkbox"
                            />
                            <div className="wa-checklist-info">
                              <span className="wa-checklist-name">{app.name}</span>
                              <span className="wa-checklist-meta">{infoText}</span>
                            </div>
                            <span className="wa-checklist-badge">{app.reviewResult || '審核中'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mode 2: 從全社名冊搜尋選取 */}
            {selectionMode === 'roster' && (
              <div className="wa-selection-box">
                <div className="wa-search-control-bar">
                  <div className="wa-search-box-wrapper">
                    <Search size={15} className="wa-search-icon" />
                    <input
                      type="text"
                      className="wa-search-input"
                      placeholder="搜尋姓名、學號或系級..."
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                    />
                    {rosterSearch && (
                      <button
                        type="button"
                        className="wa-search-clear-btn"
                        onClick={() => setRosterSearch('')}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="wa-btn-group">
                    <button
                      type="button"
                      className="wa-btn-text-sm"
                      onClick={handleSelectAllRosterSearch}
                    >
                      <CheckSquare size={14} />
                      <span>全選</span>
                    </button>
                    <button
                      type="button"
                      className="wa-btn-text-sm"
                      onClick={handleClearAllSelected}
                    >
                      <Square size={14} />
                      <span>全消</span>
                    </button>
                  </div>
                </div>

                <div className="wa-applicant-checklist">
                  {filteredRosterMembers.length === 0 ? (
                    <div className="wa-selection-empty">
                      找不到符合「{rosterSearch}」的社員。
                    </div>
                  ) : (
                    filteredRosterMembers.map((m) => {
                      const isSelected = Boolean(selectedMembers[m.line_user_id]);
                      const infoText = [m.student_id, m.department].filter(Boolean).join(' ') || (m.identity_status || '社員');

                      return (
                        <div
                          key={m.line_user_id}
                          className={`wa-checklist-item ${isSelected ? 'selected' : ''}`}
                          onClick={() =>
                            toggleMemberSelection({
                              line_user_id: m.line_user_id,
                              name: m.name,
                              info: infoText,
                            })
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="wa-checkbox"
                          />
                          <div className="wa-checklist-info">
                            <span className="wa-checklist-name">{m.name}</span>
                            <span className="wa-checklist-meta">{infoText}</span>
                          </div>
                          {m.is_official_member && (
                            <span className="wa-checklist-badge official">已繳社費</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 已選成員名冊與金額個別調整 (Selected Members Roster) */}
          <div className="wa-drawer-section">
            <div className="wa-section-header-row">
              <h3 className="wa-drawer-section-title">
                <UserCheck size={16} />
                <span>已選取成員名冊 ({selectedList.length} 位)</span>
              </h3>
              {selectedList.length > 0 && (
                <button
                  type="button"
                  className="wa-btn-text-danger-sm"
                  onClick={handleClearAllSelected}
                >
                  <Trash2 size={13} />
                  <span>全部清空</span>
                </button>
              )}
            </div>

            {selectedList.length === 0 ? (
              <div className="wa-selection-empty">
                尚未選取任何應繳費成員。請從上方活動成員或全社名冊中勾選。
              </div>
            ) : (
              <div className="wa-selected-roster-table-wrapper">
                <table className="wa-roster-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>社員姓名</th>
                      <th style={{ width: '35%' }}>學號/資訊</th>
                      <th style={{ width: '25%' }}>應繳金額</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedList.map((item) => (
                      <tr key={item.line_user_id}>
                        <td>
                          <div className="wa-table-cell-name">{item.name}</div>
                        </td>
                        <td>
                          <div className="wa-table-cell-info">{item.info}</div>
                        </td>
                        <td>
                          <div className="wa-amount-input-box">
                            <span className="wa-currency-prefix">$</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className="wa-amount-input"
                              value={item.amount || ''}
                              onChange={(e) =>
                                handleUpdateMemberAmount(item.line_user_id, Number(e.target.value) || 0)
                              }
                            />
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="wa-action-icon-btn danger"
                            onClick={() => handleRemoveSelectedMember(item.line_user_id)}
                            title="從名冊移除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 應收總額統計列 */}
                <div className="wa-roster-summary-bar">
                  <span>共選取 <strong>{selectedList.length}</strong> 位成員</span>
                  <span>
                    應收總額：
                    <strong className="wa-summary-total">NT$ {totalAmount.toLocaleString()}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* LINE 通知選項 */}
          <div className="wa-drawer-section wa-notify-section">
            <label className="wa-checkbox-label">
              <input
                type="checkbox"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="wa-checkbox"
              />
              <div className="wa-checkbox-text">
                <div className="wa-checkbox-title">
                  <Bell size={15} />
                  <span>建立後立即透過 LINE 發送繳費通知卡片 (含回報按鈕)</span>
                </div>
                <div className="wa-checkbox-desc">
                  系統將透過 LINE Bot 自動發送包含金額與回報核銷連結的個人化推播通知。
                </div>
              </div>
            </label>
          </div>

          {/* 抽屜底座送出列 */}
          <div className="wa-drawer-footer">
            <button
              type="button"
              className="wa-btn-secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="wa-btn-primary"
              disabled={isSubmitting || selectedList.length === 0}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="wa-spinner" />
                  <span>正在建立款項...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>確認建立款項 ({selectedList.length} 筆)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

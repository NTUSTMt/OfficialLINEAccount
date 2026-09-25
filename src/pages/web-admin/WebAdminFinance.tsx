import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Check,
  User,
  Pencil,
  X,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Eye,
  EyeOff,
  Pin,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  GripVertical
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import {
  fetchFinanceItemsFromSupabase,
  updatePaymentAndLinkedStatusInSupabase
} from '../../utils/supabaseClient';
import type { AdminFinanceItem } from '../../types/admin';
import { MemberProfileModal } from '../../components/admin/MemberProfileModal';
import { MemberEditDrawer } from '../../components/admin/MemberEditDrawer';
import { useAdvancedTable, type AdvancedColumnDef } from '../../components/admin/useAdvancedTable';
import { openExternalUrl } from '../../utils/applicantUtils';
import { GAS_API_URL } from '../../constants/api';
import './webAdmin.css';

const FINANCE_COLUMNS: AdvancedColumnDef[] = [
  { key: 'id', label: '款項單號', defaultWidth: 160, minWidth: 120 },
  { key: 'applicant', label: '繳費 / 申請人', defaultWidth: 150, minWidth: 120 },
  { key: 'type', label: '款項說明', defaultWidth: 200, minWidth: 140 },
  { key: 'amount', label: '金額', defaultWidth: 100, minWidth: 80 },
  { key: 'bank_last5', label: '帳號末五碼', defaultWidth: 110, minWidth: 90 },
  { key: 'status', label: '核銷狀態', defaultWidth: 130, minWidth: 100 },
  { key: 'created_at', label: '申報時間', defaultWidth: 150, minWidth: 120 },
  { key: 'notes', label: '備註說明', defaultWidth: 180, minWidth: 120 },
  { key: 'actions', label: '操作', defaultWidth: 120, minWidth: 90 },
];

export const WebAdminFinance: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const navigate = useNavigate();

  const [items, setItems] = useState<AdminFinanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  // 個人資料彈窗 (MemberProfileModal)
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [profileModalMember, setProfileModalMember] = useState<any>(null);

  // 個人資料編輯抽屜 (MemberEditDrawer)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editDrawerUserId, setEditDrawerUserId] = useState<string | null>(null);

  // 表格拖曳狀態
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

  // 右側滑出式編輯視窗 (Slide-over Drawer)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminFinanceItem | null>(null);
  const [drawerStatus, setDrawerStatus] = useState<'待繳費 Unpaid' | '待確認 Checking' | '已核銷 Confirmed'>('待確認 Checking');
  const [drawerNotificationStatus, setDrawerNotificationStatus] = useState<'未通知' | '已通知'>('未通知');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // 欄位點擊調整欄高 (Cell Expansion)
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const toggleCellExpand = (cellKey: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      return next;
    });
  };

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  const loadPayments = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSelectedIds(new Set());
    try {
      const data = await fetchFinanceItemsFromSupabase(session.userId);
      setItems(data);

      logWebAuditAction(client, session.userId, 'VIEW_FINANCE_LIST', 'payment', undefined, {
        count: data.length,
      });
    } catch (err: any) {
      console.error('[WebAdminFinance] loadPayments error:', err);
      const error = err || {};
      setErrorMsg(`[讀取財務繳費資料失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [session.userId]);

  // 過濾清單
  const filteredItems = useMemo(() => {
    return items.filter((p) => {
      const matchKeyword =
        !searchKeyword ||
        (p.name && p.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.type && p.type.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.target_id && p.target_id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.id && p.id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.bank_last5 && p.bank_last5.includes(searchKeyword));

      const isPending =
        p.status.includes('待確認') ||
        p.status.includes('Checking') ||
        p.status.includes('待繳費') ||
        p.status.includes('Unpaid') ||
        p.status.includes('未繳費');

      const isConfirmed =
        p.status.includes('已核銷') ||
        p.status.includes('Confirmed') ||
        p.status.includes('已繳費') ||
        p.status.includes('Paid');

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PENDING' && isPending) ||
        (statusFilter === 'CONFIRMED' && isConfirmed);

      const matchCategory =
        categoryFilter === 'ALL' ||
        (categoryFilter === 'activity' && (p.itemCategory === 'activity' || p.sourceType === 'event_signup' || (p.type || '').includes('活動'))) ||
        (categoryFilter === 'equipment' && (p.itemCategory === 'equipment' || p.sourceType === 'loan' || (p.type || '').includes('裝備'))) ||
        (categoryFilter === 'membership' && (p.itemCategory === 'membership' || (p.type || '').includes('社籍') || (p.type || '').includes('社費')));

      return matchKeyword && matchStatus && matchCategory;
    });
  }, [items, searchKeyword, statusFilter, categoryFilter]);

  // 高階表格狀態管理
  const {
    pinnedColumns,
    hiddenColumns,
    columnWidths,
    pinnedRowIds,
    hiddenRowIds,
    showHiddenMenu,
    setShowHiddenMenu,
    hiddenMenuRef,
    moveColumn,
    reorderColumn,
    togglePinColumn,
    hideColumn,
    unhideColumn,
    unhideAllColumnsAndRows,
    resetColumnWidthsAndHeights,
    startResizing,
    moveRow,
    togglePinRow,
    hideRow,
    handleDropRow,
    draggedRowId,
    setDraggedRowId,
    visibleColumns,
    stickyLeftPositions,
    lastPinnedKey,
    sortedItems,
  } = useAdvancedTable<AdminFinanceItem>({
    storageKey: 'wa_finance_table_prefs_v1',
    columns: FINANCE_COLUMNS,
    items: filteredItems,
    getItemId: (item) => item.id,
  });

  // 統計金額與筆數
  const stats = useMemo(() => {
    let pendingCount = 0;
    let pendingAmount = 0;
    let confirmedCount = 0;
    let confirmedAmount = 0;

    items.forEach((p) => {
      const isPending =
        p.status.includes('待確認') ||
        p.status.includes('Checking') ||
        p.status.includes('待繳費') ||
        p.status.includes('Unpaid') ||
        p.status.includes('未繳費');

      const isConfirmed =
        p.status.includes('已核銷') ||
        p.status.includes('Confirmed') ||
        p.status.includes('已繳費') ||
        p.status.includes('Paid');

      if (isPending) {
        pendingCount++;
        pendingAmount += Number(p.amount) || 0;
      } else if (isConfirmed) {
        confirmedCount++;
        confirmedAmount += Number(p.amount) || 0;
      }
    });

    return { pendingCount, pendingAmount, confirmedCount, confirmedAmount, totalCount: items.length };
  }, [items]);

  // 單筆核銷
  const handleVerifyItem = async (item: AdminFinanceItem) => {
    setProcessingId(item.id);
    setErrorMsg(null);
    try {
      const res = await updatePaymentAndLinkedStatusInSupabase({
        paymentId: item.id,
        sourceType: item.sourceType,
        targetType: item.target_type,
        targetId: item.target_id,
        newStatus: '已核銷 Confirmed',
        officerName: session.displayName || '管理幹部',
        lineUserId: item.line_user_id,
        notes: item.officer_notes || item.notes,
        officerUserId: session.userId,
        notificationStatus: '未通知'
      });

      if (!res.success) {
        throw new Error(res.error || '核銷作業失敗');
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, status: '已核銷 Confirmed', payment_status: '已繳費 Paid' }
            : p
        )
      );

      setSuccessMsg(`款項 [${item.name} - $${item.amount}] 已核銷成功！`);
      setTimeout(() => setSuccessMsg(null), 3000);

      logWebAuditAction(client, session.userId, 'VERIFY_PAYMENT', 'payment', item.id, {
        name: item.name,
        amount: item.amount,
        sourceType: item.sourceType
      });
    } catch (err: any) {
      console.error('[WebAdminFinance] handleVerifyItem error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setProcessingId(null);
    }
  };

  // 批次核銷（僅針對待確認 Checking 款項）
  const handleBatchVerify = async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setErrorMsg(null);

    const itemsToVerify = items.filter((p) => selectedIds.has(p.id));
    let successCount = 0;
    const errors: string[] = [];

    for (const item of itemsToVerify) {
      try {
        const res = await updatePaymentAndLinkedStatusInSupabase({
          paymentId: item.id,
          sourceType: item.sourceType,
          targetType: item.target_type,
          targetId: item.target_id,
          newStatus: '已核銷 Confirmed',
          officerName: session.displayName || '管理幹部',
          lineUserId: item.line_user_id,
          notes: item.officer_notes || item.notes,
          officerUserId: session.userId,
          notificationStatus: '未通知'
        });

        if (res.success) {
          successCount++;
        } else {
          errors.push(res.error || `[${item.id}] 核銷失敗`);
        }
      } catch (err: any) {
        errors.push(err.message || String(err));
      }
    }

    if (errors.length > 0) {
      setErrorMsg(`批次核銷部分失敗 (${successCount}/${itemsToVerify.length})：${errors.join('; ')}`);
    } else {
      setSuccessMsg(`已成功批次核銷 ${successCount} 筆款項！`);
      setTimeout(() => setSuccessMsg(null), 3000);
    }

    logWebAuditAction(client, session.userId, 'BATCH_VERIFY_PAYMENTS', 'payment', undefined, {
      count: successCount,
      total: itemsToVerify.length
    });

    await loadPayments();
  };

  // 全選切換（自動排除待繳費 Unpaid 與已核銷 Confirmed）
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const checkingIds = new Set<string>();
      filteredItems.forEach((p) => {
        const isChecking = p.status.includes('待確認') || p.status.includes('Checking');
        if (isChecking) checkingIds.add(p.id);
      });
      setSelectedIds(checkingIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // 開啟個人詳細資料彈窗
  const handleOpenProfileModal = (item: AdminFinanceItem) => {
    setProfileModalUserId(item.line_user_id || null);
    setProfileModalMember({
      line_user_id: item.line_user_id,
      name: item.name,
      notes: item.notes,
    });
  };

  // 開啟右側滑出式編輯視窗
  const handleOpenDrawer = (item: AdminFinanceItem) => {
    setEditingItem(item);
    setDrawerStatus(item.status as any || '待確認 Checking');
    setDrawerNotificationStatus((item.notification_status as any) === '已通知' ? '已通知' : '未通知');
    setDrawerNotes(item.officer_notes || '');
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    if (isSavingDrawer) return;
    setDrawerOpen(false);
    setEditingItem(null);
  };

  // 儲存右側編輯視窗之變更
  const handleSaveDrawer = async () => {
    if (!editingItem) return;
    setIsSavingDrawer(true);
    setErrorMsg(null);

    try {
      // 判定是否發送 LINE 推播通知（若改為「已核銷 Confirmed」且通知狀態為「未通知」）
      const shouldNotify =
        drawerStatus === '已核銷 Confirmed' &&
        drawerNotificationStatus === '未通知' &&
        Boolean(editingItem.line_user_id);
      let finalNotificationStatus = drawerNotificationStatus;

      if (shouldNotify) {
        try {
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'notify_payment_confirmed',
              paymentId: editingItem.id,
              userName: editingItem.name,
              amount: editingItem.amount,
              items: editingItem.type,
              lineUserId: editingItem.line_user_id,
              confirmedBy: session.displayName || '電腦工作站幹部審核'
            })
          }).catch(e => console.warn('[WebAdminFinance] 推播通知例外:', e));

          finalNotificationStatus = '已通知';
        } catch (e) {
          console.warn('[WebAdminFinance] 推播呼叫異常:', e);
        }
      }

      const res = await updatePaymentAndLinkedStatusInSupabase({
        paymentId: editingItem.id,
        sourceType: editingItem.sourceType,
        targetType: editingItem.target_type,
        targetId: editingItem.target_id,
        newStatus: drawerStatus,
        officerName: session.displayName || '電腦工作站幹部',
        lineUserId: editingItem.line_user_id,
        notes: drawerNotes,
        officerUserId: session.userId,
        paymentType: editingItem.type,
        notificationStatus: finalNotificationStatus
      });

      if (!res.success) {
        throw new Error(res.error || '狀態更新失敗');
      }

      setItems((prev) =>
        prev.map((p) =>
          p.id === editingItem.id
            ? {
                ...p,
                status: drawerStatus,
                payment_status:
                  drawerStatus === '已核銷 Confirmed'
                    ? '已繳費 Paid'
                    : drawerStatus === '待繳費 Unpaid'
                    ? '未繳費 Unpaid'
                    : '待確認 Checking',
                notification_status: finalNotificationStatus,
                officer_notes: drawerNotes
              }
            : p
        )
      );

      setSuccessMsg(`款項單號 [${editingItem.id}] 狀態已更新為「${drawerStatus}」！`);
      setTimeout(() => setSuccessMsg(null), 3000);

      logWebAuditAction(client, session.userId, 'UPDATE_PAYMENT_STATUS', 'payment', editingItem.id, {
        status: drawerStatus,
        notificationStatus: finalNotificationStatus,
        officerNotes: drawerNotes
      });

      setDrawerOpen(false);
      setEditingItem(null);
    } catch (err: any) {
      console.error('[WebAdminFinance] handleSaveDrawer error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setIsSavingDrawer(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status.includes('已核銷') || status.includes('Confirmed') || status.includes('已繳費') || status.includes('Paid')) {
      return <span className="web-admin-badge web-admin-badge-success">已核銷 Confirmed</span>;
    }
    if (status.includes('待確認') || status.includes('Checking')) {
      return <span className="web-admin-badge web-admin-badge-warning">待確認 Checking</span>;
    }
    return <span className="web-admin-badge web-admin-badge-info">待繳費 Unpaid</span>;
  };

  return (
    <>
      {/* 訊息提示 */}
      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', border: '1px solid rgba(5, 150, 105, 0.3)', color: '#047857', padding: '10px 16px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 統計概覽卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--wa-border)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', marginBottom: 4 }}>待確認 / 待繳費總額</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--wa-warning)' }}>
            ${stats.pendingAmount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
            共 {stats.pendingCount} 筆款項
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid var(--wa-border)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', marginBottom: 4 }}>已核銷入帳總額</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--wa-success)' }}>
            ${stats.confirmedAmount}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
            共 {stats.confirmedCount} 筆款項
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid var(--wa-border)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', marginBottom: 4 }}>全部財務款項紀錄</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--wa-primary)' }}>
            {stats.totalCount} 筆
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
            包含申報、活動與租借應收
          </div>
        </div>
      </div>

      {/* 工具列：精簡標題、重整純圖示、搜尋與狀態切換 */}
      <div className="web-admin-toolbar" style={{ marginTop: 4 }}>
        <div className="web-admin-toolbar-left">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              style={{ paddingLeft: 30, width: 220 }}
              placeholder="搜尋姓名、單號、末五碼..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="ALL">全部狀態 ({items.length})</option>
            <option value="PENDING">待確認 / 待繳費 ({stats.pendingCount})</option>
            <option value="CONFIRMED">已核銷 ({stats.confirmedCount})</option>
          </select>

          <select
            className="web-admin-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">全體款項類別</option>
            <option value="activity">活動費用</option>
            <option value="equipment">裝備租借</option>
            <option value="membership">社籍社費</option>
          </select>

          {/* 重新整理純圖示按鈕 */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadPayments}
            disabled={loading}
            title="重新整理財務款項清單"
            aria-label="重新整理財務款項清單"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* 欄位與列可見度面板按鈕 */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`web-admin-btn web-admin-btn-secondary ${hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'active' : ''}`}
              onClick={() => setShowHiddenMenu(!showHiddenMenu)}
              title="顯示與隱藏項目"
              style={{
                padding: '7px 10px',
                borderColor: hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'var(--wa-primary)' : undefined,
                color: hiddenColumns.length > 0 || hiddenRowIds.size > 0 ? 'var(--wa-primary)' : undefined,
              }}
            >
              <Eye size={15} />
            </button>

            {showHiddenMenu && (
              <div ref={hiddenMenuRef} className="wa-dropdown-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--wa-border)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>欄位與列可見度</span>
                  <button
                    type="button"
                    onClick={unhideAllColumnsAndRows}
                    style={{ background: 'none', border: 'none', color: 'var(--wa-primary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    全部顯示
                  </button>
                </div>

                {hiddenRowIds.size > 0 && (
                  <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 6, fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>已隱藏 {hiddenRowIds.size} 列</span>
                    <button
                      type="button"
                      onClick={() => unhideAllColumnsAndRows()}
                      style={{ background: 'none', border: 'none', color: 'var(--wa-primary)', cursor: 'pointer', fontSize: '0.78rem' }}
                    >
                      還原所有列
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                  {FINANCE_COLUMNS.map((col) => {
                    const isHidden = hiddenColumns.includes(col.key);
                    return (
                      <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          className="wa-checkbox"
                          checked={!isHidden}
                          onChange={() => {
                            if (isHidden) unhideColumn(col.key);
                            else hideColumn(col.key);
                          }}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 一鍵恢復預設欄寬按鈕 */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={resetColumnWidthsAndHeights}
            title="一鍵恢復預設欄寬與順序"
            style={{ padding: '7px 10px' }}
          >
            <ArrowLeftRight size={15} />
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="web-admin-btn"
              onClick={handleBatchVerify}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '0.82rem' }}
            >
              <Check size={14} />
              <span>批次核銷 ({selectedIds.size} 筆)</span>
            </button>
          )}

          <span className="web-admin-badge web-admin-badge-neutral">
            符合條件: {filteredItems.length} 筆
          </span>
        </div>
      </div>

      {/* 財務紀錄資料表格 */}
      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              <th
                style={{
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  textAlign: 'center',
                  position: 'sticky',
                  left: 0,
                  zIndex: 25,
                  backgroundColor: '#f8fafc',
                  borderRight: '1px solid var(--wa-border)',
                }}
              >
                <input
                  type="checkbox"
                  className="wa-checkbox"
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  checked={
                    filteredItems.length > 0 &&
                    selectedIds.size > 0 &&
                    filteredItems
                      .filter((p) => p.status.includes('待確認') || p.status.includes('Checking'))
                      .every((p) => selectedIds.has(p.id))
                  }
                />
              </th>
              <th
                style={{
                  width: 46,
                  minWidth: 46,
                  maxWidth: 46,
                  textAlign: 'center',
                  position: 'sticky',
                  left: 44,
                  zIndex: 25,
                  backgroundColor: '#f8fafc',
                  borderRight: '1px solid var(--wa-border)',
                }}
              >
                #
              </th>
              {visibleColumns.map((col) => {
                const isPinned = pinnedColumns.includes(col.key);
                const stickyLeft = isPinned ? stickyLeftPositions[col.key] : undefined;
                const width = columnWidths[col.key] || col.defaultWidth;

                return (
                  <th
                    key={col.key}
                    className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === col.key ? 'wa-col-pinned-last' : ''} ${
                      dragOverColKey === col.key ? 'wa-col-drag-over' : ''
                    }`}
                    style={{
                      width: `${width}px`,
                      minWidth: `${col.minWidth || 80}px`,
                      maxWidth: `${width}px`,
                      position: isPinned ? 'sticky' : undefined,
                      left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                      zIndex: isPinned ? 20 : undefined,
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedColKey && draggedColKey !== col.key) {
                        setDragOverColKey(col.key);
                      }
                    }}
                    onDragLeave={() => setDragOverColKey(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedColKey && draggedColKey !== col.key) {
                        reorderColumn(draggedColKey, col.key);
                      }
                      setDraggedColKey(null);
                      setDragOverColKey(null);
                    }}
                  >
                    <div className="wa-th-inner">
                      <span className="wa-th-label">{col.label}</span>

                      <div className="wa-th-actions-overlay">
                        <div
                          className="wa-col-drag-handle"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', col.key);
                            setDraggedColKey(col.key);
                          }}
                          title="按住拖拉調整欄位順序"
                        >
                          <GripVertical size={13} />
                        </div>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="向左移動欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveColumn(col.key, 'left');
                          }}
                        >
                          <ChevronLeft size={13} />
                        </button>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="向右移動欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveColumn(col.key, 'right');
                          }}
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          type="button"
                          className={`wa-th-btn ${isPinned ? 'active' : ''}`}
                          title={isPinned ? '取消釘選' : '釘選至最左側'}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinColumn(col.key);
                          }}
                        >
                          <Pin size={13} />
                        </button>
                        <button
                          type="button"
                          className="wa-th-btn"
                          title="隱藏此欄位"
                          onClick={(e) => {
                            e.stopPropagation();
                            hideColumn(col.key);
                          }}
                        >
                          <EyeOff size={13} />
                        </button>
                      </div>
                    </div>

                    <div
                      className="wa-col-resizer"
                      onMouseDown={(e) => startResizing(col.key, e)}
                      title="拖曳調整欄寬"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: '50px 0', color: 'var(--wa-text-muted)' }}>
                  {loading ? '財務款項載入中...' : '尚無符合條件之財務款項紀錄'}
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => {
                const isSelected = selectedIds.has(item.id);
                const isItemProcessing = processingId === item.id;
                const isRowPinned = pinnedRowIds.has(item.id);

                const isConfirmed =
                  item.status.includes('已核銷') ||
                  item.status.includes('Confirmed') ||
                  item.status.includes('已繳費') ||
                  item.status.includes('Paid');

                const isChecking =
                  item.status.includes('待確認') ||
                  item.status.includes('Checking');

                const isIdExpanded = expandedCells.has(`${item.id}:id`);
                const isTypeExpanded = expandedCells.has(`${item.id}:type`);
                const isNotesExpanded = expandedCells.has(`${item.id}:notes`);

                return (
                  <tr
                    key={item.id}
                    className={`${isSelected ? 'selected' : ''} ${isRowPinned ? 'wa-row-pinned' : ''} ${
                      dragOverRowId === item.id ? 'wa-row-drag-over' : ''
                    }`}
                    style={{ backgroundColor: isSelected ? 'rgba(5, 150, 105, 0.04)' : undefined }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedRowId && draggedRowId !== item.id) {
                        setDragOverRowId(item.id);
                      }
                    }}
                    onDragLeave={() => setDragOverRowId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropRow(item.id);
                    }}
                  >
                    {/* 勾選核取方塊 */}
                    <td
                      style={{
                        textAlign: 'center',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        backgroundColor: '#ffffff',
                        borderRight: '1px solid var(--wa-border)',
                      }}
                    >
                      {isChecking ? (
                        <input
                          type="checkbox"
                          className="wa-checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      ) : null}
                    </td>

                    {/* 序號儲存格與四角懸浮操作列 + 中央拖曳手柄 */}
                    <td
                      className="wa-row-index-cell"
                      style={{
                        position: 'sticky',
                        left: 44,
                        zIndex: 10,
                        backgroundColor: isRowPinned ? '#f0fdf4' : '#ffffff',
                        borderRight: '1px solid var(--wa-border)',
                      }}
                    >
                      <span className="wa-row-index-text">{idx + 1}</span>

                      <div className="wa-row-actions-quad">
                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-tl"
                          title="上移此列"
                          onClick={() => moveRow(item.id, 'up')}
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          className={`wa-row-quad-btn wa-row-quad-tr ${isRowPinned ? 'active' : ''}`}
                          title={isRowPinned ? '取消置頂' : '固定至最上方'}
                          onClick={() => togglePinRow(item.id)}
                        >
                          <Pin size={11} />
                        </button>

                        <div
                          className="wa-row-drag-handle"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', item.id);
                            setDraggedRowId(item.id);
                          }}
                          title="按住拖拉調整列順序"
                        >
                          <GripVertical size={13} />
                        </div>

                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-bl"
                          title="下移此列"
                          onClick={() => moveRow(item.id, 'down')}
                        >
                          <ArrowDown size={11} />
                        </button>
                        <button
                          type="button"
                          className="wa-row-quad-btn wa-row-quad-br"
                          title="隱藏此列"
                          onClick={() => hideRow(item.id)}
                        >
                          <EyeOff size={11} />
                        </button>
                      </div>
                    </td>

                    {/* 動態渲染可見欄位資料 */}
                    {visibleColumns.map((col) => {
                      const isPinned = pinnedColumns.includes(col.key);
                      const stickyLeft = isPinned ? stickyLeftPositions[col.key] : undefined;

                      switch (col.key) {
                        case 'id':
                          return (
                            <td
                              key={col.key}
                              className={`wa-clickable-cell ${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'id' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '0.8rem',
                                color: 'var(--wa-text-muted)',
                                maxWidth: 160,
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                              onClick={() => toggleCellExpand(`${item.id}:id`)}
                              title={isIdExpanded ? '點擊收合' : '點擊展開全文'}
                            >
                              <span className={isIdExpanded ? 'wa-cell-expanded' : 'wa-cell-ellipsis'}>
                                {item.id}
                              </span>
                            </td>
                          );

                        case 'applicant':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'applicant' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <button
                                type="button"
                                className="wa-name-capsule-btn"
                                onClick={() => handleOpenProfileModal(item)}
                                title="點擊查看完整個人資料"
                              >
                                <User size={13} />
                                <span>{item.name || '未知申請人'}</span>
                              </button>
                            </td>
                          );

                        case 'type':
                          return (
                            <td
                              key={col.key}
                              className={`wa-clickable-cell ${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'type' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                maxWidth: 220,
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                              onClick={() => toggleCellExpand(`${item.id}:type`)}
                              title={isTypeExpanded ? '點擊收合' : '點擊展開全文'}
                            >
                              <span className={isTypeExpanded ? 'wa-cell-expanded' : 'wa-cell-ellipsis'}>
                                {item.type || item.target_id || '-'}
                              </span>
                            </td>
                          );

                        case 'amount':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'amount' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                color: 'var(--wa-text)',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              ${item.amount}
                            </td>
                          );

                        case 'bank_last5':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'bank_last5' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.bank_last5 ? (
                                <span className="web-admin-badge web-admin-badge-neutral">{item.bank_last5}</span>
                              ) : (
                                <span style={{ color: 'var(--wa-text-muted)' }}>-</span>
                              )}
                            </td>
                          );

                        case 'status':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'status' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {getStatusBadge(item.status)}

                                {isChecking ? (
                                  <button
                                    type="button"
                                    className="web-admin-btn"
                                    style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                                    disabled={isItemProcessing}
                                    onClick={() => handleVerifyItem(item)}
                                    title="單鍵直接核銷此款項"
                                  >
                                    {isItemProcessing ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <>
                                        <Check size={12} />
                                        <span>核銷</span>
                                      </>
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );

                        case 'created_at':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'created_at' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontSize: '0.78rem',
                                color: 'var(--wa-text-muted)',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.created_at ? new Date(item.created_at).toLocaleString('zh-TW', { hour12: false }) : '-'}
                            </td>
                          );

                        case 'notes':
                          return (
                            <td
                              key={col.key}
                              className={`wa-clickable-cell ${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'notes' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                maxWidth: 200,
                                fontSize: '0.82rem',
                                color: 'var(--wa-text-muted)',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                              onClick={() => toggleCellExpand(`${item.id}:notes`)}
                              title={isNotesExpanded ? '點擊收合' : '點擊展開全文'}
                            >
                              <span className={isNotesExpanded ? 'wa-cell-expanded' : 'wa-cell-ellipsis'}>
                                {item.officer_notes || item.notes || '-'}
                              </span>
                            </td>
                          );

                        case 'actions':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'actions' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                textAlign: 'center',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {isConfirmed ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--wa-success)', fontSize: '0.78rem', fontWeight: 600 }}>
                                    <Check size={13} />
                                    <span>已核銷</span>
                                  </span>
                                ) : isChecking ? (
                                  <button
                                    type="button"
                                    className="web-admin-btn"
                                    style={{ padding: '3px 8px', fontSize: '0.76rem' }}
                                    disabled={isItemProcessing}
                                    onClick={() => handleVerifyItem(item)}
                                  >
                                    {isItemProcessing ? '處理中' : '確認核銷'}
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  className="web-admin-btn web-admin-btn-secondary"
                                  style={{ padding: '4px 6px', borderRadius: 4 }}
                                  title="編輯此筆財務款項詳情"
                                  aria-label="編輯此筆財務款項詳情"
                                  onClick={() => handleOpenDrawer(item)}
                                >
                                  <Pencil size={13} />
                                </button>
                              </div>
                            </td>
                          );

                        default:
                          return <td key={col.key}>-</td>;
                      }
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 手機風格社員詳細個人資料彈窗 (點擊姓名膠囊觸發，底部具前往個人資料編輯功能) */}
      <MemberProfileModal
        isOpen={Boolean(profileModalUserId)}
        mode="modal"
        onClose={() => {
          setProfileModalUserId(null);
          setProfileModalMember(null);
        }}
        userId={profileModalUserId}
        officerUserId={session.userId}
        initialMember={profileModalMember}
        onOpenEditDrawer={(uid) => {
          setProfileModalUserId(null);
          setProfileModalMember(null);
          setEditDrawerUserId(uid);
          setEditDrawerOpen(true);
        }}
        onNavigateToDetail={(uid) => {
          setProfileModalUserId(null);
          setProfileModalMember(null);
          navigate(`/admin-web/members?userId=${encodeURIComponent(uid)}`);
        }}
      />

      {/* 右側滑出式個人資料編輯抽屜 */}
      <MemberEditDrawer
        isOpen={editDrawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditDrawerUserId(null);
        }}
        userId={editDrawerUserId}
        officerUserId={session.userId}
        jwt={session.jwt}
        onSaved={(_updated) => {
          loadPayments();
          setSuccessMsg('社員資料已成功更新！');
          setTimeout(() => setSuccessMsg(null), 3000);
        }}
      />

      {/* 右側滑出式編輯視窗 (Floating Slide-Over Drawer) */}
      {drawerOpen && editingItem && (
        <div className="wa-drawer-backdrop" onClick={handleCloseDrawer}>
          <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-header">
              <div>
                <h2 className="wa-drawer-title">款項詳情與核銷編輯</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  單號: {editingItem.id}
                </div>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={handleCloseDrawer}
                disabled={isSavingDrawer}
                title="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wa-drawer-body" style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 基本資訊區塊 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">申請人與款項資訊</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.88rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--wa-text-muted)' }}>申請人：</span>
                    <button
                      type="button"
                      className="wa-name-capsule-btn"
                      onClick={() => handleOpenProfileModal(editingItem)}
                      title="點擊查看完整個人資料"
                    >
                      <User size={13} />
                      <span>{editingItem.name || '未知申請人'}</span>
                    </button>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>申報金額：</span>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--wa-text)' }}>
                      ${editingItem.amount}
                    </span>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--wa-text-muted)' }}>款項說明：</span>
                    <span style={{ fontWeight: 600 }}>{editingItem.type || editingItem.target_id || '-'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>帳號末五碼：</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {editingItem.bank_last5 || '未填寫'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>申報時間：</span>
                    <span>
                      {editingItem.created_at ? new Date(editingItem.created_at).toLocaleString('zh-TW', { hour12: false }) : '-'}
                    </span>
                  </div>
                  {editingItem.notes && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--wa-text-muted)' }}>申請人申報備註：</span>
                      <div style={{ backgroundColor: 'var(--wa-surface-alt)', padding: '6px 10px', borderRadius: 6, marginTop: 4, fontSize: '0.84rem' }}>
                        {editingItem.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 匯款收據/證明照片 */}
              {editingItem.proof_image_url && (
                <div className="wa-form-section">
                  <div className="wa-form-section-title">匯款單據 / 證明照</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <img
                      src={editingItem.proof_image_url}
                      alt="匯款證明"
                      style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--wa-border)', cursor: 'pointer' }}
                      onClick={() => setPreviewReceiptUrl(editingItem.proof_image_url || null)}
                    />
                    <button
                      type="button"
                      className="web-admin-btn web-admin-btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setPreviewReceiptUrl(editingItem.proof_image_url || null)}
                    >
                      <ImageIcon size={13} />
                      <span>放大預覽單據</span>
                    </button>
                    <button
                      type="button"
                      className="web-admin-btn web-admin-btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => openExternalUrl(editingItem.proof_image_url!)}
                    >
                      <ExternalLink size={13} />
                      <span>在新分頁開啟</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 核銷與備註編輯 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">幹部審核與狀態設定</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--wa-text-muted)', marginBottom: 4 }}>
                      核銷狀態
                    </label>
                    <select
                      className="web-admin-select"
                      style={{ width: '100%' }}
                      value={drawerStatus}
                      onChange={(e) => setDrawerStatus(e.target.value as any)}
                    >
                      <option value="待繳費 Unpaid">待繳費 Unpaid</option>
                      <option value="待確認 Checking">待確認 Checking</option>
                      <option value="已核銷 Confirmed">已核銷 Confirmed</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--wa-text-muted)', marginBottom: 4 }}>
                      LINE 通知狀態
                    </label>
                    <select
                      className="web-admin-select"
                      style={{ width: '100%' }}
                      value={drawerNotificationStatus}
                      onChange={(e) => setDrawerNotificationStatus(e.target.value as any)}
                    >
                      <option value="未通知">未通知</option>
                      <option value="已通知">已通知</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--wa-text-muted)', marginBottom: 4 }}>
                      幹部核銷內部備註
                    </label>
                    <textarea
                      className="web-admin-textarea"
                      rows={3}
                      style={{ width: '100%' }}
                      value={drawerNotes}
                      onChange={(e) => setDrawerNotes(e.target.value)}
                      placeholder="輸入幹部核銷與查對備註..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="wa-drawer-footer">
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={handleCloseDrawer}
                disabled={isSavingDrawer}
              >
                取消
              </button>
              <button
                type="button"
                className="web-admin-btn"
                onClick={handleSaveDrawer}
                disabled={isSavingDrawer}
              >
                {isSavingDrawer ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>儲存中...</span>
                  </>
                ) : (
                  <span>儲存變更</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 匯款收據證明圖片放大檢視彈窗 */}
      {previewReceiptUrl && (
        <div className="wa-modal-backdrop" onClick={() => setPreviewReceiptUrl(null)}>
          <div
            className="wa-modal-container"
            style={{ maxWidth: 700, padding: 16, background: '#ffffff', borderRadius: 12, textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>匯款收據/證明預覽</span>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => setPreviewReceiptUrl(null)}
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewReceiptUrl}
              alt="匯款單據"
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            />
          </div>
        </div>
      )}
    </>
  );
};

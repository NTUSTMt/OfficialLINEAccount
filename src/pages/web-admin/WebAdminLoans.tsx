import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
  Clock,
  DollarSign,
  PackageCheck,
  RotateCcw,
  User,
  ArrowRight,
  ImageIcon,
  ExternalLink
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import { fetchAllLoansFromSupabase, updateLoanStatusInSupabase } from '../../utils/supabaseClient';
import type { AdminLoanItem } from '../../types/admin';
import { MemberProfileModal } from '../../components/admin/MemberProfileModal';
import { MemberEditDrawer } from '../../components/admin/MemberEditDrawer';
import './webAdmin.css';

const LOAN_STATUS_OPTIONS: Array<AdminLoanItem['status']> = [
  '待領取 To Be Collected',
  '租借中 Borrowed',
  '已歸還 Returned',
  '已取消 Cancelled',
];

const toChineseStatus = (status?: string | null): string => {
  if (!status) return '';
  return status.split(' ')[0];
};

export const WebAdminLoans: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<AdminLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 搜尋與篩選
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payFilter, setPayFilter] = useState('ALL');

  // 卡片個資彈窗狀態 (手機風格彈窗)
  const [cardProfileUserId, setCardProfileUserId] = useState<string | null>(null);
  const [cardProfileMember, setCardProfileMember] = useState<any>(null);

  // 右側抽屜狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<AdminLoanItem | null>(null);
  const [editStatus, setEditStatus] = useState<AdminLoanItem['status']>('待領取 To Be Collected');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // 抽屜左側並排個資面板狀態 (共用 MemberProfileModal inline 模式)
  const [sideProfileUserId, setSideProfileUserId] = useState<string | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // 獨立社員個資編輯抽屜狀態
  const [editDrawerUserId, setEditDrawerUserId] = useState<string | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 1. 載入借用單清單
  const loadLoans = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 優先使用 Supabase Client 直讀 loans (選取安全關聯欄位與 items jsonb)
      const { data, error } = await client
        .from('loans')
        .select(`
          id,
          line_user_id,
          start_date,
          end_date,
          days,
          total_rent,
          total_deposit,
          status,
          payment_status,
          notes,
          created_at,
          items,
          members:line_user_id (
            name,
            phone,
            student_id,
            department,
            line_id
          )
        `)
        .order('start_date', { ascending: false });

      if (error) {
        // 回退調用 fetchAllLoansFromSupabase (使用已修復之 get_admin_loans_rpc)
        console.warn('[WebAdminLoans] 直查失敗，回退 RPC:', error.message);
        const fallbackData = await fetchAllLoansFromSupabase(session.userId);
        setLoans(fallbackData);
      } else {
        const mappedList: AdminLoanItem[] = (data || []).map((l: any) => ({
          id: l.id,
          line_user_id: l.line_user_id,
          name: l.members?.name || l.name || '未知申請人',
          phone: l.members?.phone || l.phone || '',
          student_id: l.members?.student_id || l.student_id || '',
          department: l.members?.department || l.department || '',
          line_id: l.members?.line_id || l.line_id || '',
          start_date: l.start_date,
          end_date: l.end_date,
          days: l.days || (l.start_date && l.end_date ? Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1) : 1),
          total_rent: l.total_rent || 0,
          total_deposit: l.total_deposit || 0,
          status: l.status || '待領取 To Be Collected',
          payment_status: l.payment_status || '待繳費',
          notes: l.notes || '',
          created_at: l.created_at,
          items: Array.isArray(l.items)
            ? l.items.map((item: any) => ({
              equipment_id: item.equipment_id || item.id,
              name: item.name || item.equipment_name || item.equipment_id || '裝備品項',
              quantity: item.quantity || 1,
              rent: item.rent || item.rent_fee || 0,
              deposit: item.deposit || item.deposit_fee || 0,
            }))
            : (l.loan_items || []).map((item: any) => ({
              equipment_id: item.equipment_id,
              name: item.equipment_name || item.equipment_id,
              quantity: item.quantity || 1,
              rent: item.rent_fee || 0,
              deposit: item.deposit_fee || 0,
            })),
        }));
        setLoans(mappedList);
      }
    } catch (err: any) {
      console.error('[WebAdminLoans] loadLoans error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLoans();
  }, [client]);

  // 2. 點擊卡片開啟右側側邊欄
  const handleOpenDrawer = (loan: AdminLoanItem) => {
    setSelectedLoan(loan);
    setEditStatus(loan.status);
    setEditNotes(loan.notes || '');
    setDrawerOpen(true);
    setSideProfileUserId(null);
    setPreviewPhotoUrl(null);
    setErrorMsg(null);
  };

  // 關閉右側抽屜
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSideProfileUserId(null);
    setPreviewPhotoUrl(null);
  };

  // 3. 儲存變更
  const handleSaveStatus = async (overrideStatus?: AdminLoanItem['status']) => {
    if (!selectedLoan) return;
    const targetStatus = overrideStatus || editStatus;

    setSaving(true);
    setErrorMsg(null);

    try {
      // 調用 updateLoanStatusInSupabase 以連動觸發庫存回補與狀態安全校驗
      const res = await updateLoanStatusInSupabase(
        selectedLoan.id,
        targetStatus,
        editNotes,
        session.userId
      );

      if (!res.success) {
        throw new Error(res.error || '更新租借狀態失敗');
      }

      await logWebAuditAction(
        client,
        session.userId,
        'UPDATE_LOAN_STATUS',
        'loans',
        selectedLoan.id,
        {
          borrowerName: selectedLoan.name,
          oldStatus: selectedLoan.status,
          newStatus: targetStatus,
          notes: editNotes,
        }
      );

      setSuccessMsg(`借用單 [${selectedLoan.id}] 狀態已更新為「${targetStatus}」！`);
      handleCloseDrawer();
      loadLoans();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('[WebAdminLoans] handleSaveStatus error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  // 4. 篩選借用單
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      const matchSearch =
        !searchQuery ||
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.student_id && l.student_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (l.phone && l.phone.includes(searchQuery)) ||
        (l.items && l.items.some((i) => (i.name || '').toLowerCase().includes(searchQuery.toLowerCase())));

      const matchStatus =
        statusFilter === 'ALL' || l.status.includes(statusFilter);

      const matchPay =
        payFilter === 'ALL' || l.payment_status.includes(payFilter);

      return matchSearch && matchStatus && matchPay;
    });
  }, [loans, searchQuery, statusFilter, payFilter]);

  const getStatusBadgeClass = (status: string) => {
    if (status.includes('已歸還')) return 'web-admin-badge-success';
    if (status.includes('租借中')) return 'web-admin-badge-info';
    if (status.includes('待領取')) return 'web-admin-badge-warning';
    return 'web-admin-badge-neutral';
  };

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
              placeholder="搜尋借用人、單號、裝備品項..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 32, width: 240 }}
            />
          </div>

          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">全部借還狀態</option>
            <option value="待領取">待領取 To Be Collected</option>
            <option value="租借中">租借中 Borrowed</option>
            <option value="已歸還">已歸還 Returned</option>
            <option value="已取消">已取消 Cancelled</option>
          </select>

          <select
            className="web-admin-select"
            value={payFilter}
            onChange={(e) => setPayFilter(e.target.value)}
          >
            <option value="ALL">全部繳費狀態</option>
            <option value="待繳費">待繳費</option>
            <option value="待確認">待確認</option>
            <option value="已核銷">已核銷</option>
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadLoans}
            title="重新整理借用清單"
            aria-label="重新整理借用清單"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-muted)' }}>
            共 <strong>{filteredLoans.length}</strong> 筆借用單
          </div>
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

      {/* 借用單卡片網格流 (Double Width Card Grid) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--wa-text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} style={{ marginBottom: 12 }} />
          <div>載入裝備借用單中...</div>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#ffffff', border: '1px solid var(--wa-border)', borderRadius: 10, color: 'var(--wa-text-muted)' }}>
          尚無符合條件的裝備租借申請
        </div>
      ) : (
        <div className="wa-card-grid-loans">
          {filteredLoans.map((loan) => (
            <div
              key={loan.id}
              className="wa-card"
              style={{ textAlign: 'left' }}
              onClick={() => handleOpenDrawer(loan)}
            >
              {/* 頂部：靠左姓名，靠右純中文借還狀態與繳費狀態 */}
              <div className="wa-card-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3 className="wa-card-title">{loan.name}</h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={`web-admin-badge ${getStatusBadgeClass(loan.status)}`}>
                    {toChineseStatus(loan.status)}
                  </span>
                  <span className={`web-admin-badge ${loan.payment_status.includes('已') ? 'web-admin-badge-success' : 'web-admin-badge-warning'}`}>
                    {toChineseStatus(loan.payment_status)}
                  </span>
                </div>
              </div>

              {/* 單號：不加「單號」前綴，直接標示號碼 */}
              <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', textAlign: 'left' }}>
                {loan.id}
              </div>

              {/* 借用裝備：一一條列 */}
              <div className="wa-loan-items-row">
                {(loan.items || []).map((item, idx) => (
                  <span key={idx} className="wa-loan-item-pill">
                    {item.name} <strong>x{item.quantity}</strong>
                  </span>
                ))}
              </div>

              {/* 期間與租金（無押金） */}
              <div className="wa-card-meta">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                  <Clock size={13} color="var(--wa-text-muted)" />
                  <span>
                    期間：{loan.start_date} ~ {loan.end_date} (共 {loan.days} 天)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                  <DollarSign size={13} color="var(--wa-text-muted)" />
                  <span>
                    租金：${loan.total_rent} 元
                  </span>
                </div>
              </div>

              {/* 底部固定列：靠左查看個人資料按鈕，靠右查看詳細與操作按鈕 */}
              <div
                className="wa-card-footer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--wa-border)',
                  paddingTop: 12,
                  marginTop: 4,
                }}
              >
                <button
                  type="button"
                  className="web-admin-btn web-admin-btn-secondary"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCardProfileUserId(loan.line_user_id);
                    setCardProfileMember({
                      line_user_id: loan.line_user_id,
                      name: loan.name,
                      phone: loan.phone,
                      student_id: loan.student_id,
                      department: loan.department,
                      line_id: loan.line_id,
                    });
                  }}
                >
                  <User size={13} />
                  <span>查看個人資料</span>
                </button>

                <button
                  type="button"
                  className="web-admin-btn"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenDrawer(loan);
                  }}
                >
                  <span>查看詳細與操作</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右側滑出懸浮圓角側邊抽屜：借用單詳情與操作 */}
      {drawerOpen && selectedLoan && (
        <div className="wa-drawer-backdrop" onClick={handleCloseDrawer}>
          {/* 若點擊體能證明照片，於左側最外層展開大圖預覽 (螢幕 < 1500px 時由 CSS 浮動置中覆蓋) */}
          {previewPhotoUrl && (
            <div className="wa-drawer-side-preview" onClick={(e) => e.stopPropagation()}>
              <div className="wa-drawer-side-preview-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ImageIcon size={16} color="var(--wa-primary)" />
                  <span>體能證明照片預覽</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <a
                    href={previewPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--wa-text-muted)', display: 'flex', alignItems: 'center' }}
                    title="另開新視窗查看原圖"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <button
                    type="button"
                    className="wa-drawer-close-btn"
                    onClick={() => setPreviewPhotoUrl(null)}
                    title="關閉預覽"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="wa-drawer-side-preview-body">
                <img
                  src={previewPhotoUrl}
                  alt="體能證明大圖預覽"
                  className="wa-drawer-side-preview-img"
                />
              </div>
            </div>
          )}

          {/* 左側同級展開之借用人個人資料面板 (並排對照，共用 MemberProfileModal inline 模式) */}
          {sideProfileUserId && (
            <MemberProfileModal
              isOpen={Boolean(sideProfileUserId)}
              mode="inline"
              onClose={() => {
                setSideProfileUserId(null);
                setPreviewPhotoUrl(null);
              }}
              userId={sideProfileUserId}
              officerUserId={session.userId}
              initialMember={
                selectedLoan && selectedLoan.line_user_id === sideProfileUserId
                  ? {
                    line_user_id: selectedLoan.line_user_id,
                    name: selectedLoan.name,
                    phone: selectedLoan.phone,
                    student_id: selectedLoan.student_id,
                    department: selectedLoan.department,
                    line_id: selectedLoan.line_id,
                  }
                  : undefined
              }
              onNavigateToDetail={(uid) => {
                handleCloseDrawer();
                navigate(`/admin-web/members?userId=${encodeURIComponent(uid)}`);
              }}
              onOpenEditDrawer={(uid) => {
                setSideProfileUserId(null);
                setEditDrawerUserId(uid);
                setEditDrawerOpen(true);
              }}
              onPreviewPhoto={(url) => {
                setPreviewPhotoUrl(url);
              }}
            />
          )}

          {/* 主抽屜面板 */}
          <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-header">
              <div>
                <h2 className="wa-drawer-title">裝備借用單詳情</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2, textAlign: 'left' }}>
                  {selectedLoan.id}
                </div>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={handleCloseDrawer}
                title="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wa-drawer-body" style={{ textAlign: 'left' }}>
              {/* 申請人資訊區塊 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">申請人資訊</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.88rem', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--wa-text-muted)' }}>借用人姓名：</span>
                    <button
                      type="button"
                      className="wa-name-capsule-btn"
                      onClick={() => {
                        if (sideProfileUserId === selectedLoan.line_user_id) {
                          setSideProfileUserId(null);
                        } else {
                          setSideProfileUserId(selectedLoan.line_user_id);
                        }
                      }}
                      title="點擊於左側展開個人資料"
                    >
                      <User size={13} />
                      <span>{selectedLoan.name}</span>
                    </button>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>聯絡電話：</span>
                    <span>{selectedLoan.phone || '-'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>系所 / 學號：</span>
                    <span>{`${selectedLoan.department || ''} ${selectedLoan.student_id || ''}`.trim() || '-'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>LINE ID：</span>
                    <span>{selectedLoan.line_id || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 借用時程與費用 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">借用時程與帳務</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.88rem', textAlign: 'left' }}>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>預計領取日：</span>
                    <strong>{selectedLoan.start_date}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>預計歸還日：</span>
                    <strong>{selectedLoan.end_date}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>借用總天數：</span>
                    <span>{selectedLoan.days} 天</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>繳費狀態：</span>
                    <span className={`web-admin-badge ${selectedLoan.payment_status.includes('已') ? 'web-admin-badge-success' : 'web-admin-badge-warning'}`}>
                      {selectedLoan.payment_status}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>應付租金：</span>
                    <strong style={{ color: 'var(--wa-primary)' }}>${selectedLoan.total_rent} 元</strong>
                  </div>
                </div>
              </div>

              {/* 借用裝備詳細清單 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">借用裝備清單 ({selectedLoan.items?.length || 0} 項)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--wa-border)', color: 'var(--wa-text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0' }}>品項名稱</th>
                      <th style={{ textAlign: 'center', padding: '6px 0' }}>數量</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>單項租金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedLoan.items || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--wa-border)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'center', padding: '8px 0' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0' }}>${item.rent || 0} 元</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 狀態切換與操作 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">狀態管理與幹部備註</div>

                <div className="wa-form-group">
                  <label className="wa-form-label">借還處理狀態</label>
                  <select
                    className="wa-form-select"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as AdminLoanItem['status'])}
                  >
                    {LOAN_STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 快捷操作按鈕 */}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    className="web-admin-btn web-admin-btn-secondary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => handleSaveStatus('租借中 Borrowed')}
                    disabled={saving || editStatus === '租借中 Borrowed'}
                  >
                    <PackageCheck size={14} color="var(--wa-info)" />
                    <span>一鍵點交出借</span>
                  </button>

                  <button
                    type="button"
                    className="web-admin-btn web-admin-btn-secondary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => handleSaveStatus('已歸還 Returned')}
                    disabled={saving || editStatus === '已歸還 Returned'}
                  >
                    <RotateCcw size={14} color="var(--wa-primary)" />
                    <span>歸還入庫 (自動補庫存)</span>
                  </button>
                </div>

                <div className="wa-form-group" style={{ marginTop: 8 }}>
                  <label className="wa-form-label">幹部審核備註</label>
                  <textarea
                    className="wa-form-textarea"
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="例如：裝備有點交檢查無破損、準時歸還..."
                  />
                </div>
              </div>
            </div>

            <div className="wa-drawer-footer">
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={handleCloseDrawer}
              >
                取消
              </button>

              <button
                type="button"
                className="web-admin-btn"
                onClick={() => handleSaveStatus()}
                disabled={saving}
              >
                <Save size={15} />
                <span>{saving ? '儲存中...' : '儲存狀態與備註'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 卡片點擊跳出的手機風格社員詳細資料彈窗 */}
      <MemberProfileModal
        isOpen={Boolean(cardProfileUserId)}
        mode="modal"
        onClose={() => {
          setCardProfileUserId(null);
          setCardProfileMember(null);
          setPreviewPhotoUrl(null);
        }}
        userId={cardProfileUserId}
        officerUserId={session.userId}
        initialMember={cardProfileMember}
        onNavigateToDetail={(uid) => {
          setCardProfileUserId(null);
          setCardProfileMember(null);
          navigate(`/admin-web/members?userId=${encodeURIComponent(uid)}`);
        }}
        onOpenEditDrawer={(uid) => {
          setCardProfileUserId(null);
          setCardProfileMember(null);
          setEditDrawerUserId(uid);
          setEditDrawerOpen(true);
        }}
        onPreviewPhoto={(url) => {
          setPreviewPhotoUrl(url);
        }}
      />

      {/* 右側滑出式個人資料編輯抽屜 (若底層有借用抽屜，疊加覆蓋於最上層) */}
      <MemberEditDrawer
        isOpen={editDrawerOpen}
        isStacked={drawerOpen}
        onClose={() => {
          setEditDrawerOpen(false);
          setEditDrawerUserId(null);
        }}
        userId={editDrawerUserId}
        officerUserId={session.userId}
        jwt={session.jwt}
        onSaved={(updated) => {
          loadLoans();
          if (selectedLoan && updated && selectedLoan.line_user_id === updated.line_user_id) {
            setSelectedLoan((prev) => prev ? {
              ...prev,
              name: updated.name || prev.name,
              phone: updated.phone || prev.phone,
              student_id: updated.student_id || prev.student_id,
              department: updated.department || prev.department,
              line_id: updated.line_id || prev.line_id,
            } : null);
          }
        }}
      />

      {/* 若在卡片模式下預覽體能證明照片，顯示浮動大圖預覽彈窗 */}
      {!drawerOpen && previewPhotoUrl && (
        <div className="wa-modal-backdrop" onClick={() => setPreviewPhotoUrl(null)}>
          <div
            className="wa-modal-container"
            style={{ maxWidth: 800, padding: 16, background: '#ffffff', borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <ImageIcon size={16} color="var(--wa-primary)" />
                <span>體能證明照片預覽</span>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => setPreviewPhotoUrl(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <img
                src={previewPhotoUrl}
                alt="體能證明大圖預覽"
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

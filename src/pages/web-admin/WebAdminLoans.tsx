import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Layers,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
  Clock,
  DollarSign,
  PackageCheck,
  RotateCcw
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import { fetchAllLoansFromSupabase, updateLoanStatusInSupabase } from '../../utils/supabaseClient';
import type { AdminLoanItem } from '../../types/admin';
import './webAdmin.css';

const LOAN_STATUS_OPTIONS: Array<AdminLoanItem['status']> = [
  '待領取 To Be Collected',
  '租借中 Borrowed',
  '已歸還 Returned',
  '已取消 Cancelled',
];

export const WebAdminLoans: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [loans, setLoans] = useState<AdminLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 搜尋與篩選
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payFilter, setPayFilter] = useState('ALL');

  // 右側側邊欄狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<AdminLoanItem | null>(null);
  const [editStatus, setEditStatus] = useState<AdminLoanItem['status']>('待領取 To Be Collected');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 1. 載入借用單清單
  const loadLoans = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 優先使用 Supabase Client 直讀 loans
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
          members:line_user_id (
            name,
            phone,
            student_id,
            department,
            line_id
          ),
          loan_items (
            id,
            equipment_id,
            equipment_name,
            quantity,
            rent_fee,
            deposit_fee
          )
        `)
        .order('start_date', { ascending: false });

      if (error) {
        // 回退調用 fetchAllLoansFromSupabase
        console.warn('[WebAdminLoans] 直查失敗，回退 RPC:', error.message);
        const fallbackData = await fetchAllLoansFromSupabase(session.userId);
        setLoans(fallbackData);
      } else {
        const mappedList: AdminLoanItem[] = (data || []).map((l: any) => ({
          id: l.id,
          line_user_id: l.line_user_id,
          name: l.members?.name || '未知申請人',
          phone: l.members?.phone || '',
          student_id: l.members?.student_id || '',
          department: l.members?.department || '',
          line_id: l.members?.line_id || '',
          start_date: l.start_date,
          end_date: l.end_date,
          days: l.days || (l.start_date && l.end_date ? Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1) : 1),
          total_rent: l.total_rent || 0,
          total_deposit: l.total_deposit || 0,
          status: l.status || '待領取 To Be Collected',
          payment_status: l.payment_status || '待繳費',
          notes: l.notes || '',
          created_at: l.created_at,
          items: (l.loan_items || []).map((item: any) => ({
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
    setErrorMsg(null);
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
      setDrawerOpen(false);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1.02rem' }}>
            <Layers size={18} color="var(--wa-primary)" />
            <span>裝備借用管理</span>
          </div>

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
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>重整</span>
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

      {/* 借用單卡片網格流 (Card Grid) */}
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
        <div className="wa-card-grid">
          {filteredLoans.map((loan) => (
            <div
              key={loan.id}
              className="wa-card"
              onClick={() => handleOpenDrawer(loan)}
            >
              <div className="wa-card-header">
                <div>
                  <h3 className="wa-card-title">{loan.name}</h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                    {loan.id}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={`web-admin-badge ${getStatusBadgeClass(loan.status)}`}>
                    {loan.status}
                  </span>
                  <span className={`web-admin-badge ${loan.payment_status.includes('已') ? 'web-admin-badge-success' : 'web-admin-badge-warning'}`}>
                    {loan.payment_status}
                  </span>
                </div>
              </div>

              {/* 借用品項清單標籤 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(loan.items || []).map((item, idx) => (
                  <span
                    key={idx}
                    style={{
                      backgroundColor: 'var(--wa-surface-alt)',
                      border: '1px solid var(--wa-border)',
                      fontSize: '0.78rem',
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: 'var(--wa-text)',
                    }}
                  >
                    {item.name} <strong>x{item.quantity}</strong>
                  </span>
                ))}
              </div>

              <div className="wa-card-meta">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} color="var(--wa-text-muted)" />
                  <span>
                    期間：{loan.start_date} ~ {loan.end_date} (共 {loan.days} 天)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarSign size={13} color="var(--wa-text-muted)" />
                  <span>
                    租金：${loan.total_rent} / 押金：${loan.total_deposit}
                  </span>
                </div>
              </div>

              <div className="wa-card-footer">
                <span>{loan.department || loan.student_id ? `${loan.department || ''} ${loan.student_id || ''}`.trim() : '校外人士 / 社友'}</span>
                <span style={{ color: 'var(--wa-primary)', fontWeight: 600 }}>查看詳細與操作 &rarr;</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 右側滑出側邊欄：借用單詳情與點交歸還操作 */}
      {drawerOpen && selectedLoan && (
        <div className="wa-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-header">
              <div>
                <h2 className="wa-drawer-title">裝備借用單詳情</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  {selectedLoan.id}
                </div>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => setDrawerOpen(false)}
                title="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wa-drawer-body">
              {/* 申請人資訊區塊 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">申請人資訊</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.88rem' }}>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>借用人姓名：</span>
                    <strong>{selectedLoan.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>聯絡電話：</span>
                    <span>{selectedLoan.phone || '-'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>學號 / 系所：</span>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.88rem' }}>
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
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>應付押金：</span>
                    <strong>${selectedLoan.total_deposit} 元</strong>
                  </div>
                </div>
              </div>

              {/* 借用裝備詳細清單 */}
              <div className="wa-form-section">
                <div className="wa-form-section-title">借用裝備清單 ({selectedLoan.items?.length || 0} 項)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--wa-border)', color: 'var(--wa-text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 0' }}>品項名稱</th>
                      <th style={{ textAlign: 'center', padding: '6px 0' }}>數量</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>單項租金</th>
                      <th style={{ textAlign: 'right', padding: '6px 0' }}>單項押金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedLoan.items || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--wa-border)' }}>
                        <td style={{ padding: '8px 0', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'center', padding: '8px 0' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0' }}>${item.rent || 0}</td>
                        <td style={{ textAlign: 'right', padding: '8px 0' }}>${item.deposit || 0}</td>
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
                    placeholder="例如：裝備有點交檢查無破損、已退還押金..."
                  />
                </div>
              </div>
            </div>

            <div className="wa-drawer-footer">
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={() => setDrawerOpen(false)}
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
    </div>
  );
};

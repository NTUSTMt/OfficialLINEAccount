import { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  User,
  X
} from 'lucide-react';
import {
  fetchAllLoansFromSupabase,
  updateLoanStatusInSupabase
} from '../utils/supabaseClient';
import type { AdminLoanItem } from '../types/admin';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { MemberProfileModal } from '../components/admin/MemberProfileModal';
import { GAS_API_URL } from '../constants/api';

const SORT_OPTIONS: SortOption[] = [
  { key: 'start_date', label: '依預計領取出隊日' },
  { key: 'end_date', label: '依預計歸還日' },
  { key: 'created_at', label: '依申請建立時間' },
  { key: 'name', label: '依借用人姓名' }
];

export default function AdminLoans({ userId }: { userId?: string }) {
  const [loans, setLoans] = useState<AdminLoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMemberUserId, setPreviewMemberUserId] = useState<string | null>(null);
  const [previewMemberData, setPreviewMemberData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 搜尋、篩選與排序
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [sortBy, setSortBy] = useState('start_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 詳細對話框狀態
  const [selectedLoan, setSelectedLoan] = useState<AdminLoanItem | null>(null);
  const [editStatus, setEditStatus] = useState<AdminLoanItem['status']>('待領取 To Be Collected');
  const [editNotes, setEditNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const loadData = async (isManual = true) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAllLoansFromSupabase(userId);
      setLoans(data);
      if (isManual) {
        setSuccessMessage('已同步最新資料！');
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [userId]);

  const handleOpenDetail = (l: AdminLoanItem) => {
    setSelectedLoan(l);
    setEditStatus(l.status);
    setEditNotes(l.notes || '');
    setSuccessMessage(null);
  };

  const handleSaveStatus = async () => {
    if (!selectedLoan) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await updateLoanStatusInSupabase(selectedLoan.id, editStatus, editNotes, userId);
      if (!res.success) {
        setErrorMessage(res.error || '更新租借狀態失敗');
        setIsSaving(false);
        return;
      }

      // 非同步推播 LINE 租借狀態通知給借用人
      if (selectedLoan.line_user_id) {
        try {
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'notify_loan_status_updated',
              loanId: selectedLoan.id,
              userId: selectedLoan.line_user_id,
              borrowerName: selectedLoan.name,
              newStatus: editStatus,
              pickupDate: selectedLoan.start_date,
              returnDate: selectedLoan.end_date,
              itemsSummary: selectedLoan.items
            })
          }).catch(e => console.warn('[AdminLoans] 推播例外:', e));
        } catch (e) {
          console.warn('[AdminLoans] 推播呼叫異常:', e);
        }
      }

      setSuccessMessage(`租借單 ${selectedLoan.id} 狀態已成功更新為【${editStatus}】並發送推播通知！`);
      setSelectedLoan(null);
      await loadData();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // 篩選群組
  const filters: FilterGroup[] = useMemo(() => [
    {
      key: 'status',
      label: '租借狀態',
      selected: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: '全部租借狀態' },
        { value: '待領取 To Be Collected', label: '待領取 To Be Collected' },
        { value: '租借中 Borrowed', label: '租借中 Borrowed' },
        { value: '已歸還 Returned', label: '已歸還 Returned' },
        { value: '已取消 Cancelled', label: '已取消 Cancelled' }
      ]
    },
    {
      key: 'payment',
      label: '租金繳納狀態',
      selected: payFilter,
      onChange: setPayFilter,
      options: [
        { value: 'all', label: '全部繳費狀態' },
        { value: '未繳費 Unpaid', label: '未繳費 Unpaid' },
        { value: '待確認 Checking', label: '待確認 Checking' },
        { value: '已繳費 Paid', label: '已繳費 Paid' }
      ]
    }
  ], [statusFilter, payFilter]);

  // 過濾與排序
  const filteredLoans = useMemo(() => {
    let list = [...loans];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(l => {
        const n = (l.name || '').toLowerCase();
        const id = (l.id || '').toLowerCase();
        const luid = (l.line_user_id || '').toLowerCase();
        const p = (l.purpose || '').toLowerCase();
        return n.includes(q) || id.includes(q) || luid.includes(q) || p.includes(q);
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter(l => l.status === statusFilter);
    }

    if (payFilter !== 'all') {
      list = list.filter(l => l.payment_status === payFilter);
    }

    list.sort((a, b) => {
      let valA: any = a[sortBy as keyof AdminLoanItem] || '';
      let valB: any = b[sortBy as keyof AdminLoanItem] || '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [loans, searchQuery, statusFilter, payFilter, sortBy, sortOrder]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      paddingBottom: '40px',
      textAlign: 'left'
    }}>
      <AdminSubNav />

      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '16px 14px'
      }}>
        {/* 錯誤與成功訊息 */}
        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '13px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600 }}>操作失敗</div>
              <div style={{ marginTop: '2px', wordBreak: 'break-all' }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '13px',
            fontWeight: 500
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Notion 搜尋、篩選、排序與重新整理列 */}
        <NotionFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜尋借用人、單號、租借用途..."
          filters={filters}
          sortOptions={SORT_OPTIONS}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(k, o) => {
            setSortBy(k);
            setSortOrder(o);
          }}
          onRefresh={loadData}
          isRefreshing={loading}
        />

        {/* 卡片清單 (依名字列出裝備借用與繳費狀態) */}
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            color: '#64748b',
            fontSize: '14px'
          }}>
            <div className="loading-spinner" style={{ marginBottom: '12px' }} />
            <span>讀取租借紀錄中...</span>
          </div>
        ) : filteredLoans.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            fontSize: '14px'
          }}>
            目前無符合條件的租借訂單
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredLoans.map((l) => {
              // 租借狀態樣式
              const isBorrowed = l.status === '租借中 Borrowed';
              const isReturned = l.status === '已歸還 Returned';
              const isCancelled = l.status === '已取消 Cancelled';

              const statusColor = isReturned ? '#059669' : isBorrowed ? '#2563eb' : isCancelled ? '#64748b' : '#d97706';
              const statusBg = isReturned ? '#ecfdf5' : isBorrowed ? '#eff6ff' : isCancelled ? '#f1f5f9' : '#fffbeb';

              // 裝備品項簡述
              let itemsDesc = '裝備租借';
              if (Array.isArray(l.items) && l.items.length > 0) {
                itemsDesc = l.items.map(it => `${it.name || it.equipment_id || '裝備'} x ${it.quantity || 1}`).join('、');
              }

              return (
                <div
                  key={l.id}
                  onClick={() => handleOpenDetail(l)}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 第一行：姓名、租借狀態標籤、繳費狀態標籤 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {l.name || '借用人'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: statusBg,
                        color: statusColor,
                        fontWeight: 600
                      }}>
                        {l.status}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: l.payment_status === '已繳費 Paid' ? '#ecfdf5' : '#fef2f2',
                        color: l.payment_status === '已繳費 Paid' ? '#059669' : '#b91c1c',
                        fontWeight: 600
                      }}>
                        {l.payment_status}
                      </span>
                    </div>

                    {/* 第二行：裝備品項內容 */}
                    <div style={{ fontSize: '13px', color: '#334155', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {itemsDesc}
                    </div>

                    {/* 第三行：出隊日期與金額 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                      <span>出隊: {l.start_date} ~ {l.end_date} ({l.days || (l.start_date && l.end_date ? Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1) : 1)} 天)</span>
                      <span style={{ fontWeight: 700, color: '#059669' }}>${l.total_fee || l.total_rent || 0} 元</span>
                    </div>
                  </div>

                  <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: '8px' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 詳細租借資訊與狀態編輯彈窗 */}
      {selectedLoan && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '20px',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            textAlign: 'left'
          }}>
            {/* 標題與關閉 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                  裝備租借單明細
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  單號: {selectedLoan.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedLoan(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 詳細內容 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              {/* 借用人與開啟個人資料 */}
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>借用人姓名</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{selectedLoan.name}</div>
                </div>
                {selectedLoan.line_user_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const uid = selectedLoan.line_user_id;
                      if (!uid) return;
                      setPreviewMemberUserId(uid);
                      setPreviewMemberData({ name: selectedLoan.name, line_user_id: uid });
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#2563eb',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <User size={13} />
                    <span>開啟個人資料</span>
                  </button>
                )}
              </div>

              {/* 天數與用途 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>天數與日期起訖</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {selectedLoan.days || (selectedLoan.start_date && selectedLoan.end_date ? Math.max(1, Math.round((new Date(selectedLoan.end_date).getTime() - new Date(selectedLoan.start_date).getTime()) / 86400000) + 1) : 1)} 天 ({selectedLoan.start_date} ~ {selectedLoan.end_date})
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>租借用途</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {selectedLoan.purpose || '社團出隊'}
                  </div>
                </div>
              </div>

              {/* 租用裝備品項清單 */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>借用裝備清單品項</div>
                {Array.isArray(selectedLoan.items) && selectedLoan.items.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {selectedLoan.items.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#1e293b' }}>
                        <span>{it.name || it.equipment_id || '裝備'}</span>
                        <span style={{ fontWeight: 600 }}>x {it.quantity || 1}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>無品項細項</div>
                )}
              </div>

              {/* 費用與目前繳費狀態 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>總租金費用</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>
                    ${selectedLoan.total_fee || selectedLoan.total_rent || 0} 元
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>繳費狀態</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: selectedLoan.payment_status === '已繳費 Paid' ? '#059669' : '#b91c1c' }}>
                    {selectedLoan.payment_status}
                  </div>
                </div>
              </div>

              {/* 編輯租借狀態 (下拉選單，嚴格對齊合法值) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  修改租借狀態
                </label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: '#ffffff',
                    fontWeight: 600,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="待領取 To Be Collected">待領取 To Be Collected</option>
                  <option value="租借中 Borrowed">租借中 Borrowed</option>
                  <option value="已歸還 Returned">已歸還 Returned</option>
                  <option value="已取消 Cancelled">已取消 Cancelled</option>
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  按下儲存後，將直接更新資料庫並同步發送 LINE 訊息通知借用人該筆裝備租借狀態。
                </div>
              </div>

              {/* 訂單備註 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  訂單備註
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="輸入裝備取用或檢查備註..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* 按鈕組 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedLoan(null)}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveStatus}
                disabled={isSaving}
                style={{
                  flex: 2,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {isSaving ? '儲存並通知中...' : '確認儲存狀態'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 借用人個人資料彈窗 (底部提供移至社員詳細資料編輯頁面按鈕) */}
      <MemberProfileModal
        isOpen={Boolean(previewMemberUserId)}
        onClose={() => {
          setPreviewMemberUserId(null);
          setPreviewMemberData(null);
        }}
        userId={previewMemberUserId}
        officerUserId={userId}
        initialMember={previewMemberData}
      />
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  User,
  X,
  Image as ImageIcon
} from 'lucide-react';
import {
  fetchFinanceItemsFromSupabase,
  updatePaymentAndLinkedStatusInSupabase
} from '../utils/supabaseClient';
import type { AdminFinanceItem } from '../types/admin';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { MemberProfileModal } from '../components/admin/MemberProfileModal';
import { GAS_API_URL } from '../constants/api';

const SORT_OPTIONS: SortOption[] = [
  { key: 'created_at', label: '依申報時間' },
  { key: 'amount', label: '依申報金額' },
  { key: 'name', label: '依申報人姓名' }
];

export default function AdminFinance({ userId }: { userId?: string }) {
  const [items, setItems] = useState<AdminFinanceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMemberUserId, setPreviewMemberUserId] = useState<string | null>(null);
  const [previewMemberData, setPreviewMemberData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 搜尋、篩選與排序
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 詳細對帳彈窗
  const [selectedItem, setSelectedItem] = useState<AdminFinanceItem | null>(null);
  const [editStatus, setEditStatus] = useState<'待繳費 Unpaid' | '待確認 Checking' | '已核銷 Confirmed'>('待確認 Checking');
  const [editNotificationStatus, setEditNotificationStatus] = useState<'未通知' | '已通知'>('未通知');
  const [officerNotes, setOfficerNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // 圖片放大檢視
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const loadData = async (isManual = true) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchFinanceItemsFromSupabase(userId);
      setItems(data);
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

  const handleOpenDetail = (it: AdminFinanceItem) => {
    setSelectedItem(it);
    setEditStatus(it.status);
    setEditNotificationStatus((it.notification_status as any) === '已通知' ? '已通知' : '未通知');
    setOfficerNotes(it.officer_notes || '');
    setSuccessMessage(null);
  };

  const handleSaveStatus = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 判定是否需發送 LINE 推播：僅當改為「已核銷 Confirmed」且通知狀態為「未通知」時發送
      const shouldNotify = editStatus === '已核銷 Confirmed' && editNotificationStatus === '未通知' && Boolean(selectedItem.line_user_id);
      let finalNotificationStatus = editNotificationStatus;

      if (shouldNotify) {
        try {
          fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'notify_payment_confirmed',
              paymentId: selectedItem.id,
              userName: selectedItem.name,
              amount: selectedItem.amount,
              items: selectedItem.type,
              lineUserId: selectedItem.line_user_id,
              confirmedBy: '財務幹部線上審核'
            })
          }).catch(e => console.warn('[AdminFinance] 推播通知例外:', e));

          // 成功觸發推播後，自動將通知狀態設為已通知
          finalNotificationStatus = '已通知';
        } catch (e) {
          console.warn('[AdminFinance] 推播呼叫異常:', e);
        }
      }

      const res = await updatePaymentAndLinkedStatusInSupabase({
        paymentId: selectedItem.id,
        sourceType: selectedItem.sourceType,
        targetType: selectedItem.target_type,
        targetId: selectedItem.target_id,
        newStatus: editStatus,
        officerName: '財務幹部線上核銷',
        lineUserId: selectedItem.line_user_id,
        notes: officerNotes,
        officerUserId: userId,
        paymentType: selectedItem.type,
        notificationStatus: finalNotificationStatus
      });

      if (!res.success) {
        setErrorMessage(res.error || '狀態更新失敗');
        setIsSaving(false);
        return;
      }

      setSuccessMessage(`單號 ${selectedItem.id} 繳費狀態已成功更新為【${editStatus}】（通知狀態：${finalNotificationStatus}）！`);
      setSelectedItem(null);
      await loadData();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // 篩選定義
  const filters: FilterGroup[] = useMemo(() => [
    {
      key: 'status',
      label: '核銷審核狀態',
      selected: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: '全部狀態' },
        { value: '待繳費 Unpaid', label: '待繳費 Unpaid' },
        { value: '待確認 Checking', label: '待確認 Checking' },
        { value: '已核銷 Confirmed', label: '已核銷 Confirmed' }
      ]
    },
    {
      key: 'category',
      label: '款項類別',
      selected: categoryFilter,
      onChange: setCategoryFilter,
      options: [
        { value: 'all', label: '全部類別' },
        { value: 'activity', label: '活動款項' },
        { value: 'equipment', label: '裝備租借' },
        { value: 'membership', label: '社費繳納' }
      ]
    }
  ], [statusFilter, categoryFilter]);

  // 過濾與排序
  const filteredItems = useMemo(() => {
    let list = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(it => {
        const n = (it.name || '').toLowerCase();
        const t = (it.type || '').toLowerCase();
        const b = (it.bank_last5 || '').toLowerCase();
        const id = (it.id || '').toLowerCase();
        const luid = (it.line_user_id || '').toLowerCase();
        return n.includes(q) || t.includes(q) || b.includes(q) || id.includes(q) || luid.includes(q);
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter(it => it.status === statusFilter);
    }

    if (categoryFilter !== 'all') {
      list = list.filter(it => it.itemCategory === categoryFilter);
    }

    list.sort((a, b) => {
      let valA: any = a[sortBy as keyof AdminFinanceItem] || '';
      let valB: any = b[sortBy as keyof AdminFinanceItem] || '';

      if (sortBy === 'amount') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [items, searchQuery, statusFilter, categoryFilter, sortBy, sortOrder]);

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
        {/* 成功與錯誤提示 */}
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
          searchPlaceholder="搜尋姓名、項目、單號、末五碼..."
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

        {/* 卡片清單展示 (不區分活動或裝備，採用統一卡片形式) */}
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
            <span>讀取財務帳務清單中...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            fontSize: '14px'
          }}>
            目前無符合條件的繳費紀錄
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredItems.map((it) => {
              const categoryBadge = it.itemCategory === 'activity'
                ? { label: '[活動]', bg: '#eff6ff', color: '#2563eb' }
                : it.itemCategory === 'equipment'
                  ? { label: '[裝備]', bg: '#fef3c7', color: '#d97706' }
                  : it.itemCategory === 'membership'
                    ? { label: '[社費]', bg: '#f3e8ff', color: '#7e22ce' }
                    : { label: '[款項]', bg: '#f1f5f9', color: '#475569' };

              return (
                <div
                  key={it.id}
                  onClick={() => handleOpenDetail(it)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: categoryBadge.bg,
                        color: categoryBadge.color,
                        fontWeight: 600
                      }}>
                        {categoryBadge.label}
                      </span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                        {it.name || '申報人'}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: it.status === '已核銷 Confirmed' ? '#ecfdf5' : it.status === '待繳費 Unpaid' ? '#fef2f2' : '#fffbeb',
                        color: it.status === '已核銷 Confirmed' ? '#059669' : it.status === '待繳費 Unpaid' ? '#dc2626' : '#b45309',
                        fontWeight: 600
                      }}>
                        {it.status}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: it.notification_status === '已通知' ? '#eff6ff' : '#f1f5f9',
                        color: it.notification_status === '已通知' ? '#2563eb' : '#64748b',
                        fontWeight: 500
                      }}>
                        {it.notification_status === '已通知' ? '已通知' : '未通知'}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.type}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                        ${it.amount} 元
                      </span>
                      {it.bank_last5 && <span>末五碼: {it.bank_last5}</span>}
                      <span>{it.created_at ? it.created_at.split('T')[0] : ''}</span>
                    </div>
                  </div>

                  <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: '8px' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 詳細對帳與狀態編輯彈窗 */}
      {selectedItem && (
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
            {/* 彈窗標題 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                  繳費單詳細對帳
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  單號: {selectedItem.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 詳細內容 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              {/* 申報人與開啟個人資料按鈕 */}
              <div style={{
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>申報人姓名</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{selectedItem.name}</div>
                </div>
                {selectedItem.line_user_id && (
                  <button
                    type="button"
                    onClick={() => {
                      const uid = selectedItem.line_user_id;
                      if (!uid) return;
                      setPreviewMemberUserId(uid);
                      setPreviewMemberData({ name: selectedItem.name, line_user_id: uid });
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

              {/* 款項項目與金額 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>匯款金額</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669' }}>
                    ${selectedItem.amount} 元
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>帳號末五碼</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                    {selectedItem.bank_last5 || '(未填寫)'}
                  </div>
                </div>
              </div>

              {/* 申報內容項目 */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '2px' }}>申報項目內容</div>
                <div style={{ fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                  {selectedItem.type}
                </div>
              </div>

              {/* 匯款憑證圖片 */}
              {selectedItem.proof_image_url && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    匯款證明截圖
                  </div>
                  <div
                    onClick={() => setPreviewImageUrl(selectedItem.proof_image_url || null)}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      maxHeight: '180px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#0f172a'
                    }}
                  >
                    <img
                      src={selectedItem.proof_image_url}
                      alt="匯款證明"
                      style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: '6px',
                      right: '6px',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <ImageIcon size={12} />
                      <span>點擊放大</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 編輯審核狀態 (嚴格合法值下拉選單) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                  修改繳費核銷狀態
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
                    color: editStatus === '已核銷 Confirmed' ? '#059669' : editStatus === '待繳費 Unpaid' ? '#dc2626' : '#d97706',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="待繳費 Unpaid">待繳費 Unpaid</option>
                  <option value="待確認 Checking">待確認 Checking</option>
                  <option value="已核銷 Confirmed">已核銷 Confirmed</option>
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  若改為「已核銷 Confirmed」且通知狀態為「未通知」，儲存後將發送 LINE 推播通知社員，並連動活動名冊或租借單。
                </div>
              </div>

              {/* LINE 通知發送狀態下拉選單 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  LINE 通知發送狀態
                </label>
                <select
                  value={editNotificationStatus}
                  onChange={e => setEditNotificationStatus(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="未通知">未通知 (儲存核銷時將發送推播)</option>
                  <option value="已通知">已通知 (儲存時不發送推播)</option>
                </select>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  若已推播過，系統標記為「已通知」且不再重複發送；若需重新通知社員，可切回「未通知」。
                </div>
              </div>

              {/* 社員申報備註 (由社員申報時填寫，唯讀展示) */}
              {selectedItem.notes && (
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>社員申報備註</div>
                  <div style={{ fontSize: '13px', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
                    {selectedItem.notes}
                  </div>
                </div>
              )}

              {/* 幹部審核備註 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  幹部審核備註
                </label>
                <textarea
                  rows={2}
                  value={officerNotes}
                  onChange={e => setOfficerNotes(e.target.value)}
                  placeholder="輸入備註或核銷紀錄..."
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

            {/* 儲存按鈕組 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setSelectedItem(null)}
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
                {isSaving ? '儲存並同步中...' : '確認儲存狀態'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 圖片放大檢視燈箱 */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <img
            src={previewImageUrl}
            alt="放大檢視"
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </div>
      )}

      {/* 報名/繳款人詳細個人資料彈窗 (底部提供移至社員詳細資料編輯頁面按鈕) */}
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

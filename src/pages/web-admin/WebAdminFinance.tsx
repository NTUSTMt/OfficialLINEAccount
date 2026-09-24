import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  CreditCard,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface PaymentRow {
  id: string;
  line_user_id: string;
  name?: string;
  amount: number;
  type?: string;
  target_type?: string;
  target_id?: string;
  last_five_digits?: string;
  status: string;
  proof_image_url?: string;
  notes?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
}

export const WebAdminFinance: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('待確認 Pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  const loadPayments = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSelectedIds(new Set());
    try {
      const { data, error } = await client
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`[讀取財務繳費資料失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setPayments((data || []) as PaymentRow[]);

      logWebAuditAction(client, session.userId, 'VIEW_FINANCE_LIST', 'payment', undefined, {
        count: data?.length || 0,
      });
    } catch (err: any) {
      console.error('[WebAdminFinance] loadPayments error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [client]);

  // 過濾清單
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchKeyword =
        !searchKeyword ||
        (p.name && p.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.type && p.type.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.target_id && p.target_id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (p.last_five_digits && p.last_five_digits.includes(searchKeyword));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === '待確認 Pending' && (p.status.includes('待確認') || p.status.includes('Pending') || p.status.includes('未繳費'))) ||
        (statusFilter === '已核銷 Confirmed' && (p.status.includes('已核銷') || p.status.includes('Confirmed') || p.status.includes('已繳費')));

      return matchKeyword && matchStatus;
    });
  }, [payments, searchKeyword, statusFilter]);

  // 統計金額與筆數
  const stats = useMemo(() => {
    let pendingCount = 0;
    let pendingAmount = 0;
    let confirmedCount = 0;

    payments.forEach((p) => {
      if (p.status.includes('待確認') || p.status.includes('Pending') || p.status.includes('未繳費')) {
        pendingCount++;
        pendingAmount += Number(p.amount) || 0;
      } else if (p.status.includes('已核銷') || p.status.includes('Confirmed') || p.status.includes('已繳費')) {
        confirmedCount++;
      }
    });

    return { pendingCount, pendingAmount, confirmedCount };
  }, [payments]);

  // 單筆核銷
  const handleVerifyPayment = async (paymentId: string) => {
    setProcessingId(paymentId);
    setErrorMsg(null);
    try {
      const { error } = await client
        .from('payments')
        .update({
          status: '已核銷 Confirmed',
          confirmed_by: session.displayName || session.userId,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      if (error) {
        throw new Error(`[核銷繳費失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId
            ? { ...p, status: '已核銷 Confirmed', confirmed_by: session.displayName, confirmed_at: new Date().toISOString() }
            : p
        )
      );

      logWebAuditAction(client, session.userId, 'VERIFY_PAYMENT', 'payment', paymentId);
    } catch (err: any) {
      console.error('[WebAdminFinance] handleVerifyPayment error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setProcessingId(null);
    }
  };

  // 批次核銷
  const handleBatchVerify = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('payments')
        .update({
          status: '已核銷 Confirmed',
          confirmed_by: session.displayName || session.userId,
          confirmed_at: new Date().toISOString(),
        })
        .in('id', ids);

      if (error) {
        throw new Error(`[批次核銷失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setPayments((prev) =>
        prev.map((p) =>
          ids.includes(p.id)
            ? { ...p, status: '已核銷 Confirmed', confirmed_by: session.displayName, confirmed_at: new Date().toISOString() }
            : p
        )
      );

      setSelectedIds(new Set());

      logWebAuditAction(client, session.userId, 'BATCH_VERIFY_PAYMENTS', 'payment', undefined, {
        count: ids.length,
        ids,
      });
    } catch (err: any) {
      console.error('[WebAdminFinance] handleBatchVerify error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredPayments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPayments.map((p) => p.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  return (
    <>
      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{errorMsg}</div>
        </div>
      )}

      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="var(--wa-primary)" />
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>財務對帳與核銷</span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              style={{ paddingLeft: 30, width: 220 }}
              placeholder="搜尋姓名、項目、末五碼..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <select
            className="web-admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="待確認 Pending">待核銷項目 ({stats.pendingCount})</option>
            <option value="已核銷 Confirmed">已核銷項目 ({stats.confirmedCount})</option>
            <option value="ALL">全部款項 ({payments.length})</option>
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadPayments}
            disabled={loading}
            title="重新整理繳費清單"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>重新整理</span>
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          <div style={{ display: 'flex', gap: 10, fontSize: '0.82rem' }}>
            <span className="web-admin-badge web-admin-badge-warning">待核銷: {stats.pendingCount} 筆</span>
            <span className="web-admin-badge web-admin-badge-danger">待核銷金額: NT$ {stats.pendingAmount.toLocaleString()}</span>
            <span className="web-admin-badge web-admin-badge-success">已核銷: {stats.confirmedCount} 筆</span>
          </div>

          {selectedIds.size > 0 && (
            <button
              type="button"
              className="web-admin-btn"
              onClick={handleBatchVerify}
              disabled={loading}
            >
              <CheckCircle2 size={14} />
              <span>批次核銷所選 ({selectedIds.size} 筆)</span>
            </button>
          )}
        </div>
      </div>

      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredPayments.length > 0 && selectedIds.size === filteredPayments.length}
                  onChange={handleToggleSelectAll}
                />
              </th>
              <th>序號</th>
              <th>申報人</th>
              <th>金額 (NT$)</th>
              <th>末五碼</th>
              <th>狀態</th>
              <th>款項項目與類別</th>
              <th>目標編號</th>
              <th>備註</th>
              <th>憑證</th>
              <th>申報時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  {loading ? '繳費資料載入中...' : '目前無符合條件之款項紀錄'}
                </td>
              </tr>
            ) : (
              filteredPayments.map((p, idx) => {
                const isSelected = selectedIds.has(p.id);
                const isConfirmed = p.status.includes('已核銷') || p.status.includes('Confirmed') || p.status.includes('已繳費');
                const isProcessing = processingId === p.id;

                return (
                  <tr key={p.id} className={isSelected ? 'selected' : ''}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(p.id)}
                      />
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name || '未填寫'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--wa-success-text)' }}>
                      NT$ {Number(p.amount || 0).toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--wa-warning-text)' }}>
                      {p.last_five_digits || '-'}
                    </td>
                    <td>
                      <span
                        className={`web-admin-badge ${
                          isConfirmed ? 'web-admin-badge-success' : 'web-admin-badge-warning'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>{p.type || p.target_type || '活動/租借/社費'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{p.target_id || '-'}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes || '-'}</td>
                    <td>
                      {p.proof_image_url ? (
                        <a
                          href={p.proof_image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="web-admin-badge web-admin-badge-info"
                          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <span>查看截圖</span>
                          <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span style={{ color: 'var(--wa-text-muted)', fontSize: '0.78rem' }}>無截圖</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.76rem' }}>
                      {p.created_at ? new Date(p.created_at).toLocaleString('zh-TW', { hour12: false }) : '-'}
                    </td>
                    <td>
                      {!isConfirmed ? (
                        <button
                          type="button"
                          className="web-admin-btn"
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                          disabled={isProcessing}
                          onClick={() => handleVerifyPayment(p.id)}
                        >
                          <CheckCircle2 size={12} />
                          <span>{isProcessing ? '核銷中...' : '確認核銷'}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--wa-primary)' }}>
                          已核銷 ({p.confirmed_by || '幹部'})
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
    </>
  );
};

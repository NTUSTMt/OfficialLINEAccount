import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Package,
  Search,
  RefreshCw,
  AlertCircle,
  Plus,
  Minus
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  total_qty: number;
  available_qty: number;
  is_borrowable: boolean;
  member_price_per_day: number;
  non_member_price_per_day: number;
  price_2day: number;
  price_extra_day: number;
  specs?: string;
  notes?: string;
  updated_at?: string;
}

export const WebAdminInventory: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  const loadEquipments = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await client
        .from('equipments')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        throw new Error(`[讀取裝備庫存失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setItems((data || []) as EquipmentItem[]);

      logWebAuditAction(client, session.userId, 'VIEW_INVENTORY_LIST', 'equipment', undefined, {
        count: data?.length || 0,
      });
    } catch (err: any) {
      console.error('[WebAdminInventory] loadEquipments error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEquipments();
  }, [client]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchKeyword =
        !searchKeyword ||
        it.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        it.id.toLowerCase().includes(searchKeyword.toLowerCase()) ||
        (it.category && it.category.toLowerCase().includes(searchKeyword.toLowerCase()));

      const matchCategory = categoryFilter === 'ALL' || it.category === categoryFilter;

      return matchKeyword && matchCategory;
    });
  }, [items, searchKeyword, categoryFilter]);

  // 調整庫存數量
  const handleAdjustQty = async (item: EquipmentItem, delta: number) => {
    const nextTotal = Math.max(0, Number(item.total_qty || 0) + delta);
    const nextAvailable = Math.max(0, Number(item.available_qty || 0) + delta);

    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({
          total_qty: nextTotal,
          available_qty: nextAvailable,
        })
        .eq('id', item.id);

      if (error) {
        throw new Error(`[更新庫存數量失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, total_qty: nextTotal, available_qty: nextAvailable }
            : row
        )
      );

      logWebAuditAction(client, session.userId, 'UPDATE_EQUIPMENT_QTY', 'equipment', item.id, {
        name: item.name,
        prevTotal: item.total_qty,
        newTotal: nextTotal,
      });
    } catch (err: any) {
      console.error('[WebAdminInventory] adjustQty error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 切換可借用狀態
  const handleToggleBorrowable = async (item: EquipmentItem) => {
    const nextVal = !item.is_borrowable;
    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({ is_borrowable: nextVal })
        .eq('id', item.id);

      if (error) {
        throw new Error(`[更新裝備借用狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, is_borrowable: nextVal } : row))
      );

      logWebAuditAction(client, session.userId, 'TOGGLE_EQUIPMENT_BORROWABLE', 'equipment', item.id, {
        name: item.name,
        isBorrowable: nextVal,
      });
    } catch (err: any) {
      console.error('[WebAdminInventory] toggleBorrowable error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
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
            <Package size={18} color="var(--wa-primary)" />
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>裝備品項與庫存</span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              style={{ paddingLeft: 30, width: 220 }}
              placeholder="搜尋編號、品名、分類..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <select
            className="web-admin-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">全部分類 ({items.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadEquipments}
            disabled={loading}
            title="重新整理裝備清單"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>重新整理</span>
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          <span className="web-admin-badge web-admin-badge-info">
            品項總數: {items.length} 種
          </span>
        </div>
      </div>

      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              <th>裝備編號</th>
              <th>裝備名稱</th>
              <th>系統分類</th>
              <th>總庫存數量</th>
              <th>目前可借</th>
              <th>借用狀態</th>
              <th>社員價 (2天)</th>
              <th>非社員價 (2天)</th>
              <th>續租每日</th>
              <th>規格說明</th>
              <th>備註</th>
              <th>更新時間</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  {loading ? '裝備資料載入中...' : '無符合條件之裝備品項'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isUpdating = updatingId === item.id;

                return (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.id}</td>
                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                    <td>
                      <span className="web-admin-badge web-admin-badge-neutral">{item.category}</span>
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="web-admin-btn web-admin-btn-secondary"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          disabled={isUpdating || item.total_qty <= 0}
                          onClick={() => handleAdjustQty(item, -1)}
                          title="減少 1 件"
                        >
                          <Minus size={10} />
                        </button>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                          {item.total_qty}
                        </span>
                        <button
                          type="button"
                          className="web-admin-btn web-admin-btn-secondary"
                          style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          disabled={isUpdating}
                          onClick={() => handleAdjustQty(item, 1)}
                          title="增加 1 件"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: item.available_qty > 0 ? 'var(--wa-success-text)' : 'var(--wa-danger-text)' }}>
                      {item.available_qty}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`web-admin-badge ${item.is_borrowable ? 'web-admin-badge-success' : 'web-admin-badge-danger'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        disabled={isUpdating}
                        onClick={() => handleToggleBorrowable(item)}
                        title="點擊切換開放借用"
                      >
                        {item.is_borrowable ? '開放借用' : '暫停借用'}
                      </button>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>NT$ {item.price_2day || item.member_price_per_day || 0}</td>
                    <td style={{ fontFamily: 'monospace' }}>NT$ {item.non_member_price_per_day || 0}</td>
                    <td style={{ fontFamily: 'monospace' }}>NT$ {item.price_extra_day || 0}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.specs || '-'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.notes || '-'}</td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.76rem' }}>
                      {item.updated_at ? new Date(item.updated_at).toLocaleDateString('zh-TW') : '-'}
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

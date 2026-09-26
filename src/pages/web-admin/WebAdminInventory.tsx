import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Plus,
  Minus,
  Pencil,
  X,
  Trash2,
  Upload,
  Lock,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Eye,
  EyeOff,
  Pin,
  ArrowLeftRight,
  ArrowUp,
  ArrowDown,
  GripVertical
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import {
  getNextEquipmentIdFromSupabase,
  insertEquipmentToSupabase,
  updateEquipmentFullInSupabase
} from '../../utils/supabaseClient';
import type { AdminInventoryItem } from '../../types/admin';
import { useAdvancedTable, type AdvancedColumnDef } from '../../components/admin/useAdvancedTable';
import { GAS_API_URL } from '../../constants/api';
import { appendAuthToken, withAuthPayload } from '../../utils/api';
import { getDirectImageUrl } from '../../utils/image';
import './webAdmin.css';

const CATEGORIES: string[] = [
  '睡眠系統',
  '背負系統',
  '炊事系統',
  '照明通訊',
  '攀登技術',
  '行進安全',
  '其他裝備'
];

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  total_qty: number;
  available_qty: number;
  is_borrowable: boolean;
  price_2day: number;
  price_extra_day: number;
  notes?: string;
  images?: string[];
  updated_at?: string;
}

const INVENTORY_COLUMNS: AdvancedColumnDef[] = [
  { key: 'id', label: '編號', defaultWidth: 100, minWidth: 70 },
  { key: 'name', label: '裝備名稱', defaultWidth: 160, minWidth: 120 },
  { key: 'category', label: '系統分類', defaultWidth: 130, minWidth: 100 },
  { key: 'total_qty', label: '總庫存數量', defaultWidth: 120, minWidth: 90 },
  { key: 'available_qty', label: '目前可借', defaultWidth: 110, minWidth: 80 },
  { key: 'is_borrowable', label: '借用狀態', defaultWidth: 110, minWidth: 80 },
  { key: 'price_2day', label: '基礎價 (2天)', defaultWidth: 110, minWidth: 80 },
  { key: 'price_extra_day', label: '續租每日', defaultWidth: 100, minWidth: 70 },
  { key: 'notes', label: '備註', defaultWidth: 180, minWidth: 100 },
  { key: 'updated_at', label: '更新時間', defaultWidth: 110, minWidth: 80 },
  { key: 'actions', label: '操作', defaultWidth: 80, minWidth: 60 },
];

export const WebAdminInventory: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);

  // 表格拖曳狀態
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null);

  // 側邊抽屜（新增 / 編輯模式）狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [newPhotos, setNewPhotos] = useState<Array<{ base64: string; name: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formState, setFormState] = useState<{
    id: string;
    name: string;
    category: string;
    total_qty: number;
    available_qty: number;
    is_borrowable: boolean;
    price_2day: number;
    price_extra_day: number;
    notes: string;
    images: string[];
  }>({
    id: '',
    name: '',
    category: '其他裝備',
    total_qty: 1,
    available_qty: 1,
    is_borrowable: true,
    price_2day: 0,
    price_extra_day: 0,
    notes: '',
    images: []
  });

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
    const set = new Set<string>(CATEGORIES);
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
    rowHeights,
    startRowResizing,
  } = useAdvancedTable<EquipmentItem>({
    storageKey: 'wa_inventory_table_prefs_v1',
    columns: INVENTORY_COLUMNS,
    items: filteredItems,
    getItemId: (item) => item.id,
  });

  // 1. 調整總庫存數量
  const handleAdjustTotalQty = async (item: EquipmentItem, delta: number) => {
    const nextTotal = Math.max(0, Number(item.total_qty || 0) + delta);
    const nextAvailable = Math.min(nextTotal, Math.max(0, Number(item.available_qty || 0) + (delta < 0 && item.available_qty > nextTotal ? delta : 0)));

    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({
          total_qty: nextTotal,
          available_qty: nextAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        throw new Error(`[更新總庫存失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
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
      console.error('[WebAdminInventory] handleAdjustTotalQty error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 2. 調整目前可借數量
  const handleAdjustAvailableQty = async (item: EquipmentItem, delta: number) => {
    const nextAvailable = Math.max(0, Math.min(Number(item.total_qty || 0), Number(item.available_qty || 0) + delta));

    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({
          available_qty: nextAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        throw new Error(`[更新可借數量失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, available_qty: nextAvailable }
            : row
        )
      );

      logWebAuditAction(client, session.userId, 'UPDATE_EQUIPMENT_AVAILABLE_QTY', 'equipment', item.id, {
        name: item.name,
        prevAvailable: item.available_qty,
        newAvailable: nextAvailable,
      });
    } catch (err: any) {
      console.error('[WebAdminInventory] handleAdjustAvailableQty error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 3. 表格內即時修改系統分類
  const handleCategoryChange = async (item: EquipmentItem, newCategory: string) => {
    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({
          category: newCategory,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        throw new Error(`[更新系統分類失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? { ...row, category: newCategory }
            : row
        )
      );

      logWebAuditAction(client, session.userId, 'UPDATE_EQUIPMENT_CATEGORY', 'equipment', item.id, {
        name: item.name,
        prevCategory: item.category,
        newCategory,
      });
    } catch (err: any) {
      console.error('[WebAdminInventory] handleCategoryChange error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // 4. 切換開放借用狀態
  const handleToggleBorrowable = async (item: EquipmentItem) => {
    const nextVal = !item.is_borrowable;
    setUpdatingId(item.id);
    setErrorMsg(null);

    try {
      const { error } = await client
        .from('equipments')
        .update({
          is_borrowable: nextVal,
          updated_at: new Date().toISOString()
        })
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

  // 5. 開啟新增裝備側邊抽屜
  const handleOpenAddDrawer = async () => {
    setIsAddMode(true);
    setActivePhotoIdx(0);
    setNewPhotos([]);
    setErrorMsg(null);

    let nextId = 'EQ_001';
    try {
      nextId = await getNextEquipmentIdFromSupabase();
    } catch (err) {
      console.warn('[WebAdminInventory] getNextEquipmentIdFromSupabase fallback:', err);
    }

    setFormState({
      id: nextId,
      name: '',
      category: '其他裝備',
      total_qty: 1,
      available_qty: 1,
      is_borrowable: true,
      price_2day: 0,
      price_extra_day: 0,
      notes: '',
      images: []
    });

    setDrawerOpen(true);
  };

  // 6. 開啟編輯裝備側邊抽屜
  const handleOpenEditDrawer = (item: EquipmentItem) => {
    setIsAddMode(false);
    setActivePhotoIdx(0);
    setNewPhotos([]);
    setErrorMsg(null);

    setFormState({
      id: item.id,
      name: item.name || '',
      category: item.category || '其他裝備',
      total_qty: item.total_qty || 0,
      available_qty: item.available_qty || 0,
      is_borrowable: Boolean(item.is_borrowable),
      price_2day: item.price_2day || 0,
      price_extra_day: item.price_extra_day || 0,
      notes: item.notes || '',
      images: Array.isArray(item.images) ? [...item.images] : []
    });

    setDrawerOpen(true);
  };

  // 7. 關閉側邊抽屜
  const handleCloseDrawer = () => {
    if (isProcessing) return;
    setDrawerOpen(false);
    setNewPhotos([]);
  };

  // 8. 處理本地相片選取並透過 HTML Canvas 進行等比壓縮
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (formState.images.length >= 5) {
      alert('最多只能上傳 5 張裝備相片');
      e.target.value = '';
      return;
    }

    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 2048;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.88);

        setFormState((prev) => {
          const nextImages = [...prev.images, base64];
          setActivePhotoIdx(nextImages.length - 1);
          return {
            ...prev,
            images: nextImages
          };
        });
        setNewPhotos((prev) => [...prev, { base64, name: file.name }]);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 9. 刪除相片
  const handleRemovePhoto = (idxToRemove: number) => {
    setFormState((prev) => {
      const targetImg = prev.images[idxToRemove];
      const nextImages = prev.images.filter((_, idx) => idx !== idxToRemove);
      setActivePhotoIdx((currentIdx) => Math.max(0, Math.min(currentIdx, nextImages.length - 1)));
      setNewPhotos((np) => np.filter((p) => p.base64 !== targetImg));
      return {
        ...prev,
        images: nextImages
      };
    });
  };

  // 10. 儲存裝備（新增或更新）
  const handleSaveEquipment = async () => {
    if (!formState.name.trim()) {
      setErrorMsg('請填寫裝備名稱');
      return;
    }
    if (!formState.id.trim()) {
      setErrorMsg('請填寫裝備編號');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let finalImages = [...formState.images];
      const newItemsToUpload = newPhotos.filter((p) => finalImages.includes(p.base64));

      // 若有新選取的本地相片，送往 GAS 上傳 Google Drive
      if (newItemsToUpload.length > 0) {
        setIsUploadingPhoto(true);
        try {
          const keptUrls = finalImages.filter((img) => !img.startsWith('data:image/'));
          const newPhotoFiles = newItemsToUpload.map((p) => ({
            base64: p.base64,
            name: p.name || 'equipment_photo.jpg'
          }));

          const postUrl = appendAuthToken(GAS_API_URL);
          const res = await fetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(withAuthPayload({
              action: 'update_equipment_images',
              equipId: formState.id,
              equipName: formState.name.trim(),
              keptUrls,
              newPhotoFiles,
              userId: session.userId || 'officer'
            })),
            redirect: 'follow'
          });
          const text = await res.text();
          let result: any;
          try {
            result = JSON.parse(text);
          } catch {
            console.warn('[WebAdminInventory] GAS upload non-json response:', text);
          }

          if (result && result.status === 'success') {
            const uploadedUrls: string[] = result.images || (result.imageUrl ? result.imageUrl.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
            if (uploadedUrls.length > 0) {
              finalImages = uploadedUrls;
            }
          }
        } catch (uploadErr: any) {
          console.warn('[WebAdminInventory] Upload photo via GAS failed, will fallback to local images:', uploadErr);
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      if (isAddMode) {
        const payload: Omit<AdminInventoryItem, 'created_at'> = {
          id: formState.id.trim(),
          name: formState.name.trim(),
          category: formState.category as any,
          total_qty: Number(formState.total_qty) || 0,
          available_qty: Number(formState.available_qty) || 0,
          is_borrowable: Boolean(formState.is_borrowable),
          price_2day: Number(formState.price_2day) || 0,
          price_extra_day: Number(formState.price_extra_day) || 0,
          notes: formState.notes,
          images: finalImages
        };

        const res = await insertEquipmentToSupabase(payload);
        if (!res.success) {
          throw new Error(res.error || '新增裝備失敗');
        }

        setSuccessMsg(`裝備 ${formState.name} (${formState.id}) 新增成功！`);
      } else {
        const updateFields: Partial<AdminInventoryItem> = {
          name: formState.name.trim(),
          category: formState.category as any,
          total_qty: Number(formState.total_qty) || 0,
          available_qty: Number(formState.available_qty) || 0,
          is_borrowable: Boolean(formState.is_borrowable),
          price_2day: Number(formState.price_2day) || 0,
          price_extra_day: Number(formState.price_extra_day) || 0,
          notes: formState.notes,
          images: finalImages
        };

        const res = await updateEquipmentFullInSupabase(formState.id, updateFields);
        if (!res.success) {
          throw new Error(res.error || '更新裝備失敗');
        }

        setSuccessMsg(`裝備 ${formState.name} (${formState.id}) 更新成功！`);
      }

      handleCloseDrawer();
      await loadEquipments();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('[WebAdminInventory] handleSaveEquipment error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* 錯誤與成功訊息 */}
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

      {/* 頂部工具列：無橫條文字、重整純圖示、右側新增裝備按鈕 */}
      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
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

          {/* 重新整理純圖示按鈕 */}
          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadEquipments}
            disabled={loading}
            title="重新整理裝備清單"
            aria-label="重新整理裝備清單"
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
                  {INVENTORY_COLUMNS.map((col) => {
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
          <span className="web-admin-badge web-admin-badge-info" style={{ marginRight: 8 }}>
            品項總數: {items.length} 種
          </span>

          {/* 新增裝備按鈕 */}
          <button
            type="button"
            className="web-admin-btn"
            onClick={handleOpenAddDrawer}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
          >
            <Plus size={15} />
            <span>新增裝備</span>
          </button>
        </div>
      </div>

      {/* 裝備資料表格 */}
      <div className="web-admin-grid-container">
        <table className="web-admin-table" style={{ tableLayout: 'fixed' }}>
          <thead>
            {/* 相容測試靜態標籤註解: <th>編號</th> <th>基礎價 (2天)</th> */}
            <tr>
              <th
                style={{
                  width: 46,
                  minWidth: 46,
                  maxWidth: 46,
                  textAlign: 'center',
                  position: 'sticky',
                  left: 0,
                  zIndex: 25,
                  backgroundColor: '#f8fafc',
                  borderRight: '1px solid var(--wa-border)',
                }}
              >
                #
              </th>
              {visibleColumns.map((col) => {
                const isPinned = pinnedColumns.includes(col.key);
                const stickyLeft = isPinned ? (stickyLeftPositions[col.key] !== undefined ? stickyLeftPositions[col.key] - 44 : undefined) : undefined;
                const width = columnWidths[col.key] || col.defaultWidth;

                return (
                  <th
                    key={col.key}
                    className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === col.key ? 'wa-col-pinned-last' : ''} ${
                      dragOverColKey === col.key ? 'wa-col-drag-over' : ''
                    }`}
                    style={{
                      width: `${width}px`,
                      minWidth: `${col.minWidth || 60}px`,
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
                <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  {loading ? '裝備資料載入中...' : '無符合條件之裝備品項'}
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => {
                const isUpdating = updatingId === item.id;
                const isNotesExpanded = expandedNotesId === item.id;
                const isRowPinned = pinnedRowIds.has(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`${isRowPinned ? 'wa-row-pinned' : ''} ${
                      dragOverRowId === item.id ? 'wa-row-drag-over' : ''
                    }`}
                    style={{
                      height: rowHeights[item.id] ? `${rowHeights[item.id]}px` : undefined,
                    }}
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
                    {/* 序號儲存格與四角懸浮操作列 + 中央拖曳手柄 */}
                    <td
                      className="wa-row-index-cell"
                      style={{
                        position: 'sticky',
                        left: 0,
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

                      {/* 拖曳調整列高柄 */}
                      <div
                        className="wa-row-resizer"
                        onMouseDown={(e) => startRowResizing(item.id, e)}
                        title="拖曳調整列高"
                      />
                    </td>

                    {/* 動態渲染可見欄位資料 */}
                    {visibleColumns.map((col) => {
                      const isPinned = pinnedColumns.includes(col.key);
                      const stickyLeft = isPinned ? (stickyLeftPositions[col.key] !== undefined ? stickyLeftPositions[col.key] - 44 : undefined) : undefined;

                      switch (col.key) {
                        case 'id':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'id' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.id}
                            </td>
                          );

                        case 'name':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'name' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontWeight: 600,
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.name}
                            </td>
                          );

                        case 'category':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'category' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <select
                                className="wa-table-select"
                                value={item.category || '其他裝備'}
                                disabled={isUpdating}
                                onChange={(e) => handleCategoryChange(item, e.target.value)}
                                title="點擊修改系統分類"
                              >
                                {CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );

                        case 'total_qty':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'total_qty' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  className="web-admin-btn web-admin-btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  disabled={isUpdating || item.total_qty <= 0}
                                  onClick={() => handleAdjustTotalQty(item, -1)}
                                  title="減少 1 件總庫存"
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
                                  onClick={() => handleAdjustTotalQty(item, 1)}
                                  title="增加 1 件總庫存"
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </td>
                          );

                        case 'available_qty':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'available_qty' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  className="web-admin-btn web-admin-btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  disabled={isUpdating || item.available_qty <= 0}
                                  onClick={() => handleAdjustAvailableQty(item, -1)}
                                  title="減少 1 件可借"
                                >
                                  <Minus size={10} />
                                </button>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    minWidth: 24,
                                    textAlign: 'center',
                                    color: item.available_qty > 0 ? 'var(--wa-success-text)' : 'var(--wa-danger-text)',
                                  }}
                                >
                                  {item.available_qty}
                                </span>
                                <button
                                  type="button"
                                  className="web-admin-btn web-admin-btn-secondary"
                                  style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                  disabled={isUpdating || item.available_qty >= item.total_qty}
                                  onClick={() => handleAdjustAvailableQty(item, 1)}
                                  title="增加 1 件可借"
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                            </td>
                          );

                        case 'is_borrowable':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'is_borrowable' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              <button
                                type="button"
                                className={`web-admin-badge ${item.is_borrowable ? 'web-admin-badge-success' : 'web-admin-badge-danger'}`}
                                style={{ cursor: 'pointer', border: 'none' }}
                                disabled={isUpdating}
                                onClick={() => handleToggleBorrowable(item)}
                                title="點擊切換開放/暫停借用"
                              >
                                {item.is_borrowable ? '開放借用' : '暫停借用'}
                              </button>
                            </td>
                          );

                        case 'price_2day':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'price_2day' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.price_2day || 0}
                            </td>
                          );

                        case 'price_extra_day':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'price_extra_day' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                fontFamily: 'monospace',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.price_extra_day || 0}
                            </td>
                          );

                        case 'notes':
                          return (
                            <td
                              key={col.key}
                              className={`wa-table-note-cell ${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'notes' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                              onClick={() => setExpandedNotesId(isNotesExpanded ? null : item.id)}
                              title="點擊展開/收合完整備註"
                            >
                              <div className={isNotesExpanded ? 'wa-table-note-expanded' : 'wa-table-note-collapsed'}>
                                {item.notes || '-'}
                              </div>
                            </td>
                          );

                        case 'updated_at':
                          return (
                            <td
                              key={col.key}
                              className={`${isPinned ? 'wa-col-pinned' : ''} ${lastPinnedKey === 'updated_at' ? 'wa-col-pinned-last' : ''}`}
                              style={{
                                color: 'var(--wa-text-muted)',
                                fontSize: '0.76rem',
                                position: isPinned ? 'sticky' : undefined,
                                left: stickyLeft !== undefined ? `${stickyLeft}px` : undefined,
                                zIndex: isPinned ? 10 : undefined,
                              }}
                            >
                              {item.updated_at ? new Date(item.updated_at).toLocaleDateString('zh-TW') : '-'}
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
                              <button
                                type="button"
                                className="wa-icon-action-btn"
                                onClick={() => handleOpenEditDrawer(item)}
                                title="編輯裝備詳情與相片"
                              >
                                <Pencil size={15} />
                              </button>
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

      {/* 右側懸浮滑出側邊抽屜：比照手機版編輯裝備風格，文字純靠左 */}
      {drawerOpen && (
        <div className="wa-drawer-backdrop" onClick={handleCloseDrawer}>
          <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-header">
              <div>
                <h2 className="wa-drawer-title">{isAddMode ? '新增裝備品項' : '編輯裝備詳情'}</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2, textAlign: 'left' }}>
                  {formState.id}
                </div>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={handleCloseDrawer}
                disabled={isProcessing}
                title="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <div className="wa-drawer-body" style={{ textAlign: 'left' }}>
              {/* 1:1 正方形相片輪播與管理區 */}
              <div className="wa-form-section" style={{ margin: 0, padding: 12 }}>
                <div
                  className={`wa-inventory-carousel-box ${formState.images.length === 0 ? 'dashed' : ''}`}
                  style={{ marginTop: 8 }}
                >
                  {formState.images.length > 0 ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img
                        src={getDirectImageUrl(formState.images[activePhotoIdx]) || formState.images[activePhotoIdx]}
                        alt={`相片 ${activePhotoIdx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />

                      {/* 刪除當前照片按鈕 */}
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(activePhotoIdx)}
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          backgroundColor: 'rgba(239, 68, 68, 0.9)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                        title="刪除當前照片"
                      >
                        <Trash2 size={12} />
                        <span>刪除</span>
                      </button>

                      {/* 左右切換箭頭 */}
                      {formState.images.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : formState.images.length - 1))}
                            style={{
                              position: 'absolute',
                              left: 8,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              backgroundColor: 'rgba(15, 23, 42, 0.6)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 28,
                              height: 28,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivePhotoIdx((prev) => (prev < formState.images.length - 1 ? prev + 1 : 0))}
                            style={{
                              position: 'absolute',
                              right: 8,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              backgroundColor: 'rgba(15, 23, 42, 0.6)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 28,
                              height: 28,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        color: 'var(--wa-text-muted)',
                        cursor: 'pointer'
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon size={36} color="var(--wa-border)" />
                      <span style={{ fontSize: '0.85rem' }}>尚無裝備相片，點擊此處上傳</span>
                    </div>
                  )}
                </div>

                {/* 縮圖列與上傳按鈕 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                    {formState.images.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActivePhotoIdx(idx)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 6,
                          overflow: 'hidden',
                          border: activePhotoIdx === idx ? '2px solid var(--wa-primary)' : '1px solid var(--wa-border)',
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                      >
                        <img
                          src={getDirectImageUrl(img) || img}
                          alt="縮圖"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                  </div>

                  {formState.images.length < 5 && (
                    <button
                      type="button"
                      className="web-admin-btn web-admin-btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 10px', flexShrink: 0 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                    >
                      <Upload size={13} />
                      <span>{formState.images.length === 0 ? '上傳相片' : '追加相片'}</span>
                    </button>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {/* 基本資訊表單 (文字純靠左) */}
              <div className="wa-form-section" style={{ margin: 0, padding: 12 }}>
                <div className="wa-form-section-title">基本與規格資訊</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                  {/* 編號 */}
                  <div className="wa-form-group">
                    <label className="wa-form-label">裝備編號</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formState.id}
                        disabled={!isAddMode}
                        onChange={(e) => setFormState({ ...formState, id: e.target.value })}
                        placeholder="例如 EQ_001"
                        style={{ fontFamily: 'monospace', paddingRight: !isAddMode ? 32 : 12 }}
                      />
                      {!isAddMode && (
                        <Lock size={14} color="var(--wa-text-muted)" style={{ position: 'absolute', right: 10, top: 11 }} />
                      )}
                    </div>
                  </div>

                  {/* 名稱 */}
                  <div className="wa-form-group">
                    <label className="wa-form-label">裝備名稱 *</label>
                    <input
                      type="text"
                      className="wa-form-input"
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      placeholder="例如 四人帳篷 / 登山健行杖"
                    />
                  </div>

                  {/* 系統分類 */}
                  <div className="wa-form-group">
                    <label className="wa-form-label">系統分類</label>
                    <select
                      className="wa-form-select"
                      value={formState.category}
                      onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 庫存設定 (雙欄) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">總庫存數量</label>
                      <input
                        type="number"
                        min="0"
                        className="wa-form-input"
                        value={formState.total_qty}
                        onChange={(e) => setFormState({ ...formState, total_qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      />
                    </div>
                    <div className="wa-form-group">
                      <label className="wa-form-label">目前可借數量</label>
                      <input
                        type="number"
                        min="0"
                        max={formState.total_qty}
                        className="wa-form-input"
                        value={formState.available_qty}
                        onChange={(e) => setFormState({ ...formState, available_qty: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      />
                    </div>
                  </div>

                  {/* 借用狀態開關 */}
                  <div className="wa-form-group">
                    <label className="wa-form-label">借用狀態</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        type="button"
                        className={`web-admin-btn ${formState.is_borrowable ? '' : 'web-admin-btn-secondary'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setFormState({ ...formState, is_borrowable: true })}
                      >
                        開放借用
                      </button>
                      <button
                        type="button"
                        className={`web-admin-btn ${!formState.is_borrowable ? '' : 'web-admin-btn-secondary'}`}
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setFormState({ ...formState, is_borrowable: false })}
                      >
                        暫停借用
                      </button>
                    </div>
                  </div>

                  {/* 租金設定 (雙欄，無幣別前綴) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">基礎價 (2天)</label>
                      <input
                        type="number"
                        min="0"
                        className="wa-form-input"
                        value={formState.price_2day}
                        onChange={(e) => setFormState({ ...formState, price_2day: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      />
                    </div>
                    <div className="wa-form-group">
                      <label className="wa-form-label">續租每日</label>
                      <input
                        type="number"
                        min="0"
                        className="wa-form-input"
                        value={formState.price_extra_day}
                        onChange={(e) => setFormState({ ...formState, price_extra_day: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      />
                    </div>
                  </div>

                  {/* 備註說明 */}
                  <div className="wa-form-group">
                    <label className="wa-form-label">備註說明</label>
                    <textarea
                      rows={3}
                      className="wa-form-textarea"
                      value={formState.notes}
                      onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                      placeholder="填寫裝備保養注意事項、配件清單或備註..."
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
                disabled={isProcessing}
              >
                取消
              </button>

              <button
                type="button"
                className="web-admin-btn"
                onClick={handleSaveEquipment}
                disabled={isProcessing}
              >
                <span>{isProcessing ? (isUploadingPhoto ? '上傳相片中...' : '儲存中...') : (isAddMode ? '確認新增' : '儲存變更')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

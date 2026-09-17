import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Camera
} from 'lucide-react';
import {
  fetchAllInventoryFromSupabase,
  getNextEquipmentIdFromSupabase,
  insertEquipmentToSupabase,
  updateEquipmentFullInSupabase,
  deleteEquipmentFromSupabase
} from '../utils/supabaseClient';
import type { AdminInventoryItem } from '../types/admin';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { GAS_API_URL } from '../constants/api';
import { getDirectImageUrl } from '../utils/image';
import { ProductImage } from '../components/borrow/ProductImage';

const CATEGORIES: AdminInventoryItem['category'][] = [
  '睡眠系統',
  '背負系統',
  '炊事系統',
  '照明通訊',
  '攀登技術',
  '行進安全',
  '其他裝備'
];

const SORT_OPTIONS: SortOption[] = [
  { key: 'category', label: '依裝備分類' },
  { key: 'available_qty', label: '依剩餘可借量' },
  { key: 'price_2day', label: '依2天租金金額' },
  { key: 'name', label: '依裝備名稱' },
  { key: 'id', label: '依裝備編號' }
];

export default function AdminInventory(_props: { userId?: string } = {}) {
  const [items, setItems] = useState<AdminInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 搜尋、篩選與排序
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [borrowableFilter, setBorrowableFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortBy, setSortBy] = useState('category');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 新增 / 編輯彈窗狀態
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminInventoryItem | null>(null);
  const [formState, setFormState] = useState<{
    id: string;
    name: string;
    category: AdminInventoryItem['category'];
    total_qty: number;
    available_qty: number;
    is_borrowable: boolean;
    price_2day: number;
    price_extra_day: number;
    specs: string;
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
    specs: '',
    notes: '',
    images: []
  });

  // 刪除確認彈窗
  const [itemToDelete, setItemToDelete] = useState<AdminInventoryItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAllInventoryFromSupabase();
      setItems(data);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 開啟新增裝備
  const handleOpenAdd = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const nextId = await getNextEquipmentIdFromSupabase();
      setFormState({
        id: nextId,
        name: '',
        category: '其他裝備',
        total_qty: 1,
        available_qty: 1,
        is_borrowable: true,
        price_2day: 0,
        price_extra_day: 0,
        specs: '',
        notes: '',
        images: []
      });
      setIsAddMode(true);
      setEditingItem(null);
      setIsEditModalOpen(true);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // 開啟編輯裝備
  const handleOpenEdit = (it: AdminInventoryItem) => {
    setEditingItem(it);
    setIsAddMode(false);
    setErrorMessage(null);
    setSuccessMessage(null);

    let imgList: string[] = [];
    if (Array.isArray(it.images)) {
      imgList = it.images;
    } else if (typeof it.images === 'string') {
      imgList = (it.images as string).split(/[\n,，;\s]+/).map(u => u.trim()).filter(Boolean);
    }

    setFormState({
      id: it.id,
      name: it.name || '',
      category: it.category || '其他裝備',
      total_qty: it.total_qty ?? 1,
      available_qty: it.available_qty ?? 1,
      is_borrowable: it.is_borrowable !== false,
      price_2day: it.price_2day ?? 0,
      price_extra_day: it.price_extra_day ?? 0,
      specs: it.specs || '',
      notes: it.notes || '',
      images: imgList
    });
    setIsEditModalOpen(true);
  };

  // 處理相片上傳至 Google Drive
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    setErrorMessage(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const res = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              action: 'upload_drive_files',
              folderType: 'equipments',
              files: [{ data: base64, name: file.name }]
            })
          });
          const result = await res.json();
          if (result.status === 'success' && result.urls && result.urls.length > 0) {
            setFormState(prev => ({
              ...prev,
              images: [...prev.images, result.urls[0]]
            }));
          } else {
            setErrorMessage(result.message || '相片上傳失敗');
          }
        } catch (uploadErr: any) {
          setErrorMessage(uploadErr instanceof Error ? uploadErr.message : String(uploadErr));
        } finally {
          setIsUploadingPhoto(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsUploadingPhoto(false);
    }
  };

  // 刪除相片
  const handleRemovePhoto = (idxToRemove: number) => {
    setFormState(prev => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== idxToRemove)
    }));
  };

  // 儲存裝備 (新增或更新)
  const handleSaveEquipment = async () => {
    if (!formState.name.trim()) {
      alert('請填寫裝備名稱');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (isAddMode) {
        const payload: Omit<AdminInventoryItem, 'created_at'> = {
          id: formState.id,
          name: formState.name.trim(),
          category: formState.category,
          total_qty: Number(formState.total_qty) || 0,
          available_qty: Number(formState.available_qty) || 0,
          is_borrowable: Boolean(formState.is_borrowable),
          price_2day: Number(formState.price_2day) || 0,
          price_extra_day: Number(formState.price_extra_day) || 0,
          specs: formState.specs,
          notes: formState.notes,
          images: formState.images
        };

        const res = await insertEquipmentToSupabase(payload);
        if (!res.success) {
          setErrorMessage(res.error || '新增裝備失敗');
          setIsProcessing(false);
          return;
        }

        setSuccessMessage(`裝備 ${formState.name} (${formState.id}) 新增成功！`);
      } else {
        const updateFields: Partial<AdminInventoryItem> = {
          name: formState.name.trim(),
          category: formState.category,
          total_qty: Number(formState.total_qty) || 0,
          available_qty: Number(formState.available_qty) || 0,
          is_borrowable: Boolean(formState.is_borrowable),
          price_2day: Number(formState.price_2day) || 0,
          price_extra_day: Number(formState.price_extra_day) || 0,
          specs: formState.specs,
          notes: formState.notes,
          images: formState.images
        };

        const res = await updateEquipmentFullInSupabase(formState.id, updateFields);
        if (!res.success) {
          setErrorMessage(res.error || '更新裝備失敗');
          setIsProcessing(false);
          return;
        }

        setSuccessMessage(`裝備 ${formState.name} (${formState.id}) 資料更新成功！`);
      }

      setIsEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // 刪除裝備
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await deleteEquipmentFromSupabase(itemToDelete.id);
      if (!res.success) {
        setErrorMessage(res.error || '刪除裝備失敗');
        setIsProcessing(false);
        return;
      }

      setSuccessMessage(`裝備 ${itemToDelete.name} (${itemToDelete.id}) 已成功刪除！`);
      setItemToDelete(null);
      await loadData();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // 篩選群組
  const filters: FilterGroup[] = useMemo(() => [
    {
      key: 'category',
      label: '裝備分類',
      selected: categoryFilter,
      onChange: setCategoryFilter,
      options: [
        { value: 'all', label: '全部分類' },
        ...CATEGORIES.map(c => ({ value: c, label: c }))
      ]
    },
    {
      key: 'borrowable',
      label: '借用開放狀態',
      selected: borrowableFilter,
      onChange: setBorrowableFilter,
      options: [
        { value: 'all', label: '全部狀態' },
        { value: 'true', label: '開放借用' },
        { value: 'false', label: '不開放外借' }
      ]
    },
    {
      key: 'stock',
      label: '庫存狀態',
      selected: stockFilter,
      onChange: setStockFilter,
      options: [
        { value: 'all', label: '全部庫存' },
        { value: 'available', label: '尚有庫存' },
        { value: 'empty', label: '已借完 (庫存為0)' }
      ]
    }
  ], [categoryFilter, borrowableFilter, stockFilter]);

  // 過濾與排序
  const filteredItems = useMemo(() => {
    let list = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(it => {
        const n = (it.name || '').toLowerCase();
        const id = (it.id || '').toLowerCase();
        const c = (it.category || '').toLowerCase();
        const s = (it.specs || '').toLowerCase();
        return n.includes(q) || id.includes(q) || c.includes(q) || s.includes(q);
      });
    }

    if (categoryFilter !== 'all') {
      list = list.filter(it => it.category === categoryFilter);
    }

    if (borrowableFilter !== 'all') {
      const isBorrow = borrowableFilter === 'true';
      list = list.filter(it => Boolean(it.is_borrowable) === isBorrow);
    }

    if (stockFilter !== 'all') {
      if (stockFilter === 'available') {
        list = list.filter(it => (it.available_qty || 0) > 0);
      } else {
        list = list.filter(it => (it.available_qty || 0) <= 0);
      }
    }

    list.sort((a, b) => {
      let valA: any = a[sortBy as keyof AdminInventoryItem] || '';
      let valB: any = b[sortBy as keyof AdminInventoryItem] || '';

      if (sortBy === 'available_qty' || sortBy === 'price_2day') {
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
  }, [items, searchQuery, categoryFilter, borrowableFilter, stockFilter, sortBy, sortOrder]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      paddingBottom: '40px'
    }}>
      <AdminSubNav />

      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '16px 14px'
      }}>
        {/* 訊息提示 */}
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

        {/* Notion 搜尋、篩選、排序、重新整理與新增裝備列 */}
        <NotionFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜尋裝備名稱、編號、分類..."
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
          onAdd={handleOpenAdd}
          addTooltip="新增裝備"
        />

        {/* 裝備卡片列表 (沿用 Borrow 頁面視覺風格) */}
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
            <span>讀取裝備清單中...</span>
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
            查無符合條件的裝備品項
          </div>
        ) : (
          <div className="products-grid" style={{ gap: '12px' }}>
            {filteredItems.map((it) => {
              // 首張相片預覽
              let firstImg = '';
              if (Array.isArray(it.images) && it.images.length > 0) {
                firstImg = it.images[0];
              } else if (it.images && typeof it.images === 'string') {
                firstImg = (it.images as string).split(/[\n,，;\s]+/)[0] || '';
              }
              const isOutOfStock = (it.available_qty || 0) <= 0;

              return (
                <div
                  key={it.id}
                  className="product-card"
                  style={{
                    borderRadius: '12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                  }}
                >
                  {/* 頂部 1:1 大圖 */}
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
                    <ProductImage name={it.name} imageUrl={firstImg} />
                    {/* 左上角分類與開放外借標籤 */}
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      zIndex: 2
                    }}>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.92)',
                        color: '#334155',
                        fontWeight: 700,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
                      }}>
                        {it.category}
                      </span>
                      {!it.is_borrowable && (
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(241, 245, 249, 0.95)',
                          color: '#64748b',
                          fontWeight: 600,
                          border: '1px solid #cbd5e1'
                        }}>
                          不開放外借
                        </span>
                      )}
                    </div>

                    {/* 右上角庫存標籤 */}
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      zIndex: 2
                    }}>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: isOutOfStock ? 'rgba(239, 68, 68, 0.9)' : 'rgba(5, 150, 105, 0.9)',
                        color: '#ffffff',
                        fontWeight: 700,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}>
                        {isOutOfStock ? '無庫存' : `可借 ${it.available_qty}`}
                      </span>
                    </div>
                  </div>

                  {/* 下方商品資訊 */}
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {it.id}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          總量 {it.total_qty}
                        </span>
                      </div>

                      <h3 style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#0f172a',
                        margin: '0 0 6px 0',
                        lineHeight: 1.3,
                        minHeight: '34px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {it.name}
                      </h3>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>2天租金</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#059669' }}>
                            ${it.price_2day}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>續租每日</span>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            +${it.price_extra_day || 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 底部精巧操作按鈕 (編輯 / 刪除) */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '6px',
                      paddingTop: '8px',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <button
                        onClick={() => handleOpenEdit(it)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '3px',
                          padding: '6px 4px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={12} />
                        <span>編輯</span>
                      </button>
                      <button
                        onClick={() => setItemToDelete(it)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '3px',
                          padding: '6px 4px',
                          borderRadius: '6px',
                          border: '1px solid #fecaca',
                          backgroundColor: '#ffffff',
                          color: '#dc2626',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} />
                        <span>刪除</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增 / 編輯裝備彈窗 */}
      {isEditModalOpen && (
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
            maxWidth: '540px',
            width: '100%',
            padding: '20px',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                {isAddMode ? '新增裝備品項' : `編輯裝備：${editingItem?.name}`}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                disabled={isProcessing}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              {/* 自動配發裝備代號 (唯讀顯示) */}
              <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>裝備編號代碼 (系統自動流水號)</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>
                  {formState.id}
                </div>
              </div>

              {/* 裝備名稱 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>裝備名稱 *</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：MSR 雙人帳篷"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              {/* 分類與是否開放外借 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>裝備分類</label>
                  <select
                    value={formState.category}
                    onChange={e => setFormState(prev => ({ ...prev, category: e.target.value as any }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>開放外借借用</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formState.is_borrowable}
                      onChange={e => setFormState(prev => ({ ...prev, is_borrowable: e.target.checked }))}
                      style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                    />
                    <span>{formState.is_borrowable ? '開放借用' : '不開放外借'}</span>
                  </label>
                </div>
              </div>

              {/* 庫存數量 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>總庫存量</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.total_qty}
                    onChange={e => setFormState(prev => ({ ...prev, total_qty: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>目前可借數量</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.available_qty}
                    onChange={e => setFormState(prev => ({ ...prev, available_qty: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 租金計費 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>2天基本租金 (元)</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.price_2day}
                    onChange={e => setFormState(prev => ({ ...prev, price_2day: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>續租每日加成 (元)</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.price_extra_day}
                    onChange={e => setFormState(prev => ({ ...prev, price_extra_day: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 規格與注意事項 */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>規格描述 (重量、材質、尺寸)</label>
                <textarea
                  rows={2}
                  value={formState.specs}
                  onChange={e => setFormState(prev => ({ ...prev, specs: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>注意事項與保養備註</label>
                <textarea
                  rows={2}
                  value={formState.notes}
                  onChange={e => setFormState(prev => ({ ...prev, notes: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              {/* 相片管理 (新增與刪除相片，沿用 Borrow 頁面樣式) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                    裝備相片 ({formState.images.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f8fafc',
                      color: '#2563eb',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isUploadingPhoto ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Camera size={13} />
                    <span>{isUploadingPhoto ? '上傳相片中...' : '上傳新相片'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* 相片列表縮圖與刪除按鈕 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formState.images.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '70px',
                        height: '70px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      <img
                        src={getDirectImageUrl(imgUrl)}
                        alt={`相片 ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(idx)}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {formState.images.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>目前無相片</div>
                  )}
                </div>
              </div>
            </div>

            {/* 儲存按鈕組 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEquipment}
                disabled={isProcessing}
                style={{
                  flex: 2,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessing ? '儲存中...' : (isAddMode ? '確認新增裝備' : '確認儲存修改')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 刪除確認防呆彈窗 */}
      {itemToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '400px',
            width: '100%',
            padding: '20px',
            boxSizing: 'border-box'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '17px', fontWeight: 700, color: '#dc2626' }}>
              確定要刪除裝備嗎？
            </h3>
            <p style={{ margin: '0 0 18px 0', fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
              您即將刪除裝備 <strong>{itemToDelete.name} ({itemToDelete.id})</strong>。此動作將從資料庫中移除該品項，無法復原。
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setItemToDelete(null)}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                {isProcessing ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

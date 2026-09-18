import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Camera,
  Plus,
  X
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
import { appendAuthToken, withAuthPayload } from '../utils/api';
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

export default function AdminInventory({ userId }: { userId?: string } = {}) {
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
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [newPhotos, setNewPhotos] = useState<Array<{ base64: string; name: string }>>([]);

  // 照片輪播滑動手勢控制 (完全對齊 EquipmentDetailModal)
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef<boolean>(false);
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
    setActivePhotoIdx(0);
    setNewPhotos([]);
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
    setIsAddMode(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setActivePhotoIdx(0);
    setNewPhotos([]);

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
      notes: it.notes || it.specs || '',
      images: imgList
    });
    setIsEditModalOpen(true);
  };

  // 處理相片選取並透過 HTML Canvas 進行前端等比壓縮 (即時預覽)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (formState.images.length >= 5) {
      alert('最多只能上傳 5 張裝備相片');
      e.target.value = '';
      return;
    }

    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;
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
        const base64 = canvas.toDataURL('image/jpeg', 0.8);

        setFormState(prev => {
          const nextImages = [...prev.images, base64];
          setActivePhotoIdx(nextImages.length - 1);
          return {
            ...prev,
            images: nextImages
          };
        });
        setNewPhotos(prev => [...prev, { base64, name: file.name }]);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 刪除相片 (支援即時刪除與索引調整)
  const handleRemovePhoto = (idxToRemove: number) => {
    setFormState(prev => {
      const targetImg = prev.images[idxToRemove];
      const nextImages = prev.images.filter((_, idx) => idx !== idxToRemove);
      setActivePhotoIdx(currentIdx => Math.max(0, Math.min(currentIdx, nextImages.length - 1)));
      setNewPhotos(np => np.filter(p => p.base64 !== targetImg));
      return {
        ...prev,
        images: nextImages
      };
    });
  };

  // 照片輪播滑動手勢處理 (完全對齊 EquipmentDetailModal)
  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    if (formState.images.length <= 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || formState.images.length <= 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === formState.images.length - 1 && dx < 0)) {
        setDragOffset(dx * 0.3);
      } else {
        setDragOffset(dx);
      }
    }
  };

  const handleCarouselTouchEnd = () => {
    if (!touchStartPos.current) return;
    setIsDragging(false);

    if (Math.abs(dragOffset) > 40) {
      if (dragOffset < 0 && activePhotoIdx < formState.images.length - 1) {
        setActivePhotoIdx(prev => prev + 1);
      } else if (dragOffset > 0 && activePhotoIdx > 0) {
        setActivePhotoIdx(prev => prev - 1);
      }
    }

    setDragOffset(0);
    touchStartPos.current = null;
    setTimeout(() => {
      didDrag.current = false;
    }, 120);
  };

  const handleCarouselMouseDown = (e: React.MouseEvent) => {
    if (formState.images.length <= 1) return;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselMouseMove = (e: React.MouseEvent) => {
    if (!touchStartPos.current || !isDragging || formState.images.length <= 1) return;
    const dx = e.clientX - touchStartPos.current.x;
    if (Math.abs(dx) > 5) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === formState.images.length - 1 && dx < 0)) {
        setDragOffset(dx * 0.3);
      } else {
        setDragOffset(dx);
      }
    }
  };

  const handleCarouselMouseUp = () => {
    if (isDragging) {
      handleCarouselTouchEnd();
    }
  };

  // 儲存裝備 (新增或更新，僅新相片送往 GAS 上傳 Google Drive，無新圖直更 Supabase)
  const handleSaveEquipment = async () => {
    if (!formState.name.trim()) {
      alert('請填寫裝備名稱');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let finalImages = [...formState.images];
      const newItemsToUpload = newPhotos.filter(p => finalImages.includes(p.base64));

      // 若有新選取的本地相片，送往 GAS 上傳 Google Drive
      if (newItemsToUpload.length > 0) {
        setIsUploadingPhoto(true);
        try {
          const keptUrls = finalImages.filter(img => !img.startsWith('data:image/'));
          const newPhotoFiles = newItemsToUpload.map(p => ({
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
              userId: userId || 'officer'
            })),
            redirect: 'follow'
          });
          const text = await res.text();
          let result: any;
          try {
            result = JSON.parse(text);
          } catch {
            if (text.startsWith('<!DOCTYPE') || text.includes('window[\'ppConfig\']') || text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
              throw new Error('Google Apps Script 存取權限不足（伺服器重導向至 Google 帳號登入頁面）。請確認 GAS「管理部署」設定：執行為設為「我 (Me)」，且誰可以存取設為「所有人 (Anyone)」，並建立新版本！');
            }
            if (text.includes('找不到以下指令碼函式：doPost')) {
              throw new Error('Google Apps Script 尚未部署最新版程式碼（找不到 doPost 函式），請於 GAS 管理部署中建立新版本！');
            }
            if (text.includes('未支援的 Helper Action')) {
              throw new Error('線上 GAS 尚未發布包含 update_equipment_images 的新版本，請至 GAS 管理部署建立新版本！');
            }
            throw new Error(text.slice(0, 120) || '相片上傳伺服器回應異常');
          }

          if (result.status === 'success') {
            const uploadedUrls: string[] = result.images || (result.imageUrl ? result.imageUrl.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
            if (uploadedUrls.length > 0) {
              finalImages = uploadedUrls;
            }
          } else {
            throw new Error(result.message || '相片上傳 Google Drive 失敗');
          }
        } catch (uploadErr: any) {
          const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          setErrorMessage(`[相片上傳失敗]: ${msg}`);
          setIsProcessing(false);
          setIsUploadingPhoto(false);
          return;
        } finally {
          setIsUploadingPhoto(false);
        }
      }

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
          notes: formState.notes,
          images: finalImages
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
          notes: formState.notes,
          images: finalImages
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
            boxSizing: 'border-box',
            textAlign: 'left'
          }}>
            {/* 1:1 正方形相片輪播與管理區 (比照 Borrow 頁面風格，強制 flexShrink: 0 確保 1:1 正方形不被擠壓) */}
            <div
              className="detail-modal-image-wrapper"
              onTouchStart={handleCarouselTouchStart}
              onTouchMove={handleCarouselTouchMove}
              onTouchEnd={handleCarouselTouchEnd}
              onMouseDown={handleCarouselMouseDown}
              onMouseMove={handleCarouselMouseMove}
              onMouseUp={handleCarouselMouseUp}
              onMouseLeave={handleCarouselMouseUp}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#f8fafc',
                flexShrink: 0,
                display: 'block',
                boxSizing: 'border-box',
                marginBottom: '14px',
                border: formState.images.length === 0 ? '2px dashed #cbd5e1' : '1px solid #e2e8f0'
              }}
            >
              {/* 裝備代號懸浮膠囊 (左上角) */}
              {formState.id && (
                <span className="equipment-code-capsule">
                  裝備代號：{formState.id}
                </span>
              )}

              {/* 關閉按鈕 (右上角) */}
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isProcessing}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 16,
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(6px)',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="關閉"
              >
                <X size={18} />
              </button>

              {/* 當前相片展示或無相片時之大尺寸上傳虛線卡片 */}
              {formState.images.length > 0 ? (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
                  <div
                    className={`photo-carousel-track ${isDragging ? 'dragging' : ''}`}
                    style={{
                      transform: `translateX(calc(-${activePhotoIdx * 100}% + ${dragOffset}px))`
                    }}
                  >
                    {formState.images.map((imgUrl, idx) => (
                      <div key={idx} className="photo-carousel-slide">
                        <img
                          src={getDirectImageUrl(imgUrl) || imgUrl}
                          alt={`${formState.name} ${idx + 1}`}
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                            userSelect: 'none'
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* 中央底部白色小圓點（頁碼指示） */}
                  {formState.images.length > 1 && (
                    <div
                      className="photo-carousel-dots"
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                        zIndex: 10
                      }}
                    >
                      {formState.images.map((_, idx) => (
                        <span
                          key={idx}
                          className={`carousel-dot ${idx === activePhotoIdx ? 'active' : ''}`}
                          onClick={() => setActivePhotoIdx(idx)}
                          style={{
                            width: idx === activePhotoIdx ? '8px' : '6px',
                            height: idx === activePhotoIdx ? '8px' : '6px',
                            borderRadius: '50%',
                            backgroundColor: idx === activePhotoIdx ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '20px',
                    boxSizing: 'border-box',
                    textAlign: 'center'
                  }}
                >
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb'
                  }}>
                    <Camera size={32} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                      點擊此處上傳裝備相片
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      支援相機拍照或相簿選取 (最多 5 張)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 20px',
                      borderRadius: '20px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)'
                    }}
                  >
                    <Plus size={16} />
                    <span>選擇相片</span>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: 'none' }}
              />
            </div>



            {/* 專屬相片管理列與縮圖預覽列 */}
            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  裝備相片清單 ({formState.images.length}/5 張)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {formState.images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(activePhotoIdx)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={13} />
                      <span>刪除當前照片</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 縮圖列表 */}
              <div className="photo-thumbnail-strip" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {formState.images.map((imgUrl, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActivePhotoIdx(idx)}
                    style={{
                      position: 'relative',
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: idx === activePhotoIdx ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <img
                      src={getDirectImageUrl(imgUrl) || imgUrl}
                      alt={`相片 ${idx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePhoto(idx);
                      }}
                      title="刪除此相片"
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {formState.images.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      border: '1.5px dashed #cbd5e1',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b',
                      fontSize: '11px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      gap: '2px'
                    }}
                  >
                    <Plus size={16} />
                    <span>新增</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px', textAlign: 'left' }}>
              {/* 裝備名稱 */}
              <div style={{ textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>裝備名稱 *</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：MSR 雙人帳篷"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                />
              </div>

              {/* 分類與是否開放外借 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left' }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>裝備分類</label>
                  <select
                    value={formState.category}
                    onChange={e => setFormState(prev => ({ ...prev, category: e.target.value as any }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', textAlign: 'left' }}>開放外借借用</label>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left' }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>總庫存量</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.total_qty}
                    onChange={e => setFormState(prev => ({ ...prev, total_qty: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                  />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>目前可借數量</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.available_qty}
                    onChange={e => setFormState(prev => ({ ...prev, available_qty: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                  />
                </div>
              </div>

              {/* 租金計費 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'left' }}>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>2天基本租金 (元)</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.price_2day}
                    onChange={e => setFormState(prev => ({ ...prev, price_2day: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                  />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>續租每日加成 (元)</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.price_extra_day}
                    onChange={e => setFormState(prev => ({ ...prev, price_extra_day: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
                  />
                </div>
              </div>

              {/* 備註 (規格、注意事項合併為備註) */}
              <div style={{ textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px', textAlign: 'left' }}>
                  備註
                </label>
                <textarea
                  rows={3}
                  value={formState.notes}
                  onChange={e => setFormState(prev => ({ ...prev, notes: e.target.value, specs: e.target.value }))}
                  placeholder="填寫規格描述、尺寸、材質、保養與注意事項等備註..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', textAlign: 'left' }}
                />
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
                {isUploadingPhoto ? '相片上傳雲端中...' : (isProcessing ? '儲存中...' : (isAddMode ? '確認新增裝備' : '確認儲存修改'))}
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

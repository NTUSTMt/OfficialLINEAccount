import { useState, useEffect, useMemo, useRef } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { Tent, Moon, Package, Compass, Flame, Shield, Mountain, ShoppingCart, RotateCw, Trash2, Camera, Plus, X, Save } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { getDirectImageUrl } from '../utils/image';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import '../App.css';

// ==========================================
// 1. 型別定義 (Type Definitions)
// ==========================================
interface Equipment {
  id: string;
  name: string;
  remainQty: number;
  price: number;
  priceExtra: number;
  imageUrl?: string;
  description?: string;
}

interface FormState {
  pickupDate: string;
  returnDate: string;
  purpose: string;
  otherPurpose?: string;
  cart: Record<string, number>; // 動態的 Key-Value，例如 { 'E01': 2 }
}

interface ApiResponse {
  status: string;
  data: Equipment[];
  message?: string;
}


// 根據商品名稱智慧比對並產生對應的圖示
function ProductImage({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const [hasError, setHasError] = useState(false);

  // 取第一個網址
  const firstUrl = useMemo(() => {
    if (!imageUrl) return undefined;
    return imageUrl.split(/[\n,，;\s]+/).map(u => u.trim()).find(u => u.startsWith('http'));
  }, [imageUrl]);

  const directUrl = useMemo(() => {
    return getDirectImageUrl(firstUrl, 400);
  }, [firstUrl]);

  useEffect(() => {
    setHasError(false);
  }, [imageUrl]);

  if (directUrl && !hasError) {
    return (
      <div className="product-img-container">
        <img
          src={directUrl}
          alt={name}
          className="product-img-real"
          loading="lazy"
          onError={() => setHasError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  const lowercaseName = name.toLowerCase();
  let icon = <Mountain size={36} color="#64748b" />;
  let bgClass = 'bg-default';

  // 帳篷
  if (lowercaseName.includes('帳') || lowercaseName.includes('tent')) {
    icon = <Tent size={36} color="#059669" />;
    bgClass = 'bg-tent';
  }
  // 睡墊/睡袋
  else if (lowercaseName.includes('墊') || lowercaseName.includes('袋') || lowercaseName.includes('pad') || lowercaseName.includes('sleeping')) {
    icon = <Moon size={36} color="#4f46e5" />;
    bgClass = 'bg-pad';
  }
  // 背包
  else if (lowercaseName.includes('包') || lowercaseName.includes('pack')) {
    icon = <Package size={36} color="#0891b2" />;
    bgClass = 'bg-pack';
  }
  // 登山杖
  else if (lowercaseName.includes('杖') || lowercaseName.includes('pole') || lowercaseName.includes('stick')) {
    icon = <Compass size={36} color="#d97706" />;
    bgClass = 'bg-pole';
  }
  // 鋼盆/炊具/爐
  else if (lowercaseName.includes('盆') || lowercaseName.includes('鍋') || lowercaseName.includes('爐') || lowercaseName.includes('cook') || lowercaseName.includes('stove')) {
    icon = <Flame size={36} color="#dc2626" />;
    bgClass = 'bg-bowl';
  }
  // 頭盔/岩盔/吊帶/攀登
  else if (lowercaseName.includes('盔') || lowercaseName.includes('吊帶') || lowercaseName.includes('繩') || lowercaseName.includes('harness') || lowercaseName.includes('helmet')) {
    icon = <Shield size={36} color="#7c3aed" />;
    bgClass = 'bg-default';
  }

  return (
    <div className={`product-img-container ${bgClass}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </div>
  );
}

function Borrow({ userId, isOfficer = false }: { userId: string; isOfficer?: boolean }) {
  const { t, i18n } = useTranslation();
  // ==========================================
  // 2. 狀態管理 (State Management)
  // ==========================================
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

  // 幹部身分狀態
  const [officerStatus, setOfficerStatus] = useState<boolean>(isOfficer);

  useEffect(() => {
    setOfficerStatus(isOfficer);
  }, [isOfficer]);

  useEffect(() => {
    if (!officerStatus && userId) {
      try {
        const cached = localStorage.getItem('officer_status_cache');
        if (cached !== null) {
          setOfficerStatus(JSON.parse(cached));
        }
      } catch (e) { }
    }
  }, [userId, officerStatus]);

  // 裝備詳細彈窗狀態
  const [modalPhotos, setModalPhotos] = useState<Array<{ url: string; isNew?: boolean; fileObj?: { base64: string; name: string } }>>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [modalQty, setModalQty] = useState<number>(0);
  const [isSavingPhotos, setIsSavingPhotos] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 照片輪播滑動手勢狀態
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef<boolean>(false);

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    if (modalPhotos.length <= 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || modalPhotos.length <= 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === modalPhotos.length - 1 && dx < 0)) {
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
      if (dragOffset < 0 && activePhotoIdx < modalPhotos.length - 1) {
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
    if (modalPhotos.length <= 1) return;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselMouseMove = (e: React.MouseEvent) => {
    if (!touchStartPos.current || !isDragging || modalPhotos.length <= 1) return;
    const dx = e.clientX - touchStartPos.current.x;
    if (Math.abs(dx) > 5) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === modalPhotos.length - 1 && dx < 0)) {
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

  // Lightbox 觸控滑動手勢
  const lbTouchStart = useRef<number | null>(null);
  const handleLbTouchStart = (e: React.TouchEvent) => {
    lbTouchStart.current = e.touches[0].clientX;
  };
  const handleLbTouchEnd = (e: React.TouchEvent) => {
    if (lbTouchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - lbTouchStart.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && activePhotoIdx < modalPhotos.length - 1) {
        setActivePhotoIdx(prev => prev + 1);
      } else if (dx > 0 && activePhotoIdx > 0) {
        setActivePhotoIdx(prev => prev - 1);
      }
    }
    lbTouchStart.current = null;
  };

  const CACHE_KEY_EQUIPMENTS = 'borrow_equipments_list';
  const CACHE_KEY_OFFICIAL = 'user_is_official_';

  const getPurposeText = (purpose: string) => {
    if (purpose === '社團出隊') return t('borrow.drawer.purposeClub');
    if (purpose === '個人使用') return t('borrow.drawer.purposePersonal');
    if (purpose === '其他用途') return t('borrow.drawer.purposeOther');
    return purpose;
  };

  const [form, setForm] = useState<FormState>({
    pickupDate: '',
    returnDate: '',
    purpose: '社團出隊',
    otherPurpose: '',
    cart: {}
  });

  // 替換成你剛剛重新部署的 GAS 網頁應用程式 URL
  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

  // ==========================================
  // 3. 初始化與資料獲取 (Initialization & SWR Caching)
  // ==========================================
  const fetchData = async (forceRefresh: boolean = false) => {
    // 1. 若非強制重新整理，先讀取快取秒開呈現
    if (!forceRefresh) {
      const cachedEquips = getCache<Equipment[]>(CACHE_KEY_EQUIPMENTS);
      if (cachedEquips && cachedEquips.length > 0) {
        setEquipments(cachedEquips);
        setLoading(false);
      }
      if (userId) {
        const cachedOfficial = getCache<boolean>(CACHE_KEY_OFFICIAL + userId);
        if (cachedOfficial !== null) {
          setIsOfficial(cachedOfficial);
        }
      }
    } else {
      setIsRefreshing(true);
      removeCache(CACHE_KEY_EQUIPMENTS);
    }

    try {
      // 2. 優先非同步發起裝備清單獲取（取得後立即渲染畫面，不阻擋使用者）
      const equipPromise = fetch(GAS_API_URL, { redirect: 'follow' })
        .then(async (response) => {
          const resData: ApiResponse = await response.json();
          if (resData.status === 'success' && Array.isArray(resData.data)) {
            setEquipments(resData.data);
            setCache(CACHE_KEY_EQUIPMENTS, resData.data, 300); // 快取 5 分鐘
          }
        })
        .catch((err) => {
          console.error('裝備清單載入失敗:', err);
        })
        .finally(() => {
          setLoading(false);
        });

      // 3. 同步背景非同步獲取社員折扣身分（不卡住主畫面展示）
      const statusPromise = (async () => {
        if (userId && userId !== 'TEST_USER_ID') {
          try {
            const myStatusRes = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_my_status&userId=${userId}`));
            const myStatusData = await myStatusRes.json();
            if (myStatusData.status === 'success' && myStatusData.data && myStatusData.data.profile) {
              const official = Boolean(myStatusData.data.profile.isOfficial);
              setIsOfficial(official);
              setCache(CACHE_KEY_OFFICIAL + userId, official, 600); // 快取 10 分鐘
            }
          } catch (err) {
            console.error('社員身分載入失敗:', err);
          }
        } else {
          // 本地測試帳號預設為正式社員
          setIsOfficial(true);
        }
      })();

      await Promise.allSettled([equipPromise, statusPromise]);
    } catch (error) {
      console.error('裝備清單或社員狀態載入失敗:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(false);
  }, [userId]);

  // ==========================================
  // 4. 核心邏輯處理 (Handlers)
  // ==========================================

  // 購物車數量增減
  const updateCart = (equipId: string, delta: number, maxQty: number) => {
    setForm(prevForm => {
      const currentQty = prevForm.cart[equipId] || 0;
      const newQty = currentQty + delta;
      const newCart = { ...prevForm.cart };

      if (newQty <= 0) {
        delete newCart[equipId];
      } else if (newQty <= maxQty) {
        newCart[equipId] = newQty;
      }

      return { ...prevForm, cart: newCart };
    });
  };

  // 開啟裝備詳細彈窗
  const openDetailModal = (equip: Equipment) => {
    setSelectedEquipment(equip);
    const urls = equip.imageUrl
      ? equip.imageUrl.split(/[\n,，;\s]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
      : [];
    setModalPhotos(urls.map(u => ({ url: u })));
    setActivePhotoIdx(0);
    setIsEditMode(false);
    setIsLightboxOpen(false);
    setModalQty(form.cart[equip.id] || 0);
  };

  // 刪除當前照片 (僅在編輯模式，具備防呆確認與安全索引校正)
  const handleDeleteCurrentPhoto = () => {
    if (modalPhotos.length === 0) return;
    const isLast = modalPhotos.length === 1;
    const confirmMsg = isLast
      ? t('borrow.modal.confirmDeleteLastPhoto')
      : t('borrow.modal.confirmDeletePhoto');
    if (!window.confirm(confirmMsg)) return;

    const nextPhotos = modalPhotos.filter((_, i) => i !== activePhotoIdx);
    setModalPhotos(nextPhotos);
    const nextIdx = Math.max(0, Math.min(activePhotoIdx, nextPhotos.length - 1));
    setActivePhotoIdx(nextIdx);
  };

  // 上傳新照片 (壓縮並暫存於待儲存清單)
  const handleUploadNewPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (modalPhotos.length >= 5) {
      alert(t('borrow.modal.maxPhotosReached'));
      e.target.value = '';
      return;
    }
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
        const base64 = canvas.toDataURL('image/jpeg', 0.75);
        setModalPhotos(prev => {
          const next = [...prev, { url: base64, isNew: true, fileObj: { base64, name: file.name } }];
          setActivePhotoIdx(next.length - 1);
          return next;
        });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 批次儲存照片至後端與試算表
  const handleSavePhotos = async () => {
    if (!selectedEquipment) return;
    const keptUrls = modalPhotos.filter(p => !p.isNew).map(p => p.url);
    const newPhotoFiles = modalPhotos.filter(p => p.isNew && p.fileObj).map(p => p.fileObj);

    if (keptUrls.length === 0 && newPhotoFiles.length === 0) {
      if (!window.confirm(t('borrow.modal.confirmSaveEmptyPhotos'))) {
        return;
      }
    }

    setIsSavingPhotos(true);
    try {
      const res = await fetch(appendAuthToken(GAS_API_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(withAuthPayload({
          action: 'update_equipment_images',
          equipId: selectedEquipment.id,
          equipName: selectedEquipment.name,
          keptUrls,
          newPhotoFiles,
          userId
        }))
      });
      const data = await res.json();
      if (data.status === 'success') {
        const newImgUrl = data.imageUrl || '';
        setSelectedEquipment(prev => prev ? { ...prev, imageUrl: newImgUrl } : null);
        setEquipments(prev => prev.map(eq => eq.id === selectedEquipment.id ? { ...eq, imageUrl: newImgUrl } : eq));
        const cached = getCache<Equipment[]>(CACHE_KEY_EQUIPMENTS);
        if (cached) {
          setCache(CACHE_KEY_EQUIPMENTS, cached.map(eq => eq.id === selectedEquipment.id ? { ...eq, imageUrl: newImgUrl } : eq), 300);
        }
        const updatedUrls = newImgUrl.split(/[\n,，;\s]+/).map((u: string) => u.trim()).filter((u: string) => u.startsWith('http'));
        setModalPhotos(updatedUrls.map((u: string) => ({ url: u })));
        setActivePhotoIdx(0); // 強制重置輪播索引至 0，杜絕超出邊界白畫面
        setIsEditMode(false);
        alert(t('borrow.modal.photoSaveSuccess'));
      } else {
        alert(data.message || t('borrow.modal.photoSaveFailed'));
      }
    } catch (err) {
      console.error('儲存裝備照片失敗:', err);
      alert(t('borrow.modal.photoSaveFailed'));
    } finally {
      setIsSavingPhotos(false);
    }
  };

  // 取消照片編輯
  const handleCancelPhotoEdit = () => {
    if (!selectedEquipment) return;
    const urls = selectedEquipment.imageUrl
      ? selectedEquipment.imageUrl.split(/[\n,，;\s]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
      : [];
    setModalPhotos(urls.map(u => ({ url: u })));
    setActivePhotoIdx(0);
    setIsEditMode(false);
  };

  // 計算已選裝備總數
  const totalItems = useMemo(() => {
    return Object.values(form.cart).reduce((sum, qty) => sum + qty, 0);
  }, [form.cart]);

  // 計算今日日期字串 YYYY-MM-DD
  const todayStr = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // 計算天數的輔助函式 (防呆：若歸還日早於領取日則至少回傳 1 天)
  const rentalDays = useMemo(() => {
    if (!form.pickupDate || !form.returnDate) return 2;
    const start = new Date(form.pickupDate);
    const end = new Date(form.returnDate);
    if (end < start) return 1;
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1; // 同日借還算 1 天
  }, [form.pickupDate, form.returnDate]);

  // 計算基本費用 (原價總計)
  const basePrice = useMemo(() => {
    return Object.entries(form.cart).reduce((sum, [id, qty]) => {
      const equip = equipments.find(item => item.id === id);
      if (!equip) return sum;
      const extraDays = Math.max(0, rentalDays - 2);
      const itemPrice = equip.price + extraDays * (equip.priceExtra || 0);
      return sum + (itemPrice * qty);
    }, 0);
  }, [form.cart, equipments, rentalDays]);

  // 計算個人使用時的費用 (如果是正式社員打 5 折)
  const personalPrice = useMemo(() => {
    return isOfficial ? Math.round(basePrice * 0.5) : basePrice;
  }, [basePrice, isOfficial]);

  // 計算最後預估總租金 (配合用途，社團出隊免費 $0)
  const totalPrice = useMemo(() => {
    if (form.purpose === '社團出隊') {
      return 0;
    }
    return personalPrice;
  }, [form.purpose, personalPrice]);

  // 產生試算公式字串
  const formulaString = useMemo(() => {
    const parts = Object.entries(form.cart).map(([id, qty]) => {
      const equip = equipments.find(item => item.id === id);
      if (!equip) return '';
      const extraDays = Math.max(0, rentalDays - 2);
      return `($${equip.price} + $${equip.priceExtra || 0} × ${extraDays}${t('borrow.formula.daysUnit')}) × ${qty}${t('borrow.formula.itemsUnit')}`;
    }).filter(Boolean);

    if (parts.length === 0) return '';

    const baseFormula = parts.join(' + ');
    if (form.purpose === '社團出隊') {
      return `(${baseFormula}) × 0 (${t('borrow.formula.freeClub')})`;
    }
    if (isOfficial) {
      return `(${baseFormula}) × 0.5 (${t('borrow.formula.discountMember')})`;
    }
    return baseFormula;
  }, [form.cart, equipments, rentalDays, form.purpose, isOfficial, t]);

  // 處理表單輸入 (防呆：若新領取日晚於現有歸還日，自動將歸還日同步)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: value };
      if (name === 'pickupDate' && prev.returnDate && prev.returnDate < value) {
        updated.returnDate = value;
      }
      return updated;
    });
  };

  // 送出表單
  const submitForm = async () => {
    if (totalItems === 0) return alert(t('borrow.alert.emptyCart'));
    if (!form.pickupDate || !form.returnDate) return alert(t('borrow.alert.noDates'));
    if (form.purpose === '其他用途' && !form.otherPurpose?.trim()) {
      return alert(t('borrow.alert.noOtherPurpose'));
    }

    const orderPayload = {
      action: 'submit_multi_loan',
      userId: userId,
      details: form
    };

    console.log('準備送出的資料:', orderPayload);

    setIsSubmittingOrder(true);
    // 使用 fetch POST 將資料打回給 GAS
    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(withAuthPayload(orderPayload))
      });

      const result = await response.json();
      if (result.status !== 'success') {
        alert(t('borrow.alert.systemError', { message: result.message }));
        return;
      }
      // 送出預約成功後清除裝備快取，關閉明細抽屜並清空租借車和預訂單
      removeCache(CACHE_KEY_EQUIPMENTS);
      setIsCartOpen(false);
      setForm({
        cart: {},
        pickupDate: '',
        returnDate: '',
        purpose: '社團出隊',
        otherPurpose: ''
      });

      // 2. 在 LINE 聊天室印出確認訊息 (非阻塞發話，避免 iOS LIFF 掛起)
      if (liff.isInClient()) {
        Promise.race([
          liff.sendMessages([{
            type: 'text',
            text: t('borrow.alert.submitSuccess', { count: totalItems })
          }]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
        ]).catch(liffErr => {
          console.warn('liff.sendMessages 略過 (逾時或未開通發話權限):', liffErr);
        }).finally(() => {
          try {
            liff.closeWindow();
          } catch (e) {
            console.warn('liff.closeWindow 略過:', e);
          }
        });
      } else {
        alert(t('borrow.alert.submitSuccessBrowser'));
      }
    } catch (error) {
      console.error('API 請求失敗:', error);
      alert(t('borrow.alert.networkError'));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // ==========================================
  // 5. 畫面渲染 (Render)
  // ==========================================
  return (
    <div className="app-container">


      {/* 費用試算說明 Banner */}
      <div className="promo-banner pricing-banner">
        <div className="banner-content">
          <h2 className="pricing-title">{t('borrow.banner.title')}</h2>

          <div className="pricing-rules">
            <div className="pricing-rule-item">
              <span className="rule-label">{t('borrow.banner.ruleOfficialActive')}</span>
              <span className="rule-value">{t('borrow.banner.free')}</span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">{t('borrow.banner.ruleNonOfficialActive')}</span>
              <span className="rule-value">{t('borrow.banner.free')}</span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">{t('borrow.banner.ruleOfficialPersonal')}</span>
              <span className="rule-value"><span>{t('borrow.banner.discount')}</span></span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">{t('borrow.banner.ruleNonOfficialPersonal')}</span>
              <span className="rule-value">{t('borrow.banner.fullPrice')}</span>
            </div>
          </div>

          <div className="pricing-notes">
            <p>{t('borrow.banner.noteBasicUnit')}</p>
            <p>{t('borrow.banner.noteExtraDay')}</p>
            <p>{t('borrow.banner.noteConflict')}</p>
          </div>
        </div>
      </div>

      {/* 主要內容區 */}
      <main className="main-content">
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2>{t('borrow.grid.title')}</h2>
            <span className="products-count">{t('borrow.grid.count', { count: equipments.length })}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isRefreshing || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '20px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#475569',
              cursor: (isRefreshing || loading) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
            }}
            title={t('borrow.grid.refresh', '重新整理')}
          >
            <RotateCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>{isRefreshing ? t('borrow.grid.refreshing', '更新中...') : t('borrow.grid.refresh', '重新整理')}</span>
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{t('borrow.grid.loading')}</p>
          </div>
        ) : (
          <div className="products-grid">
            {equipments.map(item => {
              const currentQty = form.cart[item.id] || 0;
              const isOutOfStock = item.remainQty <= 0;

              return (
                <div key={item.id} className={`product-card ${currentQty > 0 ? 'selected' : ''}`} onClick={() => openDetailModal(item)} style={{ cursor: 'pointer' }}>
                  <ProductImage name={item.name} imageUrl={item.imageUrl} />

                  <div className="product-info">
                    <h3 className="product-name">{item.name}</h3>

                    <div className="product-status">
                      {isOutOfStock ? (
                        <span className="status-badge out-of-stock">{t('borrow.card.outOfStock')}</span>
                      ) : item.remainQty <= 2 ? (
                        <span className="status-badge low-stock">{t('borrow.card.lowStock', { count: item.remainQty })}</span>
                      ) : (
                        <span className="status-badge in-stock">{t('borrow.card.inStock', { count: item.remainQty })}</span>
                      )}
                    </div>

                    <div className="product-price-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span className="price-label" style={{ margin: 0 }}>{t('borrow.card.rent2Days')}</span>
                        <span className="price-value" style={{ fontSize: '15px' }}>${item.price}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>{t('borrow.card.rentExtraDay')}</span>
                        <span>+${item.priceExtra || 0}</span>
                      </div>
                    </div>

                    <div className="product-actions">
                      {currentQty === 0 ? (
                        <button
                          className="add-to-cart-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCart(item.id, 1, item.remainQty);
                          }}
                          disabled={isOutOfStock}
                        >
                          {isOutOfStock ? t('borrow.card.unavailable') : t('borrow.card.addToCart')}
                        </button>
                      ) : (
                        <div className="quantity-controller" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="qty-btn"
                            onClick={() => updateCart(item.id, -1, item.remainQty)}
                          >
                            -
                          </button>
                          <span className="qty-number">{currentQty}</span>
                          <button
                            className="qty-btn"
                            onClick={() => updateCart(item.id, 1, item.remainQty)}
                            disabled={currentQty >= item.remainQty}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 底部浮動購物條 */}
      {totalItems > 0 && !isCartOpen && (
        <div className="floating-cart-bar" onClick={() => setIsCartOpen(true)}>
          <div className="floating-cart-info">
            <span className="floating-badge">{totalItems}</span>
            <div className="floating-price-desc" style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', color: 'white' }}>
                <span className="floating-total-label" style={{ fontSize: '11px', opacity: 0.8 }}>{t('borrow.floating.basicLabel')}</span>
                <span className="floating-price" style={{ fontSize: '14px', fontWeight: 'bold' }}>${basePrice}</span>
                <span style={{ opacity: 0.3, fontSize: '11px' }}>|</span>
                <span className="floating-total-label" style={{ fontSize: '11px', opacity: 0.8 }}>{t('borrow.floating.personalLabel')}</span>
                <span className="floating-price" style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>${personalPrice}</span>
              </div>
              {!isOfficial && (
                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'normal' }}>
                  {t('borrow.floating.memberTip')}
                </span>
              )}
            </div>
          </div>
          <button className="floating-checkout-btn">
            {t('borrow.floating.nextBtn')}
          </button>
        </div>
      )}

      {/* 購物車與結帳抽屜 */}
      <div className={`cart-drawer-overlay ${isCartOpen ? 'open' : ''}`}>
        {/* 背景遮罩：點擊關閉抽屜 */}
        <div className="drawer-backdrop" onClick={() => setIsCartOpen(false)}></div>

        {/* 抽屜主體 */}
        <div className="cart-drawer">
          <div className="drawer-header">
            <h3>{t('borrow.drawer.title')}</h3>
            <button className="close-drawer-btn" onClick={() => setIsCartOpen(false)}>&times;</button>
          </div>

          <div className="drawer-content">
            {totalItems === 0 ? (
              <div className="empty-cart-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <ShoppingCart size={32} color="#94a3b8" />
                </div>
                <p>{t('borrow.drawer.emptyText')}</p>
                <button className="start-rent-btn" onClick={() => setIsCartOpen(false)}>{t('borrow.drawer.startBrowsing')}</button>
              </div>
            ) : (
              <>
                {/* 預訂商品清單 */}
                <div className="drawer-section">
                  <h4 className="section-subtitle">{t('borrow.drawer.selectedItems')}</h4>
                  <div className="cart-items-list">
                    {Object.entries(form.cart).map(([id, qty]) => {
                      const item = equipments.find(e => e.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="cart-item-row">
                          <div className="cart-item-desc">
                            <span className="cart-item-name">{item.name}</span>
                            <span className="cart-item-price" style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {t('borrow.drawer.formulaLabel')}(${item.price} + ${item.priceExtra || 0} × {Math.max(0, rentalDays - 2)}{t('borrow.drawer.daysUnit')}) × {qty}{t('borrow.drawer.itemsUnit')} =
                              <strong style={{ color: 'var(--text-primary)', marginLeft: '4px' }}>
                                ${(item.price + Math.max(0, rentalDays - 2) * (item.priceExtra || 0)) * qty}
                              </strong>
                              {form.purpose === '社團出隊' ? t('borrow.drawer.freeClub') : isOfficial ? t('borrow.drawer.discountMember') : ''}
                            </span>
                          </div>
                          <div className="cart-item-controls">
                            <button onClick={() => updateCart(id, -1, item.remainQty)}>-</button>
                            <span className="cart-item-qty">{qty}</span>
                            <button
                              onClick={() => updateCart(id, 1, item.remainQty)}
                              disabled={qty >= item.remainQty}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 租期選擇 */}
                <div className="drawer-section">
                  <h4 className="section-subtitle">{t('borrow.drawer.detailsTitle')}</h4>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="pickupDate">{t('borrow.drawer.pickupDate')}</label>
                      <input
                        type="date"
                        id="pickupDate"
                        name="pickupDate"
                        value={form.pickupDate}
                        min={todayStr}
                        onChange={handleInputChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="returnDate">{t('borrow.drawer.returnDate')}</label>
                      <input
                        type="date"
                        id="returnDate"
                        name="returnDate"
                        value={form.returnDate}
                        min={form.pickupDate || todayStr}
                        onChange={handleInputChange}
                        required
                      />
                    </div>

                    {form.pickupDate && form.returnDate && (
                      <div className="form-group full-width animate-fade-in" style={{ marginTop: '-4px' }}>
                        <div style={{
                          padding: '8px 12px',
                          backgroundColor: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '8px',
                          color: '#1d4ed8',
                          fontSize: '13px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <span>
                            {rentalDays > 2
                              ? t('borrow.drawer.durationBadge', { days: rentalDays, extra: rentalDays - 2 })
                              : t('borrow.drawer.durationBaseOnly', { days: rentalDays })}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="form-group full-width">
                      <label htmlFor="purpose">{t('borrow.drawer.purpose')}</label>
                      <select
                        id="purpose"
                        name="purpose"
                        value={form.purpose}
                        onChange={handleInputChange}
                        className="custom-select"
                      >
                        <option value="社團出隊">{t('borrow.drawer.purposeClub')}</option>
                        <option value="個人使用">{t('borrow.drawer.purposePersonal')}</option>
                        <option value="其他用途">{t('borrow.drawer.purposeOther')}</option>
                      </select>
                    </div>

                    {form.purpose === '其他用途' && (
                      <div className="form-group full-width animate-fade-in">
                        <label htmlFor="otherPurpose">{t('borrow.drawer.otherPurposeLabel')}</label>
                        <input
                          type="text"
                          id="otherPurpose"
                          name="otherPurpose"
                          value={form.otherPurpose || ''}
                          onChange={handleInputChange}
                          placeholder={t('borrow.drawer.otherPurposePlaceholder')}
                          required
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            boxSizing: 'border-box',
                            fontSize: '14px',
                            marginTop: '4px'
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 費用總計 */}
                <div className="checkout-summary">
                  <div className="summary-row">
                    <span>{t('borrow.drawer.rentalDays')}</span>
                    <span>{rentalDays} {t('borrow.drawer.daysUnit')}</span>
                  </div>
                  <div className="summary-row">
                    <span>{t('borrow.drawer.totalItems')}</span>
                    <span>共 {totalItems} {t('borrow.drawer.itemsUnit')}</span>
                  </div>
                  <div className="summary-row">
                    <span>{t('borrow.drawer.basePriceTotal')}</span>
                    <span>${basePrice}</span>
                  </div>
                  <div className="summary-row">
                    <span>{t('borrow.drawer.personalPriceTotal')}</span>
                    <span>
                      ${personalPrice}
                      {isOfficial ? t('borrow.drawer.discountMemberApplied') : t('borrow.drawer.fullPriceApplied')}
                    </span>
                  </div>
                  {!isOfficial && (
                    <div className="summary-row" style={{ fontSize: '11px', color: '#f59e0b', justifyContent: 'flex-end', marginTop: '-4px', fontWeight: 'bold' }}>
                      <span>{t('borrow.floating.memberTip')}</span>
                    </div>
                  )}
                  <div className="summary-row total-row" style={{ borderBottom: formulaString ? 'none' : '1px solid var(--border-color)', paddingBottom: formulaString ? '0' : '8px', marginTop: '8px' }}>
                    <span>{t('borrow.drawer.estimatedTotal', { purpose: getPurposeText(form.purpose) })}</span>
                    <span className="total-highlight">${totalPrice}</span>
                  </div>
                  {formulaString && (
                    <div className="summary-row" style={{ fontSize: '11px', color: 'var(--text-muted)', justifyContent: 'flex-end', marginTop: '2px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <span>{t('borrow.drawer.trialLabel')}{formulaString} = ${totalPrice}</span>
                    </div>
                  )}
                  <p className="summary-tip">{t('borrow.drawer.summaryTip')}</p>
                </div>
              </>
            )}
          </div>

          {totalItems > 0 && (
            <div className="drawer-footer">
              <button
                className="submit-checkout-btn"
                onClick={submitForm}
                disabled={isSubmittingOrder || totalItems === 0 || !form.pickupDate || !form.returnDate}
              >
                {isSubmittingOrder
                  ? (i18n.language === 'en' ? 'Submitting...' : '送出預約中...')
                  : t('borrow.drawer.submitBtn', { price: totalPrice })}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 裝備詳細資訊彈窗 (無頂欄簡約設計、1:1 正方形相片輪播與幹部管理) */}
      {selectedEquipment && (
        <div className="detail-modal-overlay" onClick={() => !isSavingPhotos && setSelectedEquipment(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()} style={{ paddingTop: '16px' }}>
            <div className="detail-modal-content">
              {/* 1:1 正方形相片輪播區 */}
              <div
                className="detail-modal-image-wrapper"
                onTouchStart={handleCarouselTouchStart}
                onTouchMove={handleCarouselTouchMove}
                onTouchEnd={handleCarouselTouchEnd}
                onMouseDown={handleCarouselMouseDown}
                onMouseMove={handleCarouselMouseMove}
                onMouseUp={handleCarouselMouseUp}
                onMouseLeave={handleCarouselMouseUp}
              >
                {/* 裝備代號懸浮膠囊 */}
                {selectedEquipment.id && (
                  <span className="equipment-code-capsule">
                    {t('borrow.modal.codeLabel')}{selectedEquipment.id}
                  </span>
                )}

                {modalPhotos.length > 0 ? (
                  <div
                    className={`photo-carousel-track ${isDragging ? 'dragging' : ''}`}
                    style={{
                      transform: `translateX(calc(-${activePhotoIdx * 100}% + ${dragOffset}px))`,
                    }}
                  >
                    {modalPhotos.map((photo, idx) => (
                      <div key={idx} className="photo-carousel-slide">
                        <img
                          src={getDirectImageUrl(photo.url, 1000) || photo.url}
                          alt={`${selectedEquipment.name} ${idx + 1}`}
                          draggable={false}
                          onClick={() => {
                            if (!isEditMode && !didDrag.current) {
                              setIsLightboxOpen(true);
                            }
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                            cursor: isEditMode ? 'default' : 'zoom-in',
                            userSelect: 'none',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ProductImage name={selectedEquipment.name} imageUrl="" />
                )}

                {/* 編輯模式：當前照片右上角刪除按鈕 */}
                {isEditMode && modalPhotos.length > 0 && (
                  <button
                    type="button"
                    className="photo-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCurrentPhoto();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    title={t('borrow.modal.deletePhoto')}
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* 中央底部小圓點（頁碼指示） */}
                {(modalPhotos.length > 1 || (isEditMode && modalPhotos.length < 5)) && (
                  <div className="photo-carousel-dots">
                    {modalPhotos.map((_, idx) => (
                      <span
                        key={idx}
                        className={`carousel-dot ${idx === activePhotoIdx ? 'active' : ''}`}
                        onClick={() => setActivePhotoIdx(idx)}
                      />
                    ))}
                    {/* 編輯模式：圓點旁的新增照片按鈕 */}
                    {isEditMode && modalPhotos.length < 5 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title={t('borrow.modal.uploadPhoto')}
                        style={{
                          background: '#10b981',
                          border: 'none',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          cursor: 'pointer',
                          marginLeft: '4px'
                        }}
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleUploadNewPhoto}
                />
              </div>
              
              <div className="detail-modal-body">
                <h2 className="detail-modal-title">{selectedEquipment.name}</h2>

                <div className="detail-modal-section">
                  <div className="detail-price-list" style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '12px 0 16px 0', alignItems: 'flex-end', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.2' }}>
                      <span style={{ fontSize: '13px', color: '#64748b' }}>{t('borrow.modal.basePrice')}</span>
                      <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>${selectedEquipment.price}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.2' }}>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{t('borrow.modal.extraPrice')}</span>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#64748b' }}>+${selectedEquipment.priceExtra || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-modal-section">
                  <h4 style={{ margin: '18px 0 6px 0', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>{t('borrow.modal.descTitle')}</h4>
                  <p className="detail-description" style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '6px 0', textAlign: 'left', minHeight: '60px' }}>
                    {selectedEquipment.description ? selectedEquipment.description : t('borrow.modal.noDesc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="detail-modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
              {/* 第一列：剩餘庫存與數量調整（僅在非編輯模式顯示） */}
              {!isEditMode && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                  {/* 剩餘庫存標籤 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>{t('borrow.modal.remainStock')}</span>
                    {selectedEquipment.remainQty <= 0 ? (
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                        {t('borrow.modal.outOfStock')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '13px', fontWeight: 'bold', color: selectedEquipment.remainQty <= 2 ? '#d97706' : '#059669', backgroundColor: selectedEquipment.remainQty <= 2 ? '#fef3c7' : '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                        {selectedEquipment.remainQty} {t('borrow.equip.qtyUnit', '件')}
                      </span>
                    )}
                  </div>

                  {/* 數量調整器 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('borrow.modal.qtyLabel')}</span>
                    <div className="quantity-controller" style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', height: '36px', backgroundColor: '#fff' }}>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => setModalQty(prev => Math.max(0, prev - 1))}
                        disabled={modalQty <= 0}
                        style={{ border: 'none', background: 'transparent', padding: '0 12px', height: '100%', cursor: modalQty > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px', color: modalQty > 0 ? '#1e293b' : '#cbd5e1' }}
                      >
                        -
                      </button>
                      <span className="qty-number" style={{ padding: '0 10px', fontSize: '15px', minWidth: '28px', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                        {modalQty}
                      </span>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => setModalQty(prev => Math.min(selectedEquipment.remainQty, prev + 1))}
                        disabled={selectedEquipment.remainQty <= 0 || modalQty >= selectedEquipment.remainQty}
                        style={{ border: 'none', background: 'transparent', padding: '0 12px', height: '100%', cursor: (selectedEquipment.remainQty > 0 && modalQty < selectedEquipment.remainQty) ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px', color: (selectedEquipment.remainQty > 0 && modalQty < selectedEquipment.remainQty) ? '#1e293b' : '#cbd5e1' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 第二列：操作按鈕群 */}
              {isEditMode ? (
                // 幹部編輯模式：左邊「取消」、右邊「儲存」
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleCancelPhotoEdit}
                    disabled={isSavingPhotos}
                    style={{
                      flex: 1,
                      height: '46px',
                      fontSize: '15px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      color: '#475569',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {t('borrow.modal.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePhotos}
                    disabled={isSavingPhotos}
                    style={{
                      flex: 1.5,
                      height: '46px',
                      fontSize: '15px',
                      borderRadius: '10px',
                      backgroundColor: '#059669',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    <Save size={16} />
                    <span>{isSavingPhotos ? t('borrow.modal.savingPhotos') : t('borrow.modal.save')}</span>
                  </button>
                </div>
              ) : (
                // 一般模式
                <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                  {officerStatus && (
                    <button
                      type="button"
                      onClick={() => setIsEditMode(true)}
                      style={{
                        flex: '1',
                        height: '46px',
                        fontSize: '14px',
                        borderRadius: '10px',
                        border: '1.5px solid #059669',
                        color: '#059669',
                        backgroundColor: '#f0fdf4',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Camera size={16} />
                      <span>{t('borrow.modal.editPhotos')}</span>
                    </button>
                  )}

                  {modalQty === 0 ? (
                    <button
                      type="button"
                      onClick={() => setSelectedEquipment(null)}
                      style={{
                        flex: officerStatus ? 1 : '1 1 100%',
                        height: '46px',
                        fontSize: '15px',
                        borderRadius: '10px',
                        border: '1.5px solid #cbd5e1',
                        color: '#475569',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {t('borrow.modal.close')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="add-to-cart-btn modal-add-btn"
                      onClick={() => {
                        const currentInCart = form.cart[selectedEquipment.id] || 0;
                        updateCart(selectedEquipment.id, modalQty - currentInCart, selectedEquipment.remainQty);
                        setSelectedEquipment(null);
                      }}
                      style={{
                        flex: officerStatus ? 1.5 : '1 1 100%',
                        height: '46px',
                        fontSize: '15px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
                      }}
                    >
                      <ShoppingCart size={18} />
                      <span>{t('borrow.modal.addToCart')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 全螢幕照片放大 Lightbox */}
      {isLightboxOpen && modalPhotos[activePhotoIdx] && (
        <div
          className="photo-lightbox-overlay"
          onClick={() => setIsLightboxOpen(false)}
          onTouchStart={handleLbTouchStart}
          onTouchEnd={handleLbTouchEnd}
        >
          <button
            type="button"
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10 }}
            onClick={() => setIsLightboxOpen(false)}
          >
            <X size={30} />
          </button>
          <img
            className="photo-lightbox-img"
            src={getDirectImageUrl(modalPhotos[activePhotoIdx].url, 1600) || modalPhotos[activePhotoIdx].url}
            alt={selectedEquipment?.name}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
          {modalPhotos.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {modalPhotos.map((_, idx) => (
                <span
                  key={idx}
                  className={`carousel-dot ${idx === activePhotoIdx ? 'active' : ''}`}
                  onClick={() => setActivePhotoIdx(idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Borrow;

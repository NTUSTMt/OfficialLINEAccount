import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, RotateCw, Search, X, ShieldAlert } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import { GAS_API_URL } from '../constants/api';
import { fetchEquipmentsFromSupabase, fetchDashboardFromSupabase, fetchMemberProfileFromSupabase, submitEquipmentLoanToSupabase } from '../utils/supabaseClient';
import type { Equipment } from '../types/equipment';
import { EquipmentCard } from '../components/borrow/EquipmentCard';
import { BorrowCartDrawer } from '../components/borrow/BorrowCartDrawer';
import { EquipmentDetailModal } from '../components/borrow/EquipmentDetailModal';
import '../App.css';

// ==========================================
// 1. 型別與常數定義 (Type & Constant Definitions)
// ==========================================
export const EQUIPMENT_CATEGORIES = [
  '睡眠系統',
  '背負系統',
  '炊事系統',
  '照明通訊',
  '攀登技術',
  '行進安全',
  '其他裝備'
] as const;

interface FormState {
  pickupDate: string;
  returnDate: string;
  purpose: string;
  otherPurpose?: string;
  cart: Record<string, number>;
}

interface ApiResponse {
  status: string;
  data: Equipment[];
  message?: string;
}

const CACHE_KEY_EQUIPMENTS = 'borrow_equipments_list';
const CACHE_KEY_OFFICIAL = 'user_is_official_';

function Borrow({ userId, isOfficer = false }: { userId: string; isOfficer?: boolean }) {
  const { t } = useTranslation();

  // ==========================================
  // 2. 狀態管理 (State Management)
  // ==========================================
  const [equipments, setEquipments] = useState<Equipment[]>(() => {
    return getCache<Equipment[]>(CACHE_KEY_EQUIPMENTS) || [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getCache<Equipment[]>(CACHE_KEY_EQUIPMENTS);
    return !cached || cached.length === 0;
  });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isOfficial, setIsOfficial] = useState<boolean>(() => {
    if (!userId || userId === 'TEST_USER_ID') return true;
    const cached = getCache<boolean>(CACHE_KEY_OFFICIAL + userId);
    return cached !== null ? cached : false;
  });
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

  // 搜尋關鍵字與所選分類篩選狀態
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // 幹部身分狀態
  const officerStatus = useMemo(() => {
    if (isOfficer) return true;
    try {
      const cached = localStorage.getItem('officer_status_cache');
      return cached !== null ? JSON.parse(cached) : false;
    } catch {
      return false;
    }
  }, [isOfficer]);

  const [form, setForm] = useState<FormState>({
    pickupDate: '',
    returnDate: '',
    purpose: '個人使用',
    otherPurpose: '',
    cart: {}
  });

  // 借用人聯絡個資快取 (用於推播通知與確認訊息)
  const [userProfile, setUserProfile] = useState<{
    name: string;
    phone: string;
    realLineId: string;
  }>({ name: '', phone: '', realLineId: '' });

  // 外部瀏覽器阻擋防護狀態
  const isLocalhost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('192.168.')
  );
  const isInLineClient = liff.isInClient();
  const [bypassExternalLock, setBypassExternalLock] = useState<boolean>(false);

  // ==========================================
  // 3. 資料獲取 (SWR Caching)
  // ==========================================
  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        let loadedEquipments: Equipment[] | null = null;
        try {
          loadedEquipments = await fetchEquipmentsFromSupabase();
        } catch (sbErr) {
          console.warn('[Borrow] Supabase 讀取例外，啟用 GAS 備援:', sbErr);
          loadedEquipments = null;
        }

        if (loadedEquipments && loadedEquipments.length > 0) {
          if (!ignore) {
            setEquipments(loadedEquipments);
            setCache(CACHE_KEY_EQUIPMENTS, loadedEquipments, 300);
          }
        } else {
          const response = await fetch(GAS_API_URL, { redirect: 'follow' });
          const resData: ApiResponse = await response.json();
          if (!ignore && resData.status === 'success' && Array.isArray(resData.data)) {
            setEquipments(resData.data);
            setCache(CACHE_KEY_EQUIPMENTS, resData.data, 300);
          }
        }
      } catch (err) {
        console.error('裝備清單載入失敗:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }

      if (userId && userId !== 'TEST_USER_ID') {
        // 預載社員姓名、LINE ID 與電話 (用於訂單明細與推播)
        fetchMemberProfileFromSupabase(userId).then(p => {
          if (p && !ignore) {
            setUserProfile({
              name: p.name || '',
              phone: p.phone || '',
              realLineId: p.realLineId || ''
            });
          }
        }).catch(err => console.warn('[Borrow] 社員資料載入略過:', err));

        const cachedOfficial = getCache<boolean>(CACHE_KEY_OFFICIAL + userId);
        if (cachedOfficial !== null) {
          setIsOfficial(cachedOfficial);
        } else {
          let checkedFromSupabase = false;
          try {
            // ⚡ 1. 優先從 Supabase 秒級讀取社員身分與折扣權益 (< 50ms)
            const dash = await fetchDashboardFromSupabase(userId);
            if (dash && dash.profile) {
              checkedFromSupabase = true;
              const official = Boolean(dash.profile.isOfficial);
              if (!ignore) {
                setIsOfficial(official);
                setCache(CACHE_KEY_OFFICIAL + userId, official, 600);
                if (dash.profile.name) {
                  setUserProfile(prev => ({ ...prev, name: prev.name || dash.profile.name }));
                }
              }
            }
          } catch (sbErr) {
            console.warn('[Borrow] Supabase 社員身分檢查例外，啟用 GAS 備援:', sbErr);
          }

          // 2. 若 Supabase 尚未配置或回傳 null，無縫由 GAS 備援讀取
          if (!checkedFromSupabase) {
            try {
              const myStatusRes = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_my_status&userId=${userId}`));
              const myStatusData = await myStatusRes.json();
              if (!ignore && myStatusData.status === 'success' && myStatusData.data?.profile) {
                const official = Boolean(myStatusData.data.profile.isOfficial);
                setIsOfficial(official);
                setCache(CACHE_KEY_OFFICIAL + userId, official, 600);
                if (myStatusData.data.profile.name) {
                  setUserProfile(prev => ({ ...prev, name: prev.name || myStatusData.data.profile.name }));
                }
              }
            } catch (err) {
              console.error('社員身分載入失敗:', err);
            }
          }
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [userId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    removeCache(CACHE_KEY_EQUIPMENTS);

    try {
      let loadedEquipments: Equipment[] | null = null;
      try {
        loadedEquipments = await fetchEquipmentsFromSupabase();
      } catch (sbErr) {
        console.warn('[Borrow] Supabase 重新整理例外，啟用 GAS 備援:', sbErr);
        loadedEquipments = null;
      }

      if (loadedEquipments && loadedEquipments.length > 0) {
        setEquipments(loadedEquipments);
        setCache(CACHE_KEY_EQUIPMENTS, loadedEquipments, 300);
      } else {
        const response = await fetch(GAS_API_URL, { redirect: 'follow' });
        const resData: ApiResponse = await response.json();
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setEquipments(resData.data);
          setCache(CACHE_KEY_EQUIPMENTS, resData.data, 300);
        }
      }
    } catch (err) {
      console.error('裝備清單重新整理失敗:', err);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // ==========================================
  // 4. 核心邏輯處理 (Handlers & Calculations)
  // ==========================================
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

  const totalItems = useMemo(() => {
    return Object.values(form.cart).reduce((sum, qty) => sum + qty, 0);
  }, [form.cart]);

  const todayStr = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const rentalDays = useMemo(() => {
    if (!form.pickupDate || !form.returnDate) return 2;
    const start = new Date(form.pickupDate);
    const end = new Date(form.returnDate);
    if (end < start) return 1;
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1;
  }, [form.pickupDate, form.returnDate]);

  const basePrice = useMemo(() => {
    return Object.entries(form.cart).reduce((sum, [id, qty]) => {
      const equip = equipments.find(item => item.id === id);
      if (!equip) return sum;
      const extraDays = Math.max(0, rentalDays - 2);
      const itemPrice = equip.price + extraDays * (equip.priceExtra || 0);
      return sum + (itemPrice * qty);
    }, 0);
  }, [form.cart, equipments, rentalDays]);

  const personalPrice = useMemo(() => {
    return isOfficial ? Math.round(basePrice * 0.5) : basePrice;
  }, [basePrice, isOfficial]);

  const totalPrice = useMemo(() => {
    if (form.purpose === '社團出隊') {
      return 0;
    }
    return personalPrice;
  }, [form.purpose, personalPrice]);

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

  const isInvalidDateRange = useMemo(() => {
    if (!form.pickupDate || !form.returnDate) return false;
    return form.returnDate < form.pickupDate;
  }, [form.pickupDate, form.returnDate]);

  // 各分類即時數量統計
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: equipments.length };
    EQUIPMENT_CATEGORIES.forEach(cat => {
      counts[cat] = 0;
    });
    equipments.forEach(item => {
      const cat = item.category || '其他裝備';
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts['其他裝備'] = (counts['其他裝備'] || 0) + 1;
      }
    });
    return counts;
  }, [equipments]);

  // 過濾後的裝備清單 (複合分類篩選 + 關鍵字搜尋)
  const filteredEquipments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return equipments.filter(item => {
      // 1. 分類篩選
      if (selectedCategory !== 'all') {
        const itemCat = item.category || '其他裝備';
        if (itemCat !== selectedCategory) return false;
      }
      // 2. 關鍵字搜尋 (支援名稱、分類、規格、描述、裝備代號)
      if (!query) return true;
      const matchName = item.name.toLowerCase().includes(query);
      const matchId = item.id.toLowerCase().includes(query);
      const matchCat = (item.category || '').toLowerCase().includes(query);
      const matchDesc = (item.description || '').toLowerCase().includes(query);
      return matchName || matchId || matchCat || matchDesc;
    });
  }, [equipments, selectedCategory, searchQuery]);

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

  const submitForm = async () => {
    if (totalItems === 0) return alert(t('borrow.alert.emptyCart'));
    if (!form.pickupDate || !form.returnDate) return alert(t('borrow.alert.noDates'));
    if (isInvalidDateRange) {
      return alert(t('borrow.drawer.invalidDateRange', '歸還日期不能早於領取日期！'));
    }
    if (form.purpose === '其他用途' && !form.otherPurpose?.trim()) {
      return alert(t('borrow.alert.noOtherPurpose'));
    }

    setIsSubmittingOrder(true);
    try {
      // 1. 預先收集所借品項之中文名稱與數量
      const selectedCartItems = Object.entries(form.cart)
        .filter(([_, qty]) => qty > 0)
        .map(([id, qty]) => {
          const eq = equipments.find(e => e.id === id);
          return {
            id,
            name: eq ? eq.name : id,
            quantity: qty
          };
        });

      const pDate = new Date(form.pickupDate);
      const rDate = new Date(form.returnDate);
      const days = Math.max(1, Math.round((rDate.getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      // ⚡ 2. 100% 直連 Supabase 原子性 RPC (< 50ms)
      const result = await submitEquipmentLoanToSupabase(userId, form);

      if (!result.success) {
        alert(t('borrow.alert.systemError', { message: result.message || '租借失敗' }));
        return;
      }

      const totalRentValue = result.totalRent !== undefined ? result.totalRent : totalPrice;

      // 3. 發送 LINE 幹部審核推播與個人保底推播 (確實等待 GAS 完成，避免關閉視窗中斷連線)
      try {
        const response = await fetch(GAS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(withAuthPayload({
            action: 'notify_officers_loan',
            userId: userId,
            loanId: result.loanId,
            borrowerName: userProfile.name || '',
            borrowerLineId: userProfile.realLineId || '',
            borrowerPhone: userProfile.phone || '',
            isOfficial: isOfficial,
            days: days,
            details: form,
            cartDetails: selectedCartItems,
            totalRent: totalRentValue
          }))
        });
        await response.json().catch(() => ({}));
      } catch (err) {
        console.warn('[Borrow] 幹部推播通知發送例外:', err);
      }

      removeCache(CACHE_KEY_EQUIPMENTS);
      setIsCartOpen(false);
      setForm({
        cart: {},
        pickupDate: '',
        returnDate: '',
        purpose: '社團出隊',
        otherPurpose: ''
      });

      // 4. 傳送結構化確認訊息給使用者 (透過 liff.sendMessages，0 額度消耗)
      const identityText = form.purpose === '社團出隊'
        ? '社團出隊 (免租金) / Club Trip (Free)'
        : (isOfficial ? '社員個人 (享5折) / Member (50% Off)' : '非社員 (原價) / Non-member (Regular)');
      const itemsListText = selectedCartItems.map(item => `• ${item.name} x ${item.quantity}`).join('\n');

      const userMessageText =
        `【🎒 我的裝備租借預訂單 / Equipment Loan Order】\n` +
        `────────────────────\n` +
        `• 訂單編號 (Order ID)：${result.loanId || '已建立 Created'}\n` +
        `• 借用人 (Borrower)：${userProfile.name || '社員'} (${identityText})\n` +
        `• 預計領取 (Pickup Date)：${form.pickupDate}\n` +
        `• 預計歸還 (Return Date)：${form.returnDate} (共 ${days} 天 / ${days} days)\n` +
        `• 租借用途 (Purpose)：${form.purpose}${form.purpose === '其他用途' && form.otherPurpose ? ` (${form.otherPurpose})` : ''}\n\n` +
        `📦 預約裝備清單 (Items)：\n` +
        `${itemsListText}\n\n` +
        `💰 預估總租金 (Estimated Total)：$${totalRentValue} 元\n` +
        `────────────────────\n` +
        `📌 提醒事項 / Important Notes：\n` +
        `1. 幹部已收到您的預約申請，將為您備齊裝備。\n` +
        `   Officers have received your request and will prepare the gear.\n` +
        `2. 若有租金費用，請於領取前至「繳費申報」完成匯款並上傳憑證。\n` +
        `   If fees apply, please complete payment in "Payment Center" before pickup.\n` +
        `3. 將有幹部主動聯繫你，確認領取時間以及地點。\n` +
        `   An officer will contact you to confirm pickup time and location.`;

      if (liff.isInClient()) {
        try {
          await liff.sendMessages([{
            type: 'text',
            text: userMessageText
          }]);
        } catch (liffErr) {
          console.warn('liff.sendMessages 略過:', liffErr);
        }
        alert(t('borrow.alert.submitSuccess', '🎉 裝備租借申請已成功送出！訂單明細已同步發送至您的 LINE 聊天室與幹部群組。'));
        try {
          liff.closeWindow();
        } catch (e) {
          console.warn('liff.closeWindow 略過:', e);
        }
      } else {
        alert(t('borrow.alert.submitSuccessBrowser', '🎉 裝備租借預約成功！訂單編號：' + (result.loanId || '')));
      }
    } catch (error) {
      console.error('API 請求失敗:', error);
      alert(t('borrow.alert.networkError'));
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleEquipmentUpdated = (updated: { id: string; imageUrl: string }) => {
    setEquipments(prev => prev.map(eq => eq.id === updated.id ? { ...eq, imageUrl: updated.imageUrl } : eq));
    const cached = getCache<Equipment[]>(CACHE_KEY_EQUIPMENTS);
    if (cached) {
      setCache(CACHE_KEY_EQUIPMENTS, cached.map(eq => eq.id === updated.id ? { ...eq, imageUrl: updated.imageUrl } : eq), 300);
    }
    if (selectedEquipment && selectedEquipment.id === updated.id) {
      setSelectedEquipment(prev => prev ? { ...prev, imageUrl: updated.imageUrl } : null);
    }
  };

  // ==========================================
  // 5. 畫面渲染 (Render)
  // ==========================================

  // 外部瀏覽器全螢幕鎖定遮罩 (不允許使用外部瀏覽器，保障預約身分與紀錄)
  if (!isInLineClient && !bypassExternalLock) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        background: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
        color: '#ffffff',
        textAlign: 'center',
        boxSizing: 'border-box'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '24px',
          padding: '36px 24px',
          maxWidth: '380px',
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)'
          }}>
            <ShieldAlert size={36} color="#ffffff" />
          </div>

          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px 0', letterSpacing: '0.5px' }}>
            請於 LINE 官方帳號中開啟
          </h1>

          <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: '0 0 24px 0' }}>
            台科登山社裝備租借系統不支援外部瀏覽器（Safari / Chrome）。為了確保您的預約身分與裝備借還紀錄無誤，請由 <strong>LINE 官方帳號</strong> 下方選單點選進入。
          </p>

          <a
            href="https://liff.line.me/2009217429-zXvGeSrI"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '14px 20px',
              background: '#06c755',
              color: '#ffffff',
              borderRadius: '14px',
              fontWeight: 600,
              fontSize: '15px',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(6, 199, 85, 0.3)',
              boxSizing: 'border-box'
            }}
          >
            <span>開啟 LINE 官方帳號</span>
          </a>

          {isLocalhost && (
            <button
              type="button"
              onClick={() => setBypassExternalLock(true)}
              style={{
                marginTop: '18px',
                background: 'transparent',
                border: '1px dashed rgba(255,255,255,0.3)',
                color: '#94a3b8',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              ⚙️ 本地開發預覽 (Bypass Lock)
            </button>
          )}
        </div>
      </div>
    );
  }

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
        <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2>{t('borrow.grid.title')}</h2>
            <span className="products-count">
              {filteredEquipments.length === equipments.length
                ? t('borrow.grid.count', { count: equipments.length })
                : `${filteredEquipments.length} / ${equipments.length}`}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
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

        {/* 裝備搜尋與系統分類篩選區塊 */}
        <div className="equipment-filter-container" style={{ marginBottom: '16px' }}>
          {/* 搜尋輸入框 */}
          <div className="equipment-search-wrapper" style={{ position: 'relative', marginBottom: '10px' }}>
            <Search
              size={18}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }}
            />
            <input
              type="text"
              className="equipment-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('borrow.search.placeholder', '搜尋裝備名稱、規格或代號...')}
              style={{
                width: '100%',
                padding: '10px 38px 10px 38px',
                fontSize: '14px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#1e293b',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '22px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
                title={t('borrow.search.clear', '清空搜尋')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 水平滑動分類標籤列 (Category Chips) */}
          <div
            className="equipment-category-scroll-container"
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '4px',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            <button
              type="button"
              className={`category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: selectedCategory === 'all' ? 600 : 500,
                whiteSpace: 'nowrap',
                border: selectedCategory === 'all' ? '1px solid #059669' : '1px solid #e2e8f0',
                background: selectedCategory === 'all' ? '#ecfdf5' : '#ffffff',
                color: selectedCategory === 'all' ? '#059669' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
            >
              <span>{t('borrow.category.all', '全部')}</span>
              <span style={{
                fontSize: '11px',
                background: selectedCategory === 'all' ? '#059669' : '#f1f5f9',
                color: selectedCategory === 'all' ? '#ffffff' : '#64748b',
                borderRadius: '10px',
                padding: '1px 6px'
              }}>
                {categoryCounts.all}
              </span>
            </button>

            {EQUIPMENT_CATEGORIES.map(cat => {
              const count = categoryCounts[cat] || 0;
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`category-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: isSelected ? 600 : 500,
                    whiteSpace: 'nowrap',
                    border: isSelected ? '1px solid #059669' : '1px solid #e2e8f0',
                    background: isSelected ? '#ecfdf5' : '#ffffff',
                    color: isSelected ? '#059669' : '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    flexShrink: 0
                  }}
                >
                  <span>{cat}</span>
                  <span style={{
                    fontSize: '11px',
                    background: isSelected ? '#059669' : '#f1f5f9',
                    color: isSelected ? '#ffffff' : '#64748b',
                    borderRadius: '10px',
                    padding: '1px 6px'
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{t('borrow.grid.loading')}</p>
          </div>
        ) : filteredEquipments.length === 0 ? (
          <div className="equipment-empty-state" style={{
            textAlign: 'center',
            padding: '48px 16px',
            background: '#f8fafc',
            borderRadius: '16px',
            border: '1px dashed #cbd5e1',
            margin: '12px 0'
          }}>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '14px', fontWeight: 500 }}>
              {searchQuery || selectedCategory !== 'all'
                ? t('borrow.empty.noMatch', '找不到符合搜尋或篩選條件的裝備')
                : t('borrow.empty.noEquipments', '目前暫無開放租借的裝備')}
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  border: '1px solid #059669',
                  background: '#ffffff',
                  color: '#059669',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {t('borrow.empty.resetFilters', '清除篩選條件')}
              </button>
            )}
          </div>
        ) : (
          <div className="products-grid">
            {filteredEquipments.map(item => (
              <EquipmentCard
                key={item.id}
                item={item}
                currentQty={form.cart[item.id] || 0}
                onOpenDetail={(equip) => setSelectedEquipment(equip)}
                onUpdateCart={updateCart}
              />
            ))}
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
                <span className="floating-total-label" style={{ fontSize: '11px', opacity: 0.8 }}>{t('borrow.floating.basicLabel', '基本:')}</span>
                <span className="floating-price" style={{ fontSize: '14px', fontWeight: 'bold' }}>${basePrice}</span>
                <span style={{ fontSize: '11px', opacity: 0.7 }}>({rentalDays} {t('borrow.floating.daysUnit', '天')})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#6ee7b7', fontWeight: 'bold' }}>
                  {form.purpose === '社團出隊'
                    ? t('borrow.floating.estFree', '社團出隊免費')
                    : `${t('borrow.floating.estPrice', '預估: ')}$${totalPrice}${isOfficial ? ` (${t('borrow.floating.halfPrice', '社員5折')})` : ''}`}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>• {form.purpose}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="view-cart-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsCartOpen(true);
            }}
          >
            <ShoppingCart size={16} />
            <span>{t('borrow.floating.viewDetail', '下一步')}</span>
          </button>
        </div>
      )}

      {/* 購物車右側/底部展開抽屜 */}
      <BorrowCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={form.cart}
        equipments={equipments}
        rentalDays={rentalDays}
        totalItems={totalItems}
        basePrice={basePrice}
        personalPrice={personalPrice}
        totalPrice={totalPrice}
        formulaString={formulaString}
        isOfficial={isOfficial}
        isSubmittingOrder={isSubmittingOrder}
        pickupDate={form.pickupDate}
        returnDate={form.returnDate}
        isInvalidDateRange={isInvalidDateRange}
        purpose={form.purpose}
        otherPurpose={form.otherPurpose || ''}
        todayStr={todayStr}
        onUpdateCart={updateCart}
        onInputChange={handleInputChange}
        onSubmitForm={submitForm}
      />

      {/* 裝備詳細資訊彈窗 (1:1 正方形相片輪播、幹部照片維護與 Lightbox) */}
      {selectedEquipment && (
        <EquipmentDetailModal
          key={selectedEquipment.id}
          equipment={selectedEquipment}
          initialQty={form.cart[selectedEquipment.id] || 0}
          officerStatus={officerStatus}
          userId={userId}
          onClose={() => setSelectedEquipment(null)}
          onAddToCart={(qty) => {
            const currentInCart = form.cart[selectedEquipment.id] || 0;
            updateCart(selectedEquipment.id, qty - currentInCart, selectedEquipment.remainQty);
          }}
          onEquipmentUpdated={handleEquipmentUpdated}
        />
      )}
    </div>
  );
}

export default Borrow;

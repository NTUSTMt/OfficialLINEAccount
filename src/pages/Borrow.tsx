import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, RotateCw } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { getCache, setCache, removeCache } from '../utils/cacheUtils';
import { GAS_API_URL } from '../constants/api';
import { fetchEquipmentsFromSupabase, fetchDashboardFromSupabase } from '../utils/supabaseClient';
import type { Equipment } from '../types/equipment';
import { EquipmentCard } from '../components/borrow/EquipmentCard';
import { BorrowCartDrawer } from '../components/borrow/BorrowCartDrawer';
import { EquipmentDetailModal } from '../components/borrow/EquipmentDetailModal';
import '../App.css';

// ==========================================
// 1. 型別定義 (Type Definitions)
// ==========================================
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
    purpose: '社團出隊',
    otherPurpose: '',
    cart: {}
  });

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

    const orderPayload = {
      action: 'submit_multi_loan',
      userId: userId,
      details: form
    };

    setIsSubmittingOrder(true);
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
      removeCache(CACHE_KEY_EQUIPMENTS);
      setIsCartOpen(false);
      setForm({
        cart: {},
        pickupDate: '',
        returnDate: '',
        purpose: '社團出隊',
        otherPurpose: ''
      });

      if (liff.isInClient()) {
        Promise.race([
          liff.sendMessages([{
            type: 'text',
            text: t('borrow.alert.submitSuccess', { count: totalItems })
          }]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
        ]).catch(liffErr => {
          console.warn('liff.sendMessages 略過:', liffErr);
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

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{t('borrow.grid.loading')}</p>
          </div>
        ) : (
          <div className="products-grid">
            {equipments.map(item => (
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
          <button className="view-cart-btn" onClick={() => setIsCartOpen(true)} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
            <ShoppingCart size={18} />
            <span>{t('borrow.floating.viewDetail', '查看預訂單')}</span>
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

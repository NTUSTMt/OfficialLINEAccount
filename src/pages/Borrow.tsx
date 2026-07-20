import { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import '../App.css';

// ==========================================
// 📌 1. 型別定義 (Type Definitions)
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

// 轉換 Google Drive 分享連結為直接嵌入圖片的網址
function getDirectImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const cleanUrl = url.trim();
  const driveRegex = /(?:https?:\/\/)?(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=)([^/\?]+)/;
  const match = cleanUrl.match(driveRegex);
  if (match && match[1]) {
    return `https://docs.google.com/uc?export=view&id=${match[1]}`;
  }
  return cleanUrl;
}

// 根據商品名稱或傳入的圖片網址渲染對應的真實圖片或對應的裝備 Emoji 圖示
function ProductImage({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const directUrl = getDirectImageUrl(imageUrl);

  if (directUrl && directUrl.startsWith('http')) {
    return (
      <div className="product-img-container">
        <img
          src={directUrl}
          alt={name}
          className="product-img-real"
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  const lowercaseName = name.toLowerCase();
  let emoji = '🏔️';
  let bgClass = 'bg-default';

  // 帳篷
  if (lowercaseName.includes('帳') || lowercaseName.includes('tent')) {
    emoji = '⛺';
    bgClass = 'bg-tent';
  }
  // 睡墊/睡袋
  else if (lowercaseName.includes('墊') || lowercaseName.includes('袋') || lowercaseName.includes('pad') || lowercaseName.includes('sleeping')) {
    emoji = '💤';
    bgClass = 'bg-pad';
  }
  // 背包
  else if (lowercaseName.includes('包') || lowercaseName.includes('pack')) {
    emoji = '🎒';
    bgClass = 'bg-pack';
  }
  // 登山杖
  else if (lowercaseName.includes('杖') || lowercaseName.includes('pole') || lowercaseName.includes('stick')) {
    emoji = '🦯';
    bgClass = 'bg-pole';
  }
  // 鋼盆/炊具/爐
  else if (lowercaseName.includes('盆') || lowercaseName.includes('鍋') || lowercaseName.includes('爐') || lowercaseName.includes('cook') || lowercaseName.includes('stove')) {
    emoji = '🍳';
    bgClass = 'bg-bowl';
  }
  // 頭盔/岩盔/吊帶/攀登
  else if (lowercaseName.includes('盔') || lowercaseName.includes('吊帶') || lowercaseName.includes('繩') || lowercaseName.includes('harness') || lowercaseName.includes('helmet')) {
    emoji = '🪖';
    bgClass = 'bg-default';
  }

  return (
    <div className={`product-img-container ${bgClass}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px' }}>
      {emoji}
    </div>
  );
}

function Borrow({ userId }: { userId: string }) {
  const { t } = useTranslation();
  // ==========================================
  // 📌 2. 狀態管理 (State Management)
  // ==========================================
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

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

  // ⚠️ 替換成你剛剛重新部署的 GAS 網頁應用程式 URL
  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

  // ==========================================
  // 📌 3. 初始化與資料獲取 (Initialization)
  // ==========================================
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 呼叫 GAS API 取得裝備清單
        const response = await fetch(GAS_API_URL, { redirect: 'follow' });
        const resData: ApiResponse = await response.json();

        if (resData.status === 'success') {
          setEquipments(resData.data);
        }

        // 取得使用者社籍狀態以計算折扣
        if (userId && userId !== 'TEST_USER_ID') {
          const myStatusRes = await fetch(`${GAS_API_URL}?action=get_my_status&userId=${userId}`);
          const myStatusData = await myStatusRes.json();
          if (myStatusData.status === 'success' && myStatusData.data && myStatusData.data.profile) {
            setIsOfficial(myStatusData.data.profile.isOfficial);
          }
        } else {
          // 本地測試帳號預設為正式社員
          setIsOfficial(true);
        }
      } catch (error) {
        console.error('裝備清單或社員狀態載入失敗:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  // ==========================================
  // 📌 4. 核心邏輯處理 (Handlers)
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

  // 計算已選裝備總數
  const totalItems = useMemo(() => {
    return Object.values(form.cart).reduce((sum, qty) => sum + qty, 0);
  }, [form.cart]);

  // 計算天數的輔助函式
  const rentalDays = useMemo(() => {
    if (!form.pickupDate || !form.returnDate) return 2;
    const start = new Date(form.pickupDate);
    const end = new Date(form.returnDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays || 1; // 至少為 1 天
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

  // 處理表單輸入
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
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

    // 🌟 使用 fetch POST 將資料打回給 GAS
    try {
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();
      if (result.status !== 'success') {
        alert(t('borrow.alert.systemError', { message: result.message }));
        return;
      }
    } catch (error) {
      console.error('API 請求失敗:', error);
      alert(t('borrow.alert.networkError'));
      return;
    }

    // 2. 在 LINE 聊天室印出確認訊息
    if (liff.isInClient()) {
      await liff.sendMessages([{
        type: 'text',
        text: t('borrow.alert.submitSuccess', { count: totalItems })
      }]);
      liff.closeWindow();
    } else {
      alert(t('borrow.alert.submitSuccessBrowser'));
    }
  };

  // ==========================================
  // 📌 5. 畫面渲染 (Render)
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
        <div className="section-title">
          <h2>{t('borrow.grid.title')}</h2>
          <span className="products-count">{t('borrow.grid.count', { count: equipments.length })}</span>
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
                <div key={item.id} className={`product-card ${currentQty > 0 ? 'selected' : ''}`} onClick={() => setSelectedEquipment(item)} style={{ cursor: 'pointer' }}>
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
              <div className="empty-cart-state">
                <span className="empty-icon">🛒</span>
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
                        onChange={handleInputChange}
                        required
                      />
                    </div>

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
                disabled={totalItems === 0 || !form.pickupDate || !form.returnDate}
              >
                {t('borrow.drawer.submitBtn', { price: totalPrice })}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 裝備詳細資訊彈窗 */}
      {selectedEquipment && (
        <div className="detail-modal-overlay" onClick={() => setSelectedEquipment(null)}>
          <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <h3>{t('borrow.modal.title')}</h3>
              <button className="close-modal-btn" onClick={() => setSelectedEquipment(null)}>&times;</button>
            </div>
            
            <div className="detail-modal-content">
              <div className="detail-modal-image-wrapper">
                <ProductImage name={selectedEquipment.name} imageUrl={selectedEquipment.imageUrl} />
              </div>
              
              <div className="detail-modal-body">
                <h2 className="detail-modal-title">{selectedEquipment.name}</h2>
                
                <div className="detail-modal-badges">
                  {selectedEquipment.remainQty <= 0 ? (
                    <span className="status-badge out-of-stock">{t('borrow.card.outOfStock')}</span>
                  ) : selectedEquipment.remainQty <= 2 ? (
                    <span className="status-badge low-stock">{t('borrow.card.lowStock', { count: selectedEquipment.remainQty })}</span>
                  ) : (
                    <span className="status-badge in-stock">{t('borrow.card.inStock', { count: selectedEquipment.remainQty })}</span>
                  )}
                  <span className="status-badge code-badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>{t('borrow.modal.codeLabel')}{selectedEquipment.id}</span>
                </div>

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

            <div className="detail-modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <div className="detail-qty-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{t('borrow.modal.qtyLabel')}</span>
                {(() => {
                  const currentQty = form.cart[selectedEquipment.id] || 0;
                  return currentQty === 0 ? (
                    <button
                      className="add-to-cart-btn modal-add-btn"
                      onClick={() => updateCart(selectedEquipment.id, 1, selectedEquipment.remainQty)}
                      disabled={selectedEquipment.remainQty <= 0}
                      style={{ padding: '8px 24px', fontSize: '13px', borderRadius: '8px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      {selectedEquipment.remainQty <= 0 ? t('borrow.modal.outOfStock') : t('borrow.modal.addToReservation')}
                    </button>
                  ) : (
                    <div className="quantity-controller" style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                      <button className="qty-btn" onClick={() => updateCart(selectedEquipment.id, -1, selectedEquipment.remainQty)} style={{ border: 'none', background: 'transparent', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>-</button>
                      <span className="qty-number" style={{ padding: '0 12px', fontSize: '14px', minWidth: '24px', textAlign: 'center', fontWeight: 'bold' }}>{currentQty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateCart(selectedEquipment.id, 1, selectedEquipment.remainQty)}
                        disabled={currentQty >= selectedEquipment.remainQty}
                        style={{ border: 'none', background: 'transparent', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                      >
                        +
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Borrow;

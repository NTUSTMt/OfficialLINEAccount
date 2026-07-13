import { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
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

// 根據商品名稱或傳入的圖片網址渲染對應的真實圖片或 Unsplash 高質感圖示
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
  let fallbackSrc = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&auto=format&fit=crop'; // 預設大山背景

  // 帳篷
  if (lowercaseName.includes('帳') || lowercaseName.includes('tent')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=600&auto=format&fit=crop';
  }
  // 睡墊/睡袋
  else if (lowercaseName.includes('墊') || lowercaseName.includes('袋') || lowercaseName.includes('pad') || lowercaseName.includes('sleeping')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&auto=format&fit=crop';
  }
  // 背包
  else if (lowercaseName.includes('包') || lowercaseName.includes('pack')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=600&auto=format&fit=crop';
  }
  // 登山杖
  else if (lowercaseName.includes('杖') || lowercaseName.includes('pole') || lowercaseName.includes('stick')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?w=600&auto=format&fit=crop';
  }
  // 鋼盆/炊具/爐
  else if (lowercaseName.includes('盆') || lowercaseName.includes('鍋') || lowercaseName.includes('爐') || lowercaseName.includes('cook') || lowercaseName.includes('stove')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1595107519967-df508b5e28a5?w=600&auto=format&fit=crop';
  }
  // 頭盔/岩盔/吊帶/攀登
  else if (lowercaseName.includes('盔') || lowercaseName.includes('吊帶') || lowercaseName.includes('繩') || lowercaseName.includes('harness') || lowercaseName.includes('helmet')) {
    fallbackSrc = 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=600&auto=format&fit=crop';
  }

  return (
    <div className="product-img-container">
      <img
        src={fallbackSrc}
        alt={name}
        className="product-img-real"
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}

function Borrow({ userId }: { userId: string }) {
  // ==========================================
  // 📌 2. 狀態管理 (State Management)
  // ==========================================
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isOfficial, setIsOfficial] = useState<boolean>(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

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
      return `($${equip.price} + $${equip.priceExtra || 0} × ${extraDays}天) × ${qty}件`;
    }).filter(Boolean);

    if (parts.length === 0) return '';

    const baseFormula = parts.join(' + ');
    if (form.purpose === '社團出隊') {
      return `${baseFormula} = $0 (社團活動免費)`;
    }
    if (isOfficial) {
      return `(${baseFormula}) × 0.5 (社員個人 5 折)`;
    }
    return baseFormula;
  }, [form.cart, equipments, rentalDays, form.purpose, isOfficial]);

  // 處理表單輸入
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // 送出表單
  const submitForm = async () => {
    if (totalItems === 0) return alert('請至少選擇一項裝備！');
    if (!form.pickupDate || !form.returnDate) return alert('請選擇日期！');
    if (form.purpose === '其他用途' && !form.otherPurpose?.trim()) {
      return alert('請輸入其他用途說明！');
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
        alert('系統發生錯誤：' + result.message);
        return;
      }
    } catch (error) {
      console.error('API 請求失敗:', error);
      alert('連線失敗，請檢查網路狀態或通知幹部！');
      return;
    }

    // 2. 在 LINE 聊天室印出確認訊息
    if (liff.isInClient()) {
      await liff.sendMessages([{
        type: 'text',
        text: `✅ 已成功送出 ${totalItems} 項裝備預約申請！\n系統處理中，請稍候...`
      }]);
      liff.closeWindow();
    } else {
      alert('訂單已送出 (請在 LINE 內部測試關閉視窗功能)');
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
          <h2 className="pricing-title">費用試算說明</h2>

          <div className="pricing-rules">
            <div className="pricing-rule-item">
              <span className="rule-label">社員用於社團活動</span>
              <span className="rule-value">免費</span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">非社員用於社團活動</span>
              <span className="rule-value">免費</span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">社員個人使用</span>
              <span className="rule-value"><span>5</span> 折租金</span>
            </div>
            <div className="pricing-rule-item">
              <span className="rule-label">非社員個人使用</span>
              <span className="rule-value">全額租金</span>
            </div>
          </div>

          <div className="pricing-notes">
            <p>。租金試算以「2天」為基本單位</p>
            <p>。超過 2 天之部分按「每日加價」計算</p>
          </div>
        </div>
      </div>

      {/* 主要內容區 */}
      <main className="main-content">
        <div className="section-title">
          <h2>裝備列表</h2>
          <span className="products-count">共 {equipments.length} 種裝備</span>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>正在為您準備最新裝備清單...</p>
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
                        <span className="status-badge out-of-stock">已租完</span>
                      ) : item.remainQty <= 2 ? (
                        <span className="status-badge low-stock">僅剩 {item.remainQty} 件</span>
                      ) : (
                        <span className="status-badge in-stock">庫存充足 ({item.remainQty})</span>
                      )}
                    </div>

                    <div className="product-price-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span className="price-label" style={{ margin: 0 }}>租金 (2天)</span>
                        <span className="price-value" style={{ fontSize: '15px' }}>${item.price}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>續租 (加1天)</span>
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
                          {isOutOfStock ? '無法租借' : '加入租借單'}
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
                <span className="floating-total-label" style={{ fontSize: '11px', opacity: 0.8 }}>基本:</span>
                <span className="floating-price" style={{ fontSize: '14px', fontWeight: 'bold' }}>${basePrice}</span>
                <span style={{ opacity: 0.3, fontSize: '11px' }}>|</span>
                <span className="floating-total-label" style={{ fontSize: '11px', opacity: 0.8 }}>個人使用:</span>
                <span className="floating-price" style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>${personalPrice}</span>
              </div>
              {!isOfficial && (
                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 'normal' }}>
                  (社員可享 5 折)
                </span>
              )}
            </div>
          </div>
          <button className="floating-checkout-btn">
            看預訂單 &rarr;
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
            <h3>📝 租借預訂單明細</h3>
            <button className="close-drawer-btn" onClick={() => setIsCartOpen(false)}>&times;</button>
          </div>

          <div className="drawer-content">
            {totalItems === 0 ? (
              <div className="empty-cart-state">
                <span className="empty-icon">🛒</span>
                <p>預訂單中目前沒有任何裝備喔！</p>
                <button className="start-rent-btn" onClick={() => setIsCartOpen(false)}>去挑選裝備</button>
              </div>
            ) : (
              <>
                {/* 預訂商品清單 */}
                <div className="drawer-section">
                  <h4 className="section-subtitle">已選裝備</h4>
                  <div className="cart-items-list">
                    {Object.entries(form.cart).map(([id, qty]) => {
                      const item = equipments.find(e => e.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="cart-item-row">
                          <div className="cart-item-desc">
                            <span className="cart-item-name">{item.name}</span>
                            <span className="cart-item-price" style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              公式: (${item.price} + ${item.priceExtra || 0} × {Math.max(0, rentalDays - 2)}天) × {qty} =
                              <strong style={{ color: 'var(--text-primary)', marginLeft: '4px' }}>
                                ${(item.price + Math.max(0, rentalDays - 2) * (item.priceExtra || 0)) * qty}
                              </strong>
                              {form.purpose === '社團出隊' ? ' (社團出隊免費 $0)' : isOfficial ? ' (社員個人 5 折)' : ''}
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
                  <h4 className="section-subtitle">📅 選擇預約詳情</h4>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="pickupDate">領取日期</label>
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
                      <label htmlFor="returnDate">歸還日期</label>
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
                      <label htmlFor="purpose">出隊目的 / 用途</label>
                      <select
                        id="purpose"
                        name="purpose"
                        value={form.purpose}
                        onChange={handleInputChange}
                        className="custom-select"
                      >
                        <option value="社團出隊">社團出隊</option>
                        <option value="個人使用">個人使用</option>
                        <option value="其他用途">其他用途</option>
                      </select>
                    </div>

                    {form.purpose === '其他用途' && (
                      <div className="form-group full-width animate-fade-in">
                        <label htmlFor="otherPurpose">請說明其他用途</label>
                        <input
                          type="text"
                          id="otherPurpose"
                          name="otherPurpose"
                          value={form.otherPurpose || ''}
                          onChange={handleInputChange}
                          placeholder="請輸入用途說明..."
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
                    <span>租用天數</span>
                    <span>{rentalDays} 天</span>
                  </div>
                  <div className="summary-row">
                    <span>商品總數</span>
                    <span>共 {totalItems} 件</span>
                  </div>
                  <div className="summary-row">
                    <span>基本費用總計 (原價)</span>
                    <span>${basePrice}</span>
                  </div>
                  <div className="summary-row">
                    <span>個人使用費用</span>
                    <span>
                      ${personalPrice}
                      {isOfficial ? ' (已享社員 5 折)' : ' (非社員全額)'}
                    </span>
                  </div>
                  {!isOfficial && (
                    <div className="summary-row" style={{ fontSize: '11px', color: '#f59e0b', justifyContent: 'flex-end', marginTop: '-4px', fontWeight: 'bold' }}>
                      <span>(社員可享 5 折)</span>
                    </div>
                  )}
                  <div className="summary-row total-row" style={{ borderBottom: formulaString ? 'none' : '1px solid var(--border-color)', paddingBottom: formulaString ? '0' : '8px', marginTop: '8px' }}>
                    <span>本單預估總租金 ({form.purpose})</span>
                    <span className="total-highlight">${totalPrice}</span>
                  </div>
                  {formulaString && (
                    <div className="summary-row" style={{ fontSize: '11px', color: 'var(--text-muted)', justifyContent: 'flex-end', marginTop: '2px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <span>試算: {formulaString} = ${totalPrice}</span>
                    </div>
                  )}
                  <p className="summary-tip">* 實際租金以取貨時，幹部依實際使用天數與規則核算為準</p>
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
                確認送出預訂單 (${totalPrice})
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
              <h3>🎒 裝備詳細資訊</h3>
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
                    <span className="status-badge out-of-stock">已租完</span>
                  ) : selectedEquipment.remainQty <= 2 ? (
                    <span className="status-badge low-stock">僅剩 {selectedEquipment.remainQty} 件</span>
                  ) : (
                    <span className="status-badge in-stock">庫存充足 ({selectedEquipment.remainQty})</span>
                  )}
                  <span className="status-badge code-badge" style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>代號: {selectedEquipment.id}</span>
                </div>

                <div className="detail-modal-section">
                  <h4 style={{ margin: '14px 0 6px 0', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>💰 租金費率 (Rental Price)</h4>
                  <div className="detail-price-grid" style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
                    <div className="detail-price-item" style={{ textAlign: 'left' }}>
                      <span className="price-label" style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>基本租金 (2天)</span>
                      <span className="price-val" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>${selectedEquipment.price}</span>
                    </div>
                    <div className="detail-price-item" style={{ textAlign: 'right' }}>
                      <span className="price-label" style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>續租費用 (每加1天)</span>
                      <span className="price-val" style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>+${selectedEquipment.priceExtra || 0}</span>
                    </div>
                  </div>
                  <div className="detail-discount-tip" style={{ marginTop: '8px', fontSize: '12px', padding: '8px 10px', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', textAlign: 'left' }}>
                    💡 <strong>社籍優惠：</strong>
                    {isOfficial ? (
                      <span>您為正式社員，個人使用享 5 折優惠！</span>
                    ) : (
                      <span>正式社員個人使用享 5 折 (本單個人費用可打五折)。</span>
                    )}
                  </div>
                </div>

                <div className="detail-modal-section">
                  <h4 style={{ margin: '18px 0 6px 0', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>📝 裝備說明與規格</h4>
                  <p className="detail-description" style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '6px 0', textAlign: 'left', minHeight: '60px' }}>
                    {selectedEquipment.description ? selectedEquipment.description : '目前無此裝備的詳細描述。若有疑問請洽社團幹部。'}
                  </p>
                </div>
              </div>
            </div>

            <div className="detail-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
              <div className="detail-qty-section" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>預約數量：</span>
                {(() => {
                  const currentQty = form.cart[selectedEquipment.id] || 0;
                  return currentQty === 0 ? (
                    <button
                      className="add-to-cart-btn modal-add-btn"
                      onClick={() => updateCart(selectedEquipment.id, 1, selectedEquipment.remainQty)}
                      disabled={selectedEquipment.remainQty <= 0}
                      style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', cursor: 'pointer' }}
                    >
                      {selectedEquipment.remainQty <= 0 ? '庫存不足' : '加入預訂'}
                    </button>
                  ) : (
                    <div className="quantity-controller" style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                      <button className="qty-btn" onClick={() => updateCart(selectedEquipment.id, -1, selectedEquipment.remainQty)} style={{ border: 'none', background: 'transparent', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}>-</button>
                      <span className="qty-number" style={{ padding: '0 8px', fontSize: '13px', minWidth: '20px', textAlign: 'center' }}>{currentQty}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateCart(selectedEquipment.id, 1, selectedEquipment.remainQty)}
                        disabled={currentQty >= selectedEquipment.remainQty}
                        style={{ border: 'none', background: 'transparent', padding: '6px 10px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        +
                      </button>
                    </div>
                  );
                })()}
              </div>
              <button 
                className="btn btn-secondary close-btn-bottom" 
                onClick={() => setSelectedEquipment(null)}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer', fontSize: '13px', color: '#475569' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Borrow;

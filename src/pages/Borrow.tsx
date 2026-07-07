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
}

interface FormState {
  pickupDate: string;
  returnDate: string;
  purpose: string;
  cart: Record<string, number>; // 動態的 Key-Value，例如 { 'E01': 2 }
}

interface ApiResponse {
  status: string;
  data: Equipment[];
  message?: string;
}

// 根據商品名稱渲染對應的 SVG 圖示與漸層背景
function ProductImage({ name }: { name: string }) {
  const lowercaseName = name.toLowerCase();
  
  // 帳篷
  if (lowercaseName.includes('帳') || lowercaseName.includes('tent')) {
    return (
      <div className="product-img-container bg-tent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 20L12 4L22 20H2Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 4V20" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 20L12 12L17 20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // 睡墊/睡袋
  if (lowercaseName.includes('墊') || lowercaseName.includes('pad') || lowercaseName.includes('sleeping')) {
    return (
      <div className="product-img-container bg-pad">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="6" width="18" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 10H21" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 14H21" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7" cy="8" r="1" fill="currentColor" />
        </svg>
      </div>
    );
  }
  // 背包
  if (lowercaseName.includes('包') || lowercaseName.includes('pack')) {
    return (
      <div className="product-img-container bg-pack">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="6" width="14" height="14" rx="3" />
          <path d="M9 6V3H15V6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 11H19" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 11V20" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 11V20" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // 登山杖
  if (lowercaseName.includes('杖') || lowercaseName.includes('pole') || lowercaseName.includes('stick')) {
    return (
      <div className="product-img-container bg-pole">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 3L6 21" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 21H7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 8L15 9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 13L12 14" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M18 3C19 3 20 4 20 5C20 6 19 7 18 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // 鋼盆/炊具
  if (lowercaseName.includes('盆') || lowercaseName.includes('鍋') || lowercaseName.includes('cook')) {
    return (
      <div className="product-img-container bg-bowl">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10h18v1a7 7 0 0 1-14 0v-1Z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 6V10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 5V10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 6V10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // 預設 (其他裝備)
  return (
    <div className="product-img-container bg-default">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 22H22L12 2Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="14" r="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
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

  const [form, setForm] = useState<FormState>({
    pickupDate: '',
    returnDate: '',
    purpose: '社團出團',
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

  // 計算購物車總租金 (前 2 天為基本租金，之後每天加收 priceExtra)
  const totalPrice = useMemo(() => {
    const rawTotal = Object.entries(form.cart).reduce((sum, [id, qty]) => {
      const equip = equipments.find(item => item.id === id);
      if (!equip) return sum;
      const extraDays = Math.max(0, rentalDays - 2);
      const itemPrice = equip.price + extraDays * (equip.priceExtra || 0);
      return sum + (itemPrice * qty);
    }, 0);

    if (form.purpose === '社團出團') {
      return 0; // 用於社團活動免費
    }
    if (isOfficial) {
      return Math.round(rawTotal * 0.5); // 社員個人使用 5 折
    }
    return rawTotal; // 非社員個人使用全額
  }, [form.cart, equipments, rentalDays, form.purpose, isOfficial]);

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
    if (form.purpose === '社團出團') {
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
                <div key={item.id} className={`product-card ${currentQty > 0 ? 'selected' : ''}`}>
                  <ProductImage name={item.name} />
                  
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
                          onClick={() => updateCart(item.id, 1, item.remainQty)}
                          disabled={isOutOfStock}
                        >
                          {isOutOfStock ? '無法租借' : '加入租借單'}
                        </button>
                      ) : (
                        <div className="quantity-controller">
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
            <div className="floating-price-desc">
              <span className="floating-total-label">預估金額</span>
              <span className="floating-price">${totalPrice}</span>
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
                                ${ (item.price + Math.max(0, rentalDays - 2) * (item.priceExtra || 0)) * qty }
                              </strong>
                              {form.purpose === '社團出團' ? ' (社團出團免費 $0)' : isOfficial ? ' (社員個人 5 折)' : ''}
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
                      <label htmlFor="purpose">出團目的 / 用途</label>
                      <select 
                        id="purpose"
                        name="purpose"
                        value={form.purpose}
                        onChange={handleInputChange}
                        className="custom-select"
                      >
                        <option value="社團出團">社團出團</option>
                        <option value="個人露營">個人露營</option>
                        <option value="登山活動">登山活動</option>
                        <option value="其他用途">其他用途</option>
                      </select>
                    </div>
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
                  <div className="summary-row total-row" style={{ borderBottom: formulaString ? 'none' : '1px solid var(--border-color)', paddingBottom: formulaString ? '0' : '8px' }}>
                    <span>預估總租金</span>
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
    </div>
  );
}

export default Borrow;

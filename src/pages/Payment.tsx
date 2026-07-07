import { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import '../App.css';

interface UnpaidItem {
  id: string;
  name: string;
  amount: number;
}

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

function Payment({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unpaidList, setUnpaidList] = useState<{ membership: UnpaidItem[], activities: UnpaidItem[], equipments: UnpaidItem[] }>({
    membership: [],
    activities: [],
    equipments: []
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [last5Digits, setLast5Digits] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 1. 載入未繳費項目
  useEffect(() => {
    const fetchUnpaid = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${GAS_API_URL}?action=get_unpaid&userId=${userId}`);
        const result = await res.json();
        if (result.status === 'success') {
          setUnpaidList(result.data);
          // 預設全選
          const allIds = [
            ...result.data.membership.map((item: UnpaidItem) => item.id),
            ...result.data.activities.map((item: UnpaidItem) => item.id),
            ...result.data.equipments.map((item: UnpaidItem) => item.id)
          ];
          setSelectedIds(allIds);
        } else {
          setError(result.message || '無法取得未繳費資料');
        }
      } catch (err: any) {
        console.error('取得未繳費資料失敗:', err);
        setError('連線失敗，請檢查網路狀態');
      } finally {
        setLoading(false);
      }
    };

    if (userId && userId !== 'TEST_USER_ID') {
      fetchUnpaid();
    } else {
      // 測試帳號載入假資料
      setUnpaidList({
        membership: [{ id: 'fee_membership', name: '113-1 學期社費 (Membership Fee)', amount: 200 }],
        activities: [
          { id: 'act_E01', name: '初級攀岩訓練營 (攀岩基礎與確保實作)', amount: 350 },
          { id: 'act_E02', name: '合歡群峰出隊費 (交通與入園保險)', amount: 1500 }
        ],
        equipments: [
          { id: 'eq_L001', name: '雙人高山帳篷 (租期: 2天)', amount: 100 },
          { id: 'eq_L002', name: '黑冰 Z400 羽絨睡袋 (租期: 2天)', amount: 120 }
        ]
      });
      setSelectedIds(['fee_membership', 'act_E01', 'eq_L001']);
      setLoading(false);
    }
  }, [userId]);

  // 所有項目的扁平化清單
  const allItemsFlat = useMemo(() => {
    return [
      ...unpaidList.membership.map(item => ({ ...item, type: 'membership', typeLabel: '社籍與社費' })),
      ...unpaidList.activities.map(item => ({ ...item, type: 'activity', typeLabel: '活動報名' })),
      ...unpaidList.equipments.map(item => ({ ...item, type: 'equipment', typeLabel: '裝備租用' }))
    ];
  }, [unpaidList]);

  // 計算已勾選的總金額
  const totalAmount = useMemo(() => {
    return allItemsFlat
      .filter(item => selectedIds.includes(item.id))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [allItemsFlat, selectedIds]);

  // 處理 Checkbox 切換
  const handleCheckboxChange = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 防呆判斷
  const isFormValid = useMemo(() => {
    const isDigitsOk = /^\d{5}$/.test(last5Digits.trim());
    return selectedIds.length > 0 && isDigitsOk;
  }, [selectedIds, last5Digits]);

  // 送出申報
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload = {
        action: 'submit_payment',
        userId,
        details: {
          selectedIds,
          last5Digits: last5Digits.trim(),
          totalAmount
        }
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (result.status === 'success') {
        // 發送 LINE 明細訊息並關閉 LIFF
        if (liff.isInClient()) {
          const selectedNames = allItemsFlat
            .filter(item => selectedIds.includes(item.id))
            .map(item => item.name);
            
          const msgText = `💰 【繳費申報完成 / Payment Submitted】\n\n` +
            `您好！已成功收到您的繳費申報資訊：\n` +
            `💵 申報金額：$${totalAmount}\n` +
            `🔢 帳號末5碼：${last5Digits.trim()}\n\n` +
            `📋 申報項目：\n` +
            selectedNames.map(n => `• ${n}`).join('\n') + `\n\n` +
            `幹部會於核對款項後自動更新您的狀態。謝謝！`;

          await liff.sendMessages([{
            type: 'text',
            text: msgText
          }]);
          liff.closeWindow();
        } else {
          setSubmitted(true);
        }
      } else {
        alert(result.message || '申報失敗，請聯繫管理員');
      }
    } catch (err) {
      console.error('申報異常:', err);
      alert('網路連線錯誤，請稍後再試！');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (submitted) {
    return (
      <div className="app-container" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div className="empty-cart-state">
          <span className="empty-icon">🎉</span>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--success-color)' }}>繳費申報成功！</h3>
          <p style={{ marginTop: '12px', color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
            已順利將對帳單發送至幹部審核群組。<br />
            款項確認無誤後，系統將自動以 LINE 訊息通知您。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">


      <main className="main-content" style={{ paddingBottom: '90px' }}>
        {/* 宣傳條 */}
        <div className="promo-banner" style={{ background: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)' }}>
          <div className="banner-content">
            <span className="banner-tag">對帳申報區</span>
            <h2>合併項目，輕鬆對帳</h2>
            <p>勾選多個欠繳項目，匯款後填入末 5 碼，即刻完成線上對帳申報</p>
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', margin: '16px 0', fontSize: '13px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 帳戶資訊卡 */}
        <div className="drawer-section" style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '16px' }}>
          <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--text-primary)' }}>🏦 社團指定匯款帳戶</h4>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            <p><strong>銀行名稱：</strong>中華郵政 (700)</p>
            <p><strong>匯款帳號：</strong>0001236-0489271</p>
            <p><strong>戶名：</strong>國立台灣科技大學登山社</p>
          </div>
          <div style={{ fontSize: '11px', color: '#b45309', backgroundColor: '#fef3c7', padding: '8px 12px', borderRadius: '8px', marginTop: '10px' }}>
            * 請務必依照「已選項目總金額」進行匯款，切勿分開或多匯，以免無法對帳。
          </div>
        </div>

        {/* 未繳費清單 */}
        <div className="drawer-section" style={{ backgroundColor: 'white', marginTop: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '16px' }}>
          <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>📋 您的未繳費項目</h4>
          
          {loading ? (
            <div className="loading-state" style={{ padding: '24px 0' }}>
              <div className="spinner"></div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>撈取欠繳帳單中，請稍候...</p>
            </div>
          ) : allItemsFlat.length === 0 ? (
            <div className="empty-cart-state" style={{ padding: '24px 0' }}>
              <span className="empty-icon">👍</span>
              <h5 style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--success-color)' }}>目前無欠繳費用</h5>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>太棒了！您所有的費用均已結清。</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allItemsFlat.map(item => (
                <label 
                  key={item.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    padding: '12px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    backgroundColor: selectedIds.includes(item.id) ? '#f0fdf4' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedIds.includes(item.id)}
                    onChange={() => handleCheckboxChange(item.id)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                        {item.typeLabel}
                      </span>
                      <strong style={{ color: 'var(--primary-color)', fontSize: '14px' }}>${item.amount}</strong>
                    </div>
                    <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-primary)', fontWeight: '500' }}>{item.name}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 匯款資料填寫與送出 */}
        {!loading && allItemsFlat.length > 0 && (
          <form onSubmit={handleFormSubmit} className="drawer-section" style={{ backgroundColor: 'white', marginTop: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '16px' }}>
            <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>✍️ 填寫匯款資料</h4>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>結帳總金額 (已自動計算)</label>
              <input 
                type="text" 
                value={`$${totalAmount}`} 
                disabled 
                style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '16px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>您的匯款帳號「末 5 碼」</label>
              <input 
                type="text" 
                placeholder="例如 12345" 
                maxLength={5}
                value={last5Digits}
                onChange={(e) => setLast5Digits(e.target.value.replace(/\D/g, ''))} // 只允許數字
                required
                style={{ fontSize: '15px' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>請確實填寫網銀轉帳帳號或實體存摺的末 5 碼數字，否則幹部無法成功對帳。</p>
            </div>

            <button 
              type="submit" 
              className="submit-btn" 
              disabled={!isFormValid || isSubmitting}
              style={{ 
                width: '100%', 
                backgroundColor: isFormValid ? 'var(--primary-color)' : '#cbd5e1', 
                color: 'white', 
                padding: '14px', 
                borderRadius: '8px', 
                fontWeight: 'bold',
                fontSize: '15px',
                border: 'none',
                cursor: isFormValid ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.2s'
              }}
            >
              {isSubmitting ? '申報送出中...' : '確認申報繳費'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default Payment;

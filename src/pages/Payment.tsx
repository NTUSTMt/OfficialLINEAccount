import { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import '../App.css';

interface UnpaidItem {
  id: string;
  name: string;
  amount: number;
  orderId?: string;
  pickupDate?: string;
  returnDate?: string;
  qty?: number;
  purpose?: string;
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
  const [membershipOption, setMembershipOption] = useState<'thisSem' | 'nextSem' | 'undergrad' | 'master'>('thisSem');

  // 取得現在日期推算當前學期與相關方案到期日
  const semesterInfo = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1-12
    let rocYear = year - 1911;
    let semester = 1;
    
    if (month >= 2 && month <= 7) {
      rocYear = rocYear - 1;
      semester = 2;
    } else if (month >= 8) {
      semester = 1;
    } else { // 1月
      rocYear = rocYear - 1;
      semester = 1;
    }

    const thisSemStr = `${rocYear}-${semester}`;
    const thisSemEndDate = semester === 1 ? `${year + 1}/01/31` : `${year}/07/31`;

    let nextRocYear = rocYear;
    let nextSem = 1;
    let nextYear = year;
    if (semester === 1) {
      nextSem = 2;
    } else {
      nextRocYear = rocYear + 1;
      nextSem = 1;
      nextYear = year + 1;
    }
    const nextSemStr = `${nextRocYear}-${nextSem}`;
    const nextSemEndDate = nextSem === 1 ? `${nextYear + 1}/01/31` : `${nextYear}/07/31`;

    const undergradGradYear = year + 4;
    const undergradGradDate = `${undergradGradYear}/06/30`;

    const masterGradYear = year + 2;
    const masterGradDate = `${masterGradYear}/06/30`;

    return {
      thisSemStr,
      thisSemEndDate,
      nextSemStr,
      nextSemEndDate,
      undergradGradDate,
      masterGradDate
    };
  }, []);

  const membershipDetails = useMemo(() => {
    switch (membershipOption) {
      case 'nextSem':
        return {
          amount: 200,
          name: `${semesterInfo.nextSemStr} 學期社費 (Membership Fee - Next Semester)`,
          expiryDate: semesterInfo.nextSemEndDate
        };
      case 'undergrad':
        return {
          amount: 800,
          name: `直到畢業社費-大學部 (Membership Fee - Until Graduation)`,
          expiryDate: semesterInfo.undergradGradDate
        };
      case 'master':
        return {
          amount: 400,
          name: `直到畢業社費-研究所 (Membership Fee - Until Graduation)`,
          expiryDate: semesterInfo.masterGradDate
        };
      case 'thisSem':
      default:
        return {
          amount: 200,
          name: `${semesterInfo.thisSemStr} 學期社費 (Membership Fee - Current Semester)`,
          expiryDate: semesterInfo.thisSemEndDate
        };
    }
  }, [membershipOption, semesterInfo]);

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
          { id: 'eq_R0720141530', name: '雙人高山帳篷', amount: 100, orderId: 'R0720141530', qty: 1, pickupDate: '2026-07-25', returnDate: '2026-07-27', purpose: '個人使用' },
          { id: 'eq_R0720141530', name: '黑冰 Z400 羽絨睡袋', amount: 120, orderId: 'R0720141530', qty: 2, pickupDate: '2026-07-25', returnDate: '2026-07-27', purpose: '個人使用' }
        ]
      });
      setSelectedIds(['fee_membership', 'act_E01', 'eq_R0720141530']);
      setLoading(false);
    }
  }, [userId]);

  // 所有項目的扁平化清單 (社費部分動態計算金額與名稱)
  const allItemsFlat = useMemo(() => {
    // 依據 orderId 分組裝備
    const equipGroups: { [orderId: string]: { id: string; orderId: string; purpose: string; amount: number; pickupDate: string; returnDate: string; items: { name: string; qty: number; amount: number }[] } } = {};
    
    unpaidList.equipments.forEach(item => {
      const orderId = item.orderId || 'unknown';
      const purpose = item.purpose || '個人使用';
      const isClubOuting = purpose === '社團出隊' || purpose === '社團出團';
      const amount = isClubOuting ? 0 : item.amount;

      if (!equipGroups[orderId]) {
        equipGroups[orderId] = {
          id: item.id, // eq_orderId
          orderId: orderId,
          purpose: purpose,
          amount: 0,
          pickupDate: item.pickupDate || '',
          returnDate: item.returnDate || '',
          items: []
        };
      }
      equipGroups[orderId].amount += amount;
      equipGroups[orderId].items.push({
        name: item.name,
        qty: item.qty || 1,
        amount: isClubOuting ? 0 : item.amount
      });
    });

    const groupedEquips = Object.values(equipGroups).map(group => {
      const namesList = group.items.map(it => `${it.name} x${it.qty}`).join(', ');
      return {
        id: group.id,
        orderId: group.orderId,
        purpose: group.purpose,
        name: namesList,
        amount: group.amount,
        pickupDate: group.pickupDate,
        returnDate: group.returnDate,
        items: group.items,
        type: 'equipment',
        typeLabel: '裝備租用'
      };
    });

    return [
      ...unpaidList.membership.map(item => ({
        ...item,
        name: membershipDetails.name,
        amount: membershipDetails.amount,
        type: 'membership',
        typeLabel: '社籍與社費',
        orderId: undefined,
        pickupDate: undefined,
        returnDate: undefined,
        items: undefined,
        purpose: undefined
      })),
      ...unpaidList.activities.map(item => ({
        ...item,
        type: 'activity',
        typeLabel: '活動報名',
        orderId: undefined,
        pickupDate: undefined,
        returnDate: undefined,
        items: undefined,
        purpose: undefined
      })),
      ...groupedEquips
    ];
  }, [unpaidList, membershipDetails]);

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

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', margin: '16px 0', fontSize: '13px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 帳戶資訊卡 */}
        <div className="drawer-section" style={{ backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '16px' }}>
          <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--text-primary)' }}>🏦 社團指定匯款帳戶</h4>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            <p><strong>銀行名稱：</strong>連線商業銀行 (824)（LINE Bank）</p>
            <p><strong>匯款帳號：</strong>111019636700</p>
            <p><strong>戶名：</strong>曹洧祥（登山社財務）</p>
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
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>取得待繳項目中，請稍候...</p>
            </div>
          ) : allItemsFlat.length === 0 ? (
            <div className="empty-cart-state" style={{ padding: '24px 0' }}>
              <span className="empty-icon">👍</span>
              <h5 style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--success-color)' }}>目前無待繳費用</h5>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>太棒了！您所有的費用均已結清。</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {allItemsFlat.map(item => (
                <div 
                  key={item.id} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    padding: item.type === 'equipment' ? '16px' : '12px', 
                    borderRadius: '12px', 
                    border: item.type === 'equipment' 
                      ? (selectedIds.includes(item.id) ? '2px solid var(--primary-color)' : '2px solid #cbd5e1')
                      : '1px solid var(--border-color)',
                    backgroundColor: selectedIds.includes(item.id) ? '#f0fdf4' : 'white',
                    boxShadow: item.type === 'equipment' ? '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' : 'none',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => handleCheckboxChange(item.id)}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(item.id)}
                      readOnly
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                          {item.typeLabel}
                        </span>
                        <strong style={{ color: 'var(--primary-color)', fontSize: '14px' }}>${item.amount}</strong>
                      </div>
                      <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-primary)', fontWeight: '500' }}>
                        {item.type === 'equipment' 
                          ? ((item.purpose === '社團出隊' || item.purpose === '社團出團') ? '裝備租用 (社團出隊)' : '裝備租用 (個人使用)')
                          : item.name}
                      </p>
                    </div>
                  </div>

                  {item.type === 'membership' && (
                    <div 
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        fontSize: '13px'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px', fontSize: '13px' }}>
                        💡 社費說明 (Fee Details)：
                      </div>
                      <ul style={{ margin: '0 0 12px 16px', padding: 0, color: '#475569', lineHeight: '1.6', fontSize: '12px', listStyleType: 'disc' }}>
                        <li>一學期 (per semester)：<strong>$200</strong></li>
                        <li>直到畢業 (until graduation)：<strong>$800 (大學部 Undergraduate) / $400 (研究所 Master)</strong></li>
                      </ul>
                      
                      <label style={{ display: 'block', fontWeight: 'bold', color: '#475569', marginBottom: '6px', fontSize: '12px' }}>
                        請選擇您的社費方案 (Select Scheme)：
                      </label>
                      <select 
                        value={membershipOption}
                        onChange={(e) => setMembershipOption(e.target.value as any)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: 'white',
                          fontSize: '13px',
                          color: '#1e293b',
                          outline: 'none'
                        }}
                      >
                        <option value="thisSem">一學期 - 當前學期 {semesterInfo.thisSemStr} ($200，預計到期 {semesterInfo.thisSemEndDate})</option>
                        <option value="nextSem">一學期 - 下一學期 {semesterInfo.nextSemStr} ($200，預計到期 {semesterInfo.nextSemEndDate})</option>
                        <option value="undergrad">直到畢業 - 大學部 ($800，預計到期 {semesterInfo.undergradGradDate})</option>
                        <option value="master">直到畢業 - 研究所 ($400，預計到期 {semesterInfo.masterGradDate})</option>
                      </select>
                    </div>
                  )}

                  {item.type === 'equipment' && (
                    <div 
                      style={{
                        marginTop: '10px',
                        padding: '12px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px dotted #cbd5e1',
                        fontSize: '13px',
                        color: '#475569'
                      }}
                    >
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
                        📅 租借日期 (Rental Period)：
                        <span style={{ color: 'var(--primary-color)', marginLeft: '4px', fontWeight: 'bold' }}>
                          {item.pickupDate} ~ {item.returnDate}
                        </span>
                      </div>
                      
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                        📦 租借項目明細：
                      </div>
                      <ul style={{ margin: '0 0 10px 16px', padding: 0, lineHeight: '1.6', fontSize: '12.5px', listStyleType: 'disc' }}>
                        {item.items?.map((sub, idx) => (
                          <li key={idx} style={{ color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><strong>{sub.name}</strong> × {sub.qty} 件</span>
                            <span style={{ color: '#64748b' }}>${sub.amount}</span>
                          </li>
                        ))}
                      </ul>
                      
                      <div style={{ fontSize: '11px', color: '#dc2626', backgroundColor: '#fef2f2', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                        💡 貼心提醒：需要修改訂單的話，請到個人頁面取消訂單再重新租借一次。
                      </div>
                    </div>
                  )}
                </div>
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

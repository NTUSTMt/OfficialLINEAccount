import { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertCircle, Copy, Check, Building2 } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
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
  isOfficial?: string;
}

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

function Payment({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unpaidList, setUnpaidList] = useState<{ membership: UnpaidItem[], activities: UnpaidItem[], equipments: UnpaidItem[] }>({
    membership: [],
    activities: [],
    equipments: []
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [last5Digits, setLast5Digits] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [membershipOption, setMembershipOption] = useState<'thisSem' | 'undergrad' | 'master'>('thisSem');

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText('111019636700');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('複製失敗:', err);
    }
  };

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

    const undergradGradYear = year + 4;
    const undergradGradDate = `${undergradGradYear}/06/30`;

    const masterGradYear = year + 2;
    const masterGradDate = `${masterGradYear}/06/30`;

    return {
      thisSemStr,
      thisSemEndDate,
      undergradGradDate,
      masterGradDate
    };
  }, []);

  const membershipDetails = useMemo(() => {
    switch (membershipOption) {
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
        const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_unpaid&userId=${userId}`));
        const result = await res.json();
        if (result.status === 'success') {
          setUnpaidList(result.data);
          // 預設勾選活動與裝備，社費預設為未勾選
          const initialSelectedIds = [
            ...result.data.activities.map((item: UnpaidItem) => item.id),
            ...result.data.equipments.map((item: UnpaidItem) => item.id)
          ];
          setSelectedIds(initialSelectedIds);
        } else {
          setError(result.message || t('payment.error.loadFailed'));
        }
      } catch (err: any) {
        console.error('取得未繳費資料失敗:', err);
        setError(t('payment.error.networkError'));
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
          { id: 'eq_R0720141530', name: '雙人高山帳篷', amount: 100, orderId: 'R0720141530', qty: 1, pickupDate: '2026-07-25', returnDate: '2026-07-27', purpose: '個人使用', isOfficial: '否' },
          { id: 'eq_R0720141530', name: '黑冰 Z400 羽絨睡袋', amount: 120, orderId: 'R0720141530', qty: 2, pickupDate: '2026-07-25', returnDate: '2026-07-27', purpose: '個人使用', isOfficial: '否' }
        ]
      });
      setSelectedIds(['act_E01', 'eq_R0720141530']);
      setLoading(false);
    }
  }, [userId]);

  // 所有項目的扁平化清單 (社費部分動態計算金額與名稱，裝備部分若同時繳社費享 5 折)
  const allItemsFlat = useMemo(() => {
    const hasMembershipSelected = selectedIds.includes('fee_membership');

    // 依據 orderId 分組裝備
    const equipGroups: { 
      [orderId: string]: { 
        id: string; 
        orderId: string; 
        purpose: string; 
        isOfficial: string;
        amount: number; 
        pickupDate: string; 
        returnDate: string; 
        items: { name: string; qty: number; amount: number }[] 
      } 
    } = {};
    
    unpaidList.equipments.forEach(item => {
      const orderId = item.orderId || 'unknown';
      const purpose = item.purpose || '個人使用';
      const isClubOuting = purpose === '社團出隊' || purpose === '社團出團';
      const amount = isClubOuting ? 0 : item.amount;
      const isOfficial = item.isOfficial || '否';

      if (!equipGroups[orderId]) {
        equipGroups[orderId] = {
          id: item.id, // eq_orderId
          orderId: orderId,
          purpose: purpose,
          isOfficial: isOfficial,
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
      const isClubOuting = group.purpose === '社團出隊' || group.purpose === '社團出團';
      // 判斷是否可享 5 折：非社團出隊且租借時非社員（若租借時已是社員，已於租借時折算）
      const canDiscount = !isClubOuting && group.isOfficial !== '是' && group.amount > 0;
      const isDiscounted = canDiscount && hasMembershipSelected;
      const originalAmount = group.amount;
      const finalAmount = isDiscounted ? Math.round(originalAmount * 0.5) : originalAmount;
      const discountDiff = originalAmount - Math.round(originalAmount * 0.5);

      const processedItems = group.items.map(it => {
        const itemOrigAmount = it.amount;
        const itemFinalAmount = isDiscounted ? Math.round(itemOrigAmount * 0.5) : itemOrigAmount;
        return {
          ...it,
          originalAmount: itemOrigAmount,
          amount: itemFinalAmount,
          isDiscounted: isDiscounted && itemOrigAmount > 0
        };
      });

      return {
        id: group.id,
        orderId: group.orderId,
        purpose: group.purpose,
        isOfficial: group.isOfficial,
        name: namesList,
        amount: finalAmount,
        originalAmount: originalAmount,
        discountDiff: discountDiff,
        canDiscount: canDiscount,
        isDiscounted: isDiscounted,
        pickupDate: group.pickupDate,
        returnDate: group.returnDate,
        items: processedItems,
        type: 'equipment' as const,
        typeLabel: t('payment.type.equipment')
      };
    });

    return [
      ...unpaidList.membership.map(item => ({
        ...item,
        name: membershipDetails.name,
        amount: membershipDetails.amount,
        type: 'membership' as const,
        typeLabel: t('payment.type.membership'),
        orderId: undefined,
        pickupDate: undefined,
        returnDate: undefined,
        items: undefined,
        purpose: undefined,
        isOfficial: undefined,
        originalAmount: membershipDetails.amount,
        discountDiff: 0,
        canDiscount: false,
        isDiscounted: false
      })),
      ...unpaidList.activities.map(item => ({
        ...item,
        type: 'activity' as const,
        typeLabel: t('payment.type.activity'),
        orderId: undefined,
        pickupDate: undefined,
        returnDate: undefined,
        items: undefined,
        purpose: undefined,
        isOfficial: undefined,
        originalAmount: item.amount,
        discountDiff: 0,
        canDiscount: false,
        isDiscounted: false
      })),
      ...groupedEquips
    ];
  }, [unpaidList, membershipDetails, selectedIds, t]);

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
          totalAmount,
          note: note.trim()
        }
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(withAuthPayload(payload))
      });
      
      const result = await res.json();
      if (result.status === 'success') {
        // 發送 LINE 明細訊息並關閉 LIFF
        if (liff.isInClient()) {
          const selectedItems = allItemsFlat
            .filter(item => selectedIds.includes(item.id));

          const selectedNames = selectedItems.map(item => {
            if (item.type === 'equipment' && item.isDiscounted) {
              return `${item.name} (${t('payment.equip.discountApplied')})`;
            }
            return item.name;
          });
            
          const msgText = `【${t('payment.msg.title')}】\n\n` +
            `${t('payment.msg.success')}\n` +
            `${t('payment.msg.amount')}：$${totalAmount}\n` +
            `${t('payment.msg.digits')}：${last5Digits.trim()}\n` +
            (note.trim() ? `備註：${note.trim()}\n` : '') +
            `\n` +
            `${t('payment.msg.items')}：\n` +
            selectedNames.map(n => `• ${n}`).join('\n') + `\n\n` +
            `${t('payment.msg.footer')}`;

          await liff.sendMessages([{
            type: 'text',
            text: msgText
          }]);
          liff.closeWindow();
        } else {
          setSubmitted(true);
        }
      } else {
        alert(t('payment.alert.submitFailed', { message: result.message || t('payment.alert.contactAdmin') }));
      }
    } catch (err) {
      console.error('申報異常:', err);
      alert(t('payment.error.networkError'));
    } finally {
      setIsSubmitting(false);
    }
  };


  if (submitted) {
    return (
      <div className="app-container" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div className="empty-cart-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <CheckCircle2 size={40} color="#10b981" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--success-color)' }}>{t('payment.submitted.title')}</h3>
          <p style={{ marginTop: '12px', color: '#666', fontSize: '14px', lineHeight: '1.6' }}>
            {t('payment.submitted.description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">


      <main className="main-content" style={{ paddingBottom: '90px' }}>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: '8px', margin: '16px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* 帳戶資訊卡 (靠左對齊，支援點擊複製) */}
        <div className="drawer-section" style={{ backgroundColor: 'white', padding: '16px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '16px', textAlign: 'left' }}>
          <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' }}>
            <Building2 size={16} color="#059669" />
            <span>{t('payment.account.title')}</span>
          </h4>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.9', textAlign: 'left' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>{t('payment.account.bankLabel')}</strong>{t('payment.account.bankName')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0', flexWrap: 'wrap' }}>
              <strong>{t('payment.account.accountLabel')}</strong>
              <span 
                onClick={handleCopyAccount}
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '15px', 
                  fontWeight: 'bold', 
                  color: '#0f172a',
                  backgroundColor: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid #cbd5e1'
                }}
                title="點擊複製帳號"
              >
                111019636700
              </span>
              <button
                type="button"
                onClick={handleCopyAccount}
                title={copied ? "已複製帳號！" : "點擊複製帳號"}
                aria-label={copied ? "已複製帳號" : "複製帳號"}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '5px',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  backgroundColor: copied ? '#ecfdf5' : 'white',
                  color: '#059669',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {copied ? <Check size={14} color="#059669" /> : <Copy size={14} color="#059669" />}
              </button>
            </div>
            <div>
              <strong>{t('payment.account.nameLabel')}</strong>{t('payment.account.nameValue')}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#b45309', backgroundColor: '#fef3c7', padding: '8px 12px', borderRadius: '8px', marginTop: '10px', textAlign: 'left', lineHeight: '1.6' }}>
            {t('payment.account.note')}
          </div>
        </div>

        {/* 未繳費清單 */}
        <div className="drawer-section" style={{ backgroundColor: 'white', marginTop: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', padding: '16px', textAlign: 'left' }}>
          <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)', textAlign: 'left' }}>{t('payment.list.title')}</h4>
          
          {loading ? (
            <div className="loading-state" style={{ padding: '24px 0', textAlign: 'center' }}>
              <div className="spinner"></div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>{t('payment.list.loading')}</p>
            </div>
          ) : allItemsFlat.length === 0 ? (
            <div className="empty-cart-state" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                <CheckCircle2 size={28} color="#10b981" />
              </div>
              <h5 style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--success-color)' }}>{t('payment.list.emptyTitle')}</h5>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('payment.list.emptyText')}</p>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                            {item.typeLabel}
                          </span>
                          {item.type === 'equipment' && item.isDiscounted && (
                            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold' }}>
                              {t('payment.equip.discountBadge')}
                            </span>
                          )}
                        </div>
                        <div>
                          {item.type === 'equipment' && item.isDiscounted && (
                            <del style={{ color: '#94a3b8', marginRight: '6px', fontSize: '13px' }}>${item.originalAmount}</del>
                          )}
                          <strong style={{ color: 'var(--primary-color)', fontSize: '14px' }}>${item.amount}</strong>
                        </div>
                      </div>
                      <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-primary)', fontWeight: '500' }}>
                        {item.type === 'equipment' 
                          ? ((item.purpose === '社團出隊' || item.purpose === '社團出團') ? t('payment.list.equipClub') : t('payment.list.equipPersonal'))
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
                        {t('payment.membership.title')}
                      </div>
                      <ul style={{ margin: '0 0 12px 16px', padding: 0, color: '#475569', lineHeight: '1.6', fontSize: '12px', listStyleType: 'disc' }}>
                        <li>{t('payment.membership.semesterLabel')}<strong>$200</strong></li>
                        <li>{t('payment.membership.graduationLabel')}<strong>{t('payment.membership.graduationValue')}</strong></li>
                      </ul>
                      
                      <label style={{ display: 'block', fontWeight: 'bold', color: '#475569', marginBottom: '6px', fontSize: '12px' }}>
                        {t('payment.membership.selectLabel')}
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
                        <option value="thisSem">{t('payment.membership.optionThisSem', { sem: semesterInfo.thisSemStr, date: semesterInfo.thisSemEndDate })}</option>
                        <option value="undergrad">{t('payment.membership.optionUndergrad', { date: semesterInfo.undergradGradDate })}</option>
                        <option value="master">{t('payment.membership.optionMaster', { date: semesterInfo.masterGradDate })}</option>
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
                        {t('payment.equip.dateLabel')}
                        <div style={{ color: 'var(--primary-color)', marginTop: '4px', fontWeight: 'bold' }}>
                          {item.pickupDate} ~ {item.returnDate}
                        </div>
                      </div>
                      
                      <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                        {t('payment.equip.itemsLabel')}
                      </div>
                      <ul style={{ margin: '0 0 10px 16px', padding: 0, lineHeight: '1.6', fontSize: '12.5px', listStyleType: 'disc' }}>
                        {item.items?.map((sub, idx) => (
                          <li key={idx} style={{ color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><strong>{sub.name}</strong> × {sub.qty} {t('payment.equip.qtyUnit')}</span>
                            <span style={{ color: '#64748b' }}>
                              {sub.isDiscounted && (
                                <del style={{ color: '#94a3b8', marginRight: '6px', fontSize: '12px' }}>${sub.originalAmount}</del>
                              )}
                              ${sub.amount}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {unpaidList.membership.length > 0 && item.canDiscount && !item.isDiscounted && (
                        <div style={{ fontSize: '11.5px', color: '#0369a1', backgroundColor: '#e0f2fe', padding: '6px 10px', borderRadius: '6px', fontWeight: '600', marginBottom: '8px', display: 'block', width: '100%', boxSizing: 'border-box' }}>
                          {t('payment.equip.discountTip', { save: item.discountDiff })}
                        </div>
                      )}
                      
                      <div style={{ fontSize: '11px', color: '#dc2626', backgroundColor: '#fef2f2', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
                        {t('payment.equip.modifyTip')}
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
            <h4 style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>{t('payment.form.title')}</h4>
            
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>{t('payment.form.amountLabel')}</label>
              <input 
                type="text" 
                value={`$${totalAmount}`} 
                disabled 
                style={{ backgroundColor: '#f1f5f9', fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '16px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>{t('payment.form.digitsLabel')}</label>
              <input 
                type="text" 
                placeholder={t('payment.form.digitsPlaceholder')} 
                maxLength={5}
                value={last5Digits}
                onChange={(e) => setLast5Digits(e.target.value.replace(/\D/g, ''))} // 只允許數字
                required
                style={{ fontSize: '15px' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'left' }}>{t('payment.form.digitsTip')}</p>
            </div>

            <div className="form-group" style={{ marginBottom: '20px', textAlign: 'left' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                {t('payment.form.noteLabel', '匯款備註 (選填)')}
              </label>
              <input 
                type="text" 
                placeholder={t('payment.form.notePlaceholder', '例如：王小明轉帳、兩筆合併匯款等備註說明')} 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={50}
                style={{ fontSize: '14px' }}
              />
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('payment.form.noteTip', '此備註將同步顯示於幹部通知群組及繳費紀錄中。')}
              </p>
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
              {isSubmitting ? t('payment.form.submittingBtn') : t('payment.form.submitBtn')}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default Payment;

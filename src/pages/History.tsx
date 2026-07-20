import { useState, useEffect, useMemo } from 'react';
import '../App.css';

interface HistoryItem {
  id: string;
  date: string;
  type: string; // '社費' | '活動' | '裝備' | '全部'
  title: string;
  amount: number;
  last5Digits: string;
  status: string; // '已確認無誤' | '已確認' | '待確認' | '待核對' | '對帳失敗' | etc.
}

interface PaymentHistoryData {
  totalSpent: number;
  history: HistoryItem[];
}

function History({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaymentHistoryData | null>(null);
  const [activeTab, setActiveTab] = useState<'全部' | '社費' | '活動' | '裝備'>('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (userId && userId !== 'TEST_USER_ID') {
        const res = await fetch(`${GAS_API_URL}?action=get_payment_history&userId=${userId}`);
        const result = await res.json();
        if (result.status === 'success') {
          setData(result.data);
        } else {
          setError(result.message || '無法取得歷史繳費紀錄');
        }
      } else {
        // 測試假資料
        setData({
          totalSpent: 1700,
          history: [
            {
              id: 'row_15',
              date: '2026-07-05 10:30:00',
              type: '活動',
              title: '初級攀岩訓練營 (攀岩基礎與確保實作)',
              amount: 350,
              last5Digits: '12345',
              status: '已確認無誤'
            },
            {
              id: 'row_12',
              date: '2026-06-20 14:15:00',
              type: '社費',
              title: '114-2 學期社費 (Membership Fee - Current Semester)',
              amount: 200,
              last5Digits: '98765',
              status: '已確認無誤'
            },
            {
              id: 'row_10',
              date: '2026-06-10 11:20:00',
              type: '裝備',
              title: '黑冰 Z400 羽絨睡袋 (租期: 2天)',
              amount: 150,
              last5Digits: '55667',
              status: '待確認 Checking'
            },
            {
              id: 'row_9',
              date: '2026-05-01 09:00:00',
              type: '活動',
              title: '合歡群峰出隊費 (交通與入園保險)',
              amount: 1150,
              last5Digits: '12345',
              status: '已確認'
            }
          ]
        });
      }
    } catch (err) {
      console.error('取得歷史繳費紀錄失敗:', err);
      setError('連線失敗，請檢查網路狀態');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  // 篩選後明細
  const filteredHistory = useMemo(() => {
    if (!data) return [];
    if (activeTab === '全部') return data.history;
    return data.history.filter(item => item.type === activeTab);
  }, [data, activeTab]);

  // 目前待確認的款項個數
  const pendingCount = useMemo(() => {
    if (!data) return 0;
    return data.history.filter(item => 
      item.status.indexOf('待確認') > -1 || 
      item.status.indexOf('待核對') > -1 || 
      item.status.indexOf('Checking') > -1
    ).length;
  }, [data]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const getStatusStyle = (status: string) => {
    if (status.indexOf('確認') > -1 || status.indexOf('已繳') > -1 || status.indexOf('已確認') > -1) {
      return { bg: '#dcfce7', color: '#15803d', label: '🟢 已確認無誤' };
    }
    if (status.indexOf('失敗') > -1 || status.indexOf('退回') > -1 || status.indexOf('錯誤') > -1) {
      return { bg: '#fee2e2', color: '#b91c1c', label: '🔴 對帳失敗' };
    }
    return { bg: '#fef3c7', color: '#b45309', label: '🟡 待幹部確認' };
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case '社費': return '👤';
      case '活動': return '📅';
      case '裝備': return '🏕️';
      default: return '💰';
    }
  };

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>取得歷史帳單紀錄中...</p>
      </div>
    );
  }

  return (
    <div className="app-container animate-fade-in" style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
      
      {error && (
        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* 區塊一：個人帳務總覽 */}
      <div style={{
        background: 'linear-gradient(135deg, #065f46 0%, #0d9488 100%)',
        borderRadius: '16px',
        padding: '20px',
        color: 'white',
        boxShadow: '0 10px 20px -5px rgba(13, 148, 136, 0.3)',
        marginBottom: '24px',
        textAlign: 'left'
      }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, letterSpacing: '1px', fontWeight: 'bold' }}>Total Expense</span>
        <div style={{ fontSize: '32px', fontWeight: '800', margin: '4px 0 12px 0' }}>
          ${data?.totalSpent.toLocaleString() || 0}
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '12px' }}>
          <div>
            <span style={{ opacity: 0.8 }}>累計花費金額</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: pendingCount > 0 ? '#fbbf24' : '#34d399',
              display: 'inline-block'
            }}></span>
            <span>{pendingCount > 0 ? `${pendingCount} 筆繳費審核中` : '所有款項已結清'}</span>
          </div>
        </div>
      </div>

      {/* 區塊二：分類切換標籤 */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {(['全部', '社費', '活動', '裝備'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: activeTab === tab ? '#10b981' : '#f1f5f9',
              color: activeTab === tab ? 'white' : '#475569',
              fontWeight: 'bold',
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              boxShadow: activeTab === tab ? '0 4px 6px -1px rgba(16, 185, 129, 0.2)' : 'none'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 區塊三：歷史明細列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredHistory.length === 0 ? (
          <div className="empty-cart-state" style={{ padding: '40px 0', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <span className="empty-icon" style={{ fontSize: '36px' }}>📝</span>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>目前無該類別的繳費紀錄喔！</p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const statusConfig = getStatusStyle(item.status);
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => toggleExpand(item.id)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px'
                  }}>
                    {getTypeEmoji(item.type)}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: statusConfig.bg,
                        color: statusConfig.color,
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}>
                        {statusConfig.label}
                      </span>
                      <strong style={{ color: '#0f172a', fontSize: '16px' }}>+${item.amount}</strong>
                    </div>
                    
                    <p style={{
                      fontSize: '14px',
                      fontWeight: 'bold',
                      color: '#1e293b',
                      margin: '6px 0 4px 0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.title}
                    </p>
                    
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      申報時間: {item.date}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div 
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #f1f5f9',
                      fontSize: '12px',
                      color: '#475569',
                      lineHeight: '1.8'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div><strong>申報帳號末 5 碼 / 備註：</strong>{item.last5Digits || '無'}</div>
                    <div style={{ marginTop: '4px' }}>
                      <strong>說明：</strong>幹部對帳完成後，狀態會自動更新為「已確認無誤」。如有疑問，請在此帳號聯繫社團幹部。
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

export default History;

import { useState, useEffect } from 'react';
import '../App.css';

interface Reflection {
  difficulty: number;
  beauty: number;
  content: string;
  imageUrl: string;
}

interface Activity {
  eventId: string;
  title: string;
  date: string;
  img: string;
  hasReflected: boolean;
  reflection: Reflection | null;
}

interface AchievementData {
  totalAttended: number;
  reflectionsCount: number;
  activities: Activity[];
}

function Achievements({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AchievementData | null>(null);

  // Modal Form States
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [difficulty, setDifficulty] = useState(5);
  const [beauty, setBeauty] = useState(5);
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);

  const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (userId && userId !== 'TEST_USER_ID') {
        const res = await fetch(`${GAS_API_URL}?action=get_past_activities&userId=${userId}`);
        const result = await res.json();
        if (result.status === 'success') {
          setData(result.data);
        } else {
          setError(result.message || '無法取得歷史活動與成就');
        }
      } else {
        // 測試假資料
        setData({
          totalAttended: 3,
          reflectionsCount: 1,
          activities: [
            {
              eventId: 'evt_001',
              title: '合歡群峰出隊 (交通與山難教育訓練)',
              date: '2026/05/01',
              img: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400',
              hasReflected: true,
              reflection: {
                difficulty: 2,
                beauty: 5,
                content: '非常棒的入門路線！合歡主峰與東峰風景很漂亮，很適合帶新生。謝謝領隊貼心的照顧與入山宣導！',
                imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400'
              }
            },
            {
              eventId: 'evt_002',
              title: '玉山主峰線 (台灣第一高峰巡禮)',
              date: '2026/06/15',
              img: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400',
              hasReflected: false,
              reflection: null
            },
            {
              eventId: 'evt_003',
              title: '初級攀岩訓練營 (人工攀登與基本確保)',
              date: '2026/07/02',
              img: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400',
              hasReflected: false,
              reflection: null
            }
          ]
        });
      }
    } catch (err) {
      console.error('載入活動成就失敗:', err);
      setError('連線失敗，請檢查網路狀態');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  const openForm = (activity: Activity, viewOnly = false) => {
    setSelectedActivity(activity);
    setIsViewOnly(viewOnly);
    if (viewOnly && activity.reflection) {
      setDifficulty(activity.reflection.difficulty);
      setBeauty(activity.reflection.beauty);
      setContent(activity.reflection.content);
      setImageUrl(activity.reflection.imageUrl);
    } else {
      setDifficulty(5);
      setBeauty(5);
      setContent('');
      setImageUrl('');
    }
  };

  const closeForm = () => {
    setSelectedActivity(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) return;
    if (content.trim().length < 10) return alert('心得內容請至少輸入 10 個字喔！');

    setSubmitting(true);
    try {
      const payload = {
        action: 'submit_reflection',
        userId,
        details: {
          eventId: selectedActivity.eventId,
          eventName: selectedActivity.title,
          difficulty,
          beauty,
          content: content.trim(),
          imageUrl: imageUrl.trim()
        }
      };

      if (userId && userId !== 'TEST_USER_ID') {
        const res = await fetch(GAS_API_URL, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.status === 'success') {
          alert('🎉 感謝您的心得回饋！已經為您寫入成就牆囉！');
          closeForm();
          fetchData(); // 重新整理
        } else {
          alert('⚠️ 提交失敗：' + result.message);
        }
      } else {
        // 假資料本地模擬提交
        alert('🎉 感謝您的心得回饋！(本地模擬寫入成功)');
        closeForm();
        // 更新本地 state 模擬
        if (data) {
          const updated = data.activities.map(act => {
            if (act.eventId === selectedActivity.eventId) {
              return {
                ...act,
                hasReflected: true,
                reflection: { difficulty, beauty, content, imageUrl }
              };
            }
            return act;
          });
          setData({
            totalAttended: data.totalAttended,
            reflectionsCount: data.reflectionsCount + 1,
            activities: updated
          });
        }
      }
    } catch (err) {
      console.error('送出心得失敗:', err);
      alert('連線失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>正在載入您的登山足跡牆...</p>
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

      {/* 區塊一：成就統計看板 */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        borderRadius: '16px',
        padding: '20px',
        color: 'white',
        boxShadow: '0 10px 20px -5px rgba(59, 130, 246, 0.3)',
        marginBottom: '24px',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, letterSpacing: '1px', fontWeight: 'bold' }}>My Mountaineering Footprint</span>
          <div style={{ fontSize: '24px', fontWeight: '800', margin: '4px 0' }}>我的出隊成就</div>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>一步一腳印，記錄每一次出隊的回憶！</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', textAlign: 'center' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '10px 8px', borderRadius: '12px', minWidth: '72px' }}>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{data?.totalAttended || 0}</div>
            <div style={{ fontSize: '10px', opacity: 0.8, whiteSpace: 'nowrap' }}>出隊次數</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '10px 8px', borderRadius: '12px', minWidth: '72px' }}>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{data?.reflectionsCount || 0}</div>
            <div style={{ fontSize: '10px', opacity: 0.8, whiteSpace: 'nowrap' }}>回憶篇數</div>
          </div>
        </div>
      </div>

      {/* 區塊二：歷史活動相片牆 */}
      <div style={{ textAlign: 'left', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '16px', color: '#1e293b', fontWeight: 'bold', margin: '0 0 12px 0' }}>🏔️ 已參與活動清單</h3>
      </div>

      {data?.activities.length === 0 ? (
        <div className="empty-cart-state" style={{ padding: '60px 0', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span className="empty-icon" style={{ fontSize: '48px' }}>🧗</span>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '12px' }}>您目前還沒有已結束且正取的活動紀錄喔！</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>出隊成功後，即可解鎖心得撰寫功能。</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {data?.activities.map((item) => (
            <div
              key={item.eventId}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                display: 'flex',
                height: '110px',
                textAlign: 'left'
              }}
            >
              <div style={{
                width: '120px',
                backgroundImage: `url(${item.img})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                flexShrink: 0
              }}></div>

              <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                <div>
                  <h4 style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#0f172a',
                    margin: '0 0 4px 0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.title}
                  </h4>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>📅 出隊日期: {item.date}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  {item.hasReflected ? (
                    <button
                      onClick={() => openForm(item, true)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        color: '#475569',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      📖 查看我的回憶
                    </button>
                  ) : (
                    <button
                      onClick={() => openForm(item, false)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: 'none',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                      }}
                    >
                      ✏️ 留下回憶
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 區塊三：心得填寫/查看 Modal */}
      {selectedActivity && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            textAlign: 'left',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            position: 'relative'
          }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
              {isViewOnly ? '📖 路線出隊心得回顧' : '✏️ 填寫出隊心得回饋'}
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              {selectedActivity.title}
            </p>

            <form onSubmit={handleSubmit}>

              {/* 星等評分 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    路線難易度 (1~5 星)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={isViewOnly}
                        onClick={() => setDifficulty(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '22px',
                          cursor: isViewOnly ? 'default' : 'pointer',
                          color: star <= difficulty ? '#fbbf24' : '#cbd5e1',
                          padding: 0
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    風景推薦度 (1~5 星)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={isViewOnly}
                        onClick={() => setBeauty(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '22px',
                          cursor: isViewOnly ? 'default' : 'pointer',
                          color: star <= beauty ? '#fbbf24' : '#cbd5e1',
                          padding: 0
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 心得內容 */}
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="modalContent" style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  心得分享 (最少 10 字)
                </label>
                <textarea
                  id="modalContent"
                  disabled={isViewOnly}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="跟大家分享一下這次的收穫、山上的趣事，或是想特別感謝哪位幹部/嚮導吧！🏕️"
                  style={{
                    width: '100%',
                    height: '110px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    padding: '10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none'
                  }}
                  required
                />
              </div>

              {/* 照片分享 (選填) */}
              <div style={{ marginBottom: '24px' }}>
                <label htmlFor="modalImgUrl" style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  登頂照 / 團體合照網址 (選填)
                </label>
                <input
                  id="modalImgUrl"
                  type="url"
                  disabled={isViewOnly}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/your-summit-photo.jpg"
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    padding: '8px 10px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                {imageUrl && (
                  <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', height: '140px' }}>
                    <img
                      src={imageUrl}
                      alt="Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                )}
              </div>

              {/* 按鈕組 */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: 'white',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {isViewOnly ? '關閉視窗' : '取消'}
                </button>
                {!isViewOnly && (
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
                    }}
                  >
                    {submitting ? '提交中...' : '送出心得'}
                  </button>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default Achievements;

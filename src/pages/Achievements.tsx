import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Award, Star, Edit3, Globe, Lock, ChevronRight } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { getDirectImageUrl } from '../utils/image';
import { GAS_API_URL } from '../constants/api';
import { fetchAchievementsFromSupabase, saveReflectionToSupabase, getLastSupabaseError } from '../utils/supabaseClient';
import ReflectionWallModal from '../components/achievements/ReflectionWallModal';
import '../App.css';

interface Reflection {
  difficulty: number;
  beauty: number;
  content: string;
  imageUrl: string;
  isPublic?: boolean;
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
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AchievementData | null>(null);

  // Modal Form States
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [difficulty, setDifficulty] = useState(5);
  const [beauty, setBeauty] = useState(5);
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [photoFiles, setPhotoFiles] = useState<{ base64: string; name: string }[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Reflection Wall Modal States
  const [wallOpen, setWallOpen] = useState(false);
  const [wallEvent, setWallEvent] = useState<Activity | null>(null);
  const [wallRefreshKey, setWallRefreshKey] = useState(0);

  useEffect(() => {
    let ignore = false;

    const fetchData = async () => {
      try {
        if (userId && userId !== 'TEST_USER_ID') {
          // ⚡ 1. 優先嘗試從 Supabase 秒開活動成就 (< 50ms)
          let loadedFromSupabase = false;
          let sbErrorDetail: string | null = null;
          try {
            const sbData = await fetchAchievementsFromSupabase(userId);
            if (sbData && !ignore) {
              setData(sbData);
              setLoading(false);
              loadedFromSupabase = true;
            } else {
              sbErrorDetail = getLastSupabaseError();
            }
          } catch (sbErr: any) {
            console.warn('[Achievements] Supabase 讀取例外，啟用 GAS 備援:', sbErr);
            sbErrorDetail = sbErr?.message || String(sbErr);
          }

          // 2. 若 Supabase 尚未配置或回傳 null，無縫由 GAS 備援讀取
          if (!loadedFromSupabase) {
            try {
              const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_past_activities&userId=${userId}`));
              const result = await res.json();
              if (!ignore) {
                if (result.status === 'success') {
                  setData(result.data);
                } else {
                  const gasMsg = result.message || '無法取得歷史活動與成就';
                  const fullMsg = sbErrorDetail
                    ? `[Supabase RPC 錯誤]: ${sbErrorDetail} | [GAS]: ${gasMsg}`
                    : gasMsg;
                  setError(fullMsg);
                }
              }
            } catch (gasErr: any) {
              if (!ignore) {
                const gasErrMsg = gasErr?.message || String(gasErr);
                const fullMsg = sbErrorDetail
                  ? `[Supabase RPC 錯誤]: ${sbErrorDetail} | [GAS 連線錯誤]: ${gasErrMsg}`
                  : `載入歷史活動失敗: ${gasErrMsg}`;
                setError(fullMsg);
              }
            }
          }
        } else {
          // 測試假資料
          if (!ignore) {
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
        }
      } catch (err) {
        console.error('載入活動成就失敗:', err);
        if (!ignore) {
          setError(t('achievements.error.networkError'));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      ignore = true;
    };
  }, [userId, t, refreshKey]);

  const openWall = (activity: Activity) => {
    setWallEvent(activity);
    setWallOpen(true);
  };

  const openForm = (activity: Activity, viewOnly = false, directEdit = false) => {
    setSelectedActivity(activity);
    setIsViewOnly(viewOnly && !directEdit);
    setIsEditing(directEdit);
    if ((viewOnly || directEdit) && activity.reflection) {
      setDifficulty(activity.reflection.difficulty);
      setBeauty(activity.reflection.beauty);
      setContent(activity.reflection.content);
      setImageUrl(activity.reflection.imageUrl || '');
      setIsPublic(activity.reflection.isPublic !== false);
      const parsedPhotos = (activity.reflection.imageUrl || '')
        .split(/[\n,]/)
        .map(u => u.trim())
        .filter(Boolean);
      setExistingPhotos(parsedPhotos);
      setPhotoFiles([]);
    } else {
      setDifficulty(5);
      setBeauty(5);
      setContent('');
      setImageUrl('');
      setIsPublic(true);
      setExistingPhotos([]);
      setPhotoFiles([]);
    }
  };

  const handleCancelEdit = () => {
    if (selectedActivity && selectedActivity.reflection) {
      setDifficulty(selectedActivity.reflection.difficulty);
      setBeauty(selectedActivity.reflection.beauty);
      setContent(selectedActivity.reflection.content);
      setImageUrl(selectedActivity.reflection.imageUrl || '');
      setIsPublic(selectedActivity.reflection.isPublic !== false);
      const parsedPhotos = (selectedActivity.reflection.imageUrl || '')
        .split(/[\n,]/)
        .map(u => u.trim())
        .filter(Boolean);
      setExistingPhotos(parsedPhotos);
      setPhotoFiles([]);
    }
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingLimit = Math.max(0, 5 - existingPhotos.length - photoFiles.length);
    if (files.length > remainingLimit) {
      alert(t('register.alert.maxFiles', { limit: remainingLimit }) || `最多只能再上傳 ${remainingLimit} 張照片！`);
      e.target.value = '';
      return;
    }

    const fileList = Array.from(files);
    const newFiles: { base64: string; name: string }[] = [];
    let processedCount = 0;

    fileList.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        alert(t('register.alert.fileTooLarge', { name: file.name }) || `檔案 ${file.name} 超過 10MB 限制！`);
        processedCount++;
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxWidth = 1024;
          const maxHeight = 1024;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            alert(t('register.alert.imageParseError') || '圖片解析失敗');
            processedCount++;
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.7);

          const nameParts = file.name.split('.');
          nameParts[nameParts.length - 1] = 'jpg';
          const newName = nameParts.join('.');

          newFiles.push({ base64, name: newName });
          processedCount++;

          if (processedCount === fileList.length) {
            setPhotoFiles((prev) => [...prev, ...newFiles]);
          }
        };
        img.onerror = () => {
          alert(t('register.alert.imageLoadError', { name: file.name }) || '載入圖片失敗！');
          processedCount++;
          if (processedCount === fileList.length) {
            setPhotoFiles((prev) => [...prev, ...newFiles]);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert(t('register.alert.fileReadError', { name: file.name }) || '讀取檔案失敗！');
        processedCount++;
        if (processedCount === fileList.length) {
          setPhotoFiles((prev) => [...prev, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const closeForm = () => {
    setSelectedActivity(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) return;
    if (content.trim().length < 10) return alert(t('achievements.alert.minContentLength'));

    setSubmitting(true);
    let sbSuccess = false;
    try {
      let finalPhotoUrls = [...existingPhotos];

      // 1. 若有新上傳的心得相片，呼叫輕量 Helper 上傳 Drive 取得連結 (純 Drive API，不接觸試算表)
      if (photoFiles.length > 0) {
        try {
          const uploadRes = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(withAuthPayload({
              action: 'upload_drive_file',
              userId: userId || 'TEST_USER_ID',
              folderType: 'reflections',
              files: photoFiles
            }))
          });
          const uploadResult = await uploadRes.json();
          if (uploadResult.status === 'success' && uploadResult.urls) {
            finalPhotoUrls = [...finalPhotoUrls, ...uploadResult.urls];
          }
        } catch (uploadErr) {
          console.warn('[Achievements] 上傳心得相片例外，繼續儲存心得:', uploadErr);
        }
      }

      const combinedImageUrl = finalPhotoUrls.join('\n');

      const detailsPayload = {
        eventId: selectedActivity.eventId,
        eventName: selectedActivity.title,
        eventDate: selectedActivity.date,
        difficulty,
        beauty,
        content: content.trim(),
        imageUrl: combinedImageUrl,
        isPublic
      };

      // ⚡ 2. 100% 直寫 Supabase 心得評分 (< 50ms)
      if (userId && userId !== 'TEST_USER_ID') {
        try {
          sbSuccess = await saveReflectionToSupabase(userId, detailsPayload);
        } catch (sbErr) {
          console.warn('[Achievements] Supabase 儲存例外:', sbErr);
        }

        if (sbSuccess) {
          // ⭐️ 僅首次提交時發送心得推播通知給幹部群組，編輯更新不重複發送通知
          if (!isEditing) {
            try {
              const photoList = combinedImageUrl
                ? combinedImageUrl.split(/[\n,]/).map(u => u.trim()).filter(Boolean)
                : [];
              const payload = withAuthPayload({
                action: 'notify_reflection_submitted',
                userId: userId,
                userName: '社員',
                eventName: selectedActivity.title,
                difficulty: difficulty,
                beauty: beauty,
                content: content,
                photoUrls: photoList
              });
              fetch(GAS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                mode: 'no-cors'
              }).catch(e => console.warn('通知心得失敗:', e));
            } catch (notifErr) {
              console.warn('發送心得推播例外:', notifErr);
            }
          }

          alert(isEditing ? (t('achievements.alert.updateSuccess') || '心得與評分已成功更新！') : t('achievements.alert.submitSuccess'));
          setIsEditing(false);
          closeForm();
          setRefreshKey(k => k + 1); // 重新整理成就清單
          setWallRefreshKey(k => k + 1); // 重新整理心得牆
        } else {
          alert(t('achievements.alert.submitFailed', { message: t('achievements.alert.contactAdmin', '儲存失敗，請稍後再試') }));
        }
      } else {
        // 假資料本地模擬提交
        alert(isEditing ? (t('achievements.alert.updateSuccessMock') || '心得與評分已成功更新！(本地模擬寫入成功)') : t('achievements.alert.submitSuccessMock'));
        setIsEditing(false);
        closeForm();
        // 更新本地 state 模擬
        if (data) {
          const mockNewImgUrls = photoFiles.map(f => f.base64);
          const mockImgUrl = [...existingPhotos, ...mockNewImgUrls].join('\n');
          const updated = data.activities.map(act => {
            if (act.eventId === selectedActivity.eventId) {
              return {
                ...act,
                hasReflected: true,
                reflection: { difficulty, beauty, content, imageUrl: mockImgUrl, isPublic }
              };
            }
            return act;
          });
          setData({
            totalAttended: data.totalAttended,
            reflectionsCount: isEditing ? data.reflectionsCount : data.reflectionsCount + 1,
            activities: updated
          });
        }
        setWallRefreshKey(k => k + 1);
      }
    } catch (err) {
      console.error('送出心得失敗:', err);
      alert(t('achievements.error.networkError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>{t('achievements.loading')}</p>
      </div>
    );
  }

  return (
    <div className="app-container animate-fade-in" style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          color: '#991b1b',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12px',
          fontFamily: 'monospace',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
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
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ flex: '1 0 auto' }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.8, letterSpacing: '1px', fontWeight: 'bold', whiteSpace: 'nowrap', display: 'block' }}>
            {t('achievements.overview.badgeLabel')}
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', margin: '4px 0', whiteSpace: 'nowrap' }}>
            {t('achievements.overview.title')}
          </div>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9, whiteSpace: 'nowrap' }}>
            {t('achievements.overview.subtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', textAlign: 'center', marginLeft: 'auto' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '10px 12px', borderRadius: '12px', minWidth: '68px' }}>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{data?.totalAttended || 0}</div>
            <div style={{ fontSize: '10px', opacity: 0.8, whiteSpace: 'nowrap' }}>{t('achievements.overview.attendedLabel')}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '10px 12px', borderRadius: '12px', minWidth: '68px' }}>
            <div style={{ fontSize: '20px', fontWeight: '800' }}>{data?.reflectionsCount || 0}</div>
            <div style={{ fontSize: '10px', opacity: 0.8, whiteSpace: 'nowrap' }}>{t('achievements.overview.reflectionsLabel')}</div>
          </div>
        </div>
      </div>

      {/* 區塊二：歷史活動相片牆 */}
      <div style={{ textAlign: 'left', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '16px', color: '#1e293b', fontWeight: 'bold', margin: '0 0 12px 0' }}>{t('achievements.list.title')}</h3>
      </div>

      {data?.activities.length === 0 ? (
        <div className="empty-cart-state" style={{ padding: '60px 0', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Award size={36} color="#94a3b8" />
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('achievements.list.emptyTitle')}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('achievements.list.emptyText')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {data?.activities.map((item) => (
            <div
              key={item.eventId}
              onClick={() => openWall(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openWall(item);
                }
              }}
              style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                display: 'flex',
                height: '110px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 16px -2px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)';
              }}
            >
              <div style={{
                width: '110px',
                backgroundImage: `url(${item.img})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                flexShrink: 0
              }} />

              <div style={{
                flex: 1,
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minWidth: 0,
                gap: '12px'
              }}>
                <div style={{ minWidth: 0 }}>
                  <h4 style={{
                    fontSize: '15px',
                    fontWeight: 'bold',
                    color: '#0f172a',
                    margin: '0 0 6px 0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {item.title}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {t('achievements.list.dateLabel', { date: item.date })}
                  </span>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                  flexShrink: 0
                }}>
                  <ChevronRight size={18} />
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
          zIndex: 11000,
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>
                {isEditing
                  ? t('achievements.modal.editTitle')
                  : isViewOnly
                    ? t('achievements.modal.viewTitle')
                    : t('achievements.modal.writeTitle')}
              </h3>
              {isViewOnly && !isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid #3b82f6',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Edit3 size={13} />
                  <span>{t('achievements.modal.editBtn')}</span>
                </button>
              )}
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              {selectedActivity.title}
            </p>

            <form onSubmit={handleSubmit}>

              {/* 星等評分 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    {t('achievements.modal.difficultyLabel')}
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={isViewOnly && !isEditing}
                        onClick={() => setDifficulty(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: (isViewOnly && !isEditing) ? 'default' : 'pointer',
                          padding: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Star size={20} fill={star <= difficulty ? '#fbbf24' : 'none'} color={star <= difficulty ? '#fbbf24' : '#cbd5e1'} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '4px' }}>
                    {t('achievements.modal.beautyLabel')}
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={isViewOnly && !isEditing}
                        onClick={() => setBeauty(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: (isViewOnly && !isEditing) ? 'default' : 'pointer',
                          padding: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Star size={20} fill={star <= beauty ? '#fbbf24' : 'none'} color={star <= beauty ? '#fbbf24' : '#cbd5e1'} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 心得內容 */}
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="modalContent" style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  {t('achievements.modal.contentLabel')}
                </label>
                <textarea
                  id="modalContent"
                  disabled={isViewOnly && !isEditing}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t('achievements.modal.contentPlaceholder')}
                  style={{
                    width: '100%',
                    height: '110px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    padding: '10px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                    backgroundColor: (isViewOnly && !isEditing) ? '#f8fafc' : 'white'
                  }}
                  required
                />
              </div>

              {/* 照片分享 (最多上傳5張) */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: '6px' }}>
                  {t('achievements.modal.imageLabel') || '登頂照 / 團體合照 (選填，最多5張)'}
                </label>
                {(!isViewOnly || isEditing) ? (
                  <>
                    {/* 既有照片 (可單張刪除) */}
                    {existingPhotos.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12px', color: '#374151', margin: '0 0 6px 0' }}>
                          {t('achievements.modal.existingPhotos') || '既有照片：'}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                          {existingPhotos.map((url, idx) => (
                            <div key={`existing-${idx}`} style={{ position: 'relative', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                              <img
                                src={getDirectImageUrl(url, 200) || url}
                                alt="Existing photo"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                              />
                              <button
                                type="button"
                                title="刪除此照片"
                                onClick={() => setExistingPhotos(prev => prev.filter((_, i) => i !== idx))}
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                  color: 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  lineHeight: '18px',
                                  textAlign: 'center',
                                  padding: 0,
                                  fontWeight: 'bold'
                                }}
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      disabled={existingPhotos.length + photoFiles.length >= 5}
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        padding: '8px 10px',
                        fontSize: '13px',
                        outline: 'none',
                        backgroundColor: (existingPhotos.length + photoFiles.length >= 5) ? '#e2e8f0' : 'white'
                      }}
                    />
                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      {t('register.step4.uploadTip') || '單檔最大 10MB。自動壓縮且轉換為 .jpg'}
                      {` (已保留 ${existingPhotos.length} 張，還可上傳 ${Math.max(0, 5 - existingPhotos.length - photoFiles.length)} 張)`}
                    </p>
                    {photoFiles.length > 0 && (
                      <div className="selected-files-list" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '12px', color: '#374151' }}>
                          {t('register.step4.selectedFiles', { count: photoFiles.length }) || `新選取 ${photoFiles.length} 張圖片：`}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
                          {photoFiles.map((file, idx) => (
                            <div key={idx} style={{ position: 'relative', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                              <img
                                src={file.base64}
                                alt="Preview"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <button
                                type="button"
                                onClick={() => setPhotoFiles(prev => prev.filter((_, i) => i !== idx))}
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  right: '2px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  backgroundColor: 'rgba(239, 68, 68, 0.9)',
                                  color: 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '10px',
                                  lineHeight: '18px',
                                  textAlign: 'center',
                                  padding: 0,
                                  fontWeight: 'bold'
                                }}
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  imageUrl && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {imageUrl.split(/[\n,]/).map((url) => url.trim()).filter(Boolean).map((url, idx) => (
                        <div key={idx} style={{ borderRadius: '8px', overflow: 'hidden', height: '220px', border: '1px solid #e2e8f0' }}>
                          <img
                            src={getDirectImageUrl(url, 1000) || url}
                            alt={`Reflection photo ${idx + 1}`}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* 公開 / 僅自己可見切換開關 */}
              <div style={{
                marginBottom: '20px',
                padding: '12px 14px',
                backgroundColor: isPublic ? '#f0fdf4' : '#f8fafc',
                borderRadius: '12px',
                border: `1px solid ${isPublic ? '#bbf7d0' : '#e2e8f0'}`,
                transition: 'all 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: isPublic ? '#dcfce7' : '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isPublic ? <Globe size={18} color="#16a34a" /> : <Lock size={18} color="#64748b" />}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 'bold', color: isPublic ? '#166534' : '#334155' }}>
                        {t('achievements.modal.isPublicLabel')}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        {t('achievements.modal.isPublicDesc')}
                      </div>
                    </div>
                  </div>

                  {(!isViewOnly || isEditing) ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isPublic}
                      onClick={() => setIsPublic(!isPublic)}
                      style={{
                        width: '46px',
                        height: '26px',
                        borderRadius: '13px',
                        backgroundColor: isPublic ? '#16a34a' : '#cbd5e1',
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background-color 0.2s ease',
                        flexShrink: 0,
                        padding: '2px'
                      }}
                    >
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transform: isPublic ? 'translateX(20px)' : 'translateX(0px)',
                        transition: 'transform 0.2s ease'
                      }} />
                    </button>
                  ) : (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: isPublic ? '#dcfce7' : '#f1f5f9',
                      color: isPublic ? '#15803d' : '#64748b',
                      flexShrink: 0
                    }}>
                      {isPublic ? t('achievements.modal.publicBadge') : t('achievements.modal.privateBadge')}
                    </span>
                  )}
                </div>
              </div>

              {/* 按鈕組 */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
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
                      {t('achievements.modal.cancelEditBtn')}
                    </button>
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
                      {submitting ? t('achievements.modal.submittingBtn') : t('achievements.modal.saveEditBtn')}
                    </button>
                  </>
                ) : (
                  <>
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
                      {isViewOnly ? t('achievements.modal.closeBtn') : t('achievements.modal.cancelBtn')}
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
                        {submitting ? t('achievements.modal.submittingBtn') : t('achievements.modal.submitBtn')}
                      </button>
                    )}
                  </>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 區塊四：全螢幕拍立得心得牆 Modal */}
      {/* 區塊四：全螢幕拍立得心得牆 Modal */}
      {wallOpen && wallEvent && (
        <ReflectionWallModal
          eventId={wallEvent.eventId}
          eventTitle={wallEvent.title}
          eventDate={wallEvent.date}
          eventImg={wallEvent.img}
          currentUserId={userId}
          hasReflected={wallEvent.hasReflected}
          onClose={() => setWallOpen(false)}
          onOpenWriteModal={() => {
            if (wallEvent.hasReflected) {
              openForm(wallEvent, false, true);
            } else {
              openForm(wallEvent, false, false);
            }
          }}
          refreshTrigger={wallRefreshKey}
        />
      )}

    </div>
  );
}

export default Achievements;

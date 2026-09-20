import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Star, Edit3, X, ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { fetchEventPublicReflections, type PublicReflectionItem } from '../../utils/supabaseClient';
import { getDirectImageUrl } from '../../utils/image';

interface ReflectionWallModalProps {
  isOpen?: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventImg?: string;
  userId?: string;
  currentUserId?: string;
  onOpenWriteModal?: () => void;
  onOpenWriteForm?: () => void;
  hasReflected?: boolean;
  refreshTrigger?: number;
}

export const ReflectionWallModal: React.FC<ReflectionWallModalProps> = ({
  isOpen = true,
  onClose,
  eventId,
  eventTitle,
  eventDate,
  userId: _userId,
  currentUserId: _currentUserId,
  onOpenWriteModal,
  onOpenWriteForm,
  hasReflected = false,
  refreshTrigger = 0
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [reflections, setReflections] = useState<PublicReflectionItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  const handleOpenWrite = onOpenWriteModal || onOpenWriteForm || (() => {});
  
  // 相片燈箱狀態
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !eventId) return;

    let ignore = false;
    setLoading(true);

    const loadReflections = async () => {
      try {
        const list = await fetchEventPublicReflections(eventId);
        if (!ignore) {
          setReflections(list);
        }
      } catch (err) {
        console.error('載入活動公開心得失敗:', err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadReflections();

    return () => {
      ignore = true;
    };
  }, [isOpen, eventId, refreshTrigger]);

  if (!isOpen) return null;

  // 卡片 3D 翻面切換
  const toggleFlip = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFlippedCards((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // 開啟相片燈箱
  const openLightbox = (images: string[], index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // 微幅隨機旋轉角度生成（保持渲染一致性）
  const getRotationAngle = (index: number) => {
    const angles = [-1.8, 1.5, -0.8, 2.0, -1.5, 0.9, -2.1, 1.7];
    return angles[index % angles.length];
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: '#0f172a',
        backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.25s ease-out'
      }}
    >
      {/* 頂部 Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 10
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: '#f8fafc',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          title={t('common.close', '返回')}
        >
          <ArrowLeft size={18} />
        </button>

        <div style={{ textAlign: 'center', maxWidth: '65%', overflow: 'hidden' }}>
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 700,
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: '#f1f5f9'
            }}
          >
            {eventTitle}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '2px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{eventDate}</span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                fontWeight: 600,
                border: '1px solid rgba(52, 211, 153, 0.3)'
              }}
            >
              {reflections.length} {t('achievements.wall.memoriesCount', '則隊友回憶')}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={20} />
        </button>
      </header>

      {/* 心得牆主要展示區 (可滾動) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 16px 100px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px' }}>
            <div className="spinner" style={{ width: '32px', height: '32px' }} />
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>{t('achievements.wall.loading', '正在拼貼隊友的登山回憶...')}</span>
          </div>
        ) : reflections.length === 0 ? (
          // 空狀態：山系復古手寫便條紙
          <div
            style={{
              marginTop: '60px',
              maxWidth: '340px',
              width: '90%',
              backgroundColor: '#fef3c7',
              color: '#78350f',
              padding: '28px 24px',
              borderRadius: '4px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3)',
              position: 'relative',
              textAlign: 'center',
              transform: 'rotate(-1.5deg)'
            }}
          >
            {/* 上方圖釘裝飾 */}
            <div
              style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                border: '2px solid #b91c1c'
              }}
            />
            <Sparkles size={32} color="#d97706" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 8px 0', color: '#92400e' }}>
              {t('achievements.wall.emptyTitle', '這趟旅程還沒有公開回憶')}
            </h3>
            <p style={{ fontSize: '13px', lineHeight: '1.6', margin: '0 0 20px 0', opacity: 0.9 }}>
              {t('achievements.wall.emptyDesc', '成為第一個分享登頂美景與點滴的山友，記錄下屬於我們的山林片刻吧！')}
            </p>
            <button
              onClick={handleOpenWrite}
              style={{
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Edit3 size={15} />
              <span>{hasReflected ? t('achievements.wall.editMyReflection', '編輯我的心得') : t('achievements.wall.writeFirst', '搶先分享第一篇心得')}</span>
            </button>
          </div>
        ) : (
          // 拍立得剪貼布告欄
          <div
            style={{
              width: '100%',
              maxWidth: '640px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px',
              justifyItems: 'center'
            }}
          >
            {reflections.map((item, idx) => {
              const isFlipped = Boolean(flippedCards[item.id]);
              const rawPhotos = Array.isArray(item.photoUrls) ? item.photoUrls : (item.imageUrl ? [item.imageUrl] : []);
              const photos: string[] = rawPhotos
                .filter((url): url is string => Boolean(url))
                .map(url => getDirectImageUrl(url) || url);
              const hasPhoto = photos.length > 0;
              const rot = getRotationAngle(idx);

              return (
                <div
                  key={item.id}
                  style={{
                    perspective: '1000px',
                    width: '100%',
                    maxWidth: '300px',
                    height: hasPhoto ? '390px' : '260px',
                    cursor: 'pointer'
                  }}
                  onClick={(e) => toggleFlip(item.id, e)}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: `${isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'} rotate(${rot}deg)`
                    }}
                  >
                    {/* =================== 卡片正面 (FRONT) =================== */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        backgroundColor: hasPhoto ? '#fdfdfc' : '#fef9c3',
                        color: hasPhoto ? '#1e293b' : '#713f12',
                        borderRadius: '4px',
                        padding: hasPhoto ? '12px 12px 16px 12px' : '20px',
                        boxShadow: '0 12px 28px -6px rgba(0, 0, 0, 0.35), 0 6px 12px -4px rgba(0, 0, 0, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxSizing: 'border-box'
                      }}
                    >
                      {/* 紙膠帶 / 圖釘效果 */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '48px',
                          height: '14px',
                          backgroundColor: 'rgba(255, 255, 255, 0.65)',
                          borderRadius: '2px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          backdropFilter: 'blur(2px)'
                        }}
                      />

                      {hasPhoto ? (
                        <>
                          {/* 拍立得相片區域 */}
                          <div
                            style={{
                              position: 'relative',
                              width: '100%',
                              height: '240px',
                              backgroundColor: '#0f172a',
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}
                            onClick={(e) => openLightbox(photos, 0, e)}
                          >
                            <img
                              src={photos[0]}
                              alt="登山活動相片"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block'
                              }}
                              loading="lazy"
                            />
                            {photos.length > 1 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: '8px',
                                  right: '8px',
                                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                                  color: 'white',
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <ImageIcon size={10} />
                                <span>{photos.length}</span>
                              </div>
                            )}
                          </div>

                          {/* 拍立得底部：山友手寫姓名與星級評分 */}
                          <div style={{ marginTop: '10px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: '15px',
                                  fontWeight: 800,
                                  color: '#0f172a',
                                  fontFamily: 'system-ui, -apple-system, sans-serif'
                                }}
                              >
                                ✍️ {item.authorName}
                              </span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>{item.createdAt}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>風景:</span>
                                <div style={{ display: 'flex' }}>
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      size={12}
                                      fill={s <= item.beauty ? '#f59e0b' : 'none'}
                                      color={s <= item.beauty ? '#f59e0b' : '#cbd5e1'}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>難度:</span>
                                <div style={{ display: 'flex' }}>
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      size={12}
                                      fill={s <= item.difficulty ? '#ef4444' : 'none'}
                                      color={s <= item.difficulty ? '#ef4444' : '#cbd5e1'}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right', marginTop: '8px' }}>
                              ↻ 點擊翻面看隊友筆記
                            </div>
                          </div>
                        </>
                      ) : (
                        // 純文字便條紙正面
                        <>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 800, color: '#854d0e' }}>
                                ✍️ {item.authorName}
                              </span>
                              <span style={{ fontSize: '11px', color: '#a16207' }}>{item.createdAt}</span>
                            </div>
                            <p
                              style={{
                                fontSize: '13px',
                                lineHeight: '1.6',
                                color: '#713f12',
                                margin: 0,
                                maxHeight: '130px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 5,
                                WebkitBoxOrient: 'vertical'
                              }}
                            >
                              "{item.content}"
                            </p>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px dashed #fde047', paddingTop: '6px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <span style={{ fontSize: '11px', color: '#854d0e' }}>風景 ★{item.beauty}</span>
                              <span style={{ fontSize: '11px', color: '#854d0e' }}>難度 ★{item.difficulty}</span>
                            </div>
                            <span style={{ fontSize: '10px', color: '#a16207' }}>↻ 點擊翻面</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* =================== 卡片背面 (BACK) =================== */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        backgroundColor: '#f8fafc',
                        color: '#1e293b',
                        borderRadius: '4px',
                        padding: '20px',
                        boxShadow: '0 12px 28px -6px rgba(0, 0, 0, 0.35)',
                        transform: 'rotateY(180deg)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            📝 {item.authorName} 的出隊筆記
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{item.createdAt}</span>
                        </div>

                        <div style={{ maxHeight: hasPhoto ? '260px' : '150px', overflowY: 'auto', paddingRight: '4px' }}>
                          <p style={{ fontSize: '13px', lineHeight: '1.7', color: '#334155', margin: 0, whiteSpace: 'pre-wrap' }}>
                            {item.content || t('achievements.wall.noContent', '這篇心得沒有留下文字筆記～')}
                          </p>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b' }}>
                          <span>風景 {item.beauty}/5</span>
                          <span>難度 {item.difficulty}/5</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>↻ 點擊翻回相片</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 右下角常駐浮動撰寫按鈕 (FAB) */}
      <button
        onClick={handleOpenWrite}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '20px',
          zIndex: 10001,
          backgroundColor: '#059669',
          color: 'white',
          border: 'none',
          padding: '12px 20px',
          borderRadius: '30px',
          fontWeight: 700,
          fontSize: '14px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(5, 150, 105, 0.45)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)';
          e.currentTarget.style.backgroundColor = '#047857';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'translateY(0) scale(1)';
          e.currentTarget.style.backgroundColor = '#059669';
        }}
      >
        <Edit3 size={16} />
        <span>{hasReflected ? t('achievements.wall.editAction', '編輯我的心得') : t('achievements.wall.writeAction', '留下我的回憶')}</span>
      </button>

      {/* 相片全螢幕燈箱 (Photo Lightbox) */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10002,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(8px)'
          }}
          onClick={() => setLightboxOpen(false)}
        >
          {/* 關閉按鈕 */}
          <button
            onClick={() => setLightboxOpen(false)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>

          {/* 上一張 */}
          {lightboxImages.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((prev) => (prev > 0 ? prev - 1 : lightboxImages.length - 1));
              }}
              style={{
                position: 'absolute',
                left: '20px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* 當前高畫質相片 */}
          <div style={{ maxWidth: '90vw', maxHeight: '85vh', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImages[lightboxIndex]}
              alt="全螢幕登山照片"
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '4px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
              }}
            />
            {lightboxImages.length > 1 && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>

          {/* 下一張 */}
          {lightboxImages.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex((prev) => (prev < lightboxImages.length - 1 ? prev + 1 : 0));
              }}
              style={{
                position: 'absolute',
                right: '20px',
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ReflectionWallModal;

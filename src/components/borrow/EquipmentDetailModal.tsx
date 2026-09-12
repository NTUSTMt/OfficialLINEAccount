import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Camera, Trash2, Plus, Save, X } from 'lucide-react';
import type { Equipment } from '../../types/equipment';
import { ProductImage } from './ProductImage';
import { getDirectImageUrl } from '../../utils/image';
import { GAS_API_URL } from '../../constants/api';
import { appendAuthToken, withAuthPayload } from '../../utils/api';

interface EquipmentDetailModalProps {
  equipment: Equipment | null;
  initialQty: number;
  officerStatus: boolean;
  userId: string;
  onClose: () => void;
  onAddToCart: (newQty: number) => void;
  onEquipmentUpdated?: (updated: { id: string; imageUrl: string }) => void;
}

export const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  equipment,
  initialQty,
  officerStatus,
  userId,
  onClose,
  onAddToCart,
  onEquipmentUpdated
}) => {
  const { t } = useTranslation();

  const parsePhotos = (equip: Equipment | null) => {
    if (!equip?.imageUrl) return [];
    return equip.imageUrl
      .split(/[\n,，;\s]+/)
      .map(u => u.trim())
      .filter(u => u.startsWith('http'))
      .map(u => ({ url: u }));
  };

  const [modalPhotos, setModalPhotos] = useState<Array<{ url: string; isNew?: boolean; fileObj?: { base64: string; name: string } }>>(() => parsePhotos(equipment));
  const [activePhotoIdx, setActivePhotoIdx] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [modalQty, setModalQty] = useState<number>(initialQty);
  const [isSavingPhotos, setIsSavingPhotos] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 照片輪播滑動手勢狀態
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef<boolean>(false);

  // Lightbox 觸控滑動手勢
  const lbTouchStart = useRef<number | null>(null);

  if (!equipment) return null;

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    if (modalPhotos.length <= 1) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || modalPhotos.length <= 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === modalPhotos.length - 1 && dx < 0)) {
        setDragOffset(dx * 0.3);
      } else {
        setDragOffset(dx);
      }
    }
  };

  const handleCarouselTouchEnd = () => {
    if (!touchStartPos.current) return;
    setIsDragging(false);

    if (Math.abs(dragOffset) > 40) {
      if (dragOffset < 0 && activePhotoIdx < modalPhotos.length - 1) {
        setActivePhotoIdx(prev => prev + 1);
      } else if (dragOffset > 0 && activePhotoIdx > 0) {
        setActivePhotoIdx(prev => prev - 1);
      }
    }

    setDragOffset(0);
    touchStartPos.current = null;
    setTimeout(() => {
      didDrag.current = false;
    }, 120);
  };

  const handleCarouselMouseDown = (e: React.MouseEvent) => {
    if (modalPhotos.length <= 1) return;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleCarouselMouseMove = (e: React.MouseEvent) => {
    if (!touchStartPos.current || !isDragging || modalPhotos.length <= 1) return;
    const dx = e.clientX - touchStartPos.current.x;
    if (Math.abs(dx) > 5) {
      didDrag.current = true;
      if ((activePhotoIdx === 0 && dx > 0) || (activePhotoIdx === modalPhotos.length - 1 && dx < 0)) {
        setDragOffset(dx * 0.3);
      } else {
        setDragOffset(dx);
      }
    }
  };

  const handleCarouselMouseUp = () => {
    if (isDragging) {
      handleCarouselTouchEnd();
    }
  };

  const handleLbTouchStart = (e: React.TouchEvent) => {
    lbTouchStart.current = e.touches[0].clientX;
  };
  const handleLbTouchEnd = (e: React.TouchEvent) => {
    if (lbTouchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - lbTouchStart.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && activePhotoIdx < modalPhotos.length - 1) {
        setActivePhotoIdx(prev => prev + 1);
      } else if (dx > 0 && activePhotoIdx > 0) {
        setActivePhotoIdx(prev => prev - 1);
      }
    }
    lbTouchStart.current = null;
  };

  // 刪除當前照片
  const handleDeleteCurrentPhoto = () => {
    if (modalPhotos.length === 0) return;
    const isLast = modalPhotos.length === 1;
    const confirmMsg = isLast
      ? t('borrow.modal.confirmDeleteLastPhoto')
      : t('borrow.modal.confirmDeletePhoto');
    if (!window.confirm(confirmMsg)) return;

    const nextPhotos = modalPhotos.filter((_, i) => i !== activePhotoIdx);
    setModalPhotos(nextPhotos);
    const nextIdx = Math.max(0, Math.min(activePhotoIdx, nextPhotos.length - 1));
    setActivePhotoIdx(nextIdx);
  };

  // 上傳新照片
  const handleUploadNewPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (modalPhotos.length >= 5) {
      alert(t('borrow.modal.maxPhotosReached'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.75);
        setModalPhotos(prev => {
          const next = [...prev, { url: base64, isNew: true, fileObj: { base64, name: file.name } }];
          setActivePhotoIdx(next.length - 1);
          return next;
        });
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 儲存照片
  const handleSavePhotos = async () => {
    const keptUrls = modalPhotos.filter(p => !p.isNew).map(p => p.url);
    const newPhotoFiles = modalPhotos.filter(p => p.isNew && p.fileObj).map(p => p.fileObj);

    if (keptUrls.length === 0 && newPhotoFiles.length === 0) {
      if (!window.confirm(t('borrow.modal.confirmSaveEmptyPhotos'))) {
        return;
      }
    }

    setIsSavingPhotos(true);
    try {
      const res = await fetch(appendAuthToken(GAS_API_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(withAuthPayload({
          action: 'update_equipment_images',
          equipId: equipment.id,
          equipName: equipment.name,
          keptUrls,
          newPhotoFiles,
          userId
        }))
      });
      const data = await res.json();
      if (data.status === 'success') {
        const newImgUrl = data.imageUrl || '';
        onEquipmentUpdated?.({ id: equipment.id, imageUrl: newImgUrl });
        const updatedUrls = newImgUrl.split(/[\n,，;\s]+/).map((u: string) => u.trim()).filter((u: string) => u.startsWith('http'));
        setModalPhotos(updatedUrls.map((u: string) => ({ url: u })));
        setActivePhotoIdx(0);
        setIsEditMode(false);
        alert(t('borrow.modal.photoSaveSuccess'));
      } else {
        alert(data.message || t('borrow.modal.photoSaveFailed'));
      }
    } catch (err) {
      console.error('儲存裝備照片失敗:', err);
      alert(t('borrow.modal.photoSaveFailed'));
    } finally {
      setIsSavingPhotos(false);
    }
  };

  // 取消編輯照片
  const handleCancelPhotoEdit = () => {
    const urls = equipment.imageUrl
      ? equipment.imageUrl.split(/[\n,，;\s]+/).map(u => u.trim()).filter(u => u.startsWith('http'))
      : [];
    setModalPhotos(urls.map(u => ({ url: u })));
    setActivePhotoIdx(0);
    setIsEditMode(false);
  };

  return (
    <>
      <div className="detail-modal-overlay" onClick={() => !isSavingPhotos && onClose()}>
        <div className="detail-modal" onClick={(e) => e.stopPropagation()} style={{ paddingTop: '16px' }}>
          <div className="detail-modal-content">
            {/* 1:1 正方形相片輪播區 */}
            <div
              className="detail-modal-image-wrapper"
              onTouchStart={handleCarouselTouchStart}
              onTouchMove={handleCarouselTouchMove}
              onTouchEnd={handleCarouselTouchEnd}
              onMouseDown={handleCarouselMouseDown}
              onMouseMove={handleCarouselMouseMove}
              onMouseUp={handleCarouselMouseUp}
              onMouseLeave={handleCarouselMouseUp}
            >
              {/* 裝備代號懸浮膠囊 */}
              {equipment.id && (
                <span className="equipment-code-capsule">
                  {t('borrow.modal.codeLabel')}{equipment.id}
                </span>
              )}

              {modalPhotos.length > 0 ? (
                <div
                  className={`photo-carousel-track ${isDragging ? 'dragging' : ''}`}
                  style={{
                    transform: `translateX(calc(-${activePhotoIdx * 100}% + ${dragOffset}px))`,
                  }}
                >
                  {modalPhotos.map((photo, idx) => (
                    <div key={idx} className="photo-carousel-slide">
                      <img
                        src={getDirectImageUrl(photo.url, 1000) || photo.url}
                        alt={`${equipment.name} ${idx + 1}`}
                        draggable={false}
                        onClick={() => {
                          if (!isEditMode && !didDrag.current) {
                            setIsLightboxOpen(true);
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                          cursor: isEditMode ? 'default' : 'zoom-in',
                          userSelect: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <ProductImage name={equipment.name} imageUrl="" />
              )}

              {/* 編輯模式：當前照片右上角刪除按鈕 */}
              {isEditMode && modalPhotos.length > 0 && (
                <button
                  type="button"
                  className="photo-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCurrentPhoto();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  title={t('borrow.modal.deletePhoto')}
                >
                  <Trash2 size={16} />
                </button>
              )}

              {/* 中央底部小圓點（頁碼指示） */}
              {(modalPhotos.length > 1 || (isEditMode && modalPhotos.length < 5)) && (
                <div className="photo-carousel-dots">
                  {modalPhotos.map((_, idx) => (
                    <span
                      key={idx}
                      className={`carousel-dot ${idx === activePhotoIdx ? 'active' : ''}`}
                      onClick={() => setActivePhotoIdx(idx)}
                    />
                  ))}
                  {/* 編輯模式：圓點旁的新增照片按鈕 */}
                  {isEditMode && modalPhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title={t('borrow.modal.uploadPhoto')}
                      style={{
                        background: '#10b981',
                        border: 'none',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        cursor: 'pointer',
                        marginLeft: '4px'
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleUploadNewPhoto}
              />
            </div>
            
            <div className="detail-modal-body">
              <h2 className="detail-modal-title">{equipment.name}</h2>

              <div className="detail-modal-section">
                <div className="detail-price-list" style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '12px 0 16px 0', alignItems: 'flex-end', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.2' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{t('borrow.modal.basePrice')}</span>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#0f172a' }}>${equipment.price}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', lineHeight: '1.2' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{t('borrow.modal.extraPrice')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#64748b' }}>+${equipment.priceExtra || 0}</span>
                  </div>
                </div>
              </div>

              <div className="detail-modal-section">
                <h4 style={{ margin: '18px 0 6px 0', fontSize: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>{t('borrow.modal.descTitle')}</h4>
                <p className="detail-description" style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '6px 0', textAlign: 'left', minHeight: '60px', whiteSpace: 'pre-wrap' }}>
                  {equipment.description ? equipment.description : t('borrow.modal.noDesc')}
                </p>
              </div>
            </div>
          </div>

          <div className="detail-modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
            {/* 第一列：剩餘庫存與數量調整（僅在非編輯模式顯示） */}
            {!isEditMode && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
                {/* 剩餘庫存標籤 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>{t('borrow.modal.remainStock')}</span>
                  {equipment.remainQty <= 0 ? (
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '6px' }}>
                      {t('borrow.modal.outOfStock')}
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: equipment.remainQty <= 2 ? '#d97706' : '#059669', backgroundColor: equipment.remainQty <= 2 ? '#fef3c7' : '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                      {equipment.remainQty} {t('borrow.equip.qtyUnit', '件')}
                    </span>
                  )}
                </div>

                {/* 數量調整器 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>{t('borrow.modal.qtyLabel')}</span>
                  <div className="quantity-controller" style={{ display: 'inline-flex', alignItems: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', height: '36px', backgroundColor: '#fff' }}>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setModalQty(prev => Math.max(0, prev - 1))}
                      disabled={modalQty <= 0}
                      style={{ border: 'none', background: 'transparent', padding: '0 12px', height: '100%', cursor: modalQty > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px', color: modalQty > 0 ? '#1e293b' : '#cbd5e1' }}
                    >
                      -
                    </button>
                    <span className="qty-number" style={{ padding: '0 10px', fontSize: '15px', minWidth: '28px', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                      {modalQty}
                    </span>
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => setModalQty(prev => Math.min(equipment.remainQty, prev + 1))}
                      disabled={equipment.remainQty <= 0 || modalQty >= equipment.remainQty}
                      style={{ border: 'none', background: 'transparent', padding: '0 12px', height: '100%', cursor: (equipment.remainQty > 0 && modalQty < equipment.remainQty) ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '16px', color: (equipment.remainQty > 0 && modalQty < equipment.remainQty) ? '#1e293b' : '#cbd5e1' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 第二列：操作按鈕群 */}
            {isEditMode ? (
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                <button
                  type="button"
                  onClick={handleCancelPhotoEdit}
                  disabled={isSavingPhotos}
                  style={{
                    flex: 1,
                    height: '46px',
                    fontSize: '15px',
                    borderRadius: '10px',
                    border: '1.5px solid #cbd5e1',
                    color: '#475569',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {t('borrow.modal.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSavePhotos}
                  disabled={isSavingPhotos}
                  style={{
                    flex: 1.5,
                    height: '46px',
                    fontSize: '15px',
                    borderRadius: '10px',
                    backgroundColor: '#059669',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  <Save size={16} />
                  <span>{isSavingPhotos ? t('borrow.modal.savingPhotos') : t('borrow.modal.save')}</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                {officerStatus && (
                  <button
                    type="button"
                    onClick={() => setIsEditMode(true)}
                    style={{
                      flex: '1',
                      height: '46px',
                      fontSize: '14px',
                      borderRadius: '10px',
                      border: '1.5px solid #059669',
                      color: '#059669',
                      backgroundColor: '#f0fdf4',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Camera size={16} />
                    <span>{t('borrow.modal.editPhotos')}</span>
                  </button>
                )}

                {modalQty === 0 ? (
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      flex: officerStatus ? 1 : '1 1 100%',
                      height: '46px',
                      fontSize: '15px',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      color: '#475569',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {t('borrow.modal.close')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="add-to-cart-btn modal-add-btn"
                    onClick={() => {
                      onAddToCart(modalQty);
                      onClose();
                    }}
                    style={{
                      flex: officerStatus ? 1.5 : '1 1 100%',
                      height: '46px',
                      fontSize: '15px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    <ShoppingCart size={18} />
                    <span>{t('borrow.modal.addToCart')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 全螢幕照片放大 Lightbox */}
      {isLightboxOpen && modalPhotos[activePhotoIdx] && (
        <div
          className="photo-lightbox-overlay"
          onClick={() => setIsLightboxOpen(false)}
          onTouchStart={handleLbTouchStart}
          onTouchEnd={handleLbTouchEnd}
        >
          <button
            type="button"
            style={{ position: 'absolute', top: '20px', right: '20px', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', zIndex: 10 }}
            onClick={() => setIsLightboxOpen(false)}
          >
            <X size={30} />
          </button>
          <img
            className="photo-lightbox-img"
            src={getDirectImageUrl(modalPhotos[activePhotoIdx].url, 1600) || modalPhotos[activePhotoIdx].url}
            alt={equipment.name}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
          {modalPhotos.length > 1 && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                zIndex: 10,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {modalPhotos.map((_, idx) => (
                <span
                  key={idx}
                  className={`carousel-dot ${idx === activePhotoIdx ? 'active' : ''}`}
                  onClick={() => setActivePhotoIdx(idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

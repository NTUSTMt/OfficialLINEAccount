import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Equipment } from '../../types/equipment';
import { ProductImage } from './ProductImage';

interface EquipmentCardProps {
  item: Equipment;
  currentQty: number;
  onOpenDetail: (item: Equipment) => void;
  onUpdateCart: (id: string, delta: number, maxQty: number) => void;
}

export const EquipmentCard: React.FC<EquipmentCardProps> = ({
  item,
  currentQty,
  onOpenDetail,
  onUpdateCart,
}) => {
  const { t } = useTranslation();
  const isOutOfStock = item.remainQty <= 0;

  return (
    <div
      className={`product-card ${currentQty > 0 ? 'selected' : ''}`}
      onClick={() => onOpenDetail(item)}
      style={{ cursor: 'pointer' }}
    >
      <ProductImage name={item.name} imageUrl={item.imageUrl} />

      <div className="product-info">
        <h3 className="product-name">{item.name}</h3>

        <div className="product-status">
          {isOutOfStock ? (
            <span className="status-badge out-of-stock">{t('borrow.card.outOfStock')}</span>
          ) : item.remainQty <= 2 ? (
            <span className="status-badge low-stock">{t('borrow.card.lowStock', { count: item.remainQty })}</span>
          ) : (
            <span className="status-badge in-stock">{t('borrow.card.inStock', { count: item.remainQty })}</span>
          )}
        </div>

        <div className="product-price-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <span className="price-label" style={{ margin: 0 }}>{t('borrow.card.rent2Days')}</span>
            <span className="price-value" style={{ fontSize: '15px' }}>${item.price}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>{t('borrow.card.rentExtraDay')}</span>
            <span>+${item.priceExtra || 0}</span>
          </div>
        </div>

        <div className="product-actions">
          {currentQty === 0 ? (
            <button
              type="button"
              className="add-to-cart-btn"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateCart(item.id, 1, item.remainQty);
              }}
              disabled={isOutOfStock}
            >
              {isOutOfStock ? t('borrow.card.unavailable') : t('borrow.card.addToCart')}
            </button>
          ) : (
            <div className="quantity-controller" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="qty-btn"
                onClick={() => onUpdateCart(item.id, -1, item.remainQty)}
              >
                -
              </button>
              <span className="qty-number">{currentQty}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => onUpdateCart(item.id, 1, item.remainQty)}
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
};

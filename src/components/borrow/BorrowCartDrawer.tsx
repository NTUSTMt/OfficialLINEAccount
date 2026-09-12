import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingCart } from 'lucide-react';
import type { Equipment } from '../../types/equipment';

interface BorrowCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  equipments: Equipment[];
  rentalDays: number;
  totalItems: number;
  basePrice: number;
  personalPrice: number;
  totalPrice: number;
  formulaString?: string;
  isOfficial: boolean;
  isSubmittingOrder: boolean;
  pickupDate: string;
  returnDate: string;
  purpose: string;
  otherPurpose: string;
  todayStr: string;
  onUpdateCart: (id: string, delta: number, maxQty: number) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmitForm: () => void;
}

export function BorrowCartDrawer({
  isOpen,
  onClose,
  cart,
  equipments,
  rentalDays,
  totalItems,
  basePrice,
  personalPrice,
  totalPrice,
  formulaString,
  isOfficial,
  isSubmittingOrder,
  pickupDate,
  returnDate,
  purpose,
  otherPurpose,
  todayStr,
  onUpdateCart,
  onInputChange,
  onSubmitForm
}: BorrowCartDrawerProps) {
  const { t, i18n } = useTranslation();

  const getPurposeText = (p: string) => {
    if (p === '社團出隊') return t('borrow.drawer.purposeClub');
    if (p === '個人使用') return t('borrow.drawer.purposePersonal');
    if (p === '其他用途') return t('borrow.drawer.purposeOther');
    return p;
  };

  return (
    <div className={`cart-drawer-overlay ${isOpen ? 'open' : ''}`}>
      {/* 背景遮罩：點擊關閉抽屜 */}
      <div className="drawer-backdrop" onClick={onClose}></div>

      {/* 抽屜主體 */}
      <div className="cart-drawer">
        <div className="drawer-header">
          <h3>{t('borrow.drawer.title')}</h3>
          <button className="close-drawer-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="drawer-content">
          {totalItems === 0 ? (
            <div className="empty-cart-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                <ShoppingCart size={32} color="#94a3b8" />
              </div>
              <p>{t('borrow.drawer.emptyText')}</p>
              <button className="start-rent-btn" onClick={onClose}>{t('borrow.drawer.startBrowsing')}</button>
            </div>
          ) : (
            <>
              {/* 預訂商品清單 */}
              <div className="drawer-section">
                <h4 className="section-subtitle">{t('borrow.drawer.selectedItems')}</h4>
                <div className="cart-items-list">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = equipments.find(e => e.id === id);
                    if (!item) return null;
                    return (
                      <div key={id} className="cart-item-row">
                        <div className="cart-item-desc">
                          <span className="cart-item-name">{item.name}</span>
                          <span className="cart-item-price" style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {t('borrow.drawer.formulaLabel')}(${item.price} + ${item.priceExtra || 0} × {Math.max(0, rentalDays - 2)}{t('borrow.drawer.daysUnit')}) × {qty}{t('borrow.drawer.itemsUnit')} =
                            <strong style={{ color: 'var(--text-primary)', marginLeft: '4px' }}>
                              ${(item.price + Math.max(0, rentalDays - 2) * (item.priceExtra || 0)) * qty}
                            </strong>
                            {purpose === '社團出隊' ? t('borrow.drawer.freeClub') : isOfficial ? t('borrow.drawer.discountMember') : ''}
                          </span>
                        </div>
                        <div className="cart-item-controls">
                          <button onClick={() => onUpdateCart(id, -1, item.remainQty)}>-</button>
                          <span className="cart-item-qty">{qty}</span>
                          <button
                            onClick={() => onUpdateCart(id, 1, item.remainQty)}
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
                <h4 className="section-subtitle">{t('borrow.drawer.detailsTitle')}</h4>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="pickupDate">{t('borrow.drawer.pickupDate')}</label>
                    <input
                      type="date"
                      id="pickupDate"
                      name="pickupDate"
                      value={pickupDate}
                      min={todayStr}
                      onChange={onInputChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="returnDate">{t('borrow.drawer.returnDate')}</label>
                    <input
                      type="date"
                      id="returnDate"
                      name="returnDate"
                      value={returnDate}
                      min={pickupDate || todayStr}
                      onChange={onInputChange}
                      required
                    />
                  </div>

                  {pickupDate && returnDate && (
                    <div className="form-group full-width animate-fade-in" style={{ marginTop: '-4px' }}>
                      <div style={{
                        padding: '8px 12px',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        color: '#1d4ed8',
                        fontSize: '13px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span>
                          {rentalDays > 2
                            ? t('borrow.drawer.durationBadge', { days: rentalDays, extra: rentalDays - 2 })
                            : t('borrow.drawer.durationBaseOnly', { days: rentalDays })}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="form-group full-width">
                    <label htmlFor="purpose">{t('borrow.drawer.purpose')}</label>
                    <select
                      id="purpose"
                      name="purpose"
                      value={purpose}
                      onChange={onInputChange}
                      className="custom-select"
                    >
                      <option value="社團出隊">{t('borrow.drawer.purposeClub')}</option>
                      <option value="個人使用">{t('borrow.drawer.purposePersonal')}</option>
                      <option value="其他用途">{t('borrow.drawer.purposeOther')}</option>
                    </select>
                  </div>

                  {purpose === '其他用途' && (
                    <div className="form-group full-width animate-fade-in">
                      <label htmlFor="otherPurpose">{t('borrow.drawer.otherPurposeLabel')}</label>
                      <input
                        type="text"
                        id="otherPurpose"
                        name="otherPurpose"
                        value={otherPurpose}
                        onChange={onInputChange}
                        placeholder={t('borrow.drawer.otherPurposePlaceholder')}
                        required
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          boxSizing: 'border-box',
                          fontSize: '14px',
                          marginTop: '4px'
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 費用總計 */}
              <div className="checkout-summary">
                <div className="summary-row">
                  <span>{t('borrow.drawer.rentalDays')}</span>
                  <span>{rentalDays} {t('borrow.drawer.daysUnit')}</span>
                </div>
                <div className="summary-row">
                  <span>{t('borrow.drawer.totalItems')}</span>
                  <span>共 {totalItems} {t('borrow.drawer.itemsUnit')}</span>
                </div>
                <div className="summary-row">
                  <span>{t('borrow.drawer.basePriceTotal')}</span>
                  <span>${basePrice}</span>
                </div>
                <div className="summary-row">
                  <span>{t('borrow.drawer.personalPriceTotal')}</span>
                  <span>
                    ${personalPrice}
                    {isOfficial ? t('borrow.drawer.discountMemberApplied') : t('borrow.drawer.fullPriceApplied')}
                  </span>
                </div>
                {!isOfficial && (
                  <div className="summary-row" style={{ fontSize: '11px', color: '#f59e0b', justifyContent: 'flex-end', marginTop: '-4px', fontWeight: 'bold' }}>
                    <span>{t('borrow.floating.memberTip')}</span>
                  </div>
                )}
                <div className="summary-row total-row" style={{ borderBottom: formulaString ? 'none' : '1px solid var(--border-color)', paddingBottom: formulaString ? '0' : '8px', marginTop: '8px' }}>
                  <span>{t('borrow.drawer.estimatedTotal', { purpose: getPurposeText(purpose) })}</span>
                  <span className="total-highlight">${totalPrice}</span>
                </div>
                {formulaString && (
                  <div className="summary-row" style={{ fontSize: '11px', color: 'var(--text-muted)', justifyContent: 'flex-end', marginTop: '2px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                    <span>{t('borrow.drawer.trialLabel')}{formulaString} = ${totalPrice}</span>
                  </div>
                )}
                <p className="summary-tip">{t('borrow.drawer.summaryTip')}</p>
              </div>
            </>
          )}
        </div>

        {totalItems > 0 && (
          <div className="drawer-footer">
            <button
              className="submit-checkout-btn"
              onClick={onSubmitForm}
              disabled={isSubmittingOrder || totalItems === 0 || !pickupDate || !returnDate}
            >
              {isSubmittingOrder
                ? (i18n.language === 'en' ? 'Submitting...' : '送出預約中...')
                : t('borrow.drawer.submitBtn', { price: totalPrice })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

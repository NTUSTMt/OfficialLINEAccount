import React, { useState, useEffect } from 'react';
import { X, Send, AlertTriangle, AlertCircle, Bell, Smartphone, CreditCard } from 'lucide-react';
import { notifyDispatcher } from '../../utils/api';

export interface PaymentReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    line_user_id?: string | null;
    name: string;
    type: string;
    amount: number;
    target_id?: string | null;
  } | null;
  onSuccess?: () => void;
}

export const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  isOpen,
  onClose,
  item,
  onSuccess
}) => {
  const [notes, setNotes] = useState('請儘速完成匯款並於系統回報末五碼');
  const [dueDate, setDueDate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && item) {
      setNotes('請儘速完成匯款並於系統回報末五碼');
      setDueDate('');
      setErrorMessage(null);
      setIsSending(false);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) {
    return null;
  }

  const handleSendReminder = async () => {
    if (!item.line_user_id || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    const payload = {
      lineUserId: item.line_user_id,
      userName: item.name,
      title: item.type,
      amount: item.amount,
      dueDate: dueDate || undefined,
      notes: notes.trim(),
      bankInfo: {
        bankCode: '700 (中華郵政)',
        accountNumber: '0001236 0543210',
        accountName: '國立臺灣科技大學登山社'
      }
    };

    try {
      const res = await notifyDispatcher('notify_payment_reminder', payload);
      if (!res.success) {
        setErrorMessage(res.message || '發送繳費提醒推播失敗');
        setIsSending(false);
        return;
      }

      setIsSending(false);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsSending(false);
    }
  };

  return (
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div
        className="wa-modal-container wa-reminder-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wa-modal-header">
          <div className="wa-modal-title">
            <Bell size={20} className="text-amber-600" />
            <span>發送繳費提醒推播</span>
          </div>
          <button
            type="button"
            className="wa-modal-close-btn"
            onClick={onClose}
            aria-label="關閉"
          >
            <X size={20} />
          </button>
        </div>

        <div className="wa-modal-body">
          {errorMessage && (
            <div className="wa-reminder-error-banner">
              <AlertCircle size={18} className="shrink-0" />
              <div className="wa-reminder-error-text">
                <span className="font-semibold">推播發送錯誤：</span>
                {errorMessage}
              </div>
            </div>
          )}

          {!item.line_user_id && (
            <div className="wa-reminder-warning-banner">
              <AlertTriangle size={18} className="shrink-0" />
              <span>該對象未綁定 LINE 帳號，無法發送推播通知</span>
            </div>
          )}

          <div className="wa-reminder-modal-grid">
            {/* 左側：設定與編輯區 */}
            <div className="wa-reminder-form-section">
              <div className="wa-reminder-info-card">
                <div className="wa-reminder-info-row">
                  <span className="wa-reminder-label">提醒對象</span>
                  <span className="wa-reminder-value font-medium">{item.name}</span>
                </div>
                <div className="wa-reminder-info-row">
                  <span className="wa-reminder-label">待繳項目</span>
                  <span className="wa-reminder-value">{item.type}</span>
                </div>
                <div className="wa-reminder-info-row">
                  <span className="wa-reminder-label">應繳金額</span>
                  <span className="wa-reminder-value font-bold text-amber-700">
                    NT$ {Number(item.amount).toLocaleString()}
                  </span>
                </div>
                <div className="wa-reminder-info-row">
                  <span className="wa-reminder-label">LINE ID</span>
                  <span className="wa-reminder-value text-xs text-slate-500 font-mono">
                    {item.line_user_id || '未綁定'}
                  </span>
                </div>
              </div>

              <div className="wa-reminder-field-group">
                <label className="wa-reminder-field-label" htmlFor="reminder-due-date">
                  繳費期限 (選填)
                </label>
                <input
                  id="reminder-due-date"
                  type="date"
                  className="wa-reminder-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="wa-reminder-field-group">
                <label className="wa-reminder-field-label" htmlFor="reminder-notes">
                  提醒備註說明
                </label>
                <textarea
                  id="reminder-notes"
                  className="wa-reminder-textarea"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="請輸入提醒備註內容..."
                />
              </div>

              <div className="wa-reminder-bank-notice">
                <div className="wa-reminder-bank-title">
                  <CreditCard size={15} />
                  <span>預設社團收款帳戶資訊</span>
                </div>
                <div className="wa-reminder-bank-details">
                  <div>中華郵政 (700) 帳號：0001236 0543210</div>
                  <div>戶名：國立臺灣科技大學登山社</div>
                </div>
              </div>
            </div>

            {/* 右側：LINE Flex 卡片預覽 */}
            <div className="wa-reminder-preview-section">
              <div className="wa-reminder-preview-header">
                <Smartphone size={16} />
                <span>LINE Flex 卡片即時預覽</span>
              </div>

              <div className="wa-flex-card-preview">
                {/* Flex Card Header */}
                <div className="wa-flex-card-header">
                  <div className="wa-flex-card-title">【繳費通知】</div>
                  <div className="wa-flex-card-subtitle">
                    請於繳費期限內完成轉帳並回報，以利幹部核銷
                  </div>
                </div>

                {/* Flex Card Body */}
                <div className="wa-flex-card-body">
                  <div className="wa-flex-card-row">
                    <span className="wa-flex-label">提醒對象：</span>
                    <span className="wa-flex-val font-semibold">{item.name}</span>
                  </div>
                  <div className="wa-flex-card-row">
                    <span className="wa-flex-label">款項項目：</span>
                    <span className="wa-flex-val font-semibold">{item.type}</span>
                  </div>
                  <div className="wa-flex-card-row">
                    <span className="wa-flex-label">應繳金額：</span>
                    <span className="wa-flex-val wa-flex-amount">
                      NT$ {Number(item.amount).toLocaleString()}
                    </span>
                  </div>

                  {dueDate ? (
                    <div className="wa-flex-card-row">
                      <span className="wa-flex-label">繳費期限：</span>
                      <span className="wa-flex-val text-red-600 font-bold">{dueDate}</span>
                    </div>
                  ) : null}

                  {notes ? (
                    <div className="wa-flex-card-row">
                      <span className="wa-flex-label">款項備註：</span>
                      <span className="wa-flex-val text-slate-600">{notes}</span>
                    </div>
                  ) : null}

                  <div className="wa-flex-card-separator" />

                  <div className="wa-flex-card-bank-block">
                    <div className="wa-flex-bank-header">社團匯款帳戶資訊：</div>
                    <div className="wa-flex-card-row">
                      <span className="wa-flex-label">銀行代碼：</span>
                      <span className="wa-flex-val">700 (中華郵政)</span>
                    </div>
                    <div className="wa-flex-card-row">
                      <span className="wa-flex-label">匯款帳號：</span>
                      <span className="wa-flex-val font-bold">0001236 0543210</span>
                    </div>
                    <div className="wa-flex-card-row">
                      <span className="wa-flex-label">戶名：</span>
                      <span className="wa-flex-val">國立臺灣科技大學登山社</span>
                    </div>
                  </div>

                  <div className="wa-flex-card-separator" />

                  <div className="wa-flex-card-notice">
                    匯款完成後請點選下方按鈕，至系統填寫末五碼與上傳水單證明，以利幹部對帳核銷。
                  </div>
                </div>

                {/* Flex Card Footer */}
                <div className="wa-flex-card-footer">
                  <div className="wa-flex-card-action-btn">
                    前往回報匯款
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="wa-modal-footer">
          <button
            type="button"
            className="wa-btn wa-btn-secondary"
            onClick={onClose}
            disabled={isSending}
          >
            取消
          </button>
          <button
            type="button"
            className="wa-btn wa-btn-primary wa-btn-send-reminder"
            onClick={handleSendReminder}
            disabled={!item.line_user_id || isSending}
          >
            <Send size={16} />
            <span>{isSending ? '發送推播中...' : '確認發送推播'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

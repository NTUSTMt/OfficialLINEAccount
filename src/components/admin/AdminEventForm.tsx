import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Info, ImageIcon, Check, Mountain } from 'lucide-react';

export interface AdminEventFormData {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
  deadline: string;
  cost: string;
  status: string;
  shortDesc: string;
  fullDesc: string;
  imageUrl: string;
  notifyOfficerGroup: boolean;
}

interface AdminEventFormProps {
  isEditing: boolean;
  formData: AdminEventFormData;
  setFormData: React.Dispatch<React.SetStateAction<AdminEventFormData>>;
  previewImage: string;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submittingForm: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
}

export const AdminEventForm: React.FC<AdminEventFormProps> = ({
  isEditing,
  formData,
  setFormData,
  previewImage,
  onImageChange,
  submittingForm,
  onSubmit,
  onCancelEdit
}) => {
  const { t } = useTranslation();

  const SHORT_DESC_LIMIT = 1000;
  const FULL_DESC_LIMIT = 700;
  const TOTAL_DESC_LIMIT = 1400;

  const shortDescCount = useMemo(() => formData.shortDesc.trim().length, [formData.shortDesc]);
  const fullDescCount = useMemo(() => formData.fullDesc.trim().length, [formData.fullDesc]);
  const totalDescCount = useMemo(() => shortDescCount + fullDescCount, [shortDescCount, fullDescCount]);

  const isShortDescOver = shortDescCount > SHORT_DESC_LIMIT;
  const isFullDescOver = fullDescCount > FULL_DESC_LIMIT;
  const isTotalDescOver = totalDescCount > TOTAL_DESC_LIMIT;
  // 只要總字數不要超過上限 (<= 1400) 即可送出
  const isDescOverLimit = isTotalDescOver;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
      {/* 左欄：表單 */}
      <form
        onSubmit={onSubmit}
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a', textAlign: 'left' }}>
            {isEditing ? t('adminEvents.editTitle') : t('adminEvents.createTitle')}
          </h3>
          {isEditing && (
            <button
              type="button"
              onClick={onCancelEdit}
              style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('adminEvents.cancelEdit')}
            </button>
          )}
        </div>

        {/* 活動名稱 */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
            {t('adminEvents.nameLabel')}
          </label>
          <input
            type="text"
            required
            value={formData.name}
            placeholder={t('adminEvents.namePlaceholder')}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', textAlign: 'left' }}
          />
        </div>

        {/* 活動代號 */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '4px', textAlign: 'left' }}>
            {t('adminEvents.eventIdLabel')}
          </label>
          <input
            type="text"
            disabled={isEditing}
            value={formData.eventId}
            placeholder={t('adminEvents.eventIdHelp')}
            onChange={(e) => setFormData({ ...formData, eventId: e.target.value.toUpperCase() })}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              boxSizing: 'border-box',
              backgroundColor: isEditing ? '#f8fafc' : 'white',
              fontFamily: 'monospace',
              textAlign: 'left'
            }}
          />
        </div>

        {/* 活動狀態 */}
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '14px 16px',
          borderRadius: '12px',
          border: '1.5px solid #e2e8f0',
          textAlign: 'left'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#0f172a', marginBottom: '6px', textAlign: 'left' }}>
            <Sparkles size={14} color="#059669" />
            <span>{t('adminEvents.statusLabel')}</span>
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '14px',
              backgroundColor: 'white',
              boxSizing: 'border-box',
              fontWeight: 'bold',
              textAlign: 'left',
              cursor: 'pointer',
              color: formData.status === '開放' ? '#15803d' : formData.status === '未來開放' ? '#c2410c' : '#64748b'
            }}
          >
            <option value="未來開放">未來開放 (預設預告，暫不開放社員報名填寫)</option>
            <option value="開放">開放報名 (發布後社員即可開始報名填表)</option>
            <option value="關閉">關閉活動 (僅幹部可見，暫不對外開放)</option>
          </select>
          <div style={{ margin: '8px 0 0', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <Info size={14} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', textAlign: 'left', lineHeight: '1.4' }}>
              {formData.status === '未來開放'
                ? '目前設定為「未來開放」，社員可見活動資訊預告，但無法點擊報名。'
                : formData.status === '開放'
                ? '目前設定為「開放報名」，發布後社員即可立即開始報名。'
                : '目前設定為「關閉活動」，活動不對外公開。'}
            </p>
          </div>
        </div>

        {/* 日期區間與截止日 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', textAlign: 'left' }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
              {t('adminEvents.startDateLabel')}
            </label>
            <input
              type="date"
              required
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: '42px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                WebkitAppearance: 'none',
                appearance: 'none',
                boxSizing: 'border-box',
                textAlign: 'left'
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
              {t('adminEvents.endDateLabel')}
            </label>
            <input
              type="date"
              required
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: '42px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                WebkitAppearance: 'none',
                appearance: 'none',
                boxSizing: 'border-box',
                textAlign: 'left'
              }}
            />
          </div>
        </div>

        {/* 報名截止日與費用 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', textAlign: 'left' }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
              {t('adminEvents.deadlineLabel')}
            </label>
            <input
              type="date"
              required
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: '42px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                WebkitAppearance: 'none',
                appearance: 'none',
                boxSizing: 'border-box',
                textAlign: 'left'
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px', textAlign: 'left' }}>
              {t('adminEvents.costLabel')}
            </label>
            <input
              type="text"
              required
              value={formData.cost}
              placeholder={t('adminEvents.costPlaceholder')}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                minHeight: '42px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                boxSizing: 'border-box',
                textAlign: 'left'
              }}
            />
          </div>
        </div>

        {/* 封面照片直接上傳 */}
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
            {t('adminEvents.coverImageLabel')}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#f1f5f9',
                border: '1.5.px dashed #94a3b8',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#334155'
              }}
            >
              <ImageIcon size={14} />
              <span>{previewImage ? t('adminEvents.coverChangeBtn') : t('adminEvents.coverUploadBtn')}</span>
              <input type="file" accept="image/*" onChange={onImageChange} style={{ display: 'none' }} />
            </label>
            {previewImage && (
              <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} /> 已選擇照片
              </span>
            )}
          </div>
        </div>

        {/* 簡介 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
              {t('adminEvents.shortDescLabel')}
            </label>
            <span style={{ fontSize: '11px', color: isShortDescOver ? '#ef4444' : '#64748b' }}>
              （上限 1,000 字）
            </span>
          </div>
          <textarea
            required
            rows={3}
            value={formData.shortDesc}
            placeholder={t('adminEvents.shortDescPlaceholder')}
            onChange={(e) => setFormData({ ...formData, shortDesc: e.target.value })}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: isShortDescOver || isTotalDescOver ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
              backgroundColor: isShortDescOver || isTotalDescOver ? '#fef2f2' : '#ffffff',
              fontSize: '13px',
              boxSizing: 'border-box',
              resize: 'vertical',
              overflow: 'auto',
              transition: 'border-color 0.2s, background-color 0.2s'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <span style={{
              fontSize: '12px',
              color: isShortDescOver || isTotalDescOver ? '#ef4444' : '#64748b',
              fontWeight: isShortDescOver ? 'bold' : 'normal'
            }}>
              {shortDescCount} / {SHORT_DESC_LIMIT} 字
              {isShortDescOver && <span style={{ marginLeft: '4px', color: '#ef4444' }}>(超出上限)</span>}
            </span>
          </div>
        </div>

        {/* 詳細行程與裝備要求 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
              {t('adminEvents.fullDescLabel')}
            </label>
            <span style={{ fontSize: '11px', color: isFullDescOver ? '#ef4444' : '#64748b' }}>
              （上限 700 字）
            </span>
          </div>
          <textarea
            rows={6}
            value={formData.fullDesc}
            placeholder={t('adminEvents.fullDescPlaceholder')}
            onChange={(e) => setFormData({ ...formData, fullDesc: e.target.value })}
            style={{
              width: '100%',
              minHeight: '130px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: isFullDescOver || isTotalDescOver ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
              backgroundColor: isFullDescOver || isTotalDescOver ? '#fef2f2' : '#ffffff',
              fontSize: '13px',
              boxSizing: 'border-box',
              resize: 'vertical',
              overflow: 'auto',
              transition: 'border-color 0.2s, background-color 0.2s'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <span style={{
              fontSize: '12px',
              color: isFullDescOver || isTotalDescOver ? '#ef4444' : '#64748b',
              fontWeight: isFullDescOver ? 'bold' : 'normal'
            }}>
              {fullDescCount} / {FULL_DESC_LIMIT} 字
              {isFullDescOver && <span style={{ marginLeft: '4px', color: '#ef4444' }}>(超出上限)</span>}
            </span>
          </div>
        </div>

        {/* 綜合總字數判定提示條 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: '8px',
          backgroundColor: isTotalDescOver ? '#fef2f2' : '#f8fafc',
          border: isTotalDescOver ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
          fontSize: '12px'
        }}>
          <span style={{ color: isTotalDescOver ? '#dc2626' : '#475569', fontWeight: isTotalDescOver ? 'bold' : 'normal' }}>
            說明綜合總字數（上限 1,400 字）
          </span>
          <span style={{ color: isTotalDescOver ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
            {totalDescCount} / {TOTAL_DESC_LIMIT} 字
            {isTotalDescOver && ' (已超量，不可送出)'}
          </span>
        </div>

        {/* 推播至幹部群組選取 */}
        {!isEditing && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.notifyOfficerGroup}
              onChange={(e) => setFormData({ ...formData, notifyOfficerGroup: e.target.checked })}
            />
            <span>{t('adminEvents.notifyOfficerGroup')}</span>
          </label>
        )}

        {/* 提交按鈕 */}
        <button
          type="submit"
          disabled={submittingForm || isDescOverLimit}
          className="btn btn-primary"
          style={{
            marginTop: '10px',
            padding: '12px 24px',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '15px',
            backgroundColor: isDescOverLimit ? '#94a3b8' : '#059669',
            cursor: isDescOverLimit ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          {submittingForm && <div className="spinner" style={{ width: '16px', height: '16px' }}></div>}
          {submittingForm
            ? t('adminEvents.submitting')
            : isDescOverLimit
            ? '字數超過上限不可送出'
            : isEditing
            ? t('adminEvents.submitUpdate')
            : t('adminEvents.submitCreate')}
        </button>
      </form>

      {/* 右欄：LINE Carousel 卡片模擬預覽 */}
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 'bold', color: '#1e293b' }}>
          {t('adminEvents.previewTitle')}
        </h4>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
          {t('adminEvents.previewDesc')}
        </p>

        <div style={{
          maxWidth: '300px',
          margin: '0 auto',
          backgroundColor: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
          border: '1px solid #e2e8f0'
        }}>
          {/* 封面圖 */}
          <div style={{ width: '100%', height: '160px', backgroundColor: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {previewImage ? (
              <img src={previewImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                <Mountain size={36} color="#94a3b8" style={{ margin: '0 auto', display: 'block' }} />
                <p style={{ margin: '4px 0 0', fontSize: '11px' }}>封面照片預覽</p>
              </div>
            )}
          </div>

          {/* 卡片主體 */}
          <div style={{ padding: '16px', textAlign: 'left' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 'bold', color: '#111111', lineHeight: '1.3' }}>
              {formData.name || '未命名活動名稱'}
            </h3>

            <span style={{
              display: 'inline-block',
              marginBottom: '10px',
              fontSize: '12px',
              fontWeight: 'bold',
              color: formData.status === '開放' ? '#1DB446' : formData.status === '未來開放' ? '#FF9800' : '#888888'
            }}>
              {formData.status === '開放' ? '開放 Open' : formData.status === '未來開放' ? '未來開放 Coming Soon' : '已關閉 Closed'}
            </span>

            <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 'bold', color: '#666666' }}>
              費用 Cost: {formData.cost || '尚未訂定'}
            </p>

            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#666666' }}>
              活動時間 Event Date:
            </p>
            <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 'bold', color: '#1DB446' }}>
              {formData.startDate || 'YYYY/MM/DD'} ~ {formData.endDate || 'YYYY/MM/DD'}
            </p>

            <p style={{ margin: '0 0 2px', fontSize: '12px', color: '#666666' }}>
              報名截止 Sign Up Deadline:
            </p>
            <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 'bold', color: '#E53935' }}>
              {formData.deadline || 'YYYY/MM/DD'}
            </p>

            <p style={{ margin: '0', fontSize: '12px', color: '#777777', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
              {formData.shortDesc || '這裡會呈現活動的重點亮點簡述...'}
            </p>
          </div>

          {/* 卡片按鈕 */}
          <div style={{ padding: '0 16px 16px' }}>
            <button
              type="button"
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: formData.status === '開放' ? '#1DB446' : '#CCCCCC',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '14px',
                cursor: 'default'
              }}
            >
              {formData.status === '開放' ? '一鍵報名 Sign Up' : '尚未開放 Not Open'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

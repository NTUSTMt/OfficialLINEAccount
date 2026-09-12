import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  RotateCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  MessageSquare,
  Copy,
  Check,
  Phone,
  ImageIcon,
  User,
  CheckCircle2,
  Clock4,
  RotateCcw,
  Send
} from 'lucide-react';
import type { AdminEvent, SignupApplicant } from '../../types/event';
import { parseProofUrls } from '../../utils/applicantUtils';

interface AdminSignupsModalProps {
  event: AdminEvent;
  signupsList: SignupApplicant[];
  loadingSignups: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onUpdateApplicantResult: (applicant: SignupApplicant, newResult: string) => Promise<void>;
  updatingSignupCode: string | null;
  sendingNotifications: boolean;
  onSendNotifications: () => void;
  onViewProof: (applicant: SignupApplicant) => void;
  onViewProfile: (applicant: SignupApplicant) => void;
}

export const AdminSignupsModal: React.FC<AdminSignupsModalProps> = ({
  event,
  signupsList,
  loadingSignups,
  onClose,
  onRefresh,
  onUpdateApplicantResult,
  updatingSignupCode,
  sendingNotifications,
  onSendNotifications,
  onViewProof,
  onViewProfile
}) => {
  const { t } = useTranslation();

  const [signupFilter, setSignupFilter] = useState<'all' | 'accepted' | 'waitlisted' | 'pending'>('all');
  const [signupSortBy, setSignupSortBy] = useState<'order' | 'member' | 'status'>('order');
  const [signupSortOrder, setSignupSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedSignupCode, setExpandedSignupCode] = useState<string | null>(null);
  const [copiedLineId, setCopiedLineId] = useState<string | null>(null);

  // 篩選與排序邏輯
  const filteredSignups = useMemo(() => {
    let result = [...signupsList];

    if (signupFilter === 'accepted') {
      result = result.filter((s) => s.reviewResult.indexOf('正取') > -1);
    } else if (signupFilter === 'waitlisted') {
      result = result.filter((s) => s.reviewResult.indexOf('備取') > -1);
    } else if (signupFilter === 'pending') {
      result = result.filter((s) => s.reviewResult.indexOf('正取') === -1 && s.reviewResult.indexOf('備取') === -1);
    }

    return result.sort((a, b) => {
      let cmp = 0;
      if (signupSortBy === 'order') {
        cmp = (a.rowNumber || 0) - (b.rowNumber || 0);
      } else if (signupSortBy === 'member') {
        const isOfficialA = a.isOfficial === '是' ? 1 : 0;
        const isOfficialB = b.isOfficial === '是' ? 1 : 0;
        cmp = isOfficialB - isOfficialA;
        if (cmp === 0) cmp = (a.rowNumber || 0) - (b.rowNumber || 0);
      } else if (signupSortBy === 'status') {
        const getWeight = (r: string) => {
          if (r.indexOf('正取') > -1) return 1;
          if (r.indexOf('備取') > -1) return 2;
          return 3;
        };
        cmp = getWeight(a.reviewResult) - getWeight(b.reviewResult);
        if (cmp === 0) cmp = (a.rowNumber || 0) - (b.rowNumber || 0);
      }
      return signupSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [signupsList, signupFilter, signupSortBy, signupSortOrder]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        maxWidth: '750px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Modal 頂部 Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              {t('adminEvents.modalTitle', { eventName: event.name })}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
              {t('adminEvents.totalCount', { count: signupsList.length })} · 代號: {event.id}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loadingSignups}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                cursor: loadingSignups ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                fontWeight: 600,
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              title={t('adminEvents.refresh', '重新整理名冊')}
            >
              <RotateCw size={13} style={{ animation: loadingSignups ? 'spin 1s linear infinite' : 'none' }} />
              <span>{loadingSignups ? t('adminEvents.refreshing', '更新中') : t('adminEvents.refresh', '刷新')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 篩選標籤與排序工具列 */}
        <div style={{
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          borderBottom: '1px solid #f1f5f9',
          flexWrap: 'wrap',
          backgroundColor: '#fafafa'
        }}>
          {/* 篩選標籤 */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            {(['all', 'accepted', 'waitlisted', 'pending'] as const).map((filterKey) => {
              const count = signupsList.filter((s) => {
                if (filterKey === 'accepted') return s.reviewResult.indexOf('正取') > -1;
                if (filterKey === 'waitlisted') return s.reviewResult.indexOf('備取') > -1;
                if (filterKey === 'pending') return s.reviewResult.indexOf('正取') === -1 && s.reviewResult.indexOf('備取') === -1;
                return true;
              }).length;

              return (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setSignupFilter(filterKey)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: signupFilter === filterKey ? '#059669' : '#ffffff',
                    color: signupFilter === filterKey ? 'white' : '#475569',
                    boxShadow: signupFilter === filterKey ? '0 2px 4px rgba(5, 150, 105, 0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t(`adminEvents.filter${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}`, { count })}
                </button>
              );
            })}
          </div>

          {/* 報名者排序控制項 */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: '#ffffff',
            padding: '4px 8px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <ArrowUpDown size={13} color="#64748b" />
            <select
              value={signupSortBy}
              onChange={(e) => setSignupSortBy(e.target.value as 'order' | 'member' | 'status')}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                fontSize: '12px',
                fontWeight: '600',
                color: '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="order">{t('adminEvents.sort.signupOrder', '報名順序')}</option>
              <option value="member">{t('adminEvents.sort.memberFirst', '社員優先')}</option>
              <option value="status">{t('adminEvents.sort.reviewStatus', '審核狀態')}</option>
            </select>
            <button
              type="button"
              onClick={() => setSignupSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                border: 'none',
                backgroundColor: '#f1f5f9',
                borderRadius: '4px',
                padding: '3px 6px',
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#1e293b',
                cursor: 'pointer'
              }}
            >
              {signupSortOrder === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
              <span>{signupSortOrder === 'asc' ? t('adminEvents.sort.asc', '升冪') : t('adminEvents.sort.desc', '降冪')}</span>
            </button>
          </div>
        </div>

        {/* 名冊內容區 (滾動) */}
        <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loadingSignups ? (
            <div className="loading-state" style={{ minHeight: '30vh' }}>
              <div className="spinner"></div>
              <p>載入報名社員名單中...</p>
            </div>
          ) : filteredSignups.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <p>{t('adminEvents.noSignups')}</p>
            </div>
          ) : (
            filteredSignups.map((s) => {
              const cardId = String(s.rowNumber);
              const isExpanded = expandedSignupCode === cardId;
              const isPaidConfirmed = s.reviewResult.indexOf('已繳費') > -1 || (s.reviewResult.indexOf('正取') > -1 && s.payStatus === '已繳費 Paid');
              const isAccepted = s.reviewResult.indexOf('正取') > -1;
              const isWaitlistInterested = s.reviewResult.indexOf('有意願') > -1;
              const isWaitlisted = s.reviewResult.indexOf('備取') > -1;

              const borderColor = isWaitlisted
                ? (isExpanded ? '#ea580c' : isWaitlistInterested ? '#fde68a' : '#fed7aa')
                : isAccepted
                ? (isExpanded ? '#059669' : isPaidConfirmed ? '#86efac' : '#bbf7d0')
                : (isExpanded ? '#059669' : '#e2e8f0');

              const bgColor = isPaidConfirmed ? '#f0fdf4' : isAccepted ? '#f0fdf4' : isWaitlisted ? '#fff7ed' : '#ffffff';
              const boxShadow = isExpanded
                ? (isWaitlisted ? '0 4px 12px rgba(234, 88, 12, 0.12)' : '0 4px 12px rgba(5, 150, 105, 0.08)')
                : '0 1px 3px rgba(0,0,0,0.03)';

              return (
                <div
                  key={cardId}
                  onClick={() => setExpandedSignupCode(isExpanded ? null : cardId)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${borderColor}`,
                    backgroundColor: bgColor,
                    boxShadow: boxShadow,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isExpanded ? '12px' : '0',
                    textAlign: 'left'
                  }}
                >
                  {/* 收合態 / 頂部摘要列 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>({s.gender || '未填'})</span>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: s.isOfficial === '是' ? '#dcfce7' : '#f1f5f9',
                        color: s.isOfficial === '是' ? '#15803d' : '#64748b',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}>
                        {s.isOfficial === '是' ? '正式社員' : '非社員'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {/* 審核狀態膠囊 */}
                      <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontWeight: 'bold',
                        backgroundColor: isPaidConfirmed ? '#d1fae5' : isAccepted ? '#dcfce7' : isWaitlistInterested ? '#fef3c7' : isWaitlisted ? '#ffedd5' : '#f1f5f9',
                        color: isPaidConfirmed ? '#047857' : isAccepted ? '#15803d' : isWaitlistInterested ? '#b45309' : isWaitlisted ? '#c2410c' : '#64748b',
                        border: `1px solid ${isPaidConfirmed ? '#6ee7b7' : isAccepted ? '#bbf7d0' : isWaitlistInterested ? '#fde68a' : isWaitlisted ? '#fed7aa' : '#cbd5e1'}`
                      }}>
                        {isPaidConfirmed ? '正取(已繳)' : isAccepted ? '正取' : isWaitlistInterested ? '備取(意願)' : isWaitlisted ? '備取' : '待審'}
                      </span>

                      {/* 通知狀態 */}
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: s.notifyStatus === '已通知' ? '#dcfce7' : '#fee2e2',
                        color: s.notifyStatus === '已通知' ? '#15803d' : '#b91c1c',
                        fontWeight: 'bold'
                      }}>
                        {s.notifyStatus === '已通知' ? t('adminEvents.notifiedBadge') : t('adminEvents.unnotifiedBadge')}
                      </span>

                      {/* 展開指示圖示 */}
                      <ChevronDown
                        size={14}
                        style={{
                          color: '#94a3b8',
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }}
                      />
                    </div>
                  </div>

                  {/* 展開態內容：聯絡方式與審核操作 */}
                  {isExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        borderTop: '1px solid #e2e8f0',
                        paddingTop: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      {/* 聯絡資訊 Chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '13px' }}>
                        {/* LINE ID 一鍵複製 */}
                        <div
                          onClick={() => {
                            if (s.lineId) {
                              navigator.clipboard.writeText(s.lineId);
                              setCopiedLineId(cardId);
                              setTimeout(() => setCopiedLineId(null), 1800);
                            }
                          }}
                          title="點擊複製 LINE ID"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: copiedLineId === cardId ? '#dcfce7' : '#f1f5f9',
                            border: `1px solid ${copiedLineId === cardId ? '#86efac' : '#cbd5e1'}`,
                            padding: '5px 10px',
                            borderRadius: '6px',
                            cursor: s.lineId ? 'pointer' : 'default',
                            color: copiedLineId === cardId ? '#15803d' : '#334155',
                            fontWeight: '500',
                            transition: 'all 0.2s'
                          }}
                        >
                          <MessageSquare size={13} />
                          <span>LINE:</span>
                          <span style={{ fontWeight: 'bold' }}>{s.lineId || '未留'}</span>
                          {s.lineId && (
                            <span style={{
                              fontSize: '11px',
                              color: copiedLineId === cardId ? '#15803d' : '#059669',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              {copiedLineId === cardId ? (
                                <>
                                  <Check size={12} color="#15803d" /> 已複製！
                                </>
                              ) : (
                                <>
                                  <Copy size={12} /> 點擊複製
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {/* 電話 (點擊撥號) */}
                        {s.phone ? (
                          <a
                            href={`tel:${s.phone}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              color: '#2563eb',
                              textDecoration: 'none',
                              fontWeight: '500'
                            }}
                          >
                            <Phone size={13} />
                            <span>{s.phone}</span>
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', padding: '5px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={13} /> 無電話
                          </span>
                        )}

                        {/* 體能證明按鈕 */}
                        {(() => {
                          const validProofUrls = parseProofUrls(s.strengthProof);
                          if (validProofUrls.length > 0) {
                            return (
                              <button
                                type="button"
                                onClick={() => onViewProof(s)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  color: '#1d4ed8',
                                  fontWeight: 'bold',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                <ImageIcon size={13} />
                                <span>{t('adminEvents.viewProof')}</span>
                                {validProofUrls.length > 1 && (
                                  <span style={{
                                    backgroundColor: '#2563eb',
                                    color: 'white',
                                    fontSize: '10px',
                                    padding: '1px 5px',
                                    borderRadius: '10px',
                                    marginLeft: '2px'
                                  }}>
                                    {validProofUrls.length}
                                  </span>
                                )}
                              </button>
                            );
                          }
                          if (s.strengthProof && s.strengthProof.trim() !== '' && s.strengthProof.trim() !== '無') {
                            return (
                              <button
                                type="button"
                                onClick={() => onViewProof(s)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  backgroundColor: '#f8fafc',
                                  border: '1px solid #cbd5e1',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  color: '#475569',
                                  fontSize: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                <ImageIcon size={13} />
                                <span>查看體能記錄</span>
                              </button>
                            );
                          }
                          return (
                            <span style={{ color: '#94a3b8', padding: '5px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                              <ImageIcon size={13} /> 無證明照片
                            </span>
                          );
                        })()}

                        {/* 瀏覽個人資料按鈕 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewProfile(s);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <User size={13} />
                          <span>瀏覽個人資料</span>
                        </button>
                      </div>

                      {/* 審核操作按鈕組 */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '2px',
                        borderTop: '1px dashed #e2e8f0',
                        paddingTop: '10px'
                      }}>
                        {updatingSignupCode === String(s.rowNumber) ? (
                          <div className="spinner" style={{ width: '20px', height: '20px', margin: '4px auto' }}></div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onUpdateApplicantResult(s, '正取 Confirmed')}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: isAccepted ? '#16a34a' : '#e2e8f0',
                                color: isAccepted ? 'white' : '#475569',
                                transition: 'all 0.2s',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                boxShadow: isAccepted ? '0 2px 4px rgba(22, 163, 74, 0.25)' : 'none'
                              }}
                            >
                              <CheckCircle2 size={13} />
                              <span>{t('adminEvents.btnAccept')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateApplicantResult(s, '備取 Waitlisted')}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                border: 'none',
                                cursor: 'pointer',
                                backgroundColor: isWaitlisted ? '#ea580c' : '#e2e8f0',
                                color: isWaitlisted ? 'white' : '#475569',
                                transition: 'all 0.2s',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                boxShadow: isWaitlisted ? '0 2px 4px rgba(234, 88, 12, 0.25)' : 'none'
                              }}
                            >
                              <Clock4 size={13} />
                              <span>{t('adminEvents.btnWaitlist')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateApplicantResult(s, '審核中 Checking')}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: 'white',
                                color: '#64748b',
                                cursor: 'pointer',
                                fontWeight: '500',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px'
                              }}
                            >
                              <RotateCcw size={12} />
                              <span>{t('adminEvents.btnReset')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal 底部固定操作欄 */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
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
            {t('adminEvents.closeBtn')}
          </button>

          <button
            type="button"
            disabled={sendingNotifications || signupsList.length === 0}
            onClick={onSendNotifications}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#059669',
              color: 'white',
              fontSize: '13px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.2)'
            }}
          >
            {sendingNotifications && <div className="spinner" style={{ width: '14px', height: '14px' }}></div>}
            <Send size={14} />
            <span>
              {sendingNotifications
                ? t('adminEvents.sendingNotifications')
                : t('adminEvents.btnSendNotifications')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

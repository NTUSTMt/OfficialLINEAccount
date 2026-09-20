import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  Clock4,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  MessageCircle,
  ImageIcon,
  ShieldCheck
} from 'lucide-react';
import type { AdminEvent, SignupApplicant } from '../../types/event';
import { getDirectImageUrl } from '../../utils/image';
import { sortApplicantsConfirmedFirst } from '../../utils/eventArchiveUtils';
import { openExternalUrl } from '../../utils/applicantUtils';

interface AdminHistoryEventCardProps {
  evt: AdminEvent;
  signups?: SignupApplicant[];
  loadingSignups?: boolean;
  onExpandChange?: (isExpanded: boolean) => void;
  onViewProfile: (applicant: SignupApplicant) => void;
  onViewProof?: (applicant: SignupApplicant) => void;
}

export const AdminHistoryEventCard: React.FC<AdminHistoryEventCardProps> = ({
  evt,
  signups = [],
  loadingSignups = false,
  onExpandChange,
  onViewProfile
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isShortDescOpen, setIsShortDescOpen] = useState(false);
  const [isFullDescOpen, setIsFullDescOpen] = useState(false);
  const [applicantFilter, setApplicantFilter] = useState<'all' | 'accepted' | 'waitlisted'>('all');

  const imgDirect = evt.imageUrl ? (getDirectImageUrl(evt.imageUrl, 400) || evt.imageUrl) : '';

  const handleToggleExpand = () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    if (onExpandChange) {
      onExpandChange(nextState);
    }
  };

  // 格式化活動日期區間
  const formattedDates = useMemo(() => {
    const start = evt.startDate ? evt.startDate.replace(/-/g, '/') : '';
    const end = evt.endDate ? evt.endDate.replace(/-/g, '/') : '';
    if (start && end && start !== end) {
      return `${start} ~ ${end}`;
    }
    return start || end || '無出隊日期';
  }, [evt.startDate, evt.endDate]);

  // 報名人員預設正取在前排序
  const sortedApplicants = useMemo(() => {
    return sortApplicantsConfirmedFirst(signups);
  }, [signups]);

  // 人員切換篩選（全部 / 僅正取 / 僅備取）
  const filteredApplicants = useMemo(() => {
    if (applicantFilter === 'accepted') {
      return sortedApplicants.filter(
        (a) => a.reviewResult.includes('正取') || a.reviewResult.toLowerCase().includes('confirmed')
      );
    }
    if (applicantFilter === 'waitlisted') {
      return sortedApplicants.filter(
        (a) => a.reviewResult.includes('備取') || a.reviewResult.toLowerCase().includes('waitlist')
      );
    }
    return sortedApplicants;
  }, [sortedApplicants, applicantFilter]);

  const acceptedCount = useMemo(() => {
    return sortedApplicants.filter(
      (a) => a.reviewResult.includes('正取') || a.reviewResult.toLowerCase().includes('confirmed')
    ).length;
  }, [sortedApplicants]);

  const waitlistedCount = useMemo(() => {
    return sortedApplicants.filter(
      (a) => a.reviewResult.includes('備取') || a.reviewResult.toLowerCase().includes('waitlist')
    ).length;
  }, [sortedApplicants]);

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
      }}
    >
      {/* 頂部主卡片資訊（可點擊折疊/展開） */}
      <div
        onClick={handleToggleExpand}
        style={{
          padding: '16px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: isExpanded ? '#fafafa' : '#ffffff',
          borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
        }}
      >
        {/* 上半部：縮圖與活動文字標題 */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', width: '100%' }}>
          {/* 活動主視覺縮圖 */}
          {imgDirect ? (
            <img
              src={imgDirect}
              alt={evt.name}
              style={{
                width: '88px',
                height: '88px',
                borderRadius: '12px',
                objectFit: 'cover',
                flexShrink: 0,
                backgroundColor: '#f1f5f9'
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              style={{
                width: '88px',
                height: '88px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#94a3b8'
              }}
            >
              <ImageIcon size={32} />
            </div>
          )}

          {/* 活動主資訊 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#64748b',
                  backgroundColor: '#f1f5f9',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                代號: {evt.id}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  backgroundColor: '#e2e8f0',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                已歸檔歷史活動
              </span>
            </div>

            <h3
              style={{
                margin: '0 0 6px',
                fontSize: '16px',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.3,
                wordBreak: 'break-word'
              }}
            >
              {evt.name}{evt.nameEn ? ` / ${evt.nameEn}` : ''}
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '12px', color: '#64748b' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={13} color="#059669" />
                <span>{formattedDates}</span>
              </span>
              {evt.cost && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>費用: {evt.cost}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 下半部：統計指標（靠齊卡片最左側，不受上方圖片影響）與展開箭頭 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#1e293b',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '2px 8px',
                borderRadius: '6px'
              }}
            >
              <Users size={12} color="#059669" />
              <span>報名 {evt.stats?.total ?? sortedApplicants.length} 人</span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#15803d',
                backgroundColor: '#dcfce7',
                padding: '2px 7px',
                borderRadius: '6px'
              }}
            >
              <CheckCircle2 size={11} />
              <span>正取 {evt.stats?.accepted ?? acceptedCount}</span>
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#c2410c',
                backgroundColor: '#ffedd5',
                padding: '2px 7px',
                borderRadius: '6px'
              }}
            >
              <Clock4 size={11} />
              <span>備取 {evt.stats?.waitlisted ?? waitlistedCount}</span>
            </span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              color: '#059669',
              backgroundColor: isExpanded ? '#ecfdf5' : '#f8fafc',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
              marginLeft: 'auto'
            }}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {/* 展開後的詳細資訊區塊 */}
      {isExpanded && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 群組連結 (若有) */}
          {evt.lineGroupUrl && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: '#f0fdf4',
                borderRadius: '10px',
                border: '1px solid #bbf7d0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageCircle size={16} color="#16a34a" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                  活動 LINE 交流群組連結
                </span>
              </div>
              <button
                type="button"
                onClick={() => openExternalUrl(evt.lineGroupUrl!)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>開啟群組</span>
                <ExternalLink size={12} />
              </button>
            </div>
          )}

          {/* 簡介（預設收起） */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setIsShortDescOpen((prev) => !prev)}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} color="#059669" />
                <span>活動簡介</span>
              </span>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>{isShortDescOpen ? '收起簡介' : '展開簡介'}</span>
                {isShortDescOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
            {isShortDescOpen && (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #f1f5f9'
                }}
              >
                {evt.shortDesc?.trim() ? evt.shortDesc : '（此活動未填寫簡介）'}
              </div>
            )}
          </div>

          {/* 詳細時程（預設收起） */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setIsFullDescOpen((prev) => !prev)}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} color="#059669" />
                <span>詳細時程與裝備需求</span>
              </span>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>{isFullDescOpen ? '收起時程' : '展開詳細時程'}</span>
                {isFullDescOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>
            {isFullDescOpen && (
              <div
                style={{
                  padding: '12px 14px',
                  fontSize: '13px',
                  color: '#475569',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  backgroundColor: '#ffffff',
                  borderTop: '1px solid #f1f5f9'
                }}
              >
                {evt.fullDesc?.trim() ? evt.fullDesc : '（此活動未填寫詳細時程）'}
              </div>
            )}
          </div>

          {/* 報名人員名冊區塊 */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} color="#059669" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  報名人員名單（正取優先排序）
                </span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  ({sortedApplicants.length} 人)
                </span>
              </div>

              {/* 切換按鈕：全部 / 僅正取 / 僅備取 */}
              <div style={{ display: 'inline-flex', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden', backgroundColor: '#f8fafc' }}>
                <button
                  type="button"
                  onClick={() => setApplicantFilter('all')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: applicantFilter === 'all' ? 700 : 500,
                    border: 'none',
                    backgroundColor: applicantFilter === 'all' ? '#059669' : 'transparent',
                    color: applicantFilter === 'all' ? '#ffffff' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  全部 ({sortedApplicants.length})
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantFilter('accepted')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: applicantFilter === 'accepted' ? 700 : 500,
                    border: 'none',
                    backgroundColor: applicantFilter === 'accepted' ? '#16a34a' : 'transparent',
                    color: applicantFilter === 'accepted' ? '#ffffff' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  正取 ({acceptedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setApplicantFilter('waitlisted')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: applicantFilter === 'waitlisted' ? 700 : 500,
                    border: 'none',
                    backgroundColor: applicantFilter === 'waitlisted' ? '#ea580c' : 'transparent',
                    color: applicantFilter === 'waitlisted' ? '#ffffff' : '#64748b',
                    cursor: 'pointer'
                  }}
                >
                  備取 ({waitlistedCount})
                </button>
              </div>
            </div>

            {/* 人員清單呈現 */}
            {loadingSignups ? (
              <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto 8px' }}></div>
                <span style={{ fontSize: '12px', color: '#64748b' }}>載入報名名冊中...</span>
              </div>
            ) : filteredApplicants.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '10px', color: '#94a3b8', fontSize: '13px' }}>
                無符合此條件之報名人員
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '10px'
                }}
              >
                {filteredApplicants.map((applicant) => {
                  const isConfirmed =
                    applicant.reviewResult.includes('正取') ||
                    applicant.reviewResult.toLowerCase().includes('confirmed');
                  const isWaitlist =
                    applicant.reviewResult.includes('備取') ||
                    applicant.reviewResult.toLowerCase().includes('waitlist');

                  const isOfficial =
                    (applicant as any).isOfficial === '是' ||
                    (applicant as any).isOfficial === true ||
                    (applicant as any).is_official_member === true;

                  return (
                    <div
                      key={applicant.rowNumber || applicant.signupCode || applicant.name}
                      onClick={() => onViewProfile(applicant)}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {applicant.name}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: isConfirmed ? '#dcfce7' : isWaitlist ? '#ffedd5' : '#f1f5f9',
                            color: isConfirmed ? '#15803d' : isWaitlist ? '#c2410c' : '#64748b'
                          }}
                        >
                          {isConfirmed ? '正取' : isWaitlist ? '備取' : applicant.reviewResult || '審核中'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                        <span>{applicant.department || applicant.gender || '一般報名'}</span>
                        {isOfficial && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#16a34a', fontWeight: 600 }}>
                            <ShieldCheck size={11} />
                            <span>正式社員</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

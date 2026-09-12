import React, { useState } from 'react';
import {
  ImageIcon,
  X,
  ExternalLink,
  User,
  Info,
  Phone,
  Copy,
  Check,
  ShieldAlert,
  Mountain,
  CheckCircle2,
  Clock4,
  RotateCcw
} from 'lucide-react';
import type { SignupApplicant } from '../../types/event';
import { openExternalUrl, parseProofUrls } from '../../utils/applicantUtils';

interface ApplicantModalsProps {
  proofModalData: {
    name: string;
    urls: string[];
  } | null;
  onCloseProof: () => void;
  profileModalApplicant: SignupApplicant | null;
  onCloseProfile: () => void;
  onUpdateApplicantResult: (applicant: SignupApplicant, newResult: string) => Promise<void>;
  updatingSignupCode: string | null;
}

export const ApplicantModals: React.FC<ApplicantModalsProps> = ({
  proofModalData,
  onCloseProof,
  profileModalApplicant,
  onCloseProfile,
  onUpdateApplicantResult,
  updatingSignupCode
}) => {
  const [copiedLineId, setCopiedLineId] = useState<string | null>(null);

  return (
    <>
      {/* 體能證明清單 Modal */}
      {proofModalData && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            padding: '16px'
          }}
          onClick={onCloseProof}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '20px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={18} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>
                  {proofModalData.name} 的體能證明檔案 ({proofModalData.urls.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={onCloseProof}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {proofModalData.urls.map((url, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#334155' }}>
                    證明文件 #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => openExternalUrl(url)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>開啟查看</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 報名者詳細個人資料彈窗 (Applicant Profile Modal) */}
      {profileModalApplicant && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '16px'
          }}
          onClick={onCloseProfile}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '22px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 標題欄 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16a34a'
                }}>
                  <User size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>
                    報名者個人資料
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {profileModalApplicant.name} · {profileModalApplicant.signupCode ? `代碼: ${profileModalApplicant.signupCode}` : `序號: #${profileModalApplicant.rowNumber}`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseProfile}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 內容區塊 1: 基本資料 */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                <Info size={14} color="#059669" />
                <span>基本資料</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
                <div><span style={{ color: '#64748b' }}>姓名：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{profileModalApplicant.name}</span></div>
                <div><span style={{ color: '#64748b' }}>性別：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.gender || '未填'}</span></div>
                <div><span style={{ color: '#64748b' }}>身分資格：</span><span style={{ fontWeight: 'bold', color: profileModalApplicant.isOfficial === '是' ? '#16a34a' : '#64748b' }}>{profileModalApplicant.isOfficial === '是' ? '正式社員' : '非社員'}</span></div>
                <div><span style={{ color: '#64748b' }}>生日：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.birthday || '未填'}</span></div>
                {profileModalApplicant.studentId && (
                  <div><span style={{ color: '#64748b' }}>學號：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.studentId}</span></div>
                )}
                {profileModalApplicant.department && (
                  <div><span style={{ color: '#64748b' }}>系所：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.department}</span></div>
                )}
                {profileModalApplicant.idNumber && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748b' }}>證件號碼：</span>
                    <span style={{ color: '#0f172a' }}>{profileModalApplicant.idNumber}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 內容區塊 2: 通訊與聯絡 */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                <Phone size={14} color="#059669" />
                <span>通訊與聯絡</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><span style={{ color: '#64748b' }}>LINE ID：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{profileModalApplicant.lineId || '未填'}</span></span>
                  {profileModalApplicant.lineId && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(profileModalApplicant.lineId);
                        setCopiedLineId(String(profileModalApplicant.rowNumber));
                        setTimeout(() => setCopiedLineId(null), 1800);
                      }}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: 'white',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        color: copiedLineId === String(profileModalApplicant.rowNumber) ? '#16a34a' : '#475569'
                      }}
                    >
                      {copiedLineId === String(profileModalApplicant.rowNumber) ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedLineId === String(profileModalApplicant.rowNumber) ? '已複製' : '複製'}</span>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span><span style={{ color: '#64748b' }}>聯絡電話：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{profileModalApplicant.phone || '未填'}</span></span>
                  {profileModalApplicant.phone && (
                    <a
                      href={`tel:${profileModalApplicant.phone}`}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #bfdbfe',
                        backgroundColor: '#eff6ff',
                        fontSize: '11px',
                        color: '#1d4ed8',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        fontWeight: 'bold'
                      }}
                    >
                      <Phone size={11} />
                      <span>通話撥打</span>
                    </a>
                  )}
                </div>
                {profileModalApplicant.email && (
                  <div><span style={{ color: '#64748b' }}>電子信箱：</span><a href={`mailto:${profileModalApplicant.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{profileModalApplicant.email}</a></div>
                )}
                {profileModalApplicant.address && (
                  <div><span style={{ color: '#64748b' }}>聯絡地址：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.address}</span></div>
                )}
              </div>
            </div>

            {/* 內容區塊 3: 緊急聯絡人 */}
            {(profileModalApplicant.emerName || profileModalApplicant.emerPhone || profileModalApplicant.emerRel || profileModalApplicant.emerAddr) && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                  <ShieldAlert size={14} color="#e11d48" />
                  <span>緊急聯絡人資訊</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
                  <div><span style={{ color: '#64748b' }}>聯絡人：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{profileModalApplicant.emerName || '未填'}</span></div>
                  <div><span style={{ color: '#64748b' }}>關係：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.emerRel || '未填'}</span></div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: '#64748b' }}>電話：</span>
                    {profileModalApplicant.emerPhone ? (
                      <a href={`tel:${profileModalApplicant.emerPhone}`} style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'none' }}>
                        {profileModalApplicant.emerPhone}
                      </a>
                    ) : '未填'}
                  </div>
                  {profileModalApplicant.emerAddr && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#64748b' }}>地址：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.emerAddr}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 內容區塊 4: 登山經歷與體能 */}
            <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                <Mountain size={14} color="#059669" />
                <span>登山經歷與體能</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div><span style={{ color: '#64748b' }}>爬山經驗：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.experience || '未填寫'}</span></div>
                <div><span style={{ color: '#64748b' }}>體能紀錄：</span><span style={{ color: '#0f172a' }}>{profileModalApplicant.fitnessTest || '未填寫'}</span></div>
                {profileModalApplicant.medicalHistory && (
                  <div><span style={{ color: '#e11d48', fontWeight: '600' }}>特殊病史/過敏：</span><span style={{ color: '#e11d48' }}>{profileModalApplicant.medicalHistory}</span></div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                  <span style={{ color: '#64748b' }}>體能證明文件：</span>
                  {(() => {
                    const validUrls = parseProofUrls(profileModalApplicant.strengthProof);
                    if (validUrls.length > 0) {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (validUrls.length === 1) {
                              openExternalUrl(validUrls[0]);
                            } else {
                              onCloseProfile();
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <ImageIcon size={12} />
                          <span>查看證明檔案 ({validUrls.length})</span>
                        </button>
                      );
                    }
                    return <span style={{ color: '#94a3b8', fontSize: '12px' }}>無證明照片</span>;
                  })()}
                </div>
              </div>
            </div>

            {/* 內容區塊 5: 快速審核操作列 */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#64748b' }}>當前審核狀態：</span>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  backgroundColor: profileModalApplicant.reviewResult.indexOf('正取') > -1 ? '#dcfce7' : profileModalApplicant.reviewResult.indexOf('備取') > -1 ? '#ffedd5' : '#f1f5f9',
                  color: profileModalApplicant.reviewResult.indexOf('正取') > -1 ? '#15803d' : profileModalApplicant.reviewResult.indexOf('備取') > -1 ? '#c2410c' : '#64748b'
                }}>
                  {profileModalApplicant.reviewResult || '審核中 Checking'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {updatingSignupCode === String(profileModalApplicant.rowNumber) ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px',
                    width: '100%',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div className="spinner" style={{ width: '18px', height: '18px', margin: 0 }}></div>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 'bold' }}>審核更新中...</span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={updatingSignupCode !== null}
                      onClick={() => onUpdateApplicantResult(profileModalApplicant, '正取 Confirmed')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: updatingSignupCode !== null ? 'not-allowed' : 'pointer',
                        backgroundColor: profileModalApplicant.reviewResult.indexOf('正取') > -1 ? '#16a34a' : '#f1f5f9',
                        color: profileModalApplicant.reviewResult.indexOf('正取') > -1 ? 'white' : '#475569',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        opacity: updatingSignupCode !== null ? 0.6 : 1
                      }}
                    >
                      <CheckCircle2 size={13} />
                      <span>正取</span>
                    </button>
                    <button
                      type="button"
                      disabled={updatingSignupCode !== null}
                      onClick={() => onUpdateApplicantResult(profileModalApplicant, '備取 Waitlisted')}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 'bold',
                        border: 'none',
                        cursor: updatingSignupCode !== null ? 'not-allowed' : 'pointer',
                        backgroundColor: profileModalApplicant.reviewResult.indexOf('備取') > -1 ? '#ea580c' : '#f1f5f9',
                        color: profileModalApplicant.reviewResult.indexOf('備取') > -1 ? 'white' : '#475569',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        opacity: updatingSignupCode !== null ? 0.6 : 1
                      }}
                    >
                      <Clock4 size={13} />
                      <span>備取</span>
                    </button>
                    <button
                      type="button"
                      disabled={updatingSignupCode !== null}
                      onClick={() => onUpdateApplicantResult(profileModalApplicant, '審核中 Checking')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: 'white',
                        color: '#64748b',
                        cursor: updatingSignupCode !== null ? 'not-allowed' : 'pointer',
                        fontWeight: '500',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        opacity: updatingSignupCode !== null ? 0.6 : 1
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>重設</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

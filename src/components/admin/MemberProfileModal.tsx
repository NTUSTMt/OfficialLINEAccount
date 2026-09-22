import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  User,
  Info,
  Phone,
  Copy,
  Check,
  ShieldAlert,
  Mountain,
  ArrowRight,
  ImageIcon,
  ExternalLink,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { fetchMemberFullDetailFromSupabase } from '../../utils/supabaseClient';
import { openExternalUrl, parseProofUrls } from '../../utils/applicantUtils';
import type { MemberFullRecord } from '../../types/admin';

export interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  officerUserId?: string;
  initialMember?: any;
  onNavigateToDetail?: (userId: string) => void;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  isOpen,
  onClose,
  userId,
  officerUserId,
  initialMember,
  onNavigateToDetail
}) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MemberFullRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedLineId, setCopiedLineId] = useState(false);

  // 解析目標 Line User ID
  const targetUserId = userId || initialMember?.line_user_id || initialMember?.userId || '';

  useEffect(() => {
    if (!isOpen || !targetUserId) {
      setDetail(null);
      setFetchError(null);
      return;
    }

    // 若傳入的 initialMember 已含有完整欄位 (如 phone, email, emergency_contact_name)
    if (initialMember && (initialMember.phone || initialMember.emergency_contact_name || initialMember.emergency_contact_phone)) {
      setDetail(initialMember as MemberFullRecord);
    }

    // 依然進行後台完整資料拉取以保證最新
    let isCancelled = false;
    const loadFullDetail = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const fullData = await fetchMemberFullDetailFromSupabase(targetUserId, officerUserId);
        if (!isCancelled) {
          if (fullData) {
            setDetail(fullData);
          } else if (!initialMember) {
            setFetchError(`找不到識別碼為 ${targetUserId} 的社員資料`);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setFetchError(`載入社員詳細資料例外: ${msg}`);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadFullDetail();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, targetUserId, officerUserId, initialMember]);

  if (!isOpen) return null;

  // 統合欄位資料
  const merged: any = { ...initialMember, ...detail };
  const name = merged.name || '未命名社員';
  const gender = merged.gender || '未填';
  const isOfficial = Boolean(
    merged.is_official_member === true ||
    merged.is_official_member === 'true' ||
    merged.is_official_member === '是' ||
    merged.is_official === true ||
    merged.is_official === 'true' ||
    merged.is_official === '是' ||
    merged.isOfficial === '是' ||
    merged.isOfficial === true ||
    merged.isOfficial === 'true' ||
    merged.isOfficialMember === true ||
    merged.isOfficialMember === 'true' ||
    merged.isOfficialMember === '是'
  );
  const birthday = merged.birthday || '';
  const studentId = merged.student_id || merged.studentId || '';
  const department = merged.department || '';
  const idNumber = merged.id_card || merged.idNumber || '';
  const identityStatus = merged.identity_status || merged.identityStatus || '';

  const realLineId = merged.real_line_id || merged.line_id || merged.lineId || '';
  const lineName = merged.line_name || merged.lineName || '';
  const preferredLang = merged.preferred_language || merged.preferredLanguage || 'zh';
  const phone = merged.phone || '';
  const email = merged.email || '';
  const address = merged.address || merged.studentAddr || '';

  const emerName = merged.emergency_contact_name || merged.emerName || '';
  const emerRel = merged.emergency_contact_rel || merged.emerRel || '';
  const emerPhone = merged.emergency_contact_phone || merged.emerPhone || '';
  const emerAddr = merged.emergency_contact_address || merged.emerAddr || '';

  const experience = merged.outdoor_experience || merged.experience || merged.exp || '';
  const fitnessTest = merged.fitness_desc || merged.fitnessTest || merged.strength || '';
  const medicalHistory = merged.medical_history || merged.medicalHistory || '';
  const wantToSay = merged.want_to_say || merged.wantToSay || '';
  const officerIntent = merged.officer_intent || merged.officerIntent || '';
  const hasOfficerIntent = Boolean(officerIntent && (officerIntent.includes('意願') || officerIntent === '我有意願成為社團幹部'));

  // 體能照片清單
  const rawProof = merged.proof_urls || merged.strengthProof;
  const proofUrls: string[] = Array.isArray(rawProof)
    ? rawProof.filter(Boolean)
    : parseProofUrls(typeof rawProof === 'string' ? rawProof : '');

  const formatDateSlash = (dateStr?: string): string => {
    if (!dateStr || !String(dateStr).trim()) return '未填';
    const str = String(dateStr).trim();
    if (str === '未填' || str === '無') return '未填';

    const isoMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}/${isoMatch[2].padStart(2, '0')}/${isoMatch[3].padStart(2, '0')}`;
    }

    const parsedDate = new Date(str);
    if (!isNaN(parsedDate.getTime())) {
      const y = parsedDate.getFullYear();
      const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const d = String(parsedDate.getDate()).padStart(2, '0');
      return `${y}/${m}/${d}`;
    }

    const clean = str.split('T')[0].replace(/-/g, '/');
    return clean.length >= 10 ? clean.substring(0, 10) : clean;
  };

  const handleGoToDetail = () => {
    onClose();
    if (onNavigateToDetail) {
      onNavigateToDetail(targetUserId);
    } else if (targetUserId) {
      navigate(`/admin/members/${encodeURIComponent(targetUserId)}`);
    }
  };

  const handleCopyLineId = () => {
    if (!realLineId) return;
    navigator.clipboard.writeText(realLineId);
    setCopiedLineId(true);
    setTimeout(() => setCopiedLineId(false), 1800);
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '520px',
          width: '100%',
          padding: '20px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          textAlign: 'left'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題欄 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a'
            }}>
              <User size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold', color: '#0f172a' }}>
                  {name}
                </h3>
                {isOfficial ? (
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#dcfce7',
                    color: '#166534',
                    fontWeight: 'bold'
                  }}>
                    正式社員
                  </span>
                ) : (
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#f1f5f9',
                    color: '#64748b'
                  }}>
                    非社員
                  </span>
                )}
                {hasOfficerIntent && (
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: 'bold'
                  }}>
                    幹部意願
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {studentId ? `學號: ${studentId}` : ''} {lineName ? `· LINE: ${lineName}` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 錯誤警告顯示 */}
        {fetchError && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '13px'
          }}>
            {fetchError}
          </div>
        )}

        {/* 載入中狀態 */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px',
            color: '#64748b',
            fontSize: '12px'
          }}>
            <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>同步完整資料中...</span>
          </div>
        )}

        {/* 內容區塊 1: 基本資料 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
            <Info size={14} color="#059669" />
            <span>基本資料</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: '#64748b' }}>姓名：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{name}</span></div>
            <div><span style={{ color: '#64748b' }}>性別：</span><span style={{ color: '#0f172a' }}>{gender}</span></div>
            <div><span style={{ color: '#64748b' }}>身分：</span><span style={{ color: '#0f172a' }}>{identityStatus || '未設定'}</span></div>
            <div><span style={{ color: '#64748b' }}>偏好語言：</span><span style={{ color: '#0f172a', fontWeight: '500' }}>{preferredLang === 'en' ? 'English' : '中文'}</span></div>
            <div><span style={{ color: '#64748b' }}>生日：</span><span style={{ color: '#0f172a' }}>{formatDateSlash(birthday)}</span></div>
            {studentId && (
              <div><span style={{ color: '#64748b' }}>學號：</span><span style={{ color: '#0f172a' }}>{studentId}</span></div>
            )}
            {department && (
              <div><span style={{ color: '#64748b' }}>系所：</span><span style={{ color: '#0f172a' }}>{department}</span></div>
            )}
            {idNumber && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b' }}>證件號碼：</span>
                <span style={{ color: '#0f172a' }}>{idNumber}</span>
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
              <span><span style={{ color: '#64748b' }}>LINE ID：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{realLineId || '未填'}</span></span>
              {realLineId && (
                <button
                  type="button"
                  onClick={handleCopyLineId}
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
                    color: copiedLineId ? '#16a34a' : '#475569'
                  }}
                >
                  {copiedLineId ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedLineId ? '已複製' : '複製'}</span>
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><span style={{ color: '#64748b' }}>聯絡電話：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{phone || '未填'}</span></span>
              {phone && (
                <a
                  href={`tel:${phone}`}
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
            {email && (
              <div><span style={{ color: '#64748b' }}>電子信箱：</span><a href={`mailto:${email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{email}</a></div>
            )}
            {address && (
              <div><span style={{ color: '#64748b' }}>聯絡地址：</span><span style={{ color: '#0f172a' }}>{address}</span></div>
            )}
          </div>
        </div>

        {/* 內容區塊 3: 緊急聯絡人 */}
        {(emerName || emerPhone || emerRel || emerAddr) && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
              <ShieldAlert size={14} color="#e11d48" />
              <span>緊急聯絡人資訊</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
              <div><span style={{ color: '#64748b' }}>聯絡人：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{emerName || '未填'}</span></div>
              <div><span style={{ color: '#64748b' }}>關係：</span><span style={{ color: '#0f172a' }}>{emerRel || '未填'}</span></div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b' }}>電話：</span>
                {emerPhone ? (
                  <a href={`tel:${emerPhone}`} style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'none' }}>
                    {emerPhone}
                  </a>
                ) : '未填'}
              </div>
              {emerAddr && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b' }}>地址：</span><span style={{ color: '#0f172a' }}>{emerAddr}</span>
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
            <div><span style={{ color: '#64748b' }}>爬山經驗：</span><span style={{ color: '#0f172a' }}>{experience || '未填寫'}</span></div>
            <div><span style={{ color: '#64748b' }}>體能紀錄：</span><span style={{ color: '#0f172a' }}>{fitnessTest || '未填寫'}</span></div>
            {medicalHistory && (
              <div><span style={{ color: '#e11d48', fontWeight: '600' }}>特殊病史/過敏：</span><span style={{ color: '#e11d48' }}>{medicalHistory}</span></div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <span style={{ color: '#64748b' }}>體能證明文件：</span>
              {proofUrls.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    proofUrls.forEach((url) => openExternalUrl(url));
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
                  <span>查看證明檔案 ({proofUrls.length})</span>
                  <ExternalLink size={12} />
                </button>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>無證明照片</span>
              )}
            </div>
          </div>
        </div>

        {/* 內容區塊 5: 想對幹部說的話 (want_to_say) */}
        {wantToSay && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
              <MessageSquare size={14} color="#059669" />
              <span>想對幹部說的話</span>
            </div>
            <div style={{ fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
              {wantToSay}
            </div>
          </div>
        )}

        {/* 底部按鈕：移至社員詳細資料編輯頁面 */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '4px' }}>
          <button
            type="button"
            disabled={!targetUserId}
            onClick={handleGoToDetail}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: targetUserId ? '#059669' : '#94a3b8',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 'bold',
              border: 'none',
              cursor: targetUserId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.15s ease'
            }}
          >
            <span>移至社員詳細資料編輯頁面</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

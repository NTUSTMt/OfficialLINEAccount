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
  Loader2,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { fetchMemberFullDetailFromSupabase } from '../../utils/supabaseClient';
import { openExternalUrl, parseProofUrls } from '../../utils/applicantUtils';
import { getDriveThumbnail } from '../../utils/driveUtils';

import { getNationalityLabel, parseTaiwanAddress } from '../../constants/nationalities';
import type { MemberFullRecord } from '../../types/admin';

export interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  officerUserId?: string;
  initialMember?: any;
  onNavigateToDetail?: (userId: string) => void;
  onOpenEditDrawer?: (userId: string) => void;
  mode?: 'modal' | 'inline';
  onPreviewPhoto?: (url: string) => void;
}

export const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  isOpen,
  onClose,
  userId,
  officerUserId,
  initialMember,
  onNavigateToDetail,
  onOpenEditDrawer,
  mode = 'modal',
  onPreviewPhoto
}) => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MemberFullRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [internalPreviewUrl, setInternalPreviewUrl] = useState<string | null>(null);
  const [isPermitExpanded, setIsPermitExpanded] = useState(true);

  // 電腦版 / 行動版視窗寬度偵測
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 解析目標 Line User ID
  const targetUserId = userId || initialMember?.line_user_id || initialMember?.userId || '';

  useEffect(() => {
    if (!isOpen || !targetUserId) {
      setDetail(null);
      setFetchError(null);
      setInternalPreviewUrl(null);
      return;
    }

    // 每次開啟彈窗一律預設直接展開臺灣登山申請表
    setIsPermitExpanded(true);

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
  const nationality = merged.nationality || '中華民國';
  // 幹部在網頁後台看到的國籍為繁體中文
  const nationalityLabel = getNationalityLabel(nationality, 'zh');

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
  const birthday = merged.birthday || merged.birthDate || '';
  const studentId = merged.student_id || merged.studentId || '';
  const department = merged.department || '';
  const idNumber = merged.id_card || merged.idNumber || merged.idCard || merged.id || '';
  const identityStatus = merged.identity_status || merged.identityStatus || '';

  const realLineId = merged.real_line_id || merged.line_id || merged.lineId || '';
  const lineName = merged.line_name || merged.lineName || '';
  const preferredLang = merged.preferred_language || merged.preferredLanguage || 'zh';
  const phone = merged.phone || merged.mobile || merged.cellphone || '';
  const email = merged.email || '';
  const address = merged.address || merged.studentAddr || merged.student_addr || '';

  const emerName = merged.emergency_contact_name || merged.emerName || merged.emer_name || merged.emergencyContactName || '';
  const emerRel = merged.emergency_contact_rel || merged.emerRel || merged.emer_rel || merged.emergencyContactRel || '';
  const emerPhone = merged.emergency_contact_phone || merged.emerPhone || merged.emer_phone || merged.emergencyContactPhone || '';
  const emerAddr = merged.emergency_contact_address || merged.emerAddr || merged.emer_addr || merged.emergencyContactAddress || '';

  const experience = merged.outdoor_experience || merged.experience || merged.exp || '';
  const fitnessTest = merged.fitness_desc || merged.fitnessTest || merged.strength || '';
  const medicalHistory = merged.medical_history || merged.medicalHistory || '';
  const wantToSay = merged.want_to_say || merged.wantToSay || '';
  const officerIntent = merged.officer_intent || merged.officerIntent || '';
  const hasOfficerIntent = Boolean(officerIntent && (officerIntent.includes('意願') || officerIntent === '我有意願成為社團幹部'));

  // 臺灣地址智慧自動拆解
  const parsedAddress = parseTaiwanAddress(address);

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

  const formatBirthdayHyphen = (dateStr?: string): string => {
    if (!dateStr || !String(dateStr).trim()) return '';
    const str = String(dateStr).trim();
    if (str === '未填' || str === '無') return '';

    const match = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return str.replace(/\//g, '-').substring(0, 10);
  };

  const handleGoToDetail = () => {
    onClose();
    if (onOpenEditDrawer && targetUserId) {
      onOpenEditDrawer(targetUserId);
    } else if (onNavigateToDetail) {
      onNavigateToDetail(targetUserId);
    } else if (targetUserId) {
      navigate(`/admin/members/${encodeURIComponent(targetUserId)}`);
    }
  };

  const handleCopyField = (key: string, textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(key);
    setTimeout(() => {
      setCopiedField((curr) => (curr === key ? null : curr));
    }, 1800);
  };

  // 複製小按鈕元件
  const renderCopyBtn = (key: string, textToCopy?: string | null, tooltip: string = '複製') => {
    const isCopied = copiedField === key;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleCopyField(key, textToCopy || '');
        }}
        title={isCopied ? '已複製！' : tooltip}
        aria-label={isCopied ? '已複製！' : tooltip}
        style={{
          background: isCopied ? '#ecfdf5' : 'transparent',
          border: isCopied ? '1px solid #10b981' : 'none',
          borderRadius: '4px',
          cursor: textToCopy ? 'pointer' : 'default',
          padding: '2px 5px',
          color: isCopied ? '#059669' : '#94a3b8',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '11px',
          flexShrink: 0,
          transition: 'all 0.15s ease'
        }}
      >
        {isCopied ? <Check size={12} /> : <Copy size={12} />}
        {isCopied && <span style={{ fontWeight: 600 }}>已複製</span>}
      </button>
    );
  };

  // 申請表單一規格欄位
  const renderPermitField = (
    label: string,
    value: string,
    copyKey: string,
    copyVal?: string,
    extraHint?: string,
    allowWrap: boolean = false
  ) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          minHeight: '38px'
        }}>
          <div style={{
            backgroundColor: '#f1f5f9',
            borderRight: '1px solid #cbd5e1',
            padding: '8px 10px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            minWidth: '95px',
            textAlign: 'center'
          }}>
            {label}
          </div>
          <div style={{
            flex: 1,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#0f172a',
            minWidth: 0,
            gap: '6px'
          }}>
            <span
              style={{
                overflow: allowWrap ? 'visible' : 'hidden',
                textOverflow: allowWrap ? 'clip' : 'ellipsis',
                whiteSpace: allowWrap ? 'normal' : 'nowrap',
                wordBreak: allowWrap ? 'break-word' : 'normal',
                fontWeight: 500,
                color: value ? '#0f172a' : '#94a3b8'
              }}
              title={value}
            >
              {value || '未填'}
            </span>
            {renderCopyBtn(copyKey, copyVal || value)}
          </div>
        </div>
        {extraHint && (
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px', paddingLeft: '4px' }}>
            {extraHint}
          </div>
        )}
      </div>
    );
  };

  // 1. 電腦網頁版專用：臺灣登山申請格式卡片
  const renderTaiwanMountainPermit = () => {
    return (
      <div
        className="wa-mountain-permit-card"
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
          backgroundColor: '#ffffff'
        }}
      >
        {/* 深藍色頂部標題列 (點擊可展開/收合) */}
        <div
          onClick={() => setIsPermitExpanded((prev) => !prev)}
          title={isPermitExpanded ? '點擊收合臺灣登山申請表' : '點擊展開臺灣登山申請表'}
          style={{
            backgroundColor: '#3b4d6b',
            padding: '10px 14px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color 0.15s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px' }}>
            <span style={{
              backgroundColor: '#e11d48',
              borderRadius: '4px',
              padding: '3px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <User size={14} color="#ffffff" />
            </span>
            <span>隊員資料 (臺灣登山申請格式)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#cbd5e1', backgroundColor: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: '4px' }}>
              入園入山標準格式
            </span>
            {isPermitExpanded ? (
              <ChevronUp size={16} color="#cbd5e1" />
            ) : (
              <ChevronDown size={16} color="#cbd5e1" />
            )}
          </div>
        </div>

        {/* 申請表欄位本體 */}
        {isPermitExpanded && (
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Row 1: 姓名 + 電話 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {renderPermitField('姓名', name, 'permit-name', name)}
            {renderPermitField(
              '電話',
              phone ? `${phone} (同手機)` : '未填',
              'permit-tel',
              phone
            )}
          </div>

          {/* Row 2: 地址 (縣市 + 鄉鎮市區 + 詳細地址) */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            minHeight: '38px'
          }}>
            <div style={{
              backgroundColor: '#f1f5f9',
              borderRight: '1px solid #cbd5e1',
              padding: '8px 10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              minWidth: '95px',
              textAlign: 'center'
            }}>
              地址
            </div>
            <div style={{
              flex: 1,
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: 0,
              flexWrap: 'wrap'
            }}>
              {/* 縣市格 */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ color: parsedAddress.city ? '#0f172a' : '#94a3b8' }}>
                  {parsedAddress.city || '請選擇縣市'}
                </span>
                {parsedAddress.city && renderCopyBtn('permit-addr-city', parsedAddress.city, '複製縣市')}
              </div>

              {/* 鄉鎮市區格 */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span style={{ color: parsedAddress.district ? '#0f172a' : '#94a3b8' }}>
                  {parsedAddress.district || '請選擇'}
                </span>
                {parsedAddress.district && renderCopyBtn('permit-addr-dist', parsedAddress.district, '複製鄉鎮市區')}
              </div>

              {/* 詳細地址格 */}
              <div style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minWidth: '160px'
              }}>
                <span
                  style={{
                    wordBreak: 'break-word',
                    color: parsedAddress.detail ? '#0f172a' : '#94a3b8'
                  }}
                  title={parsedAddress.detail}
                >
                  {parsedAddress.detail || '請輸入聯絡地址'}
                </span>
                {parsedAddress.detail && renderCopyBtn('permit-addr-detail', parsedAddress.detail, '複製詳細地址')}
              </div>

              {/* 複製全址按鈕 */}
              {address && (
                <button
                  type="button"
                  onClick={() => handleCopyField('permit-addr-full', address)}
                  style={{
                    backgroundColor: copiedField === 'permit-addr-full' ? '#ecfdf5' : '#f1f5f9',
                    border: copiedField === 'permit-addr-full' ? '1px solid #10b981' : '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: copiedField === 'permit-addr-full' ? '#059669' : '#475569',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  {copiedField === 'permit-addr-full' ? <Check size={11} /> : <Copy size={11} />}
                  <span>{copiedField === 'permit-addr-full' ? '全址已複製' : '複製全址'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 3: 手機 + Email */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {renderPermitField(
              '手機',
              phone,
              'permit-mobile',
              phone
            )}
            {renderPermitField(
              'Email',
              email,
              'permit-email',
              email,
              undefined,
              true
            )}
          </div>

          {/* Row 4: 身分證號/護照號碼(或居留證) (國籍 + 證號) */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            minHeight: '38px'
          }}>
            <div style={{
              backgroundColor: '#f1f5f9',
              borderRight: '1px solid #cbd5e1',
              padding: '8px 10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              minWidth: '190px',
              textAlign: 'center'
            }}>
              身分證號/護照號碼(或居留證)
            </div>
            <div style={{
              flex: 1,
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0
            }}>
              {/* 國籍下拉格 (網頁後台顯示中文) */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#0f172a',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>{nationalityLabel}</span>
                {renderCopyBtn('permit-nationality', nationalityLabel, '複製國籍')}
              </div>

              {/* 證號格 */}
              <div style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                minWidth: 0
              }}>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                    color: idNumber ? '#0f172a' : '#94a3b8'
                  }}
                  title={idNumber}
                >
                  {idNumber || '請輸入證號'}
                </span>
                {idNumber && renderCopyBtn('permit-id', idNumber, '複製證號')}
              </div>
            </div>
          </div>

          {/* Row 5: 性別 + 生日 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {renderPermitField(
              '性別',
              gender,
              'permit-gender',
              gender
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex',
                alignItems: 'stretch',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                minHeight: '38px'
              }}>
                <div style={{
                  backgroundColor: '#f1f5f9',
                  borderRight: '1px solid #cbd5e1',
                  padding: '8px 10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  minWidth: '95px',
                  textAlign: 'center'
                }}>
                  生日
                </div>
                <div style={{
                  flex: 1,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: '#0f172a',
                  minWidth: 0,
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} color="#64748b" />
                    <span style={{ fontWeight: 500, color: birthday ? '#0f172a' : '#94a3b8' }}>
                      {formatBirthdayHyphen(birthday) || '請輸入生日'}
                    </span>
                  </div>
                  {birthday && renderCopyBtn('permit-birthday', formatBirthdayHyphen(birthday), '複製生日')}
                </div>
              </div>
            </div>
          </div>

          {/* Row 6: 緊急聯絡人 + 緊急聯絡電話 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {renderPermitField(
              '緊急聯絡人',
              emerName,
              'permit-emer-name',
              emerName
            )}
            {renderPermitField(
              '緊急聯絡電話',
              emerPhone,
              'permit-emer-phone',
              emerPhone
            )}
          </div>

          {/* Row 7: 與留守人關係 + 緊急聯絡人地址 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
            {renderPermitField(
              '與留守人關係',
              emerRel,
              'permit-emer-rel',
              emerRel
            )}
            {renderPermitField(
              '緊急聯絡人地址',
              emerAddr,
              'permit-emer-addr',
              emerAddr,
              undefined,
              true
            )}
          </div>

        </div>
      )}
      </div>
    );
  };

  // 2. 電腦網頁版專用：其他資料分區結構化卡片
  const renderDesktopOtherSections = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* 卡片 1: 社團與學籍身分 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
            <Info size={14} color="#059669" />
            <span>社團與學籍身分</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: '#64748b' }}>身分狀態：</span><span style={{ color: '#0f172a' }}>{identityStatus || '未設定'}</span></div>
            <div>
              <span style={{ color: '#64748b' }}>正式社籍：</span>
              <span style={{ fontWeight: 600, color: isOfficial ? '#166534' : '#64748b' }}>
                {isOfficial ? '正式社員' : '非社員'}
              </span>
            </div>
            {studentId && (
              <div><span style={{ color: '#64748b' }}>學號：</span><span style={{ color: '#0f172a' }}>{studentId}</span></div>
            )}
            {department && (
              <div><span style={{ color: '#64748b' }}>系所：</span><span style={{ color: '#0f172a' }}>{department}</span></div>
            )}
            {merged.membership_expires_at && (
              <div><span style={{ color: '#64748b' }}>社籍有效至：</span><span style={{ color: '#0f172a' }}>{merged.membership_expires_at}</span></div>
            )}
            <div>
              <span style={{ color: '#64748b' }}>偏好語言：</span>
              <span style={{ color: '#0f172a', fontWeight: '500' }}>{preferredLang === 'en' ? 'English' : '繁體中文'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#64748b' }}>LINE ID：</span>
              <span style={{ color: '#0f172a', fontWeight: 600 }}>{realLineId || '未填'}</span>
              {realLineId && renderCopyBtn('line-id', realLineId, '複製 LINE ID')}
            </div>
            {lineName && (
              <div><span style={{ color: '#64748b' }}>LINE 暱稱：</span><span style={{ color: '#0f172a' }}>{lineName}</span></div>
            )}
            {merged.is_officer && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b' }}>幹部職責：</span>
                <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{merged.officer_role || '幹部'}</span>
              </div>
            )}
            {hasOfficerIntent && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b' }}>幹部意願：</span>
                <span style={{ color: '#1d4ed8' }}>{officerIntent}</span>
              </div>
            )}
          </div>
        </div>

        {/* 卡片 2: 緊急留守附加資訊 */}
        {(emerRel || emerAddr) && (
          <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
              <ShieldAlert size={14} color="#e11d48" />
              <span>緊急留守附加資訊</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
              {emerRel && (
                <div><span style={{ color: '#64748b' }}>與留守人關係：</span><span style={{ color: '#0f172a', fontWeight: 600 }}>{emerRel}</span></div>
              )}
              {emerAddr && (
                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#64748b', flexShrink: 0 }}>留守人地址：</span>
                  <span style={{ color: '#0f172a' }}>{emerAddr}</span>
                  {renderCopyBtn('emer-addr', emerAddr, '複製留守人地址')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 卡片 3: 登山經歷與體能審核 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
            <Mountain size={14} color="#059669" />
            <span>登山經歷與體能審核</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: '#64748b' }}>爬山經驗：</span><span style={{ color: '#0f172a' }}>{experience || '未填寫'}</span></div>
            <div><span style={{ color: '#64748b' }}>體能紀錄：</span><span style={{ color: '#0f172a' }}>{fitnessTest || '未填寫'}</span></div>
            {medicalHistory && (
              <div><span style={{ color: '#e11d48', fontWeight: '600' }}>特殊病史/過敏：</span><span style={{ color: '#e11d48' }}>{medicalHistory}</span></div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>體能證明文件：</span>
                {proofUrls.length > 0 && (
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>共 {proofUrls.length} 張 (點擊縮圖預覽大圖)</span>
                )}
              </div>
              {proofUrls.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                  {proofUrls.map((url, idx) => {
                    const thumbUrl = getDriveThumbnail(url);
                    const isSelected = mode === 'modal' && internalPreviewUrl === url;
                    return (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          width: '72px',
                          height: '72px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: isSelected ? '2px solid #059669' : '1px solid #cbd5e1',
                          cursor: 'pointer',
                          backgroundColor: '#f1f5f9',
                          flexShrink: 0,
                          transition: 'transform 0.15s ease, border-color 0.15s ease',
                          boxShadow: isSelected ? '0 0 0 2px rgba(5, 150, 105, 0.2)' : 'none'
                        }}
                        onClick={() => {
                          if (mode === 'modal') {
                            setInternalPreviewUrl(internalPreviewUrl === url ? null : url);
                          } else if (onPreviewPhoto) {
                            onPreviewPhoto(url);
                          } else {
                            openExternalUrl(url);
                          }
                        }}
                        title={`點擊檢視證明照 #${idx + 1}`}
                      >
                        <img
                          src={thumbUrl}
                          alt={`體能證明照 ${idx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = url;
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>無證明照片</span>
              )}
            </div>
          </div>
        </div>

        {/* 卡片 4: 想對幹部說的話 */}
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
      </div>
    );
  };

  // 3. 手機版專用：緊湊直式卡片排版
  const renderMobileContent = () => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* 手機內容區塊 1: 基本資料 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
            <Info size={14} color="#059669" />
            <span>基本資料</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '13px' }}>
            <div><span style={{ color: '#64748b' }}>姓名：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{name}</span></div>
            <div><span style={{ color: '#64748b' }}>性別：</span><span style={{ color: '#0f172a' }}>{gender}</span></div>
            <div><span style={{ color: '#64748b' }}>國籍：</span><span style={{ color: '#0f172a', fontWeight: 600 }}>{nationalityLabel}</span></div>
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

        {/* 手機內容區塊 2: 通訊與聯絡 */}
        <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
            <Phone size={14} color="#059669" />
            <span>通訊與聯絡</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><span style={{ color: '#64748b' }}>LINE ID：</span><span style={{ fontWeight: '600', color: '#0f172a' }}>{realLineId || '未填'}</span></span>
              {realLineId && renderCopyBtn('mobile-line-id', realLineId, '複製 LINE ID')}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span><span style={{ color: '#64748b' }}>聯絡地址：</span><span style={{ color: '#0f172a' }}>{address}</span></span>
                {renderCopyBtn('mobile-addr', address, '複製地址')}
              </div>
            )}
          </div>
        </div>

        {/* 手機內容區塊 3: 緊急聯絡人 */}
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

        {/* 手機內容區塊 4: 登山經歷與體能 */}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>體能證明文件：</span>
                {proofUrls.length > 0 && (
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>共 {proofUrls.length} 張 (點擊縮圖預覽大圖)</span>
                )}
              </div>
              {proofUrls.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}>
                  {proofUrls.map((url, idx) => {
                    const thumbUrl = getDriveThumbnail(url);
                    const isSelected = mode === 'modal' && internalPreviewUrl === url;
                    return (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          width: '72px',
                          height: '72px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: isSelected ? '2px solid #059669' : '1px solid #cbd5e1',
                          cursor: 'pointer',
                          backgroundColor: '#f1f5f9',
                          flexShrink: 0,
                          transition: 'transform 0.15s ease, border-color 0.15s ease',
                          boxShadow: isSelected ? '0 0 0 2px rgba(5, 150, 105, 0.2)' : 'none'
                        }}
                        onClick={() => {
                          if (mode === 'modal') {
                            setInternalPreviewUrl(internalPreviewUrl === url ? null : url);
                          } else if (onPreviewPhoto) {
                            onPreviewPhoto(url);
                          } else {
                            openExternalUrl(url);
                          }
                        }}
                        title={`點擊檢視證明照 #${idx + 1}`}
                      >
                        <img
                          src={thumbUrl}
                          alt={`體能證明照 ${idx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = url;
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>無證明照片</span>
              )}
            </div>
          </div>
        </div>

        {/* 手機內容區塊 5: 想對幹部說的話 */}
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
      </div>
    );
  };

  const isDesktopLayout = isDesktop || mode === 'inline';

  const innerContent = (
    <>
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

      {/* 依電腦版 / 手機版分流呈現 */}
      {isDesktopLayout ? (
        <>
          {renderTaiwanMountainPermit()}
          {renderDesktopOtherSections()}
        </>
      ) : (
        renderMobileContent()
      )}

      {/* 底部按鈕：開啟詳細資料編輯頁面 */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '4px' }}>
        <button
          type="button"
          disabled={!targetUserId}
          onClick={handleGoToDetail}
          title="移至社員詳細資料編輯頁面"
          aria-label="移至社員詳細資料編輯頁面"
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
          <span>開啟詳細資料編輯頁面</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </>
  );

  if (mode === 'inline') {
    return (
      <div className="wa-drawer-side-profile" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            backgroundColor: '#ffffff',
            height: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            textAlign: 'left',
            padding: '20px'
          }}
        >
          {innerContent}
        </div>
      </div>
    );
  }

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
        alignItems: 'flex-start',
        justifyContent: 'center',
        zIndex: 10001,
        padding: '32px 16px',
        overflowX: 'auto',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        gap: '16px'
      }}
      onClick={() => {
        onClose();
        setInternalPreviewUrl(null);
      }}
    >
      {/* 個人資料卡片 (Left) */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: isDesktopLayout ? '720px' : '520px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          textAlign: 'left',
          flexShrink: 0,
          margin: '0 auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {innerContent}
      </div>

      {/* 右側同級大圖預覽面板 (Right - 亮色藝廊風格) */}
      {internalPreviewUrl && (
        <div
          style={{
            width: '480px',
            maxHeight: '90vh',
            height: '100%',
            backgroundColor: 'var(--wa-surface)',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 35px rgba(0, 0, 0, 0.15)',
            flexShrink: 0,
            border: '1px solid var(--wa-border)',
            animation: 'fadeIn 0.18s ease-out'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--wa-surface-alt)',
              borderBottom: '1px solid var(--wa-border)',
              color: 'var(--wa-text)',
              fontWeight: 700
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
              <ImageIcon size={16} color="var(--wa-primary)" />
              <span>體能測驗證明照片預覽</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a
                href={internalPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--wa-text-muted)', display: 'flex', alignItems: 'center' }}
                title="另開新分頁查看原圖"
              >
                <ExternalLink size={16} />
              </a>
              <button
                type="button"
                onClick={() => setInternalPreviewUrl(null)}
                style={{ background: 'none', border: 'none', color: 'var(--wa-text-muted)', cursor: 'pointer', padding: 2 }}
                title="關閉照片預覽"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              overflow: 'auto',
              backgroundColor: '#f8fafc'
            }}
          >
            <img
              src={internalPreviewUrl}
              alt="體能證明大圖預覽"
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.08)',
                border: '1px solid var(--wa-border)'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

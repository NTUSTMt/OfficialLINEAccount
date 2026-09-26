import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Package,
  CreditCard,
  Loader2,
  Clock,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  User,
  FileText,
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, logWebAuditAction } from '../../utils/webAuth';
import { fetchMemberTimelineRecordsFromSupabase, type MemberTimelineResult } from '../../utils/supabaseClient';
import type { MemberTimelineRecord } from '../../types/admin';
import { NotionFilterBar } from './NotionFilterBar';
import { NATIONALITY_LIST, getNationalityLabel } from '../../constants/nationalities';
import { getDriveThumbnail } from '../../utils/driveUtils';
import '../../pages/web-admin/webAdmin.css';

export interface MemberRecord {
  line_user_id: string;
  name: string;
  avatar_url?: string | null;
  student_id?: string;
  department?: string;
  identity_status?: string;
  gender?: string;
  nationality?: string;
  birthday?: string;
  id_card?: string;
  phone?: string;
  email?: string;
  address?: string;
  line_id?: string;
  preferred_language?: string;
  emergency_contact_name?: string;
  emergency_contact_rel?: string;
  emergency_contact_phone?: string;
  emergency_contact_address?: string;
  outdoor_experience?: string;
  fitness_desc?: string;
  proof_urls?: string[] | null;
  medical_history?: string;
  is_official_member?: boolean;
  membership_expires_at?: string;
  payment_status?: string;
  is_officer?: boolean;
  officer_role?: string | null;
  want_to_say?: string | null;
  created_at?: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: '真實姓名',
  gender: '性別',
  nationality: '國籍 (Nationality)',
  birthday: '出生年月日',
  id_card: '證件號碼 (身分證/居留證)',
  phone: '聯絡電話',
  email: '電子信箱',
  address: '居住通訊地址',
  line_id: 'LINE ID',
  identity_status: '身分狀態',
  department: '就讀系所',
  student_id: '學號',
  emergency_contact_name: '緊急聯絡人姓名',
  emergency_contact_rel: '緊急聯絡人關係',
  emergency_contact_phone: '緊急聯絡人電話',
  emergency_contact_address: '緊急聯絡人地址',
  outdoor_experience: '登山經歷',
  fitness_desc: '體能自述',
  medical_history: '特殊病史/備註',
  want_to_say: '想說的話',
  is_official_member: '正式社員資格',
  membership_expires_at: '社籍到期日',
  is_officer: '是否為幹部',
  officer_role: '幹部職責稱號',
};

export interface DiffItem {
  key: string;
  label: string;
  oldVal: any;
  newVal: any;
}

export interface MemberEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  officerUserId: string;
  jwt: string;
  initialMember?: any | null;
  onSaved?: (updatedMember: MemberRecord) => void;
  isStacked?: boolean;
}

// getDriveThumbnail 已移至 src/utils/driveUtils.ts，此處透過 import 引用

export const MemberEditDrawer: React.FC<MemberEditDrawerProps> = ({
  isOpen,
  onClose,
  userId,
  officerUserId,
  jwt,
  initialMember,
  onSaved,
  isStacked = false,
}) => {
  const [showTimeline, setShowTimeline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 表單資料與初始快照 (用於計算 Diff)
  const [formData, setFormData] = useState<MemberRecord | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<MemberRecord | null>(null);

  // 側邊大圖檢視狀態
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Diff 彈窗狀態
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffList, setDiffList] = useState<DiffItem[]>([]);

  // 個人歷史紀錄狀態
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRecords, setTimelineRecords] = useState<MemberTimelineRecord[]>([]);
  const [timelineMemberInfo, setTimelineMemberInfo] = useState<MemberTimelineResult['member']>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const backdropRef = React.useRef<HTMLDivElement>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(jwt);
  }, [jwt]);

  const targetUserId = userId || initialMember?.line_user_id || initialMember?.userId || '';

  // 載入社員資料
  useEffect(() => {
    if (!isOpen || !targetUserId) {
      setFormData(null);
      setInitialSnapshot(null);
      setPreviewPhotoUrl(null);
      setShowTimeline(false);
      setDiffModalOpen(false);
      setDiffList([]);
      setErrorMsg(null);
      setSuccessMsg(null);
      return;
    }

    if (initialMember && (initialMember.line_user_id === targetUserId || initialMember.name)) {
      setFormData({ ...initialMember });
      setInitialSnapshot({ ...initialMember });
      return;
    }

    const fetchMember = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const { data, error } = await client
          .from('members')
          .select('*')
          .eq('line_user_id', targetUserId)
          .single();

        if (error) {
          throw new Error(`[讀取社員資料失敗]: ${error.message} (代碼: ${error.code})`);
        }

        setFormData(data as MemberRecord);
        setInitialSnapshot(data as MemberRecord);
      } catch (err: any) {
        console.error('[MemberEditDrawer] fetchMember error:', err);
        setErrorMsg(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [isOpen, targetUserId, initialMember, client]);

  // 載入社員個人歷史全紀錄
  const loadMemberTimeline = async (tUserId: string, isManualRefresh = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    setTimelineLoading(true);
    try {
      const res = await fetchMemberTimelineRecordsFromSupabase(tUserId, officerUserId);
      if (res) {
        if (res.records) setTimelineRecords(res.records);
        if (res.member) setTimelineMemberInfo(res.member);
      }
    } catch (err: any) {
      console.warn('[MemberEditDrawer] timeline load warning:', err);
    } finally {
      setTimelineLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen && showTimeline && targetUserId) {
      loadMemberTimeline(targetUserId);
    }
  }, [isOpen, showTimeline, targetUserId]);

  // 篩選與排序後的個人歷史紀錄
  const filteredTimelineRecords = useMemo(() => {
    let list = [...timelineRecords];

    if (categoryFilter !== 'all') {
      list = list.filter((r) => r.category === categoryFilter);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'confirmed') {
        list = list.filter((r) => r.status?.includes('已核銷') || r.status?.includes('已歸還') || r.status?.includes('已繳費') || r.paymentStatus?.includes('已繳費'));
      } else if (statusFilter === 'pending') {
        list = list.filter((r) => r.status?.includes('待確認') || r.status?.includes('待領取') || r.paymentStatus?.includes('待確認'));
      } else if (statusFilter === 'accepted') {
        list = list.filter((r) => r.status?.includes('正取') || r.status?.includes('租借中'));
      } else if (statusFilter === 'waitlist') {
        list = list.filter((r) => r.status?.includes('候補') || r.status?.includes('備取'));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const titleMatch = (r.title || '').toLowerCase().includes(q);
        const statusMatch = (r.status || '').toLowerCase().includes(q);
        const payMatch = (r.paymentStatus || '').toLowerCase().includes(q);
        const notesMatch = (r.notes || '').toLowerCase().includes(q);
        const officerNotesMatch = (r.officerNotes || '').toLowerCase().includes(q);
        const dateMatch = (r.dateDisplay || '').toLowerCase().includes(q);
        const amountMatch = r.amount !== undefined ? String(r.amount).includes(q) : false;
        const detailsStr = JSON.stringify(r.details || {}).toLowerCase();
        const detailsMatch = detailsStr.includes(q);
        return titleMatch || statusMatch || payMatch || notesMatch || officerNotesMatch || dateMatch || amountMatch || detailsMatch;
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'timestamp') {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        cmp = timeA - timeB;
      } else if (sortBy === 'category') {
        cmp = a.category.localeCompare(b.category);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return list;
  }, [timelineRecords, categoryFilter, statusFilter, searchQuery, sortBy, sortOrder]);

  const toggleRecordExpand = (recordId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  // 當左側大圖或歷史履歷展開時，若超出寬度自動平滑捲動至最左側以呈現新面板
  useEffect(() => {
    if (!isOpen || !backdropRef.current) return;
    const el = backdropRef.current;
    if (previewPhotoUrl || showTimeline) {
      const timer = setTimeout(() => {
        if (el && el.scrollWidth > el.clientWidth) {
          el.scrollTo({ left: 0, behavior: 'smooth' });
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [showTimeline, previewPhotoUrl, isOpen]);

  // 比對 Diff 並準備彈窗。若無差異，直接關閉抽屜
  const handleTriggerDiffCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData || !initialSnapshot) return;

    const diffs: DiffItem[] = [];
    Object.keys(FIELD_LABELS).forEach((key) => {
      const oldV = (initialSnapshot as any)[key] ?? '';
      const newV = (formData as any)[key] ?? '';

      // 標準化比較 (處理 boolean 與 string)
      if (oldV !== newV) {
        diffs.push({
          key,
          label: FIELD_LABELS[key] || key,
          oldVal: oldV,
          newVal: newV,
        });
      }
    });

    if (diffs.length === 0) {
      onClose();
      return;
    }

    setDiffList(diffs);
    setDiffModalOpen(true);
  };

  // 確認 Diff 並寫入 Supabase
  const handleConfirmSaveToSupabase = async () => {
    if (!formData || !targetUserId) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      const updatePayload: Record<string, any> = {};
      diffList.forEach((d) => {
        updatePayload[d.key] = (formData as any)[d.key];
      });

      const { error } = await client
        .from('members')
        .update(updatePayload)
        .eq('line_user_id', targetUserId);

      if (error) {
        throw new Error(`[更新社員資料失敗]: ${error.message} (代碼: ${error.code})`);
      }

      await logWebAuditAction(
        client,
        officerUserId,
        'UPDATE_MEMBER_PROFILE',
        'members',
        targetUserId,
        {
          memberName: formData.name,
          changedFields: diffList.map((d) => ({
            field: d.key,
            old: d.oldVal,
            new: d.newVal,
          })),
        }
      );

      const updated = { ...formData };
      setInitialSnapshot(updated);
      setDiffModalOpen(false);
      onSaved?.(updated);
      onClose();
    } catch (err: any) {
      console.error('[MemberEditDrawer] handleConfirmSaveToSupabase error:', err);
      setErrorMsg(err.message || String(err));
      setDiffModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={backdropRef}
        className={`wa-drawer-backdrop ${isStacked ? 'wa-drawer-backdrop-stacked' : ''}`}
        onClick={() => {
          onClose();
          setPreviewPhotoUrl(null);
          setShowTimeline(false);
        }}
      >
        {/* 最左側照片放大檢視同級面板 (亮色藝廊風格) */}
        {previewPhotoUrl && (
          <div className="wa-drawer-side-preview" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-side-preview-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', fontWeight: 600 }}>
                <ImageIcon size={16} color="var(--wa-primary)" />
                <span>體能測驗證明照片預覽</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <a
                  href={previewPhotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--wa-text-muted)', display: 'flex', alignItems: 'center' }}
                  title="另開新視窗查看原圖"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPhotoUrl(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--wa-text-muted)', cursor: 'pointer', padding: 2 }}
                  title="關閉照片預覽"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="wa-drawer-side-preview-body">
              <img
                src={previewPhotoUrl}
                alt="證明照片大圖"
                className="wa-drawer-side-preview-img"
              />
            </div>
          </div>
        )}

        {/* 中間欄：個人歷史紀錄同級展開面板 */}
        {showTimeline && (
          <div className="wa-drawer-side-timeline" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-side-timeline-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="var(--wa-primary)" />
                <span>個人歷史紀錄</span>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => setShowTimeline(false)}
                title="關閉個人歷史紀錄"
              >
                <X size={18} />
              </button>
            </div>
            <div className="wa-drawer-side-timeline-body">
              {/* 頂部個人資訊摘要 */}
              <div style={{
                backgroundColor: 'var(--wa-surface-alt)',
                border: '1px solid var(--wa-border)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="wa-record-avatar" style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--wa-text-muted)'
                  }}>
                    <User size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--wa-text)' }}>
                      {timelineMemberInfo?.name || formData?.name || '社員'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--wa-text-muted)' }}>
                      {timelineMemberInfo?.student_id || formData?.student_id || '未設定學號'} · {timelineMemberInfo?.department || formData?.department || '未設定系級'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="web-admin-badge web-admin-badge-neutral" style={{ fontSize: '0.72rem' }}>
                    {timelineMemberInfo?.role || formData?.identity_status || '社員'}
                  </span>
                  {formData?.membership_expires_at && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--wa-text-muted)' }}>
                      有效至 {formData.membership_expires_at}
                    </span>
                  )}
                </div>
              </div>

              {/* 搜尋、篩選與排序工具列 */}
              <div style={{ flexShrink: 0 }}>
                <NotionFilterBar
                  popoverMode={true}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder="搜尋紀錄項目..."
                  filters={[
                    {
                      key: 'category',
                      label: '類別',
                      selected: categoryFilter,
                      options: [
                        { value: 'all', label: '全部類別' },
                        { value: 'activity', label: '活動出隊' },
                        { value: 'equipment', label: '裝備借用' },
                        { value: 'payment', label: '繳費紀錄' },
                      ],
                      onChange: setCategoryFilter,
                    },
                    {
                      key: 'status',
                      label: '狀態',
                      selected: statusFilter,
                      options: [
                        { value: 'all', label: '全部狀態' },
                        { value: 'confirmed', label: '已完成 / 已核銷' },
                        { value: 'pending', label: '待確認 / 待領取' },
                        { value: 'accepted', label: '正取 / 租借中' },
                        { value: 'waitlist', label: '候補 / 備取' },
                      ],
                      onChange: setStatusFilter,
                    },
                  ]}
                  sortOptions={[
                    { key: 'timestamp', label: '依時間戳記' },
                    { key: 'category', label: '依紀錄類別' },
                  ]}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSortChange={(key, order) => {
                    setSortBy(key);
                    setSortOrder(order);
                  }}
                  onRefresh={() => targetUserId && loadMemberTimeline(targetUserId, true)}
                  isRefreshing={isRefreshing}
                />
              </div>

              {timelineLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  <Loader2 size={24} className="animate-spin" />
                  <div style={{ marginTop: 8 }}>正在載入個人歷史紀錄...</div>
                </div>
              ) : filteredTimelineRecords.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--wa-text-muted)', backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid var(--wa-border)' }}>
                  <FileText size={32} color="#cbd5e1" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>尚無符合條件的歷史紀錄</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredTimelineRecords.map((item) => {
                    const isExpanded = expandedIds.has(item.id);
                    const isEvent = item.category === 'activity';
                    const isLoan = item.category === 'equipment';

                    return (
                      <div
                        key={item.id}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--wa-border)',
                          borderRadius: 10,
                          padding: 12,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                        }}
                        onClick={() => toggleRecordExpand(item.id)}
                      >
                        {/* 收合狀態常駐標題列 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.86rem' }}>
                            {isEvent ? (
                              <Calendar size={14} color="#059669" />
                            ) : isLoan ? (
                              <Package size={14} color="#2563eb" />
                            ) : (
                              <CreditCard size={14} color="#d97706" />
                            )}
                            <span style={{ color: 'var(--wa-text)' }}>{item.title}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="web-admin-badge web-admin-badge-neutral" style={{ fontSize: '0.72rem' }}>
                              {item.status || '已完成'}
                            </span>
                            {isExpanded ? <ChevronUp size={14} color="var(--wa-text-muted)" /> : <ChevronDown size={14} color="var(--wa-text-muted)" />}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.74rem', color: 'var(--wa-text-muted)' }}>
                          <span>時間戳記：{item.dateDisplay || item.timestamp?.split('T')[0] || '-'}</span>
                          {item.amount !== undefined && item.amount !== null && Number(item.amount) > 0 && (
                            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--wa-text)' }}>
                              ${Number(item.amount).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {/* 點擊向下展開之詳細內容 */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 10,
                              paddingTop: 10,
                              borderTop: '1px dashed var(--wa-border)',
                              fontSize: '0.78rem',
                              color: '#334155',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              textAlign: 'left',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.paymentStatus && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--wa-text-muted)' }}>繳費狀態：</span>
                                <span style={{ fontWeight: 600 }}>{item.paymentStatus}</span>
                              </div>
                            )}
                            {item.details && Object.keys(item.details).length > 0 && (
                              <div style={{ backgroundColor: 'var(--wa-surface-alt)', padding: '6px 10px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {item.details.loanId && <div>借用單號：<span style={{ fontFamily: 'monospace' }}>{item.details.loanId}</span></div>}
                                {item.details.paymentId && <div>繳費單號：<span style={{ fontFamily: 'monospace' }}>{item.details.paymentId}</span></div>}
                                {item.details.bankLast5 && <div>帳號末五碼：<span style={{ fontFamily: 'monospace' }}>{item.details.bankLast5}</span></div>}
                                {item.details.items && Array.isArray(item.details.items) && (
                                  <div>品項：{item.details.items.map((i: any) => `${i.equipmentName} x ${i.quantity}`).join(', ')}</div>
                                )}
                                {item.details.proofImageUrl && (
                                  <div style={{ marginTop: 4 }}>
                                    <span style={{ color: 'var(--wa-text-muted)' }}>繳費憑證：</span>
                                    <img
                                      src={item.details.proofImageUrl}
                                      alt="單據"
                                      style={{ width: 60, height: 45, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid var(--wa-border)', verticalAlign: 'middle', marginLeft: 6 }}
                                      onClick={() => setPreviewPhotoUrl(item.details.proofImageUrl)}
                                      title="點擊放大預覽"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                            {item.notes && (
                              <div style={{ backgroundColor: '#f1f5f9', padding: '6px 10px', borderRadius: 6 }}>
                                <span style={{ color: 'var(--wa-text-muted)' }}>申請備註：</span>{item.notes}
                              </div>
                            )}
                            {item.officerNotes && (
                              <div style={{ backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: 6, color: '#92400e' }}>
                                <span style={{ fontWeight: 600 }}>幹部備註：</span>{item.officerNotes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 右側滑出抽屜主面板 (個資編輯表單) */}
        <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="wa-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 className="wa-drawer-title">
                {formData ? `${formData.name} - 詳細資料` : '載入社員資料中...'}
              </h2>
              {/* 個人歷史紀錄展開切換鈕 */}
              <button
                type="button"
                style={{
                  border: showTimeline ? '1px solid var(--wa-primary)' : '1px solid var(--wa-border)',
                  background: showTimeline ? '#eff6ff' : '#f8fafc',
                  color: showTimeline ? 'var(--wa-primary)' : 'var(--wa-text-muted)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  padding: '5px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setShowTimeline(!showTimeline)}
                title={showTimeline ? '收合左側個人歷史紀錄' : '從左側滑出同級個人歷史紀錄'}
              >
                <Clock size={14} />
                <span>個人歷史紀錄</span>
                {timelineRecords.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: showTimeline ? 'var(--wa-primary)' : '#e2e8f0',
                      color: showTimeline ? '#ffffff' : '#475569',
                    }}
                  >
                    {timelineRecords.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              className="wa-drawer-close-btn"
              onClick={() => {
                onClose();
                setPreviewPhotoUrl(null);
                setShowTimeline(false);
              }}
              title="關閉"
            >
              <X size={20} />
            </button>
          </div>

          {errorMsg && (
            <div className="web-admin-error-banner" style={{ margin: '12px 20px 0' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="web-admin-success-banner" style={{ margin: '12px 20px 0' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: 8, color: 'var(--wa-text-muted)' }}>
              <Loader2 className="animate-spin" size={24} />
              <span>讀取社員完整個資中...</span>
            </div>
          ) : !formData ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--wa-text-muted)' }}>
              查無此社員資料
            </div>
          ) : (
            <form onSubmit={handleTriggerDiffCheck} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 65px)', textAlign: 'left' }}>
              <div className="wa-drawer-body">
                {/* 基本個資 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">基本個資</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">真實姓名 *</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">性別</label>
                      <select
                        className="wa-form-select"
                        value={formData.gender || ''}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      >
                        <option value="">請選擇</option>
                        <option value="男">男</option>
                        <option value="女">女</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">國籍</label>
                      <select
                        className="wa-form-select"
                        value={getNationalityLabel(formData.nationality, 'zh')}
                        onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      >
                        {NATIONALITY_LIST.map((item) => (
                          <option key={item.zh} value={item.zh}>
                            {item.zh} ({item.en})
                          </option>
                        ))}
                        <option value="其他">其他 (自行輸入)</option>
                      </select>
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">身分證 / 居留證號碼</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.id_card || ''}
                        onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">出生年月日</label>
                      <input
                        type="date"
                        className="wa-form-input"
                        value={formData.birthday || ''}
                        onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* 聯絡資訊 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">通訊聯絡</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">聯絡電話</label>
                      <input
                        type="tel"
                        className="wa-form-input"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">LINE ID</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.line_id || ''}
                        onChange={(e) => setFormData({ ...formData, line_id: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">電子信箱</label>
                    <input
                      type="email"
                      className="wa-form-input"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">通訊地址</label>
                    <input
                      type="text"
                      className="wa-form-input"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                </div>

                {/* 學籍與社籍權限 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">學籍與幹部身分</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">身分狀態</label>
                      <select
                        className="wa-form-select"
                        value={
                          formData.identity_status === '臺科大在校學生'
                            ? '臺科在校生'
                            : formData.identity_status || '臺科在校生'
                        }
                        onChange={(e) => setFormData({ ...formData, identity_status: e.target.value })}
                      >
                        <option value="臺科在校生">臺科在校生</option>
                        <option value="畢業校友">畢業校友</option>
                        <option value="校外人士">校外人士</option>
                      </select>
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">就讀系所</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.department || ''}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        placeholder="例如 資工系"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">學號</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.student_id || ''}
                        onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                        placeholder="例如 B11015000"
                      />
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">社籍到期日</label>
                      <input
                        type="date"
                        className="wa-form-input"
                        value={formData.membership_expires_at ? formData.membership_expires_at.split('T')[0] : ''}
                        onChange={(e) => setFormData({ ...formData, membership_expires_at: e.target.value })}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        className="wa-checkbox"
                        checked={Boolean(formData.is_official_member)}
                        onChange={(e) => setFormData({ ...formData, is_official_member: e.target.checked })}
                      />
                      <span style={{ fontWeight: 600 }}>正式社員資格</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input
                        type="checkbox"
                        className="wa-checkbox"
                        checked={Boolean(formData.is_officer)}
                        onChange={(e) => setFormData({ ...formData, is_officer: e.target.checked })}
                      />
                      <span style={{ fontWeight: 600 }}>幹部資格</span>
                    </label>
                  </div>

                  {formData.is_officer && (
                    <div className="wa-form-group" style={{ marginTop: 12 }}>
                      <label className="wa-form-label">幹部職務 / 稱號</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.officer_role || ''}
                        onChange={(e) => setFormData({ ...formData, officer_role: e.target.value })}
                        placeholder="例如 社長、副社長、裝備股長、財務股長..."
                      />
                    </div>
                  )}
                </div>

                {/* 緊急聯絡人 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">緊急聯絡人</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">聯絡人姓名</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.emergency_contact_name || ''}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                      />
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">關係</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.emergency_contact_rel || ''}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_rel: e.target.value })}
                        placeholder="例如 父親、母親、配偶..."
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="wa-form-group">
                      <label className="wa-form-label">緊急聯絡電話</label>
                      <input
                        type="tel"
                        className="wa-form-input"
                        value={formData.emergency_contact_phone || ''}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                      />
                    </div>

                    <div className="wa-form-group">
                      <label className="wa-form-label">緊急聯絡地址</label>
                      <input
                        type="text"
                        className="wa-form-input"
                        value={formData.emergency_contact_address || ''}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_address: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* 登山經歷與健康 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">登山經歷與健康備註</div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">爬山經歷</label>
                    <textarea
                      className="wa-form-textarea"
                      rows={3}
                      value={formData.outdoor_experience || ''}
                      onChange={(e) => setFormData({ ...formData, outdoor_experience: e.target.value })}
                    />
                  </div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">體能自述</label>
                    <textarea
                      className="wa-form-textarea"
                      rows={2}
                      value={formData.fitness_desc || ''}
                      onChange={(e) => setFormData({ ...formData, fitness_desc: e.target.value })}
                    />
                  </div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">特殊病史 / 藥物過敏 / 備註</label>
                    <textarea
                      className="wa-form-textarea"
                      rows={3}
                      value={formData.medical_history || ''}
                      onChange={(e) => setFormData({ ...formData, medical_history: e.target.value })}
                    />
                  </div>
                </div>

                {/* 體能測驗證明與社員留言 */}
                <div className="wa-form-section">
                  <div className="wa-form-section-title">體能測驗證明與社員留言</div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">想說的話 (I want to say...)</label>
                    <textarea
                      className="wa-form-textarea"
                      rows={3}
                      value={formData.want_to_say || ''}
                      onChange={(e) => setFormData({ ...formData, want_to_say: e.target.value })}
                      placeholder="非必填留言..."
                    />
                  </div>

                  <div className="wa-form-group">
                    <label className="wa-form-label">
                      體能測驗證明照片 {Array.isArray(formData.proof_urls) && formData.proof_urls.length > 0 ? `(${formData.proof_urls.length} 張，點擊縮圖於左側放大預覽)` : ''}
                    </label>
                    {Array.isArray(formData.proof_urls) && formData.proof_urls.length > 0 ? (
                      <div className="wa-proof-grid">
                        {formData.proof_urls.map((url: string, pIdx: number) => {
                          const thumbUrl = getDriveThumbnail(url);
                          return (
                            <div
                              key={pIdx}
                              style={{
                                position: 'relative',
                                width: 90,
                                height: 90,
                                borderRadius: 8,
                                overflow: 'hidden',
                                border: '1px solid var(--wa-border)',
                                cursor: 'pointer',
                                backgroundColor: '#f1f5f9',
                              }}
                              onClick={() => setPreviewPhotoUrl(previewPhotoUrl === url ? null : url)}
                              title="點擊在左側放大預覽照片"
                            >
                              <img
                                src={thumbUrl}
                                alt={`證明照 ${pIdx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  // 縮圖失敗時退回原始 URL
                                  (e.currentTarget as HTMLImageElement).src = url;
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                        尚未上傳體能測驗證明相片
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 抽屜底部儲存列 */}
              <div className="wa-drawer-footer">
                <button
                  type="button"
                  className="web-admin-btn web-admin-btn-secondary"
                  onClick={() => {
                    onClose();
                    setPreviewPhotoUrl(null);
                    setShowTimeline(false);
                  }}
                  disabled={saving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="web-admin-btn"
                  disabled={saving}
                >
                  <Save size={15} />
                  <span>儲存變更</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Diff 對照確認彈窗 */}
      {diffModalOpen && formData && (
        <div className="wa-diff-modal-backdrop" onClick={() => setDiffModalOpen(false)}>
          <div className="wa-diff-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--wa-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, textAlign: 'left' }}>
                  確認社員資料修改 - [{formData.name}]
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', marginTop: 4 }}>
                  請核對以下異動欄位之新舊數值，確認無誤後寫入 Supabase
                </div>
              </div>
              <button
                type="button"
                className="wa-drawer-close-btn"
                onClick={() => setDiffModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 24px', maxHeight: '50vh', overflowY: 'auto' }}>
              <table className="wa-diff-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>異動欄位</th>
                    <th style={{ width: '36%' }}>修改前 (Original)</th>
                    <th style={{ width: '36%' }}>修改後 (Updated)</th>
                  </tr>
                </thead>
                <tbody>
                  {diffList.map((d) => (
                    <tr key={d.key}>
                      <td style={{ fontWeight: 600 }}>{d.label}</td>
                      <td className="wa-diff-old">
                        {typeof d.oldVal === 'boolean' ? (d.oldVal ? '是' : '否') : String(d.oldVal || '(空)')}
                      </td>
                      <td className="wa-diff-new">
                        {typeof d.newVal === 'boolean' ? (d.newVal ? '是' : '否') : String(d.newVal || '(空)')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--wa-border)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc' }}>
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={() => setDiffModalOpen(false)}
                disabled={saving}
              >
                返回編輯
              </button>
              <button
                type="button"
                className="web-admin-btn"
                onClick={handleConfirmSaveToSupabase}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>寫入中...</span>
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    <span>確認送出並儲存</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

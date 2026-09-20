import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Package,
  CreditCard,
  AlertCircle,
  FileText,
  Clock,
  User,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import {
  fetchMemberTimelineRecordsFromSupabase,
  type MemberTimelineResult
} from '../utils/supabaseClient';
import type { MemberTimelineRecord, MemberTimelineCategory } from '../types/admin';
import { safeNavigateBack } from '../utils/navigationUtils';

const SORT_OPTIONS: SortOption[] = [
  { key: 'timestamp', label: '依紀錄時間（預設上新下舊）' },
  { key: 'category', label: '依紀錄類別' }
];

interface MemberRecordsProps {
  officerUserId?: string;
}

export default function MemberRecords({ officerUserId }: MemberRecordsProps) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [records, setRecords] = useState<MemberTimelineRecord[]>([]);
  const [memberInfo, setMemberInfo] = useState<MemberTimelineResult['member']>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // 搜尋、篩選與排序狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 展開詳細內容之卡片 ID 集合
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadData = async (isManualRefresh = false) => {
    if (!userId) return;
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const res = await fetchMemberTimelineRecordsFromSupabase(userId, officerUserId);
      setMemberInfo(res.member);
      setRecords(res.records || []);
      if (isManualRefresh) {
        setSuccessMessage('已同步最新資料！');
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId, officerUserId]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 篩選群組定義
  const filters: FilterGroup[] = useMemo(() => [
    {
      key: 'category',
      label: '紀錄類別',
      selected: categoryFilter,
      onChange: setCategoryFilter,
      options: [
        { value: 'all', label: '全部類別' },
        { value: 'activity', label: '活動紀錄' },
        { value: 'equipment', label: '裝備借用' },
        { value: 'payment', label: '繳費紀錄' }
      ]
    },
    {
      key: 'status',
      label: '處理狀態',
      selected: statusFilter,
      onChange: setStatusFilter,
      options: [
        { value: 'all', label: '全部狀態' },
        { value: 'pending', label: '進行中 / 待處理' },
        { value: 'completed', label: '已完成 / 已核銷' }
      ]
    }
  ], [categoryFilter, statusFilter]);

  // 過濾與排序後之紀錄
  const filteredRecords = useMemo(() => {
    let list = [...records];

    // 1. 類別過濾
    if (categoryFilter !== 'all') {
      list = list.filter(r => r.category === categoryFilter);
    }

    // 2. 狀態過濾
    if (statusFilter === 'pending') {
      list = list.filter(r => {
        const s = (r.status || '') + (r.paymentStatus || '');
        return s.includes('待') || s.includes('正取') || s.includes('租借中') || s.includes('未繳費');
      });
    } else if (statusFilter === 'completed') {
      list = list.filter(r => {
        const s = (r.status || '') + (r.paymentStatus || '');
        return s.includes('已核銷') || s.includes('已歸還') || s.includes('已繳費') || s.includes('已結束');
      });
    }

    // 3. 關鍵字搜尋
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
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

    // 4. 排序
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
  }, [records, categoryFilter, statusFilter, searchQuery, sortBy, sortOrder]);

  // 類別徽章渲染
  const renderCategoryBadge = (cat: MemberTimelineCategory) => {
    switch (cat) {
      case 'activity':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0'
          }}>
            <Calendar size={12} color="#059669" />
            活動紀錄
          </span>
        );
      case 'equipment':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            border: '1px solid #bfdbfe'
          }}>
            <Package size={12} color="#2563eb" />
            裝備借用
          </span>
        );
      case 'payment':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            backgroundColor: '#fffbeb',
            color: '#92400e',
            border: '1px solid #fde68a'
          }}>
            <CreditCard size={12} color="#d97706" />
            繳費紀錄
          </span>
        );
    }
  };

  // 狀態徽章樣式判定
  const getStatusBadgeStyle = (status: string) => {
    if (status.includes('已核銷') || status.includes('已歸還') || status.includes('已繳費')) {
      return { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' };
    }
    if (status.includes('待確認') || status.includes('待領取') || status.includes('候補')) {
      return { bg: '#fffbeb', border: '#fde68a', text: '#b45309' };
    }
    if (status.includes('正取') || status.includes('租借中')) {
      return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
    }
    if (status.includes('取消') || status.includes('退件') || status.includes('未錄取')) {
      return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' };
    }
    return { bg: '#f1f5f9', border: '#e2e8f0', text: '#475569' };
  };

  return (
    <div style={{
      maxWidth: '840px',
      margin: '0 auto',
      padding: '16px',
      textAlign: 'left',
      boxSizing: 'border-box'
    }}>
      {/* 頂部導航與返回列 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <button
          type="button"
          onClick={() => safeNavigateBack(navigate, `/admin/members/${userId}`)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.borderColor = '#94a3b8';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }}
        >
          <ArrowLeft size={16} />
          <span>返回上一頁</span>
        </button>
      </div>

      {/* 社員基本資訊看板 */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '14px 16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            {memberInfo?.avatar_url ? (
              <img
                src={memberInfo.avatar_url}
                alt={memberInfo.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <User size={24} color="#64748b" />
            )}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              {memberInfo?.name || '未知社員'}
              <span style={{
                marginLeft: '8px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#2563eb',
                backgroundColor: '#eff6ff',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid #bfdbfe'
              }}>
                {memberInfo?.role || '一般社員'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {memberInfo?.department || '未填寫系所'} {memberInfo?.student_id ? `(${memberInfo.student_id})` : ''}
              {memberInfo?.phone ? ` | ${memberInfo.phone}` : ''}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#475569',
          backgroundColor: '#f8fafc',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid #f1f5f9'
        }}>
          <span>歷史總計：<strong>{records.length}</strong> 筆紀錄</span>
        </div>
      </div>

      {/* 頂部搜尋、篩選、排序與重新整理列 (NotionFilterBar) */}
      <NotionFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="搜尋活動、裝備、繳費、備註或金額..."
        filters={filters}
        sortOptions={SORT_OPTIONS}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(newSortBy, newOrder) => {
          setSortBy(newSortBy);
          setSortOrder(newOrder);
        }}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
      />

      {/* 成功訊息 Toast */}
      {successMessage && (
        <div style={{
          backgroundColor: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#065f46',
          fontSize: '13px',
          fontWeight: 600,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
        }}>
          <CheckCircle2 size={16} color="#059669" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 錯誤訊息輸出 */}
      {errorMessage && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#b91c1c',
          fontSize: '13px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 載入中狀態 */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 16px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          color: '#64748b',
          fontSize: '14px'
        }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <div>載入歷史全紀錄中，請稍候...</div>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 16px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}>
          <FileText size={36} color="#cbd5e1" style={{ margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
            查無符合條件的歷史紀錄
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
              ? '請嘗試清除關鍵字或變更篩選選項'
              : '該社員目前尚無任何活動報名、裝備借用或繳費申報紀錄'}
          </div>
        </div>
      ) : (
        /* 混和全紀錄卡片時間軸 */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredRecords.map((r) => {
            const isExpanded = expandedIds.has(r.id);
            const statusStyle = getStatusBadgeStyle(r.status);
            const payStyle = r.paymentStatus ? getStatusBadgeStyle(r.paymentStatus) : null;

            return (
              <div
                key={r.id}
                onClick={() => toggleExpand(r.id)}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {/* 卡片標頭列 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  flexWrap: 'wrap',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {renderCategoryBadge(r.category)}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text,
                      border: `1px solid ${statusStyle.border}`
                    }}>
                      {r.status}
                    </span>

                    {r.paymentStatus && r.paymentStatus !== r.status && payStyle && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: payStyle.bg,
                        color: payStyle.text,
                        border: `1px solid ${payStyle.border}`
                      }}>
                        {r.paymentStatus}
                      </span>
                    )}
                  </div>

                  <div style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Clock size={12} color="#94a3b8" />
                    <span>{r.dateDisplay}</span>
                  </div>
                </div>

                {/* 卡片主要內容 */}
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                    {r.title}
                  </div>

                  {/* 金額顯示 */}
                  {r.amount !== undefined && r.amount > 0 && (
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#d97706', marginBottom: '4px' }}>
                      金額: NT$ {r.amount.toLocaleString()}
                    </div>
                  )}

                  {/* 備註預覽 */}
                  {r.notes && (
                    <div style={{ fontSize: '12px', color: '#475569', backgroundColor: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9', marginTop: '4px' }}>
                      <span style={{ fontWeight: 600, color: '#64748b' }}>社員備註:</span> {r.notes}
                    </div>
                  )}

                  {r.officerNotes && (
                    <div style={{ fontSize: '12px', color: '#047857', backgroundColor: '#ecfdf5', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1fae5', marginTop: '4px' }}>
                      <span style={{ fontWeight: 600, color: '#065f46' }}>幹部備註:</span> {r.officerNotes}
                    </div>
                  )}
                </div>

                {/* 展開之完整詳細資訊抽屜 */}
                {isExpanded && (
                  <div style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px dashed #e2e8f0',
                    fontSize: '12px',
                    color: '#334155'
                  }}>
                    {r.category === 'activity' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                        <div><strong>活動狀態:</strong> {r.details?.eventStatus || '進行中'}</div>
                        <div><strong>集合/活動地點:</strong> {r.details?.location || '無'}</div>
                        <div><strong>報名時間:</strong> {r.details?.signupDate || r.timestamp}</div>
                        <div><strong>報名狀態:</strong> {r.details?.signupStatus || r.status}</div>
                        <div><strong>活動費用:</strong> NT$ {r.amount || 0}</div>
                      </div>
                    )}

                    {r.category === 'equipment' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                          <div><strong>借用用途:</strong> {r.details?.purpose || '社團活動'}</div>
                          <div><strong>租借天數:</strong> {r.details?.days || 1} 天</div>
                          <div><strong>預計領取:</strong> {r.details?.pickupDate || '未定'}</div>
                          <div><strong>預計歸還:</strong> {r.details?.returnDate || '未定'}</div>
                          <div><strong>總押金:</strong> NT$ {r.details?.totalDeposit || 0}</div>
                          <div><strong>總租金:</strong> NT$ {r.details?.totalRent || 0}</div>
                        </div>

                        {/* 裝備細項清單 */}
                        {Array.isArray(r.details?.items) && r.details.items.length > 0 && (
                          <div style={{ marginTop: '6px', backgroundColor: '#f8fafc', padding: '8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', color: '#0f172a' }}>租借清單項目:</div>
                            {r.details.items.map((it: any, idx: number) => (
                              <div key={idx} style={{ fontSize: '11px', color: '#475569', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                <span>{it.equipmentName || '裝備'} x {it.quantity || 1}</span>
                                <span>小計 NT$ {it.subtotal || 0}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {r.category === 'payment' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                          <div><strong>款項類別:</strong> {r.details?.type || r.title}</div>
                          <div><strong>申報金額:</strong> NT$ {r.amount || 0}</div>
                          <div><strong>轉帳帳號後五碼:</strong> <code style={{ backgroundColor: '#f1f5f9', padding: '1px 4px', borderRadius: '4px' }}>{r.details?.bankLast5 || '無'}</code></div>
                          <div><strong>通知狀態:</strong> {r.details?.notificationStatus || '未通知'}</div>
                          <div><strong>申報時間:</strong> {r.details?.createdAt || r.dateDisplay}</div>
                        </div>

                        {/* 繳費證明截圖縮圖 */}
                        {r.details?.proofImageUrl && (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', color: '#0f172a' }}>繳費證明圖片:</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <a
                                href={r.details.proofImageUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '12px',
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontWeight: 600
                                }}
                              >
                                <ExternalLink size={14} />
                                <span>查看繳費憑證圖片</span>
                              </a>
                            </div>
                          </div>
                        )}
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
  );
}

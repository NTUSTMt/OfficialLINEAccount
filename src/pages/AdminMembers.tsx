import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { fetchAdminMembersFromSupabase } from '../utils/supabaseClient';
import type { AdminMemberListItem } from '../types/admin';
import { NotionFilterBar, type FilterGroup, type SortOption } from '../components/admin/NotionFilterBar';
import { AdminSubNav } from '../components/admin/AdminSubNav';
import { MemberProfileModal } from '../components/admin/MemberProfileModal';

const SORT_OPTIONS: SortOption[] = [
  { key: 'created_at', label: '依加入時間' },
  { key: 'name', label: '依真實姓名' },
  { key: 'student_id', label: '依學號代碼' }
];

export default function AdminMembers({ userId }: { userId?: string }) {
  const [members, setMembers] = useState<AdminMemberListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedMemberForProfile, setSelectedMemberForProfile] = useState<AdminMemberListItem | null>(null);

  // 搜尋、篩選與排序狀態
  const [searchQuery, setSearchQuery] = useState('');
  const [identityFilter, setIdentityFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [officialFilter, setOfficialFilter] = useState('all');
  const [officerIntentFilter, setOfficerIntentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const loadMembers = async (isManual = true) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchAdminMembersFromSupabase(userId);
      setMembers(data);
      if (isManual) {
        setSuccessMessage('已同步最新資料！');
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers(false);
  }, [userId]);

  // 篩選群組定義
  const filters: FilterGroup[] = useMemo(() => [
    {
      key: 'identity',
      label: '身分狀態',
      selected: identityFilter,
      onChange: setIdentityFilter,
      options: [
        { value: 'all', label: '全部身分' },
        { value: '臺科大在校學生', label: '臺科大在校學生' },
        { value: '畢業校友', label: '畢業校友' },
        { value: '校外人士', label: '校外人士' }
      ]
    },
    {
      key: 'payment',
      label: '社費繳納狀態',
      selected: payFilter,
      onChange: setPayFilter,
      options: [
        { value: 'all', label: '全部繳費狀態' },
        { value: '未繳費 Unpaid', label: '未繳費 Unpaid' },
        { value: '待確認 Checking', label: '待確認 Checking' },
        { value: '已繳費 Paid', label: '已繳費 Paid' }
      ]
    },
    {
      key: 'official',
      label: '正式社員資格',
      selected: officialFilter,
      onChange: setOfficialFilter,
      options: [
        { value: 'all', label: '全部社員' },
        { value: 'true', label: '正式社員' },
        { value: 'false', label: '非正式社員' }
      ]
    },
    {
      key: 'officerIntent',
      label: '幹部意願',
      selected: officerIntentFilter,
      onChange: setOfficerIntentFilter,
      options: [
        { value: 'all', label: '全部意願' },
        { value: 'yes', label: '有意願' },
        { value: 'no', label: '無意願' }
      ]
    }
  ], [identityFilter, payFilter, officialFilter, officerIntentFilter]);

  // 過濾與排序
  const filteredMembers = useMemo(() => {
    let list = [...members];

    // 關鍵字比對：姓名、Line ID、Line UID、Email、學號
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(m => {
        const n = (m.name || '').toLowerCase();
        const lid = (m.line_id || '').toLowerCase();
        const luid = (m.line_user_id || '').toLowerCase();
        const em = (m.email || '').toLowerCase();
        const sid = (m.student_id || '').toLowerCase();
        return n.includes(q) || lid.includes(q) || luid.includes(q) || em.includes(q) || sid.includes(q);
      });
    }

    // 身分篩選 (向下相容歷史舊資料標籤)
    if (identityFilter !== 'all') {
      list = list.filter(m => {
        const val = m.identity_status || '';
        if (identityFilter === '臺科大在校學生') {
          return val === '臺科大在校學生' || val === '本校生';
        }
        if (identityFilter === '畢業校友') {
          return val === '畢業校友' || val === '校友';
        }
        if (identityFilter === '校外人士') {
          return val === '校外人士' || val === '外校生' || val === '社會人士';
        }
        return val === identityFilter;
      });
    }

    // 社費狀態篩選
    if (payFilter !== 'all') {
      list = list.filter(m => m.payment_status === payFilter);
    }

    // 正式社員資格篩選
    if (officialFilter !== 'all') {
      const isOfficial = officialFilter === 'true';
      list = list.filter(m => Boolean(m.is_official_member) === isOfficial);
    }

    // 幹部意願篩選
    if (officerIntentFilter !== 'all') {
      const wantYes = officerIntentFilter === 'yes';
      list = list.filter(m => {
        const intent = (m.officer_intent || '').trim();
        const hasIntent = Boolean(intent && (intent.includes('意願') || intent === '我有意願成為社團幹部'));
        return hasIntent === wantYes;
      });
    }

    // 排序
    list.sort((a, b) => {
      let valA: any = a[sortBy as keyof AdminMemberListItem] || '';
      let valB: any = b[sortBy as keyof AdminMemberListItem] || '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [members, searchQuery, identityFilter, payFilter, officialFilter, officerIntentFilter, sortBy, sortOrder]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      paddingBottom: '40px',
      textAlign: 'left'
    }}>
      <AdminSubNav />

      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '16px 14px'
      }}>
        {/* 錯誤直接顯示 (依規範嚴禁遮蔽) */}
        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '13px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600 }}>載入失敗</div>
              <div style={{ marginTop: '2px', wordBreak: 'break-all' }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '12px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <CheckCircle2 size={16} color="#059669" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Notion 搜尋、篩選、排序與重新整理列 */}
        <NotionFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="搜尋姓名、LINE ID、學號、Email..."
          filters={filters}
          sortOptions={SORT_OPTIONS}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(k, o) => {
            setSortBy(k);
            setSortOrder(o);
          }}
          onRefresh={loadMembers}
          isRefreshing={loading}
        />

        {/* 列表載入中或空狀態 */}
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 0',
            color: '#64748b',
            fontSize: '14px'
          }}>
            <div className="loading-spinner" style={{ marginBottom: '12px' }} />
            <span>讀取社員名單中...</span>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '40px 20px',
            textAlign: 'center',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            fontSize: '14px'
          }}>
            查無符合條件的社員資料
          </div>
        ) : (
          /* 社員卡片清單 (下方以卡片方式呈現，點擊先彈窗預覽，點按鈕移至詳細狀態) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredMembers.map((m) => {
              const isOfficial = Boolean(m.is_official_member);
              const isOfficer = Boolean(m.is_officer);

              return (
                <div
                  key={m.line_user_id}
                  onClick={() => setSelectedMemberForProfile(m)}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 第一行：姓名、身分狀態標籤、幹部/社員標籤 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                        {m.name || '未填寫姓名'}
                      </span>
                      {m.identity_status && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          fontWeight: 500
                        }}>
                          {m.identity_status}
                        </span>
                      )}
                      {isOfficial && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          backgroundColor: '#ecfdf5',
                          color: '#059669',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <ShieldCheck size={12} />
                          <span>正式社員</span>
                        </span>
                      )}
                      {isOfficer && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          backgroundColor: '#eff6ff',
                          color: '#2563eb',
                          fontWeight: 600
                        }}>
                          {m.officer_role || '幹部'}
                        </span>
                      )}
                      {Boolean(m.officer_intent && (m.officer_intent.includes('意願') || m.officer_intent === '我有意願成為社團幹部')) && (
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          backgroundColor: '#f1f5f9',
                          color: '#475569',
                          fontWeight: 500
                        }}>
                          幹部意願
                        </span>
                      )}
                    </div>

                    {/* 第二行：系所、學號 */}
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '3px' }}>
                      {m.department || '未填寫系所'} {m.student_id ? `(${m.student_id})` : ''}
                    </div>

                    {/* 第三行：Line 名稱 / Line ID 與社費狀態 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '12px',
                      color: '#94a3b8'
                    }}>
                      <span>LINE: {m.line_id || m.line_user_id.substring(0, 10) + '...'}</span>
                      <span style={{
                        color: m.payment_status === '已繳費 Paid' ? '#059669' : (m.payment_status === '待確認 Checking' ? '#d97706' : '#94a3b8')
                      }}>
                        社費: {m.payment_status || '未繳費'}
                      </span>
                    </div>
                  </div>

                  <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0, marginLeft: '8px' }} />
                </div>
              );
            })}
          </div>
        )}

        {/* 社員個人資料彈窗 (點卡片展開，可撥打電話、複製 Line ID、查閱病史/想說的話，底部移至詳細狀態) */}
        <MemberProfileModal
          isOpen={Boolean(selectedMemberForProfile)}
          onClose={() => setSelectedMemberForProfile(null)}
          userId={selectedMemberForProfile?.line_user_id}
          officerUserId={userId}
          initialMember={selectedMemberForProfile}
        />
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Users,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Save,
  Phone,
  Mail,
  Award,
  Shield,
  ArrowRight
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface MemberRecord {
  line_user_id: string;
  name: string;
  student_id?: string;
  department?: string;
  identity_status?: string;
  gender?: string;
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
  medical_history?: string;
  is_official_member?: boolean;
  membership_expires_at?: string;
  payment_status?: string;
  is_officer?: boolean;
  officer_role?: string | null;
  created_at?: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: '真實姓名',
  gender: '性別',
  birthday: '出生年月日',
  id_card: '證件號碼 (身分證/居留證)',
  phone: '聯絡電話',
  email: '電子信箱',
  address: '居住通訊地址',
  line_id: '自訂 LINE ID',
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
  is_official_member: '正式社員資格',
  membership_expires_at: '社籍到期日',
  is_officer: '是否為幹部',
  officer_role: '幹部職責稱號',
};

interface DiffItem {
  key: string;
  label: string;
  oldVal: any;
  newVal: any;
}

export const WebAdminMembers: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 搜尋與篩選
  const [searchKeyword, setSearchKeyword] = useState('');
  const [identityFilter, setIdentityFilter] = useState('ALL');
  const [officialFilter, setOfficialFilter] = useState('ALL');

  // 右側側邊欄狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'timeline'>('profile');
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRecords, setTimelineRecords] = useState<any[]>([]);

  // 表單資料與初始快照 (用於計算 Diff)
  const [formData, setFormData] = useState<MemberRecord | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<MemberRecord | null>(null);

  // Diff 彈窗狀態
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [diffList, setDiffList] = useState<DiffItem[]>([]);
  const [saving, setSaving] = useState(false);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 1. 載入全社社員清單
  const loadMembers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await client
        .from('members')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`[讀取社員名冊失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setMembers((data || []) as MemberRecord[]);
    } catch (err: any) {
      console.error('[WebAdminMembers] loadMembers error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [client]);

  // 2. 開啟社員詳細側邊欄
  const handleOpenDrawer = (member: MemberRecord) => {
    setSelectedMember(member);
    setFormData({ ...member });
    setInitialSnapshot({ ...member });
    setActiveTab('profile');
    setDrawerOpen(true);
    setErrorMsg(null);
  };

  // 3. 載入社員個人歷史履歷時間軸
  const loadMemberTimeline = async (targetUserId: string) => {
    setTimelineLoading(true);
    try {
      const { data, error } = await client.rpc('get_admin_member_records_rpc', {
        p_officer_line_user_id: session.userId,
        p_target_user_id: targetUserId,
      });

      if (!error && data && Array.isArray(data.records)) {
        setTimelineRecords(data.records);
      } else {
        // 直查 event_signups 與 loans
        const [signupsRes, loansRes] = await Promise.all([
          client.from('event_signups').select('id, event_id, status, created_at, events(title)').eq('line_user_id', targetUserId),
          client.from('loans').select('id, start_date, end_date, status, total_rent').eq('line_user_id', targetUserId),
        ]);
        const combined = [
          ...(signupsRes.data || []).map((s: any) => ({
            type: 'event',
            title: `活動：${s.events?.title || s.event_id}`,
            status: s.status,
            date: s.created_at,
          })),
          ...(loansRes.data || []).map((l: any) => ({
            type: 'loan',
            title: `裝備借用 [${l.id}]`,
            status: l.status,
            date: l.start_date,
          })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTimelineRecords(combined);
      }
    } catch (err) {
      console.warn('[WebAdminMembers] timeline load warning:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'timeline' && selectedMember) {
      loadMemberTimeline(selectedMember.line_user_id);
    }
  }, [activeTab, selectedMember]);

  // 4. 比對 Diff 並準備彈窗
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
      setSuccessMsg('未偵測到任何欄位變更');
      setTimeout(() => setSuccessMsg(null), 2500);
      return;
    }

    setDiffList(diffs);
    setDiffModalOpen(true);
  };

  // 5. 確認 Diff 並寫入 Supabase
  const handleConfirmSaveToSupabase = async () => {
    if (!formData || !selectedMember) return;
    setSaving(true);
    setErrorMsg(null);

    try {
      // 組合更新 payload (只更新有定義在 FIELD_LABELS 的欄位)
      const updatePayload: Record<string, any> = {};
      diffList.forEach((d) => {
        updatePayload[d.key] = (formData as any)[d.key];
      });

      const { error } = await client
        .from('members')
        .update(updatePayload)
        .eq('line_user_id', selectedMember.line_user_id);

      if (error) {
        throw new Error(`[更新社員資料失敗]: ${error.message} (代碼: ${error.code})`);
      }

      await logWebAuditAction(
        client,
        session.userId,
        'UPDATE_MEMBER_PROFILE',
        'members',
        selectedMember.line_user_id,
        {
          memberName: formData.name,
          changedFields: diffList.map((d) => ({
            field: d.key,
            old: d.oldVal,
            new: d.newVal,
          })),
        }
      );

      setSuccessMsg(`社員「${formData.name}」個人資料已成功更新！`);
      setDiffModalOpen(false);
      setDrawerOpen(false);
      loadMembers();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('[WebAdminMembers] handleConfirmSaveToSupabase error:', err);
      setErrorMsg(err.message || String(err));
      setDiffModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // 6. 匯出社員名冊 CSV
  const handleExportCSV = () => {
    if (filteredMembers.length === 0) return;

    const headers = [
      '姓名',
      '學號',
      '系所',
      '身分狀態',
      '聯絡電話',
      '電子信箱',
      'LINE ID',
      '是否為正式社員',
      '社籍到期日',
      '幹部角色',
      '緊急聯絡人',
      '緊急聯絡電話',
    ];

    const rows = filteredMembers.map((m) => [
      m.name || '',
      m.student_id || '',
      m.department || '',
      m.identity_status || '',
      m.phone || '',
      m.email || '',
      m.line_id || '',
      m.is_official_member ? '是' : '否',
      m.membership_expires_at || '',
      m.officer_role || '',
      m.emergency_contact_name || '',
      m.emergency_contact_phone || '',
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ntust_hiking_members_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 7. 過濾社員清單
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchKeyword =
        !searchKeyword ||
        (m.name && m.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.student_id && m.student_id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.department && m.department.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.phone && m.phone.includes(searchKeyword)) ||
        (m.email && m.email.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.line_id && m.line_id.toLowerCase().includes(searchKeyword.toLowerCase()));

      const matchIdentity =
        identityFilter === 'ALL' || (m.identity_status && m.identity_status.includes(identityFilter));

      const matchOfficial =
        officialFilter === 'ALL' ||
        (officialFilter === 'OFFICIAL' && m.is_official_member) ||
        (officialFilter === 'NON_OFFICIAL' && !m.is_official_member);

      return matchKeyword && matchIdentity && matchOfficial;
    });
  }, [members, searchKeyword, identityFilter, officialFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 頂部操作工具列 */}
      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1.02rem' }}>
            <Users size={18} color="var(--wa-primary)" />
            <span>全社社員名冊</span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              placeholder="搜尋姓名、學號、電話、LINE ID..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ paddingLeft: 32, width: 240 }}
            />
          </div>

          <select
            className="web-admin-select"
            value={identityFilter}
            onChange={(e) => setIdentityFilter(e.target.value)}
          >
            <option value="ALL">全部身分別</option>
            <option value="臺科大在校學生">臺科大在校學生</option>
            <option value="畢業校友">畢業校友</option>
            <option value="校外人士">校外人士</option>
          </select>

          <select
            className="web-admin-select"
            value={officialFilter}
            onChange={(e) => setOfficialFilter(e.target.value)}
          >
            <option value="ALL">全部社籍狀態</option>
            <option value="OFFICIAL">僅正式社員</option>
            <option value="NON_OFFICIAL">非正式社員</option>
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadMembers}
            title="重新整理名冊"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>重整</span>
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          <div style={{ fontSize: '0.85rem', color: 'var(--wa-text-muted)' }}>
            篩選：<strong>{filteredMembers.length}</strong> / 總數：<strong>{members.length}</strong> 人
          </div>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={handleExportCSV}
          >
            <Download size={14} />
            <span>匯出名冊 CSV</span>
          </button>
        </div>
      </div>

      {/* 成功與錯誤提示 */}
      {successMsg && (
        <div style={{ backgroundColor: 'rgba(5, 150, 105, 0.1)', border: '1px solid rgba(5, 150, 105, 0.3)', color: '#047857', padding: '10px 16px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 600 }}>
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 社員卡片網格流 (Card Grid Style) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--wa-text-muted)' }}>
          <RefreshCw className="animate-spin" size={24} style={{ marginBottom: 12 }} />
          <div>載入社員名冊中...</div>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#ffffff', border: '1px solid var(--wa-border)', borderRadius: 10, color: 'var(--wa-text-muted)' }}>
          尚無符合篩選條件的社員
        </div>
      ) : (
        <div className="wa-card-grid">
          {filteredMembers.map((member) => {
            const isOfficial = member.is_official_member;
            const isOfficer = member.is_officer;

            return (
              <div
                key={member.line_user_id}
                className="wa-card"
                onClick={() => handleOpenDrawer(member)}
              >
                <div className="wa-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        backgroundColor: isOfficer ? 'var(--wa-primary)' : '#e2e8f0',
                        color: isOfficer ? '#ffffff' : 'var(--wa-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1rem',
                        fontWeight: 700,
                      }}
                    >
                      {member.name ? member.name.charAt(0) : '山'}
                    </div>

                    <div>
                      <h3 className="wa-card-title">{member.name || '無名社員'}</h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
                        LINE ID: {member.line_id || '-'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {isOfficial ? (
                      <span className="web-admin-badge web-admin-badge-success">
                        <Award size={12} />
                        <span>正式社員</span>
                      </span>
                    ) : (
                      <span className="web-admin-badge web-admin-badge-neutral">
                        一般社員
                      </span>
                    )}

                    {isOfficer && (
                      <span className="web-admin-badge web-admin-badge-info">
                        <Shield size={12} />
                        <span>{member.officer_role || '幹部'}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="wa-card-meta">
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>學籍：</span>
                    <span>{`${member.department || ''} ${member.student_id || ''}`.trim() || '校外人士'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--wa-text-muted)' }}>身分：</span>
                    <span>{member.identity_status || '臺科大在校學生'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={13} color="var(--wa-text-muted)" />
                    <span>{member.phone || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={13} color="var(--wa-text-muted)" />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email || '-'}</span>
                  </div>
                </div>

                <div className="wa-card-footer">
                  <span style={{ fontSize: '0.78rem' }}>
                    註冊：{member.created_at ? new Date(member.created_at).toISOString().split('T')[0] : '-'}
                  </span>
                  <span style={{ color: 'var(--wa-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>編輯個資 / 履歷</span>
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 右側滑出抽屜：個人資料編輯與履歷時間軸 */}
      {drawerOpen && formData && (
        <div className="wa-drawer-backdrop" onClick={() => setDrawerOpen(false)}>
          <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-header">
              <div>
                <h2 className="wa-drawer-title">社員詳細管理 - {formData.name}</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--wa-text-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                  UID: {formData.line_user_id}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 抽屜內部切換 Tab */}
                <div style={{ display: 'flex', background: 'var(--wa-surface-alt)', padding: 3, borderRadius: 6 }}>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: activeTab === 'profile' ? '#ffffff' : 'transparent',
                      color: activeTab === 'profile' ? 'var(--wa-primary)' : 'var(--wa-text-muted)',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      padding: '4px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveTab('profile')}
                  >
                    個資編輯
                  </button>
                  <button
                    type="button"
                    style={{
                      border: 'none',
                      background: activeTab === 'timeline' ? '#ffffff' : 'transparent',
                      color: activeTab === 'timeline' ? 'var(--wa-primary)' : 'var(--wa-text-muted)',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      padding: '4px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveTab('timeline')}
                  >
                    歷史履歷
                  </button>
                </div>

                <button
                  type="button"
                  className="wa-drawer-close-btn"
                  onClick={() => setDrawerOpen(false)}
                  title="關閉"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {activeTab === 'profile' ? (
              <form onSubmit={handleTriggerDiffCheck} style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 65px)' }}>
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
                        <label className="wa-form-label">出生年月日</label>
                        <input
                          type="date"
                          className="wa-form-input"
                          value={formData.birthday ? formData.birthday.split('T')[0] : ''}
                          onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                        />
                      </div>

                      <div className="wa-form-group">
                        <label className="wa-form-label">身分證字號 / 居留證</label>
                        <input
                          type="text"
                          className="wa-form-input"
                          value={formData.id_card || ''}
                          onChange={(e) => setFormData({ ...formData, id_card: e.target.value })}
                          placeholder="身分證號碼"
                        />
                      </div>
                    </div>

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
                      <label className="wa-form-label">電子信箱 Email</label>
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
                          value={formData.identity_status || '臺科大在校學生'}
                          onChange={(e) => setFormData({ ...formData, identity_status: e.target.value })}
                        >
                          <option value="臺科大在校學生">臺科大在校學生</option>
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

                    <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(formData.is_official_member)}
                          onChange={(e) => setFormData({ ...formData, is_official_member: e.target.checked })}
                        />
                        <span style={{ fontWeight: 600 }}>正式社員資格</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(formData.is_officer)}
                          onChange={(e) => setFormData({ ...formData, is_officer: e.target.checked })}
                        />
                        <span style={{ fontWeight: 600 }}>現任社團幹部</span>
                      </label>
                    </div>

                    {formData.is_officer && (
                      <div className="wa-form-group" style={{ marginTop: 8 }}>
                        <label className="wa-form-label">幹部職責稱號 (Officer Role)</label>
                        <input
                          type="text"
                          className="wa-form-input"
                          value={formData.officer_role || ''}
                          onChange={(e) => setFormData({ ...formData, officer_role: e.target.value })}
                          placeholder="例如 社長、副社長、裝備部長、活動部長..."
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
                          placeholder="例如 父親、母親、配偶"
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
                        <label className="wa-form-label">聯絡地址</label>
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
                </div>

                <div className="wa-drawer-footer">
                  <button
                    type="button"
                    className="web-admin-btn web-admin-btn-secondary"
                    onClick={() => setDrawerOpen(false)}
                  >
                    取消
                  </button>

                  <button
                    type="submit"
                    className="web-admin-btn"
                  >
                    <Save size={15} />
                    <span>儲存變更 (比對 Diff)</span>
                  </button>
                </div>
              </form>
            ) : (
              /* 歷史出隊與借用履歷時間軸 */
              <div className="wa-drawer-body">
                {timelineLoading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--wa-text-muted)' }}>
                    <RefreshCw className="animate-spin" size={20} style={{ marginBottom: 8 }} />
                    <div>載入社員履歷中...</div>
                  </div>
                ) : timelineRecords.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--wa-text-muted)' }}>
                    此社員目前尚無任何活動或借用歷史紀錄
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {timelineRecords.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid var(--wa-border)',
                          borderRadius: 8,
                          padding: 14,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.title}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--wa-text-muted)', marginTop: 4 }}>
                            日期：{item.date ? new Date(item.date).toISOString().split('T')[0] : '-'}
                          </div>
                        </div>

                        <span className="web-admin-badge web-admin-badge-neutral">
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Diff 對照確認彈窗 (Diff Confirmation Modal) */}
      {diffModalOpen && formData && (
        <div className="wa-diff-modal-backdrop" onClick={() => setDiffModalOpen(false)}>
          <div className="wa-diff-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--wa-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  確認社員資料修改 - [{formData.name}]
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--wa-text-muted)', marginTop: 2 }}>
                  共偵測到 {diffList.length} 個欄位變更，請確認新舊值對照無誤後寫入 Supabase
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

            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 18 }}>
              <table className="wa-diff-table">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>變更欄位</th>
                    <th style={{ width: '35%' }}>原值 (變更前)</th>
                    <th style={{ width: '35%' }}>新值 (變更後)</th>
                  </tr>
                </thead>
                <tbody>
                  {diffList.map((d, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{d.label}</td>
                      <td>
                        <span className="wa-diff-old">
                          {String(d.oldVal === '' || d.oldVal === null || d.oldVal === undefined ? '(空值)' : d.oldVal)}
                        </span>
                      </td>
                      <td>
                        <span className="wa-diff-new">
                          {String(d.newVal === '' || d.newVal === null || d.newVal === undefined ? '(空值)' : d.newVal)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--wa-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                className="web-admin-btn web-admin-btn-secondary"
                onClick={() => setDiffModalOpen(false)}
                disabled={saving}
              >
                返回修改
              </button>

              <button
                type="button"
                className="web-admin-btn"
                onClick={handleConfirmSaveToSupabase}
                disabled={saving}
              >
                <CheckCircle2 size={16} />
                <span>{saving ? '寫入 Supabase 中...' : '確認寫入 Supabase'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Users,
  Search,
  Download,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession, logWebAuditAction } from '../../utils/webAuth';
import './webAdmin.css';

interface MemberRow {
  line_user_id: string;
  name: string;
  student_id: string;
  department: string;
  identity_status: string;
  phone: string;
  email: string;
  id_card: string;
  birthday: string;
  is_officer: boolean;
  officer_role: string | null;
  is_official_member: boolean;
  payment_status: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  created_at: string;
}

export const WebAdminMembers: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 篩選與搜尋
  const [searchKeyword, setSearchKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [identityFilter, setIdentityFilter] = useState('ALL');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

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

      setMembers((data || []) as MemberRow[]);

      logWebAuditAction(client, session.userId, 'VIEW_MEMBERS_LIST', 'member', undefined, {
        count: data?.length || 0,
      });
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

  // 過濾清單
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchKeyword =
        !searchKeyword ||
        (m.name && m.name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.student_id && m.student_id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.department && m.department.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.phone && m.phone.includes(searchKeyword)) ||
        (m.email && m.email.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (m.id_card && m.id_card.toLowerCase().includes(searchKeyword.toLowerCase()));

      const matchRole =
        roleFilter === 'ALL' ||
        (roleFilter === 'OFFICER' && m.is_officer) ||
        (roleFilter === 'OFFICIAL' && m.is_official_member) ||
        (roleFilter === 'REGULAR' && !m.is_officer && !m.is_official_member);

      const matchIdentity =
        identityFilter === 'ALL' ||
        (m.identity_status && m.identity_status.includes(identityFilter));

      return matchKeyword && matchRole && matchIdentity;
    });
  }, [members, searchKeyword, roleFilter, identityFilter]);

  // 統計數字
  const stats = useMemo(() => {
    let total = members.length;
    let officers = 0;
    let officialMembers = 0;
    let paid = 0;

    members.forEach((m) => {
      if (m.is_officer) officers++;
      if (m.is_official_member) officialMembers++;
      if (m.payment_status && m.payment_status.includes('已繳費')) paid++;
    });

    return { total, officers, officialMembers, paid };
  }, [members]);

  // 切換幹部身分
  const handleToggleOfficer = async (m: MemberRow) => {
    const nextVal = !m.is_officer;
    setUpdatingUserId(m.line_user_id);
    setErrorMsg(null);
    try {
      const { error } = await client
        .from('members')
        .update({
          is_officer: nextVal,
          officer_role: nextVal ? (m.officer_role || '幹部') : null,
        })
        .eq('line_user_id', m.line_user_id);

      if (error) {
        throw new Error(`[更新幹部身分失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
      }

      setMembers((prev) =>
        prev.map((row) =>
          row.line_user_id === m.line_user_id
            ? { ...row, is_officer: nextVal, officer_role: nextVal ? (m.officer_role || '幹部') : null }
            : row
        )
      );

      logWebAuditAction(client, session.userId, 'TOGGLE_OFFICER', 'member', m.line_user_id, {
        targetName: m.name,
        isOfficer: nextVal,
      });
    } catch (err: any) {
      console.error('[WebAdminMembers] toggleOfficer error:', err);
      setErrorMsg(err.message || String(err));
    } finally {
      setUpdatingUserId(null);
    }
  };

  // 匯出 CSV
  const handleExportCsv = () => {
    if (filteredMembers.length === 0) return;

    const headers = [
      '姓名',
      '學號',
      '系所',
      '身分別',
      '是否為幹部',
      '幹部職稱',
      '正式社員',
      '繳費狀態',
      '身分證字號',
      '出生年月日',
      '電話',
      'Email',
      '緊急聯絡人',
      '緊急聯絡人電話',
      '註冊時間'
    ];

    const rows = filteredMembers.map((m) => [
      `"${m.name || ''}"`,
      `"${m.student_id || ''}"`,
      `"${m.department || ''}"`,
      `"${m.identity_status || ''}"`,
      `"${m.is_officer ? '是' : '否'}"`,
      `"${m.officer_role || ''}"`,
      `"${m.is_official_member ? '是' : '否'}"`,
      `"${m.payment_status || ''}"`,
      `"${m.id_card || ''}"`,
      `"${m.birthday || ''}"`,
      `"${m.phone || ''}"`,
      `"${m.email || ''}"`,
      `"${m.emergency_contact_name || ''}"`,
      `"${m.emergency_contact_phone || ''}"`,
      `"${m.created_at || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ntust_hiking_members_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    logWebAuditAction(client, session.userId, 'EXPORT_MEMBERS_CSV', 'member', undefined, {
      count: filteredMembers.length,
    });
  };

  return (
    <>
      {errorMsg && (
        <div className="web-admin-error-banner">
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{errorMsg}</div>
        </div>
      )}

      <div className="web-admin-toolbar">
        <div className="web-admin-toolbar-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="var(--wa-primary)" />
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>全社社員名冊</span>
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--wa-text-muted)' }} />
            <input
              type="text"
              className="web-admin-input"
              style={{ paddingLeft: 30, width: 230 }}
              placeholder="搜尋姓名、學號、系級、證號..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>

          <select
            className="web-admin-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">全部身分 ({members.length})</option>
            <option value="OFFICER">現任幹部 ({stats.officers})</option>
            <option value="OFFICIAL">正式社員 ({stats.officialMembers})</option>
            <option value="REGULAR">一般申請者</option>
          </select>

          <select
            className="web-admin-select"
            value={identityFilter}
            onChange={(e) => setIdentityFilter(e.target.value)}
          >
            <option value="ALL">全部校籍</option>
            <option value="本校生">本校生</option>
            <option value="外校生">外校生</option>
            <option value="校友">校友</option>
            <option value="社會人士">社會人士</option>
          </select>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={loadMembers}
            disabled={loading}
            title="重新整理名單"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>重新整理</span>
          </button>
        </div>

        <div className="web-admin-toolbar-right">
          <div style={{ display: 'flex', gap: 10, fontSize: '0.82rem' }}>
            <span className="web-admin-badge web-admin-badge-info">總社員: {stats.total}</span>
            <span className="web-admin-badge web-admin-badge-success">幹部: {stats.officers}</span>
            <span className="web-admin-badge web-admin-badge-warning">正式社員: {stats.officialMembers}</span>
          </div>

          <button
            type="button"
            className="web-admin-btn web-admin-btn-secondary"
            onClick={handleExportCsv}
            title="匯出為 CSV 試算表"
          >
            <Download size={14} />
            <span>匯出名冊 CSV</span>
          </button>
        </div>
      </div>

      <div className="web-admin-grid-container">
        <table className="web-admin-table">
          <thead>
            <tr>
              <th>序號</th>
              <th>姓名</th>
              <th>幹部身分</th>
              <th>幹部職稱</th>
              <th>正式社員</th>
              <th>社費繳費</th>
              <th>學號</th>
              <th>系所</th>
              <th>身分別</th>
              <th>身分證字號</th>
              <th>出生年月日</th>
              <th>聯絡電話</th>
              <th>Email</th>
              <th>緊急聯絡人</th>
              <th>聯絡人電話</th>
              <th>加入時間</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={16} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  {loading ? '社員名冊載入中...' : '無符合篩選條件之社員資料'}
                </td>
              </tr>
            ) : (
              filteredMembers.map((m, idx) => {
                const isUpdating = updatingUserId === m.line_user_id;

                return (
                  <tr key={m.line_user_id}>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{m.name || '未填寫'}</td>
                    <td>
                      <button
                        type="button"
                        className={`web-admin-badge ${m.is_officer ? 'web-admin-badge-success' : 'web-admin-badge-neutral'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        disabled={isUpdating}
                        onClick={() => handleToggleOfficer(m)}
                        title="點擊切換幹部權限"
                      >
                        {m.is_officer ? '幹部' : '一般'}
                      </button>
                    </td>
                    <td>{m.officer_role || '-'}</td>
                    <td>
                      <span className={`web-admin-badge ${m.is_official_member ? 'web-admin-badge-success' : 'web-admin-badge-neutral'}`}>
                        {m.is_official_member ? '正式社員' : '非正式'}
                      </span>
                    </td>
                    <td>
                      <span className={`web-admin-badge ${m.payment_status?.includes('已繳費') ? 'web-admin-badge-success' : 'web-admin-badge-danger'}`}>
                        {m.payment_status || '未繳費'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.student_id || '-'}</td>
                    <td>{m.department || '-'}</td>
                    <td>{m.identity_status || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#93c5fd' }}>
                      {m.id_card || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{m.birthday || '-'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.phone || '-'}</td>
                    <td>{m.email || '-'}</td>
                    <td>{m.emergency_contact_name || '-'}</td>
                    <td style={{ fontFamily: 'monospace' }}>{m.emergency_contact_phone || '-'}</td>
                    <td style={{ color: 'var(--wa-text-muted)', fontSize: '0.76rem' }}>
                      {m.created_at ? new Date(m.created_at).toLocaleDateString('zh-TW') : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

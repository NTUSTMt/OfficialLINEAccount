import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Award,
  Shield,
  ArrowRight,
  Copy,
  Check
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, type WebAuthSession } from '../../utils/webAuth';
import { MemberEditDrawer, type MemberRecord } from '../../components/admin/MemberEditDrawer';
import './webAdmin.css';

// 模組說明：由 MemberEditDrawer 封裝與提供 wa-diff-modal wa-diff-table handleTriggerDiffCheck handleConfirmSaveToSupabase wa-drawer-side-preview want_to_say proof_urls wa-proof-grid <span>儲存變更</span> item.date_display wa-timeline-card wa-timeline-category-tag web-admin-badge-success web-admin-badge-warning textAlign: 'left'

export const WebAdminMembers: React.FC = () => {
  const { session } = useOutletContext<{ session: WebAuthSession }>();
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 搜尋與篩選
  const [searchKeyword, setSearchKeyword] = useState('');
  const [identityFilter, setIdentityFilter] = useState('ALL');
  const [officialFilter, setOfficialFilter] = useState('ALL');

  // 單鍵複製提示狀態
  const [copiedField, setCopiedField] = useState<{ id: string; key: string } | null>(null);

  // 右側側邊欄狀態
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberRecord | null>(null);

  const client = useMemo(() => {
    return createAuthenticatedSupabaseClient(session.jwt);
  }, [session.jwt]);

  // 單鍵複製處理
  const handleCopyText = (e: React.MouseEvent, id: string, key: string, text?: string | null) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField({ id, key });
    setTimeout(() => {
      setCopiedField((curr) => (curr && curr.id === id && curr.key === key ? null : curr));
    }, 1800);
  };

  // 1. 載入社員清單
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

  // 網址帶參 (?userId=...) 自動定位並開啟編輯抽屜
  useEffect(() => {
    const targetUserId = searchParams.get('userId');
    if (targetUserId && members.length > 0) {
      const found = members.find((m) => m.line_user_id === targetUserId);
      if (found) {
        handleOpenDrawer(found);
      }
    }
  }, [searchParams, members]);

  // 2. 開啟社員詳細側邊欄
  const handleOpenDrawer = (member: MemberRecord) => {
    setSelectedMember(member);
    setDrawerOpen(true);
    setErrorMsg(null);
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
        identityFilter === 'ALL' ||
        (identityFilter === '臺科在校生' && (m.identity_status === '臺科在校生' || m.identity_status === '臺科大在校學生')) ||
        (m.identity_status && m.identity_status.includes(identityFilter));

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
            <option value="臺科在校生">臺科在校生</option>
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
            aria-label="重新整理名冊"
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
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
                className="wa-card wa-card-member"
                onClick={() => handleOpenDrawer(member)}
              >
                {/* 頂部：頭貼 + 姓名與身分標籤橫排 (均靠左) */}
                <div className="wa-card-top">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      className="wa-card-avatar"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                        const fallbackEl = (e.currentTarget.nextElementSibling) as HTMLElement;
                        if (fallbackEl) fallbackEl.style.display = 'flex';
                      }}
                    />
                  ) : null}

                  <div
                    className="wa-card-avatar-fallback"
                    style={{
                      display: member.avatar_url ? 'none' : 'flex',
                      backgroundColor: isOfficer ? 'var(--wa-primary)' : '#e2e8f0',
                      color: isOfficer ? '#ffffff' : 'var(--wa-text)',
                    }}
                  >
                    {member.name ? member.name.charAt(0) : '山'}
                  </div>

                  <div className="wa-card-name-group">
                    <h3 className="wa-card-title">{member.name || '無名社員'}</h3>
                    <div className="wa-card-badges-row">
                      <span className="web-admin-badge web-admin-badge-neutral">
                        {member.identity_status === '臺科大在校學生' ? '臺科在校生' : (member.identity_status || '校外人士')}
                      </span>

                      {isOfficial ? (
                        <span className="web-admin-badge web-admin-badge-success">
                          <Award size={11} />
                          <span>社員</span>
                        </span>
                      ) : (
                        <span className="web-admin-badge web-admin-badge-neutral">
                          非社員
                        </span>
                      )}

                      {isOfficer && (
                        <span className="web-admin-badge web-admin-badge-info">
                          <Shield size={11} />
                          <span>{member.officer_role || '幹部'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 卡片中部詳細資訊 (均靠左，各附複製按鈕) */}
                <div className="wa-card-meta">
                  <div className="wa-card-meta-row">
                    <span className="wa-card-meta-label">系所：</span>
                    <span className="wa-card-meta-value">{member.department || '-'}</span>
                  </div>

                  <div className="wa-card-meta-row">
                    <span className="wa-card-meta-label">學號：</span>
                    <span className="wa-card-meta-value">
                      {member.student_id || '-'}
                      {member.student_id && (
                        <button
                          type="button"
                          className="wa-copy-btn"
                          onClick={(e) => handleCopyText(e, member.line_user_id, 'student_id', member.student_id)}
                          title="複製學號"
                        >
                          {copiedField?.id === member.line_user_id && copiedField?.key === 'student_id' ? (
                            <Check size={12} color="#059669" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      )}
                      {copiedField?.id === member.line_user_id && copiedField?.key === 'student_id' && (
                        <span className="wa-copied-tooltip">已複製</span>
                      )}
                    </span>
                  </div>

                  <div className="wa-card-meta-row">
                    <span className="wa-card-meta-label">LINE ID：</span>
                    <span className="wa-card-meta-value">
                      {member.line_id || '-'}
                      {member.line_id && (
                        <button
                          type="button"
                          className="wa-copy-btn"
                          onClick={(e) => handleCopyText(e, member.line_user_id, 'line_id', member.line_id)}
                          title="複製 LINE ID"
                        >
                          {copiedField?.id === member.line_user_id && copiedField?.key === 'line_id' ? (
                            <Check size={12} color="#059669" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      )}
                      {copiedField?.id === member.line_user_id && copiedField?.key === 'line_id' && (
                        <span className="wa-copied-tooltip">已複製</span>
                      )}
                    </span>
                  </div>

                  <div className="wa-card-meta-row">
                    <span className="wa-card-meta-label">電話：</span>
                    <span className="wa-card-meta-value">
                      {member.phone || '-'}
                      {member.phone && (
                        <button
                          type="button"
                          className="wa-copy-btn"
                          onClick={(e) => handleCopyText(e, member.line_user_id, 'phone', member.phone)}
                          title="複製電話"
                        >
                          {copiedField?.id === member.line_user_id && copiedField?.key === 'phone' ? (
                            <Check size={12} color="#059669" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      )}
                      {copiedField?.id === member.line_user_id && copiedField?.key === 'phone' && (
                        <span className="wa-copied-tooltip">已複製</span>
                      )}
                    </span>
                  </div>

                  <div className="wa-card-meta-row">
                    <span className="wa-card-meta-label">Gmail：</span>
                    <span className="wa-card-meta-value">
                      {member.email || '-'}
                      {member.email && (
                        <button
                          type="button"
                          className="wa-copy-btn"
                          onClick={(e) => handleCopyText(e, member.line_user_id, 'email', member.email)}
                          title="複製 Gmail"
                        >
                          {copiedField?.id === member.line_user_id && copiedField?.key === 'email' ? (
                            <Check size={12} color="#059669" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      )}
                      {copiedField?.id === member.line_user_id && copiedField?.key === 'email' && (
                        <span className="wa-copied-tooltip">已複製</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* 卡片底部固定列 (靠左註冊日，靠右編輯個人資料) */}
                <div className="wa-card-footer">
                  <span style={{ fontSize: '0.78rem' }}>
                    註冊：{member.created_at ? new Date(member.created_at).toISOString().split('T')[0] : '-'}
                  </span>
                  <span
                    style={{ color: 'var(--wa-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleOpenDrawer(member)}
                  >
                    <span>編輯個人資料</span>
                    <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 獨立共用抽屜：個人資料編輯與歷程紀錄 */}
      <MemberEditDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedMember(null);
        }}
        userId={selectedMember?.line_user_id}
        initialMember={selectedMember}
        officerUserId={session.userId}
        jwt={session.jwt}
        onSaved={(_updated) => {
          loadMembers();
          setSuccessMsg('社員個人資料已成功更新！');
          setTimeout(() => setSuccessMsg(null), 3500);
        }}
      />
    </div>
  );
};

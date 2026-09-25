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
} from 'lucide-react';
import { createAuthenticatedSupabaseClient, logWebAuditAction } from '../../utils/webAuth';
import '../../pages/web-admin/webAdmin.css';

export interface MemberRecord {
  line_user_id: string;
  name: string;
  avatar_url?: string | null;
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

export const FIELD_LABELS: Record<string, string> = {
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
}

// 輔助函式：將 Google Drive 檔案連結轉換為可直接在網頁顯示的縮圖網址
export const getDriveThumbnail = (url?: string | null): string => {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com')) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
  }
  return url;
};

export const MemberEditDrawer: React.FC<MemberEditDrawerProps> = ({
  isOpen,
  onClose,
  userId,
  officerUserId,
  jwt,
  initialMember,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'timeline'>('profile');
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

  // 履歷時間軸
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRecords, setTimelineRecords] = useState<any[]>([]);

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
      setDiffModalOpen(false);
      setDiffList([]);
      setErrorMsg(null);
      setSuccessMsg(null);
      setActiveTab('profile');
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

  // 載入社員歷史履歷時間軸
  const loadMemberTimeline = async (tUserId: string) => {
    setTimelineLoading(true);
    try {
      const { data, error } = await client.rpc('get_admin_member_records_rpc', {
        p_officer_line_user_id: officerUserId,
        p_target_user_id: tUserId,
      });

      if (!error && data && Array.isArray(data.records)) {
        setTimelineRecords(data.records);
      } else {
        // 直查 event_signups 與 loans
        const [signupsRes, loansRes] = await Promise.all([
          client.from('event_signups').select('id, event_id, status, created_at, events(title)').eq('line_user_id', tUserId),
          client.from('loans').select('id, start_date, end_date, status, total_rent').eq('line_user_id', tUserId),
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
    } catch (err: any) {
      console.warn('[MemberEditDrawer] timeline load warning:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'timeline' && targetUserId) {
      loadMemberTimeline(targetUserId);
    }
  }, [isOpen, activeTab, targetUserId]);

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
        className="wa-drawer-backdrop"
        onClick={() => {
          onClose();
          setPreviewPhotoUrl(null);
        }}
      >
        {/* 左側照片放大檢視面板 */}
        {previewPhotoUrl && (
          <div className="wa-drawer-side-preview" onClick={(e) => e.stopPropagation()}>
            <div className="wa-drawer-side-preview-header">
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>體能測驗證明照片預覽</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <a
                  href={previewPhotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                  title="另開新視窗查看原圖"
                >
                  <ExternalLink size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPhotoUrl(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
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

        {/* 右側滑出抽屜主面板 */}
        <div className="wa-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="wa-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 className="wa-drawer-title">
                {formData ? `${formData.name} - 詳細資料` : '載入社員資料中...'}
              </h2>
              {/* 分頁切換器 */}
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: 6 }}>
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
            </div>

            <button
              type="button"
              className="wa-drawer-close-btn"
              onClick={() => {
                onClose();
                setPreviewPhotoUrl(null);
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
          ) : activeTab === 'profile' ? (
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
                      <label className="wa-form-label">出生年月日</label>
                      <input
                        type="date"
                        className="wa-form-input"
                        value={formData.birthday || ''}
                        onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                      />
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
                      <label className="wa-form-label">自訂 LINE ID</label>
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
                              onClick={() => setPreviewPhotoUrl(thumbUrl || url)}
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
          ) : (
            /* 歷史履歷時間軸 */
            <div className="wa-drawer-body" style={{ padding: '16px 20px', textAlign: 'left' }}>
              {timelineLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  <Loader2 size={24} className="animate-spin" />
                  <div style={{ marginTop: 8 }}>正在載入履歷時間軸...</div>
                </div>
              ) : timelineRecords.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--wa-text-muted)' }}>
                  此社員尚無任何活動報名、裝備借用或繳費歷史紀錄
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {timelineRecords.map((item, idx) => {
                    const isEvent = item.type === 'event' || item.type === 'activity';
                    const isLoan = item.type === 'loan' || item.type === 'equipment';

                    return (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--wa-border)',
                          borderRadius: 8,
                          padding: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.88rem' }}>
                            {isEvent ? (
                              <Calendar size={14} color="#059669" />
                            ) : isLoan ? (
                              <Package size={14} color="#d97706" />
                            ) : (
                              <CreditCard size={14} color="#2563eb" />
                            )}
                            <span>{item.title || item.event_title || '紀錄項目'}</span>
                          </div>
                          <span className="web-admin-badge web-admin-badge-neutral" style={{ fontSize: '0.72rem' }}>
                            {item.status || item.payment_status || '已完成'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.76rem', color: 'var(--wa-text-muted)' }}>
                          時間：{item.date ? new Date(item.date).toISOString().split('T')[0] : item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '無日期'}
                        </div>

                        {(item.amount || item.payment_status || item.details?.items) && (
                          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {item.amount !== undefined && item.amount !== null && Number(item.amount) > 0 && (
                              <div>金額：NT$ {Number(item.amount).toLocaleString()}</div>
                            )}
                            {item.payment_status && item.payment_status !== item.status && (
                              <div>付款狀態：{item.payment_status}</div>
                            )}
                            {item.details?.items && Array.isArray(item.details.items) && (
                              <div>品項：{item.details.items.map((i: any) => `${i.equipmentName} x ${i.quantity}`).join(', ')}</div>
                            )}
                            {item.notes && <div>備註：{item.notes}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

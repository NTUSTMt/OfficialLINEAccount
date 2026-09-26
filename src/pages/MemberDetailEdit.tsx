import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Package,
  CreditCard,
  ChevronDown,
  ChevronUp,
  History,
  X
} from 'lucide-react';
import {
  fetchMemberFullDetailFromSupabase,
  fetchMemberActiveStatsFromSupabase,
  updateMemberFullDetailInSupabase
} from '../utils/supabaseClient';
import { safeNavigateBack } from '../utils/navigationUtils';
import { NATIONALITY_LIST, getNationalityLabel } from '../constants/nationalities';
import type { MemberFullRecord, MemberActiveStats } from '../types/admin';

// 欄位繁體中文顯示名稱對照表
const FIELD_LABELS: Record<string, string> = {
  name: '真實姓名',
  gender: '性別',
  nationality: '國籍 (Nationality)',
  birthday: '出生年月日',
  id_card: '證件號碼 (身分證/居留證)',
  phone: '聯絡電話',
  email: '電子信箱',
  address: '聯絡地址',
  line_id: 'LINE ID',
  preferred_language: '偏好語言 (Preferred Language)',
  want_to_say: '想說的話 (留言)',
  identity_status: '身分狀態',
  department: '就讀系所',
  student_id: '學號',
  emergency_contact_name: '緊急聯絡人姓名',
  emergency_contact_phone: '緊急聯絡人電話',
  emergency_contact_rel: '緊急聯絡人關係',
  emergency_contact_address: '緊急聯絡人地址',
  outdoor_experience: '登山經歷',
  fitness_desc: '體能自述',
  medical_history: '特殊病史/藥物過敏',
  is_official_member: '正式社員資格',
  membership_expires_at: '社籍到期日',
  payment_status: '社費繳納狀態',
  join_membership_intent: '加入社員意願',
  officer_intent: '擔任幹部意願',
  is_officer: '是否為幹部',
  officer_role: '幹部職責角色'
};

export default function MemberDetailEdit({ officerUserId }: { officerUserId?: string } = {}) {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 原始資料與編輯中的表單狀態
  const [originalData, setOriginalData] = useState<MemberFullRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [activeStats, setActiveStats] = useState<MemberActiveStats>({
    unfinishedEvents: [],
    activeLoans: [],
    pendingPaymentsCount: 0
  });

  // 分組收合狀態
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    basic: false,
    academic: false,
    emergency: false,
    outdoor: false,
    membership: false
  });

  // Diff 彈窗狀態
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const toggleSection = (sec: string) => {
    setCollapsedSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [detail, stats] = await Promise.all([
        fetchMemberFullDetailFromSupabase(userId, officerUserId),
        fetchMemberActiveStatsFromSupabase(userId, officerUserId)
      ]);

      if (!detail) {
        setErrorMessage(`找不到使用者識別碼為 ${userId} 的社員資料`);
        return;
      }

      setOriginalData(detail);
      setFormData({
        name: detail.name || '',
        gender: detail.gender || '',
        nationality: detail.nationality || '中華民國',
        birthday: detail.birthday || '',
        id_card: detail.id_card || '',
        phone: detail.phone || '',
        email: detail.email || '',
        address: detail.address || '',
        line_id: detail.line_id || '',
        preferred_language: detail.preferred_language || 'zh',
        want_to_say: detail.want_to_say || '',
        identity_status: detail.identity_status || '',
        department: detail.department || '',
        student_id: detail.student_id || '',
        emergency_contact_name: detail.emergency_contact_name || '',
        emergency_contact_phone: detail.emergency_contact_phone || '',
        emergency_contact_rel: detail.emergency_contact_rel || '',
        emergency_contact_address: detail.emergency_contact_address || '',
        outdoor_experience: detail.outdoor_experience || '',
        fitness_desc: detail.fitness_desc || '',
        medical_history: detail.medical_history || '',
        is_official_member: Boolean(detail.is_official_member),
        membership_expires_at: detail.membership_expires_at || '',
        payment_status: detail.payment_status || '未繳費 Unpaid',
        join_membership_intent: detail.join_membership_intent || '',
        officer_intent: detail.officer_intent || '',
        is_officer: Boolean(detail.is_officer),
        officer_role: detail.officer_role || ''
      });
      setActiveStats(stats);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const handleFieldChange = (field: string, val: any) => {
    setFormData(prev => ({ ...prev, [field]: val }));
    setSuccessMessage(null);
  };

  // 計算變更的欄位清單 (Diff)
  const computeDiff = () => {
    if (!originalData) return [];
    const diffs: Array<{ field: string; label: string; oldVal: string; newVal: string }> = [];

    Object.keys(formData).forEach(k => {
      const oldV = (originalData as any)[k];
      const newV = formData[k];

      // 比較值變動
      const normalizedOld = oldV === null || oldV === undefined ? '' : oldV;
      const normalizedNew = newV === null || newV === undefined ? '' : newV;

      if (String(normalizedOld) !== String(normalizedNew)) {
        diffs.push({
          field: k,
          label: FIELD_LABELS[k] || k,
          oldVal: String(normalizedOld === '' ? '(未填寫)' : normalizedOld),
          newVal: String(normalizedNew === '' ? '(未填寫)' : normalizedNew)
        });
      }
    });

    return diffs;
  };

  const diffList = computeDiff();

  const handlePreSave = () => {
    if (diffList.length === 0) {
      alert('目前無任何欄位被修改');
      return;
    }
    setIsDiffModalOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!userId) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 僅提取異動欄位
      const changedPayload: Record<string, any> = {};
      diffList.forEach(d => {
        changedPayload[d.field] = formData[d.field];
      });

      const res = await updateMemberFullDetailInSupabase(userId, changedPayload, officerUserId);
      if (!res.success) {
        setErrorMessage(res.error || '儲存失敗');
        setIsDiffModalOpen(false);
        return;
      }

      setSuccessMessage('社員資料已成功更新儲存');
      setIsDiffModalOpen(false);
      // 重新由 Supabase 載入最新完整紀錄與狀態，確保資料庫與畫面 100% 同步
      await loadData();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setIsDiffModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        color: '#64748b'
      }}>
        <div className="loading-spinner" style={{ marginBottom: '12px' }} />
        <span>讀取社員詳細資料中...</span>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      paddingBottom: '60px',
      textAlign: 'left'
    }}>
      {/* 頂部控制列 */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 90,
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <button
          onClick={() => safeNavigateBack(navigate, '/admin/members')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: '#334155',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={18} />
          <span>返回上一頁</span>
        </button>

        <button
          onClick={handlePreSave}
          disabled={diffList.length === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: diffList.length > 0 ? '#059669' : '#cbd5e1',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: diffList.length > 0 ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease'
          }}
        >
          <Save size={15} />
          <span>儲存變更 {diffList.length > 0 ? `(${diffList.length})` : ''}</span>
        </button>
      </div>

      <div style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '16px 14px'
      }}>
        {/* 錯誤顯示 */}
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
              <div style={{ fontWeight: 600 }}>操作失敗</div>
              <div style={{ marginTop: '2px', wordBreak: 'break-all' }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* 成功提示 */}
        {successMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '13px',
            fontWeight: 500
          }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 頂部狀態儀表區 (未結束活動、租借狀態、繳費狀態) */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px',
          marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
              進行中動態概況
            </div>
            <button
              type="button"
              onClick={() => navigate(`/admin/members/${userId}/records`)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#f1f5f9',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#e2e8f0';
                e.currentTarget.style.borderColor = '#94a3b8';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
            >
              <History size={14} color="#059669" />
              <span>查看個人歷史全紀錄</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            {/* 活動行程 */}
            <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                <Calendar size={14} color="#059669" />
                <span>未結束活動 ({activeStats.unfinishedEvents.length})</span>
              </div>
              {activeStats.unfinishedEvents.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>目前無進行中活動</div>
              ) : (
                activeStats.unfinishedEvents.map((e: any) => (
                  <div key={e.id} style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.title}</div>
                    <div style={{ color: '#64748b', fontSize: '11px' }}>
                      {e.startDate} ~ {e.endDate} | {e.signupStatus} ({e.payStatus})
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 裝備借用 */}
            <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                <Package size={14} color="#2563eb" />
                <span>借用中裝備 ({activeStats.activeLoans.length})</span>
              </div>
              {activeStats.activeLoans.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>目前無未歸還裝備</div>
              ) : (
                activeStats.activeLoans.map((l: any) => (
                  <div key={l.id} style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{l.itemsSummary}</div>
                    <div style={{ color: '#64748b', fontSize: '11px' }}>
                      {l.status} | {l.payStatus}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 待繳款項 */}
            <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #f1f5f9', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                <CreditCard size={14} color="#d97706" />
                <span>待確認/未繳費項目 ({activeStats.pendingPaymentsCount})</span>
              </div>
              {activeStats.pendingPaymentsCount === 0 ? (
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#059669' }}>
                  帳務已全數結清
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {activeStats.pendingItems && activeStats.pendingItems.length > 0 ? (
                    activeStats.pendingItems.map((item: any, idx: number) => (
                      <div key={idx} style={{ fontSize: '12px', color: '#0f172a', backgroundColor: '#ffffff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 600 }}>{item.title}</div>
                        <div style={{ fontSize: '11px', color: '#d97706', marginTop: '2px' }}>狀態：{item.status}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                      有 {activeStats.pendingPaymentsCount} 筆待結費用
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 編輯表單：依邏輯分組 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 1. 基本資料 */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <button
              onClick={() => toggleSection('basic')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>1. 基本資料</span>
              {collapsedSections.basic ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronUp size={18} color="#94a3b8" />}
            </button>
            {!collapsedSections.basic && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>真實姓名</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={e => handleFieldChange('name', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>性別</label>
                    <select
                      value={formData.gender || ''}
                      onChange={e => handleFieldChange('gender', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    >
                      <option value="">(未設定)</option>
                      <option value="男">男</option>
                      <option value="女">女</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>國籍</label>
                    <select
                      value={getNationalityLabel(formData.nationality, 'zh')}
                      onChange={e => handleFieldChange('nationality', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    >
                      {NATIONALITY_LIST.map(item => (
                        <option key={item.zh} value={item.zh}>
                          {item.zh} ({item.en})
                        </option>
                      ))}
                      <option value="其他">其他 (自行輸入)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>生日 (YYYY-MM-DD)</label>
                    <input
                      type="text"
                      value={formData.birthday || ''}
                      onChange={e => handleFieldChange('birthday', e.target.value)}
                      placeholder="2000-01-01"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>身分證/居留證字號</label>
                    <input
                      type="text"
                      value={formData.id_card || ''}
                      onChange={e => handleFieldChange('id_card', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>LINE ID</label>
                    <input
                      type="text"
                      value={formData.line_id || ''}
                      onChange={e => handleFieldChange('line_id', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>聯絡電話</label>
                    <input
                      type="text"
                      value={formData.phone || ''}
                      onChange={e => handleFieldChange('phone', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>聯絡信箱</label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={e => handleFieldChange('email', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>聯絡地址</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={e => handleFieldChange('address', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>偏好語言 (Preferred Language)</label>
                  <select
                    value={formData.preferred_language || 'zh'}
                    onChange={e => handleFieldChange('preferred_language', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box', backgroundColor: '#ffffff' }}
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>想說的話 (留言)</label>
                  <textarea
                    rows={2}
                    value={formData.want_to_say || ''}
                    onChange={e => handleFieldChange('want_to_say', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. 學籍身分 */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <button
              onClick={() => toggleSection('academic')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>2. 學籍與身分</span>
              {collapsedSections.academic ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronUp size={18} color="#94a3b8" />}
            </button>
            {!collapsedSections.academic && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>身分狀態</label>
                  <select
                    value={formData.identity_status || ''}
                    onChange={e => handleFieldChange('identity_status', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  >
                    <option value="">(未設定)</option>
                    <option value="臺科大在校學生">臺科大在校學生</option>
                    <option value="畢業校友">畢業校友</option>
                    <option value="校外人士">校外人士</option>
                    {formData.identity_status && !['臺科大在校學生', '畢業校友', '校外人士', ''].includes(formData.identity_status) && (
                      <option value={formData.identity_status}>{formData.identity_status}</option>
                    )}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>系所名稱</label>
                    <input
                      type="text"
                      value={formData.department || ''}
                      onChange={e => handleFieldChange('department', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>學號</label>
                    <input
                      type="text"
                      value={formData.student_id || ''}
                      onChange={e => handleFieldChange('student_id', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. 緊急聯絡人 */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <button
              onClick={() => toggleSection('emergency')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>3. 入山保險與緊急聯絡人</span>
              {collapsedSections.emergency ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronUp size={18} color="#94a3b8" />}
            </button>
            {!collapsedSections.emergency && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>緊急聯絡人姓名</label>
                    <input
                      type="text"
                      value={formData.emergency_contact_name || ''}
                      onChange={e => handleFieldChange('emergency_contact_name', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>關係</label>
                    <input
                      type="text"
                      value={formData.emergency_contact_rel || ''}
                      onChange={e => handleFieldChange('emergency_contact_rel', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>緊急聯絡人電話</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_phone || ''}
                    onChange={e => handleFieldChange('emergency_contact_phone', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>緊急聯絡人地址</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_address || ''}
                    onChange={e => handleFieldChange('emergency_contact_address', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. 登山經歷與體能 */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <button
              onClick={() => toggleSection('outdoor')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>4. 登山經歷與體能狀態</span>
              {collapsedSections.outdoor ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronUp size={18} color="#94a3b8" />}
            </button>
            {!collapsedSections.outdoor && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>爬山經驗自述</label>
                  <textarea
                    rows={2}
                    value={formData.outdoor_experience || ''}
                    onChange={e => handleFieldChange('outdoor_experience', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>體能測驗自述</label>
                  <textarea
                    rows={2}
                    value={formData.fitness_desc || ''}
                    onChange={e => handleFieldChange('fitness_desc', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>個人特殊病史或過敏藥物</label>
                  <textarea
                    rows={2}
                    value={formData.medical_history || ''}
                    onChange={e => handleFieldChange('medical_history', e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. 社籍與幹部狀態 */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <button
              onClick={() => toggleSection('membership')}
              style={{
                width: '100%',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>5. 社籍資格與幹部權限</span>
              {collapsedSections.membership ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronUp size={18} color="#94a3b8" />}
            </button>
            {!collapsedSections.membership && (
              <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 正式社員 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>正式社員身分</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>享有裝備租借 5 折優待資格</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_official_member)}
                    onChange={e => handleFieldChange('is_official_member', e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#059669' }}
                  />
                </div>

                {/* 擔任幹部意願 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>擔任幹部意願</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>有意願協助社團營運、出隊嚮導或幹部實習</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.officer_intent && (formData.officer_intent.includes('意願') || formData.officer_intent === '我有意願成為社團幹部'))}
                    onChange={e => handleFieldChange('officer_intent', e.target.checked ? '我有意願成為社團幹部' : '')}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>社籍到期日</label>
                    <input
                      type="date"
                      value={formData.membership_expires_at || ''}
                      onChange={e => handleFieldChange('membership_expires_at', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>社費繳納狀態</label>
                    <select
                      value={formData.payment_status || '未繳費 Unpaid'}
                      onChange={e => handleFieldChange('payment_status', e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    >
                      <option value="未繳費 Unpaid">未繳費 Unpaid</option>
                      <option value="待確認 Checking">待確認 Checking</option>
                      <option value="已繳費 Paid">已繳費 Paid</option>
                    </select>
                  </div>
                </div>

                {/* 幹部身分 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>是否為幹部</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>開啟幹部系統全部管理後台權限</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_officer)}
                    onChange={e => handleFieldChange('is_officer', e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                </div>

                {formData.is_officer && (
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>幹部職責稱謂</label>
                    <input
                      type="text"
                      value={formData.officer_role || ''}
                      onChange={e => handleFieldChange('officer_role', e.target.value)}
                      placeholder="社長 / 裝備長 / 嚮導長 / 總務"
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 儲存確認 Diff Modal (條列式異動對比表) */}
      {isDiffModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '20px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                修改內容確認 (共 {diffList.length} 項變更)
              </h3>
              <button
                onClick={() => setIsDiffModalOpen(false)}
                disabled={isSaving}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
              請檢查下列修改的欄位資料，確認無誤後點擊「確認儲存」寫入資料庫：
            </p>

            {/* 條列式 Diff 表格 */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '10px',
              backgroundColor: '#f8fafc',
              marginBottom: '16px'
            }}>
              {diffList.map((d) => (
                <div
                  key={d.field}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                    {d.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{d.oldVal}</span>
                    <ArrowRight size={14} color="#64748b" />
                    <span style={{ color: '#059669', fontWeight: 600 }}>{d.newVal}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 按鈕組 */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setIsDiffModalOpen(false)}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                返回修改
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={isSaving}
                style={{
                  flex: 2,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {isSaving ? '儲存中...' : '確認儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import '../App.css';

const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyexiWmltP2iXDFWNpxzsG33ChRmIYp8s5DeSc5P8uhfzkKW3VmcELAKDPQQ57Ei_LnTw/exec';

interface ProfileData {
  name: string;
  gender: string;
  birthday: string;
  idNumber: string;
  department: string;
  studentId: string;
  phone: string;
  email: string;
  realLineId: string;
  emerName: string;
  emerRel: string;
  emerPhone: string;
  medicalHistory: string;
  exp: string;
  strength: string;
  strengthProof: string;
}

interface UploadedFile {
  base64: string;
  name: string;
}

function Register({ userId }: { userId: string }) {
  const [step, setStep] = useState(1);
  const [_loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewUser, setIsNewUser] = useState(true);
  const [lineProfile, setLineProfile] = useState<{ displayName: string; pictureUrl?: string } | null>(null);

  // 表單欄位狀態
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    gender: '',
    birthday: '',
    idNumber: '',
    department: '臺科大在校學生',
    studentId: '',
    phone: '',
    email: '',
    realLineId: '',
    emerName: '',
    emerRel: '',
    emerPhone: '',
    medicalHistory: '',
    exp: '',
    strength: '',
    strengthProof: '',
  });

  // 上傳檔案狀態
  const [strengthProofFile, setStrengthProofFile] = useState<UploadedFile | null>(null);

  // 隱私權同意書勾選
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  // 載入 LINE Profile 與 GAS 社員資料
  useEffect(() => {
    const fetchProfileData = async () => {
      setLoading(true);
      try {
        // 1. 取得 LINE Profile
        if (liff.isLoggedIn()) {
          const profile = await liff.getProfile();
          setLineProfile({
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          });
          // 預帶 LINE ID
          setFormData((prev) => ({ ...prev, realLineId: profile.displayName }));
        }

        // 2. 向 GAS 查詢現有社員資料
        if (userId && userId !== 'TEST_USER_ID') {
          const res = await fetch(`${GAS_API_URL}?action=get_profile&userId=${userId}`);
          const result = await res.json();
          if (result.status === 'success' && result.isMember && result.profile) {
            setIsNewUser(false);
            setFormData(result.profile);
            setPrivacyAgreed(true);
          }
        } else {
          // 測試模式模擬載入
          setTimeout(() => {
            setLineProfile({
              displayName: '登山小萌新',
              pictureUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=150',
            });
          }, 500);
        }
      } catch (err) {
        console.error('載入個人資料失敗:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 處理檔案讀取為 Base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('檔案大小不能超過 5MB！');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setStrengthProofFile({ base64: base64String, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  // 驗證各步驟欄位
  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        return (
          formData.name.trim() !== '' &&
          formData.gender !== '' &&
          formData.birthday !== '' &&
          formData.idNumber.trim() !== ''
        );
      case 2:
        const isStudent = formData.department.includes('在校學生') || formData.department.includes('學生') || (!formData.department.includes('畢業') && !formData.department.includes('校外人士'));
        const phoneValid = /^\+?\d{8,15}$/.test(formData.phone.trim().replace(/[- ]/g, ''));
        const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim());
        return (
          formData.department !== '' &&
          (!isStudent || formData.studentId.trim() !== '') &&
          phoneValid &&
          emailValid &&
          formData.realLineId.trim() !== ''
        );
      case 3:
        const emerPhoneValid = /^\+?\d{8,15}$/.test(formData.emerPhone.trim().replace(/[- ]/g, ''));
        return (
          formData.emerName.trim() !== '' &&
          formData.emerRel.trim() !== '' &&
          emerPhoneValid
        );
      case 4:
        return privacyAgreed;
      default:
        return false;
    }
  }, [step, formData, privacyAgreed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isStepValid) return;

    setIsSubmitting(true);
    try {
      const payload = {
        action: 'save_profile',
        userId: userId || 'TEST_USER_ID',
        data: formData,
        strengthProofFile: strengthProofFile?.base64 || null,
        strengthProofFileName: strengthProofFile?.name || null,
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(isNewUser ? '🎉 註冊成功！資料已寫入社團資料庫。' : '✅ 資料已成功更新！');
        if (liff.isInClient()) {
          liff.closeWindow();
        }
      } else {
        alert(`儲存失敗: ${result.message || '請聯絡社團管理員'}`);
      }
    } catch (err) {
      console.error('提交表單失敗:', err);
      alert('網路連線失敗，請檢查您的網路狀態！');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-container animate-fade-in">
      {/* 頂部親切 LINE 歡迎資訊卡 */}
      <div className="register-welcome-card">
        {lineProfile?.pictureUrl && (
          <img src={lineProfile.pictureUrl} alt="LINE Avatar" className="welcome-avatar" />
        )}
        <div className="welcome-info">
          <h3>哈囉，{lineProfile?.displayName || '山友'}！</h3>
          <p>{isNewUser ? '歡迎填寫資料加入臺科大登山社 ⛰️' : '隨時更新您的登山社員資料 🎒'}</p>
        </div>
      </div>

      {/* 步驟進度條 */}
      <div className="step-progress-bar">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`step-dot-wrapper ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
            <div className="step-dot">{s}</div>
            <span className="step-label">
              {s === 1 ? '基本' : s === 2 ? '學籍' : s === 3 ? '安全' : '經驗'}
            </span>
          </div>
        ))}
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
        </div>
      </div>

      {/* 表單主體 */}
      <form onSubmit={handleSubmit} className="register-form-card">
        {/* 步驟 1: 基本資料 */}
        {step === 1 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍 步驟 1：基本資料 (Basic Info)</h2>
            
            <div className="form-group">
              <label className="required">真實姓名</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="請輸入身分證姓名"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">性別</label>
              <select name="gender" value={formData.gender} onChange={handleChange} required>
                <option value="">請選擇性別 (山屋床位安排依據)</option>
                <option value="男">男 (Male)</option>
                <option value="女">女 (Female)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="required">生日</label>
              <input
                type="date"
                name="birthday"
                value={formData.birthday ? formData.birthday.substring(0, 10) : ''}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">身分證字號 / 護照號碼</label>
              <input
                type="text"
                name="idNumber"
                value={formData.idNumber}
                onChange={handleChange}
                placeholder="辦理入山與平安保險必備"
                required
              />
            </div>
          </div>
        )}

        {/* 步驟 2: 聯絡與學籍 */}
        {step === 2 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍 步驟 2：聯絡與學籍 (Contact & Academic)</h2>

            <div className="form-group">
              <label className="required">身分狀態</label>
              <select
                name="department"
                value={formData.department.includes('畢業校友') ? '畢業校友' : formData.department.includes('校外人士') ? '校外人士' : '臺科大在校學生'}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    department: val,
                    // 切換身分時，若非在校生可清空學號
                    studentId: val === '臺科大在校學生' ? prev.studentId : '',
                  }));
                }}
                required
              >
                <option value="臺科大在校學生">臺科大在校學生</option>
                <option value="畢業校友">畢業校友</option>
                <option value="校外人士">校外人士</option>
              </select>
            </div>

            <div className="form-group">
              <label className={formData.department === '臺科大在校學生' ? 'required' : ''}>
                在校系所 / 單位
              </label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="例如：電機系四乙 / 畢業校友 / 校外人士"
                required={formData.department === '臺科大在校學生'}
              />
            </div>

            <div className="form-group">
              <label className={formData.department === '臺科大在校學生' ? 'required' : ''}>
                學號
              </label>
              <input
                type="text"
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                placeholder={formData.department === '臺科大在校學生' ? '在校生必填' : '非在校生免填'}
                required={formData.department === '臺科大在校學生'}
              />
            </div>

            <div className="form-group">
              <label className="required">手機號碼</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="例如：0912345678"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">Email 信箱</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="例如：example@gmail.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">真實 LINE ID</label>
              <input
                type="text"
                name="realLineId"
                value={formData.realLineId}
                onChange={handleChange}
                placeholder="方便幹部建立出隊聯絡群組"
                required
              />
            </div>
          </div>
        )}

        {/* 步驟 3: 留守與安全資訊 */}
        {step === 3 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍 步驟 3：留守資訊 (Safety & Emergency) ⚠️</h2>

            <div className="form-group">
              <label className="required">緊急聯絡人姓名</label>
              <input
                type="text"
                name="emerName"
                value={formData.emerName}
                onChange={handleChange}
                placeholder="家屬或親友姓名"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">與緊急聯絡人關係</label>
              <input
                type="text"
                name="emerRel"
                value={formData.emerRel}
                onChange={handleChange}
                placeholder="例如：父母、配偶、兄弟姊妹"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">緊急聯絡人電話</label>
              <input
                type="tel"
                name="emerPhone"
                value={formData.emerPhone}
                onChange={handleChange}
                placeholder="出隊期間留守聯絡電話"
                required
              />
            </div>

            <div className="form-group">
              <label>個人特殊病史或過敏 (選填)</label>
              <textarea
                name="medicalHistory"
                value={formData.medicalHistory}
                onChange={handleChange}
                placeholder="如氣喘、嚴重高山症病史、過敏藥物等。此資訊僅供嚮導掌握隊員安全狀況，完全保密。"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* 步驟 4: 登山經驗與體能證明 */}
        {step === 4 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍 步驟 4：經驗與證明 (Experience & Upload)</h2>

            <div className="form-group">
              <label>過往登山經驗簡述 (選填)</label>
              <textarea
                name="exp"
                value={formData.exp}
                onChange={handleChange}
                placeholder="例如：登頂合歡群峰、玉山主峰、嘉明湖，或百岳累積 5 座等。"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>體能證明連結/描述 (選填)</label>
              <input
                type="text"
                name="strength"
                value={formData.strength}
                onChange={handleChange}
                placeholder="例如：3000公尺跑步15分鐘證明、健身房紀錄或描述"
              />
            </div>

            {/* 上傳體能證明 */}
            <div className="form-group">
              <label>上傳體能證明截圖 (選填，針對長天數高山行程)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="file-input"
              />
              {strengthProofFile && <p className="file-selected">✓ 已選擇: {strengthProofFile.name}</p>}
              {formData.strengthProof && formData.strengthProof.startsWith('http') && !strengthProofFile && (
                <p className="file-link">
                  <a href={formData.strengthProof} target="_blank" rel="noopener noreferrer">
                    🔍 查看已上傳體能證明
                  </a>
                </p>
              )}
            </div>

            {/* 隱私權同意書 */}
            <div className="privacy-consent-box" style={{ marginTop: '24px' }}>
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                />
                <span className="checkmark"></span>
                <span className="consent-text" style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  我同意將個人資料用於社團活動保險、入山申請及緊急聯繫使用。
                </span>
              </label>
            </div>
          </div>
        )}

        {/* 按鈕導覽區 */}
        <div className="step-navigation-buttons" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
          {step > 1 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep(step - 1)}
              style={{ width: '45%' }}
            >
              上一步
            </button>
          ) : (
            <div style={{ width: '45%' }}></div>
          )}

          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid}
              style={{ width: '45%' }}
            >
              下一步
            </button>
          ) : (
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isStepValid || isSubmitting}
              style={{ width: '45%', backgroundColor: '#10b981' }}
            >
              {isSubmitting ? '儲存中...' : '確認送出'}
            </button>
          )}
        </div>
      </form>

      {/* 提交中的滿版遮罩與 Loading */}
      {isSubmitting && (
        <div className="submitting-overlay animate-fade-in">
          <div className="spinner"></div>
          <p>正在上傳檔案與儲存資料，請稍候...</p>
        </div>
      )}
    </div>
  );
}

export default Register;

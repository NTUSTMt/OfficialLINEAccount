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
  identityStatus: string;
  studentId: string;
  phone: string;
  email: string;
  realLineId: string;
  studentAddr: string;
  emerName: string;
  emerRel: string;
  emerPhone: string;
  emerAddr: string;
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
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewUser, setIsNewUser] = useState(true);
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    gender: '',
    birthday: '',
    idNumber: '',
    department: '',
    identityStatus: '',
    studentId: '',
    phone: '',
    email: '',
    realLineId: '',
    studentAddr: '',
    emerName: '',
    emerRel: '',
    emerPhone: '',
    emerAddr: '',
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
          // 預帶 LINE ID
          setFormData((prev) => ({ ...prev, realLineId: profile.displayName }));
        }

        // 2. 向 GAS 查詢現有社員資料
        if (userId && userId !== 'TEST_USER_ID') {
          const res = await fetch(`${GAS_API_URL}?action=get_profile&userId=${userId}`);
          const result = await res.json();
          if (result.status === 'success' && result.isMember && result.profile) {
            setIsNewUser(false);
            const p = result.profile;
            
            // 安全解析生日字串，避免 typeof/Invalid Date 造成 toISOString 崩潰或白屏
            let birthdayStr = '';
            if (p.birthday) {
              const cleanBirthday = String(p.birthday).replace(/\//g, '-');
              const d = new Date(cleanBirthday);
              if (!isNaN(d.getTime())) {
                birthdayStr = d.toISOString().split('T')[0];
              } else {
                birthdayStr = cleanBirthday.substring(0, 10);
              }
            }

            setFormData({
              name: p.name ? String(p.name) : '',
              gender: p.gender ? String(p.gender) : '',
              birthday: birthdayStr,
              idNumber: p.idNumber ? String(p.idNumber) : '',
              department: p.department ? String(p.department) : '',
              identityStatus: p.identityStatus ? String(p.identityStatus) : 
                (p.department === '臺科大在校學生' || p.department === '畢業校友' || p.department === '校外人士' ? p.department : '臺科大在校學生'),
              studentId: p.studentId ? String(p.studentId) : '',
              phone: p.phone ? String(p.phone) : '',
              email: p.email ? String(p.email) : '',
              realLineId: p.realLineId ? String(p.realLineId) : '',
              studentAddr: p.studentAddr ? String(p.studentAddr) : '',
              emerName: p.emerName ? String(p.emerName) : '',
              emerRel: p.emerRel ? String(p.emerRel) : '',
              emerPhone: p.emerPhone ? String(p.emerPhone) : '',
              emerAddr: p.emerAddr ? String(p.emerAddr) : '',
              medicalHistory: p.medicalHistory ? String(p.medicalHistory) : '',
              exp: p.exp ? String(p.exp) : '',
              strength: p.strength ? String(p.strength) : '',
              strengthProof: p.strengthProof ? String(p.strengthProof) : '',
            });
            setPrivacyAgreed(true);
          }
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

  // 處理檔案讀取並在前端自動壓縮為 JPEG Base64 (最大 1024px, 品質 0.7)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('檔案大小不能超過 10MB！');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 1024;
        const maxHeight = 1024;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          alert('圖片解析失敗！');
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // 壓縮為 0.7 品質的 JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.7);

        // 將原檔名副檔名統一規格化為 .jpg
        const nameParts = file.name.split('.');
        nameParts[nameParts.length - 1] = 'jpg';
        const newName = nameParts.join('.');

        setStrengthProofFile({ base64, name: newName });
      };
      img.onerror = () => {
        alert('載入圖片失敗，請嘗試更換圖片檔案！');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      alert('讀取檔案失敗！');
    };
    reader.readAsDataURL(file);
  };

  // 驗證各步驟欄位
  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        // 姓名 (name)、身分狀態 (identityStatus)、系所 (department)、學號 (studentId)、手機 (phone)、Email (email)、LINE ID (realLineId) 均為必填
        return (
          formData.name.trim() !== '' &&
          formData.identityStatus.trim() !== '' &&
          formData.department.trim() !== '' &&
          formData.studentId.trim() !== '' &&
          formData.phone.trim() !== '' &&
          formData.email.trim() !== '' &&
          formData.realLineId.trim() !== ''
        );
      case 2:
        // 步驟 2 皆為選填欄位
        return true;
      case 3:
        // 緊急聯絡人資訊為選填
        return true;
      case 4:
        // 隱私權同意書為必填
        return privacyAgreed;
      default:
        return false;
    }
  }, [step, formData, privacyAgreed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 防呆：若在 1~3 步按下鍵盤的 Enter/Go 鍵，應引導至下一步，而非直接送出表單
    if (step < 4) {
      if (isStepValid) {
        setStep(step + 1);
      }
      return;
    }

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
        headers: { 'Content-Type': 'text/plain' },
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

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>載入個人資料中，請稍候...</p>
      </div>
    );
  }

  return (
    <div className="register-container animate-fade-in">

      {/* 步驟進度條 */}
      <div className="step-progress-bar">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`step-dot-wrapper ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}>
            <div className="step-dot">{s}</div>
            <span className="step-label">
              {s === 1 ? '必填' : s === 2 ? '基本' : s === 3 ? '安全' : '經驗'}
            </span>
          </div>
        ))}
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${((step - 1) / 3) * 100}%` }}></div>
        </div>
      </div>

      {/* 表單主體 */}
      <form onSubmit={handleSubmit} className="register-form-card">
        {/* 步驟 1: 主要必填資料 */}
        {step === 1 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍主要必填資料 (Required Info)</h2>
            
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
              <label className="required">身分狀態</label>
              <select
                name="identityStatus"
                value={formData.identityStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    identityStatus: val,
                    // 切換身分時，若非在校生可預填無
                    studentId: val === '臺科大在校學生' ? prev.studentId : '無',
                  }));
                }}
                required
              >
                <option value="">請選擇身分狀態</option>
                <option value="臺科大在校學生">臺科大在校學生</option>
                <option value="畢業校友">畢業校友</option>
                <option value="校外人士">校外人士</option>
              </select>
            </div>

            <div className="form-group">
              <label className="required">在校系所 / 校外單位</label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder="例如：電機系四乙 / 臺大電機 / XX公司"
                required
              />
            </div>

            <div className="form-group">
              <label className="required">學號（校外填：無）</label>
              <input
                type="text"
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                placeholder="請輸入學號"
                required
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

        {/* 步驟 2: 基本選填資料 */}
        {step === 2 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍基本選填資料 (Basic Info)</h2>

            <div className="form-group">
              <label>性別</label>
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">請選擇性別 (山屋床位安排依據)</option>
                <option value="男">男 (Male)</option>
                <option value="女">女 (Female)</option>
              </select>
            </div>

            <div className="form-group">
              <label>生日</label>
              <input
                type="date"
                name="birthday"
                value={formData.birthday ? formData.birthday.substring(0, 10) : ''}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>身分證字號 / 護照號碼</label>
              <input
                type="text"
                name="idNumber"
                value={formData.idNumber}
                onChange={handleChange}
                placeholder="辦理入山與平安保險"
              />
            </div>

            <div className="form-group">
              <label>聯絡地址 (Correspondence Address)</label>
              <input
                type="text"
                name="studentAddr"
                value={formData.studentAddr}
                onChange={handleChange}
                placeholder="請輸入聯絡或現居地址"
              />
            </div>
          </div>
        )}

        {/* 步驟 3: 留守與安全資訊 */}
        {step === 3 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">📍緊急聯絡人資訊 (Safety & Emergency) ⚠️</h2>

            <div className="form-group">
              <label>緊急聯絡人姓名</label>
              <input
                type="text"
                name="emerName"
                value={formData.emerName}
                onChange={handleChange}
                placeholder="家屬或親友姓名"
              />
            </div>

            <div className="form-group">
              <label>與緊急聯絡人關係</label>
              <input
                type="text"
                name="emerRel"
                value={formData.emerRel}
                onChange={handleChange}
                placeholder="例如：父母、配偶、兄弟姊妹"
              />
            </div>

            <div className="form-group">
              <label>緊急聯絡人電話</label>
              <input
                type="tel"
                name="emerPhone"
                value={formData.emerPhone}
                onChange={handleChange}
                placeholder="出隊期間留守聯絡電話"
              />
            </div>

            <div className="form-group">
              <label>緊急聯絡人地址 (Emergency Address)</label>
              <input
                type="text"
                name="emerAddr"
                value={formData.emerAddr}
                onChange={handleChange}
                placeholder="請輸入緊急聯絡人居住地址"
              />
            </div>

            <div className="form-group">
              <label>個人特殊病史或過敏</label>
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
            <h2 className="step-title">📍登山經驗與體能 (Experience & Upload)</h2>

            <div className="form-group">
              <label>過往登山經驗簡述</label>
              <textarea
                name="exp"
                value={formData.exp}
                onChange={handleChange}
                placeholder="例如：登頂合歡群峰、玉山主峰、嘉明湖，或百岳累積 5 座等。"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>體能證明 (Proof of Physical Fitness)</label>
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
              <label>上傳體能證明 (Upload Proof of Physical Fitness)</label>
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
                  <span style={{ color: '#ef4444', marginLeft: '4px', fontWeight: 'bold' }}>*</span>
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

          {step < 4 && (
            <button
              key="btn-next"
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid}
              style={{ width: '45%' }}
            >
              下一步
            </button>
          )}
          {step === 4 && (
            <button
              key="btn-submit"
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

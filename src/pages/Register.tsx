import React, { useState, useEffect, useMemo } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
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
  intendOfficial: string;
  intendOfficer: string;
}

interface UploadedFile {
  base64: string;
  name: string;
}

function Register({ userId }: { userId: string }) {
  const { t } = useTranslation();
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
    intendOfficial: '',
    intendOfficer: '',
  });

  // 上傳檔案狀態
  const [strengthProofFiles, setStrengthProofFiles] = useState<UploadedFile[]>([]);

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
              intendOfficial: p.intendOfficial ? String(p.intendOfficial) : '',
              intendOfficer: p.intendOfficer ? String(p.intendOfficer) : '',
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

    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.async = true;
    document.body.appendChild(script);

    fetchProfileData();
  }, [userId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 處理多個檔案讀取並在前端自動壓縮為 JPEG Base64 (最大 1024px, 品質 0.7)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingLimit = 5 - strengthProofFiles.length;
    if (files.length > remainingLimit) {
      alert(t('register.alert.maxFiles', { limit: remainingLimit }));
      e.target.value = '';
      return;
    }

    const fileList = Array.from(files);
    const newFiles: UploadedFile[] = [];
    let processedCount = 0;

    fileList.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        alert(t('register.alert.fileTooLarge', { name: file.name }));
        processedCount++;
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
            alert(t('register.alert.imageParseError'));
            processedCount++;
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          // 壓縮為 0.7 品質的 JPEG
          const base64 = canvas.toDataURL('image/jpeg', 0.7);

          // 將原檔名副檔名統一規格化為 .jpg
          const nameParts = file.name.split('.');
          nameParts[nameParts.length - 1] = 'jpg';
          const newName = nameParts.join('.');

          newFiles.push({ base64, name: newName });
          processedCount++;

          if (processedCount === fileList.length) {
            setStrengthProofFiles((prev) => [...prev, ...newFiles]);
          }
        };
        img.onerror = () => {
          alert(t('register.alert.imageLoadError', { name: file.name }));
          processedCount++;
          if (processedCount === fileList.length) {
            setStrengthProofFiles((prev) => [...prev, ...newFiles]);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert(t('register.alert.fileReadError', { name: file.name }));
        processedCount++;
        if (processedCount === fileList.length) {
          setStrengthProofFiles((prev) => [...prev, ...newFiles]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
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
        // 隱私權同意書與加入社員意願均為必填
        return privacyAgreed && formData.intendOfficial.trim() !== '';
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
        strengthProofFiles: strengthProofFiles.length > 0 ? strengthProofFiles : null,
      };

      const res = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (result.status === 'success') {
        alert(isNewUser ? t('register.alert.registerSuccess') : t('register.alert.updateSuccess'));
        if (liff.isInClient()) {
          liff.closeWindow();
        }
      } else {
        alert(t('register.alert.saveFailed', { message: result.message || t('register.alert.contactAdmin') }));
      }
    } catch (err) {
      console.error('提交表單失敗:', err);
      alert(t('register.alert.networkError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state" style={{ minHeight: '80vh', justifyContent: 'center' }}>
        <div className="spinner"></div>
        <p>{t('register.loading')}</p>
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
              {s === 1 ? t('register.steps.required') : s === 2 ? t('register.steps.basic') : s === 3 ? t('register.steps.safety') : t('register.steps.experience')}
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
            <h2 className="step-title">{t('register.step1.title')}</h2>
            
            <div className="form-group">
              <label className="required">{t('register.step1.nameLabel')}</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder={t('register.step1.namePlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.identityStatusLabel')}</label>
              <select
                name="identityStatus"
                value={formData.identityStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    identityStatus: val,
                    // 切換身分時，若非在校生可預填無
                    studentId: val === '臺科大在校學生' ? prev.studentId : '無 N/A',
                  }));
                }}
                required
              >
                <option value="">{t('register.step1.identityStatusDefault')}</option>
                <option value="臺科大在校學生">{t('register.step1.identityStudent')}</option>
                <option value="畢業校友">{t('register.step1.identityAlumni')}</option>
                <option value="校外人士">{t('register.step1.identityExternal')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.departmentLabel')}</label>
              <input
                type="text"
                name="department"
                value={formData.department}
                onChange={handleChange}
                placeholder={t('register.step1.departmentPlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.studentIdLabel')}</label>
              <input
                type="text"
                name="studentId"
                value={formData.studentId}
                onChange={handleChange}
                placeholder={t('register.step1.studentIdPlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.phoneLabel')}</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder={t('register.step1.phonePlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.emailLabel')}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder={t('register.step1.emailPlaceholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.lineIdLabel')}</label>
              <input
                type="text"
                name="realLineId"
                value={formData.realLineId}
                onChange={handleChange}
                placeholder={t('register.step1.lineIdPlaceholder')}
                required
              />
            </div>
          </div>
        )}

        {/* 步驟 2: 基本選填資料 */}
        {step === 2 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step2.title')}</h2>

            <div className="form-group">
              <label>{t('register.step2.genderLabel')}</label>
              <select name="gender" value={formData.gender} onChange={handleChange}>
                <option value="">{t('register.step2.genderPlaceholder')}</option>
                <option value="男">{t('register.step2.genderMale')}</option>
                <option value="女">{t('register.step2.genderFemale')}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t('register.step2.birthdayLabel')}</label>
              <input
                type="date"
                name="birthday"
                value={formData.birthday ? formData.birthday.substring(0, 10) : ''}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step2.idNumberLabel')}</label>
              <input
                type="text"
                name="idNumber"
                value={formData.idNumber}
                onChange={handleChange}
                placeholder={t('register.step2.idNumberPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step2.addressLabel')}</label>
              <input
                type="text"
                name="studentAddr"
                value={formData.studentAddr}
                onChange={handleChange}
                placeholder={t('register.step2.addressPlaceholder')}
              />
            </div>
          </div>
        )}

        {/* 步驟 3: 留守與安全資訊 */}
        {step === 3 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step3.title')}</h2>

            <div className="form-group">
              <label>{t('register.step3.emerNameLabel')}</label>
              <input
                type="text"
                name="emerName"
                value={formData.emerName}
                onChange={handleChange}
                placeholder={t('register.step3.emerNamePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step3.emerRelLabel')}</label>
              <input
                type="text"
                name="emerRel"
                value={formData.emerRel}
                onChange={handleChange}
                placeholder={t('register.step3.emerRelPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step3.emerPhoneLabel')}</label>
              <input
                type="tel"
                name="emerPhone"
                value={formData.emerPhone}
                onChange={handleChange}
                placeholder={t('register.step3.emerPhonePlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step3.emerAddrLabel')}</label>
              <input
                type="text"
                name="emerAddr"
                value={formData.emerAddr}
                onChange={handleChange}
                placeholder={t('register.step3.emerAddrPlaceholder')}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step3.medicalHistoryLabel')}</label>
              <textarea
                name="medicalHistory"
                value={formData.medicalHistory}
                onChange={handleChange}
                placeholder={t('register.step3.medicalHistoryPlaceholder')}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* 步驟 4: 登山經驗與體能證明 */}
        {step === 4 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step4.title')}</h2>

            <div className="form-group">
              <label>{t('register.step4.expLabel')}</label>
              <textarea
                name="exp"
                value={formData.exp}
                onChange={handleChange}
                placeholder={t('register.step4.expPlaceholder')}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>{t('register.step4.strengthLabel')}</label>
              <input
                type="text"
                name="strength"
                value={formData.strength}
                onChange={handleChange}
                placeholder={t('register.step4.strengthPlaceholder')}
              />
            </div>

            {/* 上傳體能證明 */}
            <div className="form-group">
              <label>{t('register.step4.uploadProofLabel')}</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="file-input"
                disabled={strengthProofFiles.length >= 5}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                {t('register.step4.uploadTip')}
              </p>

              {/* 顯示目前選取的待上傳檔案 */}
              {strengthProofFiles.length > 0 && (
                <div className="selected-files-list" style={{ marginTop: '8px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
                    {t('register.step4.selectedFiles', { count: strengthProofFiles.length })}
                  </p>
                  {strengthProofFiles.map((file, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f3f4f6', padding: '6px 12px', borderRadius: '4px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#374151', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        ✓ {file.name}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setStrengthProofFiles(prev => prev.filter((_, i) => i !== idx))}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                      >
                        {t('register.step4.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 顯示已上傳的舊檔案連結 */}
              {formData.strengthProof && formData.strengthProof.trim() !== '' && (
                <div className="existing-files-list" style={{ marginTop: '12px' }}>
                  <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{t('register.step4.uploadedFiles')}</p>
                  {formData.strengthProof.split(',').map((url, idx) => {
                    const cleanUrl = url.trim();
                    if (!cleanUrl.startsWith('http')) return null;
                    return (
                      <p key={idx} className="file-link" style={{ margin: '4px 0' }}>
                        <a href={cleanUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px' }}>
                          {t('register.step4.viewUploaded', { num: idx + 1 })}
                        </a>
                      </p>
                    );
                  })}
                </div>
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
                  {t('register.step4.privacyConsent')}
                  <span style={{ color: '#ef4444', marginLeft: '4px', fontWeight: 'bold' }}>*</span>
                </span>
              </label>
            </div>

            {/* 意願調查 */}
            <div className="willingness-box" style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', textAlign: 'left' }}>
              <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                {t('register.step4.intendOfficialTitle')} <span style={{ color: '#ef4444' }}>*</span>
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <input
                    type="radio"
                    name="intendOfficial"
                    value="我有意願成為社員"
                    checked={formData.intendOfficial === '我有意願成為社員'}
                    onChange={handleChange}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span>{t('register.step4.intendOfficialYes')}</span>
                </label>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <input
                    type="radio"
                    name="intendOfficial"
                    value="我目前沒有意願成為社員"
                    checked={formData.intendOfficial === '我目前沒有意願成為社員'}
                    onChange={handleChange}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span>{t('register.step4.intendOfficialNo')}</span>
                </label>
              </div>

              <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                {t('register.step4.intendOfficerTitle')}
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  name="intendOfficer"
                  value="我有意願成為社團幹部"
                  checked={formData.intendOfficer === '我有意願成為社團幹部'}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData(prev => ({ ...prev, intendOfficer: checked ? '我有意願成為社團幹部' : '' }));
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span>{t('register.step4.intendOfficerCheckbox')}</span>
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
              {t('register.nav.prev')}
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
              {t('register.nav.next')}
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
              {isSubmitting ? t('register.nav.saving') : t('register.nav.submit')}
            </button>
          )}
        </div>
      </form>

      {/* 提交中的滿版遮罩與 Loading */}
      {isSubmitting && (
        <div className="submitting-overlay animate-fade-in">
          <div className="spinner"></div>
          <p>{t('register.submitting')}</p>
        </div>
      )}
    </div>
  );
}

export default Register;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import liff from '@line/liff';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Info, Plus, X } from 'lucide-react';
import { appendAuthToken, withAuthPayload } from '../utils/api';
import { getDirectImageUrl } from '../utils/image';
import { GAS_API_URL } from '../constants/api';
import { fetchMemberProfileFromSupabase, saveMemberProfileToSupabase } from '../utils/supabaseClient';
import { NATIONALITY_LIST } from '../constants/nationalities';
import { SystemGuideModal } from '../components/common/SystemGuideModal';
import '../App.css';

interface ProfileData {
  name: string;
  gender: string;
  nationality?: string;
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
  wantToSay?: string;
  preferredLanguage?: string;
  avatarUrl?: string;
}

interface UploadedFile {
  base64: string;
  name: string;
}

interface DiffFieldItem {
  label: string;
  oldVal?: string;
  newVal: string;
}

function buildProfileDiffFlex(
  isNew: boolean,
  memberName: string,
  items: DiffFieldItem[]
) {
  const displayItems = items.slice(0, 12);
  const remainingCount = items.length - displayItems.length;
  const bodyContents: any[] = [];

  if (displayItems.length === 0 && !isNew) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f3f4f6',
      cornerRadius: '6px',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: '資料未有變更，與既有個人檔案完全相符',
          size: 'xs',
          color: '#6b7280',
          align: 'center'
        }
      ]
    });
  } else {
    displayItems.forEach((item) => {
      const diffRows: any[] = [];
      if (!isNew && item.oldVal !== undefined) {
        diffRows.push({
          type: 'box',
          layout: 'horizontal',
          backgroundColor: '#fee2e2',
          cornerRadius: '4px',
          paddingStart: '6px',
          paddingEnd: '6px',
          paddingTop: '3px',
          paddingBottom: '3px',
          contents: [
            {
              type: 'text',
              text: `- ${item.oldVal}`,
              size: 'xs',
              color: '#b91c1c',
              wrap: true
            }
          ]
        });
      }
      diffRows.push({
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#dcfce7',
        cornerRadius: '4px',
        paddingStart: '6px',
        paddingEnd: '6px',
        paddingTop: '3px',
        paddingBottom: '3px',
        margin: (!isNew && item.oldVal !== undefined) ? 'xs' : 'none',
        contents: [
          {
            type: 'text',
            text: `+ ${item.newVal}`,
            size: 'xs',
            color: '#15803d',
            weight: 'bold',
            wrap: true
          }
        ]
      });

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#f9fafb',
        cornerRadius: '6px',
        paddingAll: '8px',
        margin: 'md',
        contents: [
          {
            type: 'text',
            text: item.label,
            size: 'xs',
            color: '#4b5563',
            weight: 'bold'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'xs',
            contents: diffRows
          }
        ]
      });
    });

    if (remainingCount > 0) {
      bodyContents.push({
        type: 'text',
        text: `... 尚有其餘 ${remainingCount} 項欄位異動`,
        size: 'xxs',
        color: '#9ca3af',
        align: 'center',
        margin: 'md'
      });
    }
  }

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#065f46',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: isNew ? '新社員基本資料登記' : '個人資料異動紀錄',
          weight: 'bold',
          color: '#ffffff',
          size: 'md'
        },
        {
          type: 'text',
          text: `${memberName || '社員'} • ${isNew ? '歡迎加入台科登山社' : '欄位變更比對 (Diff)'}`,
          color: '#a7f3d0',
          size: 'xs',
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#ffffff',
      paddingAll: '14px',
      contents: bodyContents
    }
  };
}

function Register({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewUser, setIsNewUser] = useState(true);
  const [isCustomNationality, setIsCustomNationality] = useState(false);
  const [formData, setFormData] = useState<ProfileData>({
    name: '',
    gender: '',
    nationality: '',
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
    wantToSay: '',
    preferredLanguage: 'zh',
    avatarUrl: ''
  });

  // 上傳檔案狀態
  const [strengthProofFiles, setStrengthProofFiles] = useState<UploadedFile[]>([]);
  // 記錄待刪除的舊 Drive 檔案 (機制 B)
  const [deletedProofUrls, setDeletedProofUrls] = useState<string[]>([]);
  // 點選縮圖時燈箱預覽大圖
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  // 隱藏的 input file ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 社員系統使用指南導覽燈箱狀態
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // 首次進入填寫資料頁面時，若尚未看過系統導覽則自動彈出
  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem('has_seen_member_system_guide');
      if (!hasSeen) {
        setIsGuideOpen(true);
      }
    } catch (e) {
      console.warn('[Register] 讀取導覽紀錄例外:', e);
    }
  }, []);

  // 解析歷史已儲存的體能證明照片 URL 清單
  const historicalProofUrls = useMemo(() => {
    if (!formData.strengthProof || !formData.strengthProof.trim()) return [];
    return formData.strengthProof
      .split(/[\n,，;\s]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'))
      .filter((u, idx, arr) => arr.indexOf(u) === idx);
  }, [formData.strengthProof]);

  // 目前所有照片總數 (歷史 + 新選取)
  const totalProofsCount = historicalProofUrls.length + strengthProofFiles.length;

  // 隱私權同意書勾選
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  // 草稿暫存與還原狀態
  const [hasDraftRestored, setHasDraftRestored] = useState(false);
  const isInitialLoadDone = useRef(false);

  // 記錄初始幹部意願，精確判定是否由「無」轉「有」才推播
  const [initialOfficerIntent, setInitialOfficerIntent] = useState<string>('');
  // 記錄初始表單資料，用於精確比對本次更新異動欄位 (避免推播顯示未修改項目)
  const [originalFormData, setOriginalFormData] = useState<ProfileData | null>(null);

  // 載入 LINE Profile 與 Supabase/GAS 社員資料
  useEffect(() => {
    const fetchProfileData = async () => {
      setLoading(true);
      let memberFound = false;
      try {
        let lineDisplayName = '';
        let linePictureUrl = '';
        // 1. 取得 LINE Profile
        if (liff.isLoggedIn()) {
          try {
            const profile = await liff.getProfile();
            lineDisplayName = profile.displayName || '';
            linePictureUrl = profile.pictureUrl || '';
            // 預帶 LINE ID 與頭像
            setFormData((prev) => ({
              ...prev,
              realLineId: prev.realLineId || lineDisplayName,
              avatarUrl: prev.avatarUrl || linePictureUrl
            }));
          } catch (e) {
            console.warn('LIFF 取得 Profile 失敗:', e);
          }
        }

        // 2. 優先向 Supabase 查詢現有社員資料 (延遲 < 50ms)
        if (userId && userId !== 'TEST_USER_ID') {
          const sbProfile = await fetchMemberProfileFromSupabase(userId);
          if (sbProfile && (sbProfile.name || sbProfile.studentId || sbProfile.phone)) {
            memberFound = true;
            setIsNewUser(false);
            const loadedData: ProfileData = {
              ...sbProfile,
              realLineId: sbProfile.realLineId || lineDisplayName,
              avatarUrl: sbProfile.avatarUrl || linePictureUrl,
            };
            setFormData((prev) => ({
              ...prev,
              ...loadedData,
            }));
            setOriginalFormData(loadedData);
            setInitialOfficerIntent(sbProfile.intendOfficer ? String(sbProfile.intendOfficer) : '');
            if (sbProfile.nationality) {
              const clean = sbProfile.nationality.trim();
              const matchedItem = NATIONALITY_LIST.find(
                (item) => item.zh === clean || item.en.toLowerCase() === clean.toLowerCase() || item.label === clean || item.native === clean
              );
              if (matchedItem) {
                setIsCustomNationality(false);
                setFormData((prev) => ({ ...prev, nationality: matchedItem.zh }));
              } else {
                setIsCustomNationality(true);
              }
            }
            setPrivacyAgreed(true);
          } else {
            // Supabase 尚未有紀錄或連線失敗，向 GAS 查詢現有社員資料 fallback
            const res = await fetch(appendAuthToken(`${GAS_API_URL}?action=get_profile&userId=${userId}`), { cache: 'no-store' });
            const result = await res.json();
            if (result.status === 'success' && result.isMember && result.profile) {
              memberFound = true;
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

              const loadedData: ProfileData = {
                name: p.name ? String(p.name) : '',
                gender: p.gender ? String(p.gender) : '',
                nationality: p.nationality ? String(p.nationality) : '',
                birthday: birthdayStr,
                idNumber: p.idNumber ? String(p.idNumber) : '',
                department: p.department ? String(p.department) : '',
                identityStatus: p.identityStatus ? String(p.identityStatus) : 
                  (p.department === '臺科大在校學生' || p.department === '畢業校友' || p.department === '校外人士' ? p.department : '臺科大在校學生'),
                studentId: p.studentId ? String(p.studentId) : '',
                phone: p.phone ? String(p.phone) : '',
                email: p.email ? String(p.email) : '',
                realLineId: p.realLineId ? String(p.realLineId) : (lineDisplayName || ''),
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
                wantToSay: p.wantToSay ? String(p.wantToSay) : '',
                preferredLanguage: p.preferredLanguage || (p as any).preferred_language || 'zh',
              };

              setFormData(loadedData);
              setOriginalFormData(loadedData);
              const loadedIntent = p.intendOfficer ? String(p.intendOfficer) : '';
              setInitialOfficerIntent(loadedIntent);
              setPrivacyAgreed(true);
            }
          }
        }

        // 3. 若為新註冊或尚未有線上會員紀錄，檢查是否有本機草稿可自動還原
        if (!memberFound) {
          const draftKey = 'register_draft_' + (userId || 'guest');
          const savedDraft = localStorage.getItem(draftKey);
          if (savedDraft) {
            try {
              const parsed = JSON.parse(savedDraft);
              if (parsed && typeof parsed === 'object') {
                const hasDraftData = Object.values(parsed).some(v => typeof v === 'string' && v.trim() !== '');
                if (hasDraftData) {
                  setFormData(prev => ({ ...prev, ...parsed }));
                  setHasDraftRestored(true);
                }
              }
            } catch (e) {
              console.error('解析草稿失敗:', e);
            }
          }
        }
      } catch (err) {
        console.error('載入個人資料失敗:', err);
      } finally {
        setLoading(false);
        isInitialLoadDone.current = true;
      }
    };

    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.async = true;
    document.body.appendChild(script);

    fetchProfileData();
  }, [userId]);

  // 自動暫存表單草稿至 localStorage
  useEffect(() => {
    if (!isInitialLoadDone.current || loading || isSubmitting) return;
    try {
      const draftKey = 'register_draft_' + (userId || 'guest');
      const hasContent = Object.values(formData).some(v => typeof v === 'string' && v.trim() !== '');
      if (hasContent) {
        localStorage.setItem(draftKey, JSON.stringify(formData));
      }
    } catch (e) {
      console.warn('暫存草稿失敗:', e);
    }
  }, [formData, userId, loading, isSubmitting]);

  // 切換步驟時自動平滑滾動至頁面頂端
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // 清除草稿重設表單
  const clearDraft = () => {
    const draftKey = 'register_draft_' + (userId || 'guest');
    localStorage.removeItem(draftKey);
    setHasDraftRestored(false);
    setFormData({
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
      wantToSay: '',
      preferredLanguage: 'zh',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 處理多個檔案讀取並在前端自動壓縮為 JPEG Base64 (最大 2048px, 品質 0.88)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingLimit = 5 - (historicalProofUrls.length + strengthProofFiles.length);
    if (remainingLimit <= 0) {
      alert(t('register.step4.maxProofTip'));
      e.target.value = '';
      return;
    }
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
          const maxWidth = 2048;
          const maxHeight = 2048;

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
          // 壓縮為 0.88 高清品質的 JPEG (2K 視覺無損)
          const base64 = canvas.toDataURL('image/jpeg', 0.88);

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

  // 刪除歷史已上傳照片 (二次確認 + 加入待刪除清單機制 B)
  const handleRemoveHistoricalProof = (urlToRemove: string) => {
    if (!window.confirm(t('register.step4.deleteConfirm'))) return;
    const remaining = historicalProofUrls.filter((u) => u !== urlToRemove);
    setFormData((prev) => ({
      ...prev,
      strengthProof: remaining.join('\n')
    }));
    setDeletedProofUrls((prev) => (prev.includes(urlToRemove) ? prev : [...prev, urlToRemove]));
  };

  // 刪除新選取的待上傳照片 (二次確認)
  const handleRemoveNewFile = (idxToRemove: number) => {
    if (!window.confirm(t('register.step4.deleteConfirm'))) return;
    setStrengthProofFiles((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  // 驗證各步驟欄位
  const isStepValid = useMemo(() => {
    switch (step) {
      case 1:
        // 姓名 (name)、國籍 (nationality)、身分狀態 (identityStatus)、系所 (department)、學號 (studentId)、手機 (phone)、Email (email)、LINE ID (realLineId)、偏好語言 (preferredLanguage) 均為必填
        return (
          formData.name.trim() !== '' &&
          Boolean(formData.nationality && formData.nationality.trim() !== '') &&
          formData.identityStatus.trim() !== '' &&
          formData.department.trim() !== '' &&
          formData.studentId.trim() !== '' &&
          formData.phone.trim() !== '' &&
          formData.email.trim() !== '' &&
          formData.realLineId.trim() !== '' &&
          Boolean(formData.preferredLanguage && formData.preferredLanguage.trim() !== '')
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

    const isStep1Complete = Boolean(
      formData.name.trim() !== '' &&
      Boolean(formData.nationality && formData.nationality.trim() !== '') &&
      formData.identityStatus.trim() !== '' &&
      formData.department.trim() !== '' &&
      formData.studentId.trim() !== '' &&
      formData.phone.trim() !== '' &&
      formData.email.trim() !== '' &&
      formData.realLineId.trim() !== '' &&
      Boolean(formData.preferredLanguage && formData.preferredLanguage.trim() !== '')
    );

    if (!isStep1Complete) {
      setStep(1);
      alert(t('register.alert.fillRequiredFields', '請先完成第一步驟的必填欄位！'));
      return;
    }

    if (!isStepValid) return;

    setIsSubmitting(true);
    let sbSaved = false;
    let flexPayload: any = null;
    try {
      let finalFormData = { ...formData };

      // 1. 若有新上傳的體能證明照片，呼叫輕量 Helper 上傳 Drive 取得連結 (採單張發送防範大 Payload 逾時)
      if (strengthProofFiles.length > 0) {
        try {
          const uploadedUrls: string[] = [];
          for (const proofFile of strengthProofFiles) {
            const uploadRes = await fetch(GAS_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify(withAuthPayload({
                action: 'upload_drive_file',
                userId: userId || 'TEST_USER_ID',
                folderType: 'proofs',
                files: [proofFile]
              }))
            });
            const uploadResult = await uploadRes.json();
            if (uploadResult.status === 'success' && Array.isArray(uploadResult.urls) && uploadResult.urls.length > 0) {
              uploadedUrls.push(...uploadResult.urls);
            } else {
              throw new Error(uploadResult.message || uploadResult.error || 'Google Drive 照片上傳未回傳有效連結');
            }
          }
          if (uploadedUrls.length > 0) {
            const combinedProofs = [finalFormData.strengthProof, ...uploadedUrls]
              .filter(Boolean)
              .join('\n');
            finalFormData.strengthProof = combinedProofs;
          }
        } catch (uploadErr: any) {
          console.error('[Register] 上傳體能證明照失敗:', uploadErr);
          alert(`上傳體能證明照失敗: ${uploadErr?.message || uploadErr}`);
          setIsSubmitting(false);
          return;
        }
      }

      // 1.1 若有標記刪除的舊 Drive 檔案，在背景非同步發送給 GAS 移入垃圾桶 (不阻塞主流程，自己慢慢刪除)
      if (deletedProofUrls.length > 0) {
        fetch(GAS_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(withAuthPayload({
            action: 'delete_drive_files',
            userId: userId || 'TEST_USER_ID',
            urls: deletedProofUrls
          }))
        }).catch((delErr) => {
          console.warn('[Register] 背景刪除 Drive 檔案略過 (不影響儲存流程):', delErr);
        });
      }

      // 2. ⚡ 100% 直寫 Supabase (< 50ms，以安全 RPC 限制本人存取，DB Triggers 自動排入 sync_queue)
      let saveRes: { success: boolean; message?: string } = { success: false };
      if (userId && userId !== 'TEST_USER_ID') {
        saveRes = await saveMemberProfileToSupabase(userId, finalFormData);
        sbSaved = saveRes.success;
      } else {
        sbSaved = true;
        saveRes = { success: true };
      }

      const diffItems: DiffFieldItem[] = [];
      const maskId = (v: string) => (v.length > 5 ? v.substring(0, 3) + '****' + v.substring(v.length - 2) : '******');

      if (isNewUser) {
        if (finalFormData.name) diffItems.push({ label: '姓名 / Name', newVal: finalFormData.name });
        if (finalFormData.department || finalFormData.studentId) {
          diffItems.push({ label: '系所學號 / Dept & ID', newVal: `${finalFormData.department || ''} (${finalFormData.studentId || ''})`.trim() });
        }
        if (finalFormData.phone) diffItems.push({ label: '聯絡電話 / Phone', newVal: finalFormData.phone });
        if (finalFormData.emerName) {
          diffItems.push({ label: '緊急聯絡人 / Contact', newVal: `${finalFormData.emerName} (${finalFormData.emerRel || ''})`.trim() });
        }
        if (finalFormData.intendOfficial) diffItems.push({ label: '入社意願 / Intent', newVal: finalFormData.intendOfficial });
      } else if (originalFormData) {
        const norm = (v?: string) => (v || '').trim();
        const checkField = (key: keyof ProfileData, label: string, isMask: boolean = false) => {
          const o = norm(originalFormData[key] as string);
          const n = norm(finalFormData[key] as string);
          if (o !== n) {
            diffItems.push({
              label,
              oldVal: isMask && o ? maskId(o) : (o || '(空值)'),
              newVal: isMask && n ? maskId(n) : (n || '(空值)')
            });
          }
        };

        checkField('name', '姓名 / Name');
        checkField('gender', '性別 / Gender');
        checkField('nationality', '國籍 / Nationality');
        checkField('birthday', '生日 / Birthday');
        checkField('idNumber', '身分證護照 / ID Number', true);
        checkField('department', '系所 / Department');
        checkField('studentId', '學號 / Student ID');
        checkField('phone', '聯絡電話 / Phone');
        checkField('email', '電子郵件 / Email');
        checkField('realLineId', 'LINE ID');
        checkField('studentAddr', '現居地址 / Address');
        checkField('emerName', '緊急聯絡人 / Emergency Contact');
        checkField('emerRel', '聯絡人關係 / Relationship');
        checkField('emerPhone', '緊急聯絡人電話 / Emer Phone');
        checkField('emerAddr', '緊急聯絡人地址 / Emer Address');
        checkField('medicalHistory', '特殊病史 / Medical History');
        checkField('exp', '登山經歷 / Experience');
        checkField('strength', '體能自評 / Fitness Level');
        checkField('intendOfficial', '入社意願 / Member Intent');
        checkField('intendOfficer', '幹部意願 / Officer Intent');
        checkField('wantToSay', '備註留言 / Notes');
        checkField('preferredLanguage', '偏好語言 / Language');
      }

      const changedFields: string[] = [];
      if (!isNewUser && originalFormData) {
        const norm = (v?: string) => (v || '').trim();
        if (norm(finalFormData.name) !== norm(originalFormData.name)) changedFields.push('name');
        if (norm(finalFormData.gender) !== norm(originalFormData.gender)) changedFields.push('gender');
        if (norm(finalFormData.nationality) !== norm(originalFormData.nationality)) changedFields.push('nationality');
        if (norm(finalFormData.birthday) !== norm(originalFormData.birthday)) changedFields.push('birthday');
        if (norm(finalFormData.idNumber) !== norm(originalFormData.idNumber)) changedFields.push('idNumber');
        if (
          norm(finalFormData.department) !== norm(originalFormData.department) ||
          norm(finalFormData.studentId) !== norm(originalFormData.studentId)
        ) {
          changedFields.push('department_studentId');
        }
        if (norm(finalFormData.identityStatus) !== norm(originalFormData.identityStatus)) changedFields.push('identityStatus');
        if (norm(finalFormData.phone) !== norm(originalFormData.phone)) changedFields.push('phone');
        if (norm(finalFormData.email) !== norm(originalFormData.email)) changedFields.push('email');
        if (norm(finalFormData.realLineId) !== norm(originalFormData.realLineId)) changedFields.push('realLineId');
        if (norm(finalFormData.studentAddr) !== norm(originalFormData.studentAddr)) changedFields.push('studentAddr');
        if (
          norm(finalFormData.emerName) !== norm(originalFormData.emerName) ||
          norm(finalFormData.emerRel) !== norm(originalFormData.emerRel)
        ) {
          changedFields.push('emergency_contact');
        }
        if (norm(finalFormData.emerPhone) !== norm(originalFormData.emerPhone)) changedFields.push('emerPhone');
        if (norm(finalFormData.emerAddr) !== norm(originalFormData.emerAddr)) changedFields.push('emerAddr');
        if (norm(finalFormData.medicalHistory) !== norm(originalFormData.medicalHistory)) changedFields.push('medicalHistory');
        if (norm(finalFormData.exp) !== norm(originalFormData.exp)) changedFields.push('exp');
        if (
          norm(finalFormData.strength) !== norm(originalFormData.strength) ||
          norm(finalFormData.strengthProof) !== norm(originalFormData.strengthProof) ||
          strengthProofFiles.length > 0
        ) {
          changedFields.push('strength');
        }
        if (norm(finalFormData.intendOfficial) !== norm(originalFormData.intendOfficial)) changedFields.push('intendOfficial');
        if (norm(finalFormData.intendOfficer) !== norm(originalFormData.intendOfficer)) changedFields.push('intendOfficer');
        if (norm(finalFormData.wantToSay) !== norm(originalFormData.wantToSay)) changedFields.push('wantToSay');
        if (norm(finalFormData.preferredLanguage) !== norm(originalFormData.preferredLanguage)) changedFields.push('preferredLanguage');
      }

      flexPayload = {
        type: 'flex',
        altText: isNewUser ? '我已完成個人資料填寫' : '我已更新個人資料 (Diff)',
        contents: buildProfileDiffFlex(isNewUser, finalFormData.name, diffItems)
      };

      if (sbSaved) {
        // ⚡ 3. 非同步發送 LINE 基本資料更新/註冊完成推播通知 (純訊息，不碰試算表)
        if (userId && userId !== 'TEST_USER_ID') {
          const isWilling = (val?: string) => {
            if (!val) return false;
            const lower = String(val).trim().toLowerCase();
            return lower !== '' && lower !== '無' && lower !== '無意願' && lower !== '否' && lower !== 'none' && lower !== 'no';
          };
          const wasWilling = isWilling(initialOfficerIntent);
          const isNowWilling = isWilling(finalFormData.intendOfficer);
          const isOfficerIntentNew = isNewUser
            ? isNowWilling
            : ((!wasWilling && isNowWilling) || (isNowWilling && (finalFormData.intendOfficer || '').trim() !== (originalFormData?.intendOfficer || '').trim()));

          // 確實等待 GAS 推播請求完成，避免隨後 liff.closeWindow() 銷毀 WebKit 中斷連線
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const notifyRes = await fetch(GAS_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              signal: controller.signal,
              body: JSON.stringify(withAuthPayload({
                action: 'notify_profile_saved',
                userId: userId,
                formData: finalFormData,
                isNewUser: isNewUser,
                isOfficerIntentNew: isOfficerIntentNew,
                previousOfficerIntent: initialOfficerIntent,
                changedFields: !isNewUser ? changedFields : undefined
              }))
            });
            clearTimeout(timeoutId);
            await notifyRes.json().catch(() => ({}));
          } catch (notifyErr: any) {
            console.warn('[Register] 推播通知發送例外 (不影響基本資料儲存):', notifyErr?.message || notifyErr);
          }
        }

        const draftKey = 'register_draft_' + (userId || 'guest');
        localStorage.removeItem(draftKey);
        setHasDraftRestored(false);
        setStrengthProofFiles([]);
        setDeletedProofUrls([]);
        setOriginalFormData(finalFormData);
        setFormData(finalFormData);

        // 儲存成功後依據偏好語言切換 LIFF 介面語系並持久化
        const chosenLang = finalFormData.preferredLanguage === 'en' ? 'en' : 'zh';
        try {
          localStorage.setItem('i18nextLng', chosenLang);
          localStorage.setItem('app_lang', chosenLang);
          localStorage.removeItem('app_lang_manual');
          i18n.changeLanguage(chosenLang);
        } catch (langErr) {
          console.warn('[Register] 切換介面語系例外:', langErr);
        }

        alert(isNewUser ? t('register.alert.registerSuccess') : t('register.alert.updateSuccess'));
        if (liff.isInClient()) {
          try {
            await liff.sendMessages([flexPayload]);
          } catch (sendErr: any) {
            const errMsg = sendErr?.message || (typeof sendErr === 'object' ? JSON.stringify(sendErr) : String(sendErr));
            alert(`LINE 訊息發送失敗: ${errMsg}\n若錯誤為權限問題 (403 / permission)，請確認 LINE Developers 後台該 LIFF ID 是否已勾選開啟 chat_message.write 權限。`);
          }
          liff.closeWindow();
        } else {
          alert('提醒：目前非 LINE App 內部環境，無法自動於聊天室發送異動卡片。');
        }
      } else {
        alert(t('register.alert.saveFailed', { message: saveRes.message || '資料庫未回傳具體錯誤' }));
      }
    } catch (err: any) {
      console.error('提交表單失敗:', err);
      if (sbSaved) {
        const draftKey = 'register_draft_' + (userId || 'guest');
        localStorage.removeItem(draftKey);
        setHasDraftRestored(false);

        const chosenLang = formData.preferredLanguage === 'en' ? 'en' : 'zh';
        try {
          localStorage.setItem('i18nextLng', chosenLang);
          localStorage.setItem('app_lang', chosenLang);
          localStorage.removeItem('app_lang_manual');
          i18n.changeLanguage(chosenLang);
        } catch (langErr) {
          console.warn('[Register] 切換介面語系例外:', langErr);
        }

        alert(isNewUser ? t('register.alert.registerSuccess') : t('register.alert.updateSuccess'));
        if (liff.isInClient()) {
          try {
            if (flexPayload) {
              await liff.sendMessages([flexPayload]);
            }
          } catch (sendErr: any) {
            const errMsg = sendErr?.message || (typeof sendErr === 'object' ? JSON.stringify(sendErr) : String(sendErr));
            alert(`LINE 訊息發送失敗: ${errMsg}\n若錯誤為權限問題 (403 / permission)，請確認 LINE Developers 後台該 LIFF ID 是否已勾選開啟 chat_message.write 權限。`);
          }
          liff.closeWindow();
        } else {
          alert('提醒：目前非 LINE App 內部環境，無法自動於聊天室發送異動卡片。');
        }
      } else {
        const detailMsg = err?.message || String(err);
        alert(`提交表單失敗: ${detailMsg}`);
      }
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
          <div
            key={s}
            className={`step-dot-wrapper ${step >= s ? 'active' : ''} ${step === s ? 'current' : ''}`}
            onClick={() => setStep(s)}
            role="button"
            tabIndex={0}
            title={s === 1 ? t('register.steps.required') : s === 2 ? t('register.steps.basic') : s === 3 ? t('register.steps.safety') : t('register.steps.experience')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStep(s);
              }
            }}
          >
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
        {hasDraftRestored && (
          <div style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #6ee7b7',
            color: '#065f46',
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{t('register.draftRestored')}</span>
            <button
              type="button"
              onClick={clearDraft}
              style={{
                background: 'none',
                border: 'none',
                color: '#047857',
                fontWeight: 'bold',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '12px'
              }}
            >
              {t('register.clearDraft')}
            </button>
          </div>
        )}

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
                    // 切換身分時，若非在校生可預填無，且幹部意願限在校生勾選（非在校生自動清空）
                    studentId: val === '臺科大在校學生' ? prev.studentId : '無 N/A',
                    intendOfficer: val === '臺科大在校學生' ? prev.intendOfficer : ''
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

            <div className="form-group">
              <label className="required">{t('register.step1.preferredLanguageLabel')}</label>
              <select
                name="preferredLanguage"
                value={formData.preferredLanguage || 'zh'}
                onChange={handleChange}
                required
              >
                <option value="zh">{t('register.step1.preferredLanguageZh')}</option>
                <option value="en">{t('register.step1.preferredLanguageEn')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="required">{t('register.step1.nationalityLabel', '國籍')}</label>
              <select
                name="nationality"
                value={isCustomNationality ? 'Other' : (formData.nationality || '')}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'Other') {
                    setIsCustomNationality(true);
                    setFormData((prev) => ({ ...prev, nationality: '' }));
                  } else {
                    setIsCustomNationality(false);
                    setFormData((prev) => ({ ...prev, nationality: val }));
                  }
                }}
                required
              >
                <option value="" disabled>
                  {t('register.step1.nationalityDefault', '請選擇')}
                </option>
                {NATIONALITY_LIST.map((item) => (
                  <option key={item.zh} value={item.zh}>
                    {item.label}
                  </option>
                ))}
                <option value="Other">
                  {t('register.step1.nationalityOther', '其他 (自行輸入)')}
                </option>
              </select>
              {isCustomNationality && (
                <input
                  type="text"
                  placeholder={t('register.step1.nationalityPlaceholder', '請輸入國籍國家名稱')}
                  value={formData.nationality || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nationality: e.target.value }))}
                  required
                  style={{ marginTop: '8px' }}
                />
              )}
            </div>
          </div>
        )}

        {/* 步驟 2: 基本選填資料 */}
        {step === 2 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step2.title')}</h2>

            <div className="privacy-banner">
              <ShieldCheck size={18} className="privacy-banner-icon" />
              <span>{t('register.privacyBanner')}</span>
            </div>

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

            <div className="form-group">
              <label>{t('register.step2.medicalHistoryLabel')}</label>
              <textarea
                name="medicalHistory"
                value={formData.medicalHistory}
                onChange={handleChange}
                placeholder={t('register.step2.medicalHistoryPlaceholder')}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* 步驟 3: 留守與安全資訊 */}
        {step === 3 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step3.title')}</h2>

            <div className="privacy-banner">
              <ShieldCheck size={18} className="privacy-banner-icon" />
              <span>{t('register.privacyBanner')}</span>
            </div>

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
          </div>
        )}

        {/* 步驟 4: 登山經驗與體能證明 */}
        {step === 4 && (
          <div className="form-step-content animate-fade-in">
            <h2 className="step-title">{t('register.step4.title')}</h2>

            <div className="privacy-banner" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af', marginBottom: '16px' }}>
              <Info size={18} className="privacy-banner-icon" style={{ color: '#2563eb', flexShrink: 0 }} />
              <span>{t('register.step4.fitnessNotice')}</span>
            </div>

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
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                {t('register.step4.uploadProofLabel')}
              </label>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '0', marginBottom: '12px', lineHeight: 1.5 }}>
                {t('register.step4.uploadTip')}
              </p>

              {/* 隱藏的原始檔案選取器 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {/* 水平縮圖與虛線上傳方框容器 */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'center'
                }}
              >
                {/* 1. 歷史已上傳照片縮圖 */}
                {historicalProofUrls.map((url, idx) => {
                  const directThumb = getDirectImageUrl(url, 200) || url;
                  return (
                    <div
                      key={`hist-${idx}`}
                      style={{
                        position: 'relative',
                        width: '84px',
                        height: '84px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                      }}
                      onClick={() => setLightboxImageUrl(url)}
                      title={t('register.step4.previewProof')}
                    >
                      <img
                        src={directThumb}
                        alt={`proof-hist-${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = url;
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveHistoricalProof(url);
                        }}
                        style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(15, 23, 42, 0.75)',
                          border: 'none',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title={t('register.step4.remove')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* 2. 本次新選取的待上傳照片縮圖 */}
                {strengthProofFiles.map((file, idx) => (
                  <div
                    key={`new-${idx}`}
                    style={{
                      position: 'relative',
                      width: '84px',
                      height: '84px',
                      borderRadius: '10px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f8fafc',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                    }}
                    onClick={() => setLightboxImageUrl(file.base64)}
                    title={t('register.step4.previewProof')}
                  >
                    <img
                      src={file.base64}
                      alt={file.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveNewFile(idx);
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        border: 'none',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0
                      }}
                      title={t('register.step4.remove')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {/* 3. 虛線「+」新增方塊 (未滿 5 張時顯示，滿 5 張自動隱藏) */}
                {totalProofsCount < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '84px',
                      height: '84px',
                      borderRadius: '10px',
                      border: '2px dashed #94a3b8',
                      backgroundColor: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#64748b',
                      gap: '4px',
                      padding: '4px',
                      boxSizing: 'border-box',
                      flexShrink: 0
                    }}
                    title={t('register.step4.addProof')}
                  >
                    <Plus size={24} color="#64748b" />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                      {t('register.step4.addProof')}
                    </span>
                  </button>
                )}
              </div>
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

                {/* 社費說明資訊卡 */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginTop: '4px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6'
                }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={15} color="#059669" />
                    <span>{t('register.step4.feeInfoTitle')}</span>
                  </div>
                  <ul style={{ margin: '0 0 8px 18px', padding: 0, listStyleType: 'disc', fontSize: '12px', color: '#475569' }}>
                    <li><strong>{t('register.step4.feeInfoBenefit')}</strong></li>
                    <li>{t('register.step4.feeInfoSemester')}</li>
                    <li>{t('register.step4.feeInfoGraduation')}</li>
                  </ul>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {t('register.step4.feeInfoNote')}
                  </div>
                </div>
              </div>

              {/* 擔任幹部意願 (僅限臺科大在校學生顯示並可勾選，非在校生直接隱藏) */}
              {formData.identityStatus === '臺科大在校學生' && (
                <div>
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
              )}

              {/* 想說的話 I want to say... (非必填多行輸入框) */}
              <div style={{ marginTop: '20px', borderTop: '1px dashed var(--border-color)', paddingTop: '16px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: 'var(--text-primary)' }}>
                  {t('register.step4.wantToSayTitle')}
                </label>
                <textarea
                  name="wantToSay"
                  value={formData.wantToSay || ''}
                  onChange={handleChange}
                  placeholder={t('register.step4.wantToSayPlaceholder')}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    backgroundColor: 'var(--input-bg, #fff)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
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

      {/* 體能證明大圖預覽燈箱 Lightbox Modal */}
      {lightboxImageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setLightboxImageUrl(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '90vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxImageUrl(null)}
              style={{
                position: 'absolute',
                top: '-42px',
                right: '0',
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={t('register.step4.closePreview')}
            >
              <X size={28} />
            </button>
            <img
              src={lightboxImageUrl}
              alt="證明照片大圖預覽"
              style={{
                maxWidth: '92vw',
                maxHeight: '82vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6)'
              }}
            />
          </div>
        </div>
      )}

      {/* 社員系統使用指南導覽燈箱 */}
      <SystemGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}

export default Register;

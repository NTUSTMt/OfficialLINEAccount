import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types/equipment';
import type { AdminEvent, SignupApplicant } from '../types/event';
import type { ProfileData } from '../types/member';
import type {
  AdminMemberListItem,
  MemberFullRecord,
  MemberActiveStats,
  AdminFinanceItem,
  AdminLoanItem,
  AdminInventoryItem,
  MemberTimelineRecord
} from '../types/admin';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

let lastSupabaseError: string | null = null;
export const getLastSupabaseError = (): string | null => lastSupabaseError;
export const setLastSupabaseError = (err: string | null): void => {
  lastSupabaseError = err;
};

interface SupabaseEquipmentRow {
  id: string;
  name: string;
  category?: string;
  total_qty?: number;
  available_qty?: number;
  is_borrowable?: boolean;
  price_2day?: number;
  price_extra_day?: number;
  price?: number;
  price_extra?: number;
  member_price_per_day?: number;
  non_member_price_per_day?: number;
  images?: string[] | string | null;
  specs?: string | null;
  notes?: string | null;
  sort_order?: number;
}

interface SupabaseEventRow {
  id: string;
  title: string;
  title_en?: string;
  fee?: number;
  start_date: string;
  end_date: string;
  deadline: string;
  status: string;
  summary?: string;
  summary_en?: string;
  itinerary?: string;
  itinerary_en?: string;
  cover_image_url?: string;
  line_group_url?: string;
  event_signups?: { status: string }[];
}

/**
 * 從 Supabase 取得可借用之裝備清單 (直接讀取，無須 cold start，延遲 < 100ms)
 * 若 Supabase 未設定或讀取失敗，回傳 null 以供前端 fallback 至 GAS
 */
export const fetchEquipmentsFromSupabase = async (): Promise<Equipment[] | null> => {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('equipments')
      .select('*')
      .eq('is_borrowable', true)
      .gt('available_qty', 0)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('[Supabase] 讀取裝備清單失敗，轉向 fallback:', error.message);
      return null;
    }

    if (!data) return null;

    const formatted: Equipment[] = (data as SupabaseEquipmentRow[]).map((row) => {
      let imgStr = '';
      if (Array.isArray(row.images)) {
        imgStr = row.images.filter(Boolean).join(',');
      } else if (typeof row.images === 'string') {
        imgStr = row.images;
      }

      return {
        id: row.id,
        name: row.name || '未知裝備',
        category: row.category || '其他裝備',
        remainQty: row.available_qty ?? 0,
        price: row.price_2day ?? row.price ?? row.member_price_per_day ?? 0,
        priceExtra: row.price_extra_day ?? row.price_extra ?? row.non_member_price_per_day ?? 0,
        imageUrl: imgStr,
        description: row.notes || row.specs || ''
      };
    });

    console.log('%c[DataSource: Supabase] 裝備清單讀取成功！共 ' + formatted.length + ' 筆 (連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;');
    return formatted;
  } catch (err) {
    console.warn('[Supabase] 連線異常，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * 直接更新 Supabase 裝備照片清單 (免除 GAS 跨域 302 重導向之 Load failed 阻斷，延遲 < 30ms)
 */
export const updateEquipmentImagesInSupabase = async (
  equipId: string,
  imageUrls: string[]
): Promise<{ success: boolean; message?: string }> => {
  if (!supabase || !equipId) {
    return { success: false, message: 'Supabase 未連線或缺少裝備識別碼' };
  }

  try {
    // 1. 優先嘗試 RPC update_equipment_images
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_equipment_images', {
      p_equip_id: equipId,
      p_images: imageUrls
    });

    if (!rpcError && (rpcData?.success !== false)) {
      console.log('%c[DataSource: Supabase] 裝備照片已透過 RPC 成功更新！', 'color: #10b981; font-weight: bold;', equipId, imageUrls);
      return { success: true };
    }

    // 2. 若無 RPC 則使用直更 equipments 資料表
    const { error: updateError } = await supabase
      .from('equipments')
      .update({
        images: imageUrls,
        updated_at: new Date().toISOString()
      })
      .eq('id', equipId);

    if (updateError) {
      console.warn('[Supabase] 更新裝備照片失敗:', updateError.message);
      return { success: false, message: updateError.message };
    }

    console.log('%c[DataSource: Supabase] 裝備照片已直接更新成功！', 'color: #10b981; font-weight: bold;', equipId, imageUrls);
    return { success: true };
  } catch (err: any) {
    console.error('[Supabase] 更新裝備照片例外:', err);
    return { success: false, message: err?.message || String(err) };
  }
};

/**
 * 從 Supabase 取得活動清單 (方案 B：公開活動讀取秒開)
 */
export const fetchEventsFromSupabase = async (): Promise<AdminEvent[] | null> => {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('events')
      .select(`
        id,
        title,
        title_en,
        fee,
        start_date,
        end_date,
        deadline,
        status,
        summary,
        summary_en,
        itinerary,
        itinerary_en,
        cover_image_url,
        line_group_url
      `)
      .order('start_date', { ascending: false });

    if (error) {
      console.warn('[Supabase] 讀取活動清單失敗，轉向 fallback:', error.message);
      return null;
    }

    if (!data) return null;

    const formatted: AdminEvent[] = (data as SupabaseEventRow[]).map((row, idx) => {
      const feeVal = row.fee ?? 0;
      const costStr = feeVal > 0 ? `$${feeVal}` : '免費';

      return {
        id: row.id,
        name: row.title || '未命名活動',
        nameEn: row.title_en || '',
        startDate: row.start_date || '',
        endDate: row.end_date || '',
        deadline: row.deadline || '',
        cost: costStr,
        status: row.status || '關閉',
        shortDesc: row.summary || '',
        shortDescEn: row.summary_en || '',
        fullDesc: row.itinerary || '',
        fullDescEn: row.itinerary_en || '',
        imageUrl: row.cover_image_url || '',
        lineGroupUrl: row.line_group_url || '',
        stats: {
          total: 0,
          accepted: 0,
          waitlisted: 0,
          pending: 0
        },
        rowNumber: idx + 2
      };
    });

    console.log('%c[DataSource: Supabase] 活動清單讀取成功！共 ' + formatted.length + ' 筆 (連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;');
    return formatted;
  } catch (err) {
    console.warn('[Supabase] 連線異常，啟用 GAS fallback:', err);
    return null;
  }
};

export interface DashboardProfileData {
  name: string;
  department: string;
  studentId: string;
  isOfficial: boolean;
  isOfficer?: boolean;
  officerRole?: string;
  expireDate: string;
  preferredLanguage?: string;
}

export interface DashboardActivityData {
  eventId: string;
  eventName: string;
  eventNameEn?: string;
  eventNameZh?: string;
  date: string;
  reviewStatus: string;
  payStatus: string;
  code?: string;
  lineGroupUrl?: string | null;
}

export interface DashboardEquipmentData {
  orderId: string;
  itemName: string;
  pickupDate: string;
  returnDate: string;
  status: string;
  payStatus?: string;
}

export interface SupabaseDashboardData {
  profile: DashboardProfileData;
  activities: DashboardActivityData[];
  equipments: DashboardEquipmentData[];
}

/**
 * 從 Supabase 取得個人主頁儀表板資料 (透過 get_my_dashboard RPC 聚合函式，延遲 < 100ms)
 */
export const fetchDashboardFromSupabase = async (userId: string): Promise<SupabaseDashboardData | null> => {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase.rpc('get_my_dashboard', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取個人主頁失敗，啟用 GAS fallback:', error.message);
      lastSupabaseError = error.message;
      return null;
    }

    if (!data) return null;

    lastSupabaseError = null;
    console.log('%c[DataSource: Supabase] 個人主頁資料讀取成功！(連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseDashboardData;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Supabase] 個人主頁讀取例外，啟用 GAS fallback:', errMsg);
    lastSupabaseError = errMsg;
    return null;
  }
};

/**
 * 從 Supabase 取得個人基本資料 (透過 get_member_profile 安全 RPC 函式，延遲 < 50ms)
 * 嚴密保護：僅能查閱傳入 userId 本人的資料，杜絕全表爬取
 */
export const fetchMemberProfileFromSupabase = async (userId: string): Promise<ProfileData | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    const { data, error } = await supabase.rpc('get_member_profile', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取社員資料失敗，轉向 fallback:', error.message);
      return null;
    }

    if (!data) return null;

    let proofsStr = '';
    if (Array.isArray(data.proof_urls)) {
      proofsStr = data.proof_urls.filter(Boolean).join('\n');
    } else if (typeof data.proof_urls === 'string') {
      proofsStr = data.proof_urls;
    }

    const profile: ProfileData = {
      name: data.name || '',
      gender: data.gender || '',
      nationality: data.nationality || '中華民國',
      department: data.department || '',
      identityStatus: data.identity_status || '臺科大在校學生',
      studentId: data.student_id || '',
      birthday: data.birthday ? String(data.birthday).replace(/\//g, '-') : '',
      idNumber: data.id_card || '',
      email: data.email || '',
      phone: data.phone || '',
      realLineId: data.line_id || '',
      studentAddr: data.address || '',
      emerName: data.emergency_contact_name || '',
      emerRel: data.emergency_contact_rel || '',
      emerPhone: data.emergency_contact_phone || '',
      emerAddr: data.emergency_contact_address || '',
      exp: data.outdoor_experience || '',
      strength: data.fitness_desc || '',
      strengthProof: proofsStr,
      medicalHistory: data.medical_history || '',
      intendOfficial: data.join_membership_intent || '',
      intendOfficer: data.officer_intent || '',
      wantToSay: data.want_to_say || '',
      preferredLanguage: data.preferred_language || 'zh'
    };

    console.log('%c[DataSource: Supabase] 社員個人資料預填讀取成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', profile);
    return profile;
  } catch (err) {
    console.warn('[Supabase] 讀取社員個人資料例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * 將個人基本資料儲存至 Supabase (透過 save_member_profile 安全 RPC 函式，延遲 < 50ms)
 * 觸發器會自動寫入 sync_queue，背景平滑同步至 Google Sheets
 */
export const saveMemberProfileToSupabase = async (
  userId: string,
  formData: ProfileData
): Promise<{ success: boolean; message?: string }> => {
  if (!supabase || !userId) {
    return { success: false, message: 'Supabase 未連線或缺少使用者識別碼' };
  }

  try {
    const proofsList = formData.strengthProof
      ? formData.strengthProof
          .split(/[\n,，;\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.startsWith('http'))
      : [];

    const cleanBirthday = formData.birthday ? formData.birthday.replace(/\//g, '-').trim() : '';

    const payload = {
      name: formData.name.trim(),
      gender: formData.gender,
      nationality: (formData.nationality || '中華民國').trim(),
      line_id: formData.realLineId.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      department: formData.department.trim(),
      student_id: formData.studentId.trim(),
      birthday: cleanBirthday || null,
      id_card: formData.idNumber.trim(),
      address: formData.studentAddr.trim(),
      outdoor_experience: formData.exp.trim(),
      fitness_desc: formData.strength.trim(),
      proof_urls: proofsList,
      emergency_contact_name: formData.emerName.trim(),
      emergency_contact_rel: formData.emerRel.trim(),
      emergency_contact_phone: formData.emerPhone.trim(),
      emergency_contact_address: formData.emerAddr.trim(),
      medical_history: formData.medicalHistory.trim(),
      identity_status: formData.identityStatus.trim(),
      join_membership_intent: formData.intendOfficial.trim(),
      officer_intent: formData.intendOfficer.trim(),
      want_to_say: formData.wantToSay ? formData.wantToSay.trim() : '',
      preferred_language: formData.preferredLanguage || 'zh'
    };

    const { data, error } = await supabase.rpc('save_member_profile', {
      p_line_user_id: userId,
      p_data: payload
    });

    if (error) {
      console.warn('[Supabase] 儲存個人資料失敗:', error.message);
      return { success: false, message: error.message };
    }

    if (data?.success === false) {
      return { success: false, message: data?.message || '儲存未成功' };
    }

    console.log('%c[DataSource: Supabase] 社員個人資料已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase] 儲存個人資料例外:', err);
    return { success: false, message: err?.message || String(err) };
  }
};

export interface SupabaseUnpaidItem {
  id: string;
  name: string;
  amount: number;
  orderId?: string;
  pickupDate?: string;
  returnDate?: string;
  qty?: number;
  purpose?: string;
  isOfficial?: string;
}

export interface SupabaseUnpaidList {
  membership: SupabaseUnpaidItem[];
  activities: SupabaseUnpaidItem[];
  equipments: SupabaseUnpaidItem[];
}

export interface PaymentSubmitDetails {
  selectedIds: string[];
  last5Digits: string;
  totalAmount: number;
  note?: string;
  membershipExpiryDate?: string;
}

/**
 * 從 Supabase 取得個人待繳清單 (透過 get_unpaid_payments 安全 RPC 函式，延遲 < 50ms)
 * 聚合社費、正取活動費用、裝備租借費用，杜絕全表個資爬取
 */
export const fetchUnpaidPaymentsFromSupabase = async (userId: string): Promise<SupabaseUnpaidList | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    const { data, error } = await supabase.rpc('get_unpaid_payments', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取待繳清單失敗，啟用 GAS fallback:', error.message);
      return null;
    }

    if (!data) return null;

    console.log('%c[DataSource: Supabase] 待繳費用清單秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseUnpaidList;
  } catch (err) {
    console.warn('[Supabase] 讀取待繳清單例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * 提交繳費對帳申報至 Supabase (透過 submit_payment_rpc 安全 RPC 函式，延遲 < 50ms)
 * 原子性建立 payments 記錄並更新關聯項目的繳費狀態為「待確認 Checking」，同時回傳單次安全核銷密鑰 verify_token
 */
export const submitPaymentToSupabase = async (
  userId: string,
  details: PaymentSubmitDetails
): Promise<{ success: boolean; paymentId?: string; verifyToken?: string; error?: string }> => {
  if (!supabase) return { success: false, error: '未初始化 Supabase Client' };
  if (!userId) return { success: false, error: '缺少使用者 LINE ID (userId 為空)' };

  try {
    const { data, error } = await supabase.rpc('submit_payment_rpc', {
      p_line_user_id: userId,
      p_details: details
    });

    if (error) {
      console.error('[Supabase] 提交繳費對帳失敗:', error);
      return { success: false, error: `${error.message} (代碼: ${error.code || '未知'}, 細節: ${error.details || '無'})` };
    }

    if (!data || data.success === false) {
      const dbErr = data?.error || '資料庫未回傳成功識別碼 (請確認 Supabase SQL 腳本是否已執行)';
      console.error('[Supabase] RPC 回傳失敗狀態:', data);
      return { success: false, error: dbErr };
    }

    console.log('%c[DataSource: Supabase] 繳費申報已極速送出！', 'color: #10b981; font-weight: bold;', data);
    return {
      success: true,
      paymentId: data?.payment_id,
      verifyToken: data?.verify_token
    };
  } catch (err: any) {
    console.error('[Supabase] 提交繳費對帳例外:', err);
    return { success: false, error: err?.message || String(err) };
  }
};

export interface VerifyPaymentResult {
  success: boolean;
  alreadyConfirmed?: boolean;
  paymentId?: string;
  userName?: string;
  amount?: number;
  items?: string;
  lineUserId?: string;
  message?: string;
  error?: string;
}

/**
 * 透過單次專屬安全金鑰直接在 Supabase 執行單鍵核銷 (免 Google 帳號登入、無轉向阻斷，延遲 < 50ms)
 */
export const verifyPaymentByTokenFromSupabase = async (
  paymentId: string,
  token: string
): Promise<VerifyPaymentResult> => {
  if (!supabase || !paymentId || !token) {
    return { success: false, error: '缺少單號或安全金鑰 (Missing paymentId or verifyToken)' };
  }

  try {
    const { data, error } = await supabase.rpc('verify_payment_by_token', {
      p_payment_id: paymentId,
      p_verify_token: token,
      p_officer_name: 'Email 單鍵核銷'
    });

    if (error) {
      console.warn('[Supabase] verify_payment_by_token 失敗:', error.message);
      return { success: false, error: error.message };
    }

    return data as VerifyPaymentResult;
  } catch (err: any) {
    console.warn('[Supabase] verify_payment_by_token 例外:', err);
    return { success: false, error: err?.message || String(err) };
  }
};

export interface SupabaseHistoryItem {
  id: string;
  date: string;
  type: string;
  title: string;
  amount: number;
  last5Digits: string;
  note?: string;
  status: string;
}

export interface SupabasePaymentHistoryData {
  totalSpent: number;
  history: SupabaseHistoryItem[];
}

/**
 * 從 Supabase 取得個人歷史繳費紀錄 (透過 get_my_payment_history 安全 RPC 函式，延遲 < 50ms)
 * 自動分類社費/活動/裝備並統計已核銷總金額
 */
export const fetchPaymentHistoryFromSupabase = async (userId: string): Promise<SupabasePaymentHistoryData | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    const { data, error } = await supabase.rpc('get_my_payment_history', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取歷史繳費失敗，啟用 GAS fallback:', error.message);
      return null;
    }

    if (!data) return null;

    console.log('%c[DataSource: Supabase] 歷史繳費紀錄秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabasePaymentHistoryData;
  } catch (err) {
    console.warn('[Supabase] 讀取歷史繳費例外，啟用 GAS fallback:', err);
    return null;
  }
};

export interface SupabaseReflection {
  difficulty: number;
  beauty: number;
  content: string;
  imageUrl: string;
  isPublic?: boolean;
}

export interface SupabasePastActivity {
  eventId: string;
  title: string;
  date: string;
  img: string;
  hasReflected: boolean;
  reflection: SupabaseReflection | null;
}

export interface SupabaseAchievementData {
  totalAttended: number;
  reflectionsCount: number;
  activities: SupabasePastActivity[];
}

export interface ReflectionSubmitDetails {
  eventId: string;
  eventName?: string;
  eventDate?: string;
  difficulty: number;
  beauty: number;
  content: string;
  imageUrl?: string;
  isPublic?: boolean;
  authorName?: string;
}

export interface PublicReflectionItem {
  id: number;
  eventId: string;
  lineUserId: string;
  authorName: string;
  difficulty: number;
  beauty: number;
  content: string;
  photoUrls?: string[] | null;
  imageUrl?: string | null;
  isPublic: boolean;
  createdAt: string;
}

/**
 * 從 Supabase 取得個人活動成就與出隊歷程 (透過 get_my_achievements 安全 RPC 函式，延遲 < 50ms)
 */
export const fetchAchievementsFromSupabase = async (userId: string): Promise<SupabaseAchievementData | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    const { data, error } = await supabase.rpc('get_my_achievements', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取活動成就失敗，啟用 GAS fallback:', error.message);
      lastSupabaseError = error.message;
      return null;
    }

    if (!data) return null;

    lastSupabaseError = null;
    console.log('%c[DataSource: Supabase] 活動成就紀錄秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseAchievementData;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Supabase] 讀取活動成就例外，啟用 GAS fallback:', errMsg);
    lastSupabaseError = errMsg;
    return null;
  }
};

/**
 * 提交活動心得與評分至 Supabase (透過 save_reflection_rpc 安全 RPC 函式，延遲 < 50ms)
 */
export const saveReflectionToSupabase = async (
  userId: string,
  details: ReflectionSubmitDetails
): Promise<boolean> => {
  if (!supabase || !userId) return false;

  try {
    const { data, error } = await supabase.rpc('save_reflection_rpc', {
      p_line_user_id: userId,
      p_details: details
    });

    if (error) {
      console.warn('[Supabase] 儲存活動心得失敗:', error.message);
      return false;
    }

    console.log('%c[DataSource: Supabase] 活動心得已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return true;
  } catch (err) {
    console.warn('[Supabase] 儲存活動心得例外:', err);
    return false;
  }
};

/**
  * 從 Supabase 取得特定活動的所有公開心得 (透過 get_event_public_reflections_rpc，延遲 < 50ms)
  */
export const fetchEventPublicReflections = async (eventId: string): Promise<PublicReflectionItem[]> => {
  if (!supabase || !eventId) return [];

  try {
    const { data, error } = await supabase.rpc('get_event_public_reflections_rpc', {
      p_event_id: eventId
    });

    if (error) {
      console.warn('[Supabase] 讀取活動公開心得失敗:', error.message);
      return [];
    }

    return Array.isArray(data) ? (data as PublicReflectionItem[]) : [];
  } catch (err) {
    console.warn('[Supabase] 讀取活動公開心得例外:', err);
    return [];
  }
};

/**
 * 自動/手動同步幹部快取至 Supabase officers 表
 */
export const registerOfficerToSupabase = async (
  userId: string,
  name: string = '',
  role: string = '幹部'
): Promise<boolean> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return false;

  try {
    const { error } = await supabase.rpc('sync_officer_cache_rpc', {
      p_officer_line_user_id: userId,
      p_name: name,
      p_role: role
    });

    if (error) {
      console.warn('[Supabase] 同步幹部快取失敗:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase] 同步幹部快取例外:', err);
    return false;
  }
};

/**
 * 直接自 Supabase 驗證使用者是否具備幹部身分 (延遲 < 30ms)
 * 同時檢驗 members.is_officer 與 officers 表
 */
export const checkOfficerStatusFromSupabase = async (
  userId: string
): Promise<{ isOfficer: boolean; role?: string; name?: string } | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    // 1. 查驗 members 表的 is_officer 欄位
    const { data: memberData } = await supabase
      .from('members')
      .select('is_officer, officer_role, name')
      .eq('line_user_id', userId)
      .maybeSingle();

    // 2. 查驗 officers 表，優先取得最新的 title (職稱) 與 role，達成雙向同步
    const { data: officerData } = await supabase
      .from('officers')
      .select('role, title, name')
      .eq('line_user_id', userId)
      .maybeSingle();

    const officerTitle = (officerData as any)?.title || officerData?.role || memberData?.officer_role || '幹部';
    const officerName = officerData?.name || memberData?.name || '幹部';

    if (memberData && memberData.is_officer) {
      return {
        isOfficer: true,
        role: officerTitle,
        name: officerName
      };
    }

    if (officerData) {
      return {
        isOfficer: true,
        role: officerTitle,
        name: officerName
      };
    }

    return { isOfficer: false };
  } catch (err) {
    console.warn('[Supabase] 檢查幹部身分例外:', err);
    return null;
  }
};

/**
 * 獲取幹部活動管理清單與報名人數統計 (透過 get_admin_events_rpc，延遲 < 50ms)
 */
export const fetchAdminEventsFromSupabase = async (
  userId: string
): Promise<{ isOfficer: boolean; officerRole?: string; officerName?: string; events: AdminEvent[] } | null> => {
  if (!supabase || !userId) return null;

  try {
    const { data, error } = await supabase.rpc('get_admin_events_rpc', {
      p_officer_line_user_id: userId
    });

    if (error) {
      console.warn('[Supabase] 讀取後台活動失敗，啟用 GAS fallback:', error.message);
      lastSupabaseError = error.message;
      return null;
    }

    if (!data) return null;

    lastSupabaseError = null;
    if (data.isOfficer) {
      console.log('%c[DataSource: Supabase] 後台活動與報名統計讀取成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
      return {
        isOfficer: true,
        officerRole: data.officerRole || '幹部',
        officerName: data.officerName || '幹部',
        events: Array.isArray(data.events) ? data.events : []
      };
    }

    return {
      isOfficer: false,
      events: []
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Supabase] 讀取後台活動例外，啟用 GAS fallback:', errMsg);
    lastSupabaseError = errMsg;
    return null;
  }
};

/**
 * 獲取單一活動的全部報名者名冊 (透過 get_admin_event_signups_rpc，延遲 < 50ms)
 */
export const fetchAdminEventSignupsFromSupabase = async (
  userId: string,
  eventId: string
): Promise<SignupApplicant[] | null> => {
  if (!supabase || !userId || !eventId) return null;

  try {
    const { data, error } = await supabase.rpc('get_admin_event_signups_rpc', {
      p_officer_line_user_id: userId,
      p_event_id: eventId
    });

    if (error) {
      console.warn('[Supabase] 讀取報名名冊失敗，啟用 GAS fallback:', error.message);
      return null;
    }

    if (!data || data.status !== 'success' || !Array.isArray(data.signups)) {
      return null;
    }

    console.log(`%c[DataSource: Supabase] 活動 (${eventId}) 報名名冊秒開成功！共 ${data.signups.length} 筆 (連線延遲 < 50ms)`, 'color: #10b981; font-weight: bold;');
    
    // ️ 欄位防禦性正規化：全面相容 realLineId/lineId、id/signupCode、climbingExp/experience 等舊版/新版 RPC 鍵名
    const mappedSignups: SignupApplicant[] = (data.signups as any[]).map((item, idx) => {
      const emerContact = item.emergencyContact || '';
      let parsedEmerName = item.emerName || '';
      let parsedEmerRel = item.emerRel || '';
      let parsedEmerPhone = item.emerPhone || '';
      if (!parsedEmerName && emerContact && emerContact !== '未填寫') {
        const parts = emerContact.match(/^(.*?)\s*(?:\((.*?)\))?\s*(\d.*)?$/);
        if (parts) {
          parsedEmerName = parts[1] || '';
          parsedEmerRel = parts[2] || '';
          parsedEmerPhone = parts[3] || '';
        }
      }

      return {
        rowNumber: item.rowNumber || idx + 1,
        signupCode: String(item.signupCode || item.id || '').trim(),
        userId: String(item.userId || item.lineUserId || '').trim(),
        name: item.name || '未知報名者',
        gender: item.gender || '',
        phone: item.phone || '',
        lineId: item.lineId || item.realLineId || '',
        email: item.email || '',
        address: item.address || '',
        birthday: item.birthday || '',
        idNumber: item.idNumber || item.idCard || '',
        emerName: parsedEmerName,
        emerPhone: parsedEmerPhone,
        emerRel: parsedEmerRel,
        emerAddr: item.emerAddr || '',
        experience: item.experience || item.climbingExp || '',
        fitnessTest: item.fitnessTest || item.fitnessDesc || '',
        strengthProof: item.strengthProof || item.fitnessProof || '',
        department: item.department || '',
        studentId: item.studentId || '',
        medicalHistory: item.medicalHistory || '',
        isOfficial: (item.isOfficial === true || item.isOfficial === '是') ? '是' : '否',
        reviewResult: item.reviewResult || item.status || '審核中 Checking',
        notifyStatus: item.notifyStatus || item.notification_status || '',
        payStatus: item.payStatus || '未繳費',
        remark: item.remark || item.notes || ''
      };
    });

    return mappedSignups;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Supabase] 讀取報名名冊例外，啟用 GAS fallback:', errMsg);
    lastSupabaseError = errMsg;
    return null;
  }
};

/**
 * 審核個別社員報名狀態 (透過 update_signup_status_rpc，延遲 < 30ms)
 */
export const updateSignupStatusInSupabase = async (
  userId: string,
  eventId: string,
  signupId: string,
  reviewResult: string
): Promise<boolean> => {
  if (!supabase || !userId || !signupId) return false;

  try {
    const { data, error } = await supabase.rpc('update_signup_status_rpc', {
      p_officer_line_user_id: userId,
      p_event_id: eventId,
      p_signup_id: signupId,
      p_review_result: reviewResult
    });

    if (error || data?.status !== 'success') {
      const errMsg = error?.message || data?.message || '審核狀態更新失敗';
      console.warn('[Supabase] 審核狀態更新失敗:', errMsg);
      lastSupabaseError = errMsg;
      return false;
    }

    console.log('%c[DataSource: Supabase] 審核狀態已秒級更新！', 'color: #10b981; font-weight: bold;', signupId, reviewResult);
    return true;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.warn('[Supabase] 審核狀態更新例外:', errMsg);
    lastSupabaseError = errMsg;
    return false;
  }
};

/**
 * 快速切換活動開放狀態 (透過 update_event_status_rpc，延遲 < 30ms)
 */
export const updateEventStatusInSupabase = async (
  userId: string,
  eventId: string,
  status: string
): Promise<boolean> => {
  if (!supabase || !userId || !eventId) return false;

  try {
    const { data, error } = await supabase.rpc('update_event_status_rpc', {
      p_officer_line_user_id: userId,
      p_event_id: eventId,
      p_status: status
    });

    if (error || data?.status !== 'success') {
      console.warn('[Supabase] 活動狀態更新失敗:', error?.message || data?.message);
      return false;
    }

    console.log('%c[DataSource: Supabase] 活動狀態已秒級更新！', 'color: #10b981; font-weight: bold;', eventId, status);
    return true;
  } catch (err) {
    console.warn('[Supabase] 活動狀態更新例外:', err);
    return false;
  }
};

/**
 * 建立或更新活動資料 (透過 save_admin_event_rpc，延遲 < 50ms)
 */
export const saveEventToSupabase = async (
  userId: string,
  eventData: {
    eventId?: string;
    name: string;
    nameEn?: string;
    startDate: string;
    endDate?: string;
    deadline: string;
    cost: string;
    status: string;
    shortDesc?: string;
    shortDescEn?: string;
    fullDesc?: string;
    fullDescEn?: string;
    imageUrl?: string;
    driveFolderUrl?: string;
    spreadsheetUrl?: string;
    spreadsheetId?: string;
    lineGroupUrl?: string;
  }
): Promise<{ success: boolean; eventId?: string }> => {
  if (!supabase || !userId) return { success: false };

  try {
    const { data, error } = await supabase.rpc('save_admin_event_rpc', {
      p_officer_line_user_id: userId,
      p_event_data: eventData
    });

    if (error || data?.status !== 'success') {
      console.warn('[Supabase] 儲存活動失敗:', error?.message || data?.message);
      return { success: false };
    }

    console.log('%c[DataSource: Supabase] 活動已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return { success: true, eventId: data.eventId };
  } catch (err) {
    console.warn('[Supabase] 儲存活動例外:', err);
    return { success: false };
  }
};

export interface EquipmentLoanDetails {
  cart: Record<string, number>;
  pickupDate: string;
  returnDate: string;
  purpose: string;
  otherPurpose?: string;
}

/**
 * 提交裝備租借申請至 Supabase (透過 submit_equipment_loan_rpc 安全原子性 RPC，延遲 < 50ms)
 * 自動防超賣鎖定庫存、判定社員身分計算租金，並觸發 sync_queue 佇列
 */
export const submitEquipmentLoanToSupabase = async (
  userId: string,
  details: EquipmentLoanDetails
): Promise<{ success: boolean; loanId?: string; message?: string; totalRent?: number }> => {
  if (!supabase || !userId) {
    return { success: false, message: 'Supabase 未連線或缺少使用者身分' };
  }

  try {
    const { data, error } = await supabase.rpc('submit_equipment_loan_rpc', {
      p_line_user_id: userId,
      p_details: details
    });

    if (error) {
      console.warn('[Supabase] 提交裝備租借失敗:', error.message);
      return { success: false, message: error.message };
    }

    if (data?.status !== 'success') {
      console.warn('[Supabase] 提交裝備租借未成功:', data?.message);
      return { success: false, message: data?.message || '申請失敗' };
    }

    console.log('%c[DataSource: Supabase] 裝備租借申請已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return {
      success: true,
      loanId: data.loanId,
      message: data.message,
      totalRent: data.totalRent
    };
  } catch (err: unknown) {
    console.warn('[Supabase] 提交裝備租借例外:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
};

/**
 * 取消裝備租借申請 (透過 cancel_equipment_loan_rpc 安全 RPC，延遲 < 30ms)
 * 自動在資料庫層釋放並歸還裝備庫存，觸發 sync_queue
 */
export const cancelEquipmentLoanInSupabase = async (
  userId: string,
  loanId: string
): Promise<{ success: boolean; message?: string }> => {
  if (!supabase || !userId || !loanId) return { success: false, message: '缺少必要參數' };

  try {
    const { data, error } = await supabase.rpc('cancel_equipment_loan_rpc', {
      p_line_user_id: userId,
      p_loan_id: loanId
    });

    if (error || data?.status !== 'success') {
      console.warn('[Supabase] 取消裝備失敗:', error?.message || data?.message);
      return { success: false, message: error?.message || data?.message };
    }

    console.log('%c[DataSource: Supabase] 裝備預約已秒級取消！', 'color: #10b981; font-weight: bold;', loanId);
    return { success: true, message: data.message };
  } catch (err: unknown) {
    console.warn('[Supabase] 取消裝備例外:', err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 取消活動報名 (透過 cancel_event_signup_rpc 安全 RPC，延遲 < 30ms)
 */
export const cancelEventSignupInSupabase = async (
  userId: string,
  signupId: string,
  reason?: string
): Promise<{ success: boolean; message?: string }> => {
  if (!supabase || !userId || !signupId) return { success: false, message: '缺少必要參數' };

  try {
    const { data, error } = await supabase.rpc('cancel_event_signup_rpc', {
      p_line_user_id: userId,
      p_signup_id: signupId,
      p_reason: reason || null
    });

    if (error || data?.status !== 'success') {
      console.warn('[Supabase] 取消報名失敗:', error?.message || data?.message);
      return { success: false, message: error?.message || data?.message };
    }

    console.log('%c[DataSource: Supabase] 活動報名已秒級取消！', 'color: #10b981; font-weight: bold;', signupId);
    return { success: true, message: data.message };
  } catch (err: unknown) {
    console.warn('[Supabase] 取消報名例外:', err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 幹部後台：取得所有社員清單 (優先調用 get_admin_members_rpc，相容 direct query)
 */
export const fetchAdminMembersFromSupabase = async (officerUserId?: string): Promise<AdminMemberListItem[]> => {
  if (!supabase) return [];

  // 1. 優先嘗試 SECURITY DEFINER RPC (具備幹部鑑權，完全豁免 RLS 封閉與 42501 權限限制)
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_members_rpc', {
        p_officer_line_user_id: officerUserId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && Array.isArray(rpcRes.members)) {
        return rpcRes.members as AdminMemberListItem[];
      }
      if (rpcErr) {
        console.warn('[Supabase] get_admin_members_rpc 呼叫失敗，嘗試直接查詢:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_members_rpc 例外，切換直讀備援:', err);
    }
  }

  // 2. 直讀備援 (若已配置 RLS Allow Policy)
  try {
    const { data, error } = await supabase
      .from('members')
      .select('line_user_id, name, identity_status, department, student_id, line_id, is_official_member, is_officer, officer_role, payment_status, created_at, phone, email, officer_intent')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase] 讀取社員名單失敗:', error.message);
      throw new Error(`[Supabase 讀取社員名單失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
    }

    return (data || []) as AdminMemberListItem[];
  } catch (err: any) {
    console.error('[Supabase] fetchAdminMembersFromSupabase 例外:', err);
    throw err;
  }
};

/**
 * 幹部後台：取得單一社員全部欄位 (MemberFullRecord)
 */
export const fetchMemberFullDetailFromSupabase = async (
  userId: string,
  officerUserId?: string
): Promise<MemberFullRecord | null> => {
  if (!supabase || !userId) return null;

  // 1. 優先嘗試 RPC (幹部鑑權，完全豁免 RLS 封閉)
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_member_detail_rpc', {
        p_officer_line_user_id: officerUserId,
        p_target_user_id: userId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && rpcRes.member) {
        return rpcRes.member as MemberFullRecord;
      }
      if (rpcErr) {
        console.warn('[Supabase] get_admin_member_detail_rpc 失敗，切換直讀模式:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_member_detail_rpc 例外，切換直讀模式:', err);
    }
  }

  // 2. 第二層備援：調用行之有年的 get_member_profile RPC
  try {
    const { data: profData, error: profErr } = await supabase.rpc('get_member_profile', {
      p_line_user_id: userId
    });
    if (!profErr && profData && typeof profData === 'object' && Object.keys(profData).length > 0) {
      return profData as MemberFullRecord;
    }
    if (profErr) {
      console.warn('[Supabase] get_member_profile 備援查詢未果:', profErr.message);
    }
  } catch (err) {
    console.warn('[Supabase] get_member_profile 備援查詢例外:', err);
  }

  // 3. 直讀備援 (支援 line_user_id 與 line_id 雙軌相容)
  try {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .or(`line_user_id.eq.${userId},line_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] 讀取社員詳細資料失敗:', error.message);
      throw new Error(`[Supabase 讀取社員詳細資料失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
    }

    return data as MemberFullRecord | null;
  } catch (err: any) {
    console.error('[Supabase] fetchMemberFullDetailFromSupabase 例外:', err);
    throw err;
  }
};

/**
 * 幹部後台：取得社員進行中活動、租借與繳費狀態
 */
export const fetchMemberActiveStatsFromSupabase = async (
  userId: string,
  officerUserId?: string
): Promise<MemberActiveStats> => {
  if (!supabase || !userId) {
    return { unfinishedEvents: [], activeLoans: [], pendingPaymentsCount: 0 };
  }

  // 1. 優先由 RPC 取得快照
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_member_detail_rpc', {
        p_officer_line_user_id: officerUserId,
        p_target_user_id: userId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && rpcRes.activeStats) {
        return rpcRes.activeStats as MemberActiveStats;
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_member_detail_rpc activeStats 例外:', err);
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // 1. 查詢尚未結束的活動行程
    const { data: signupsData } = await supabase
      .from('event_signups')
      .select(`
        id,
        event_id,
        status,
        payment_status,
        events:event_id (
          id,
          title,
          start_date,
          end_date,
          status
        )
      `)
      .eq('line_user_id', userId)
      .neq('status', '已取消 Cancelled');

    const unfinishedEvents: MemberActiveStats['unfinishedEvents'] = [];
    if (signupsData && Array.isArray(signupsData)) {
      signupsData.forEach((s: any) => {
        const ev = s.events;
        if (ev && (ev.end_date >= todayStr || ev.status !== '已結束 Finished')) {
          unfinishedEvents.push({
            id: ev.id,
            title: ev.title,
            startDate: ev.start_date,
            endDate: ev.end_date,
            signupStatus: s.status,
            payStatus: s.payment_status
          });
        }
      });
    }

    // 2. 查詢進行中租借單
    const { data: loansData } = await supabase
      .from('loans')
      .select('id, start_date, end_date, status, payment_status, loan_items(equipment_id, quantity, equipments(name))')
      .eq('line_user_id', userId)
      .in('status', ['待領取 To Be Collected', '租借中 Borrowed']);

    const activeLoans: MemberActiveStats['activeLoans'] = [];
    if (loansData && Array.isArray(loansData)) {
      loansData.forEach((l: any) => {
        let itemsText = '裝備租借';
        if (Array.isArray(l.loan_items) && l.loan_items.length > 0) {
          itemsText = l.loan_items.map((li: any) => `${li.equipments?.name || li.equipment_id || '裝備'} x ${li.quantity || 1}`).join(', ');
        }
        activeLoans.push({
          id: l.id,
          startDate: l.start_date,
          endDate: l.end_date,
          status: l.status,
          payStatus: l.payment_status,
          itemsSummary: itemsText
        });
      });
    }

    // 3. 待確認或未繳費筆數 (嚴格遵循社團規定：僅「正取」活動才具備繳費資格與計入待繳)
    const pendingItems: Array<{ type: 'event' | 'loan' | 'membership'; title: string; status: string }> = [];

    unfinishedEvents.forEach(e => {
      const isConfirmedSignup = e.signupStatus && e.signupStatus.includes('正取');
      if (isConfirmedSignup && e.payStatus !== '已繳費 Paid') {
        pendingItems.push({
          type: 'event',
          title: `活動：${e.title}`,
          status: e.payStatus || '未繳費 Unpaid'
        });
      }
    });

    activeLoans.forEach(l => {
      if (l.payStatus !== '已繳費 Paid') {
        pendingItems.push({
          type: 'loan',
          title: `裝備租借：${l.itemsSummary}`,
          status: l.payStatus || '未繳費 Unpaid'
        });
      }
    });

    // 查詢社費繳納狀態
    try {
      const { data: memberData } = await supabase
        .from('members')
        .select('payment_status')
        .eq('line_user_id', userId)
        .maybeSingle();

      if (memberData && memberData.payment_status && memberData.payment_status !== '已繳費 Paid') {
        pendingItems.push({
          type: 'membership',
          title: '社費：社籍費用',
          status: memberData.payment_status
        });
      }
    } catch {
      // 忽略非關鍵社費查詢例外
    }

    return {
      unfinishedEvents,
      activeLoans,
      pendingPaymentsCount: pendingItems.length,
      pendingItems
    };
  } catch (err) {
    console.warn('[Supabase] fetchMemberActiveStatsFromSupabase 例外:', err);
    return { unfinishedEvents: [], activeLoans: [], pendingPaymentsCount: 0 };
  }
};

/**
 * 幹部後台：直接更新社員完整資料 (純資料直連 Supabase)
 */
export const updateMemberFullDetailInSupabase = async (
  userId: string,
  fields: Partial<MemberFullRecord>,
  officerUserId?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase || !userId) {
    return { success: false, error: '缺少 Supabase 連線或 userId' };
  }

  // 1. 優先嘗試 RPC
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_admin_member_rpc', {
        p_officer_line_user_id: officerUserId,
        p_target_user_id: userId,
        p_data: fields
      });
      if (!rpcErr && rpcRes && rpcRes.success) {
        return { success: true };
      }
      if (rpcRes && rpcRes.success === false) {
        console.warn('[Supabase] update_admin_member_rpc 拒絕更新:', rpcRes.message);
        return { success: false, error: rpcRes.message || '幹部更新社員資料失敗' };
      }
      if (rpcErr) {
        console.warn('[Supabase] update_admin_member_rpc 失敗，切換直更模式:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] update_admin_member_rpc 例外，切換直更模式:', err);
    }
  }

  try {
    const updatePayload: Record<string, any> = {
      ...fields,
      updated_at: new Date().toISOString()
    };
    delete updatePayload.line_user_id;

    // 清理空日期字串，避免 PostgreSQL 22007 invalid input syntax for type date
    if (updatePayload.membership_expires_at === '') {
      updatePayload.membership_expires_at = null;
    }

    const { data, error } = await supabase
      .from('members')
      .update(updatePayload)
      .eq('line_user_id', userId)
      .select('line_user_id');

    if (error) {
      console.error('[Supabase] 更新社員資料失敗:', error.message);
      return { success: false, error: `[更新社員資料失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})` };
    }

    if (!data || data.length === 0) {
      console.warn('[Supabase] 更新社員資料 0 筆異動:', userId);
      return { success: false, error: `資料庫中查無 line_user_id 為 ${userId} 的社員，更新筆數為 0` };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Supabase] updateMemberFullDetailInSupabase 例外:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[更新社員資料例外]: ${msg}` };
  }
};

/**
 * 幹部後台：取得財務對帳卡片清單 (結合 payments, 未結 loans 與未結 signups)
 */
export const fetchFinanceItemsFromSupabase = async (officerUserId?: string): Promise<AdminFinanceItem[]> => {
  if (!supabase) return [];

  // 1. 優先調用 get_admin_finance_rpc (幹部鑑權專屬 RPC，豁免 42501 權限限制)
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_finance_rpc', {
        p_officer_line_user_id: officerUserId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && Array.isArray(rpcRes.items)) {
        return rpcRes.items.map((it: any) => ({
          id: it.id,
          line_user_id: it.line_user_id,
          name: it.name,
          type: it.type,
          amount: Number(it.amount) || 0,
          bank_last5: it.bank_last5,
          proof_image_url: it.proof_image_url,
          target_type: it.target_type,
          target_id: it.target_id,
          status: it.status === '已核銷 Confirmed'
            ? '已核銷 Confirmed'
            : it.status === '待繳費 Unpaid'
              ? '待繳費 Unpaid'
              : '待確認 Checking',
          payment_status: it.payment_status || (it.status === '已核銷 Confirmed' ? '已繳費 Paid' : (it.status === '待繳費 Unpaid' ? '未繳費 Unpaid' : '待確認 Checking')),
          officer_notes: it.officer_notes,
          notes: it.notes || it.member_notes || '',
          notification_status: it.notification_status || '未通知',
          created_at: it.created_at || new Date().toISOString(),
          sourceType: it.source_type || 'payment',
          itemCategory: it.item_category || 'general'
        })) as AdminFinanceItem[];
      }
      if (rpcErr) {
        console.warn('[Supabase] get_admin_finance_rpc 呼叫失敗，嘗試直接查詢:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_finance_rpc 例外，切換直讀備援:', err);
    }
  }

  try {
    const items: AdminFinanceItem[] = [];

    // 1. 查詢所有申報的 payments 記錄
    const { data: paymentsData, error: pErr } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    if (pErr) {
      console.error('[Supabase] 讀取 payments 失敗:', pErr.message);
      throw new Error(`[Supabase 讀取 payments 失敗]: ${pErr.message} (代碼: ${pErr.code || 'UNKNOWN'})`);
    }

    if (paymentsData && Array.isArray(paymentsData)) {
      paymentsData.forEach((p: any) => {
        let cat: AdminFinanceItem['itemCategory'] = 'general';
        const typeStr = (p.type || '').toLowerCase();
        if (p.target_type === 'event' || typeStr.includes('活動')) {
          cat = 'activity';
        } else if (p.target_type === 'loan' || typeStr.includes('裝備')) {
          cat = 'equipment';
        } else if (p.target_type === 'membership' || typeStr.includes('社費')) {
          cat = 'membership';
        }

        items.push({
          id: p.id,
          line_user_id: p.line_user_id,
          name: p.name || '未知申報人',
          type: p.type || '款項申報',
          amount: p.amount || 0,
          bank_last5: p.bank_last5,
          proof_image_url: p.proof_image_url,
          target_type: p.target_type || (cat === 'membership' ? 'membership' : cat === 'activity' ? 'event' : cat === 'equipment' ? 'loan' : null),
          target_id: p.target_id,
          status: p.status === '已核銷 Confirmed' ? '已核銷 Confirmed' : '待確認 Checking',
          payment_status: p.status === '已核銷 Confirmed' ? '已繳費 Paid' : '待確認 Checking',
          officer_notes: p.officer_notes,
          notes: p.notes || '',
          notification_status: p.notification_status || '未通知',
          created_at: p.created_at || new Date().toISOString(),
          sourceType: 'payment',
          itemCategory: cat
        });
      });
    }

    // 2. 補充未填報 payments 但有金額之待繳費／待確認租借單 (校正欄位名稱為 total_rent)
    const { data: unpaidLoans } = await supabase
      .from('loans')
      .select('*')
      .gt('total_rent', 0)
      .neq('payment_status', '已繳費 Paid')
      .order('created_at', { ascending: false });

    if (unpaidLoans && Array.isArray(unpaidLoans)) {
      unpaidLoans.forEach((l: any) => {
        // 若該筆 loan 已經有 payment 關聯，則不重複新增 (支援 target_id 與 type 字串匹配)
        const alreadyInPayments = items.some(it =>
          (it.target_id === l.id || it.id === l.id) ||
          (it.line_user_id === l.line_user_id && it.type && it.type.includes(l.id))
        );
        if (!alreadyInPayments) {
          items.push({
            id: l.id,
            line_user_id: l.line_user_id,
            name: l.name || '借用人',
            type: `裝備租借：${l.id}`,
            amount: l.total_rent || 0,
            status: l.payment_status === '已繳費 Paid'
              ? '已核銷 Confirmed'
              : l.payment_status === '待確認 Checking'
                ? '待確認 Checking'
                : '待繳費 Unpaid',
            payment_status: l.payment_status || '未繳費 Unpaid',
            notification_status: '未通知',
            created_at: l.created_at || new Date().toISOString(),
            sourceType: 'loan',
            itemCategory: 'equipment',
            target_type: 'loan',
            target_id: l.id
          });
        }
      });
    }

    // 3. 補充未填報 payments 之正取待繳費活動報名
    const { data: unpaidSignups } = await supabase
      .from('event_signups')
      .select('id, event_id, line_user_id, name, status, payment_status, notes, created_at, events(title, fee)')
      .eq('status', '正取 Confirmed')
      .neq('payment_status', '已繳費 Paid')
      .order('created_at', { ascending: false });

    if (unpaidSignups && Array.isArray(unpaidSignups)) {
      unpaidSignups.forEach((s: any) => {
        const fee = Number(s.events?.fee) || 0;
        if (fee > 0) {
          const alreadyInPayments = items.some(it =>
            it.line_user_id === s.line_user_id && (
              it.target_id === s.event_id ||
              it.target_id === s.id ||
              (it.type && s.events?.title && it.type.includes(s.events.title)) ||
              (it.type && s.event_id && it.type.includes(s.event_id))
            )
          );
          if (!alreadyInPayments) {
            items.push({
              id: s.id,
              line_user_id: s.line_user_id,
              name: s.name || '活動參加者',
              type: `活動：${s.events?.title || s.event_id}`,
              amount: fee,
              status: s.payment_status === '已繳費 Paid'
                ? '已核銷 Confirmed'
                : s.payment_status === '待確認 Checking'
                  ? '待確認 Checking'
                  : '待繳費 Unpaid',
              payment_status: s.payment_status || '未繳費 Unpaid',
              notes: s.notes || '',
              notification_status: '未通知',
              created_at: s.created_at || new Date().toISOString(),
              sourceType: 'event_signup',
              itemCategory: 'activity',
              target_type: 'event',
              target_id: s.event_id
            });
          }
        }
      });
    }

    return items;
  } catch (err: any) {
    console.error('[Supabase] fetchFinanceItemsFromSupabase 例外:', err);
    throw err;
  }
};

/**
 * 幹部後台：財務審核狀態更新與雙向連動
 */
export const updatePaymentAndLinkedStatusInSupabase = async (params: {
  paymentId: string;
  sourceType: 'payment' | 'loan' | 'event_signup';
  targetType?: string | null;
  targetId?: string | null;
  newStatus: '待繳費 Unpaid' | '待確認 Checking' | '已核銷 Confirmed';
  officerName?: string;
  lineUserId?: string | null;
  notes?: string | null;
  officerUserId?: string;
  paymentType?: string;
  notificationStatus?: '未通知' | '已通知' | string;
}): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: '缺少 Supabase 連線' };

  // 1. 優先嘗試 RPC (幹部鑑權，完全豁免 RLS 限制)
  if (params.officerUserId && params.officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_admin_payment_status_rpc', {
        p_officer_line_user_id: params.officerUserId,
        p_payment_id: params.paymentId,
        p_source_type: params.sourceType,
        p_target_type: params.targetType || null,
        p_target_id: params.targetId || null,
        p_status: params.newStatus,
        p_line_user_id: params.lineUserId || null,
        p_officer_name: params.officerName || '管理幹部',
        p_notes: params.notes || null,
        p_notification_status: params.notificationStatus || null
      });
      if (!rpcErr && rpcRes && rpcRes.success) {
        return { success: true };
      }
      if (rpcErr) {
        console.warn('[Supabase] update_admin_payment_status_rpc 失敗，切換直更模式:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] update_admin_payment_status_rpc 例外，切換直更模式:', err);
    }
  }

  try {
    const isConfirmed = params.newStatus === '已核銷 Confirmed';
    const mappedPayStatus = isConfirmed
      ? '已繳費 Paid'
      : params.newStatus === '待繳費 Unpaid'
        ? '未繳費 Unpaid'
        : '待確認 Checking';
    const nowIso = new Date().toISOString();

    if (params.sourceType === 'payment') {
      const updatePayload: any = {
        status: params.newStatus,
        confirmed_by: isConfirmed ? (params.officerName || '管理幹部') : null,
        confirmed_at: isConfirmed ? nowIso : null,
        officer_notes: params.notes,
        updated_at: nowIso
      };
      if (params.notificationStatus) {
        updatePayload.notification_status = params.notificationStatus;
      }

      const { data: updatedRows, error: pErr } = await supabase
        .from('payments')
        .update(updatePayload)
        .eq('id', params.paymentId)
        .select('id');

      if (pErr) {
        return { success: false, error: `[更新 payments 失敗]: ${pErr.message} (代碼: ${pErr.code || 'UNKNOWN'})` };
      }

      if (!updatedRows || updatedRows.length === 0) {
        return {
          success: false,
          error: `[更新 payments 失敗]: 資料庫未變更任何資料列 (可能缺少 RLS 寫入權限或該單號不存在)，請確認已執行最新 admin_portal_rpc.sql 腳本`
        };
      }

      const isMembership =
        params.targetType === 'membership' ||
        (params.paymentType && (params.paymentType.includes('社費') || params.paymentType.includes('Membership')));

      // 雙向連動：活動報名
      if (params.targetType === 'event' && params.targetId && params.lineUserId) {
        await supabase
          .from('event_signups')
          .update({ payment_status: mappedPayStatus, updated_at: nowIso })
          .eq('event_id', params.targetId)
          .eq('line_user_id', params.lineUserId);
      } else if (params.targetType === 'loan' && params.targetId) {
        // 雙向連動：裝備租借
        await supabase
          .from('loans')
          .update({ payment_status: mappedPayStatus, updated_at: nowIso })
          .eq('id', params.targetId);
      } else if (isMembership && params.lineUserId) {
        // 雙向連動：社費繳納 (包含正式社員標記與到期日提取)
        if (isConfirmed) {
          const match = (params.paymentType || '').match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
          const expiryDate = match ? match[1].replace(/\//g, '-') : undefined;

          const memberUpdate: any = {
            payment_status: '已繳費 Paid',
            is_official_member: true,
            updated_at: nowIso
          };
          if (expiryDate) {
            memberUpdate.membership_expires_at = expiryDate;
          }

          await supabase
            .from('members')
            .update(memberUpdate)
            .eq('line_user_id', params.lineUserId);
        } else {
          await supabase
            .from('members')
            .update({ payment_status: mappedPayStatus, updated_at: nowIso })
            .eq('line_user_id', params.lineUserId);
        }
      } else if (params.lineUserId && isConfirmed) {
        // 多筆或未指定 target 時，若已核銷則將該使用者未繳費項目一併轉為已繳費
        await supabase
          .from('event_signups')
          .update({ payment_status: '已繳費 Paid', updated_at: nowIso })
          .eq('line_user_id', params.lineUserId)
          .eq('payment_status', '待確認 Checking');

        await supabase
          .from('loans')
          .update({ payment_status: '已繳費 Paid', updated_at: nowIso })
          .eq('line_user_id', params.lineUserId)
          .eq('payment_status', '待確認 Checking');
      }
    } else if (params.sourceType === 'loan') {
      const { data: updatedLoanRows, error: lErr } = await supabase
        .from('loans')
        .update({
          payment_status: mappedPayStatus,
          updated_at: nowIso
        })
        .eq('id', params.paymentId)
        .select('id');

      if (lErr) {
        return { success: false, error: `[更新 loans 繳費狀態失敗]: ${lErr.message} (代碼: ${lErr.code || 'UNKNOWN'})` };
      }

      if (!updatedLoanRows || updatedLoanRows.length === 0) {
        return {
          success: false,
          error: `[更新 loans 失敗]: 資料庫未變更任何資料列 (可能缺少 RLS 寫入權限或該租借單不存在)`
        };
      }
    } else if (params.sourceType === 'event_signup') {
      const { data: updatedSignupRows, error: sErr } = await supabase
        .from('event_signups')
        .update({
          payment_status: mappedPayStatus,
          updated_at: nowIso
        })
        .eq('id', params.paymentId)
        .select('id');

      if (sErr) {
        return { success: false, error: `[更新 event_signups 繳費狀態失敗]: ${sErr.message} (代碼: ${sErr.code || 'UNKNOWN'})` };
      }

      if (!updatedSignupRows || updatedSignupRows.length === 0) {
        return {
          success: false,
          error: `[更新 event_signups 失敗]: 資料庫未變更任何資料列 (可能缺少 RLS 寫入權限或該活動報名紀錄不存在)`
        };
      }
    }

    return { success: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[財務核銷雙向更新例外]: ${msg}` };
  }
};

/**
 * 幹部後台：取得所有裝備租借訂單 (loans，優先調用 get_admin_loans_rpc)
 */
export const fetchAllLoansFromSupabase = async (officerUserId?: string): Promise<AdminLoanItem[]> => {
  if (!supabase) return [];

  // 1. 優先調用 get_admin_loans_rpc (幹部鑑權專屬 RPC，豁免 42501 權限限制並關聯品項明細)
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_loans_rpc', {
        p_officer_line_user_id: officerUserId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && Array.isArray(rpcRes.loans)) {
        return rpcRes.loans as AdminLoanItem[];
      }
      if (rpcErr) {
        console.warn('[Supabase] get_admin_loans_rpc 呼叫失敗，嘗試直接查詢:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_loans_rpc 例外，切換直讀備援:', err);
    }
  }

  try {
    const { data, error } = await supabase
      .from('loans')
      .select('*')
      .order('start_date', { ascending: false });

    if (error) {
      console.error('[Supabase] 讀取 loans 失敗:', error.message);
      throw new Error(`[Supabase 讀取 loans 失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
    }

    return (data || []).map((l: any) => ({
      ...l,
      days: l.days || (l.start_date && l.end_date ? Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1) : 1),
      total_fee: l.total_rent || l.total_fee || 0
    })) as AdminLoanItem[];
  } catch (err: any) {
    console.error('[Supabase] fetchAllLoansFromSupabase 例外:', err);
    throw err;
  }
};

/**
 * 幹部後台：更新裝備租借狀態 (loans.status)
 */
export const updateLoanStatusInSupabase = async (
  loanId: string,
  newStatus: '待領取 To Be Collected' | '租借中 Borrowed' | '已歸還 Returned' | '已取消 Cancelled',
  notes?: string,
  officerUserId?: string
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase || !loanId) return { success: false, error: '缺少必要參數' };

  // 1. 優先嘗試 RPC
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('update_admin_loan_status_rpc', {
        p_officer_line_user_id: officerUserId,
        p_loan_id: loanId,
        p_status: newStatus,
        p_notes: notes || null
      });
      if (!rpcErr && rpcRes && rpcRes.success) {
        return { success: true };
      }
      if (rpcErr) {
        console.warn('[Supabase] update_admin_loan_status_rpc 失敗，切換直更模式:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] update_admin_loan_status_rpc 例外，切換直更模式:', err);
    }
  }

  try {
    const updateObj: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    if (notes !== undefined) {
      updateObj.notes = notes;
    }
    if (newStatus === '已取消 Cancelled') {
      updateObj.cancelled_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('loans')
      .update(updateObj)
      .eq('id', loanId);

    if (error) {
      console.error('[Supabase] 更新租借狀態失敗:', error.message);
      return { success: false, error: `[更新租借狀態失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})` };
    }

    return { success: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[更新租借狀態例外]: ${msg}` };
  }
};

/**
 * 幹部後台：取得社團全部裝備 (包括開放與不開放外借)
 */
export const fetchAllInventoryFromSupabase = async (): Promise<AdminInventoryItem[]> => {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('equipments')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[Supabase] 讀取全裝備庫存失敗:', error.message);
      throw new Error(`[Supabase 讀取全裝備庫存失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})`);
    }

    return (data || []) as AdminInventoryItem[];
  } catch (err: any) {
    console.error('[Supabase] fetchAllInventoryFromSupabase 例外:', err);
    throw err;
  }
};

/**
 * 幹部後台：自動計算下一筆裝備流水號 (例如 EQ_001, EQ_002...)
 */
export const getNextEquipmentIdFromSupabase = async (): Promise<string> => {
  if (!supabase) return 'G001';

  try {
    const { data, error } = await supabase
      .from('equipments')
      .select('id');

    if (error || !data || data.length === 0) {
      return 'G001';
    }

    let maxNum = 0;
    data.forEach((row: any) => {
      const gMatch = String(row.id).match(/^G(\d+)$/i);
      if (gMatch && gMatch[1]) {
        const num = parseInt(gMatch[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    if (maxNum === 0) {
      data.forEach((row: any) => {
        const eqMatch = String(row.id).match(/^EQ_(\d+)$/i);
        if (eqMatch && eqMatch[1]) {
          const num = parseInt(eqMatch[1], 10);
          if (num > maxNum) maxNum = num;
        }
      });
    }

    const nextNum = maxNum + 1;
    return `G${String(nextNum).padStart(3, '0')}`;
  } catch {
    return 'G001';
  }
};

/**
 * 幹部後台：新增裝備品項
 */
export const insertEquipmentToSupabase = async (
  item: Omit<AdminInventoryItem, 'created_at'>
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase) return { success: false, error: '缺少 Supabase 連線' };

  try {
    const insertPayload: Record<string, any> = {
      ...item,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    // 防呆過濾：equipments 資料表不存在 specs 欄位，僅有 notes 欄位
    delete insertPayload.specs;

    const { error } = await supabase
      .from('equipments')
      .insert([insertPayload]);

    if (error) {
      console.error('[Supabase] 新增裝備失敗:', error.message);
      return { success: false, error: `[新增裝備失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})` };
    }

    return { success: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[新增裝備例外]: ${msg}` };
  }
};

/**
 * 幹部後台：更新裝備全欄位
 */
export const updateEquipmentFullInSupabase = async (
  id: string,
  fields: Partial<AdminInventoryItem>
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase || !id) return { success: false, error: '缺少必要參數' };

  try {
    const updatePayload: Record<string, any> = {
      ...fields,
      updated_at: new Date().toISOString()
    };
    delete updatePayload.id;
    // 防呆過濾：equipments 資料表不存在 specs 欄位，僅有 notes 欄位
    delete updatePayload.specs;

    const { data, error } = await supabase
      .from('equipments')
      .update(updatePayload)
      .eq('id', id)
      .select();

    if (error) {
      console.error('[Supabase] 更新裝備失敗:', error.message);
      return { success: false, error: `[更新裝備失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})` };
    }

    if (!data || data.length === 0) {
      return { success: false, error: `[更新裝備失敗]: 找不到裝備編號 ${id} 或無更新權限` };
    }

    return { success: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[更新裝備例外]: ${msg}` };
  }
};

/**
 * 幹部後台：刪除裝備品項
 */
export const deleteEquipmentFromSupabase = async (
  id: string
): Promise<{ success: boolean; error?: string }> => {
  if (!supabase || !id) return { success: false, error: '缺少必要參數' };

  try {
    const { error } = await supabase
      .from('equipments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Supabase] 刪除裝備失敗:', error.message);
      return { success: false, error: `[刪除裝備失敗]: ${error.message} (代碼: ${error.code || 'UNKNOWN'})` };
    }

    return { success: true };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `[刪除裝備例外]: ${msg}` };
  }
};

export interface MemberTimelineResult {
  member: {
    line_user_id: string;
    name: string;
    student_id?: string;
    department?: string;
    phone?: string;
    email?: string;
    role?: string;
    avatar_url?: string;
  } | null;
  records: MemberTimelineRecord[];
}

/**
 * 幹部後台：取得單一社員之個人歷史全紀錄 (活動、裝備、繳費混合歷程)
 */
export const fetchMemberTimelineRecordsFromSupabase = async (
  targetUserId: string,
  officerUserId?: string
): Promise<MemberTimelineResult> => {
  if (!supabase || !targetUserId) {
    return { member: null, records: [] };
  }

  // 1. 優先嘗試由專屬 RPC 函式取得整合全紀錄
  if (officerUserId && officerUserId !== 'TEST_USER_ID') {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_admin_member_records_rpc', {
        p_officer_line_user_id: officerUserId,
        p_target_user_id: targetUserId
      });
      if (!rpcErr && rpcRes && rpcRes.status === 'success' && Array.isArray(rpcRes.records)) {
        let member = rpcRes.member || null;
        if (!member || !member.name) {
          try {
            const fallbackMember = await fetchMemberFullDetailFromSupabase(targetUserId, officerUserId);
            if (fallbackMember) {
              member = {
                line_user_id: fallbackMember.line_user_id,
                name: fallbackMember.name,
                student_id: fallbackMember.student_id || undefined,
                department: fallbackMember.department || undefined,
                phone: fallbackMember.phone || undefined,
                email: fallbackMember.email || undefined,
                role: fallbackMember.is_officer ? (fallbackMember.officer_role || '幹部') : (fallbackMember.identity_status || '一般社員')
              };
            }
          } catch (e) {
            console.warn('[Supabase] memberDetail fallback 例外:', e);
          }
        }
        return {
          member,
          records: rpcRes.records as MemberTimelineRecord[]
        };
      }
      if (rpcErr) {
        console.warn('[Supabase] get_admin_member_records_rpc 呼叫失敗，嘗試直接讀取表:', rpcErr.message);
      }
    } catch (err) {
      console.warn('[Supabase] get_admin_member_records_rpc 例外，啟用直查備援:', err);
    }
  }

  // 2. 直查資料表備援邏輯
  try {
    // 查詢社員基本資料 (優先調用成熟之全欄位詳情函式)
    let memberInfo: MemberTimelineResult['member'] = null;
    try {
      const fullDetail = await fetchMemberFullDetailFromSupabase(targetUserId, officerUserId);
      if (fullDetail) {
        memberInfo = {
          line_user_id: fullDetail.line_user_id,
          name: fullDetail.name,
          student_id: fullDetail.student_id || undefined,
          department: fullDetail.department || undefined,
          phone: fullDetail.phone || undefined,
          email: fullDetail.email || undefined,
          role: fullDetail.is_officer ? (fullDetail.officer_role || '幹部') : (fullDetail.identity_status || '一般社員')
        };
      }
    } catch (mErr) {
      console.warn('[Supabase] fetchMemberFullDetailFromSupabase 備援例外:', mErr);
    }

    if (!memberInfo) {
      const { data: memberData } = await supabase
        .from('members')
        .select('line_user_id, name, student_id, department, phone, email, identity_status, is_officer, officer_role')
        .eq('line_user_id', targetUserId)
        .maybeSingle();

      if (memberData) {
        memberInfo = {
          line_user_id: memberData.line_user_id,
          name: memberData.name,
          student_id: memberData.student_id || undefined,
          department: memberData.department || undefined,
          phone: memberData.phone || undefined,
          email: memberData.email || undefined,
          role: memberData.is_officer ? (memberData.officer_role || '幹部') : (memberData.identity_status || '一般社員')
        };
      }
    }

    const allRecords: MemberTimelineRecord[] = [];

    // 查詢活動紀錄 (event_signups JOIN events)
    const { data: signupsData } = await supabase
      .from('event_signups')
      .select(`
        id,
        created_at,
        status,
        payment_status,
        notes,
        events:event_id (
          id,
          title,
          start_date,
          end_date,
          fee,
          status
        )
      `)
      .eq('line_user_id', targetUserId);

    if (signupsData && Array.isArray(signupsData)) {
      signupsData.forEach((s: any) => {
        const ev = s.events;
        const title = ev?.title || '社團活動';
        const startStr = ev?.start_date ? ev.start_date.split('T')[0].replace(/-/g, '/') : '';
        const endStr = ev?.end_date ? ev.end_date.split('T')[0].replace(/-/g, '/') : '';
        const dateDisplay = (startStr && endStr && startStr !== endStr) ? `${startStr} ~ ${endStr}` : (startStr || '未定日期');

        allRecords.push({
          id: `activity_${s.id}`,
          category: 'activity',
          categoryLabel: '活動紀錄',
          title,
          timestamp: s.created_at || new Date().toISOString(),
          dateDisplay,
          status: s.status || '已報名 Signed Up',
          paymentStatus: s.payment_status || '未繳費 Unpaid',
          amount: ev?.fee ? Number(ev.fee) : 0,
          notes: s.notes || null,
          officerNotes: null,
          details: {
            eventId: ev?.id,
            eventStatus: ev?.status,
            signupStatus: s.status,
            paymentStatus: s.payment_status,
            signupDate: s.created_at
          }
        });
      });
    }

    // 查詢裝備借用紀錄 (loans JOIN loan_items)
    const { data: loansData } = await supabase
      .from('loans')
      .select(`
        id,
        created_at,
        start_date,
        end_date,
        days,
        purpose,
        total_deposit,
        total_rent,
        total_fee,
        status,
        payment_status,
        notes,
        loan_items (
          equipment_id,
          quantity,
          subtotal,
          equipments (name)
        )
      `)
      .eq('line_user_id', targetUserId);

    if (loansData && Array.isArray(loansData)) {
      loansData.forEach((l: any) => {
        let itemsSummary = '裝備租借';
        if (Array.isArray(l.loan_items) && l.loan_items.length > 0) {
          itemsSummary = l.loan_items
            .map((li: any) => `${li.equipments?.name || li.equipment_id || '裝備'} x ${li.quantity || 1}`)
            .join(', ');
        }

        const startStr = l.start_date ? l.start_date.split('T')[0].replace(/-/g, '/') : '';
        const endStr = l.end_date ? l.end_date.split('T')[0].replace(/-/g, '/') : '';
        const computedDays = l.days || (l.start_date && l.end_date
          ? Math.max(1, Math.round((new Date(l.end_date).getTime() - new Date(l.start_date).getTime()) / 86400000) + 1)
          : 1);

        const dateDisplay = (startStr && endStr)
          ? `${startStr} ~ ${endStr} (共 ${computedDays} 天)`
          : (startStr || '未定日期');

        allRecords.push({
          id: `loan_${l.id}`,
          category: 'equipment',
          categoryLabel: '裝備借用',
          title: itemsSummary,
          timestamp: l.created_at || new Date().toISOString(),
          dateDisplay,
          status: l.status || '待領取 To Be Collected',
          paymentStatus: l.payment_status || '未繳費 Unpaid',
          amount: l.total_fee ? Number(l.total_fee) : 0,
          notes: l.notes || null,
          officerNotes: null,
          details: {
            loanId: l.id,
            purpose: l.purpose,
            totalDeposit: l.total_deposit,
            totalRent: l.total_rent,
            totalFee: l.total_fee,
            days: computedDays,
            items: l.loan_items
          }
        });
      });
    }

    // 查詢繳費紀錄 (payments)
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*')
      .eq('line_user_id', targetUserId);

    if (paymentsData && Array.isArray(paymentsData)) {
      paymentsData.forEach((p: any) => {
        const createdDate = p.created_at
          ? p.created_at.substring(0, 16).replace('T', ' ').replace(/-/g, '/')
          : '申報紀錄';

        allRecords.push({
          id: `payment_${p.id}`,
          category: 'payment',
          categoryLabel: '繳費紀錄',
          title: p.type || '款項申報',
          timestamp: p.created_at || new Date().toISOString(),
          dateDisplay: createdDate,
          status: p.status || '待確認 Checking',
          paymentStatus: p.status || '待確認 Checking',
          amount: p.amount ? Number(p.amount) : 0,
          notes: p.notes || null,
          officerNotes: p.officer_notes || null,
          details: {
            paymentId: p.id,
            bankLast5: p.bank_last5,
            proofImageUrl: p.proof_image_url,
            targetType: p.target_type,
            targetId: p.target_id,
            notificationStatus: p.notification_status || '未通知'
          }
        });
      });
    }

    // 預設依時間排序：上新下舊
    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      member: memberInfo || null,
      records: allRecords
    };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Supabase] fetchMemberTimelineRecordsFromSupabase 異常:', msg);
    throw new Error(`[載入社員歷程失敗]: ${msg}`);
  }
};



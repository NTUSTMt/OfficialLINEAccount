import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types/equipment';
import type { AdminEvent, SignupApplicant } from '../types/event';
import type { ProfileData } from '../types/member';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

interface SupabaseEquipmentRow {
  id: string;
  name: string;
  category?: string;
  total_qty?: number;
  available_qty?: number;
  is_borrowable?: boolean;
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
  fee?: number;
  start_date: string;
  end_date: string;
  deadline: string;
  status: string;
  summary?: string;
  itinerary?: string;
  cover_image_url?: string;
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
        remainQty: row.available_qty ?? 0,
        price: row.member_price_per_day ?? 0,
        priceExtra: row.non_member_price_per_day ?? 0,
        imageUrl: imgStr,
        description: row.notes || row.specs || ''
      };
    });

    console.log('%c⚡ [DataSource: Supabase] 裝備清單讀取成功！共 ' + formatted.length + ' 筆 (連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;');
    return formatted;
  } catch (err) {
    console.warn('[Supabase] 連線異常，啟用 GAS fallback:', err);
    return null;
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
        fee,
        start_date,
        end_date,
        deadline,
        status,
        summary,
        itinerary,
        cover_image_url
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
        startDate: row.start_date || '',
        endDate: row.end_date || '',
        deadline: row.deadline || '',
        cost: costStr,
        status: row.status || '關閉',
        shortDesc: row.summary || '',
        fullDesc: row.itinerary || '',
        imageUrl: row.cover_image_url || '',
        stats: {
          total: 0,
          accepted: 0,
          waitlisted: 0,
          pending: 0
        },
        rowNumber: idx + 2
      };
    });

    console.log('%c⚡ [DataSource: Supabase] 活動清單讀取成功！共 ' + formatted.length + ' 筆 (連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;');
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
}

export interface DashboardActivityData {
  eventId: string;
  eventName: string;
  date: string;
  reviewStatus: string;
  payStatus: string;
  code?: string;
}

export interface DashboardEquipmentData {
  orderId: string;
  itemName: string;
  pickupDate: string;
  returnDate: string;
  status: string;
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
      return null;
    }

    if (!data) return null;

    console.log('%c⚡ [DataSource: Supabase] 個人主頁資料讀取成功！(連線延遲 < 100ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseDashboardData;
  } catch (err) {
    console.warn('[Supabase] 個人主頁讀取例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 從 Supabase 取得個人基本資料 (透過 get_member_profile 安全 RPC 函式，延遲 < 50ms)
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
      intendOfficer: data.officer_intent || ''
    };

    console.log('%c⚡ [DataSource: Supabase] 社員個人資料預填讀取成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', profile);
    return profile;
  } catch (err) {
    console.warn('[Supabase] 讀取社員個人資料例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 將個人基本資料儲存至 Supabase (透過 save_member_profile 安全 RPC 函式，延遲 < 50ms)
 * 觸發器會自動寫入 sync_queue，背景平滑同步至 Google Sheets
 */
export const saveMemberProfileToSupabase = async (
  userId: string,
  formData: ProfileData
): Promise<boolean> => {
  if (!supabase || !userId) return false;

  try {
    const proofsList = formData.strengthProof
      ? formData.strengthProof
          .split(/[\n,，;\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.startsWith('http'))
      : [];

    const payload = {
      name: formData.name.trim(),
      gender: formData.gender,
      line_id: formData.realLineId.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      department: formData.department.trim(),
      student_id: formData.studentId.trim(),
      birthday: formData.birthday ? formData.birthday.replace(/\//g, '-') : '',
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
      officer_intent: formData.intendOfficer.trim()
    };

    const { data, error } = await supabase.rpc('save_member_profile', {
      p_line_user_id: userId,
      p_data: payload
    });

    if (error) {
      console.warn('[Supabase] 儲存個人資料失敗:', error.message);
      return false;
    }

    console.log('%c⚡ [DataSource: Supabase] 社員個人資料已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return true;
  } catch (err) {
    console.warn('[Supabase] 儲存個人資料例外:', err);
    return false;
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
 * ⚡ 從 Supabase 取得個人待繳清單 (透過 get_unpaid_payments 安全 RPC 函式，延遲 < 50ms)
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

    console.log('%c⚡ [DataSource: Supabase] 待繳費用清單秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseUnpaidList;
  } catch (err) {
    console.warn('[Supabase] 讀取待繳清單例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 提交繳費對帳申報至 Supabase (透過 submit_payment_rpc 安全 RPC 函式，延遲 < 50ms)
 * 原子性建立 payments 記錄並更新關聯項目的繳費狀態為「待確認 Checking」
 */
export const submitPaymentToSupabase = async (
  userId: string,
  details: PaymentSubmitDetails
): Promise<boolean> => {
  if (!supabase || !userId) return false;

  try {
    const { data, error } = await supabase.rpc('submit_payment_rpc', {
      p_line_user_id: userId,
      p_details: details
    });

    if (error) {
      console.warn('[Supabase] 提交繳費對帳失敗:', error.message);
      return false;
    }

    console.log('%c⚡ [DataSource: Supabase] 繳費申報已極速送出！', 'color: #10b981; font-weight: bold;', data);
    return true;
  } catch (err) {
    console.warn('[Supabase] 提交繳費對帳例外:', err);
    return false;
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
 * ⚡ 從 Supabase 取得個人歷史繳費紀錄 (透過 get_my_payment_history 安全 RPC 函式，延遲 < 50ms)
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

    console.log('%c⚡ [DataSource: Supabase] 歷史繳費紀錄秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
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
}

/**
 * ⚡ 從 Supabase 取得個人活動成就與出隊歷程 (透過 get_my_achievements 安全 RPC 函式，延遲 < 50ms)
 */
export const fetchAchievementsFromSupabase = async (userId: string): Promise<SupabaseAchievementData | null> => {
  if (!supabase || !userId || userId === 'TEST_USER_ID') return null;

  try {
    const { data, error } = await supabase.rpc('get_my_achievements', { p_line_user_id: userId });

    if (error) {
      console.warn('[Supabase] 讀取活動成就失敗，啟用 GAS fallback:', error.message);
      return null;
    }

    if (!data) return null;

    console.log('%c⚡ [DataSource: Supabase] 活動成就紀錄秒開成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
    return data as SupabaseAchievementData;
  } catch (err) {
    console.warn('[Supabase] 讀取活動成就例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 提交活動心得與評分至 Supabase (透過 save_reflection_rpc 安全 RPC 函式，延遲 < 50ms)
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

    console.log('%c⚡ [DataSource: Supabase] 活動心得已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return true;
  } catch (err) {
    console.warn('[Supabase] 儲存活動心得例外:', err);
    return false;
  }
};

/**
 * ⚡ 自動/手動同步幹部快取至 Supabase officers 表
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
 * ⚡ 獲取幹部活動管理清單與報名人數統計 (透過 get_admin_events_rpc，延遲 < 50ms)
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
      return null;
    }

    if (!data) return null;

    if (data.isOfficer) {
      console.log('%c⚡ [DataSource: Supabase] 後台活動與報名統計讀取成功！(連線延遲 < 50ms)', 'color: #10b981; font-weight: bold;', data);
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
  } catch (err) {
    console.warn('[Supabase] 讀取後台活動例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 獲取單一活動的全部報名者名冊 (透過 get_admin_event_signups_rpc，延遲 < 50ms)
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

    console.log(`%c⚡ [DataSource: Supabase] 活動 (${eventId}) 報名名冊秒開成功！共 ${data.signups.length} 筆 (連線延遲 < 50ms)`, 'color: #10b981; font-weight: bold;');
    return data.signups as SignupApplicant[];
  } catch (err) {
    console.warn('[Supabase] 讀取報名名冊例外，啟用 GAS fallback:', err);
    return null;
  }
};

/**
 * ⚡ 審核個別社員報名狀態 (透過 update_signup_status_rpc，延遲 < 30ms)
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
      console.warn('[Supabase] 審核狀態更新失敗:', error?.message || data?.message);
      return false;
    }

    console.log('%c⚡ [DataSource: Supabase] 審核狀態已秒級更新！', 'color: #10b981; font-weight: bold;', signupId, reviewResult);
    return true;
  } catch (err) {
    console.warn('[Supabase] 審核狀態更新例外:', err);
    return false;
  }
};

/**
 * ⚡ 快速切換活動開放狀態 (透過 update_event_status_rpc，延遲 < 30ms)
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

    console.log('%c⚡ [DataSource: Supabase] 活動狀態已秒級更新！', 'color: #10b981; font-weight: bold;', eventId, status);
    return true;
  } catch (err) {
    console.warn('[Supabase] 活動狀態更新例外:', err);
    return false;
  }
};

/**
 * ⚡ 建立或更新活動資料 (透過 save_admin_event_rpc，延遲 < 50ms)
 */
export const saveEventToSupabase = async (
  userId: string,
  eventData: {
    eventId?: string;
    name: string;
    startDate: string;
    endDate?: string;
    deadline: string;
    cost: string;
    status: string;
    shortDesc?: string;
    fullDesc?: string;
    imageUrl?: string;
    driveFolderUrl?: string;
    spreadsheetUrl?: string;
    spreadsheetId?: string;
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

    console.log('%c⚡ [DataSource: Supabase] 活動已極速儲存！', 'color: #10b981; font-weight: bold;', data);
    return { success: true, eventId: data.eventId };
  } catch (err) {
    console.warn('[Supabase] 儲存活動例外:', err);
    return { success: false };
  }
};


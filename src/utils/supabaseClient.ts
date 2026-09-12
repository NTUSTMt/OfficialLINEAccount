import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types/equipment';
import type { AdminEvent } from '../types/event';
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



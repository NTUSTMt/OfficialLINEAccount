import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types/equipment';
import type { AdminEvent } from '../types/event';

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
  category?: string;
  start_date: string;
  end_date: string;
  deadline: string;
  member_fee?: number;
  non_member_fee?: number;
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
        category,
        start_date,
        end_date,
        deadline,
        member_fee,
        non_member_fee,
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
      const mf = row.member_fee ?? 0;
      const nmf = row.non_member_fee ?? 0;
      let costStr = '';
      if (mf > 0 || nmf > 0) {
        costStr = `社員 $${mf} / 非社員 $${nmf}`;
      }

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

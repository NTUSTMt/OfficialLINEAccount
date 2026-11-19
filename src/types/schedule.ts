/**
 * 社務日程 (Calendar & Activity Hub) 型別定義
 * 定義排程資料流、篩選條件、日曆視圖單元格與外部日曆同步結構
 */

export type ScheduleSourceType =
  | 'event'
  | 'deadline'
  | 'finance'
  | 'loan_pickup'
  | 'loan_return'
  | 'school'
  | 'club_calendar';

export type ScheduleCategoryFilter =
  | 'all'
  | 'events'
  | 'school'
  | 'finance'
  | 'loans'
  | 'club_calendar';

export type ScheduleViewMode = 'calendar' | 'timeline';

export interface ScheduleEventDetails {
  event_id?: string;
  title?: string;
  fee?: number;
  status?: string;
  summary?: string;
  itinerary?: string;
  drive_folder_url?: string;
  spreadsheet_url?: string;
  start_date?: string;
  end_date?: string;
  deadline?: string;
  stats?: {
    accepted?: number;
    waitlist?: number;
    total?: number;
  };
}

export interface ScheduleFinanceDetails {
  payment_id?: string;
  name?: string;
  amount?: number;
  bank_last5?: string;
  type?: string;
  status?: string;
  proof_image_url?: string;
  notes?: string;
  officer_notes?: string;
  target_id?: string;
  target_type?: string;
  created_at?: string;
}

export interface ScheduleLoanDetails {
  loan_id?: string;
  name?: string;
  items?: Array<{ name: string; qty: number }> | string;
  purpose?: string;
  status?: string;
  payment_status?: string;
  total_fee?: number;
  start_date?: string;
  end_date?: string;
}

export interface ScheduleCalendarDetails {
  calendar_id?: string;
  calendar_type?: 'club' | 'school' | string;
  title?: string;
  description?: string;
  location?: string;
  is_all_day?: boolean;
}

export type ScheduleDetails = ScheduleEventDetails &
  ScheduleFinanceDetails &
  ScheduleLoanDetails &
  ScheduleCalendarDetails &
  Record<string, unknown>;

export interface ScheduleFeedItem {
  item_id: string;
  source_type: ScheduleSourceType | string;
  title: string;
  sub_text: string;
  start_time: string;
  end_time: string;
  is_macro: boolean;
  status_badge: string;
  link_path: string;
  details: ScheduleDetails;
}

export interface CalendarDateCell {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: ScheduleFeedItem[];
}

export interface FetchScheduleOptions {
  startTime?: string | null;
  endTime?: string | null;
  queryText?: string | null;
  category?: ScheduleCategoryFilter | string;
}

export interface CalendarSyncResult {
  success: boolean;
  message: string;
  clubCount?: number;
  schoolCount?: number;
  warnings?: string[];
  ntustSync?: Record<string, unknown> | null;
}

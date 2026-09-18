export interface AdminMemberListItem {
  line_user_id: string;
  name: string;
  identity_status?: string | null;
  department?: string | null;
  student_id?: string | null;
  line_id?: string | null;
  is_official_member: boolean;
  is_officer?: boolean | null;
  officer_role?: string | null;
  payment_status: string;
  created_at?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface MemberFullRecord {
  line_user_id: string;
  name: string;
  student_id?: string | null;
  department?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  id_card?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_rel?: string | null;
  emergency_contact_address?: string | null;
  outdoor_experience?: string | null;
  fitness_desc?: string | null;
  proof_urls?: string[] | null;
  is_official_member: boolean;
  membership_expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  line_id?: string | null;
  payment_status: string;
  address?: string | null;
  medical_history?: string | null;
  identity_status?: string | null;
  join_membership_intent?: string | null;
  officer_intent?: string | null;
  want_to_say?: string | null;
  is_officer?: boolean | null;
  officer_role?: string | null;
}

export interface MemberActiveStats {
  unfinishedEvents: Array<{
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    signupStatus: string;
    payStatus: string;
  }>;
  activeLoans: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    payStatus: string;
    itemsSummary: string;
  }>;
  pendingPaymentsCount: number;
  pendingItems?: Array<{
    type: 'event' | 'loan' | 'membership';
    title: string;
    status: string;
  }>;
}

export interface AdminFinanceItem {
  id: string;
  line_user_id?: string | null;
  name: string;
  type: string;
  amount: number;
  bank_last5?: string | null;
  proof_image_url?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  status: '待確認 Checking' | '已核銷 Confirmed';
  payment_status?: '未繳費 Unpaid' | '待確認 Checking' | '已繳費 Paid';
  officer_notes?: string | null;
  notes?: string | null;
  notification_status?: '未通知' | '已通知' | string | null;
  created_at: string;
  sourceType: 'payment' | 'loan' | 'event_signup';
  itemCategory: 'activity' | 'equipment' | 'membership' | 'general';
}

export interface AdminLoanItem {
  id: string;
  line_user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  days: number;
  purpose: string;
  purpose_other?: string | null;
  status: '待領取 To Be Collected' | '租借中 Borrowed' | '已歸還 Returned' | '已取消 Cancelled';
  payment_status: '未繳費 Unpaid' | '待確認 Checking' | '已繳費 Paid';
  total_fee: number;
  total_rent?: number;
  total_deposit?: number;
  is_official_member_snapshot?: boolean;
  refund_needed?: boolean;
  items?: Array<{
    equipment_id?: string;
    name?: string;
    quantity: number;
    subtotal?: number;
  }> | null;
  notes?: string | null;
  created_at: string;
}

export interface AdminInventoryItem {
  id: string;
  name: string;
  category: '睡眠系統' | '背負系統' | '炊事系統' | '照明通訊' | '攀登技術' | '行進安全' | '其他裝備';
  total_qty: number;
  available_qty: number;
  is_borrowable: boolean;
  price_2day: number;
  price_extra_day: number;
  member_price_per_day?: number;
  non_member_price_per_day?: number;
  status?: string | null;
  specs?: string | null;
  notes?: string | null;
  images?: string[] | null;
  sort_order?: number;
  created_at?: string;
}

export type MemberTimelineCategory = 'activity' | 'equipment' | 'payment';

export interface MemberTimelineRecord {
  id: string;
  category: MemberTimelineCategory;
  categoryLabel: string;
  title: string;
  timestamp: string; // 排序基準時間 (ISO 字串)
  dateDisplay: string; // 畫面上顯示的關鍵日期 (起訖日或申報日)
  status: string; // 主狀態 (例如 正取 Confirmed, 租借中 Borrowed, 已核銷 Confirmed)
  paymentStatus?: string; // 繳費狀態 (已繳費 Paid, 待確認 Checking, 未繳費 Unpaid)
  amount?: number; // 款項金額或費用 (若有)
  notes?: string | null; // 申請人備註或款項備註
  officerNotes?: string | null; // 幹部審核備註
  details: {
    [key: string]: any;
  };
}

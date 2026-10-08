export type PreferredLanguage = "zh" | "en" | null;

export type Gender = "男" | "女" | "其他";

export type PaymentStatusEnum = "已繳費 Paid" | "待確認 Checking" | "未繳費 Unpaid";

export type EventSignupStatusEnum =
  | "正取 Confirmed"
  | "正取（已繳費）Confirmed (Paid)"
  | "備取 Waitlisted"
  | "備取（有意願）Waitlisted (Interested)"
  | "審核中 Checking"
  | "已取消 Cancelled";

export type EquipmentCategoryEnum =
  | "睡眠系統"
  | "背負系統"
  | "炊事系統"
  | "照明通訊"
  | "攀登技術"
  | "行進安全"
  | "其他裝備";

export interface Member {
  line_user_id: string;
  name: string;
  student_id: string | null;
  department: string | null;
  gender: Gender | null;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  id_card: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_rel: string | null;
  emergency_contact_address: string | null;
  outdoor_experience: string | null;
  fitness_desc: string | null;
  proof_urls: string[];
  is_official_member: boolean;
  membership_expires_at: string | null;
  created_at: string;
  updated_at: string;
  line_id: string | null;
  payment_status: PaymentStatusEnum;
  address: string | null;
  medical_history: string | null;
  identity_status: string | null;
  join_membership_intent: string | null;
  officer_intent: string | null;
  want_to_say: string | null;
  is_officer: boolean;
  officer_role: string | null;
  preferred_language: "zh" | "en" | null;
  avatar_url: string | null;
}

export interface Officer {
  line_user_id: string;
  title: string;
  name: string | null;
  photo_url: string | null;
  responsibilities: string | null;
  message: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface EventRecord {
  id: string;
  title: string;
  title_en: string | null;
  start_date: string;
  end_date: string;
  deadline: string;
  fee: number;
  status: string;
  summary: string | null;
  summary_en: string | null;
  itinerary: string | null;
  itinerary_en: string | null;
  cover_image_url: string | null;
  drive_folder_url: string | null;
  spreadsheet_url: string | null;
  spreadsheet_id: string | null;
  line_group_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSignup {
  id: string;
  event_id: string;
  line_user_id: string;
  name: string | null;
  line_id: string | null;
  status: EventSignupStatusEnum;
  payment_status: PaymentStatusEnum;
  notification_status: string;
  is_official_member_snapshot: boolean;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategoryEnum;
  total_qty: number;
  available_qty: number;
  is_borrowable: boolean;
  price_2day: number;
  price_extra_day: number;
  status: string | null;
  notes: string | null;
  images: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  line_user_id: string;
  name: string | null;
  start_date: string;
  end_date: string;
  days: number;
  purpose: string;
  purpose_other: string | null;
  status: string;
  payment_status: PaymentStatusEnum;
  total_fee: number;
  total_rent: number;
  total_deposit: number;
  is_official_member_snapshot: boolean;
  refund_needed: boolean;
  items: Array<{
    id: string;
    name: string;
    qty: number;
    price: number;
  }>;
  notes: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  line_user_id: string;
  name: string;
  type: string;
  target_id: string | null;
  target_name: string | null;
  amount: number;
  last_five: string;
  status: string;
  verify_token: string | null;
  proof_url: string | null;
  submitted_at: string;
  verified_at: string | null;
  verifier: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reflection {
  id: number;
  event_id: string;
  line_user_id: string;
  nickname: string;
  overall_rating: number;
  scenery_rating: number;
  difficulty_rating: number;
  content: string;
  images: string[];
  is_public: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppConfig {
  key: string;
  value: string;
  updated_at: string;
}

export interface WebhookEvent {
  webhook_event_id: string;
  received_at: string;
}

export interface WorkerFailure {
  id: number;
  action: string;
  payload: Record<string, unknown>;
  error_message: string;
  status: string;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface BilingualText {
  zh: string;
  en: string;
}

export interface LineWebhookEventSource {
  type: "user" | "group" | "room";
  userId?: string;
  groupId?: string;
  roomId?: string;
}

export interface LineWebhookEvent {
  type: string;
  mode?: string;
  timestamp: number;
  source: LineWebhookEventSource;
  webhookEventId: string;
  deliveryContext?: {
    isRedelivery: boolean;
  };
  replyToken?: string;
  message?: {
    id: string;
    type: string;
    text?: string;
  };
  postback?: {
    data: string;
    params?: Record<string, string>;
  };
}

export interface LineWebhookPayload {
  destination?: string;
  events: LineWebhookEvent[];
}

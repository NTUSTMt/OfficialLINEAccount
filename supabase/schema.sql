-- ==============================================================================
-- 野境戶外裝備租借系統 (Wilderness Gear Rental Store)
-- Supabase (PostgreSQL) 核心資料表結構定義 (Schema DDL)
-- 版本：v0.1.44 (2026-09-12)
-- ==============================================================================

-- 1. 啟用 UUID 與擴充功能 (選用)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. 自動更新 updated_at 觸發函式
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. 會員資料表 (members) -> Google Sheets: Members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    line_user_id TEXT PRIMARY KEY,       -- 系統識別碼 (U1234567...)
    name TEXT NOT NULL,                  -- 姓名
    gender TEXT,                         -- 性別
    line_id TEXT,                        -- Line ID
    email TEXT,                          -- Email
    phone TEXT,                          -- 聯絡電話
    department TEXT,                     -- 系所
    student_id TEXT,                     -- 學號
    payment_status TEXT,                 -- 繳費狀態 (已繳費 Paid / 未繳費)
    membership_expires_at DATE,          -- 社籍到期日
    birthday TEXT,                       -- 生日 (格式：YYYY-MM-DD)
    id_card TEXT,                        -- 證件號碼 (身分證字號 / 居留證號)
    address TEXT,                        -- 聯絡地址
    outdoor_experience TEXT,             -- 爬山經驗
    fitness_desc TEXT,                   -- 體能測驗
    proof_urls JSONB DEFAULT '[]'::jsonb,-- 體能測驗證明 (Google Drive 連結陣列)
    emergency_contact_name TEXT,         -- 緊急聯絡人姓名
    emergency_contact_rel TEXT,          -- 緊急聯絡人關係
    emergency_contact_phone TEXT,        -- 緊急聯絡人電話
    emergency_contact_address TEXT,      -- 緊急聯絡人聯絡地址
    medical_history TEXT,                -- 個人特殊病史或過敏
    identity_status TEXT,                -- 身分狀態
    join_membership_intent TEXT,         -- 加入社員意願
    officer_intent TEXT,                 -- 擔任幹部意願
    is_official_member BOOLEAN DEFAULT FALSE, -- 正式社員身分 (由繳費狀態判定)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_members_updated_at
BEFORE UPDATE ON members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. 活動資料表 (events) -> Google Sheets: Events (10 大欄位精確對齊)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,                 -- 1. 活動編號 (如 E01, E20260901_01)
    title TEXT NOT NULL,                 -- 2. 活動名稱
    fee INTEGER NOT NULL DEFAULT 0,      -- 3. 預計費用 (純數字)
    start_date DATE NOT NULL,            -- 4. 活動開始日期 (YYYY-MM-DD)
    end_date DATE NOT NULL,              -- 5. 活動結束日期 (YYYY-MM-DD)
    deadline TIMESTAMPTZ NOT NULL,       -- 6. 報名截止日期 (精確時間戳記)
    status TEXT NOT NULL DEFAULT '開放', -- 7. 報名狀態 (開放 / 關閉)
    summary TEXT,                        -- 8. 簡介 (<=1000字)
    itinerary TEXT,                      -- 9. 詳細行程 (<=700字)
    cover_image_url TEXT,                -- 10. 封面圖網址
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. 活動報名名冊 (event_signups) -> Google Sheets: Signups
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_signups (
    id TEXT PRIMARY KEY, -- 報名專屬碼，如 S123456
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                           -- 社員姓名 (方便後台直觀辨識)
    status TEXT NOT NULL DEFAULT '審核中 Checking', 
    -- 正取 Confirmed / 正取（已繳費）Confirmed(Paid) / 備取 Waitlisted / 備取（有意願）Waitlisted (Interested) / 審核中 Checking / 已取消 Cancelled
    is_official_member_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_reason TEXT,
    notes TEXT, -- 如 【已繳費待退款】
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signups_event_id ON event_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_line_user_id ON event_signups(line_user_id);
CREATE INDEX IF NOT EXISTS idx_signups_status ON event_signups(status);

CREATE TRIGGER trg_signups_updated_at
BEFORE UPDATE ON event_signups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. 活動心得與登頂相片 (reflections) -> Google Sheets: Reflections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reflections (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                           -- 社員姓名 (方便後台直觀辨識)
    difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    beauty_rating INTEGER CHECK (beauty_rating >= 1 AND beauty_rating <= 5),
    content TEXT,
    photo_urls JSONB DEFAULT '[]'::jsonb, -- Google Drive 相片連結陣列
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_reflections_event_user UNIQUE (event_id, line_user_id)
);

CREATE TRIGGER trg_reflections_updated_at
BEFORE UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. 裝備品項資料表 (equipments) -> Google Sheets: Equipments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipments (
    id TEXT PRIMARY KEY, -- 裝備代號，如 EQ_TENT_01
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    total_qty INTEGER NOT NULL DEFAULT 0,
    available_qty INTEGER NOT NULL DEFAULT 0,
    is_borrowable BOOLEAN NOT NULL DEFAULT TRUE,
    member_price_per_day INTEGER NOT NULL DEFAULT 0,
    non_member_price_per_day INTEGER NOT NULL DEFAULT 0,
    images JSONB DEFAULT '[]'::jsonb, -- Google Drive 照片連結陣列
    specs TEXT,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_equipments_updated_at
BEFORE UPDATE ON equipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 8. 裝備租借主訂單 (loans) -> Google Sheets: Loan_Records (主表部分)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY, -- 租借單號，如 ORD_20260912_01
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                           -- 社員姓名 (方便後台直觀辨識)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days INTEGER NOT NULL DEFAULT 1,
    purpose TEXT NOT NULL DEFAULT '社團出隊',
    purpose_other TEXT,
    status TEXT NOT NULL DEFAULT '待領取 To Be Collected', 
    -- 待領取 To Be Collected / 租借中 Borrowed / 已歸還 Returned / 已取消 Cancelled / 已取消 (待退款)
    payment_status TEXT NOT NULL DEFAULT '未繳費', 
    -- 未繳費 / 待確認 Checking / 已繳費 Paid
    total_deposit INTEGER NOT NULL DEFAULT 0,
    total_rent INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    refund_needed BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(line_user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_payment_status ON loans(payment_status);

CREATE TRIGGER trg_loans_updated_at
BEFORE UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 9. 裝備租借細項明細 (loan_items) -> Google Sheets: Loan_Records (明細展開)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan_items (
    id BIGSERIAL PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    equipment_id TEXT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_snapshot INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_loan_items_loan_id ON loan_items(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_items_equipment_id ON loan_items(equipment_id);

-- ------------------------------------------------------------------------------
-- 10. 繳費申報資料表 (payments) -> Google Sheets: Payments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, -- 繳費單號，如 PAY_20260912_01
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                           -- 社員姓名 (方便後台直觀辨識)
    type TEXT NOT NULL, -- 繳交社費 / 活動：<名稱> / 裝備租借 / combined
    target_type TEXT,   -- membership / event / loan / multi
    target_id TEXT,     -- event_id 或 loan_id 或 NULL
    amount INTEGER NOT NULL DEFAULT 0,
    bank_last5 TEXT,
    proof_image_url TEXT, -- Google Drive 匯款證明相片連結
    status TEXT NOT NULL DEFAULT '待確認 Checking', -- 待確認 Checking / 已核銷 Confirmed / 退件 Rejected
    officer_notes TEXT,
    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(line_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 11. Google Sheets 背景同步佇列 (sync_queue)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL, -- INSERT / UPDATE / DELETE
    record_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending / processing / completed / failed
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);

-- ------------------------------------------------------------------------------
-- 12. Row Level Security (RLS) 安全存取策略
-- ------------------------------------------------------------------------------
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- 公開唯讀原則：裝備與活動清單開放匿名讀取（提供 LIFF 首屏秒開）
CREATE POLICY "Public read equipments" ON equipments
    FOR SELECT USING (true);

CREATE POLICY "Public read events" ON events
    FOR SELECT USING (status != '草稿 Draft');

-- 服務端金鑰 (service_role) 擁有全表完整存取權限 (供 Edge Functions 與 Sync Worker 使用)
CREATE POLICY "Service role full access members" ON members
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access signups" ON event_signups
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access reflections" ON reflections
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access loans" ON loans
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access loan_items" ON loan_items
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access sync_queue" ON sync_queue
    FOR ALL USING (auth.role() = 'service_role');

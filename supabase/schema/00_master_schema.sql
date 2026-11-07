-- ==============================================================================
-- NTUST Mountaineering Club System - Master Database Schema
-- 權威單一真值綱要 (Single Source of Truth)
-- 由模組 01 ~ 06 自動編譯串接而成，請勿手動直接編輯本檔
-- ==============================================================================

-- >>> FILE: 01_types_and_enums.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 01 - 型別、列舉與通用觸發防護 (01_types_and_enums.sql)
-- ==============================================================================

-- 1. 啟用 PostgreSQL 核心擴充套件
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. 通用時間戳記自動更新函式 (updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 自訂列舉型別 (PostgreSQL Custom ENUM Types)
-- ------------------------------------------------------------------------------

-- 3.1 活動報名狀態列舉 (event_signup_status_enum)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_signup_status_enum') THEN
        CREATE TYPE event_signup_status_enum AS ENUM (
            '正取 Confirmed',
            '正取（已繳費）Confirmed (Paid)',
            '備取 Waitlisted',
            '備取（有意願）Waitlisted (Interested)',
            '審核中 Checking',
            '已取消 Cancelled'
        );
    END IF;
END $$;

-- 3.2 繳費狀態列舉 (payment_status_enum)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
            '已繳費 Paid',
            '待確認 Checking',
            '未繳費 Unpaid'
        );
    END IF;
END $$;

-- 3.3 裝備分類列舉 (equipment_category)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_category') THEN
        CREATE TYPE equipment_category AS ENUM (
            '睡眠系統',
            '背負系統',
            '炊事系統',
            '照明通訊',
            '攀登技術',
            '行進安全',
            '其他裝備'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. 型別隱式安全轉換器 (Safe CAST Functions)
-- ------------------------------------------------------------------------------

-- 4.1 TEXT 轉 payment_status_enum 隱式轉換器
-- 注意：必須優先判定「未繳費 Unpaid」，避免 Unpaid 因包含 "paid" 子字串而被誤判為「已繳費 Paid」
CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val TEXT)
RETURNS payment_status_enum
LANGUAGE plpgsql
IMMUTABLE
AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' OR val LIKE '%未繳費%' OR val LIKE '%Unpaid%' THEN
        RETURN '未繳費 Unpaid'::payment_status_enum;
    ELSIF val LIKE '%已繳費%' OR val = 'Paid' OR val LIKE '%已繳費 Paid%' THEN
        RETURN '已繳費 Paid'::payment_status_enum;
    ELSIF val LIKE '%待確認%' OR val LIKE '%Checking%' THEN
        RETURN '待確認 Checking'::payment_status_enum;
    ELSE
        RETURN '未繳費 Unpaid'::payment_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '未繳費 Unpaid'::payment_status_enum;
END;
$cast$;

DROP CAST IF EXISTS (TEXT AS payment_status_enum);
CREATE CAST (TEXT AS payment_status_enum)
WITH FUNCTION text_to_payment_status_enum(TEXT) AS IMPLICIT;

-- 4.2 TEXT 轉 event_signup_status_enum 隱式轉換器
CREATE OR REPLACE FUNCTION text_to_event_signup_status_enum(val TEXT)
RETURNS event_signup_status_enum
LANGUAGE plpgsql
IMMUTABLE
AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' OR val LIKE '%審核中%' OR val LIKE '%Checking%' THEN
        RETURN '審核中 Checking'::event_signup_status_enum;
    ELSIF val LIKE '%正取（已繳費）%' OR val LIKE '%Confirmed (Paid)%' THEN
        RETURN '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
    ELSIF val LIKE '%正取%' OR val LIKE '%Confirmed%' THEN
        RETURN '正取 Confirmed'::event_signup_status_enum;
    ELSIF val LIKE '%備取（有意願）%' OR val LIKE '%Waitlisted (Interested)%' THEN
        RETURN '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
    ELSIF val LIKE '%備取%' OR val LIKE '%Waitlisted%' THEN
        RETURN '備取 Waitlisted'::event_signup_status_enum;
    ELSIF val LIKE '%取消%' OR val LIKE '%Cancelled%' THEN
        RETURN '已取消 Cancelled'::event_signup_status_enum;
    ELSE
        RETURN '審核中 Checking'::event_signup_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '審核中 Checking'::event_signup_status_enum;
END;
$cast$;

DROP CAST IF EXISTS (TEXT AS event_signup_status_enum);
CREATE CAST (TEXT AS event_signup_status_enum)
WITH FUNCTION text_to_event_signup_status_enum(TEXT) AS IMPLICIT;

-- <<< FILE: 01_types_and_enums.sql <<<

-- >>> FILE: 02_members_and_officers.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 02 - 會員與幹部管理 (02_members_and_officers.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 會員基本資料表 (members) -> Google Sheets: Members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    line_user_id TEXT PRIMARY KEY,                       -- LINE 官方唯一識別碼 (U123456...)
    name TEXT NOT NULL,                                  -- 社員真實姓名
    gender TEXT,                                         -- 性別 (男 / 女 / 其他)
    nationality TEXT,                                    -- 國籍 (外籍社員記錄國家名稱)
    line_id TEXT,                                        -- LINE ID (聯絡用)
    email TEXT,                                          -- 電子信箱
    phone TEXT,                                          -- 聯絡電話
    department TEXT,                                     -- 就讀系所或單位
    student_id TEXT,                                     -- 學號 (校外人士可留空或身分註記)
    payment_status payment_status_enum NOT NULL DEFAULT '未繳費 Unpaid', -- 社費繳納狀態
    membership_expires_at DATE,                          -- 社籍有效截止日
    birthday TEXT,                                       -- 生日 (格式：YYYY-MM-DD)
    id_card TEXT,                                        -- 證件號碼 (身分證字號 / 居留證號)
    address TEXT,                                        -- 聯絡地址
    outdoor_experience TEXT,                             -- 登山經歷與百岳座數
    fitness_desc TEXT,                                   -- 體能測驗或自述
    proof_urls JSONB DEFAULT '[]'::jsonb,                -- 體能測驗證明 (Google Drive 照片連結陣列)
    emergency_contact_name TEXT,                         -- 緊急聯絡人姓名
    emergency_contact_rel TEXT,                          -- 緊急聯絡人關係
    emergency_contact_phone TEXT,                        -- 緊急聯絡人電話
    emergency_contact_address TEXT,                      -- 緊急聯絡人地址
    medical_history TEXT,                                -- 特殊病史、慢性病或過敏藥物
    identity_status TEXT,                                -- 身分狀態 (在校學生 / 畢業校友 / 校外人士)
    join_membership_intent TEXT,                         -- 加入社員意願
    officer_intent TEXT,                                 -- 擔任幹部意願
    want_to_say TEXT,                                    -- 想說的話 (非必填留言)
    is_official_member BOOLEAN DEFAULT FALSE,            -- 正式社員身分 (享有裝備 5 折等權利)
    is_officer BOOLEAN DEFAULT FALSE,                    -- 是否具備幹部身分
    officer_role TEXT,                                   -- 幹部職稱或角色
    preferred_language TEXT DEFAULT 'zh',                -- 偏好介面語系 (zh / en)
    avatar_url TEXT,                                     -- 個人頭像圖片網址
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS nationality TEXT;

CREATE INDEX IF NOT EXISTS idx_members_payment_status ON members(payment_status);
CREATE INDEX IF NOT EXISTS idx_members_is_officer ON members(is_officer);

DROP TRIGGER IF EXISTS trg_members_updated_at ON members;
CREATE TRIGGER trg_members_updated_at
BEFORE UPDATE ON members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. 幹部名冊資料表 (officers) -> Google Sheets: Officers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS officers (
    line_user_id TEXT PRIMARY KEY,                       -- 幹部 LINE User ID (關聯 members.line_user_id)
    title TEXT DEFAULT '幹部',                           -- 幹部頭銜 (如：社長、活動長、裝備長)
    name TEXT,                                           -- 幹部姓名
    photo_url TEXT,                                      -- 幹部個人照片網址
    responsibilities TEXT,                               -- 幹部負責業務職責說明
    message TEXT,                                        -- 幹部寄語或自述
    role TEXT DEFAULT '幹部',                             -- 權限角色 (如：幹部、管理員)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officers_line_user_id ON officers(line_user_id);

DROP TRIGGER IF EXISTS trg_officers_updated_at ON officers;
CREATE TRIGGER trg_officers_updated_at
BEFORE UPDATE ON officers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. 身分鑑權核心函式 (is_officer)
-- 支援 JWT 權限宣告、service_role 與雙軌資料表比對，杜絕身分偽冒 (Anti-Spoofing)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_officer(p_line_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    -- 1. 服務端角色 (service_role) 具備完整管理權限
    IF auth.role() = 'service_role' THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' THEN
            RETURN EXISTS (
                SELECT 1 FROM officers WHERE line_user_id = trim(p_line_user_id)
                UNION
                SELECT 1 FROM members WHERE line_user_id = trim(p_line_user_id) AND (is_officer = TRUE OR officer_role IS NOT NULL)
            );
        END IF;
        RETURN TRUE;
    END IF;

    -- 2. 提取 JWT 宣告 (若呼叫者持有 Supabase Auth JWT)
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 3. 嚴格阻絕匿名呼叫與偽冒 (Anti-Spoofing & Unauthenticated Rejection)
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN FALSE;
    END IF;

    -- 若持有合法幹部 JWT 且未指定 ID 或 ID 為本人，直接核准
    IF v_jwt_officer IS TRUE THEN
        IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = v_jwt_sub THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 若持有非幹部 JWT 但意圖傳入他人幹部 ID 進行偽冒，直接拒絕 (Anti-Spoofing)
    IF v_jwt_officer IS NOT TRUE OR (p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub) THEN
        RETURN FALSE;
    END IF;

    v_target_id := trim(v_jwt_sub);
    IF v_target_id = '' OR v_target_id = 'TEST_USER_ID' THEN
        RETURN FALSE;
    END IF;

    -- 4. 雙軌資料表查核
    RETURN EXISTS (
        SELECT 1 FROM officers WHERE line_user_id = v_target_id
        UNION
        SELECT 1 FROM members WHERE line_user_id = v_target_id AND (is_officer = TRUE OR officer_role IS NOT NULL)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. 幹部快取同步函式 (sync_officer_cache_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_officer_cache_rpc(
    p_officer_line_user_id TEXT,
    p_name TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 身分守衛：非 service_role 且非現任幹部直接阻斷
    IF auth.role() != 'service_role' AND NOT is_officer(auth.jwt() ->> 'sub') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Permission denied: 僅限管理員或系統排程執行');
    END IF;

    IF p_officer_line_user_id IS NULL OR trim(p_officer_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '缺少 LINE User ID');
    END IF;

    INSERT INTO officers (line_user_id, name, role, updated_at)
    VALUES (
        trim(p_officer_line_user_id),
        COALESCE(NULLIF(trim(p_name), ''), '幹部成員'),
        COALESCE(NULLIF(trim(p_role), ''), '幹部'),
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = CASE WHEN EXCLUDED.name != '幹部成員' THEN EXCLUDED.name ELSE officers.name END,
        role = CASE WHEN EXCLUDED.role != '幹部' THEN EXCLUDED.role ELSE officers.role END,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. 會員端 RPC：取得個人資料 (get_member_profile)
-- 強制 JWT sub 校驗，徹底阻斷匿名與跨帳號 IDOR 讀取
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_member_profile(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 未持有效 JWT 宣告一律拒絕
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN jsonb_build_object('error', 'Unauthorized: 缺少有效身分憑證，請先透過 LINE 登入');
    END IF;

    -- 非幹部僅能讀取本人資料
    IF v_jwt_officer IS NOT TRUE THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object('error', 'Forbidden: Identity mismatch (禁止越權讀取他人個資)');
        END IF;
        v_target_id := v_jwt_sub;
    ELSE
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    END IF;

    IF v_target_id IS NULL OR v_target_id = '' OR v_target_id = 'TEST_USER_ID' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = v_target_id;
    IF FOUND THEN
        RETURN to_jsonb(v_member);
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 會員端 RPC：儲存個人資料 (save_member_profile)
-- proof_urls 採 JSONB 結構寫入，內建 caller 鑑權防篡改與幹部身分保護
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_member_profile(
    p_line_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN := FALSE;
    v_is_service_role BOOLEAN := FALSE;
    v_officer_role TEXT := NULL;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN jsonb_build_object('success', false, 'message', '無效的使用者識別碼');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role')
        OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Identity mismatch (禁止越權修改他人資料)');
        END IF;
    END IF;

    SELECT is_officer, officer_role INTO v_is_officer, v_officer_role
    FROM members
    WHERE line_user_id = trim(p_line_user_id);

    INSERT INTO members (
        line_user_id,
        name,
        gender,
        nationality,
        line_id,
        email,
        phone,
        department,
        student_id,
        birthday,
        id_card,
        address,
        outdoor_experience,
        fitness_desc,
        proof_urls,
        emergency_contact_name,
        emergency_contact_rel,
        emergency_contact_phone,
        emergency_contact_address,
        medical_history,
        identity_status,
        join_membership_intent,
        officer_intent,
        want_to_say,
        preferred_language,
        avatar_url,
        is_officer,
        officer_role,
        updated_at
    ) VALUES (
        trim(p_line_user_id),
        NULLIF(trim(p_data->>'name'), ''),
        NULLIF(trim(p_data->>'gender'), ''),
        NULLIF(trim(p_data->>'nationality'), ''),
        NULLIF(trim(p_data->>'line_id'), ''),
        NULLIF(trim(p_data->>'email'), ''),
        NULLIF(trim(p_data->>'phone'), ''),
        NULLIF(trim(p_data->>'department'), ''),
        NULLIF(trim(p_data->>'student_id'), ''),
        NULLIF(trim(p_data->>'birthday'), ''),
        NULLIF(trim(p_data->>'id_card'), ''),
        NULLIF(trim(p_data->>'address'), ''),
        NULLIF(trim(p_data->>'outdoor_experience'), ''),
        NULLIF(trim(p_data->>'fitness_desc'), ''),
        CASE
            WHEN jsonb_typeof(p_data->'proof_urls') = 'array' THEN p_data->'proof_urls'
            ELSE '[]'::jsonb
        END,
        NULLIF(trim(p_data->>'emergency_contact_name'), ''),
        NULLIF(trim(p_data->>'emergency_contact_rel'), ''),
        NULLIF(trim(p_data->>'emergency_contact_phone'), ''),
        NULLIF(trim(p_data->>'emergency_contact_address'), ''),
        NULLIF(trim(p_data->>'medical_history'), ''),
        NULLIF(trim(p_data->>'identity_status'), ''),
        NULLIF(trim(p_data->>'join_membership_intent'), ''),
        NULLIF(trim(p_data->>'officer_intent'), ''),
        NULLIF(trim(p_data->>'want_to_say'), ''),
        COALESCE(NULLIF(trim(p_data->>'preferred_language'), ''), 'zh'),
        NULLIF(trim(p_data->>'avatar_url'), ''),
        COALESCE(v_is_officer, FALSE),
        v_officer_role,
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE SET
        name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), members.name),
        gender = COALESCE(NULLIF(trim(EXCLUDED.gender), ''), members.gender),
        nationality = COALESCE(EXCLUDED.nationality, members.nationality),
        line_id = COALESCE(NULLIF(trim(EXCLUDED.line_id), ''), members.line_id),
        email = COALESCE(NULLIF(trim(EXCLUDED.email), ''), members.email),
        phone = COALESCE(NULLIF(trim(EXCLUDED.phone), ''), members.phone),
        department = COALESCE(NULLIF(trim(EXCLUDED.department), ''), members.department),
        student_id = COALESCE(NULLIF(trim(EXCLUDED.student_id), ''), members.student_id),
        birthday = COALESCE(NULLIF(trim(EXCLUDED.birthday), ''), members.birthday),
        id_card = COALESCE(NULLIF(trim(EXCLUDED.id_card), ''), members.id_card),
        address = COALESCE(NULLIF(trim(EXCLUDED.address), ''), members.address),
        outdoor_experience = COALESCE(NULLIF(trim(EXCLUDED.outdoor_experience), ''), members.outdoor_experience),
        fitness_desc = COALESCE(NULLIF(trim(EXCLUDED.fitness_desc), ''), members.fitness_desc),
        proof_urls = CASE
            WHEN p_data->'proof_urls' IS NOT NULL AND jsonb_typeof(p_data->'proof_urls') = 'array' THEN p_data->'proof_urls'
            ELSE members.proof_urls
        END,
        emergency_contact_name = COALESCE(NULLIF(trim(EXCLUDED.emergency_contact_name), ''), members.emergency_contact_name),
        emergency_contact_rel = COALESCE(NULLIF(trim(EXCLUDED.emergency_contact_rel), ''), members.emergency_contact_rel),
        emergency_contact_phone = COALESCE(NULLIF(trim(EXCLUDED.emergency_contact_phone), ''), members.emergency_contact_phone),
        emergency_contact_address = COALESCE(NULLIF(trim(EXCLUDED.emergency_contact_address), ''), members.emergency_contact_address),
        medical_history = COALESCE(NULLIF(trim(EXCLUDED.medical_history), ''), members.medical_history),
        identity_status = COALESCE(NULLIF(trim(EXCLUDED.identity_status), ''), members.identity_status),
        join_membership_intent = COALESCE(NULLIF(trim(EXCLUDED.join_membership_intent), ''), members.join_membership_intent),
        officer_intent = COALESCE(NULLIF(trim(EXCLUDED.officer_intent), ''), members.officer_intent),
        want_to_say = COALESCE(NULLIF(trim(EXCLUDED.want_to_say), ''), members.want_to_say),
        preferred_language = COALESCE(NULLIF(trim(EXCLUDED.preferred_language), ''), members.preferred_language),
        avatar_url = COALESCE(NULLIF(trim(EXCLUDED.avatar_url), ''), members.avatar_url),
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 會員端 RPC：個人首頁儀表板資料聚合 (get_my_dashboard)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_dashboard(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_profile JSONB;
    v_activities JSONB;
    v_equipments JSONB;
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: 缺少有效身分憑證，請先登入');
    END IF;

    IF v_jwt_officer IS NOT TRUE THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: Identity mismatch (禁止越權讀取他人儀表板)');
        END IF;
        v_target_id := v_jwt_sub;
    ELSE
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    END IF;

    IF v_target_id IS NULL OR v_target_id = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少有效之使用者識別碼');
    END IF;

    -- 1. 個人檔案基本資料
    SELECT * INTO v_member FROM members WHERE line_user_id = v_target_id;
    IF FOUND THEN
        v_profile := jsonb_build_object(
            'name', COALESCE(v_member.name, '登山社員'),
            'studentId', COALESCE(v_member.student_id, ''),
            'department', COALESCE(v_member.department, ''),
            'isOfficial', COALESCE(v_member.is_official_member, FALSE) AND (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE),
            'isOfficialMember', COALESCE(v_member.is_official_member, false),
            'isOfficer', COALESCE(v_member.is_officer, FALSE),
            'officerRole', COALESCE(v_member.officer_role, ''),
            'membershipExpiresAt', COALESCE(to_char(v_member.membership_expires_at, 'YYYY-MM-DD'), ''),
            'expireDate', CASE 
                WHEN v_member.membership_expires_at IS NOT NULL THEN to_char(v_member.membership_expires_at, 'YYYY/MM/DD')
                ELSE '尚未核發/尚未繳費 (Not issued/Unpaid)'
            END,
            'phone', COALESCE(v_member.phone, ''),
            'email', COALESCE(v_member.email, ''),
            'paymentStatus', COALESCE(v_member.payment_status::text, '未繳費 Unpaid'),
            'avatarUrl', COALESCE(v_member.avatar_url, ''),
            'preferredLanguage', COALESCE(v_member.preferred_language, 'zh')
        );
    ELSE
        v_profile := jsonb_build_object(
            'name', '新訪客',
            'department', '',
            'studentId', '',
            'isOfficial', FALSE,
            'isOfficialMember', false,
            'isOfficer', FALSE,
            'officerRole', '',
            'expireDate', '尚未核發/尚未繳費 (Not issued/Unpaid)',
            'paymentStatus', '未繳費 Unpaid',
            'preferredLanguage', 'zh'
        );
    END IF;

    -- 2. 個人參與活動清單 (僅排除已取消項目，正取且非取消者才釋出 lineGroupUrl)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', s.id,
            'code', s.id,
            'eventId', e.id,
            'eventName', CASE 
                WHEN COALESCE(v_member.preferred_language, 'zh') = 'en' AND e.title_en IS NOT NULL AND trim(e.title_en) != '' THEN e.title_en
                ELSE e.title
            END,
            'eventNameZh', e.title,
            'eventNameEn', e.title_en,
            'title', e.title,
            'titleEn', COALESCE(e.title_en, ''),
            'startDate', to_char(e.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(e.end_date, 'YYYY/MM/DD'),
            'date', to_char(e.start_date, 'YYYY/MM/DD') || CASE WHEN e.end_date != e.start_date THEN ' ~ ' || to_char(e.end_date, 'YYYY/MM/DD') ELSE '' END,
            'status', s.status::text,
            'reviewStatus', s.status::text,
            'paymentStatus', s.payment_status::text,
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'lineGroupUrl', CASE 
                WHEN s.status::text LIKE '%正取%' AND s.status::text NOT LIKE '%取消%' THEN e.line_group_url 
                ELSE NULL 
            END,
            'coverImageUrl', COALESCE(e.cover_image_url, '')
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = v_target_id
          AND s.status != '已取消 Cancelled'::event_signup_status_enum
        ORDER BY e.start_date DESC
    ) a;

    -- 3. 個人裝備租借清單 (僅呈現進行中與待領取)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', l.id,
            'orderId', l.id,
            'itemName', COALESCE(
                (
                    SELECT string_agg(eq_sub.name || ' x ' || li.quantity, ', ')
                    FROM loan_items li
                    JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
                    WHERE li.loan_id = l.id
                ),
                '租借裝備'
            ),
            'startDate', to_char(l.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(l.end_date, 'YYYY/MM/DD'),
            'pickupDate', to_char(l.start_date, 'YYYY/MM/DD'),
            'returnDate', to_char(l.end_date, 'YYYY/MM/DD'),
            'days', l.days,
            'status', l.status,
            'paymentStatus', l.payment_status::text,
            'payStatus', CASE 
                WHEN COALESCE(l.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(l.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(l.payment_status::text, '') LIKE '%待確認%' OR COALESCE(l.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                ELSE '未繳費'
            END,
            'totalRent', l.total_rent,
            'totalDeposit', l.total_deposit,
            'itemsSummary', COALESCE((
                SELECT string_agg(eq_sub.name || ' x ' || li.quantity, ', ')
                FROM loan_items li
                JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
                WHERE li.loan_id = l.id
            ), '裝備租借')
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = v_target_id
          AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed')
        ORDER BY l.start_date DESC
    ) b;

    RETURN jsonb_build_object(
        'status', 'success',
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：取得全體社員名冊 (get_admin_members_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_members_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_members JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取社員名冊！',
            'members', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(m_row ORDER BY m_row.created_at DESC), '[]'::jsonb)
    INTO v_members
    FROM (
        SELECT 
            line_user_id,
            name,
            gender,
            nationality,
            line_id,
            email,
            phone,
            department,
            student_id,
            payment_status,
            to_char(membership_expires_at, 'YYYY-MM-DD') AS membership_expires_at,
            birthday,
            id_card,
            address,
            outdoor_experience,
            fitness_desc,
            proof_urls,
            emergency_contact_name,
            emergency_contact_rel,
            emergency_contact_phone,
            emergency_contact_address,
            medical_history,
            identity_status,
            join_membership_intent,
            officer_intent,
            want_to_say,
            is_official_member,
            is_officer,
            officer_role,
            preferred_language,
            avatar_url,
            to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM members
    ) m_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'members', v_members
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. 幹部端 RPC：取得單一社員個人概況與活躍統計 (get_admin_member_detail_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_member_detail_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member_json JSONB;
    v_active_events JSONB;
    v_active_loans JSONB;
    v_pending_items JSONB;
    v_pending_count INT := 0;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！'
        );
    END IF;

    SELECT row_to_json(m.*)::jsonb INTO v_member_json 
    FROM members m 
    WHERE m.line_user_id = trim(p_target_user_id) 
    LIMIT 1;

    IF v_member_json IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', TRUE,
            'message', '查無此社員資料'
        );
    END IF;

    -- 查詢未結束活動
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'startDate', to_char(e.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(e.end_date::timestamp, 'YYYY-MM-DD'),
        'signupStatus', s.status::TEXT,
        'payStatus', s.payment_status::TEXT
    )), '[]'::jsonb)
    INTO v_active_events
    FROM event_signups s
    JOIN events e ON s.event_id = e.id
    WHERE s.line_user_id = trim(p_target_user_id)
      AND s.status != '已取消 Cancelled';

    -- 查詢進行中租借
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'startDate', to_char(l.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(l.end_date::timestamp, 'YYYY-MM-DD'),
        'status', l.status::TEXT,
        'payStatus', l.payment_status::TEXT,
        'itemsSummary', COALESCE((
            SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
            FROM loan_items li
            JOIN equipments eq ON li.equipment_id = eq.id
            WHERE li.loan_id = l.id
        ), '裝備租借')
    )), '[]'::jsonb)
    INTO v_active_loans
    FROM loans l
    WHERE l.line_user_id = trim(p_target_user_id)
      AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed');

    -- 計算待結繳費項目
    SELECT COALESCE(jsonb_agg(p_item), '[]'::jsonb)
    INTO v_pending_items
    FROM (
        SELECT 'event' AS type, '活動：' || e.title AS title, s.payment_status::TEXT AS status
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_target_user_id)
          AND s.status = '正取 Confirmed'
          AND s.payment_status != '已繳費 Paid'
        UNION ALL
        SELECT 'loan' AS type, '裝備租借：' || COALESCE((
            SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
            FROM loan_items li
            JOIN equipments eq ON li.equipment_id = eq.id
            WHERE li.loan_id = l.id
        ), '裝備') AS title, l.payment_status::TEXT AS status
        FROM loans l
        WHERE l.line_user_id = trim(p_target_user_id)
          AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed')
          AND l.payment_status != '已繳費 Paid'
        UNION ALL
        SELECT 'membership' AS type, '社費：社籍費用' AS title, m.payment_status::TEXT AS status
        FROM members m
        WHERE m.line_user_id = trim(p_target_user_id)
          AND m.payment_status != '已繳費 Paid'
    ) p_item;

    v_pending_count := jsonb_array_length(v_pending_items);

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'member', v_member_json,
        'activeStats', jsonb_build_object(
            'unfinishedEvents', v_active_events,
            'activeLoans', v_active_loans,
            'pendingPaymentsCount', v_pending_count,
            'pendingItems', v_pending_items
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. 幹部端 RPC：取得社員完整歷史紀錄 (get_admin_member_records_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_member_records_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member_json JSONB;
    v_records JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！'
        );
    END IF;

    SELECT jsonb_build_object(
        'line_user_id', m.line_user_id,
        'name', m.name,
        'student_id', m.student_id,
        'department', m.department,
        'phone', m.phone,
        'email', m.email,
        'role', CASE WHEN m.is_officer = TRUE THEN COALESCE(m.officer_role, '幹部') ELSE COALESCE(m.identity_status, '一般社員') END,
        'avatar_url', m.avatar_url
    ) INTO v_member_json
    FROM members m
    WHERE m.line_user_id = trim(p_target_user_id)
    LIMIT 1;

    IF v_member_json IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', TRUE,
            'message', '查無此社員資料'
        );
    END IF;

    WITH unified_records AS (
        -- 1. 活動紀錄
        SELECT 
            'activity_' || s.id::TEXT AS record_id,
            'activity' AS category,
            '活動紀錄' AS category_label,
            e.title AS title,
            COALESCE(s.created_at, e.created_at, NOW()) AS sort_timestamp,
            to_char(e.start_date::timestamp, 'YYYY/MM/DD') || 
            CASE 
                WHEN e.end_date IS NOT NULL AND e.end_date != e.start_date 
                THEN ' ~ ' || to_char(e.end_date::timestamp, 'YYYY/MM/DD') 
                ELSE '' 
            END AS date_display,
            s.status::TEXT AS status,
            s.payment_status::TEXT AS payment_status,
            COALESCE(e.fee, 0)::NUMERIC AS amount,
            s.notes AS notes,
            NULL::TEXT AS officer_notes,
            jsonb_build_object(
                'eventId', e.id,
                'eventStatus', e.status,
                'signupStatus', s.status,
                'paymentStatus', s.payment_status,
                'signupDate', to_char(s.created_at::timestamp, 'YYYY/MM/DD HH24:MI')
            ) AS details
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_target_user_id)

        UNION ALL

        -- 2. 裝備借用紀錄
        SELECT 
            'loan_' || l.id::TEXT AS record_id,
            'equipment' AS category,
            '裝備借用' AS category_label,
            COALESCE((
                SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
                FROM loan_items li
                JOIN equipments eq ON li.equipment_id = eq.id
                WHERE li.loan_id = l.id
            ), '裝備租借') AS title,
            COALESCE(l.created_at, NOW()) AS sort_timestamp,
            to_char(l.start_date::timestamp, 'YYYY/MM/DD') || ' ~ ' || to_char(l.end_date::timestamp, 'YYYY/MM/DD') || 
            ' (共 ' || COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END) || ' 天)' AS date_display,
            l.status::TEXT AS status,
            l.payment_status::TEXT AS payment_status,
            COALESCE(l.total_fee, 0)::NUMERIC AS amount,
            l.notes AS notes,
            NULL::TEXT AS officer_notes,
            jsonb_build_object(
                'loanId', l.id,
                'purpose', l.purpose,
                'totalDeposit', l.total_deposit,
                'totalRent', l.total_rent,
                'totalFee', l.total_fee,
                'pickupDate', to_char(l.start_date::timestamp, 'YYYY/MM/DD'),
                'returnDate', to_char(l.end_date::timestamp, 'YYYY/MM/DD'),
                'days', COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END),
                'loanStatus', l.status,
                'paymentStatus', l.payment_status,
                'items', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'equipmentName', eq.name,
                        'quantity', li.quantity,
                        'subtotal', li.subtotal
                    ))
                    FROM loan_items li
                    JOIN equipments eq ON li.equipment_id = eq.id
                    WHERE li.loan_id = l.id
                )
            ) AS details
        FROM loans l
        WHERE l.line_user_id = trim(p_target_user_id)

        UNION ALL

        -- 3. 繳費紀錄
        SELECT 
            'payment_' || p.id::TEXT AS record_id,
            'payment' AS category,
            '繳費紀錄' AS category_label,
            p.type AS title,
            COALESCE(p.created_at, NOW()) AS sort_timestamp,
            to_char(p.created_at::timestamp, 'YYYY/MM/DD HH24:MI') AS date_display,
            p.status::TEXT AS status,
            p.status::TEXT AS payment_status,
            COALESCE(p.amount, 0)::NUMERIC AS amount,
            p.notes AS notes,
            p.officer_notes AS officer_notes,
            jsonb_build_object(
                'paymentId', p.id,
                'type', p.type,
                'amount', p.amount,
                'bankLast5', p.bank_last5,
                'proofImageUrl', p.proof_image_url,
                'targetType', p.target_type,
                'targetId', p.target_id,
                'notificationStatus', COALESCE(p.notification_status, '未通知'),
                'createdAt', to_char(p.created_at::timestamp, 'YYYY/MM/DD HH24:MI')
            ) AS details
        FROM payments p
        WHERE p.line_user_id = trim(p_target_user_id)
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', ur.record_id,
            'category', ur.category,
            'categoryLabel', ur.category_label,
            'title', ur.title,
            'timestamp', to_char(ur.sort_timestamp::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'dateDisplay', ur.date_display,
            'status', ur.status,
            'paymentStatus', ur.payment_status,
            'amount', ur.amount,
            'notes', ur.notes,
            'officerNotes', ur.officer_notes,
            'details', ur.details
        )
        ORDER BY ur.sort_timestamp DESC
    ), '[]'::jsonb)
    INTO v_records
    FROM unified_records ur;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'member', v_member_json,
        'records', v_records
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. 幹部端 RPC：更新社員詳細資料 (update_admin_member_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_admin_member_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部修改社員資料！');
    END IF;

    UPDATE members
    SET name = COALESCE(p_data->>'name', name),
        gender = COALESCE(p_data->>'gender', gender),
        nationality = COALESCE(p_data->>'nationality', nationality),
        line_id = COALESCE(p_data->>'line_id', line_id),
        email = COALESCE(p_data->>'email', email),
        phone = COALESCE(p_data->>'phone', phone),
        department = COALESCE(p_data->>'department', department),
        student_id = COALESCE(p_data->>'student_id', student_id),
        payment_status = CASE 
            WHEN p_data->>'payment_status' IS NOT NULL THEN (p_data->>'payment_status')::payment_status_enum 
            ELSE payment_status 
        END,
        membership_expires_at = CASE 
            WHEN p_data->>'membership_expires_at' IS NOT NULL AND p_data->>'membership_expires_at' != '' 
            THEN (p_data->>'membership_expires_at')::DATE 
            ELSE membership_expires_at 
        END,
        birthday = COALESCE(p_data->>'birthday', birthday),
        id_card = COALESCE(p_data->>'id_card', id_card),
        address = COALESCE(p_data->>'address', address),
        outdoor_experience = COALESCE(p_data->>'outdoor_experience', outdoor_experience),
        fitness_desc = COALESCE(p_data->>'fitness_desc', fitness_desc),
        emergency_contact_name = COALESCE(p_data->>'emergency_contact_name', emergency_contact_name),
        emergency_contact_rel = COALESCE(p_data->>'emergency_contact_rel', emergency_contact_rel),
        emergency_contact_phone = COALESCE(p_data->>'emergency_contact_phone', emergency_contact_phone),
        emergency_contact_address = COALESCE(p_data->>'emergency_contact_address', emergency_contact_address),
        medical_history = COALESCE(p_data->>'medical_history', medical_history),
        identity_status = COALESCE(p_data->>'identity_status', identity_status),
        join_membership_intent = COALESCE(p_data->>'join_membership_intent', join_membership_intent),
        officer_intent = COALESCE(p_data->>'officer_intent', officer_intent),
        want_to_say = COALESCE(p_data->>'want_to_say', want_to_say),
        is_official_member = CASE 
            WHEN p_data->'is_official_member' IS NOT NULL THEN (p_data->>'is_official_member')::BOOLEAN 
            ELSE is_official_member 
        END,
        is_officer = CASE 
            WHEN p_data->'is_officer' IS NOT NULL THEN (p_data->>'is_officer')::BOOLEAN 
            ELSE is_officer 
        END,
        officer_role = COALESCE(p_data->>'officer_role', officer_role),
        preferred_language = COALESCE(p_data->>'preferred_language', preferred_language),
        updated_at = NOW()
    WHERE line_user_id = trim(p_target_user_id);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '查無此社員或資料庫更新筆數為 0！');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE officers ENABLE ROW LEVEL SECURITY;

-- members 存取策略
DROP POLICY IF EXISTS "Service role full access members" ON members;
CREATE POLICY "Service role full access members" ON members
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can read all members" ON members;
CREATE POLICY "Officers can read all members" ON members
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own data" ON members;
CREATE POLICY "Members can read own data" ON members
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Officers can update all members" ON members;
CREATE POLICY "Officers can update all members" ON members
    FOR UPDATE TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can update own profile" ON members;
CREATE POLICY "Members can update own profile" ON members
    FOR UPDATE TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

-- officers 存取策略
DROP POLICY IF EXISTS "Service role full access officers" ON officers;
CREATE POLICY "Service role full access officers" ON officers
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers read officers" ON officers;
CREATE POLICY "Officers read officers" ON officers
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 權限指派
REVOKE EXECUTE ON FUNCTION sync_officer_cache_rpc(TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION sync_officer_cache_rpc(TEXT, TEXT, TEXT) TO service_role, authenticated;

GRANT EXECUTE ON FUNCTION is_officer(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_member_profile(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION get_admin_members_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_member_records_rpc(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_member_rpc(TEXT, TEXT, JSONB) TO authenticated, service_role;

-- <<< FILE: 02_members_and_officers.sql <<<

-- >>> FILE: 03_events_and_signups.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 03 - 活動、報名與心得評價 (03_events_and_signups.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 活動資料表 (events) -> Google Sheets: Events
-- 包含中英雙語行程、費用、日期、LINE群組、雲端相簿與名冊試算表
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,                                 -- 活動編號 (如 E01, E2409-01)
    title TEXT NOT NULL,                                 -- 活動名稱 (中文)
    title_en TEXT,                                       -- 活動名稱 (英文)
    fee INTEGER NOT NULL DEFAULT 0,                      -- 預計活動費用 (純數字)
    start_date DATE NOT NULL,                            -- 活動開始日期 (YYYY-MM-DD)
    end_date DATE NOT NULL,                              -- 活動結束日期 (YYYY-MM-DD)
    deadline TIMESTAMPTZ NOT NULL,                       -- 報名截止時間
    status TEXT NOT NULL DEFAULT '報名中 Open',          -- 報名狀態 (報名中 Open / 已截止 Closed / 已結束 Finished)
    summary TEXT,                                        -- 活動簡介 (中文)
    summary_en TEXT,                                     -- 活動簡介 (英文)
    itinerary TEXT,                                      -- 詳細行程 (中文)
    itinerary_en TEXT,                                   -- 詳細行程 (英文)
    cover_image_url TEXT,                                -- 封面圖網址
    drive_folder_url TEXT,                               -- Google Drive 專屬活動相簿資料夾網址
    spreadsheet_url TEXT,                                -- Google Sheets 專屬活動名冊試算表網址
    spreadsheet_id TEXT,                                 -- 專屬名冊試算表 ID
    line_group_url TEXT,                                 -- LINE 活動群組加入網址
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS line_group_url TEXT;

CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. 活動報名名冊 (event_signups) -> Google Sheets: Signups
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_signups (
    id TEXT PRIMARY KEY,                                 -- 報名專屬碼 (如 S123456)
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 隊員真實姓名 (快照方便直觀檢索)
    line_id TEXT,                                        -- LINE ID (關聯 members.line_id 方便幹部出隊聯絡)
    status event_signup_status_enum NOT NULL DEFAULT '審核中 Checking', -- 審核狀態
    payment_status payment_status_enum NOT NULL DEFAULT '未繳費 Unpaid', -- 活動繳費狀態
    notification_status TEXT DEFAULT '未發送',           -- LINE 錄取/取消推播狀態 (未發送 / 已發送)
    is_official_member_snapshot BOOLEAN NOT NULL DEFAULT FALSE, -- 報名當下社員資格快照
    cancel_reason TEXT,                                  -- 取消報名原因自述
    notes TEXT,                                          -- 幹部備註 (如：【已繳費待退款】)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signups_event_id ON event_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_line_user_id ON event_signups(line_user_id);
CREATE INDEX IF NOT EXISTS idx_signups_status ON event_signups(status);
CREATE INDEX IF NOT EXISTS idx_signups_payment_status ON event_signups(payment_status);

-- 建立防止同一用戶在同一活動重複「有效報名」之 Partial Unique Index (已取消 Cancelled 除外)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_signups_active_unique
    ON event_signups (line_user_id, event_id)
    WHERE status != '已取消 Cancelled'::event_signup_status_enum;

DROP TRIGGER IF EXISTS trg_signups_updated_at ON event_signups;
CREATE TRIGGER trg_signups_updated_at
BEFORE UPDATE ON event_signups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. 活動心得與登頂相片 (reflections) -> Google Sheets: Reflections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reflections (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 社員姓名
    difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    beauty_rating INTEGER CHECK (beauty_rating >= 1 AND beauty_rating <= 5),
    content TEXT,                                        -- 心得內文
    photo_urls JSONB DEFAULT '[]'::jsonb,                -- Google Drive 登頂相片連結陣列
    is_public BOOLEAN DEFAULT TRUE,                      -- 是否公開展示於全螢幕心得牆
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_reflections_event_user UNIQUE (event_id, line_user_id)
);

ALTER TABLE reflections ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_reflections_event_public ON reflections (event_id, is_public);

DROP TRIGGER IF EXISTS trg_reflections_updated_at ON reflections;
CREATE TRIGGER trg_reflections_updated_at
BEFORE UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. 活動原子報名 RPC (signup_rpc)
-- 包含活動截止檢查、個人個資完整度檢查、防重複報名，且不覆蓋 members.updated_at
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signup_rpc(
    p_event_id TEXT,
    p_line_user_id TEXT,
    p_signup_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event RECORD;
    v_member RECORD;
    v_missing_fields TEXT[] := ARRAY[]::TEXT[];
    v_days_since_update NUMERIC;
    v_existing_signup RECORD;
    v_is_official BOOLEAN := FALSE;
    v_actual_signup_id TEXT := p_signup_id;
    v_retry_count INT := 0;
BEGIN
    -- 1. 檢查活動是否存在
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', '活動不存在或已被刪除'
        );
    END IF;

    -- 2. 檢查活動是否截止或關閉
    IF (v_event.status ILIKE '%關閉%' OR v_event.status ILIKE '%closed%' OR v_event.status ILIKE '%已截止%' OR v_event.status ILIKE '%已結束%')
       OR (v_event.deadline IS NOT NULL AND NOW() > v_event.deadline) THEN
        RETURN jsonb_build_object(
            'status', 'closed',
            'message', '此活動報名已截止或已關閉'
        );
    END IF;

    -- 3. 檢查社員個資是否齊全
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'profile_incomplete',
            'message', '尚未填寫個人資料，請先至個人資料頁面完成登記',
            'missing_fields', ARRAY['name', 'phone', 'birthday', 'id_card', 'emergency_contact_name', 'emergency_contact_phone']
        );
    END IF;

    IF v_member.name IS NULL OR trim(v_member.name) = '' THEN v_missing_fields := array_append(v_missing_fields, 'name'); END IF;
    IF v_member.phone IS NULL OR trim(v_member.phone) = '' THEN v_missing_fields := array_append(v_missing_fields, 'phone'); END IF;
    IF v_member.birthday IS NULL OR trim(v_member.birthday) = '' THEN v_missing_fields := array_append(v_missing_fields, 'birthday'); END IF;
    IF v_member.id_card IS NULL OR trim(v_member.id_card) = '' THEN v_missing_fields := array_append(v_missing_fields, 'id_card'); END IF;
    IF v_member.emergency_contact_name IS NULL OR trim(v_member.emergency_contact_name) = '' THEN v_missing_fields := array_append(v_missing_fields, 'emergency_contact_name'); END IF;
    IF v_member.emergency_contact_phone IS NULL OR trim(v_member.emergency_contact_phone) = '' THEN v_missing_fields := array_append(v_missing_fields, 'emergency_contact_phone'); END IF;

    IF array_length(v_missing_fields, 1) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'profile_incomplete',
            'message', '請至個人資料補齊必填欄位後再進行報名',
            'missing_fields', v_missing_fields
        );
    END IF;

    -- 4. 檢查 180 天個資更新時效
    IF v_member.updated_at IS NOT NULL THEN
        v_days_since_update := EXTRACT(EPOCH FROM (NOW() - v_member.updated_at)) / 86400;
        IF v_days_since_update > 180 THEN
            RETURN jsonb_build_object(
                'status', 'profile_expired',
                'message', '您的個人資料已超過 180 天未確認，請先進入個資頁面檢視並儲存確認最新登山安全資訊',
                'days_since_update', ROUND(v_days_since_update)
            );
        END IF;
    END IF;

    -- 5. 檢查是否已有有效報名紀錄
    SELECT * INTO v_existing_signup 
    FROM event_signups 
    WHERE event_id = p_event_id AND line_user_id = p_line_user_id;

    IF FOUND THEN
        IF v_existing_signup.status != '已取消 Cancelled'::event_signup_status_enum THEN
            RETURN jsonb_build_object(
                'status', 'already_signed_up',
                'message', '您已報名過此活動（狀態：' || v_existing_signup.status::text || '），請勿重複報名',
                'signup_id', v_existing_signup.id
            );
        END IF;
    END IF;

    -- 6. 正式社員資格快照判定
    IF v_member.is_official_member IS TRUE 
       OR (v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at >= CURRENT_DATE) THEN
        v_is_official := TRUE;
    END IF;

    -- 7. 寫入或重新啟用報名紀錄
    IF v_existing_signup.id IS NOT NULL THEN
        UPDATE event_signups
        SET status = '審核中 Checking'::event_signup_status_enum,
            payment_status = '未繳費 Unpaid'::payment_status_enum,
            is_official_member_snapshot = v_is_official,
            cancel_reason = NULL,
            notes = NULL,
            name = COALESCE(v_member.name, event_signups.name),
            line_id = COALESCE(v_member.line_id, event_signups.line_id),
            notification_status = '未發送',
            updated_at = NOW()
        WHERE id = v_existing_signup.id;

        RETURN jsonb_build_object(
            'status', 'success',
            'message', '報名成功！已為您重新送出報名審核',
            'signup_id', v_existing_signup.id
        );
    ELSE
        -- 新增報名記錄，防主鍵碰撞重試
        LOOP
            BEGIN
                INSERT INTO event_signups (
                    id,
                    event_id,
                    line_user_id,
                    name,
                    line_id,
                    status,
                    payment_status,
                    notification_status,
                    is_official_member_snapshot,
                    created_at,
                    updated_at
                ) VALUES (
                    v_actual_signup_id,
                    p_event_id,
                    p_line_user_id,
                    v_member.name,
                    v_member.line_id,
                    '審核中 Checking'::event_signup_status_enum,
                    '未繳費 Unpaid'::payment_status_enum,
                    '未發送',
                    v_is_official,
                    NOW(),
                    NOW()
                );
                EXIT;
            EXCEPTION WHEN unique_violation THEN
                v_retry_count := v_retry_count + 1;
                IF v_retry_count > 5 THEN
                    RETURN jsonb_build_object(
                        'status', 'error',
                        'message', '產生報名編號時發生重複衝突，請稍後重試'
                    );
                END IF;
                v_actual_signup_id := 'S' || to_char(NOW(), 'YYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 100)::TEXT, 2, '0');
            END;
        END LOOP;

        RETURN jsonb_build_object(
            'status', 'success',
            'message', '報名成功！審核結果將透過 LINE 官方帳號推播通知',
            'signup_id', v_actual_signup_id
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', '報名作業失敗: ' || SQLERRM
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. 活動報名取消 RPC (cancel_event_signup_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_event_signup_rpc(
    p_line_user_id TEXT,
    p_signup_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_signup RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN := FALSE;
    v_is_service_role BOOLEAN := FALSE;
    v_refund_pending BOOLEAN := FALSE;
    v_note TEXT;
BEGIN
    IF p_line_user_id IS NULL OR p_signup_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role')
        OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人活動報名');
        END IF;
    END IF;

    SELECT * INTO v_signup
    FROM event_signups
    WHERE (id = p_signup_id OR event_id = p_signup_id)
      AND line_user_id = trim(p_line_user_id)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此報名紀錄或非本人申請');
    END IF;

    IF v_signup.status = '已取消 Cancelled'::event_signup_status_enum THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此報名紀錄已取消');
    END IF;

    v_refund_pending := v_signup.payment_status::text IN ('已繳費 Paid', '待確認 Checking');
    v_note := NULLIF(trim(COALESCE(v_signup.notes, '')), '');

    IF v_refund_pending AND position('【已繳費待退款】' IN COALESCE(v_note, '')) = 0 THEN
        v_note := concat_ws(E'\n', v_note, '【已繳費待退款】');
    END IF;
    IF p_reason IS NOT NULL AND trim(p_reason) <> '' THEN
        v_note := concat_ws(E'\n', v_note, '[取消原因] ' || trim(p_reason));
    END IF;

    UPDATE event_signups
    SET status = '已取消 Cancelled'::event_signup_status_enum,
        cancel_reason = COALESCE(NULLIF(trim(p_reason), ''), v_signup.cancel_reason, '社員自個人主頁取消'),
        notes = v_note,
        updated_at = NOW()
    WHERE id = v_signup.id;

    RETURN jsonb_build_object(
        'status', 'success',
        'refund_pending', v_refund_pending,
        'message', '活動報名已成功取消！'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 幹部端 RPC：取得活動清單與報名人數統計 (get_admin_events_rpc)
-- 包含雙語英文欄位與分類名額計數
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_events_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_officer_record officers%ROWTYPE;
    v_events JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！',
            'events', '[]'::jsonb
        );
    END IF;

    SELECT * INTO v_officer_record FROM officers WHERE line_user_id = trim(p_officer_line_user_id) LIMIT 1;

    SELECT COALESCE(jsonb_agg(evt), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'name', e.title,
            'nameEn', COALESCE(e.title_en, ''),
            'startDate', to_char(e.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(e.end_date, 'YYYY/MM/DD'),
            'deadline', to_char(e.deadline AT TIME ZONE 'Asia/Taipei', 'YYYY/MM/DD'),
            'cost', CASE WHEN e.fee > 0 THEN '$' || e.fee ELSE '免費' END,
            'status', COALESCE(e.status, '報名中 Open'),
            'shortDesc', COALESCE(e.summary, ''),
            'shortDescEn', COALESCE(e.summary_en, ''),
            'fullDesc', COALESCE(e.itinerary, ''),
            'fullDescEn', COALESCE(e.itinerary_en, ''),
            'imageUrl', COALESCE(e.cover_image_url, ''),
            'driveFolderUrl', COALESCE(e.drive_folder_url, ''),
            'spreadsheetUrl', COALESCE(e.spreadsheet_url, ''),
            'spreadsheetId', COALESCE(e.spreadsheet_id, ''),
            'lineGroupUrl', COALESCE(e.line_group_url, ''),
            'stats', jsonb_build_object(
                'total', COUNT(s.id) FILTER (WHERE s.status::text NOT LIKE '%取消%' AND s.status::text NOT LIKE '%Cancelled%'),
                'accepted', COUNT(s.id) FILTER (WHERE s.status::text LIKE '%正取%'),
                'waitlisted', COUNT(s.id) FILTER (WHERE s.status::text LIKE '%備取%'),
                'pending', COUNT(s.id) FILTER (WHERE s.status::text NOT LIKE '%正取%' AND s.status::text NOT LIKE '%備取%' AND s.status::text NOT LIKE '%取消%' AND s.status::text NOT LIKE '%Cancelled%')
            ),
            'rowNumber', ROW_NUMBER() OVER (ORDER BY e.start_date DESC) + 1
        ) AS evt
        FROM events e
        LEFT JOIN event_signups s ON e.id = s.event_id
        GROUP BY e.id, e.title, e.title_en, e.start_date, e.end_date, e.deadline, e.fee, e.status, e.summary, e.summary_en, e.itinerary, e.itinerary_en, e.cover_image_url, e.drive_folder_url, e.spreadsheet_url, e.spreadsheet_id, e.line_group_url
        ORDER BY e.start_date DESC
    ) sub;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'officerRole', COALESCE(v_officer_record.role, '幹部'),
        'officerName', COALESCE(v_officer_record.name, '幹部'),
        'events', v_events
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：儲存或新增活動 (save_admin_event_rpc)
-- 支援自動生成 E{yyMM}-{流水號} 格式與雙語行程
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_admin_event_rpc(
    p_officer_line_user_id TEXT,
    p_event_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id TEXT;
    v_cost_num INTEGER := 0;
    v_start_date DATE;
    v_end_date DATE;
    v_deadline TIMESTAMPTZ;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法編輯活動');
    END IF;

    v_event_id := trim(COALESCE(p_event_data->>'eventId', ''));
    IF v_event_id = '' THEN
        DECLARE
            v_prefix TEXT := 'E' || to_char(NOW(), 'YYMM') || '-';
            v_max_seq INTEGER := 0;
            v_curr_seq INTEGER;
            r RECORD;
        BEGIN
            FOR r IN SELECT id FROM events WHERE id LIKE v_prefix || '%' LOOP
                BEGIN
                    v_curr_seq := (regexp_replace(substring(r.id from length(v_prefix) + 1), '[^0-9]', '', 'g'))::INTEGER;
                    IF v_curr_seq > v_max_seq THEN
                        v_max_seq := v_curr_seq;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                END;
            END LOOP;
            v_event_id := v_prefix || lpad((v_max_seq + 1)::TEXT, 2, '0');
        END;
    END IF;

    -- 解析費用
    BEGIN
        v_cost_num := regexp_replace(COALESCE(p_event_data->>'cost', '0'), '[^0-9]', '', 'g')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_cost_num := 0;
    END;

    -- 解析日期
    v_start_date := (p_event_data->>'startDate')::DATE;
    v_end_date := COALESCE(NULLIF(p_event_data->>'endDate', '')::DATE, v_start_date);
    v_deadline := COALESCE(
        NULLIF(p_event_data->>'deadline', '')::TIMESTAMPTZ,
        (v_start_date::TEXT || ' 23:59:59+08')::TIMESTAMPTZ
    );

    INSERT INTO events (
        id,
        title,
        title_en,
        start_date,
        end_date,
        deadline,
        fee,
        status,
        summary,
        summary_en,
        itinerary,
        itinerary_en,
        cover_image_url,
        drive_folder_url,
        spreadsheet_url,
        spreadsheet_id,
        line_group_url,
        updated_at
    ) VALUES (
        v_event_id,
        trim(p_event_data->>'name'),
        NULLIF(trim(p_event_data->>'nameEn'), ''),
        v_start_date,
        v_end_date,
        v_deadline,
        v_cost_num,
        COALESCE(NULLIF(trim(p_event_data->>'status'), ''), '報名中 Open'),
        NULLIF(trim(p_event_data->>'shortDesc'), ''),
        NULLIF(trim(p_event_data->>'shortDescEn'), ''),
        NULLIF(trim(p_event_data->>'fullDesc'), ''),
        NULLIF(trim(p_event_data->>'fullDescEn'), ''),
        NULLIF(trim(p_event_data->>'imageUrl'), ''),
        NULLIF(trim(p_event_data->>'driveFolderUrl'), ''),
        NULLIF(trim(p_event_data->>'spreadsheetUrl'), ''),
        NULLIF(trim(p_event_data->>'spreadsheetId'), ''),
        NULLIF(trim(p_event_data->>'lineGroupUrl'), ''),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        title_en = COALESCE(EXCLUDED.title_en, events.title_en),
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        deadline = EXCLUDED.deadline,
        fee = EXCLUDED.fee,
        status = EXCLUDED.status,
        summary = COALESCE(EXCLUDED.summary, events.summary),
        summary_en = COALESCE(EXCLUDED.summary_en, events.summary_en),
        itinerary = COALESCE(EXCLUDED.itinerary, events.itinerary),
        itinerary_en = COALESCE(EXCLUDED.itinerary_en, events.itinerary_en),
        cover_image_url = COALESCE(EXCLUDED.cover_image_url, events.cover_image_url),
        drive_folder_url = COALESCE(EXCLUDED.drive_folder_url, events.drive_folder_url),
        spreadsheet_url = COALESCE(EXCLUDED.spreadsheet_url, events.spreadsheet_url),
        spreadsheet_id = COALESCE(EXCLUDED.spreadsheet_id, events.spreadsheet_id),
        line_group_url = COALESCE(EXCLUDED.line_group_url, events.line_group_url),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'status', 'success',
        'eventId', v_event_id,
        'message', '活動儲存成功'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：快速變更活動狀態 (update_event_status_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_event_status_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法變更狀態');
    END IF;

    UPDATE events 
    SET status = trim(p_status),
        updated_at = NOW()
    WHERE id = trim(p_event_id);

    RETURN jsonb_build_object(
        'status', 'success',
        'eventId', p_event_id,
        'newStatus', trim(p_status)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. 幹部端 RPC：取得指定活動完整報名名冊 (get_admin_event_signups_rpc)
-- 確保 Unpaid 優先權正確解析
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_event_signups_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signups JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', '權限不足，僅限登山社幹部查閱報名名單！',
            'signups', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_signups
    FROM (
        SELECT jsonb_build_object(
            'rowNumber', ROW_NUMBER() OVER (ORDER BY s.created_at ASC),
            'signupCode', s.id,
            'id', s.id,
            'userId', s.line_user_id,
            'lineUserId', s.line_user_id,
            'name', COALESCE(s.name, m.name, '未知報名者'),
            'gender', COALESCE(m.gender, ''),
            'nationality', COALESCE(m.nationality, ''),
            'phone', COALESCE(m.phone, ''),
            'lineId', COALESCE(m.line_id, ''),
            'realLineId', COALESCE(m.line_id, ''),
            'email', COALESCE(m.email, ''),
            'address', COALESCE(m.address, ''),
            'birthday', COALESCE(m.birthday, ''),
            'idNumber', COALESCE(m.id_card, ''),
            'idCard', COALESCE(m.id_card, ''),
            'emerName', COALESCE(m.emergency_contact_name, ''),
            'emerRel', COALESCE(m.emergency_contact_rel, ''),
            'emerPhone', COALESCE(m.emergency_contact_phone, ''),
            'emerAddr', COALESCE(m.emergency_contact_address, ''),
            'emergencyContact', CASE 
                WHEN m.emergency_contact_name IS NOT NULL AND m.emergency_contact_name != '' THEN
                    m.emergency_contact_name || ' (' || COALESCE(m.emergency_contact_rel, '未填關係') || ') ' || COALESCE(m.emergency_contact_phone, '')
                ELSE '未填寫'
            END,
            'experience', COALESCE(m.outdoor_experience, ''),
            'climbingExp', COALESCE(m.outdoor_experience, ''),
            'fitnessTest', COALESCE(m.fitness_desc, ''),
            'fitnessDesc', COALESCE(m.fitness_desc, ''),
            'strengthProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'fitnessProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'department', COALESCE(m.department, ''),
            'studentId', COALESCE(m.student_id, ''),
            'medicalHistory', COALESCE(m.medical_history, ''),
            'isOfficial', CASE WHEN COALESCE(m.is_official_member, FALSE) THEN '是' ELSE '否' END,
            'reviewResult', s.status,
            'notifyStatus', COALESCE(s.notification_status, ''),
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%未繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Unpaid%' THEN '未繳費'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') = 'Paid' OR COALESCE(s.payment_status::text, '') LIKE '%已繳費 Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'remark', COALESCE(s.notes, '')
        ) AS item
        FROM event_signups s
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE s.event_id = trim(p_event_id)
        ORDER BY s.created_at ASC
    ) sub;

    RETURN jsonb_build_object(
        'status', 'success',
        'signups', v_signups
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. 幹部端 RPC：審核報名名單錄取狀態 (update_signup_status_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_signup_status_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT,
    p_signup_id TEXT,
    p_review_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status_val event_signup_status_enum;
    v_status_text TEXT;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法審核');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼');
    END IF;

    v_status_text := trim(p_review_result);
    IF v_status_text LIKE '%正取（已繳費）%' OR v_status_text LIKE '%Confirmed (Paid)%' THEN
        v_status_val := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取（有意願）%' OR v_status_text LIKE '%Waitlisted (Interested)%' THEN
        v_status_val := '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%正取%' OR v_status_text LIKE '%Confirmed%' THEN
        v_status_val := '正取 Confirmed'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取%' OR v_status_text LIKE '%Waitlisted%' THEN
        v_status_val := '備取 Waitlisted'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%取消%' OR v_status_text LIKE '%Cancelled%' THEN
        v_status_val := '已取消 Cancelled'::event_signup_status_enum;
    ELSE
        v_status_val := '審核中 Checking'::event_signup_status_enum;
    END IF;

    UPDATE event_signups
    SET status = v_status_val,
        updated_at = NOW()
    WHERE id = trim(p_signup_id)
      AND (event_id = trim(p_event_id) OR trim(p_event_id) = '');

    RETURN jsonb_build_object(
        'status', 'success',
        'signupId', p_signup_id,
        'newStatus', v_status_val::TEXT
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. 心得與相片 RPC：儲存心得 (save_reflection_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_reflection_rpc(p_line_user_id TEXT, p_details JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id TEXT;
    v_difficulty INTEGER;
    v_beauty INTEGER;
    v_content TEXT;
    v_image_url TEXT;
    v_photo_urls JSONB;
    v_is_public BOOLEAN;
    v_member_name TEXT;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', '缺少必要的 line_user_id 參數');
    END IF;

    v_event_id := p_details->>'eventId';
    IF v_event_id IS NULL OR trim(v_event_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', '缺少必要的 eventId 參數');
    END IF;

    v_difficulty := COALESCE((p_details->>'difficulty')::INTEGER, 5);
    v_beauty := COALESCE((p_details->>'beauty')::INTEGER, 5);
    v_content := COALESCE(p_details->>'content', '');
    v_image_url := COALESCE(p_details->>'imageUrl', '');
    v_is_public := COALESCE((p_details->>'isPublic')::BOOLEAN, TRUE);

    SELECT COALESCE(name, '') INTO v_member_name FROM members WHERE line_user_id = p_line_user_id LIMIT 1;
    IF v_member_name IS NULL OR v_member_name = '' THEN
        v_member_name := COALESCE(p_details->>'authorName', '');
    END IF;

    IF v_image_url != '' THEN
        v_photo_urls := jsonb_build_array(v_image_url);
    ELSE
        v_photo_urls := '[]'::jsonb;
    END IF;

    INSERT INTO reflections (
        event_id,
        line_user_id,
        name,
        difficulty_rating,
        beauty_rating,
        content,
        photo_urls,
        is_public,
        updated_at
    ) VALUES (
        v_event_id,
        p_line_user_id,
        v_member_name,
        v_difficulty,
        v_beauty,
        v_content,
        v_photo_urls,
        v_is_public,
        NOW()
    )
    ON CONFLICT (event_id, line_user_id)
    DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), reflections.name),
        difficulty_rating = EXCLUDED.difficulty_rating,
        beauty_rating = EXCLUDED.beauty_rating,
        content = EXCLUDED.content,
        is_public = EXCLUDED.is_public,
        photo_urls = CASE 
            WHEN jsonb_array_length(EXCLUDED.photo_urls) > 0 THEN EXCLUDED.photo_urls
            ELSE reflections.photo_urls
        END,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', TRUE,
        'eventId', v_event_id,
        'lineUserId', p_line_user_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. 心得牆查詢 RPC：公開心得牆 (get_event_public_reflections_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_event_public_reflections_rpc(p_event_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reflections JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
    INTO v_reflections
    FROM (
        SELECT 
            ref.id,
            ref.event_id,
            COALESCE(ref.name, m.name, '匿名山友') AS author_name,
            ref.difficulty_rating,
            ref.beauty_rating,
            ref.content,
            ref.photo_urls,
            to_char(ref.created_at, 'YYYY/MM/DD') AS created_at
        FROM reflections ref
        LEFT JOIN members m ON ref.line_user_id = m.line_user_id
        WHERE ref.event_id = p_event_id
          AND ref.is_public = TRUE
        ORDER BY ref.created_at DESC
    ) r;

    RETURN jsonb_build_object(
        'success', TRUE,
        'eventId', p_event_id,
        'reflections', v_reflections
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. 個人成就與登山里程碑 RPC (get_my_achievements)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_achievements(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activities JSONB := '[]'::jsonb;
    v_completed_count INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'completedCount', 0,
            'activities', '[]'::jsonb
        );
    END IF;

    SELECT 
        COALESCE(jsonb_agg(item), '[]'::jsonb),
        COUNT(*)
    INTO v_activities, v_completed_count
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'titleEn', COALESCE(e.title_en, ''),
            'date', to_char(e.start_date, 'YYYY/MM/DD'),
            'coverImageUrl', COALESCE(e.cover_image_url, ''),
            'hasReflection', (r.id IS NOT NULL),
            'rating', r.beauty_rating,
            'difficulty', r.difficulty_rating,
            'review', COALESCE(r.content, '')
        ) AS item
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN reflections r ON (r.event_id = e.id AND r.line_user_id = s.line_user_id)
        WHERE s.line_user_id = p_line_user_id
          AND (s.status = '正取 Confirmed'::event_signup_status_enum OR s.status = '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum)
          AND e.end_date < CURRENT_DATE
        ORDER BY e.start_date DESC
    ) t;

    RETURN jsonb_build_object(
        'completedCount', v_completed_count,
        'activities', v_activities
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- events
DROP POLICY IF EXISTS "Public read events" ON events;
CREATE POLICY "Public read events" ON events
    FOR SELECT USING (status != '草稿 Draft');

DROP POLICY IF EXISTS "Service role full access events" ON events;
CREATE POLICY "Service role full access events" ON events
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers manage events" ON events;
CREATE POLICY "Officers manage events" ON events
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- event_signups
DROP POLICY IF EXISTS "Service role full access signups" ON event_signups;
CREATE POLICY "Service role full access signups" ON event_signups
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all signups" ON event_signups;
CREATE POLICY "Officers can manage all signups" ON event_signups
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own signups" ON event_signups;
CREATE POLICY "Members can read own signups" ON event_signups
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can insert own signups" ON event_signups;
CREATE POLICY "Members can insert own signups" ON event_signups
    FOR INSERT TO authenticated
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can cancel own signups" ON event_signups;
CREATE POLICY "Members can cancel own signups" ON event_signups
    FOR UPDATE TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

-- reflections
DROP POLICY IF EXISTS "Public read reflections" ON reflections;
CREATE POLICY "Public read reflections" ON reflections
    FOR SELECT USING (is_public = TRUE);

DROP POLICY IF EXISTS "Service role full access reflections" ON reflections;
CREATE POLICY "Service role full access reflections" ON reflections
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members read own reflections" ON reflections;
CREATE POLICY "Members read own reflections" ON reflections
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members manage own reflections" ON reflections;
CREATE POLICY "Members manage own reflections" ON reflections
    FOR ALL TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Officers manage reflections" ON reflections;
CREATE POLICY "Officers manage reflections" ON reflections
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 權限指派
GRANT EXECUTE ON FUNCTION signup_rpc(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION cancel_event_signup_rpc(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION save_reflection_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_event_public_reflections_rpc(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_my_achievements(TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_event_status_rpc(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 15. 外部日曆快取表 (external_calendar_events)
-- 快取 Google Calendar 主日曆與學校訂閱校曆
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_calendar_events (
    id TEXT PRIMARY KEY,                                 -- Google Event ID 或外部日曆唯一識別碼
    calendar_type TEXT NOT NULL,                         -- 'club' (社團主日曆) 或 'school' (學校訂閱校曆)
    title TEXT NOT NULL,                                 -- 行程標題
    description TEXT,                                    -- 行程詳細說明
    start_time TIMESTAMPTZ NOT NULL,                     -- 起始時間戳記
    end_time TIMESTAMPTZ NOT NULL,                       -- 結束時間戳記
    is_all_day BOOLEAN DEFAULT FALSE,                    -- 是否為整天行程
    location TEXT,                                       -- 地點資訊
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_cal_start ON public.external_calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_ext_cal_type ON public.external_calendar_events(calendar_type);

DROP TRIGGER IF EXISTS trg_external_calendar_events_updated_at ON public.external_calendar_events;
CREATE TRIGGER trg_external_calendar_events_updated_at
BEFORE UPDATE ON public.external_calendar_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Officers read external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Officers read external_calendar_events" ON public.external_calendar_events
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Officers manage external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Officers manage external_calendar_events" ON public.external_calendar_events
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Service role full access external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Service role full access external_calendar_events" ON public.external_calendar_events
    FOR ALL TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 16. 幹部端 RPC：社務日程聚合查詢 (get_schedule_feed)
-- 整合活動、報名截止日、隊員繳費、裝備借還雙錨點與外部日曆
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_schedule_feed(
    p_officer_line_user_id TEXT,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_query_text TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'all'
)
RETURNS TABLE (
    item_id TEXT,
    source_type TEXT,
    title TEXT,
    sub_text TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_macro BOOLEAN,
    status_badge TEXT,
    link_path TEXT,
    details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. 身分鑑權校驗 (限社團幹部)
    IF NOT is_officer(p_officer_line_user_id) THEN
        RAISE EXCEPTION '權限不足：僅限社團幹部存取社務日程 (Insufficient permissions)';
    END IF;

    -- 2. 業務資料聚合查詢
    RETURN QUERY
    WITH all_items AS (
        -- 活動主體 (綠色/彩色橫條，巨觀行程)
        SELECT
            e.id AS item_id,
            'event' AS source_type,
            e.title AS title,
            COALESCE(e.status, '活動') AS sub_text,
            (e.start_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (COALESCE(e.end_date, e.start_date)::text || ' 23:59:59+08')::timestamptz AS end_time,
            TRUE AS is_macro,
            e.status AS status_badge,
            '/admin-web/events?id=' || e.id AS link_path,
            jsonb_build_object(
                'event_id', e.id,
                'title', e.title,
                'fee', e.fee,
                'status', e.status,
                'summary', e.summary,
                'itinerary', e.itinerary,
                'drive_folder_url', e.drive_folder_url,
                'spreadsheet_url', e.spreadsheet_url,
                'start_date', e.start_date,
                'end_date', e.end_date,
                'deadline', e.deadline
            ) AS details
        FROM events e

        UNION ALL

        -- 報名截止日 (醒目標籤，巨觀節點)
        SELECT
            e.id || '_deadline' AS item_id,
            'deadline' AS source_type,
            e.title || ' 報名截止' AS title,
            '截止時間: ' || to_char(e.deadline AT TIME ZONE 'Asia/Taipei', 'YYYY/MM/DD HH24:MI') AS sub_text,
            e.deadline AS start_time,
            e.deadline AS end_time,
            TRUE AS is_macro,
            '截止日' AS status_badge,
            '/admin-web/roster?eventId=' || e.id AS link_path,
            jsonb_build_object(
                'event_id', e.id,
                'title', e.title,
                'deadline', e.deadline,
                'status', e.status,
                'fee', e.fee
            ) AS details
        FROM events e
        WHERE e.deadline IS NOT NULL

        UNION ALL

        -- 財務繳費申報 (細部業務，灰底白字微型標籤)
        SELECT
            p.id AS item_id,
            'finance' AS source_type,
            COALESCE(p.name, '隊員') || ' 繳費申報' AS title,
            '$' || p.amount::text || ' (' || COALESCE(p.type, '繳費') || ')' AS sub_text,
            p.created_at AS start_time,
            p.created_at AS end_time,
            FALSE AS is_macro,
            p.status AS status_badge,
            '/admin-web/finance' AS link_path,
            jsonb_build_object(
                'payment_id', p.id,
                'name', p.name,
                'amount', p.amount,
                'bank_last5', p.bank_last5,
                'type', p.type,
                'status', p.status,
                'proof_image_url', p.proof_image_url,
                'notes', p.notes,
                'officer_notes', p.officer_notes,
                'target_id', p.target_id,
                'target_type', p.target_type,
                'created_at', p.created_at
            ) AS details
        FROM payments p

        UNION ALL

        -- 裝備借出 (借出日錨點，標示 借: 器材)
        SELECT
            l.id || '_pickup' AS item_id,
            'loan_pickup' AS source_type,
            '借: ' || COALESCE(l.name, '隊員') AS title,
            COALESCE(l.purpose, '裝備借出') AS sub_text,
            (l.start_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (l.start_date::text || ' 23:59:59+08')::timestamptz AS end_time,
            FALSE AS is_macro,
            l.status AS status_badge,
            '/admin-web/loans' AS link_path,
            jsonb_build_object(
                'loan_id', l.id,
                'name', l.name,
                'items', l.items,
                'purpose', l.purpose,
                'status', l.status,
                'payment_status', l.payment_status,
                'total_fee', l.total_fee,
                'start_date', l.start_date,
                'end_date', l.end_date
            ) AS details
        FROM loans l
        WHERE l.status NOT LIKE '已取消%'

        UNION ALL

        -- 裝備應還 (應還日錨點，標示 應還: 器材)
        SELECT
            l.id || '_return' AS item_id,
            'loan_return' AS source_type,
            '應還: ' || COALESCE(l.name, '隊員') AS title,
            COALESCE(l.purpose, '裝備應還') AS sub_text,
            (l.end_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (l.end_date::text || ' 23:59:59+08')::timestamptz AS end_time,
            FALSE AS is_macro,
            l.status AS status_badge,
            '/admin-web/loans' AS link_path,
            jsonb_build_object(
                'loan_id', l.id,
                'name', l.name,
                'items', l.items,
                'purpose', l.purpose,
                'status', l.status,
                'payment_status', l.payment_status,
                'total_fee', l.total_fee,
                'start_date', l.start_date,
                'end_date', l.end_date
            ) AS details
        FROM loans l
        WHERE l.status NOT LIKE '已取消%'

        UNION ALL

        -- 外部日曆事件 (社團行事曆與學校校曆)
        SELECT
            ext.id AS item_id,
            CASE 
                WHEN ext.calendar_type = 'school' THEN 'school' 
                ELSE 'club_calendar' 
            END AS source_type,
            ext.title AS title,
            COALESCE(ext.location, ext.description, '') AS sub_text,
            ext.start_time AS start_time,
            ext.end_time AS end_time,
            TRUE AS is_macro,
            CASE 
                WHEN ext.calendar_type = 'school' THEN '校曆' 
                ELSE '日曆' 
            END AS status_badge,
            '/admin-web/schedule' AS link_path,
            jsonb_build_object(
                'calendar_id', ext.id,
                'calendar_type', ext.calendar_type,
                'title', ext.title,
                'description', ext.description,
                'location', ext.location,
                'is_all_day', ext.is_all_day
            ) AS details
        FROM public.external_calendar_events ext
    )
    SELECT
        a.item_id,
        a.source_type,
        a.title,
        a.sub_text,
        a.start_time,
        a.end_time,
        a.is_macro,
        a.status_badge,
        a.link_path,
        a.details
    FROM all_items a
    WHERE
        -- 分類篩選
        (
            p_category IS NULL 
            OR p_category = '' 
            OR p_category = 'all'
            OR (p_category = 'events' AND a.source_type IN ('event', 'deadline'))
            OR (p_category = 'school' AND a.source_type = 'school')
            OR (p_category = 'finance' AND a.source_type = 'finance')
            OR (p_category = 'loans' AND a.source_type IN ('loan_pickup', 'loan_return'))
            OR (p_category = 'club_calendar' AND a.source_type = 'club_calendar')
            OR (p_category = a.source_type)
        )
        -- 時間範圍篩選 (支援交集覆蓋)
        AND (p_start_time IS NULL OR a.end_time >= p_start_time)
        AND (p_end_time IS NULL OR a.start_time <= p_end_time)
        -- 關鍵字模糊比對
        AND (
            p_query_text IS NULL 
            OR trim(p_query_text) = ''
            OR a.title ILIKE '%' || trim(p_query_text) || '%'
            OR a.sub_text ILIKE '%' || trim(p_query_text) || '%'
            OR a.status_badge ILIKE '%' || trim(p_query_text) || '%'
            OR a.details::text ILIKE '%' || trim(p_query_text) || '%'
        )
    ORDER BY a.start_time ASC, a.is_macro DESC, a.item_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_feed(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;


-- <<< FILE: 03_events_and_signups.sql <<<

-- >>> FILE: 04_equipments_and_loans.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 04 - 裝備庫存與租借管理 (04_equipments_and_loans.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 裝備品項資料表 (equipments) -> Google Sheets: Equipments
-- 遵循「2天基本租金 + 每日加成、社團出隊免租、社員個人5折」真實計費模型
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipments (
    id TEXT PRIMARY KEY,                                 -- 裝備代號 (如 EQ_TENT_01)
    name TEXT NOT NULL,                                  -- 裝備名稱 (如：MSR 雙人帳篷)
    category equipment_category NOT NULL DEFAULT '其他裝備', -- 裝備分類列舉
    total_qty INTEGER NOT NULL DEFAULT 0,                -- 總庫存數量
    available_qty INTEGER NOT NULL DEFAULT 0,            -- 目前剩餘可借數量
    is_borrowable BOOLEAN NOT NULL DEFAULT TRUE,         -- 是否開放借用
    price_2day INTEGER NOT NULL DEFAULT 0,               -- 2天基本租金
    price_extra_day INTEGER NOT NULL DEFAULT 0,          -- 續租每日租金 (+1天)
    status TEXT,                                         -- 裝備品況備註
    notes TEXT,                                          -- 使用注意事項與保養備註
    images JSONB DEFAULT '[]'::jsonb,                    -- 相片網址陣列 (Google Drive 直連)
    sort_order INTEGER DEFAULT 0,                        -- 顯示排序權重
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipments_category ON equipments(category);
CREATE INDEX IF NOT EXISTS idx_equipments_borrowable ON equipments(is_borrowable);

DROP TRIGGER IF EXISTS trg_equipments_updated_at ON equipments;
CREATE TRIGGER trg_equipments_updated_at
BEFORE UPDATE ON equipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. 裝備租借主訂單 (loans) -> Google Sheets: Loans
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,                                 -- 租借單號 (如 ORD_YYYYMMDD_XXXX)
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    purpose TEXT DEFAULT '社團出隊',                     -- 租借用途 (社團出隊 / 個人使用 / 其他)
    start_date DATE NOT NULL,                            -- 預計領取日期 (YYYY-MM-DD)
    end_date DATE NOT NULL,                              -- 預計歸還日期 (YYYY-MM-DD)
    total_fee INTEGER NOT NULL DEFAULT 0,                -- 訂單總費用快照
    status TEXT NOT NULL DEFAULT '待領取 To Be Collected', -- 訂單狀態 (待領取 To Be Collected / 租借中 Borrowed / 已歸還 Returned / 已取消 Cancelled / 已取消 (待退款))
    payment_status payment_status_enum NOT NULL DEFAULT '未繳費 Unpaid', -- 租金繳納狀態
    is_official_member_snapshot BOOLEAN NOT NULL DEFAULT FALSE, -- 下單當下社員身分快照 (享5折資格快照)
    notes TEXT,                                          -- 訂單備註
    items JSONB DEFAULT '[]'::jsonb,                     -- 訂單品項與數量 JSON 快照
    name TEXT,                                           -- 借用人真實姓名
    days INTEGER NOT NULL DEFAULT 1,                     -- 租借天數
    purpose_other TEXT,                                  -- 其他用途備註
    total_deposit INTEGER DEFAULT 0,                     -- 押金總計
    total_rent INTEGER DEFAULT 0,                        -- 租金小計
    refund_needed BOOLEAN DEFAULT FALSE,                 -- 取消時是否需退款
    cancelled_at TIMESTAMPTZ,                            -- 取消時間戳記
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(line_user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_payment_status ON loans(payment_status);

DROP TRIGGER IF EXISTS trg_loans_updated_at ON loans;
CREATE TRIGGER trg_loans_updated_at
BEFORE UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. 裝備租借品項明細 (loan_items) -> Google Sheets: Loan_Records
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan_items (
    id BIGSERIAL PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    equipment_id TEXT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_snapshot INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_items_loan_id ON loan_items(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_items_equipment_id ON loan_items(equipment_id);

-- ------------------------------------------------------------------------------
-- 4. 裝備照片安全直更 RPC (update_equipment_images)
-- 免除 GAS 跨域 302 重導向之 Load failed 阻斷
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_equipment_images(
    p_equip_id TEXT,
    p_images JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 幹部身分守衛
    IF NOT is_officer(auth.jwt() ->> 'sub') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied: 權限不足，非幹部無法變更裝備圖片');
    END IF;

    UPDATE equipments
    SET images = p_images,
        updated_at = NOW()
    WHERE id = p_equip_id;

    RETURN jsonb_build_object('success', true, 'id', p_equip_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) TO authenticated, service_role;

DROP POLICY IF EXISTS "Public read events" ON events;

-- ------------------------------------------------------------------------------
-- 5. 原子性裝備租借下單 RPC (submit_equipment_loan_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_is_official BOOLEAN := FALSE;
    v_user_name TEXT := '未知社員';
    v_pickup_date DATE;
    v_return_date DATE;
    v_days INTEGER := 1;
    v_extra_days INTEGER := 0;
    v_purpose TEXT;
    v_other_purpose TEXT;
    v_cart JSONB;
    v_equip_id TEXT;
    v_qty INTEGER;
    v_equip RECORD;
    v_item_base INTEGER := 0;
    v_unit_price INTEGER := 0;
    v_subtotal INTEGER := 0;
    v_total_rent INTEGER := 0;
    v_total_deposit INTEGER := 0;
    v_loan_id TEXT;
    v_item_count INTEGER := 0;
    v_loan_status TEXT := '待領取 To Be Collected';
    v_loan_payment_status payment_status_enum;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = trim(p_line_user_id);
    IF FOUND THEN
        v_user_name := COALESCE(v_member.name, '未知社員');
        IF v_member.is_official_member IS TRUE 
           OR (v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        INSERT INTO members (line_user_id, name, is_official_member, created_at, updated_at)
        VALUES (trim(p_line_user_id), '新借用人', FALSE, NOW(), NOW())
        ON CONFLICT (line_user_id) DO NOTHING;
    END IF;

    v_pickup_date := (p_details->>'pickupDate')::DATE;
    v_return_date := (p_details->>'returnDate')::DATE;
    IF v_pickup_date IS NULL OR v_return_date IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '領取與歸還日期不得為空');
    END IF;

    IF v_return_date < v_pickup_date THEN
        RETURN jsonb_build_object('status', 'error', 'message', '歸還日期不可早於領取日期');
    END IF;

    v_days := (v_return_date - v_pickup_date) + 1;
    IF v_days < 1 THEN v_days := 1; END IF;
    IF v_days > 2 THEN
        v_extra_days := v_days - 2;
    ELSE
        v_extra_days := 0;
    END IF;

    v_purpose := COALESCE(NULLIF(trim(p_details->>'purpose'), ''), '社團出隊');
    v_other_purpose := NULLIF(trim(p_details->>'otherPurpose'), '');
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) != 'object' OR v_cart = '{}'::jsonb THEN
        RETURN jsonb_build_object('status', 'error', 'message', '租借購物車清單不得為空');
    END IF;

    v_loan_id := 'ORD_' || to_char(NOW(), 'YYYYMMDD') || '_' || lpad(floor(random() * 9000 + 1000)::TEXT, 4, '0');

    FOR v_equip_id, v_qty IN SELECT key, value::INTEGER FROM jsonb_each_text(v_cart) LOOP
        IF v_qty > 0 THEN
            SELECT * INTO v_equip FROM equipments WHERE id = v_equip_id FOR UPDATE;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('status', 'error', 'message', '找不到裝備代號：' || v_equip_id);
            END IF;

            IF v_equip.available_qty < v_qty THEN
                RETURN jsonb_build_object(
                    'status', 'error',
                    'message', '裝備「' || v_equip.name || '」剩餘庫存不足 (現有: ' || v_equip.available_qty || '，欲借: ' || v_qty || ')'
                );
            END IF;

            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSE
                v_item_base := COALESCE(v_equip.price_2day, 0) + (v_extra_days * COALESCE(v_equip.price_extra_day, 0));
                IF v_is_official THEN
                    v_unit_price := ROUND(v_item_base * 0.5);
                ELSE
                    v_unit_price := v_item_base;
                END IF;
            END IF;

            v_subtotal := v_unit_price * v_qty;
            v_total_rent := v_total_rent + v_subtotal;
            v_item_count := v_item_count + 1;

            UPDATE equipments 
            SET available_qty = available_qty - v_qty,
                updated_at = NOW()
            WHERE id = v_equip_id;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內各品項數量皆為 0');
    END IF;

    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid'::payment_status_enum;
    ELSE
        v_loan_payment_status := '未繳費 Unpaid'::payment_status_enum;
    END IF;

    INSERT INTO loans (
        id,
        line_user_id,
        name,
        start_date,
        end_date,
        days,
        purpose,
        purpose_other,
        status,
        payment_status,
        total_fee,
        total_rent,
        total_deposit,
        is_official_member_snapshot,
        items,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_loan_id,
        trim(p_line_user_id),
        v_user_name,
        v_pickup_date,
        v_return_date,
        v_days,
        v_purpose,
        v_other_purpose,
        v_loan_status,
        v_loan_payment_status,
        v_total_rent,
        v_total_rent,
        v_total_deposit,
        v_is_official,
        v_cart,
        p_details->>'notes',
        NOW(),
        NOW()
    );

    FOR v_equip_id, v_qty IN SELECT key, value::INTEGER FROM jsonb_each_text(v_cart) LOOP
        IF v_qty > 0 THEN
            SELECT * INTO v_equip FROM equipments WHERE id = v_equip_id;
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSE
                v_item_base := COALESCE(v_equip.price_2day, 0) + (v_extra_days * COALESCE(v_equip.price_extra_day, 0));
                IF v_is_official THEN
                    v_unit_price := ROUND(v_item_base * 0.5);
                ELSE
                    v_unit_price := v_item_base;
                END IF;
            END IF;
            v_subtotal := v_unit_price * v_qty;

            INSERT INTO loan_items (
                loan_id,
                equipment_id,
                quantity,
                unit_price_snapshot,
                subtotal,
                created_at
            ) VALUES (
                v_loan_id,
                v_equip_id,
                v_qty,
                v_unit_price,
                v_subtotal,
                NOW()
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'message', '租借申請已成功送出！'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', '建立租借訂單失敗: ' || SQLERRM
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 原子性取消租借訂單 RPC (cancel_equipment_loan_rpc)
-- 參數簽名與線上 100% 精準對齊：(p_line_user_id TEXT, p_loan_id TEXT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_loan_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loan loans%ROWTYPE;
    v_item RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN := FALSE;
    v_refund_needed BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR p_loan_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    -- JWT 身分校驗
    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);

    IF auth.role() != 'service_role' THEN
        IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
            IF NOT v_is_officer AND v_jwt_sub != trim(p_line_user_id) THEN
                RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人租借單');
            END IF;
        END IF;
    END IF;

    SELECT * INTO v_loan FROM loans WHERE id = trim(p_loan_id) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此租借訂單 (Loan Not Found)');
    END IF;

    IF auth.role() != 'service_role' AND NOT v_is_officer AND v_loan.line_user_id != trim(p_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人租借單');
    END IF;

    IF v_loan.status = '已取消 Cancelled' OR v_loan.status = '已取消 (待退款)' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此訂單先前已取消，請勿重複操作');
    END IF;

    -- 釋放已扣減之裝備庫存
    FOR v_item IN SELECT equipment_id, quantity FROM loan_items WHERE loan_id = trim(p_loan_id) LOOP
        UPDATE equipments 
        SET available_qty = available_qty + v_item.quantity,
            updated_at = NOW()
        WHERE id = v_item.equipment_id;
    END LOOP;

    -- 判斷是否需退款
    IF v_loan.payment_status = '已繳費 Paid'::payment_status_enum THEN
        v_refund_needed := TRUE;
    END IF;

    UPDATE loans 
    SET status = CASE WHEN v_refund_needed THEN '已取消 (待退款)' ELSE '已取消 Cancelled' END,
        refund_needed = v_refund_needed,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = trim(p_loan_id);

    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', p_loan_id,
        'refundNeeded', v_refund_needed,
        'message', '租借訂單已成功取消，裝備庫存已歸還釋出'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', '取消作業失敗: ' || SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：取得全體裝備租借清單 (get_admin_loans_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_loans_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loans JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取租借訂單！',
            'loans', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(l_row ORDER BY l_row.start_date DESC), '[]'::jsonb)
    INTO v_loans
    FROM (
        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
            COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END) AS days,
            l.purpose,
            l.purpose_other,
            l.status,
            l.payment_status::TEXT AS payment_status,
            l.total_rent AS total_fee,
            l.total_rent,
            l.total_deposit,
            l.notes,
            l.is_official_member_snapshot,
            l.refund_needed,
            to_char(l.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelled_at,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(l.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'equipmentId', li.equipment_id,
                    'equipmentName', eq.name,
                    'quantity', li.quantity,
                    'unitPrice', li.unit_price_snapshot,
                    'subtotal', li.subtotal
                ))
                FROM loan_items li
                LEFT JOIN equipments eq ON li.equipment_id = eq.id
                WHERE li.loan_id = l.id
            ), '[]'::jsonb) AS items
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
    ) l_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'loans', v_loans
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：更新租借狀態與繳費註記 (update_admin_loan_status_rpc)
-- 參數簽名與線上 100% 精準對齊：(p_loan_id, p_notes, p_officer_line_user_id, p_status)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_admin_loan_status_rpc(
    p_officer_line_user_id TEXT,
    p_loan_id TEXT,
    p_status TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部更新租借狀態！');
    END IF;

    UPDATE loans
    SET status = trim(p_status),
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
        cancelled_at = CASE WHEN trim(p_status) LIKE '%取消%' OR trim(p_status) LIKE '%Cancelled%' THEN NOW() ELSE cancelled_at END,
        updated_at = NOW()
    WHERE id = trim(p_loan_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_items ENABLE ROW LEVEL SECURITY;

-- equipments
DROP POLICY IF EXISTS "Public read equipments" ON equipments;
CREATE POLICY "Public read equipments" ON equipments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access equipments" ON equipments;
CREATE POLICY "Service role full access equipments" ON equipments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers update equipments" ON equipments;
CREATE POLICY "Officers update equipments" ON equipments
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- loans
DROP POLICY IF EXISTS "Service role full access loans" ON loans;
CREATE POLICY "Service role full access loans" ON loans
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all loans" ON loans;
CREATE POLICY "Officers can manage all loans" ON loans
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own loans" ON loans;
CREATE POLICY "Members can read own loans" ON loans
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

-- loan_items
DROP POLICY IF EXISTS "Service role full access loan_items" ON loan_items;
CREATE POLICY "Service role full access loan_items" ON loan_items
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all loan items" ON loan_items;
CREATE POLICY "Officers can manage all loan items" ON loan_items
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own loan items" ON loan_items;
CREATE POLICY "Members can read own loan items" ON loan_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM loans
            WHERE loans.id = loan_items.loan_id
              AND loans.line_user_id = auth.jwt() ->> 'sub'
        )
    );

-- 權限指派
GRANT EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_equipment_loan_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION cancel_equipment_loan_rpc(TEXT, TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- <<< FILE: 04_equipments_and_loans.sql <<<

-- >>> FILE: 05_finance_and_payments.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 05 - 財務、申報與核銷 (05_finance_and_payments.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 繳費申報資料表 (payments) -> Google Sheets: Payments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,                                 -- 繳費單號 (如 PAY_YYYYMMDD_XXXX)
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 申報人真實姓名
    type TEXT NOT NULL,                                  -- 繳費項目自述 (如：繳交社費 / 活動：雪山東峰 / 裝備租借 / 合併繳費)
    target_type TEXT,                                    -- 目標業務型態 (membership / event / loan / multi)
    target_id TEXT,                                      -- 關聯目標 ID (活動編號、租借單號或 NULL)
    amount INTEGER NOT NULL DEFAULT 0,                   -- 申報匯款金額 (新台幣整數)
    bank_last5 TEXT,                                     -- 匯款帳號末五碼
    proof_image_url TEXT,                                -- Google Drive 匯款證明相片網址
    status TEXT NOT NULL DEFAULT '待確認 Checking',       -- 款項核銷狀態 (待確認 Checking / 已核銷 Confirmed / 退件 Rejected)
    selected_ids JSONB DEFAULT '[]'::jsonb,              -- 多筆合併繳費時選取的項目代號陣列 (如 ["act_E01", "fee_membership"])
    verify_token TEXT,                                   -- 幹部單鍵免登入核銷安全密鑰 (32位元隨機字串)
    officer_notes TEXT,                                  -- 幹部審核備註 / 退件原因
    confirmed_by TEXT,                                   -- 核銷幹部身分 / 姓名
    confirmed_at TIMESTAMPTZ,                            -- 核銷確認時間戳記
    notification_status TEXT DEFAULT '未通知',           -- 核銷推播通知發送狀態 (未通知 / 已通知 / 免通知)
    notes TEXT,                                          -- 社員申報備註
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(line_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_verify_token ON payments(verify_token);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 確保 payments 表具備 verify_token、selected_ids、notes 與 officer_notes 欄位
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verify_token TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS selected_ids JSONB;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS officer_notes TEXT;

-- ------------------------------------------------------------------------------
-- 2. 會員端 RPC：繳費申報提交 (submit_payment_rpc)
-- 包含後端金額重算、verify_token 生成、0元免審自動核銷、多筆合併關聯
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_payment_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment_id TEXT;
    v_verify_token TEXT;
    v_item_id TEXT;
    v_event_id TEXT;
    v_loan_id TEXT;
    v_event_title TEXT;
    v_selected_ids JSONB;
    v_item_labels TEXT[] := ARRAY[]::TEXT[];
    v_has_membership BOOLEAN := FALSE;
    v_total_amount INTEGER;
    v_last5 TEXT;
    v_note TEXT;
    v_expiry TEXT;
    v_member_name TEXT;
    v_equip_names TEXT;
    v_proof_url TEXT;
    v_target_item_status payment_status_enum;
    v_target_payment_status TEXT;
    v_officer_notes TEXT;
    v_notification_status TEXT;
    i INTEGER;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少必要的 line_user_id 參數');
    END IF;

    v_selected_ids := COALESCE(p_details->'selectedIds', '[]'::jsonb);
    v_total_amount := COALESCE((p_details->>'totalAmount')::INTEGER, 0);
    v_last5 := COALESCE(p_details->>'last5Digits', '00000');
    v_note := COALESCE(p_details->>'note', '');
    v_expiry := p_details->>'membershipExpiryDate';
    v_proof_url := p_details->>'proofImageUrl';

    -- 判斷是否為 0 元申報（若為 0 元則直接原子性核銷為「已繳費 Paid / 已核銷 Confirmed」）
    IF v_total_amount = 0 THEN
        v_target_item_status := text_to_payment_status_enum('已繳費 Paid');
        v_target_payment_status := '已核銷 Confirmed';
        v_officer_notes := '0元免費項目系統自動核銷';
        v_notification_status := '免通知';
    ELSE
        v_target_item_status := text_to_payment_status_enum('待確認 Checking');
        v_target_payment_status := '待確認 Checking';
        v_officer_notes := NULL;
        v_notification_status := '未通知';
    END IF;

    -- 取得社員姓名 (優先從 details 讀取，若無則查詢 members 表)
    v_member_name := COALESCE(p_details->>'userName', '');
    IF v_member_name = '' THEN
        SELECT name INTO v_member_name FROM members WHERE line_user_id = p_line_user_id;
    END IF;

    -- 防禦性確保 members 存在此使用者 (防止 payments_line_user_id_fkey 外鍵違規)
    INSERT INTO members (line_user_id, name, created_at, updated_at)
    VALUES (p_line_user_id, COALESCE(NULLIF(v_member_name, ''), '山友'), NOW(), NOW())
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, ''), members.name);

    -- 生成唯一繳費單號 PAY_YYYYMMDD_HH24MISS_xxx
    v_payment_id := 'PAY_' || to_char(NOW(), 'YYYYMMDD_HH24MISS_') || lpad(floor(random() * 1000)::text, 3, '0');

    -- 生成 32 位元隨機安全憑證 (單次防偽核銷 Token，採用密碼學安全 CSPRNG gen_random_uuid)
    BEGIN
        v_verify_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    EXCEPTION WHEN OTHERS THEN
        v_verify_token := md5(random()::text || clock_timestamp()::text || p_line_user_id || v_payment_id);
    END;

    -- 檢查是否包含社費
    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        IF (v_selected_ids->>i) = 'fee_membership' THEN
            v_has_membership := TRUE;
            EXIT;
        END IF;
    END LOOP;

    -- 逐項處理已勾選項目與狀態更新
    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        v_item_id := v_selected_ids->>i;

        -- A. 社費
        IF v_item_id = 'fee_membership' THEN
            IF v_total_amount = 0 AND v_expiry IS NOT NULL AND v_expiry != '' THEN
                UPDATE members 
                SET payment_status = v_target_item_status,
                    is_official_member = TRUE,
                    membership_expires_at = to_date(replace(v_expiry, '-', '/'), 'YYYY/MM/DD'),
                    updated_at = NOW()
                WHERE line_user_id = p_line_user_id;
            ELSE
                UPDATE members 
                SET payment_status = v_target_item_status,
                    updated_at = NOW()
                WHERE line_user_id = p_line_user_id;
            END IF;

            IF v_expiry IS NOT NULL AND v_expiry != '' THEN
                v_item_labels := array_append(v_item_labels, '社籍與社費 (Membership Fee) (有效至 ' || replace(v_expiry, '-', '/') || ')');
            ELSE
                v_item_labels := array_append(v_item_labels, '社籍與社費 (Membership Fee)');
            END IF;

        -- B. 活動
        ELSIF v_item_id LIKE 'act_%' THEN
            v_event_id := substring(v_item_id from 5);

            UPDATE event_signups 
            SET payment_status = v_target_item_status,
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND event_id = v_event_id;

            SELECT title INTO v_event_title FROM events WHERE id = v_event_id;
            v_item_labels := array_append(v_item_labels, '活動：' || COALESCE(v_event_title, v_event_id));

        -- C. 裝備租借
        ELSIF v_item_id LIKE 'eq_%' THEN
            v_loan_id := substring(v_item_id from 4);

            UPDATE loans 
            SET payment_status = v_target_item_status,
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND id = v_loan_id;

            -- 若同時繳納社費且為個人租借，套用 5 折優待
            IF v_has_membership THEN
                UPDATE loans 
                SET total_rent = ROUND(total_rent * 0.5)
                WHERE line_user_id = p_line_user_id 
                  AND id = v_loan_id 
                  AND purpose NOT IN ('社團出隊', '社團出團')
                  AND total_rent > 0;
            END IF;

            -- 查詢該筆租借訂單的實際裝備品項名稱與數量
            SELECT string_agg(COALESCE(e.name, '裝備') || ' x ' || li.quantity::text, '、')
            INTO v_equip_names
            FROM loan_items li
            LEFT JOIN equipments e ON e.id = li.equipment_id
            WHERE li.loan_id = v_loan_id;

            IF v_equip_names IS NOT NULL AND trim(v_equip_names) != '' THEN
                v_item_labels := array_append(v_item_labels, '裝備：' || v_equip_names || ' (' || v_loan_id || ')' || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            ELSE
                v_item_labels := array_append(v_item_labels, '裝備租借：' || v_loan_id || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            END IF;
        END IF;
    END LOOP;

    -- 寫入 payments 資料表 (包含 verify_token 與 proof_image_url，申報備註寫入 notes 欄位，精確品項寫入 selected_ids)
    INSERT INTO payments (
        id,
        line_user_id,
        name,
        type,
        amount,
        bank_last5,
        proof_image_url,
        status,
        verify_token,
        selected_ids,
        notes,
        officer_notes,
        notification_status,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        p_line_user_id,
        v_member_name,
        array_to_string(v_item_labels, ', '),
        v_total_amount,
        v_last5,
        v_proof_url,
        v_target_payment_status,
        v_verify_token,
        v_selected_ids,
        v_note,
        v_officer_notes,
        v_notification_status,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'paymentId', v_payment_id,
        'verify_token', v_verify_token,
        'verifyToken', v_verify_token,
        'items', array_to_string(v_item_labels, ', '),
        'totalAmount', v_total_amount,
        'is_zero_amount', (v_total_amount = 0),
        'status', v_target_payment_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '資料庫處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 幹部端 RPC：安全 Token 單鍵免登入核銷 (verify_payment_by_token)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_payment_by_token(
    p_payment_id TEXT,
    p_verify_token TEXT,
    p_officer_name TEXT DEFAULT 'Email 單鍵核銷'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_signup RECORD;
    v_new_signup_status event_signup_status_enum;
    v_extracted_expiry TEXT;
    v_calculated_expiry DATE;
    v_user_email TEXT;
    v_user_language TEXT;
    v_selected_ids JSONB;
    v_event_ids TEXT[] := ARRAY[]::TEXT[];
    v_loan_ids TEXT[] := ARRAY[]::TEXT[];
    v_has_membership BOOLEAN := FALSE;
    v_item_id TEXT;
    i INTEGER;
BEGIN
    -- 參數基本防禦
    IF p_payment_id IS NULL OR trim(p_payment_id) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少繳費單號 (Missing paymentId)');
    END IF;

    IF p_verify_token IS NULL OR trim(p_verify_token) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少安全金鑰 (Missing verifyToken)');
    END IF;

    -- 查詢該筆繳費紀錄
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '找不到繳費單號：' || p_payment_id);
    END IF;

    -- 查詢繳費社員的 Email 與 偏好語系
    IF v_payment.line_user_id IS NOT NULL THEN
        SELECT email, COALESCE(preferred_language, 'zh') INTO v_user_email, v_user_language FROM members WHERE line_user_id = v_payment.line_user_id;
    END IF;

    -- 比對安全金鑰 (強制要求 verify_token 必須存在且完全相符，杜絕空值繞過)
    IF v_payment.verify_token IS NULL OR trim(v_payment.verify_token) = '' OR v_payment.verify_token != trim(p_verify_token) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '安全金鑰無效、不存在或已過期，拒絕核銷 (Invalid or Missing verifyToken)');
    END IF;

    -- 檢查是否先前已核銷
    IF v_payment.status LIKE '%已核銷%' OR v_payment.status LIKE '%Confirmed%' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'alreadyConfirmed', TRUE,
            'paymentId', v_payment.id,
            'userName', COALESCE(v_payment.name, '社員'),
            'userEmail', v_user_email,
            'userLanguage', COALESCE(v_user_language, 'zh'),
            'amount', v_payment.amount,
            'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
            'lineUserId', v_payment.line_user_id,
            'proofImageUrl', v_payment.proof_image_url,
            'message', '該繳費單先前已完成核銷 (Already Confirmed)'
        );
    END IF;

    -- 1. 更新 payments 主狀態為「已核銷 Confirmed」
    UPDATE payments
    SET status = '已核銷 Confirmed',
        confirmed_by = COALESCE(p_officer_name, 'Email 單鍵核銷'),
        confirmed_at = v_now,
        updated_at = v_now
    WHERE id = p_payment_id;

    -- 解析該筆繳費單所屬之精確品項清單
    v_selected_ids := COALESCE(v_payment.selected_ids, '[]'::jsonb);
    IF jsonb_typeof(v_selected_ids) = 'array' AND jsonb_array_length(v_selected_ids) > 0 THEN
        FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
            v_item_id := v_selected_ids->>i;
            IF v_item_id LIKE 'act_%' THEN
                v_event_ids := array_append(v_event_ids, substring(v_item_id from 5));
            ELSIF v_item_id LIKE 'eq_%' THEN
                v_loan_ids := array_append(v_loan_ids, substring(v_item_id from 4));
            ELSIF v_item_id = 'fee_membership' THEN
                v_has_membership := TRUE;
            END IF;
        END LOOP;
    END IF;

    -- 2. 連動更新活動報名表 (event_signups)：精準限定本次繳費單所勾選的活動
    IF v_payment.line_user_id IS NOT NULL THEN
        IF array_length(v_event_ids, 1) > 0 THEN
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND event_id = ANY(v_event_ids)
                  AND payment_status != '已繳費 Paid'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        ELSIF v_payment.target_id IS NOT NULL AND v_payment.target_type = 'event' THEN
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND event_id = v_payment.target_id
                  AND payment_status != '已繳費 Paid'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        ELSIF v_payment.type LIKE '%活動%' THEN
            -- 舊版無 selected_ids 繳費單 fallback：只更新處於「待確認 Checking」的活動報名紀錄，絕不波及未繳費活動
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND payment_status = '待確認 Checking'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        END IF;

        -- 3. 連動更新社員社費 (members)
        IF v_has_membership OR v_payment.type LIKE '%社費%' OR v_payment.type LIKE '%Membership%' OR v_payment.target_type = 'membership' THEN
            v_extracted_expiry := substring(v_payment.type from '(\d{4}[-/]\d{2}[-/]\d{2})');
            IF v_extracted_expiry IS NOT NULL THEN
                BEGIN
                    v_calculated_expiry := replace(v_extracted_expiry, '/', '-')::DATE;
                EXCEPTION WHEN OTHERS THEN
                    v_calculated_expiry := NULL;
                END IF;
            ELSE
                v_calculated_expiry := NULL;
            END IF;

            UPDATE members
            SET payment_status = '已繳費 Paid',
                is_official_member = TRUE,
                membership_expires_at = COALESCE(v_calculated_expiry, membership_expires_at),
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id;
        END IF;

        -- 4. 連動更新裝備租借 (loans)：精準限定本次繳費單所勾選的訂單 ID
        IF array_length(v_loan_ids, 1) > 0 THEN
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND id = ANY(v_loan_ids)
              AND payment_status != '已繳費 Paid';
        ELSIF v_payment.target_id IS NOT NULL AND (v_payment.target_type = 'loan' OR v_payment.target_type = 'equipment') THEN
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND id = v_payment.target_id
              AND payment_status != '已繳費 Paid';
        ELSIF v_payment.type LIKE '%裝備%' OR v_payment.type LIKE '%租借%' THEN
            -- 舊版 fallback：只更新處於「待確認 Checking」的租借紀錄
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND payment_status = '待確認 Checking';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'alreadyConfirmed', FALSE,
        'paymentId', v_payment.id,
        'userName', COALESCE(v_payment.name, '社員'),
        'userEmail', v_user_email,
        'userLanguage', COALESCE(v_user_language, 'zh'),
        'amount', v_payment.amount,
        'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
        'lineUserId', v_payment.line_user_id,
        'proofImageUrl', v_payment.proof_image_url,
        'message', '核銷成功！系統已自動連動更新對應之報名與租借狀態'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '核銷處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. 會員端 RPC：個人歷史繳費紀錄與累計花費 (get_my_payment_history)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_payment_history(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_history JSONB := '[]'::jsonb;
    v_total_spent INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('totalSpent', 0, 'history', '[]'::jsonb);
    END IF;

    SELECT 
        COALESCE(jsonb_agg(h), '[]'::jsonb),
        COALESCE(SUM(
            CASE 
                WHEN (status::text LIKE '%已核銷%' OR status::text LIKE '%Confirmed%' OR status::text = 'Paid')
                     AND status::text NOT LIKE '%待確認%' AND status::text NOT LIKE '%Checking%'
                THEN display_amount 
                ELSE 0 
            END
        ), 0)
    INTO v_history, v_total_spent
    FROM (
        SELECT jsonb_build_object(
            'id', id,
            'date', to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'),
            'type', CASE 
                WHEN type ILIKE '%社籍%' OR type ILIKE '%社費%' OR type ILIKE '%Membership%' THEN '社費'
                WHEN type ILIKE '%活動%' OR type ILIKE '%登山%' OR type ILIKE '%act_%' THEN '活動'
                WHEN type ILIKE '%裝備%' OR type ILIKE '%租用%' OR type ILIKE '%eq_%' THEN '裝備'
                ELSE '全部'
            END,
            'title', COALESCE(type, '未命名項目'),
            'amount', display_amount,
            'name', COALESCE(name, ''),
            'last5Digits', COALESCE(bank_last5, ''),
            'note', COALESCE(officer_notes, ''),
            'proofImageUrl', COALESCE(proof_image_url, ''),
            'status', COALESCE(status, '待確認 Checking')
        ) AS h,
        display_amount,
        status
        FROM (
            SELECT 
                id,
                created_at,
                type,
                name,
                bank_last5,
                officer_notes,
                proof_image_url,
                status,
                COALESCE(amount, 0) AS display_amount
            FROM payments
            WHERE line_user_id = trim(p_line_user_id)
        ) sub
        ORDER BY created_at DESC
    ) t;

    RETURN jsonb_build_object(
        'totalSpent', v_total_spent,
        'history', v_history
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. 會員端 RPC：查詢個人待繳項目 (get_unpaid_items_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unpaid_items_rpc(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_is_expired BOOLEAN := FALSE;
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_is_official BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = trim(p_line_user_id);
    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;
        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;

        IF NOT v_is_official THEN
            IF (v_member.payment_status IS NULL OR (
                v_member.payment_status::text NOT LIKE '%待確認%' 
                AND v_member.payment_status::text NOT LIKE '%Checking%'
            )) THEN
                v_membership := jsonb_build_array(
                    jsonb_build_object(
                        'id', 'fee_membership',
                        'name', '社籍與社費 (Membership Fee)',
                        'amount', 200
                    )
                );
            END IF;
        END IF;
    ELSE
        v_membership := jsonb_build_array(
            jsonb_build_object(
                'id', 'fee_membership',
                'name', '社籍與社費 (Membership Fee)',
                'amount', 200
            )
        );
    END IF;

    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', 'act_' || e.id,
            'name', '活動：' || e.title,
            'amount', COALESCE(e.fee, 0)
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_line_user_id)
          AND (s.status::text LIKE '%正取%' OR s.status::text LIKE '%Confirmed%')
          AND s.status::text NOT LIKE '%取消%'
          AND (s.payment_status IS NULL OR (
              s.payment_status::text NOT LIKE '%已繳費%' 
              AND s.payment_status::text NOT LIKE '%Paid%'
              AND s.payment_status::text NOT LIKE '%待確認%'
              AND s.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY e.start_date ASC
    ) t;

    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', '裝備租借 (' || l.id || ')',
            'amount', COALESCE(l.total_rent, 0),
            'orderId', l.id,
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD')
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = trim(p_line_user_id)
          AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed')
          AND l.total_rent > 0
          AND (l.payment_status IS NULL OR (
              l.payment_status::text NOT LIKE '%已繳費%' 
              AND l.payment_status::text NOT LIKE '%Paid%'
              AND l.payment_status::text NOT LIKE '%待確認%'
              AND l.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY l.start_date ASC
    ) e_sub;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 會員端相容性 RPC：查詢待繳項目 (get_unpaid_payments)
-- 線上 OpenAPI 保留之向下相容介面
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unpaid_payments(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN get_unpaid_items_rpc(p_line_user_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：取得財務對帳清單 (get_admin_finance_rpc)
-- 支援 selected_ids、0元活動核銷名單與未填報待繳整合
-- 回填既有 payments 資料表之 target_type 與 target_id：
-- UPDATE payments p SET target_type = 'event', target_id = e.id FROM events e WHERE (p.target_type IS NULL OR p.target_id IS NULL) AND (p.type ILIKE '%' || e.title || '%' OR p.type ILIKE '%' || e.id || '%');
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_finance_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取財務資料！',
            'items', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(f_row ORDER BY f_row.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
        SELECT 
            p.id,
            p.line_user_id,
            COALESCE(p.name, m.name, '未知申報人') AS name,
            p.type,
            p.amount,
            p.bank_last5,
            p.proof_image_url,
            p.target_type,
            p.target_id,
            p.status,
            CASE WHEN p.status = '已核銷 Confirmed' THEN '已繳費 Paid' ELSE '待確認 Checking' END AS payment_status,
            p.notes,
            p.officer_notes,
            COALESCE(p.notification_status, '未通知') AS notification_status,
            to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'payment' AS source_type,
            CASE 
                WHEN p.target_type = 'event' OR p.type ILIKE '%活動%' THEN 'activity'
                WHEN p.target_type = 'loan' OR p.type ILIKE '%裝備%' THEN 'equipment'
                WHEN p.target_type = 'membership' OR p.type ILIKE '%社費%' THEN 'membership'
                ELSE 'general'
            END AS item_category,
            p.selected_ids
        FROM payments p
        LEFT JOIN members m ON p.line_user_id = m.line_user_id

        UNION ALL

        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            '裝備租借費用 (' || l.id || ')' AS type,
            l.total_rent AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'loan' AS target_type,
            l.id AS target_id,
            CASE WHEN l.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status,
            l.payment_status::TEXT AS payment_status,
            l.notes,
            NULL AS officer_notes,
            '未通知' AS notification_status,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'loan' AS source_type,
            'equipment' AS item_category,
            NULL::jsonb AS selected_ids
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
        WHERE l.total_rent > 0
          AND l.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE (
                  (p.target_type = 'loan' AND p.target_id = l.id)
                  OR (p.selected_ids IS NOT NULL AND p.selected_ids ? ('eq_' || l.id))
                  OR (p.line_user_id = l.line_user_id AND p.type ILIKE '%' || l.id || '%')
              )
          )

        UNION ALL

        SELECT 
            s.id,
            s.line_user_id,
            COALESCE(s.name, m.name, '活動參加者') AS name,
            '[活動] ' || e.title AS type,
            COALESCE(e.fee, 0) AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'event' AS target_type,
            e.id AS target_id,
            CASE WHEN s.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status,
            CASE
                WHEN COALESCE(e.fee, 0) = 0 THEN '已繳費 Paid'
                ELSE s.payment_status::TEXT
            END AS payment_status,
            s.notes,
            NULL AS officer_notes,
            '未通知' AS notification_status,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'event' AS source_type,
            'activity' AS item_category,
            NULL::jsonb AS selected_ids
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE (s.status = '正取 Confirmed' OR s.status = '正取（已繳費）Confirmed (Paid)')
          AND (
              COALESCE(e.fee, 0) = 0
              OR (
                  s.payment_status != '已繳費 Paid'
                  AND NOT EXISTS (
                      SELECT 1 FROM payments p 
                      WHERE (
                          (p.target_type = 'event' AND p.target_id = e.id)
                          OR (p.selected_ids IS NOT NULL AND p.selected_ids ? ('act_' || e.id))
                          OR (p.line_user_id = s.line_user_id AND p.type ILIKE '%' || e.title || '%')
                      )
                  )
              )
          )
    ) f_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'items', v_items
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：審核對帳狀態 (update_admin_payment_status_rpc)
-- 包含 selected_ids 原子批次連動所有項目狀態
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_admin_payment_status_rpc(
    p_officer_line_user_id TEXT,
    p_payment_id TEXT,
    p_source_type TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_status TEXT,
    p_line_user_id TEXT,
    p_officer_name TEXT,
    p_notes TEXT,
    p_notification_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_confirmed BOOLEAN;
    v_mapped_pay_status payment_status_enum;
    v_payment RECORD;
    v_target_user_id TEXT;
    v_is_membership BOOLEAN;
    v_extracted_expiry TEXT;
    v_calculated_expiry DATE;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部執行財務核銷！');
    END IF;

    v_is_confirmed := (p_status = '已核銷 Confirmed');
    v_mapped_pay_status := CASE 
        WHEN p_status = '已核銷 Confirmed' THEN '已繳費 Paid'::payment_status_enum 
        WHEN p_status = '待繳費 Unpaid' THEN '未繳費 Unpaid'::payment_status_enum
        ELSE '待確認 Checking'::payment_status_enum 
    END;

    IF p_source_type = 'payment' THEN
        SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
        v_target_user_id := COALESCE(NULLIF(p_line_user_id, ''), v_payment.line_user_id);

        UPDATE payments
        SET status = p_status,
            confirmed_by = CASE WHEN v_is_confirmed THEN COALESCE(NULLIF(p_officer_name, ''), '管理幹部') ELSE NULL END,
            confirmed_at = CASE WHEN v_is_confirmed THEN NOW() ELSE NULL END,
            officer_notes = p_notes,
            notification_status = COALESCE(p_notification_status, notification_status),
            updated_at = NOW()
        WHERE id = p_payment_id;

        v_is_membership := (
            p_target_type = 'membership' 
            OR v_payment.target_type = 'membership'
            OR v_payment.type ILIKE '%社費%' 
            OR v_payment.type ILIKE '%Membership%'
        );

        IF v_payment.selected_ids IS NOT NULL AND jsonb_typeof(v_payment.selected_ids) = 'array' AND jsonb_array_length(v_payment.selected_ids) > 0 THEN
            IF v_target_user_id IS NOT NULL THEN
                UPDATE event_signups
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE line_user_id = v_target_user_id 
                  AND ('act_' || event_id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids));
            END IF;

            UPDATE loans
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE ('eq_' || id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids));

            IF v_target_user_id IS NOT NULL AND (
                v_payment.selected_ids ? 'fee_membership' OR v_payment.selected_ids ? 'membership'
            ) THEN
                IF v_is_confirmed THEN
                    v_extracted_expiry := substring(v_payment.type from '(\d{4}[-/]\d{2}[-/]\d{2})');
                    IF v_extracted_expiry IS NOT NULL THEN
                        BEGIN
                            v_calculated_expiry := replace(v_extracted_expiry, '/', '-')::DATE;
                        EXCEPTION WHEN OTHERS THEN
                            v_calculated_expiry := NULL;
                        END;
                    ELSE
                        v_calculated_expiry := NULL;
                    END IF;

                    UPDATE members
                    SET payment_status = '已繳費 Paid'::payment_status_enum,
                        is_official_member = TRUE,
                        membership_expires_at = COALESCE(v_calculated_expiry, (CURRENT_DATE + INTERVAL '1 year')::DATE),
                        updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                ELSE
                    UPDATE members
                    SET payment_status = v_mapped_pay_status, updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                END IF;
            END IF;
        ELSE
            IF v_is_membership AND v_target_user_id IS NOT NULL THEN
                IF v_is_confirmed THEN
                    UPDATE members
                    SET payment_status = '已繳費 Paid'::payment_status_enum,
                        is_official_member = TRUE,
                        membership_expires_at = (CURRENT_DATE + INTERVAL '1 year')::DATE,
                        updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                ELSE
                    UPDATE members
                    SET payment_status = v_mapped_pay_status, updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                END IF;
            ELSIF p_target_type = 'event' AND p_target_id IS NOT NULL THEN
                UPDATE event_signups
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE event_id = p_target_id 
                  AND (v_target_user_id IS NULL OR line_user_id = v_target_user_id);
            ELSIF p_target_type = 'loan' AND p_target_id IS NOT NULL THEN
                UPDATE loans
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE id = p_target_id;
            END IF;
        END IF;

    ELSIF p_source_type = 'event' THEN
        UPDATE event_signups
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;

    ELSIF p_source_type = 'loan' THEN
        UPDATE loans
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payments" ON payments;
CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
CREATE POLICY "Officers can manage all payments" ON payments
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own payments" ON payments;
CREATE POLICY "Members can read own payments" ON payments
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

-- 權限指派
GRANT EXECUTE ON FUNCTION submit_payment_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION verify_payment_by_token(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_my_payment_history(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_unpaid_items_rpc(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_unpaid_payments(TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- <<< FILE: 05_finance_and_payments.sql <<<

-- >>> FILE: 06_system_and_queues.sql >>>
-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 06 - 系統佇列、日誌、防遞迴觸發器與排程 (06_system_and_queues.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 系統動態組態設定表 (app_config)
-- 儲存 ADMIN_GROUP_ID、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 等執行期狀態
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON app_config;
CREATE TRIGGER trg_app_config_updated_at
BEFORE UPDATE ON app_config
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. LINE Webhook 冪等去重表 (webhook_events)
-- 防止 LINE Webhook 重試機制造成之重複處理
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    webhook_event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at DESC);

-- ------------------------------------------------------------------------------
-- 3. GAS Worker 非同步失敗重試記錄表 (worker_failures)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_failures (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_worker_failures_updated_at ON worker_failures;
CREATE TRIGGER trg_worker_failures_updated_at
BEFORE UPDATE ON worker_failures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Google Sheets 背景同步佇列表 (sync_queue)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL,                                -- INSERT / UPDATE / DELETE
    record_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',              -- pending / processing / completed / failed
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);

-- ------------------------------------------------------------------------------
-- 5. 幹部社務彙整推播佇列表 (admin_notification_digest_queue)
-- 解決 LINE 官方帳號群組推播免費則數耗盡問題之彙整機制
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_notification_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,                              -- loan_created / loan_cancelled / event_cancelled / officer_intent / patrol_report
    title TEXT NOT NULL,
    summary TEXT,
    bubble_payload JSONB NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_digest_queue_unsent 
ON admin_notification_digest_queue (is_sent, created_at ASC)
WHERE is_sent = FALSE;

-- ------------------------------------------------------------------------------
-- 6. 操作與安全稽核日誌表 (audit_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. 通用背景同步觸發函式 (trg_fn_enqueue_sync)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enqueue_sync()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec_id TEXT;
    target_payload JSONB;
    act TEXT;
BEGIN
    -- 專案規範防遞迴守衛：杜絕 stack depth limit exceeded
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        act := 'DELETE';
        target_payload := to_jsonb(OLD);
    ELSE
        act := TG_OP; -- 'INSERT' 或 'UPDATE'
        target_payload := to_jsonb(NEW);
    END IF;

    IF (TG_TABLE_NAME = 'members') THEN
        rec_id := COALESCE(target_payload->>'line_user_id', '');
    ELSIF (TG_TABLE_NAME = 'events' OR TG_TABLE_NAME = 'equipments' OR TG_TABLE_NAME = 'loans' OR TG_TABLE_NAME = 'payments' OR TG_TABLE_NAME = 'event_signups') THEN
        rec_id := COALESCE(target_payload->>'id', '');
    ELSIF (TG_TABLE_NAME = 'reflections') THEN
        rec_id := COALESCE(target_payload->>'event_id', '') || '_' || COALESCE(target_payload->>'line_user_id', '');
    ELSE
        rec_id := COALESCE(target_payload->>'id', 'unknown');
    END IF;

    INSERT INTO sync_queue (table_name, action, record_id, payload, status)
    VALUES (TG_TABLE_NAME, act, rec_id, target_payload, 'pending');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_members ON members;
CREATE TRIGGER trg_sync_members
AFTER INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_events ON events;
CREATE TRIGGER trg_sync_events
AFTER INSERT OR UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_signups ON event_signups;
CREATE TRIGGER trg_sync_signups
AFTER INSERT OR UPDATE OR DELETE ON event_signups
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_reflections ON reflections;
CREATE TRIGGER trg_sync_reflections
AFTER INSERT OR UPDATE OR DELETE ON reflections
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_equipments ON equipments;
CREATE TRIGGER trg_sync_equipments
AFTER INSERT OR UPDATE OR DELETE ON equipments
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_loans ON loans;
CREATE TRIGGER trg_sync_loans
AFTER INSERT OR UPDATE OR DELETE ON loans
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_payments ON payments;
CREATE TRIGGER trg_sync_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

-- ------------------------------------------------------------------------------
-- 8. 社員姓名自動帶入觸發函式 (trg_fn_auto_fill_member_name)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_auto_fill_member_name()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
        SELECT name INTO NEW.name FROM members WHERE line_user_id = NEW.line_user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_name_payments ON payments;
CREATE TRIGGER trg_auto_name_payments
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_loans ON loans;
CREATE TRIGGER trg_auto_name_loans
BEFORE INSERT OR UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_signups ON event_signups;
CREATE TRIGGER trg_auto_name_signups
BEFORE INSERT OR UPDATE ON event_signups
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_reflections ON reflections;
CREATE TRIGGER trg_auto_name_reflections
BEFORE INSERT OR UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

-- ------------------------------------------------------------------------------
-- 9. 社員更名連動更新子資料表觸發函式 (trg_fn_sync_member_name_to_children)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_sync_member_name_to_children()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE payments SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE loans SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE event_signups SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE reflections SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_member_name ON members;
CREATE TRIGGER trg_sync_member_name
AFTER UPDATE OF name ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_member_name_to_children();

-- ------------------------------------------------------------------------------
-- 10. 定時排程函式：daily-patrol 自動巡檢 (invoke_daily_patrol)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoke_daily_patrol()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_supabase_url FROM app_config WHERE key = 'SUPABASE_URL';
  SELECT value INTO v_service_role_key FROM app_config WHERE key = 'SUPABASE_SERVICE_ROLE_KEY';

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://bvyyuobmizfrosbgcqbu.supabase.co';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/daily-patrol',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
      ),
      body := '{"source": "pg_cron"}'::jsonb
    ) INTO v_request_id;

    RAISE NOTICE 'Triggered daily-patrol Edge Function via pg_net (Request ID: %)', v_request_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'invoke_daily_patrol encountered an error: %', SQLERRM;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. 定時推播排程觸發函式 (invoke_admin_digest)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoke_admin_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supabase_url text;
    v_service_role_key text;
    v_request_id bigint;
BEGIN
    SELECT value INTO v_supabase_url FROM app_config WHERE key = 'SUPABASE_URL';
    SELECT value INTO v_service_role_key FROM app_config WHERE key = 'SUPABASE_SERVICE_ROLE_KEY';

    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://bvyyuobmizfrosbgcqbu.supabase.co';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        SELECT net.http_post(
            url := v_supabase_url || '/functions/v1/notify-dispatcher',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
            ),
            body := '{"action": "dispatch_admin_digest", "source": "pg_cron"}'::jsonb
        ) INTO v_request_id;

        RAISE NOTICE 'Triggered admin_digest via pg_net (Request ID: %)', v_request_id;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'invoke_admin_digest encountered an error: %', SQLERRM;
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. 系統安全輔助函式：自動啟用所有資料表之 RLS (rls_auto_enable)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notification_digest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- app_config
DROP POLICY IF EXISTS "Service role full access app_config" ON app_config;
CREATE POLICY "Service role full access app_config" ON app_config
    FOR ALL USING (auth.role() = 'service_role');

-- webhook_events
DROP POLICY IF EXISTS "Service role full access webhook_events" ON webhook_events;
CREATE POLICY "Service role full access webhook_events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- worker_failures
DROP POLICY IF EXISTS "Service role full access worker_failures" ON worker_failures;
CREATE POLICY "Service role full access worker_failures" ON worker_failures
    FOR ALL USING (auth.role() = 'service_role');

-- sync_queue
DROP POLICY IF EXISTS "Service role full access sync_queue" ON sync_queue;
CREATE POLICY "Service role full access sync_queue" ON sync_queue
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow insert to sync_queue" ON sync_queue
    FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow authenticated insert to sync_queue" ON sync_queue
    FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

-- admin_notification_digest_queue
DROP POLICY IF EXISTS "Service role full access digest_queue" ON admin_notification_digest_queue;
CREATE POLICY "Service role full access digest_queue" ON admin_notification_digest_queue
    FOR ALL USING (auth.role() = 'service_role');

-- audit_logs
DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Service role full access audit_logs" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated insert audit_logs" ON audit_logs;
CREATE POLICY "Authenticated insert audit_logs" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Officers read audit_logs" ON audit_logs;
CREATE POLICY "Officers read audit_logs" ON audit_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Service role full access audit" ON audit_logs;
CREATE POLICY "Service role full access audit" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated insert audit" ON audit_logs;
CREATE POLICY "Authenticated insert audit" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Officers read audit" ON audit_logs;
CREATE POLICY "Officers read audit" ON audit_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 權限指派
GRANT EXECUTE ON FUNCTION invoke_daily_patrol() TO service_role;
GRANT EXECUTE ON FUNCTION invoke_admin_digest() TO service_role;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO service_role;

-- ------------------------------------------------------------------------------
-- 10. 回滾備援宣告 (Rollback Statements)
-- ------------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Officers can read all members" ON members;
-- DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
-- DROP TABLE IF EXISTS audit_logs CASCADE;

-- <<< FILE: 06_system_and_queues.sql <<<


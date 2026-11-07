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

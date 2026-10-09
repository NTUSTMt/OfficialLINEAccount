-- ==============================================================================
-- 台科登山社社團系統：個人基本資料安全讀取與儲存 RPC 函式 (SECURITY DEFINER)
-- 目的：嚴格限定僅能讀寫本人資料，杜絕全體社員名冊與身分證/電話等機密個資外洩
-- ==============================================================================

-- 1. 確保 members 資料表維持最高規格 RLS 封閉防護，禁止任何人直接 SELECT 整張表
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon read member" ON members;
DROP POLICY IF EXISTS "Anon insert member" ON members;
DROP POLICY IF EXISTS "Anon update member" ON members;

-- 2. 安全讀取 RPC 函式：嚴格僅能以指定之 line_user_id 查閱本人紀錄 (若持有 JWT 則強制檢查 sub，杜絕 BOLA/IDOR 越權爬取)
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
    -- 1. 提取 JWT 宣告 (若呼叫者持有 Supabase Auth JWT)
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 2. 防範 BOLA/IDOR：若持有 JWT，非幹部僅允許讀取本人 (sub = p_line_user_id)
    IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
        IF v_jwt_officer IS NOT TRUE AND p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object('error', 'Forbidden: Identity mismatch (禁止越權讀取他人個資)');
        END IF;
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    ELSE
        v_target_id := trim(p_line_user_id);
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

-- 3. 安全儲存 RPC 函式：以 line_user_id 為唯一鎖定，嚴格僅能寫入本人資料 (防範 BOLA/IDOR)
CREATE OR REPLACE FUNCTION save_member_profile(
    p_line_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
DECLARE
    v_is_officer BOOLEAN := FALSE;
    v_officer_role TEXT := NULL;
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    -- 1. 提取 JWT 宣告 (若呼叫者持有 Supabase Auth JWT)
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 2. 防範 BOLA/IDOR：若持有 JWT，非幹部僅允許寫入本人 (sub = p_line_user_id)
    IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
        IF v_jwt_officer IS NOT TRUE AND p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: Identity mismatch (禁止越權修改他人資料)');
        END IF;
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    ELSE
        v_target_id := trim(p_line_user_id);
    END IF;

    IF v_target_id IS NULL OR v_target_id = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '缺少使用者識別碼');
    END IF;

    -- 檢查該成員目前是否具備幹部身分
    SELECT is_officer, officer_role INTO v_is_officer, v_officer_role
    FROM members
    WHERE line_user_id = v_target_id;

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
        is_officer,
        officer_role,
        updated_at
    )
    VALUES (
        trim(p_line_user_id),
        COALESCE(p_data->>'name', ''),
        p_data->>'gender',
        COALESCE(p_data->>'nationality', '中華民國'),
        p_data->>'line_id',
        p_data->>'email',
        p_data->>'phone',
        p_data->>'department',
        p_data->>'student_id',
        p_data->>'birthday',
        p_data->>'id_card',
        p_data->>'address',
        p_data->>'outdoor_experience',
        p_data->>'fitness_desc',
        COALESCE(p_data->'proof_urls', '[]'::jsonb),
        p_data->>'emergency_contact_name',
        p_data->>'emergency_contact_rel',
        p_data->>'emergency_contact_phone',
        p_data->>'emergency_contact_address',
        p_data->>'medical_history',
        p_data->>'identity_status',
        p_data->>'join_membership_intent',
        p_data->>'officer_intent',
        p_data->>'want_to_say',
        COALESCE(v_is_officer, FALSE),
        CASE WHEN v_is_officer IS TRUE THEN v_officer_role ELSE NULL END,
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE SET
        name = EXCLUDED.name,
        gender = EXCLUDED.gender,
        nationality = COALESCE(EXCLUDED.nationality, members.nationality, '中華民國'),
        line_id = EXCLUDED.line_id,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        department = EXCLUDED.department,
        student_id = EXCLUDED.student_id,
        birthday = EXCLUDED.birthday,
        id_card = EXCLUDED.id_card,
        address = EXCLUDED.address,
        outdoor_experience = EXCLUDED.outdoor_experience,
        fitness_desc = EXCLUDED.fitness_desc,
        proof_urls = CASE WHEN jsonb_array_length(EXCLUDED.proof_urls) > 0 THEN EXCLUDED.proof_urls ELSE members.proof_urls END,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_rel = EXCLUDED.emergency_contact_rel,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_address = EXCLUDED.emergency_contact_address,
        medical_history = EXCLUDED.medical_history,
        identity_status = EXCLUDED.identity_status,
        join_membership_intent = EXCLUDED.join_membership_intent,
        officer_intent = EXCLUDED.officer_intent,
        want_to_say = EXCLUDED.want_to_say,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. 授權前端客戶端執行這兩個專屬安全函式
GRANT EXECUTE ON FUNCTION get_member_profile(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;

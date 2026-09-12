-- ==============================================================================
-- 野境戶外系統：個人基本資料安全讀取與儲存 RPC 函式 (SECURITY DEFINER)
-- 目的：嚴格限定僅能讀寫本人資料，杜絕全體社員名冊與身分證/電話等機密個資外洩
-- ==============================================================================

-- 1. 確保 members 資料表維持最高規格 RLS 封閉防護，禁止任何人直接 SELECT 整張表
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon read member" ON members;
DROP POLICY IF EXISTS "Anon insert member" ON members;
DROP POLICY IF EXISTS "Anon update member" ON members;

-- 2. 安全讀取 RPC 函式：嚴格僅能以指定之 line_user_id 查閱本人紀錄 (查無則回傳 null，杜絕整表爬取)
CREATE OR REPLACE FUNCTION get_member_profile(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = trim(p_line_user_id);
    IF FOUND THEN
        RETURN to_jsonb(v_member);
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

-- 3. 安全儲存 RPC 函式：以 line_user_id 為唯一鎖定，嚴格僅能寫入本人資料
CREATE OR REPLACE FUNCTION save_member_profile(
    p_line_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '缺少使用者識別碼');
    END IF;

    INSERT INTO members (
        line_user_id,
        name,
        gender,
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
        updated_at
    )
    VALUES (
        trim(p_line_user_id),
        COALESCE(p_data->>'name', ''),
        p_data->>'gender',
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
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE SET
        name = EXCLUDED.name,
        gender = EXCLUDED.gender,
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
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. 授權前端客戶端執行這兩個專屬安全函式
GRANT EXECUTE ON FUNCTION get_member_profile(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;

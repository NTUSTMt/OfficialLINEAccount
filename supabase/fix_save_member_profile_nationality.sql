-- ==============================================================================
-- 台科登山社社團系統：修正 save_member_profile RPC 支援 nationality (國籍)
-- 目的：確保社員資料儲存與更新時，國籍欄位完整寫入 members 資料表
-- ==============================================================================

-- 1. 確保 members 資料表包含 nationality 欄位
ALTER TABLE members ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT NULL;

-- 2. 重新建立 save_member_profile 函式，完整包含 nationality 欄位
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
    v_is_officer BOOLEAN := FALSE;
    v_officer_role TEXT := NULL;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN jsonb_build_object('success', false, 'message', '無效的使用者識別碼');
    END IF;

    -- 檢查該成員目前是否具備幹部身分 (避免被覆蓋)
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
        is_officer,
        officer_role,
        updated_at
    )
    VALUES (
        trim(p_line_user_id),
        COALESCE(p_data->>'name', ''),
        p_data->>'gender',
        NULLIF(trim(COALESCE(p_data->>'nationality', '')), ''),
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
        nationality = COALESCE(EXCLUDED.nationality, members.nationality),
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

    RETURN jsonb_build_object('success', true, 'message', '社員資料已成功儲存');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- 3. 授權呼叫
GRANT EXECUTE ON FUNCTION save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;

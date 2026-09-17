-- ==============================================================================
-- 台科登山社社團系統：新增 members.want_to_say 欄位與 RPC 更新
-- ==============================================================================

-- 1. 新增 want_to_say 欄位 (非必填，可為 NULL)
ALTER TABLE members ADD COLUMN IF NOT EXISTS want_to_say TEXT;

-- 2. 更新 save_member_profile RPC 函式支援寫入與更新 want_to_say
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
    v_officer_role TEXT := '幹部';
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN jsonb_build_object('success', false, 'message', '無效的使用者識別碼');
    END IF;

    -- 檢查該成員目前是否具備幹部身分
    SELECT is_officer, officer_role INTO v_is_officer, v_officer_role
    FROM members
    WHERE line_user_id = trim(p_line_user_id);

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
        want_to_say,
        is_officer,
        officer_role,
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
        p_data->>'want_to_say',
        COALESCE(v_is_officer, FALSE),
        CASE WHEN v_is_officer IS TRUE THEN v_officer_role ELSE NULL END,
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
        want_to_say = EXCLUDED.want_to_say,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;

-- 遷移腳本：為 members 表新增 nationality (國籍) 欄位並更新相關 RPC
-- 預設值為 NULL (空白)

ALTER TABLE members ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT NULL;
ALTER TABLE members ALTER COLUMN nationality DROP DEFAULT;

COMMENT ON COLUMN members.nationality IS '國籍 (預設為空白，外籍社員儲存國家名稱)';

-- 1. 更新 save_member_profile 支援 nationality
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
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '缺少使用者識別碼');
    END IF;

    -- 檢查該成員目前是否具備幹部身分
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
        p_data->>'nationality',
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
        proof_urls = EXCLUDED.proof_urls,
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

-- 2. 更新 update_admin_member_rpc 支援 nationality
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
DECLARE
    v_is_officer BOOLEAN;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
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
        RETURN jsonb_build_object('success', false, 'message', '查無此社員資料');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', '社員資料更新成功');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

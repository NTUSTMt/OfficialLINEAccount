-- ============================================================================
-- 修正 save_member_profile：proof_urls 必須以 JSONB 陣列寫入 members.proof_urls
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_member_profile(
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
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: 禁止越權修改他人個人資料');
        END IF;
    END IF;

    SELECT is_officer, officer_role INTO v_is_officer, v_officer_role
    FROM public.members
    WHERE line_user_id = trim(p_line_user_id);

    INSERT INTO public.members (
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
        nationality = COALESCE(NULLIF(trim(EXCLUDED.nationality), ''), members.nationality),
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
            WHEN p_data ? 'proof_urls' THEN EXCLUDED.proof_urls
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

    RETURN jsonb_build_object(
        'success', true,
        'message', '社員資料已成功儲存',
        'line_user_id', trim(p_line_user_id)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_member_profile(TEXT, JSONB) TO anon, authenticated, service_role;

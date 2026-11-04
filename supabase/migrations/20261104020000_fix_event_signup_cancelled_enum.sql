-- ============================================================================
-- 修正活動報名取消狀態：退款資訊放在 notes，status 僅使用合法 enum 值
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_event_signup_rpc(
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
    FROM public.event_signups
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

    UPDATE public.event_signups
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

CREATE OR REPLACE FUNCTION public.signup_rpc(
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
    v_fee INTEGER := 0;
    v_actual_signup_id TEXT := p_signup_id;
    v_retry_count INT := 0;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN;
    v_is_service_role BOOLEAN;
BEGIN
    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role')
        OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'forbidden', 'message', 'Forbidden: 禁止替他人發起活動報名');
        END IF;
    END IF;

    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'message', 'Event not found');
    END IF;

    IF (v_event.status ILIKE '%關閉%' OR v_event.status ILIKE '%closed%' OR v_event.status ILIKE '%已截止%' OR v_event.status ILIKE '%已結束%')
       OR (v_event.deadline IS NOT NULL AND NOW() > v_event.deadline) THEN
        RETURN jsonb_build_object(
            'status', 'closed',
            'event_title', v_event.title,
            'event_title_en', v_event.title_en,
            'deadline', v_event.deadline,
            'message', 'Event is closed or deadline has passed'
        );
    END IF;

    SELECT * INTO v_member FROM public.members WHERE line_user_id = p_line_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found_member', 'message', 'Member profile not found');
    END IF;

    IF v_member.name IS NULL OR TRIM(v_member.name) = '' THEN v_missing_fields := array_append(v_missing_fields, '姓名 Name'); END IF;
    IF v_member.gender IS NULL OR TRIM(v_member.gender::text) = '' THEN v_missing_fields := array_append(v_missing_fields, '性別 Gender'); END IF;
    IF v_member.id_card IS NULL OR TRIM(v_member.id_card) = '' THEN v_missing_fields := array_append(v_missing_fields, '身分證字號/居留證號 ID Card'); END IF;
    IF v_member.birthday IS NULL OR TRIM(v_member.birthday) = '' THEN v_missing_fields := array_append(v_missing_fields, '生日 Birthday'); END IF;
    IF v_member.phone IS NULL OR TRIM(v_member.phone) = '' THEN v_missing_fields := array_append(v_missing_fields, '聯絡電話 Phone'); END IF;
    IF v_member.department IS NULL OR TRIM(v_member.department) = '' THEN v_missing_fields := array_append(v_missing_fields, '系所 Department'); END IF;
    IF v_member.student_id IS NULL OR TRIM(v_member.student_id) = '' THEN v_missing_fields := array_append(v_missing_fields, '學號 Student ID'); END IF;
    IF v_member.address IS NULL OR TRIM(v_member.address) = '' THEN v_missing_fields := array_append(v_missing_fields, '通訊地址 Address'); END IF;
    IF v_member.emergency_contact_name IS NULL OR TRIM(v_member.emergency_contact_name) = '' THEN v_missing_fields := array_append(v_missing_fields, '緊急聯絡人姓名 Emergency Contact Name'); END IF;
    IF v_member.emergency_contact_rel IS NULL OR TRIM(v_member.emergency_contact_rel) = '' THEN v_missing_fields := array_append(v_missing_fields, '緊急聯絡人關係 Emergency Contact Relationship'); END IF;
    IF v_member.emergency_contact_phone IS NULL OR TRIM(v_member.emergency_contact_phone) = '' THEN v_missing_fields := array_append(v_missing_fields, '緊急聯絡人電話 Emergency Contact Phone'); END IF;

    IF array_length(v_missing_fields, 1) > 0 THEN
        RETURN jsonb_build_object('status', 'incomplete_profile', 'missing_fields', v_missing_fields, 'message', 'Member profile incomplete');
    END IF;

    v_days_since_update := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_member.updated_at, v_member.created_at, NOW()))) / 86400.0;
    IF v_days_since_update > 180.0 THEN
        RETURN jsonb_build_object('status', 'profile_expired', 'days_since_update', FLOOR(v_days_since_update), 'message', 'Profile update expired');
    END IF;

    SELECT * INTO v_existing_signup
    FROM public.event_signups
    WHERE event_id = p_event_id AND line_user_id = p_line_user_id;

    IF FOUND AND v_existing_signup.status <> '已取消 Cancelled'::event_signup_status_enum THEN
        RETURN jsonb_build_object(
            'status', 'already_signed_up',
            'signup_id', v_existing_signup.id,
            'signup_status', v_existing_signup.status,
            'event_title', v_event.title,
            'event_title_en', v_event.title_en,
            'message', 'Already signed up'
        );
    END IF;

    v_is_official := COALESCE(v_member.is_official_member, false)
        OR (v_member.identity_status IS NOT NULL AND TRIM(v_member.identity_status) ILIKE '%社員%');
    v_fee := COALESCE(v_event.fee, 0);

    IF v_actual_signup_id IS NULL OR TRIM(v_actual_signup_id) = '' THEN
        v_actual_signup_id := 'S' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 4);
    END IF;

    LOOP
        BEGIN
            INSERT INTO public.event_signups (
                id, event_id, line_user_id, name, line_id, status, payment_status,
                notification_status, is_official_member_snapshot, notes, created_at, updated_at
            ) VALUES (
                v_actual_signup_id, p_event_id, p_line_user_id, v_member.name, v_member.line_id,
                '審核中 Checking'::event_signup_status_enum, '未繳費 Unpaid'::payment_status_enum,
                '未通知', v_is_official, NULL, NOW(), NOW()
            );
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_retry_count := v_retry_count + 1;
            IF v_retry_count >= 5 THEN
                RAISE EXCEPTION 'Failed to generate unique signup ID after 5 attempts';
            END IF;
            v_actual_signup_id := 'S' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 6);
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'ok', 'success', true, 'signup_id', v_actual_signup_id, 'event_id', p_event_id,
        'event_title', v_event.title, 'event_title_en', v_event.title_en, 'member_name', v_member.name,
        'fee', v_fee, 'is_official_member', v_is_official, 'spreadsheet_id', v_event.spreadsheet_id,
        'signup_status', '審核中 Checking', 'payment_status', '未繳費 Unpaid',
        'message', 'Registration submitted successfully'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_event_signup_rpc(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.signup_rpc(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

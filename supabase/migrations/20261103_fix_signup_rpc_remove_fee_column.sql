-- ==============================================================================
-- 修正 signup_rpc：移除 event_signups 表中不存在之 fee 欄位寫入 (Fix missing fee column error)
-- ==============================================================================

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
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role') OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'forbidden', 'message', 'Forbidden: 禁止替他人發起活動報名');
        END IF;
    END IF;

    -- 1. 檢查活動是否存在
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Event not found'
        );
    END IF;

    -- 2. 檢查活動是否截止或關閉
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

    -- 3. 檢查社員個資是否存在
    SELECT * INTO v_member FROM public.members WHERE line_user_id = p_line_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found_member',
            'message', 'Member profile not found'
        );
    END IF;

    -- 4. 檢查必填欄位完整性
    IF v_member.name IS NULL OR TRIM(v_member.name) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '姓名 Name');
    END IF;
    IF v_member.gender IS NULL OR TRIM(v_member.gender::text) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '性別 Gender');
    END IF;
    IF v_member.id_card IS NULL OR TRIM(v_member.id_card) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '身分證字號/居留證號 ID Card');
    END IF;
    IF v_member.birthday IS NULL OR TRIM(v_member.birthday) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '生日 Birthday');
    END IF;
    IF v_member.phone IS NULL OR TRIM(v_member.phone) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '聯絡電話 Phone');
    END IF;
    IF v_member.department IS NULL OR TRIM(v_member.department) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '系所 Department');
    END IF;
    IF v_member.student_id IS NULL OR TRIM(v_member.student_id) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '學號 Student ID');
    END IF;
    IF v_member.address IS NULL OR TRIM(v_member.address) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '通訊地址 Address');
    END IF;
    IF v_member.emergency_contact_name IS NULL OR TRIM(v_member.emergency_contact_name) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人姓名 Emergency Contact Name');
    END IF;
    IF v_member.emergency_contact_rel IS NULL OR TRIM(v_member.emergency_contact_rel) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人關係 Emergency Contact Relationship');
    END IF;
    IF v_member.emergency_contact_phone IS NULL OR TRIM(v_member.emergency_contact_phone) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人電話 Emergency Contact Phone');
    END IF;

    IF array_length(v_missing_fields, 1) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'incomplete_profile',
            'missing_fields', v_missing_fields,
            'message', 'Member profile incomplete'
        );
    END IF;

    -- 5. 檢查個資更新時限 (大於 180 天需重新確認)
    v_days_since_update := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_member.updated_at, v_member.created_at, NOW()))) / 86400.0;
    IF v_days_since_update > 180.0 THEN
        RETURN jsonb_build_object(
            'status', 'profile_expired',
            'days_since_update', FLOOR(v_days_since_update),
            'message', 'Profile update expired'
        );
    END IF;

    -- 6. 檢查重複報名
    SELECT * INTO v_existing_signup 
    FROM public.event_signups 
    WHERE event_id = p_event_id AND line_user_id = p_line_user_id;

    IF FOUND THEN
        IF v_existing_signup.status NOT IN ('已取消 Cancelled'::event_signup_status_enum, '已取消 (待退款)'::event_signup_status_enum) THEN
            RETURN jsonb_build_object(
                'status', 'already_signed_up',
                'signup_id', v_existing_signup.id,
                'signup_status', v_existing_signup.status,
                'event_title', v_event.title,
                'event_title_en', v_event.title_en,
                'message', 'Already signed up'
            );
        END IF;
    END IF;

    -- 7. 判定費用與社員資格
    v_is_official := COALESCE(v_member.is_official_member, false) OR (v_member.identity_status IS NOT NULL AND TRIM(v_member.identity_status) ILIKE '%社員%');

    IF v_is_official THEN
        v_fee := COALESCE(v_event.member_fee, v_event.fee, 0);
    ELSE
        v_fee := COALESCE(v_event.fee, 0);
    END IF;

    -- 8. 寫入報名資料 (event_signups 表無 fee 欄位，由 events 表管理活動定價)
    IF v_actual_signup_id IS NULL OR TRIM(v_actual_signup_id) = '' THEN
        v_actual_signup_id := 'S' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 4);
    END IF;

    LOOP
        BEGIN
            INSERT INTO public.event_signups (
                id,
                event_id,
                line_user_id,
                name,
                line_id,
                status,
                payment_status,
                notification_status,
                is_official_member_snapshot,
                notes,
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
                '未通知',
                v_is_official,
                NULL,
                NOW(),
                NOW()
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
        'status', 'ok',
        'success', true,
        'signup_id', v_actual_signup_id,
        'event_id', p_event_id,
        'event_title', v_event.title,
        'event_title_en', v_event.title_en,
        'member_name', v_member.name,
        'fee', v_fee,
        'is_official_member', v_is_official,
        'spreadsheet_id', v_event.spreadsheet_id,
        'signup_status', '審核中 Checking',
        'payment_status', '未繳費 Unpaid',
        'message', 'Registration submitted successfully'
    );
END;
$$;

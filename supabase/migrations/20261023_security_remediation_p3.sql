-- ==============================================================================
-- 國立臺灣科技大學登山社 - 安全稽核弱點修復 Migration (Phase 3 Security Remediation)
-- 目的：修復 RPC 越權旁路、IDOR 身分偽造、匿名未鑑權存取與殘存寬鬆 RLS
-- ==============================================================================

-- 1. 清除歷史遺留之過度寬鬆 anon 策略 (改由 desktop_admin_security.sql 嚴密 RLS 控管)
DROP POLICY IF EXISTS "Allow anon read members" ON members;
DROP POLICY IF EXISTS "Allow anon update members" ON members;
DROP POLICY IF EXISTS "Allow anon read payments" ON payments;
DROP POLICY IF EXISTS "Allow anon update payments" ON payments;
DROP POLICY IF EXISTS "Allow anon insert payments" ON payments;
DROP POLICY IF EXISTS "Allow anon read loans" ON loans;
DROP POLICY IF EXISTS "Allow anon update loans" ON loans;
DROP POLICY IF EXISTS "Allow anon insert loans" ON loans;
DROP POLICY IF EXISTS "Allow anon read loan_items" ON loan_items;
DROP POLICY IF EXISTS "Allow anon update loan_items" ON loan_items;
DROP POLICY IF EXISTS "Allow anon insert loan_items" ON loan_items;

-- 2. 加固 save_member_profile (阻斷 IDOR，校驗 caller 身分)
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
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role') OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    -- 身分鑑權守衛：非 service_role 呼叫時，強制檢查 JWT sub 與 p_line_user_id 一致性或幹部身分
    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: 禁止越權修改他人個人資料');
        END IF;
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
            WHEN p_data->'proof_urls' IS NOT NULL AND jsonb_typeof(p_data->'proof_urls') = 'array' 
            THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'proof_urls'))
            ELSE ARRAY[]::TEXT[]
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
            WHEN p_data->'proof_urls' IS NOT NULL THEN EXCLUDED.proof_urls 
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

-- 3. 加固 cancel_event_signup_rpc (防範匿名 NULL JWT 繞過檢查)
CREATE OR REPLACE FUNCTION cancel_event_signup_rpc(
    p_line_user_id TEXT,
    p_signup_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signup RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN;
    v_is_service_role BOOLEAN;
BEGIN
    IF p_line_user_id IS NULL OR p_signup_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role') OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    -- 強制身分校驗：非 service_role 時必須有 JWT，且 JWT sub 必須符合申請人或幹部身分
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
    WHERE (id = p_signup_id OR event_id = p_signup_id) AND line_user_id = trim(p_line_user_id)
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此報名紀錄或非本人申請');
    END IF;

    IF v_signup.status IN ('已取消 Cancelled', '已取消 (待退款)') THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此報名紀錄已取消');
    END IF;

    UPDATE event_signups
    SET status = CASE WHEN v_signup.payment_status = '已繳費 Paid' THEN '已取消 (待退款)' ELSE '已取消 Cancelled' END,
        notes = CASE 
            WHEN p_reason IS NOT NULL AND trim(p_reason) != '' 
            THEN COALESCE(notes || E'\n[取消原因] ' || trim(p_reason), '[取消原因] ' || trim(p_reason))
            ELSE notes 
        END,
        updated_at = NOW()
    WHERE id = v_signup.id;

    RETURN jsonb_build_object('status', 'success', 'message', '報名已成功取消！');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- 4. 加固 cancel_equipment_loan_rpc (防範匿名 NULL JWT 繞過檢查)
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
    v_loan RECORD;
    v_item RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN;
    v_is_service_role BOOLEAN;
BEGIN
    IF p_line_user_id IS NULL OR p_loan_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role') OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    -- 強制身分校驗：非 service_role 時必須有 JWT，且 JWT sub 必須符合申請人或幹部身分
    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人租借單');
        END IF;
    END IF;

    SELECT * INTO v_loan
    FROM loans
    WHERE id = p_loan_id AND line_user_id = trim(p_line_user_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此租借單或非本人申請');
    END IF;

    IF v_loan.status IN ('已歸還 Returned', '已取消 Cancelled', '已取消 (待退款)') THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此租借單已處於結束或已取消狀態');
    END IF;

    FOR v_item IN
        SELECT equipment_id, quantity
        FROM loan_items
        WHERE loan_id = p_loan_id
    LOOP
        UPDATE equipments
        SET available_qty = available_qty + v_item.quantity,
            updated_at = NOW()
        WHERE id = v_item.equipment_id;
    END LOOP;

    UPDATE loans
    SET status = CASE WHEN v_loan.payment_status::text = '已繳費 Paid' THEN '已取消 (待退款)' ELSE '已取消 Cancelled' END,
        refund_needed = (v_loan.payment_status::text = '已繳費 Paid'),
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_loan_id;

    RETURN jsonb_build_object('status', 'success', 'message', '裝備預約已成功取消並釋放庫存！');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- 5. 加固 signup_rpc (杜絕未鑑權與越權報名)
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
    v_days_since_update := EXTRACT(EPOCH FROM (NOW() - v_member.updated_at)) / 86400;
    IF v_days_since_update > 180 THEN
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
        IF v_existing_signup.status NOT IN ('已取消 Cancelled', '已取消 (待退款)') THEN
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
    IF v_member.identity_status IS NOT NULL AND TRIM(v_member.identity_status) ILIKE '%社員%' THEN
        v_is_official := TRUE;
    END IF;

    IF v_is_official THEN
        v_fee := COALESCE(v_event.member_fee, v_event.fee, 0);
    ELSE
        v_fee := COALESCE(v_event.fee, 0);
    END IF;

    -- 8. 寫入報名資料
    IF v_actual_signup_id IS NULL OR TRIM(v_actual_signup_id) = '' THEN
        v_actual_signup_id := 'S' || to_char(NOW(), 'YYYYMMDDHH24MISS') || '_' || substr(md5(random()::text), 1, 4);
    END IF;

    LOOP
        BEGIN
            INSERT INTO public.event_signups (
                id,
                event_id,
                line_user_id,
                fee,
                status,
                payment_status,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_actual_signup_id,
                p_event_id,
                p_line_user_id,
                v_fee,
                '審核中 Checking',
                '未繳費 Unpaid',
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
        'status', 'success',
        'signup_id', v_actual_signup_id,
        'event_id', p_event_id,
        'event_title', v_event.title,
        'event_title_en', v_event.title_en,
        'member_name', v_member.name,
        'fee', v_fee,
        'signup_status', '審核中 Checking',
        'payment_status', '未繳費 Unpaid',
        'message', 'Signup successfully created'
    );
END;
$$;

-- 6. 加固 save_reflection_rpc (杜絕未鑑權偽造心得)
CREATE OR REPLACE FUNCTION save_reflection_rpc(p_line_user_id text, p_details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event_id TEXT;
    v_difficulty INTEGER;
    v_beauty INTEGER;
    v_content TEXT;
    v_image_url TEXT;
    v_photo_urls JSONB;
    v_is_public BOOLEAN;
    v_member_name TEXT;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN;
    v_is_service_role BOOLEAN;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RAISE EXCEPTION '缺少必要的 line_user_id 參數';
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role') OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'Forbidden: 禁止替他人發布或修改心得');
        END IF;
    END IF;

    v_event_id := p_details->>'eventId';
    IF v_event_id IS NULL OR trim(v_event_id) = '' THEN
        RAISE EXCEPTION '缺少必要的 eventId 參數';
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
        line_user_id,
        event_id,
        difficulty,
        beauty,
        content,
        photo_urls,
        is_public,
        created_at,
        updated_at
    ) VALUES (
        p_line_user_id,
        v_event_id,
        v_difficulty,
        v_beauty,
        v_content,
        v_photo_urls,
        v_is_public,
        NOW(),
        NOW()
    )
    ON CONFLICT (line_user_id, event_id)
    DO UPDATE SET
        difficulty = EXCLUDED.difficulty,
        beauty = EXCLUDED.beauty,
        content = EXCLUDED.content,
        photo_urls = EXCLUDED.photo_urls,
        is_public = EXCLUDED.is_public,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'message', '心得已成功儲存！',
        'event_id', v_event_id,
        'line_user_id', p_line_user_id,
        'authorName', v_member_name,
        'is_public', v_is_public
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', SQLERRM
    );
END;
$function$;

-- ==============================================================================
-- Migration: 20261011_phase2_security_remediation.sql
-- 目的：修復資安報告之核心高危與中危漏洞 (C-1, C-2, C-3, H-1, H-2, L-4)
-- 包含：
-- 1. 徹底撤銷 sync_officer_cache_rpc 對 anon 之授權，並加上 service_role 與 is_officer 守衛 (C-1)
-- 2. get_member_profile 與 get_my_dashboard 強制要求有效 JWT 宣告，阻斷匿名 IDOR 跨帳號讀取 (C-2)
-- 3. submit_payment_rpc 由後端重新驗算金額，嚴禁信任客戶端之 totalAmount，防禦 0 元核銷竄改 (C-3)
-- 4. 為 submit_equipment_loan_rpc, cancel_equipment_loan_rpc, cancel_event_signup_rpc 固定 SET search_path = public (H-1)
-- 5. cancel_equipment_loan_rpc 與 cancel_event_signup_rpc 校驗呼叫者 JWT sub，防禦越權取消 (H-2)
-- 6. 撤銷 save_admin_event_rpc, get_admin_event_signups_rpc, update_event_status_rpc, get_admin_events_rpc 之 anon 權限 (L-4)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. C-1: 加固 sync_officer_cache_rpc 並撤銷 anon
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION sync_officer_cache_rpc(TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION sync_officer_cache_rpc(TEXT, TEXT, TEXT) TO service_role;

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
    -- 嚴格身分守衛：非 service_role 且非現任幹部直接阻斷
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
-- 2. C-2: get_member_profile 與 get_my_dashboard 強制要求 JWT sub
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
    -- 1. 提取 JWT 宣告
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 2. 嚴格阻絕匿名呼叫 (未持有效 JWT 宣告一律拒絕，杜絕匿名回退至 p_line_user_id 查表)
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN jsonb_build_object('error', 'Unauthorized: 缺少有效身分憑證，請先透過 LINE 登入');
    END IF;

    -- 3. 防範 BOLA/IDOR：非幹部僅能讀取本人資料 (sub = p_line_user_id)
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

    -- 嚴格阻絕匿名存取儀表板
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', 'Unauthorized: 缺少有效身分憑證，請先登入'
        );
    END IF;

    IF v_jwt_officer IS NOT TRUE THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object(
                'status', 'error',
                'message', 'Forbidden: Identity mismatch (禁止越權讀取他人儀表板)'
            );
        END IF;
        v_target_id := v_jwt_sub;
    ELSE
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    END IF;

    IF v_target_id IS NULL OR v_target_id = '' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', '缺少 LINE User ID'
        );
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = v_target_id LIMIT 1;

    IF FOUND THEN
        v_profile := jsonb_build_object(
            'name', COALESCE(v_member.name, ''),
            'department', COALESCE(v_member.department, ''),
            'studentId', COALESCE(v_member.student_id, ''),
            'isOfficial', COALESCE(v_member.is_official_member, FALSE) AND (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE),
            'isOfficer', COALESCE(v_member.is_officer, FALSE),
            'officerRole', COALESCE(v_member.officer_role, ''),
            'preferredLanguage', COALESCE(v_member.preferred_language, 'zh'),
            'expireDate', CASE 
                WHEN v_member.membership_expires_at IS NOT NULL THEN to_char(v_member.membership_expires_at, 'YYYY/MM/DD')
                ELSE '尚未核發/尚未繳費 (Not issued/Unpaid)'
            END
        );
    ELSE
        v_profile := jsonb_build_object(
            'name', '',
            'department', '',
            'studentId', '',
            'isOfficial', FALSE,
            'isOfficer', FALSE,
            'officerRole', '',
            'preferredLanguage', 'zh',
            'expireDate', '尚未核發/尚未繳費 (Not issued/Unpaid)'
        );
    END IF;

    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'eventId', e.id,
            'eventName', CASE 
                WHEN COALESCE(v_member.preferred_language, 'zh') = 'en' AND e.title_en IS NOT NULL AND trim(e.title_en) != '' THEN e.title_en
                ELSE e.title
            END,
            'eventNameZh', e.title,
            'eventNameEn', e.title_en,
            'date', to_char(e.start_date, 'YYYY/MM/DD') || CASE WHEN e.end_date != e.start_date THEN ' ~ ' || to_char(e.end_date, 'YYYY/MM/DD') ELSE '' END,
            'reviewStatus', s.status,
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'code', s.id,
            'lineGroupUrl', CASE 
                WHEN s.status::text LIKE '%正取%' AND s.status::text NOT LIKE '%取消%' AND s.status::text NOT LIKE '%Cancelled%' THEN COALESCE(e.line_group_url, '')
                ELSE ''
            END
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = v_target_id
        ORDER BY s.created_at DESC
    ) sub_act;

    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'orderId', l.id,
            'date', to_char(l.start_date, 'YYYY/MM/DD') || ' ~ ' || to_char(l.end_date, 'YYYY/MM/DD'),
            'status', l.status,
            'payStatus', l.payment_status,
            'items', (
                SELECT string_agg(COALESCE(eq_meta.name, '裝備') || ' x ' || li.quantity::text, '、')
                FROM loan_items li
                LEFT JOIN equipments eq_meta ON li.equipment_id = eq_meta.id
                WHERE li.loan_id = l.id
            )
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = v_target_id
        ORDER BY l.created_at DESC
    ) sub_eq;

    RETURN jsonb_build_object(
        'status', 'success',
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. C-3: submit_payment_rpc 伺服端重算金額與身分核對
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_payment_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt_sub TEXT;
    v_payment_id TEXT;
    v_verify_token TEXT;
    v_item_id TEXT;
    v_event_id TEXT;
    v_loan_id TEXT;
    v_event_title TEXT;
    v_selected_ids JSONB;
    v_item_labels TEXT[] := ARRAY[]::TEXT[];
    v_has_membership BOOLEAN := FALSE;
    v_calculated_amount INTEGER := 0;
    v_event_fee INTEGER;
    v_loan_rent INTEGER;
    v_last5 TEXT;
    v_note TEXT;
    v_expiry TEXT;
    v_member_name TEXT;
    v_equip_names TEXT;
    v_target_item_status payment_status_enum;
    v_target_payment_status TEXT;
    v_officer_notes TEXT;
    v_notification_status TEXT;
    v_proof_url TEXT;
    i INTEGER;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少必要的 line_user_id 參數');
    END IF;

    -- 身分防偽校驗：若持有 JWT，禁止冒用他人身分申報
    v_jwt_sub := auth.jwt() ->> 'sub';
    IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' AND v_jwt_sub != trim(p_line_user_id) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Forbidden: 身分不符，禁止冒用他人身分申報繳費');
    END IF;

    v_selected_ids := COALESCE(p_details->'selectedIds', '[]'::jsonb);
    v_last5 := COALESCE(p_details->>'last5Digits', '00000');
    v_note := COALESCE(p_details->>'note', '');
    v_expiry := p_details->>'membershipExpiryDate';
    v_proof_url := p_details->>'proofImageUrl';

    -- 檢查是否包含社費
    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        IF (v_selected_ids->>i) = 'fee_membership' THEN
            v_has_membership := TRUE;
            v_calculated_amount := v_calculated_amount + 500;
        ELSIF (v_selected_ids->>i) LIKE 'act_%' THEN
            v_event_id := substring((v_selected_ids->>i) from 5);
            SELECT COALESCE(fee, 0) INTO v_event_fee FROM events WHERE id = v_event_id;
            v_calculated_amount := v_calculated_amount + COALESCE(v_event_fee, 0);
        ELSIF (v_selected_ids->>i) LIKE 'eq_%' THEN
            v_loan_id := substring((v_selected_ids->>i) from 4);
            SELECT COALESCE(total_rent, 0) INTO v_loan_rent FROM loans WHERE id = v_loan_id;
            v_calculated_amount := v_calculated_amount + COALESCE(v_loan_rent, 0);
        END IF;
    END LOOP;

    -- 只有當伺服器端計算確為 0 元時方可自動核銷；否則強制進入「待確認 Checking」
    IF v_calculated_amount = 0 AND jsonb_array_length(v_selected_ids) > 0 THEN
        v_target_item_status := text_to_payment_status_enum('已繳費 Paid');
        v_target_payment_status := '已核銷 Confirmed';
        v_officer_notes := '0元免費項目系統自動核銷';
        v_notification_status := '免通知';
    ELSE
        v_target_item_status := text_to_payment_status_enum('待確認 Checking');
        v_target_payment_status := '待確認 Checking';
        v_officer_notes := NULL;
        v_notification_status := '未通知';
    END IF;

    v_member_name := COALESCE(p_details->>'userName', '');
    IF v_member_name = '' THEN
        SELECT name INTO v_member_name FROM members WHERE line_user_id = p_line_user_id;
    END IF;

    INSERT INTO members (line_user_id, name, created_at, updated_at)
    VALUES (p_line_user_id, COALESCE(NULLIF(v_member_name, ''), '山友'), NOW(), NOW())
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, ''), members.name);

    v_payment_id := 'PAY_' || to_char(NOW(), 'YYYYMMDD_HH24MISS_') || lpad(floor(random() * 1000)::text, 3, '0');

    BEGIN
        v_verify_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    EXCEPTION WHEN OTHERS THEN
        v_verify_token := md5(random()::text || clock_timestamp()::text || p_line_user_id || v_payment_id);
    END;

    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        v_item_id := v_selected_ids->>i;

        IF v_item_id = 'fee_membership' THEN
            IF v_calculated_amount = 0 AND v_expiry IS NOT NULL AND v_expiry != '' THEN
                UPDATE members 
                SET payment_status = v_target_item_status,
                    is_official_member = TRUE,
                    membership_expires_at = to_date(replace(v_expiry, '-', '/'), 'YYYY/MM/DD'),
                    updated_at = NOW()
                WHERE line_user_id = p_line_user_id;
            ELSE
                UPDATE members 
                SET payment_status = v_target_item_status,
                    updated_at = NOW()
                WHERE line_user_id = p_line_user_id;
            END IF;

            IF v_expiry IS NOT NULL AND v_expiry != '' THEN
                v_item_labels := array_append(v_item_labels, '社籍與社費 (Membership Fee) (有效至 ' || replace(v_expiry, '-', '/') || ')');
            ELSE
                v_item_labels := array_append(v_item_labels, '社籍與社費 (Membership Fee)');
            END IF;

        ELSIF v_item_id LIKE 'act_%' THEN
            v_event_id := substring(v_item_id from 5);

            UPDATE event_signups 
            SET payment_status = v_target_item_status,
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND event_id = v_event_id;

            SELECT title INTO v_event_title FROM events WHERE id = v_event_id;
            v_item_labels := array_append(v_item_labels, '活動：' || COALESCE(v_event_title, v_event_id));

        ELSIF v_item_id LIKE 'eq_%' THEN
            v_loan_id := substring(v_item_id from 4);

            UPDATE loans 
            SET payment_status = v_target_item_status,
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND id = v_loan_id;

            SELECT string_agg(COALESCE(e.name, '裝備') || ' x ' || li.quantity::text, '、')
            INTO v_equip_names
            FROM loan_items li
            LEFT JOIN equipments e ON e.id = li.equipment_id
            WHERE li.loan_id = v_loan_id;

            IF v_equip_names IS NOT NULL AND trim(v_equip_names) != '' THEN
                v_item_labels := array_append(v_item_labels, '裝備：' || v_equip_names || ' (' || v_loan_id || ')' || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            ELSE
                v_item_labels := array_append(v_item_labels, '裝備租借：' || v_loan_id || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            END IF;
        END IF;
    END LOOP;

    INSERT INTO payments (
        id,
        line_user_id,
        name,
        type,
        amount,
        bank_last5,
        proof_image_url,
        status,
        verify_token,
        selected_ids,
        notes,
        officer_notes,
        notification_status,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        p_line_user_id,
        v_member_name,
        array_to_string(v_item_labels, ', '),
        v_calculated_amount,
        v_last5,
        v_proof_url,
        v_target_payment_status,
        v_verify_token,
        v_selected_ids,
        v_note,
        v_officer_notes,
        v_notification_status,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'verify_token', v_verify_token,
        'items', array_to_string(v_item_labels, ', '),
        'is_zero_amount', (v_calculated_amount = 0),
        'status', v_target_payment_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '資料庫處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. H-1 & H-2: 取消 RPC 固定 search_path 與 JWT sub 驗證
-- ------------------------------------------------------------------------------
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
BEGIN
    IF p_line_user_id IS NULL OR p_loan_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);

    -- 阻絕越權取消他人租借單
    IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
        IF NOT v_is_officer AND v_jwt_sub != trim(p_line_user_id) THEN
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
BEGIN
    IF p_line_user_id IS NULL OR p_signup_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);

    IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
        IF NOT v_is_officer AND v_jwt_sub != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人活動報名');
        END IF;
    END IF;

    SELECT * INTO v_signup
    FROM event_signups
    WHERE (id = p_signup_id OR event_id = p_signup_id) AND line_user_id = trim(p_line_user_id)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到對應的活動報名紀錄');
    END IF;

    IF v_signup.status = '已取消 Cancelled' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此活動報名已處於取消狀態');
    END IF;

    UPDATE event_signups
    SET status = '已取消 Cancelled',
        cancel_reason = COALESCE(p_reason, v_signup.cancel_reason, '社員自個人主頁取消'),
        updated_at = NOW()
    WHERE id = v_signup.id;

    RETURN jsonb_build_object('status', 'success', 'message', '活動報名已成功取消！');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- 確保 submit_equipment_loan_rpc 包含 SET search_path = public
CREATE OR REPLACE FUNCTION submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_is_official BOOLEAN := FALSE;
    v_user_name TEXT := '未知社員';
    v_pickup_date DATE;
    v_return_date DATE;
    v_days INTEGER := 1;
    v_extra_days INTEGER := 0;
    v_purpose TEXT;
    v_other_purpose TEXT;
    v_cart JSONB;
    v_equip_id TEXT;
    v_qty INTEGER;
    v_equip RECORD;
    v_item_base INTEGER := 0;
    v_unit_price INTEGER := 0;
    v_subtotal INTEGER := 0;
    v_total_rent INTEGER := 0;
    v_total_deposit INTEGER := 0;
    v_loan_id TEXT;
    v_item_count INTEGER := 0;
    v_loan_status loans.status%TYPE := '待領取 To Be Collected';
    v_loan_payment_status loans.payment_status%TYPE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    SELECT name, is_official_member, membership_expires_at
    INTO v_member
    FROM members
    WHERE line_user_id = p_line_user_id;

    IF FOUND THEN
        v_user_name := COALESCE(v_member.name, '未知社員');
        IF v_member.is_official_member IS TRUE AND 
           (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        INSERT INTO members (line_user_id, name, created_at, updated_at)
        VALUES (p_line_user_id, COALESCE(p_details->>'borrowerName', '未註冊成員'), NOW(), NOW())
        ON CONFLICT (line_user_id) DO NOTHING;
        v_user_name := COALESCE(p_details->>'borrowerName', '未註冊成員');
    END IF;

    BEGIN
        v_pickup_date := (p_details->>'pickupDate')::DATE;
        v_return_date := (p_details->>'returnDate')::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'error', 'message', '日期格式無效 (Invalid Date Range)');
    END;

    IF v_return_date < v_pickup_date THEN
        RETURN jsonb_build_object('status', 'error', 'message', '歸還日期不能早於領取日期');
    END IF;

    v_days := (v_return_date - v_pickup_date) + 1;
    IF v_days <= 0 THEN
        v_days := 1;
    END IF;

    v_extra_days := GREATEST(0, v_days - 2);
    v_purpose := COALESCE(p_details->>'purpose', '社團出隊');
    v_other_purpose := p_details->>'otherPurpose';
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車清單為空');
    END IF;

    v_loan_id := 'ORD_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            v_item_count := v_item_count + 1;

            SELECT id, name, available_qty, is_borrowable,
                   COALESCE(price_2day, member_price_per_day, 0) AS p2,
                   COALESCE(price_extra_day, non_member_price_per_day, 0) AS p_extra
            INTO v_equip
            FROM equipments
            WHERE id = v_equip_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION '裝備代號 [%] 不存在', v_equip_id;
            END IF;

            IF v_equip.is_borrowable IS NOT TRUE THEN
                RAISE EXCEPTION '裝備 [%] 目前設定為不開放借用', v_equip.name;
            END IF;

            IF v_equip.available_qty < v_qty THEN
                RAISE EXCEPTION '裝備 [%] 庫存不足！剩餘可用 %，欲借用 %', v_equip.name, v_equip.available_qty, v_qty;
            END IF;

            UPDATE equipments
            SET available_qty = available_qty - v_qty,
                updated_at = NOW()
            WHERE id = v_equip_id;

            v_item_base := COALESCE(v_equip.p2, 0) + (v_extra_days * COALESCE(v_equip.p_extra, 0));
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSIF v_is_official THEN
                v_unit_price := ROUND(v_item_base * 0.5);
            ELSE
                v_unit_price := v_item_base;
            END IF;

            v_subtotal := v_unit_price * v_qty;
            v_total_rent := v_total_rent + v_subtotal;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內無有效數量之品項');
    END IF;

    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid';
    ELSE
        v_loan_payment_status := '未繳費 Unpaid';
    END IF;

    INSERT INTO loans (
        id,
        line_user_id,
        name,
        start_date,
        end_date,
        days,
        purpose,
        purpose_other,
        status,
        payment_status,
        total_deposit,
        total_rent,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_loan_id,
        p_line_user_id,
        v_user_name,
        v_pickup_date,
        v_return_date,
        v_days,
        v_purpose,
        v_other_purpose,
        v_loan_status,
        v_loan_payment_status,
        v_total_deposit,
        v_total_rent,
        COALESCE(p_details->>'notes', ''),
        NOW(),
        NOW()
    );

    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            SELECT id, name,
                   COALESCE(price_2day, member_price_per_day, 0) AS p2,
                   COALESCE(price_extra_day, non_member_price_per_day, 0) AS p_extra
            INTO v_equip
            FROM equipments
            WHERE id = v_equip_id;

            v_item_base := COALESCE(v_equip.p2, 0) + (v_extra_days * COALESCE(v_equip.p_extra, 0));
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSIF v_is_official THEN
                v_unit_price := ROUND(v_item_base * 0.5);
            ELSE
                v_unit_price := v_item_base;
            END IF;
            v_subtotal := v_unit_price * v_qty;

            INSERT INTO loan_items (
                loan_id,
                equipment_id,
                quantity,
                unit_price_snapshot,
                subtotal
            ) VALUES (
                v_loan_id,
                v_equip_id,
                v_qty,
                v_unit_price,
                v_subtotal
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'message', '租借申請已成功送出！',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'totalDeposit', v_total_deposit,
        'paymentStatus', v_loan_payment_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', '資料庫處理失敗: ' || SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. L-4: 撤銷剩餘歷史管理 RPC 對 anon 的授權
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_event_status_rpc(TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_event_status_rpc(TEXT, TEXT, TEXT) TO authenticated, service_role;

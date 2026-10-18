-- ==============================================================================
-- 台科登山社社團系統 (NTUST Mountaineering Club System)
-- 財務核銷與 0 元活動流轉全面修復 Migration (2026-10-18)
-- 目的：
-- 1. 0 元活動審核流轉：update_signup_status_rpc 審核正取時自動判定 fee = 0，自動將 payment_status 設為「已繳費 Paid」且 status 直接推進為「正取（已繳費）Confirmed (Paid)」（免發推播以節省額度）
-- 2. 幹部後台財務核銷精準隔離：update_admin_payment_status_rpc 支援 selected_ids 解析，精準僅連動勾選項，並同步將活動 status 推進為「正取（已繳費）Confirmed (Paid)」，徹底移除連帶誤傷之 p_target_id IS NULL 漏洞
-- ==============================================================================

-- 1. 升級 update_signup_status_rpc：支援 0 元活動正取自動已繳費
CREATE OR REPLACE FUNCTION update_signup_status_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT,
    p_signup_id TEXT,
    p_review_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status_val event_signup_status_enum;
    v_status_text TEXT;
    v_event_fee INTEGER := 0;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法審核');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼');
    END IF;

    v_status_text := trim(p_review_result);
    IF v_status_text LIKE '%正取（已繳費）%' OR v_status_text LIKE '%Confirmed (Paid)%' THEN
        v_status_val := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取（有意願）%' OR v_status_text LIKE '%Waitlisted (Interested)%' THEN
        v_status_val := '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%正取%' OR v_status_text LIKE '%Confirmed%' THEN
        v_status_val := '正取 Confirmed'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取%' OR v_status_text LIKE '%Waitlisted%' THEN
        v_status_val := '備取 Waitlisted'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%取消%' OR v_status_text LIKE '%Cancelled%' THEN
        v_status_val := '已取消 Cancelled'::event_signup_status_enum;
    ELSE
        v_status_val := '審核中 Checking'::event_signup_status_enum;
    END IF;

    -- 查詢活動費用 (判定是否為 0 元免費活動)
    SELECT COALESCE(e.fee, 0) INTO v_event_fee
    FROM event_signups s
    LEFT JOIN events e ON s.event_id = e.id
    WHERE s.id = trim(p_signup_id);

    -- 若為 0 元活動且錄取正取，自動推進為「正取（已繳費）」且 payment_status 為「已繳費 Paid」（完全不發送 LINE 推播，節省額度）
    IF v_status_text LIKE '%正取%' OR v_status_text LIKE '%Confirmed%' THEN
        IF v_event_fee = 0 THEN
            v_status_val := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
            UPDATE event_signups
            SET status = v_status_val,
                payment_status = '已繳費 Paid'::payment_status_enum,
                updated_at = NOW()
            WHERE id = trim(p_signup_id);
        ELSIF v_status_text LIKE '%正取（已繳費）%' OR v_status_text LIKE '%Confirmed (Paid)%' THEN
            UPDATE event_signups
            SET status = v_status_val,
                payment_status = '已繳費 Paid'::payment_status_enum,
                updated_at = NOW()
            WHERE id = trim(p_signup_id);
        ELSE
            UPDATE event_signups
            SET status = v_status_val,
                updated_at = NOW()
            WHERE id = trim(p_signup_id);
        END IF;
    ELSE
        UPDATE event_signups
        SET status = v_status_val,
            updated_at = NOW()
        WHERE id = trim(p_signup_id);
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到該筆報名紀錄 (' || trim(p_signup_id) || ')');
    END IF;

    -- 排入 sync_queue 異步同步至 Google Sheets
    INSERT INTO sync_queue (table_name, action, record_id, payload)
    VALUES (
        'event_signups',
        'UPDATE',
        trim(p_signup_id),
        jsonb_build_object(
            'eventId', trim(p_event_id),
            'signupId', trim(p_signup_id),
            'reviewResult', trim(p_review_result),
            'updatedBy', trim(p_officer_line_user_id)
        )
    );

    RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 2. 升級 update_admin_payment_status_rpc：支援 selected_ids 解析、精確核銷與狀態推進
CREATE OR REPLACE FUNCTION update_admin_payment_status_rpc(
    p_officer_line_user_id TEXT,
    p_payment_id TEXT,
    p_source_type TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_status TEXT,
    p_line_user_id TEXT,
    p_officer_name TEXT,
    p_notes TEXT,
    p_notification_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_is_confirmed BOOLEAN;
    v_mapped_pay_status payment_status_enum;
    v_payment RECORD;
    v_target_user_id TEXT;
    v_is_membership BOOLEAN := FALSE;
    v_extracted_expiry TEXT;
    v_calculated_expiry DATE;
    v_selected_ids JSONB;
    v_event_ids TEXT[] := ARRAY[]::TEXT[];
    v_loan_ids TEXT[] := ARRAY[]::TEXT[];
    v_item_id TEXT;
    v_signup RECORD;
    v_new_signup_status event_signup_status_enum;
    i INTEGER;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部執行財務核銷！');
    END IF;

    v_is_confirmed := (p_status = '已核銷 Confirmed');
    v_mapped_pay_status := CASE 
        WHEN p_status = '已核銷 Confirmed' THEN '已繳費 Paid'::payment_status_enum 
        WHEN p_status = '待繳費 Unpaid' THEN '未繳費 Unpaid'::payment_status_enum
        ELSE '待確認 Checking'::payment_status_enum 
    END;

    IF p_source_type = 'payment' THEN
        -- 讀取繳費單既有紀錄備援
        SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
        v_target_user_id := COALESCE(NULLIF(p_line_user_id, ''), v_payment.line_user_id);

        UPDATE payments
        SET status = p_status,
            confirmed_by = CASE WHEN v_is_confirmed THEN COALESCE(NULLIF(p_officer_name, ''), '管理幹部') ELSE NULL END,
            confirmed_at = CASE WHEN v_is_confirmed THEN NOW() ELSE NULL END,
            officer_notes = p_notes,
            notification_status = COALESCE(p_notification_status, notification_status),
            updated_at = NOW()
        WHERE id = p_payment_id;

        -- 1. 解析 selected_ids 陣列
        v_selected_ids := COALESCE(v_payment.selected_ids, '[]'::jsonb);
        IF jsonb_typeof(v_selected_ids) = 'array' AND jsonb_array_length(v_selected_ids) > 0 THEN
            FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
                v_item_id := v_selected_ids->>i;
                IF v_item_id LIKE 'act_%' THEN
                    v_event_ids := array_append(v_event_ids, substring(v_item_id from 5));
                ELSIF v_item_id LIKE 'eq_%' THEN
                    v_loan_ids := array_append(v_loan_ids, substring(v_item_id from 4));
                ELSIF v_item_id = 'fee_membership' THEN
                    v_is_membership := TRUE;
                END IF;
            END LOOP;
        END IF;

        -- 若前端有傳入明確 target_id 或 payments 表有紀錄，亦併入精準名單
        IF p_target_id IS NOT NULL AND trim(p_target_id) != '' THEN
            IF p_target_type = 'event' THEN
                v_event_ids := array_append(v_event_ids, trim(p_target_id));
            ELSIF p_target_type = 'loan' THEN
                v_loan_ids := array_append(v_loan_ids, trim(p_target_id));
            END IF;
        END IF;

        IF v_payment.target_id IS NOT NULL AND trim(v_payment.target_id) != '' THEN
            IF v_payment.target_type = 'event' THEN
                v_event_ids := array_append(v_event_ids, trim(v_payment.target_id));
            ELSIF v_payment.target_type = 'loan' THEN
                v_loan_ids := array_append(v_loan_ids, trim(v_payment.target_id));
            END IF;
        END IF;

        -- 判定是否包含社費
        IF NOT v_is_membership THEN
            v_is_membership := (
                p_target_type = 'membership' 
                OR v_payment.target_type = 'membership'
                OR v_payment.type ILIKE '%社費%' 
                OR v_payment.type ILIKE '%Membership%'
            );
        END IF;

        -- A. 活動報名連動 (精準限定勾選活動，嚴禁全表誤傷)
        IF v_target_user_id IS NOT NULL THEN
            IF array_length(v_event_ids, 1) > 0 THEN
                FOR v_signup IN 
                    SELECT id, status 
                    FROM event_signups 
                    WHERE line_user_id = v_target_user_id 
                      AND event_id = ANY(v_event_ids)
                LOOP
                    v_new_signup_status := v_signup.status;
                    IF v_is_confirmed AND v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                        v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                    END IF;

                    UPDATE event_signups
                    SET payment_status = v_mapped_pay_status,
                        status = v_new_signup_status,
                        updated_at = NOW()
                    WHERE id = v_signup.id;
                END LOOP;
            ELSIF (p_target_type = 'event' OR v_payment.target_type = 'event' OR v_payment.type ILIKE '%活動%') THEN
                -- 舊版無 selected_ids 與 target_id 之 fallback：只更新處於「待確認 Checking」的活動報名，嚴禁全表更動
                FOR v_signup IN 
                    SELECT id, status 
                    FROM event_signups 
                    WHERE line_user_id = v_target_user_id 
                      AND payment_status = '待確認 Checking'
                LOOP
                    v_new_signup_status := v_signup.status;
                    IF v_is_confirmed AND v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                        v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                    END IF;

                    UPDATE event_signups
                    SET payment_status = v_mapped_pay_status,
                        status = v_new_signup_status,
                        updated_at = NOW()
                    WHERE id = v_signup.id;
                END LOOP;
            END IF;
        END IF;

        -- B. 裝備租借連動 (精準限定勾選租借單)
        IF array_length(v_loan_ids, 1) > 0 THEN
            UPDATE loans
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE id = ANY(v_loan_ids);
        ELSIF (p_target_type = 'loan' OR v_payment.target_type = 'loan' OR v_payment.type ILIKE '%裝備%' OR v_payment.type ILIKE '%租借%') AND v_target_user_id IS NOT NULL THEN
            -- 舊版 fallback：只更新處於「待確認 Checking」的租借紀錄
            UPDATE loans
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE line_user_id = v_target_user_id AND payment_status = '待確認 Checking';
        END IF;

        -- C. 社費繳納連動 (更新繳費狀態、正式社員標記、若有註明則填入到期日)
        IF v_is_membership AND v_target_user_id IS NOT NULL THEN
            IF v_is_confirmed THEN
                -- 從繳費項目字串提取明確有效期限 (例如：有效至 2026/07/31 或 2026-07-31)
                v_extracted_expiry := substring(v_payment.type from '(\d{4}[-/]\d{2}[-/]\d{2})');
                IF v_extracted_expiry IS NOT NULL THEN
                    BEGIN
                        v_calculated_expiry := replace(v_extracted_expiry, '/', '-')::DATE;
                    EXCEPTION WHEN OTHERS THEN
                        v_calculated_expiry := NULL;
                    END;
                ELSE
                    v_calculated_expiry := NULL;
                END IF;

                UPDATE members
                SET payment_status = '已繳費 Paid'::payment_status_enum,
                    is_official_member = TRUE,
                    membership_expires_at = COALESCE(v_calculated_expiry, membership_expires_at),
                    updated_at = NOW()
                WHERE line_user_id = v_target_user_id;
            ELSE
                UPDATE members
                SET payment_status = v_mapped_pay_status,
                    updated_at = NOW()
                WHERE line_user_id = v_target_user_id;
            END IF;
        END IF;
    ELSIF p_source_type = 'loan' THEN
        UPDATE loans
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    ELSIF p_source_type = 'event_signup' THEN
        UPDATE event_signups
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. 配置權限
REVOKE EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

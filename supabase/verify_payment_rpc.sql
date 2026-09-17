-- ==============================================================================
-- 台科登山社社團系統 (NTUST Mountaineering Club System)
-- 免 Google 帳號登入衝突：安全 Token 單鍵核銷 RPC (verify_payment_rpc.sql)
-- 說明：請至 Supabase 控制台 > SQL Editor 貼上執行此腳本即可一鍵完成部署
-- ==============================================================================

-- 1. 確保 payments 表具備 verify_token 欄位
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verify_token TEXT;
CREATE INDEX IF NOT EXISTS idx_payments_verify_token ON payments(verify_token);

-- 1.1 確保 payment_status_enum 列舉型別與隱式轉換 (徹底防禦 text 轉型失敗)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
            '已繳費 Paid',
            '待確認 Checking',
            '未繳費 Unpaid'
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val text)
RETURNS payment_status_enum AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' THEN
        RETURN '未繳費 Unpaid'::payment_status_enum;
    ELSIF val LIKE '%已繳費%' OR val LIKE '%Paid%' THEN
        RETURN '已繳費 Paid'::payment_status_enum;
    ELSIF val LIKE '%待確認%' OR val LIKE '%Checking%' THEN
        RETURN '待確認 Checking'::payment_status_enum;
    ELSE
        RETURN '未繳費 Unpaid'::payment_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '未繳費 Unpaid'::payment_status_enum;
END;
$cast$ LANGUAGE plpgsql IMMUTABLE;

DROP CAST IF EXISTS (text AS payment_status_enum);
CREATE CAST (text AS payment_status_enum)
WITH FUNCTION text_to_payment_status_enum(text) AS IMPLICIT;

-- 2. 升級 submit_payment_rpc 函式：申報時自動生成 32 字元隨機 verify_token 並回傳
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
    v_payment_id TEXT;
    v_verify_token TEXT;
    v_item_id TEXT;
    v_event_id TEXT;
    v_loan_id TEXT;
    v_event_title TEXT;
    v_selected_ids JSONB;
    v_item_labels TEXT[] := ARRAY[]::TEXT[];
    v_has_membership BOOLEAN := FALSE;
    v_total_amount INTEGER;
    v_last5 TEXT;
    v_note TEXT;
    v_expiry TEXT;
    v_member_name TEXT;
    v_equip_names TEXT;
    i INTEGER;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少必要的 line_user_id 參數');
    END IF;

    v_selected_ids := COALESCE(p_details->'selectedIds', '[]'::jsonb);
    v_total_amount := COALESCE((p_details->>'totalAmount')::INTEGER, 0);
    v_last5 := COALESCE(p_details->>'last5Digits', '00000');
    v_note := COALESCE(p_details->>'note', '');
    v_expiry := p_details->>'membershipExpiryDate';

    -- 取得社員姓名 (優先從 details 讀取，若無則查詢 members 表)
    v_member_name := COALESCE(p_details->>'userName', '');
    IF v_member_name = '' THEN
        SELECT name INTO v_member_name FROM members WHERE line_user_id = p_line_user_id;
    END IF;

    -- 🛡️ 防禦性確保 members 存在此使用者 (防止 payments_line_user_id_fkey 外鍵違規)
    INSERT INTO members (line_user_id, name, created_at, updated_at)
    VALUES (p_line_user_id, COALESCE(NULLIF(v_member_name, ''), '山友'), NOW(), NOW())
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, ''), members.name);

    -- 生成唯一繳費單號 PAY_YYYYMMDD_HH24MISS_xxx
    v_payment_id := 'PAY_' || to_char(NOW(), 'YYYYMMDD_HH24MISS_') || lpad(floor(random() * 1000)::text, 3, '0');

    -- 🛡️ 生成 32 位元隨機安全憑證 (單次防偽核銷 Token，使用 PostgreSQL 核心內建 md5，免除 pgcrypto 相依性)
    v_verify_token := md5(random()::text || clock_timestamp()::text || p_line_user_id || v_payment_id);

    -- 檢查是否包含社費
    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        IF (v_selected_ids->>i) = 'fee_membership' THEN
            v_has_membership := TRUE;
            EXIT;
        END IF;
    END LOOP;

    -- 逐項處理已勾選項目與狀態更新
    FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
        v_item_id := v_selected_ids->>i;

        -- A. 社費
        IF v_item_id = 'fee_membership' THEN
            UPDATE members 
            SET payment_status = text_to_payment_status_enum('待確認 Checking'),
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id;

            IF v_expiry IS NOT NULL AND v_expiry != '' THEN
                v_item_labels := array_append(v_item_labels, '🔸 社籍與社費 (Membership Fee) (有效至 ' || v_expiry || ')');
            ELSE
                v_item_labels := array_append(v_item_labels, '🔸 社籍與社費 (Membership Fee)');
            END IF;

        -- B. 活動
        ELSIF v_item_id LIKE 'act_%' THEN
            v_event_id := substring(v_item_id from 5);

            UPDATE event_signups 
            SET payment_status = text_to_payment_status_enum('待確認 Checking'),
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND event_id = v_event_id;

            SELECT title INTO v_event_title FROM events WHERE id = v_event_id;
            v_item_labels := array_append(v_item_labels, '🔸 活動：' || COALESCE(v_event_title, v_event_id));

        -- C. 裝備
        ELSIF v_item_id LIKE 'eq_%' THEN
            v_loan_id := substring(v_item_id from 4);

            UPDATE loans 
            SET payment_status = text_to_payment_status_enum('待確認 Checking'),
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND id = v_loan_id;

            -- 若同時繳納社費且為個人租借，套用 5 折優待
            IF v_has_membership THEN
                UPDATE loans 
                SET total_rent = ROUND(total_rent * 0.5)
                WHERE line_user_id = p_line_user_id 
                  AND id = v_loan_id 
                  AND purpose NOT IN ('社團出隊', '社團出團')
                  AND total_rent > 0;
            END IF;

            -- 查詢該筆租借訂單的實際裝備品項名稱與數量
            SELECT string_agg(COALESCE(e.name, '裝備') || ' x ' || li.quantity::text, '、')
            INTO v_equip_names
            FROM loan_items li
            LEFT JOIN equipments e ON e.id = li.equipment_id
            WHERE li.loan_id = v_loan_id;

            IF v_equip_names IS NOT NULL AND trim(v_equip_names) != '' THEN
                v_item_labels := array_append(v_item_labels, '🔹 裝備：' || v_equip_names || ' (' || v_loan_id || ')' || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            ELSE
                v_item_labels := array_append(v_item_labels, '🔹 裝備租借：' || v_loan_id || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            END IF;
        END IF;
    END LOOP;

    -- 寫入 payments 資料表 (包含 verify_token)
    INSERT INTO payments (
        id,
        line_user_id,
        name,
        type,
        amount,
        bank_last5,
        status,
        verify_token,
        officer_notes,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        p_line_user_id,
        v_member_name,
        array_to_string(v_item_labels, ', '),
        v_total_amount,
        v_last5,
        '待確認 Checking',
        v_verify_token,
        v_note,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'verify_token', v_verify_token,
        'items', array_to_string(v_item_labels, ', ')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '資料庫處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

-- 3. 建立安全 Token 單鍵核銷 RPC：verify_payment_by_token
CREATE OR REPLACE FUNCTION verify_payment_by_token(
    p_payment_id TEXT,
    p_verify_token TEXT,
    p_officer_name TEXT DEFAULT 'Email 單鍵核銷'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_payment RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_signup RECORD;
    v_new_signup_status event_signup_status_enum;
    v_extracted_expiry TEXT;
    v_calculated_expiry DATE;
BEGIN
    -- 參數基本防禦
    IF p_payment_id IS NULL OR trim(p_payment_id) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少繳費單號 (Missing paymentId)');
    END IF;

    IF p_verify_token IS NULL OR trim(p_verify_token) = '' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '缺少安全金鑰 (Missing verifyToken)');
    END IF;

    -- 查詢該筆繳費紀錄
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '找不到繳費單號：' || p_payment_id);
    END IF;

    -- 比對安全金鑰 (若該紀錄存在 verify_token 則必須相符)
    IF v_payment.verify_token IS NOT NULL AND v_payment.verify_token != '' THEN
        IF v_payment.verify_token != trim(p_verify_token) THEN
            RETURN jsonb_build_object('success', FALSE, 'error', '安全金鑰無效或已過期，拒絕核銷 (Invalid verifyToken)');
        END IF;
    END IF;

    -- 檢查是否先前已核銷
    IF v_payment.status LIKE '%已核銷%' OR v_payment.status LIKE '%Confirmed%' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'alreadyConfirmed', TRUE,
            'paymentId', v_payment.id,
            'userName', COALESCE(v_payment.name, '社員'),
            'amount', v_payment.amount,
            'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
            'lineUserId', v_payment.line_user_id,
            'message', '該繳費單先前已完成核銷 (Already Confirmed)'
        );
    END IF;

    -- 1. 更新 payments 主狀態為「已核銷 Confirmed」
    UPDATE payments
    SET status = '已核銷 Confirmed',
        confirmed_by = COALESCE(p_officer_name, 'Email 單鍵核銷'),
        confirmed_at = v_now,
        updated_at = v_now
    WHERE id = p_payment_id;

    -- 2. 連動更新活動報名表 (event_signups)
    IF v_payment.line_user_id IS NOT NULL THEN
        FOR v_signup IN 
            SELECT id, status 
            FROM event_signups 
            WHERE line_user_id = v_payment.line_user_id 
              AND payment_status != '已繳費 Paid'
        LOOP
            v_new_signup_status := v_signup.status;
            -- 若為正取，升級為正取（已繳費）
            IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
            END IF;

            UPDATE event_signups
            SET payment_status = '已繳費 Paid',
                status = v_new_signup_status,
                updated_at = v_now
            WHERE id = v_signup.id;
        END LOOP;

        -- 3. 連動更新社員社費 (members)
        IF v_payment.type LIKE '%社費%' OR v_payment.type LIKE '%Membership%' OR v_payment.target_type = 'membership' THEN
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
            SET payment_status = '已繳費 Paid',
                is_official_member = TRUE,
                membership_expires_at = COALESCE(v_calculated_expiry, membership_expires_at),
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id;
        END IF;

        -- 4. 連動更新裝備租借 (loans)
        IF v_payment.type LIKE '%裝備%' OR v_payment.type LIKE '%租借%' THEN
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND payment_status != '已繳費 Paid';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'alreadyConfirmed', FALSE,
        'paymentId', v_payment.id,
        'userName', COALESCE(v_payment.name, '社員'),
        'amount', v_payment.amount,
        'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
        'lineUserId', v_payment.line_user_id,
        'message', '核銷成功！系統已自動連動更新對應之報名與租借狀態'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '核銷處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

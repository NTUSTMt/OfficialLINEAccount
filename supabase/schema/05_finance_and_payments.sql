-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 05 - 財務、申報與核銷 (05_finance_and_payments.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 繳費申報資料表 (payments) -> Google Sheets: Payments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,                                 -- 繳費單號 (如 PAY_YYYYMMDD_XXXX)
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 申報人真實姓名
    type TEXT NOT NULL,                                  -- 繳費項目自述 (如：繳交社費 / 活動：雪山東峰 / 裝備租借 / 合併繳費)
    target_type TEXT,                                    -- 目標業務型態 (membership / event / loan / multi)
    target_id TEXT,                                      -- 關聯目標 ID (活動編號、租借單號或 NULL)
    amount INTEGER NOT NULL DEFAULT 0,                   -- 申報匯款金額 (新台幣整數)
    bank_last5 TEXT,                                     -- 匯款帳號末五碼
    proof_image_url TEXT,                                -- Google Drive 匯款證明相片網址
    status TEXT NOT NULL DEFAULT '待確認 Checking',       -- 款項核銷狀態 (待確認 Checking / 已核銷 Confirmed / 退件 Rejected)
    selected_ids JSONB DEFAULT '[]'::jsonb,              -- 多筆合併繳費時選取的項目代號陣列 (如 ["act_E01", "fee_membership"])
    verify_token TEXT,                                   -- 幹部單鍵免登入核銷安全密鑰 (32位元隨機字串)
    officer_notes TEXT,                                  -- 幹部審核備註 / 退件原因
    confirmed_by TEXT,                                   -- 核銷幹部身分 / 姓名
    confirmed_at TIMESTAMPTZ,                            -- 核銷確認時間戳記
    notification_status TEXT DEFAULT '未通知',           -- 核銷推播通知發送狀態 (未通知 / 已通知 / 免通知)
    notes TEXT,                                          -- 社員申報備註
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(line_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_verify_token ON payments(verify_token);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 確保 payments 表具備 verify_token、selected_ids、notes 與 officer_notes 欄位
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verify_token TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS selected_ids JSONB;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS officer_notes TEXT;

-- ------------------------------------------------------------------------------
-- 2. 會員端 RPC：繳費申報提交 (submit_payment_rpc)
-- 包含後端金額重算、verify_token 生成、0元免審自動核銷、多筆合併關聯
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
    v_proof_url TEXT;
    v_target_item_status payment_status_enum;
    v_target_payment_status TEXT;
    v_officer_notes TEXT;
    v_notification_status TEXT;
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
    v_proof_url := p_details->>'proofImageUrl';

    -- 判斷是否為 0 元申報（若為 0 元則直接原子性核銷為「已繳費 Paid / 已核銷 Confirmed」）
    IF v_total_amount = 0 THEN
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

    -- 取得社員姓名 (優先從 details 讀取，若無則查詢 members 表)
    v_member_name := COALESCE(p_details->>'userName', '');
    IF v_member_name = '' THEN
        SELECT name INTO v_member_name FROM members WHERE line_user_id = p_line_user_id;
    END IF;

    -- 防禦性確保 members 存在此使用者 (防止 payments_line_user_id_fkey 外鍵違規)
    INSERT INTO members (line_user_id, name, created_at, updated_at)
    VALUES (p_line_user_id, COALESCE(NULLIF(v_member_name, ''), '山友'), NOW(), NOW())
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = COALESCE(NULLIF(EXCLUDED.name, ''), members.name);

    -- 生成唯一繳費單號 PAY_YYYYMMDD_HH24MISS_xxx
    v_payment_id := 'PAY_' || to_char(NOW(), 'YYYYMMDD_HH24MISS_') || lpad(floor(random() * 1000)::text, 3, '0');

    -- 生成 32 位元隨機安全憑證 (單次防偽核銷 Token，採用密碼學安全 CSPRNG gen_random_uuid)
    BEGIN
        v_verify_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    EXCEPTION WHEN OTHERS THEN
        v_verify_token := md5(random()::text || clock_timestamp()::text || p_line_user_id || v_payment_id);
    END;

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
            IF v_total_amount = 0 AND v_expiry IS NOT NULL AND v_expiry != '' THEN
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

        -- B. 活動
        ELSIF v_item_id LIKE 'act_%' THEN
            v_event_id := substring(v_item_id from 5);

            UPDATE event_signups 
            SET payment_status = v_target_item_status,
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND event_id = v_event_id;

            SELECT title INTO v_event_title FROM events WHERE id = v_event_id;
            v_item_labels := array_append(v_item_labels, '活動：' || COALESCE(v_event_title, v_event_id));

        -- C. 裝備租借
        ELSIF v_item_id LIKE 'eq_%' THEN
            v_loan_id := substring(v_item_id from 4);

            UPDATE loans 
            SET payment_status = v_target_item_status,
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
                v_item_labels := array_append(v_item_labels, '裝備：' || v_equip_names || ' (' || v_loan_id || ')' || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            ELSE
                v_item_labels := array_append(v_item_labels, '裝備租借：' || v_loan_id || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
            END IF;
        END IF;
    END LOOP;

    -- 寫入 payments 資料表 (包含 verify_token 與 proof_image_url，申報備註寫入 notes 欄位，精確品項寫入 selected_ids)
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
        v_total_amount,
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
        'paymentId', v_payment_id,
        'verify_token', v_verify_token,
        'verifyToken', v_verify_token,
        'items', array_to_string(v_item_labels, ', '),
        'totalAmount', v_total_amount,
        'is_zero_amount', (v_total_amount = 0),
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
-- 3. 幹部端 RPC：安全 Token 單鍵免登入核銷 (verify_payment_by_token)
-- ------------------------------------------------------------------------------
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
    v_user_email TEXT;
    v_user_language TEXT;
    v_selected_ids JSONB;
    v_event_ids TEXT[] := ARRAY[]::TEXT[];
    v_loan_ids TEXT[] := ARRAY[]::TEXT[];
    v_has_membership BOOLEAN := FALSE;
    v_item_id TEXT;
    i INTEGER;
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

    -- 查詢繳費社員的 Email 與 偏好語系
    IF v_payment.line_user_id IS NOT NULL THEN
        SELECT email, COALESCE(preferred_language, 'zh') INTO v_user_email, v_user_language FROM members WHERE line_user_id = v_payment.line_user_id;
    END IF;

    -- 比對安全金鑰 (強制要求 verify_token 必須存在且完全相符，杜絕空值繞過)
    IF v_payment.verify_token IS NULL OR trim(v_payment.verify_token) = '' OR v_payment.verify_token != trim(p_verify_token) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', '安全金鑰無效、不存在或已過期，拒絕核銷 (Invalid or Missing verifyToken)');
    END IF;

    -- 檢查是否先前已核銷
    IF v_payment.status LIKE '%已核銷%' OR v_payment.status LIKE '%Confirmed%' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'alreadyConfirmed', TRUE,
            'paymentId', v_payment.id,
            'userName', COALESCE(v_payment.name, '社員'),
            'userEmail', v_user_email,
            'userLanguage', COALESCE(v_user_language, 'zh'),
            'amount', v_payment.amount,
            'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
            'lineUserId', v_payment.line_user_id,
            'proofImageUrl', v_payment.proof_image_url,
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

    -- 解析該筆繳費單所屬之精確品項清單
    v_selected_ids := COALESCE(v_payment.selected_ids, '[]'::jsonb);
    IF jsonb_typeof(v_selected_ids) = 'array' AND jsonb_array_length(v_selected_ids) > 0 THEN
        FOR i IN 0 .. (jsonb_array_length(v_selected_ids) - 1) LOOP
            v_item_id := v_selected_ids->>i;
            IF v_item_id LIKE 'act_%' THEN
                v_event_ids := array_append(v_event_ids, substring(v_item_id from 5));
            ELSIF v_item_id LIKE 'eq_%' THEN
                v_loan_ids := array_append(v_loan_ids, substring(v_item_id from 4));
            ELSIF v_item_id = 'fee_membership' THEN
                v_has_membership := TRUE;
            END IF;
        END LOOP;
    END IF;

    -- 2. 連動更新活動報名表 (event_signups)：精準限定本次繳費單所勾選的活動
    IF v_payment.line_user_id IS NOT NULL THEN
        IF array_length(v_event_ids, 1) > 0 THEN
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND event_id = ANY(v_event_ids)
                  AND payment_status != '已繳費 Paid'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        ELSIF v_payment.target_id IS NOT NULL AND v_payment.target_type = 'event' THEN
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND event_id = v_payment.target_id
                  AND payment_status != '已繳費 Paid'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        ELSIF v_payment.type LIKE '%活動%' THEN
            -- 舊版無 selected_ids 繳費單 fallback：只更新處於「待確認 Checking」的活動報名紀錄，絕不波及未繳費活動
            FOR v_signup IN 
                SELECT id, status 
                FROM event_signups 
                WHERE line_user_id = v_payment.line_user_id 
                  AND payment_status = '待確認 Checking'
            LOOP
                v_new_signup_status := v_signup.status;
                IF v_signup.status::text LIKE '%正取%' AND v_signup.status::text NOT LIKE '%已繳費%' THEN
                    v_new_signup_status := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
                END IF;

                UPDATE event_signups
                SET payment_status = '已繳費 Paid',
                    status = v_new_signup_status,
                    updated_at = v_now
                WHERE id = v_signup.id;
            END LOOP;
        END IF;

        -- 3. 連動更新社員社費 (members)
        IF v_has_membership OR v_payment.type LIKE '%社費%' OR v_payment.type LIKE '%Membership%' OR v_payment.target_type = 'membership' THEN
            v_extracted_expiry := substring(v_payment.type from '(\d{4}[-/]\d{2}[-/]\d{2})');
            IF v_extracted_expiry IS NOT NULL THEN
                BEGIN
                    v_calculated_expiry := replace(v_extracted_expiry, '/', '-')::DATE;
                EXCEPTION WHEN OTHERS THEN
                    v_calculated_expiry := NULL;
                END IF;
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

        -- 4. 連動更新裝備租借 (loans)：精準限定本次繳費單所勾選的訂單 ID
        IF array_length(v_loan_ids, 1) > 0 THEN
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND id = ANY(v_loan_ids)
              AND payment_status != '已繳費 Paid';
        ELSIF v_payment.target_id IS NOT NULL AND (v_payment.target_type = 'loan' OR v_payment.target_type = 'equipment') THEN
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND id = v_payment.target_id
              AND payment_status != '已繳費 Paid';
        ELSIF v_payment.type LIKE '%裝備%' OR v_payment.type LIKE '%租借%' THEN
            -- 舊版 fallback：只更新處於「待確認 Checking」的租借紀錄
            UPDATE loans
            SET payment_status = '已繳費 Paid',
                updated_at = v_now
            WHERE line_user_id = v_payment.line_user_id
              AND payment_status = '待確認 Checking';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'alreadyConfirmed', FALSE,
        'paymentId', v_payment.id,
        'userName', COALESCE(v_payment.name, '社員'),
        'userEmail', v_user_email,
        'userLanguage', COALESCE(v_user_language, 'zh'),
        'amount', v_payment.amount,
        'items', COALESCE(NULLIF(v_payment.type, ''), '社團活動/裝備費用'),
        'lineUserId', v_payment.line_user_id,
        'proofImageUrl', v_payment.proof_image_url,
        'message', '核銷成功！系統已自動連動更新對應之報名與租借狀態'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', '核銷處理失敗: ' || SQLERRM || ' (SQLSTATE: ' || SQLSTATE || ')'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. 會員端 RPC：個人歷史繳費紀錄與累計花費 (get_my_payment_history)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_payment_history(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_history JSONB := '[]'::jsonb;
    v_total_spent INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('totalSpent', 0, 'history', '[]'::jsonb);
    END IF;

    SELECT 
        COALESCE(jsonb_agg(h), '[]'::jsonb),
        COALESCE(SUM(
            CASE 
                WHEN (status::text LIKE '%已核銷%' OR status::text LIKE '%Confirmed%' OR status::text = 'Paid')
                     AND status::text NOT LIKE '%待確認%' AND status::text NOT LIKE '%Checking%'
                THEN display_amount 
                ELSE 0 
            END
        ), 0)
    INTO v_history, v_total_spent
    FROM (
        SELECT jsonb_build_object(
            'id', id,
            'date', to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'),
            'type', CASE 
                WHEN type ILIKE '%社籍%' OR type ILIKE '%社費%' OR type ILIKE '%Membership%' THEN '社費'
                WHEN type ILIKE '%活動%' OR type ILIKE '%登山%' OR type ILIKE '%act_%' THEN '活動'
                WHEN type ILIKE '%裝備%' OR type ILIKE '%租用%' OR type ILIKE '%eq_%' THEN '裝備'
                ELSE '全部'
            END,
            'title', COALESCE(type, '未命名項目'),
            'amount', display_amount,
            'name', COALESCE(name, ''),
            'last5Digits', COALESCE(bank_last5, ''),
            'note', COALESCE(officer_notes, ''),
            'proofImageUrl', COALESCE(proof_image_url, ''),
            'status', COALESCE(status, '待確認 Checking')
        ) AS h,
        display_amount,
        status
        FROM (
            SELECT 
                id,
                created_at,
                type,
                name,
                bank_last5,
                officer_notes,
                proof_image_url,
                status,
                COALESCE(amount, 0) AS display_amount
            FROM payments
            WHERE line_user_id = trim(p_line_user_id)
        ) sub
        ORDER BY created_at DESC
    ) t;

    RETURN jsonb_build_object(
        'totalSpent', v_total_spent,
        'history', v_history
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. 會員端 RPC：查詢個人待繳項目 (get_unpaid_items_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unpaid_items_rpc(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_is_expired BOOLEAN := FALSE;
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_is_official BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = trim(p_line_user_id);
    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;
        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;

        IF NOT v_is_official THEN
            IF (v_member.payment_status IS NULL OR (
                v_member.payment_status::text NOT LIKE '%待確認%' 
                AND v_member.payment_status::text NOT LIKE '%Checking%'
            )) THEN
                v_membership := jsonb_build_array(
                    jsonb_build_object(
                        'id', 'fee_membership',
                        'name', '社籍與社費 (Membership Fee)',
                        'amount', 200
                    )
                );
            END IF;
        END IF;
    ELSE
        v_membership := jsonb_build_array(
            jsonb_build_object(
                'id', 'fee_membership',
                'name', '社籍與社費 (Membership Fee)',
                'amount', 200
            )
        );
    END IF;

    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', 'act_' || e.id,
            'name', '活動：' || e.title,
            'amount', COALESCE(e.fee, 0)
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_line_user_id)
          AND (s.status::text LIKE '%正取%' OR s.status::text LIKE '%Confirmed%')
          AND s.status::text NOT LIKE '%取消%'
          AND (s.payment_status IS NULL OR (
              s.payment_status::text NOT LIKE '%已繳費%' 
              AND s.payment_status::text NOT LIKE '%Paid%'
              AND s.payment_status::text NOT LIKE '%待確認%'
              AND s.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY e.start_date ASC
    ) t;

    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', '裝備租借 (' || l.id || ')',
            'amount', COALESCE(l.total_rent, 0),
            'orderId', l.id,
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD')
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = trim(p_line_user_id)
          AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed')
          AND l.total_rent > 0
          AND (l.payment_status IS NULL OR (
              l.payment_status::text NOT LIKE '%已繳費%' 
              AND l.payment_status::text NOT LIKE '%Paid%'
              AND l.payment_status::text NOT LIKE '%待確認%'
              AND l.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY l.start_date ASC
    ) e_sub;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 會員端相容性 RPC：查詢待繳項目 (get_unpaid_payments)
-- 線上 OpenAPI 保留之向下相容介面
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unpaid_payments(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN get_unpaid_items_rpc(p_line_user_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：取得財務對帳清單 (get_admin_finance_rpc)
-- 支援 selected_ids、0元活動核銷名單與未填報待繳整合
-- 回填既有 payments 資料表之 target_type 與 target_id：
-- UPDATE payments p SET target_type = 'event', target_id = e.id FROM events e WHERE (p.target_type IS NULL OR p.target_id IS NULL) AND (p.type ILIKE '%' || e.title || '%' OR p.type ILIKE '%' || e.id || '%');
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_finance_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取財務資料！',
            'items', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(f_row ORDER BY f_row.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
        SELECT 
            p.id,
            p.line_user_id,
            COALESCE(p.name, m.name, '未知申報人') AS name,
            p.type,
            p.amount,
            p.bank_last5,
            p.proof_image_url,
            p.target_type,
            p.target_id,
            p.status,
            CASE WHEN p.status = '已核銷 Confirmed' THEN '已繳費 Paid' ELSE '待確認 Checking' END AS payment_status,
            p.notes,
            p.officer_notes,
            COALESCE(p.notification_status, '未通知') AS notification_status,
            to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'payment' AS source_type,
            CASE 
                WHEN p.target_type = 'event' OR p.type ILIKE '%活動%' THEN 'activity'
                WHEN p.target_type = 'loan' OR p.type ILIKE '%裝備%' THEN 'equipment'
                WHEN p.target_type = 'membership' OR p.type ILIKE '%社費%' THEN 'membership'
                ELSE 'general'
            END AS item_category,
            p.selected_ids
        FROM payments p
        LEFT JOIN members m ON p.line_user_id = m.line_user_id

        UNION ALL

        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            '裝備租借費用 (' || l.id || ')' AS type,
            l.total_rent AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'loan' AS target_type,
            l.id AS target_id,
            CASE WHEN l.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status,
            l.payment_status::TEXT AS payment_status,
            l.notes,
            NULL AS officer_notes,
            '未通知' AS notification_status,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'loan' AS source_type,
            'equipment' AS item_category,
            NULL::jsonb AS selected_ids
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
        WHERE l.total_rent > 0
          AND l.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE (
                  (p.target_type = 'loan' AND p.target_id = l.id)
                  OR (p.selected_ids IS NOT NULL AND p.selected_ids ? ('eq_' || l.id))
                  OR (p.line_user_id = l.line_user_id AND p.type ILIKE '%' || l.id || '%')
              )
          )

        UNION ALL

        SELECT 
            s.id,
            s.line_user_id,
            COALESCE(s.name, m.name, '活動參加者') AS name,
            '[活動] ' || e.title AS type,
            COALESCE(e.fee, 0) AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'event' AS target_type,
            e.id AS target_id,
            CASE WHEN s.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status,
            CASE
                WHEN COALESCE(e.fee, 0) = 0 THEN '已繳費 Paid'
                ELSE s.payment_status::TEXT
            END AS payment_status,
            s.notes,
            NULL AS officer_notes,
            '未通知' AS notification_status,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'event' AS source_type,
            'activity' AS item_category,
            NULL::jsonb AS selected_ids
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE (s.status = '正取 Confirmed' OR s.status = '正取（已繳費）Confirmed (Paid)')
          AND (
              COALESCE(e.fee, 0) = 0
              OR (
                  s.payment_status != '已繳費 Paid'
                  AND NOT EXISTS (
                      SELECT 1 FROM payments p 
                      WHERE (
                          (p.target_type = 'event' AND p.target_id = e.id)
                          OR (p.selected_ids IS NOT NULL AND p.selected_ids ? ('act_' || e.id))
                          OR (p.line_user_id = s.line_user_id AND p.type ILIKE '%' || e.title || '%')
                      )
                  )
              )
          )
    ) f_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'items', v_items
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：審核對帳狀態 (update_admin_payment_status_rpc)
-- 包含 selected_ids 原子批次連動所有項目狀態
-- ------------------------------------------------------------------------------
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
    v_is_confirmed BOOLEAN;
    v_mapped_pay_status payment_status_enum;
    v_payment RECORD;
    v_target_user_id TEXT;
    v_is_membership BOOLEAN;
    v_extracted_expiry TEXT;
    v_calculated_expiry DATE;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部執行財務核銷！');
    END IF;

    v_is_confirmed := (p_status = '已核銷 Confirmed');
    v_mapped_pay_status := CASE 
        WHEN p_status = '已核銷 Confirmed' THEN '已繳費 Paid'::payment_status_enum 
        WHEN p_status = '待繳費 Unpaid' THEN '未繳費 Unpaid'::payment_status_enum
        ELSE '待確認 Checking'::payment_status_enum 
    END;

    IF p_source_type = 'payment' THEN
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

        v_is_membership := (
            p_target_type = 'membership' 
            OR v_payment.target_type = 'membership'
            OR v_payment.type ILIKE '%社費%' 
            OR v_payment.type ILIKE '%Membership%'
        );

        IF v_payment.selected_ids IS NOT NULL AND jsonb_typeof(v_payment.selected_ids) = 'array' AND jsonb_array_length(v_payment.selected_ids) > 0 THEN
            IF v_target_user_id IS NOT NULL THEN
                UPDATE event_signups
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE line_user_id = v_target_user_id 
                  AND ('act_' || event_id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids));
            END IF;

            UPDATE loans
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE ('eq_' || id) IN (SELECT jsonb_array_elements_text(v_payment.selected_ids));

            IF v_target_user_id IS NOT NULL AND (
                v_payment.selected_ids ? 'fee_membership' OR v_payment.selected_ids ? 'membership'
            ) THEN
                IF v_is_confirmed THEN
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
                        membership_expires_at = COALESCE(v_calculated_expiry, (CURRENT_DATE + INTERVAL '1 year')::DATE),
                        updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                ELSE
                    UPDATE members
                    SET payment_status = v_mapped_pay_status, updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                END IF;
            END IF;
        ELSE
            IF v_is_membership AND v_target_user_id IS NOT NULL THEN
                IF v_is_confirmed THEN
                    UPDATE members
                    SET payment_status = '已繳費 Paid'::payment_status_enum,
                        is_official_member = TRUE,
                        membership_expires_at = (CURRENT_DATE + INTERVAL '1 year')::DATE,
                        updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                ELSE
                    UPDATE members
                    SET payment_status = v_mapped_pay_status, updated_at = NOW()
                    WHERE line_user_id = v_target_user_id;
                END IF;
            ELSIF p_target_type = 'event' AND p_target_id IS NOT NULL THEN
                UPDATE event_signups
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE event_id = p_target_id 
                  AND (v_target_user_id IS NULL OR line_user_id = v_target_user_id);
            ELSIF p_target_type = 'loan' AND p_target_id IS NOT NULL THEN
                UPDATE loans
                SET payment_status = v_mapped_pay_status, updated_at = NOW()
                WHERE id = p_target_id;
            END IF;
        END IF;

    ELSIF p_source_type = 'event' THEN
        UPDATE event_signups
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;

    ELSIF p_source_type = 'loan' THEN
        UPDATE loans
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payments" ON payments;
CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
CREATE POLICY "Officers can manage all payments" ON payments
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own payments" ON payments;
CREATE POLICY "Members can read own payments" ON payments
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

-- 權限指派
GRANT EXECUTE ON FUNCTION submit_payment_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION verify_payment_by_token(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_my_payment_history(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_unpaid_items_rpc(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_unpaid_payments(TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

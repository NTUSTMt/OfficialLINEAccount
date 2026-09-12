-- ==============================================================================
-- 野境戶外系統：繳費回報 (Payment.tsx) 極速秒開與安全對帳 RPC 函式
-- 目的：
-- 1. get_unpaid_payments: 50ms 內聚合本人社費、活動正取、裝備租借待繳項目 (防全表爬取)
-- 2. submit_payment_rpc: 原子性建立 payments 繳費單並將各項目狀態更新為「待確認 Checking」
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 取得個人待繳清單 RPC (get_unpaid_payments)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_unpaid_payments(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_member members%ROWTYPE;
    v_is_official BOOLEAN := FALSE;
    v_is_expired BOOLEAN := FALSE;
    v_is_unpaid BOOLEAN := FALSE;
    v_has_intent BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    -- 1. 查詢社員基本資料與社籍狀態
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;
    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;

        IF v_member.payment_status IS NULL 
           OR (v_member.payment_status NOT LIKE '%已繳費%' AND v_member.payment_status NOT LIKE '%Paid%') THEN
            v_is_unpaid := TRUE;
        END IF;

        IF v_member.join_membership_intent IS TRUE 
           OR v_member.join_membership_intent ILIKE '%是%' 
           OR v_member.join_membership_intent ILIKE '%意願%' 
           OR v_member.membership_expires_at IS NOT NULL THEN
            v_has_intent := TRUE;
        END IF;

        -- 只要不是「待確認 Checking」且（未繳費或過期）且有加入意願
        IF (v_member.payment_status IS NULL OR (v_member.payment_status NOT LIKE '%待確認%' AND v_member.payment_status NOT LIKE '%Checking%')) THEN
            IF (v_is_unpaid OR v_is_expired) AND v_has_intent THEN
                v_membership := jsonb_build_array(
                    jsonb_build_object(
                        'id', 'fee_membership',
                        'name', '社籍與社費 (Membership Fee)',
                        'amount', 200
                    )
                );
            END IF;
        END IF;

        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;
    END IF;

    -- 2. 查詢正取活動欠款 (從 event_signups 與 events 關聯)
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
        WHERE s.line_user_id = p_line_user_id
          AND (s.status LIKE '%正取%' OR s.status LIKE '%Confirmed%')
          AND s.status NOT LIKE '%取消%'
          AND (s.payment_status IS NULL OR (
              s.payment_status NOT LIKE '%已繳費%' 
              AND s.payment_status NOT LIKE '%Paid%'
              AND s.payment_status NOT LIKE '%待確認%'
              AND s.payment_status NOT LIKE '%Checking%'
          ))
        ORDER BY e.start_date ASC
    ) t;

    -- 3. 查詢裝備租借欠款 (從 loans 與 loan_items、equipments 關聯)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', COALESCE(eq_sub.name, '裝備租借'),
            'amount', CASE 
                WHEN li.subtotal IS NOT NULL AND li.subtotal > 0 THEN li.subtotal
                ELSE COALESCE(l.total_rent, 0)
            END,
            'orderId', l.id,
            'qty', COALESCE(li.quantity, 1),
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD'),
            'purpose', COALESCE(l.purpose, '個人使用'),
            'isOfficial', CASE WHEN v_is_official THEN '是' ELSE '否' END
        ) AS eq
        FROM loans l
        LEFT JOIN loan_items li ON l.id = li.loan_id
        LEFT JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
        WHERE l.line_user_id = p_line_user_id
          AND l.status NOT LIKE '%取消%'
          AND l.status NOT LIKE '%歸還%'
          AND (l.payment_status IS NULL OR (
              l.payment_status NOT LIKE '%已繳費%' 
              AND l.payment_status NOT LIKE '%Paid%'
              AND l.payment_status NOT LIKE '%待確認%'
              AND l.payment_status NOT LIKE '%Checking%'
          ))
        ORDER BY l.start_date ASC
    ) t;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. 提交繳費對帳申報 RPC (submit_payment_rpc)
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
    i INTEGER;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RAISE EXCEPTION '缺少必要的 line_user_id 參數';
    END IF;

    v_selected_ids := COALESCE(p_details->'selectedIds', '[]'::jsonb);
    v_total_amount := COALESCE((p_details->>'totalAmount')::INTEGER, 0);
    v_last5 := COALESCE(p_details->>'last5Digits', '00000');
    v_note := COALESCE(p_details->>'note', '');
    v_expiry := p_details->>'membershipExpiryDate';

    -- 生成唯一繳費單號 PAY_YYYYMMDD_HH24MISS_xxx
    v_payment_id := 'PAY_' || to_char(NOW(), 'YYYYMMDD_HH24MISS_') || lpad(floor(random() * 1000)::text, 3, '0');

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
            SET payment_status = '待確認 Checking',
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
            SET payment_status = '待確認 Checking',
                updated_at = NOW()
            WHERE line_user_id = p_line_user_id AND event_id = v_event_id;

            SELECT title INTO v_event_title FROM events WHERE id = v_event_id;
            v_item_labels := array_append(v_item_labels, '🔸 活動：' || COALESCE(v_event_title, v_event_id));

        -- C. 裝備
        ELSIF v_item_id LIKE 'eq_%' THEN
            v_loan_id := substring(v_item_id from 4);

            UPDATE loans 
            SET payment_status = '待確認 Checking',
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

            v_item_labels := array_append(v_item_labels, '🔹 裝備：' || v_loan_id || CASE WHEN v_has_membership THEN ' (社員5折)' ELSE '' END);
        END IF;
    END LOOP;

    -- 寫入 payments 資料表
    INSERT INTO payments (
        id,
        line_user_id,
        type,
        amount,
        bank_last5,
        status,
        officer_notes,
        created_at,
        updated_at
    ) VALUES (
        v_payment_id,
        p_line_user_id,
        array_to_string(v_item_labels, ', '),
        v_total_amount,
        v_last5,
        '待確認 Checking',
        v_note,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'payment_id', v_payment_id,
        'items', array_to_string(v_item_labels, ', ')
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 權限設定 (僅開放執行 RPC，不開放底層表直接存取)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE payments FROM anon;
REVOKE ALL ON TABLE event_signups FROM anon;
REVOKE ALL ON TABLE loans FROM anon;

GRANT EXECUTE ON FUNCTION get_unpaid_payments(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_payment_rpc(TEXT, JSONB) TO anon, authenticated, service_role;

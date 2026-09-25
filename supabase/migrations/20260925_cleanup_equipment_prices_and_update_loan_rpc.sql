-- ==============================================================================
-- Migration: 20260925_cleanup_equipment_prices_and_update_loan_rpc.sql
-- 說明：
-- 1. 更新 submit_equipment_loan_rpc 預存程序，移除對 member_price_per_day 與 non_member_price_per_day 的依賴，
--    全面轉為以 price_2day 與 price_extra_day 為準。
-- 2. 徹底刪除 equipments 資料表中錯誤且冗餘之 member_price_per_day 與 non_member_price_per_day 欄位。
-- ==============================================================================

-- 1. 更新 submit_equipment_loan_rpc
CREATE OR REPLACE FUNCTION public.submit_equipment_loan_rpc(p_line_user_id text, p_details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    -- 1. 身分安全性防呆校驗
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    -- 2. 取得社員基本資料與社籍狀態 (若無此成員先補佔位紀錄以符合外鍵約束)
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

    -- 3. 解析表單基本參數
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

    -- 社團計費規則：基本天數 2 天，超過 2 天每日按續租加成計費
    v_extra_days := GREATEST(0, v_days - 2);

    v_purpose := COALESCE(p_details->>'purpose', '社團出隊');
    v_other_purpose := p_details->>'otherPurpose';
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車清單為空');
    END IF;

    -- 4. 產生唯一租借訂單單號：ORD_YYYYMMDD_XXXX
    v_loan_id := 'ORD_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 5. 逐一檢查裝備庫存並扣減 (悲觀鎖定 FOR UPDATE 防超賣)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            v_item_count := v_item_count + 1;

            SELECT id, name, available_qty, is_borrowable,
                   COALESCE(price_2day, 0) AS p2,
                   COALESCE(price_extra_day, 0) AS p_extra
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

            -- 扣減庫存
            UPDATE equipments
            SET available_qty = available_qty - v_qty,
                updated_at = NOW()
            WHERE id = v_equip_id;

            -- 計算該品項費用 (對齊前端計費公式：2天基本 + 續租加成，社團出隊免租，社員個人5折)
            v_item_base := COALESCE(v_equip.p2, 0) + (v_extra_days * COALESCE(v_equip.p_extra, 0));
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0; -- 社團出隊免租
            ELSIF v_is_official THEN
                v_unit_price := ROUND(v_item_base * 0.5); -- 社員個人使用 5折
            ELSE
                v_unit_price := v_item_base; -- 非社員原價
            END IF;

            v_subtotal := v_unit_price * v_qty;
            v_total_rent := v_total_rent + v_subtotal;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內無有效數量之品項');
    END IF;

    -- 決定付款狀態 (對齊 payment_status_enum 值：已繳費 Paid / 未繳費 Unpaid)
    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid';
    ELSE
        v_loan_payment_status := '未繳費 Unpaid';
    END IF;

    -- 6. 建立主租借紀錄 (loans)
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
        CASE 
            WHEN v_purpose = '社團出隊' THEN '【社團出隊免租金】'
            WHEN v_is_official THEN '【社員個人 5 折適用】'
            ELSE '【非社員原價】'
        END,
        NOW(),
        NOW()
    );

    -- 7. 建立細項明細 (loan_items)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            SELECT id, name,
                   COALESCE(price_2day, 0) AS p2,
                   COALESCE(price_extra_day, 0) AS p_extra
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

    -- 8. 成功回傳租借單號與總租金
    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'days', v_days,
        'message', '裝備租借申請已成功送出！'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', SQLERRM
    );
END;
$function$;

-- 2. 刪除 equipments 表中錯誤的舊欄位
ALTER TABLE equipments DROP COLUMN IF EXISTS member_price_per_day;
ALTER TABLE equipments DROP COLUMN IF EXISTS non_member_price_per_day;

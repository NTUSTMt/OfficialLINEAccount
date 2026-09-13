-- ==============================================================================
-- 🎒 台科登山社社團系統：裝備租借原子性提交 RPC (submit_equipment_loan_rpc)
-- 目的：完全取代舊版 GAS doPost('submit_multi_loan')，在資料庫層原子扣減庫存與計算費用
-- ==============================================================================

CREATE OR REPLACE FUNCTION submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_member RECORD;
    v_is_official BOOLEAN := FALSE;
    v_user_name TEXT := '未知社員';
    v_pickup_date DATE;
    v_return_date DATE;
    v_days INTEGER := 1;
    v_purpose TEXT;
    v_other_purpose TEXT;
    v_cart JSONB;
    v_equip_id TEXT;
    v_qty INTEGER;
    v_equip RECORD;
    v_unit_price INTEGER;
    v_subtotal INTEGER;
    v_total_rent INTEGER := 0;
    v_total_deposit INTEGER := 0;
    v_loan_id TEXT;
    v_item_count INTEGER := 0;
BEGIN
    -- 1. 身分安全性防呆校驗
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    -- 2. 取得社員基本資料與社籍狀態
    SELECT name, is_official_member, membership_expires_at
    INTO v_member
    FROM members
    WHERE line_user_id = p_line_user_id;

    IF FOUND THEN
        v_user_name := COALESCE(v_member.name, '未知社員');
        -- 正式社員判斷：is_official_member 為真 且 (無到期日 或 到期日 >= 今日)
        IF v_member.is_official_member IS TRUE AND 
           (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        v_user_name := '未註冊成員';
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

    v_purpose := COALESCE(p_details->>'purpose', '社團出隊');
    v_other_purpose := p_details->>'otherPurpose';
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車清單為空');
    END IF;

    -- 4. 產生唯一租借訂單單號：ORD_YYYYMMDD_XXXX
    v_loan_id := 'ORD_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 5. 逐一鎖定裝備庫存並扣減 (FOR UPDATE 防超賣)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            v_item_count := v_item_count + 1;

            -- 悲觀鎖定該品項
            SELECT id, name, available_qty, is_borrowable, member_price_per_day, non_member_price_per_day
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

            -- 計算該品項費用 (社團出隊通常享社員價或免租，此處依身分定價)
            IF v_is_official THEN
                v_unit_price := COALESCE(v_equip.member_price_per_day, 0);
            ELSE
                v_unit_price := COALESCE(v_equip.non_member_price_per_day, 0);
            END IF;

            v_subtotal := v_unit_price * v_qty * v_days;
            v_total_rent := v_total_rent + v_subtotal;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內無有效數量之品項');
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
        '待領取 To Be Collected',
        CASE WHEN v_total_rent = 0 THEN '已繳費 Paid' ELSE '未繳費' END,
        v_total_deposit,
        v_total_rent,
        CASE WHEN v_is_official THEN '【社員價適用】' ELSE '【非社員價】' END,
        NOW(),
        NOW()
    );

    -- 7. 建立細項明細 (loan_items)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            SELECT member_price_per_day, non_member_price_per_day
            INTO v_equip
            FROM equipments
            WHERE id = v_equip_id;

            IF v_is_official THEN
                v_unit_price := COALESCE(v_equip.member_price_per_day, 0);
            ELSE
                v_unit_price := COALESCE(v_equip.non_member_price_per_day, 0);
            END IF;

            v_subtotal := v_unit_price * v_qty * v_days;

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

    -- 8. 回傳成功狀態
    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'days', v_days,
        'isOfficial', v_is_official,
        'message', '裝備租借申請已成功送達 Supabase！'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', SQLERRM
    );
END;
$$;

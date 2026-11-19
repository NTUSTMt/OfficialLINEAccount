-- ==============================================================================
-- Migration: 20261119_fix_submit_equipment_loan_rpc_price_columns.sql
-- 說明：重建 public.submit_equipment_loan_rpc，完全改用 price_2day 與 price_extra_day
--       計費欄位，移除已刪除之舊價目欄位參照，並維持悲觀鎖、社籍效期驗證與明細快照。
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_line_user_id TEXT;
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
    v_items_snapshot JSONB := '[]'::jsonb;
    v_item RECORD;
    v_loan_status loans.status%TYPE := '待領取 To Be Collected';
    v_loan_payment_status loans.payment_status%TYPE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    v_line_user_id := trim(p_line_user_id);

    SELECT name, is_official_member, membership_expires_at
    INTO v_member
    FROM members
    WHERE line_user_id = v_line_user_id;

    IF FOUND THEN
        v_user_name := COALESCE(NULLIF(trim(v_member.name), ''), NULLIF(trim(p_details->>'borrowerName'), ''), '未知社員');
        IF v_member.is_official_member IS TRUE AND
           (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        v_user_name := COALESCE(NULLIF(trim(p_details->>'borrowerName'), ''), '未註冊成員');
        INSERT INTO members (line_user_id, name, is_official_member, created_at, updated_at)
        VALUES (v_line_user_id, v_user_name, FALSE, NOW(), NOW())
        ON CONFLICT (line_user_id) DO NOTHING;
    END IF;

    BEGIN
        v_pickup_date := (p_details->>'pickupDate')::DATE;
        v_return_date := (p_details->>'returnDate')::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'error', 'message', '日期格式無效 (Invalid Date Range)');
    END;

    IF v_pickup_date IS NULL OR v_return_date IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '領取與歸還日期不得為空');
    END IF;

    IF v_return_date < v_pickup_date THEN
        RETURN jsonb_build_object('status', 'error', 'message', '歸還日期不能早於領取日期');
    END IF;

    v_days := GREATEST(1, (v_return_date - v_pickup_date) + 1);
    v_extra_days := GREATEST(0, v_days - 2);

    v_purpose := COALESCE(NULLIF(trim(p_details->>'purpose'), ''), '社團出隊');
    v_other_purpose := NULLIF(trim(p_details->>'otherPurpose'), '');
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) <> 'object' OR v_cart = '{}'::jsonb THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車清單為空');
    END IF;

    v_loan_id := 'ORD_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

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

            v_items_snapshot := v_items_snapshot || jsonb_build_array(
                jsonb_build_object(
                    'equipment_id', v_equip_id,
                    'name', v_equip.name,
                    'quantity', v_qty,
                    'unit_price', v_unit_price,
                    'subtotal', v_subtotal
                )
            );
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內無有效數量之品項');
    END IF;

    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid'::payment_status_enum;
    ELSE
        v_loan_payment_status := '未繳費 Unpaid'::payment_status_enum;
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
        total_fee,
        total_deposit,
        total_rent,
        is_official_member_snapshot,
        items,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_loan_id,
        v_line_user_id,
        v_user_name,
        v_pickup_date,
        v_return_date,
        v_days,
        v_purpose,
        v_other_purpose,
        v_loan_status,
        v_loan_payment_status,
        v_total_rent,
        v_total_deposit,
        v_total_rent,
        v_is_official,
        v_items_snapshot,
        COALESCE(
            NULLIF(trim(p_details->>'notes'), ''),
            CASE
                WHEN v_purpose = '社團出隊' THEN '【社團出隊免租金】'
                WHEN v_is_official THEN '【社員個人 5 折適用】'
                ELSE '【非社員原價】'
            END
        ),
        NOW(),
        NOW()
    );

    FOR v_item IN
        SELECT
            elem->>'equipment_id' AS equipment_id,
            (elem->>'quantity')::INTEGER AS quantity,
            (elem->>'unit_price')::INTEGER AS unit_price,
            (elem->>'subtotal')::INTEGER AS subtotal
        FROM jsonb_array_elements(v_items_snapshot) AS elem
    LOOP
        INSERT INTO loan_items (
            loan_id,
            equipment_id,
            quantity,
            unit_price_snapshot,
            subtotal
        ) VALUES (
            v_loan_id,
            v_item.equipment_id,
            v_item.quantity,
            v_item.unit_price,
            v_item.subtotal
        );
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'message', '租借申請已成功送出！',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'totalDeposit', v_total_deposit,
        'days', v_days,
        'isOfficial', v_is_official,
        'paymentStatus', v_loan_payment_status
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', '資料庫處理失敗: ' || SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_equipment_loan_rpc(TEXT, JSONB) TO authenticated, anon, service_role;

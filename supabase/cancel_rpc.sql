-- ==============================================================================
-- 🛑 台科登山社社團系統：社員自主取消預約與活動報名 RPC
-- 目的：完全取代舊版 GAS doPost('liff_cancel_loan' / 'liff_cancel_event')
-- ==============================================================================

-- 1. 取消裝備租借 (自動歸還庫存)
CREATE OR REPLACE FUNCTION cancel_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_loan_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan RECORD;
    v_item RECORD;
BEGIN
    IF p_line_user_id IS NULL OR p_loan_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    -- 查詢並鎖定租借單，驗證是否為本人且處於可取消狀態
    SELECT * INTO v_loan
    FROM loans
    WHERE id = p_loan_id AND line_user_id = p_line_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此租借單或非本人申請');
    END IF;

    IF v_loan.status IN ('已歸還 Returned', '已取消 Cancelled', '已取消 (待退款)') THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此租借單已處於結束或已取消狀態');
    END IF;

    -- 歸還租借品項之 available_qty 庫存
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

    -- 更新訂單狀態
    UPDATE loans
    SET status = CASE WHEN v_loan.payment_status = '已繳費 Paid' THEN '已取消 (待退款)' ELSE '已取消 Cancelled' END,
        refund_needed = (v_loan.payment_status = '已繳費 Paid'),
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_loan_id;

    RETURN jsonb_build_object('status', 'success', 'message', '裝備預約已成功取消並釋放庫存！');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- 2. 取消活動報名
CREATE OR REPLACE FUNCTION cancel_event_signup_rpc(
    p_line_user_id TEXT,
    p_signup_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_signup RECORD;
BEGIN
    IF p_line_user_id IS NULL OR p_signup_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    -- 查詢並鎖定報名紀錄
    SELECT * INTO v_signup
    FROM event_signups
    WHERE (id = p_signup_id OR event_id = p_signup_id) AND line_user_id = p_line_user_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到對應的活動報名紀錄');
    END IF;

    IF v_signup.status = '已取消 Cancelled' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此活動報名已處於取消狀態');
    END IF;

    -- 更新報名狀態為已取消
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

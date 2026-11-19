-- Migration: 20261118_fix_loan_status_rpc_inventory_restore.sql
-- 修正幹部更新裝備租借狀態 (歸還 / 取消) 時自動原子性回補 equipments.available_qty

CREATE OR REPLACE FUNCTION public.update_admin_loan_status_rpc(
    p_officer_line_user_id TEXT,
    p_loan_id TEXT,
    p_status TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loan RECORD;
    v_old_status TEXT;
    v_new_status TEXT;
    v_old_released BOOLEAN;
    v_new_released BOOLEAN;
    v_item RECORD;
    v_equip RECORD;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部更新租借狀態！');
    END IF;

    SELECT id, status INTO v_loan
    FROM loans
    WHERE id = trim(p_loan_id)
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', '找不到指定的裝備租借訂單：' || COALESCE(p_loan_id, ''));
    END IF;

    v_old_status := trim(COALESCE(v_loan.status, ''));
    v_new_status := trim(COALESCE(p_status, ''));

    v_old_released := v_old_status IN ('已歸還 Returned', '已取消 Cancelled', '已取消 (待退款)');
    v_new_released := v_new_status IN ('已歸還 Returned', '已取消 Cancelled', '已取消 (待退款)');

    -- 由佔用庫存狀態轉為歸還或取消狀態：原子性補回 available_qty
    IF NOT v_old_released AND v_new_released THEN
        FOR v_item IN
            SELECT equipment_id, quantity
            FROM loan_items
            WHERE loan_id = v_loan.id
        LOOP
            UPDATE equipments
            SET available_qty = LEAST(total_qty, available_qty + v_item.quantity),
                updated_at = NOW()
            WHERE id = v_item.equipment_id;
        END LOOP;
    -- 由已歸還/已取消誤轉回佔用庫存狀態：檢查並扣回庫存
    ELSIF v_old_released AND NOT v_new_released THEN
        FOR v_item IN
            SELECT equipment_id, quantity
            FROM loan_items
            WHERE loan_id = v_loan.id
        LOOP
            SELECT id, name, available_qty INTO v_equip
            FROM equipments
            WHERE id = v_item.equipment_id
            FOR UPDATE;

            IF FOUND THEN
                IF v_equip.available_qty < v_item.quantity THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'message', '裝備「' || v_equip.name || '」剩餘庫存不足（現有 ' || v_equip.available_qty || '，需扣回 ' || v_item.quantity || '），無法從已結束狀態改回出借！'
                    );
                END IF;

                UPDATE equipments
                SET available_qty = available_qty - v_item.quantity,
                    updated_at = NOW()
                WHERE id = v_item.equipment_id;
            END IF;
        END LOOP;
    END IF;

    UPDATE loans
    SET status = v_new_status,
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
        cancelled_at = CASE WHEN v_new_status LIKE '%取消%' OR v_new_status LIKE '%Cancelled%' THEN NOW() ELSE cancelled_at END,
        updated_at = NOW()
    WHERE id = v_loan.id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

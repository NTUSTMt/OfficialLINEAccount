-- ============================================================================
-- 幹部系統 RPC 修復：get_admin_loans_rpc 補充社員學號、系所與 LINE ID 欄位
-- ============================================================================

CREATE OR REPLACE FUNCTION get_admin_loans_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_loans JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取租借訂單！',
            'loans', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(l_row ORDER BY l_row.start_date DESC), '[]'::jsonb)
    INTO v_loans
    FROM (
        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
            COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END) AS days,
            l.purpose,
            l.purpose_other,
            l.status,
            l.payment_status::TEXT AS payment_status,
            l.total_rent AS total_fee,
            l.total_rent,
            l.total_deposit,
            l.notes,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            m.phone,
            m.email,
            m.student_id,
            m.department,
            m.line_id,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'equipment_id', li.equipment_id,
                    'name', eq.name,
                    'quantity', li.quantity,
                    'unit_price', li.unit_price_snapshot,
                    'subtotal', li.subtotal
                ))
                FROM loan_items li
                LEFT JOIN equipments eq ON li.equipment_id = eq.id
                WHERE li.loan_id = l.id
            ), l.items, '[]'::jsonb) AS items
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
    ) l_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'loans', v_loans
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO anon, authenticated, service_role;

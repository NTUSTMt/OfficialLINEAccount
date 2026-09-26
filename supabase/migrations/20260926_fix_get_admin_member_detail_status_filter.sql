-- ============================================================================
-- 幹部系統 RPC 修復：get_admin_member_detail_rpc 修正活動狀態比對，移除不存在之列舉值
-- ============================================================================

CREATE OR REPLACE FUNCTION get_admin_member_detail_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_member_json JSONB;
    v_active_events JSONB;
    v_active_loans JSONB;
    v_pending_items JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！'
        );
    END IF;

    SELECT row_to_json(m.*)::jsonb INTO v_member_json 
    FROM members m 
    WHERE m.line_user_id = trim(p_target_user_id) 
    LIMIT 1;

    IF v_member_json IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', TRUE,
            'message', '查無此社員資料'
        );
    END IF;

    -- 查詢未結束活動：僅排除已取消的報名
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'startDate', to_char(e.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(e.end_date::timestamp, 'YYYY-MM-DD'),
        'signupStatus', s.status::TEXT,
        'payStatus', s.payment_status::TEXT
    )), '[]'::jsonb)
    INTO v_active_events
    FROM event_signups s
    JOIN events e ON s.event_id = e.id
    WHERE s.line_user_id = trim(p_target_user_id)
      AND s.status != '已取消 Cancelled';

    -- 查詢進行中租借
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'startDate', to_char(l.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(l.end_date::timestamp, 'YYYY-MM-DD'),
        'status', l.status::TEXT,
        'payStatus', l.payment_status::TEXT,
        'itemsSummary', COALESCE((
            SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
            FROM loan_items li
            JOIN equipments eq ON li.equipment_id = eq.id
            WHERE li.loan_id = l.id
        ), '裝備租借')
    )), '[]'::jsonb)
    INTO v_active_loans
    FROM loans l
    WHERE l.line_user_id = trim(p_target_user_id)
      AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed');

    -- 計算待結項目
    SELECT COALESCE(jsonb_agg(p_item), '[]'::jsonb)
    INTO v_pending_items
    FROM (
        SELECT 'event' AS type, '活動：' || e.title AS title, s.payment_status::TEXT AS status
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_target_user_id)
          AND s.status = '正取 Confirmed'
          AND s.payment_status != '已繳費 Paid'
        UNION ALL
        SELECT 'loan' AS type, '裝備租借：' || COALESCE((
            SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
            FROM loan_items li
            JOIN equipments eq ON li.equipment_id = eq.id
            WHERE li.loan_id = l.id
        ), '裝備') AS title, l.payment_status::TEXT AS status
        FROM loans l
        WHERE l.line_user_id = trim(p_target_user_id)
          AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed')
          AND l.payment_status != '已繳費 Paid'
        UNION ALL
        SELECT 'membership' AS type, '社費：社籍費用' AS title, m.payment_status::TEXT AS status
        FROM members m
        WHERE m.line_user_id = trim(p_target_user_id)
          AND m.payment_status != '已繳費 Paid'
    ) p_item;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'member', v_member_json,
        'activeEvents', v_active_events,
        'activeLoans', v_active_loans,
        'pendingItems', v_pending_items
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) TO anon, authenticated, service_role;

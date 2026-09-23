-- ==============================================================================
-- 修復社員歷史全紀錄 RPC (get_admin_member_records_rpc)
-- 移除 events 表不存在之 location 欄位，解決 ERROR: 42703 並恢復活動紀錄載入
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_admin_member_records_rpc(
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
    v_records JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！'
        );
    END IF;

    SELECT jsonb_build_object(
        'line_user_id', m.line_user_id,
        'name', m.name,
        'student_id', m.student_id,
        'department', m.department,
        'phone', m.phone,
        'email', m.email,
        'role', CASE WHEN m.is_officer = TRUE THEN COALESCE(m.officer_role, '幹部') ELSE COALESCE(m.identity_status, '一般社員') END,
        'avatar_url', NULL
    ) INTO v_member_json
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

    WITH unified_records AS (
        -- 1. 活動紀錄 (所有報名紀錄：包含正取、備取、取消等全部紀錄)
        SELECT 
            'activity_' || s.id::TEXT AS record_id,
            'activity' AS category,
            '活動紀錄' AS category_label,
            e.title AS title,
            COALESCE(s.created_at, e.created_at, NOW()) AS sort_timestamp,
            to_char(e.start_date::timestamp, 'YYYY/MM/DD') || 
            CASE 
                WHEN e.end_date IS NOT NULL AND e.end_date != e.start_date 
                THEN ' ~ ' || to_char(e.end_date::timestamp, 'YYYY/MM/DD') 
                ELSE '' 
            END AS date_display,
            s.status::TEXT AS status,
            s.payment_status::TEXT AS payment_status,
            COALESCE(e.fee, 0)::NUMERIC AS amount,
            s.notes AS notes,
            NULL::TEXT AS officer_notes,
            jsonb_build_object(
                'eventId', e.id,
                'eventStatus', e.status,
                'signupStatus', s.status,
                'paymentStatus', s.payment_status,
                'signupDate', to_char(s.created_at::timestamp, 'YYYY/MM/DD HH24:MI')
            ) AS details
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = trim(p_target_user_id)

        UNION ALL

        -- 2. 裝備借用紀錄 (所有租借訂單)
        SELECT 
            'loan_' || l.id::TEXT AS record_id,
            'equipment' AS category,
            '裝備借用' AS category_label,
            COALESCE((
                SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
                FROM loan_items li
                JOIN equipments eq ON li.equipment_id = eq.id
                WHERE li.loan_id = l.id
            ), '裝備租借') AS title,
            COALESCE(l.created_at, NOW()) AS sort_timestamp,
            to_char(l.start_date::timestamp, 'YYYY/MM/DD') || ' ~ ' || to_char(l.end_date::timestamp, 'YYYY/MM/DD') || 
            ' (共 ' || COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END) || ' 天)' AS date_display,
            l.status::TEXT AS status,
            l.payment_status::TEXT AS payment_status,
            COALESCE(l.total_fee, 0)::NUMERIC AS amount,
            l.notes AS notes,
            NULL::TEXT AS officer_notes,
            jsonb_build_object(
                'loanId', l.id,
                'purpose', l.purpose,
                'totalDeposit', l.total_deposit,
                'totalRent', l.total_rent,
                'totalFee', l.total_fee,
                'pickupDate', to_char(l.start_date::timestamp, 'YYYY/MM/DD'),
                'returnDate', to_char(l.end_date::timestamp, 'YYYY/MM/DD'),
                'days', COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END),
                'loanStatus', l.status,
                'paymentStatus', l.payment_status,
                'items', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'equipmentName', eq.name,
                        'quantity', li.quantity,
                        'subtotal', li.subtotal
                    ))
                    FROM loan_items li
                    JOIN equipments eq ON li.equipment_id = eq.id
                    WHERE li.loan_id = l.id
                )
            ) AS details
        FROM loans l
        WHERE l.line_user_id = trim(p_target_user_id)

        UNION ALL

        -- 3. 繳費紀錄 (所有申報帳單)
        SELECT 
            'payment_' || p.id::TEXT AS record_id,
            'payment' AS category,
            '繳費紀錄' AS category_label,
            p.type AS title,
            COALESCE(p.created_at, NOW()) AS sort_timestamp,
            to_char(p.created_at::timestamp, 'YYYY/MM/DD HH24:MI') AS date_display,
            p.status::TEXT AS status,
            p.status::TEXT AS payment_status,
            COALESCE(p.amount, 0)::NUMERIC AS amount,
            p.notes AS notes,
            p.officer_notes AS officer_notes,
            jsonb_build_object(
                'paymentId', p.id,
                'type', p.type,
                'amount', p.amount,
                'bankLast5', p.bank_last5,
                'proofImageUrl', p.proof_image_url,
                'targetType', p.target_type,
                'targetId', p.target_id,
                'notificationStatus', COALESCE(p.notification_status, '未通知'),
                'createdAt', to_char(p.created_at::timestamp, 'YYYY/MM/DD HH24:MI')
            ) AS details
        FROM payments p
        WHERE p.line_user_id = trim(p_target_user_id)
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', ur.record_id,
            'category', ur.category,
            'categoryLabel', ur.category_label,
            'title', ur.title,
            'timestamp', to_char(ur.sort_timestamp::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'dateDisplay', ur.date_display,
            'status', ur.status,
            'paymentStatus', ur.payment_status,
            'amount', ur.amount,
            'notes', ur.notes,
            'officerNotes', ur.officer_notes,
            'details', ur.details
        )
        ORDER BY ur.sort_timestamp DESC
    ), '[]'::jsonb)
    INTO v_records
    FROM unified_records ur;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'member', v_member_json,
        'records', v_records
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_member_records_rpc(TEXT, TEXT) TO anon, authenticated, service_role;

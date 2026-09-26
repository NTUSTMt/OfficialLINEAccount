-- ==============================================================================
-- 遷移腳本：統一財務對帳 (get_admin_finance_rpc) 活動項目款項格式 (fix_admin_finance_consistent_type_rpc.sql)
-- 說明：將未填報 payments 之正取待繳費活動產生的虛擬項目名稱統一改為 '🔸 活動：' || e.title
--      與社員送出繳費單時之格式保持 100% 一致。
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_admin_finance_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_items JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取財務資料！',
            'items', '[]'::jsonb
        );
    END IF;

    -- 整合 payments 申報清單與未填報 payments 之未結租借與活動單
    SELECT COALESCE(jsonb_agg(f_row ORDER BY f_row.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
        -- 1. payments 申報紀錄
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
            END AS item_category
        FROM payments p
        LEFT JOIN members m ON p.line_user_id = m.line_user_id

        UNION ALL

        -- 2. 未填報 payments 但有金額之待繳費租借單
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
            'equipment' AS item_category
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
        WHERE l.total_rent > 0
          AND l.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE (
                  (p.target_type = 'loan' AND p.target_id = l.id)
                  OR (p.line_user_id = l.line_user_id AND p.type ILIKE '%' || l.id || '%')
              )
          )

        UNION ALL

        -- 3. 未填報 payments 之正取待繳費活動報名 (格式統一為 '🔸 活動：' || e.title)
        SELECT 
            s.id,
            s.line_user_id,
            COALESCE(s.name, m.name, '活動參加者') AS name,
            '🔸 活動：' || e.title AS type,
            e.fee AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'event' AS target_type,
            e.id AS target_id,
            CASE WHEN s.payment_status = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status,
            s.payment_status::TEXT AS payment_status,
            s.notes,
            NULL AS officer_notes,
            '未通知' AS notification_status,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'event_signup' AS source_type,
            'activity' AS item_category
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE e.fee > 0
          AND s.status = '正取 Confirmed'
          AND s.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE p.line_user_id = s.line_user_id
                AND (
                    (p.target_type = 'event' AND p.target_id = e.id)
                    OR (p.type ILIKE '%' || e.title || '%')
                    OR (p.type ILIKE '%' || e.id || '%')
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

GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO anon, authenticated, service_role;

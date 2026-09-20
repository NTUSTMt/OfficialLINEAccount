-- ==============================================================================
-- 取得個人主頁儀表板整合資料 RPC 函式 (支援 100ms 內一次取回個資、活動清單與裝備紀錄)
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_my_dashboard(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_profile JSONB;
    v_activities JSONB;
    v_equipments JSONB;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', '缺少 LINE User ID'
        );
    END IF;

    -- 1. 查詢該社員基本身分資訊
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id LIMIT 1;

    IF FOUND THEN
        v_profile := jsonb_build_object(
            'name', COALESCE(v_member.name, ''),
            'department', COALESCE(v_member.department, ''),
            'studentId', COALESCE(v_member.student_id, ''),
            'isOfficial', COALESCE(v_member.is_official_member, FALSE) AND (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE),
            'isOfficer', COALESCE(v_member.is_officer, FALSE),
            'officerRole', COALESCE(v_member.officer_role, ''),
            'preferredLanguage', COALESCE(v_member.preferred_language, 'zh'),
            'expireDate', CASE 
                WHEN v_member.membership_expires_at IS NOT NULL THEN to_char(v_member.membership_expires_at, 'YYYY/MM/DD')
                ELSE '尚未核發/尚未繳費 (Not issued/Unpaid)'
            END
        );
    ELSE
        v_profile := jsonb_build_object(
            'name', '',
            'department', '',
            'studentId', '',
            'isOfficial', FALSE,
            'isOfficer', FALSE,
            'officerRole', '',
            'preferredLanguage', 'zh',
            'expireDate', '尚未核發/尚未繳費 (Not issued/Unpaid)'
        );
    END IF;

    -- 2. 查詢該社員所報名的歷史與近期活動 (正取且非取消者才釋出 lineGroupUrl)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'eventId', e.id,
            'eventName', CASE 
                WHEN COALESCE(v_member.preferred_language, 'zh') = 'en' AND e.title_en IS NOT NULL AND trim(e.title_en) != '' THEN e.title_en
                ELSE e.title
            END,
            'eventNameZh', e.title,
            'eventNameEn', e.title_en,
            'date', to_char(e.start_date, 'YYYY/MM/DD') || CASE WHEN e.end_date != e.start_date THEN ' ~ ' || to_char(e.end_date, 'YYYY/MM/DD') ELSE '' END,
            'reviewStatus', s.status,
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'code', s.id,
            'lineGroupUrl', CASE 
                WHEN s.status::text LIKE '%正取%' AND s.status::text NOT LIKE '%取消%' THEN e.line_group_url 
                ELSE NULL 
            END
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
        ORDER BY e.start_date DESC
    ) t;

    -- 3. 查詢該社員的所有裝備租借紀錄 (由 loans 與 loan_items, equipments 聚合，包含 payStatus)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'orderId', l.id,
            'itemName', COALESCE(
                (
                    SELECT string_agg(eq.name || ' x' || li.quantity, ', ')
                    FROM loan_items li
                    JOIN equipments eq ON li.equipment_id = eq.id
                    WHERE li.loan_id = l.id
                ),
                '租借裝備'
            ),
            'pickupDate', to_char(l.start_date, 'YYYY/MM/DD'),
            'returnDate', to_char(l.end_date, 'YYYY/MM/DD'),
            'status', l.status,
            'payStatus', CASE 
                WHEN COALESCE(l.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(l.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(l.payment_status::text, '') LIKE '%待確認%' OR COALESCE(l.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                ELSE '未繳費'
            END
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = p_line_user_id
        ORDER BY l.start_date DESC
    ) t;

    -- 4. 組合回傳前端 DashboardData 結構
    RETURN jsonb_build_object(
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- 授權前端客戶端角色執行此 RPC 函式
GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

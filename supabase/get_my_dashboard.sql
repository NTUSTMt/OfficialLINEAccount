-- ==============================================================================
-- 野境戶外系統：個人主頁 Dashboard 極速秒開 RPC 函式
-- 目的：以 50ms 極速聚合會員數位社員證、已報名活動與租借中裝備
-- ==============================================================================

-- 0. 資料表結構自我修復與自動遷移 (Self-healing Schema Migration)
ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS name TEXT;

-- 自 members 自動回填姓名
UPDATE event_signups s SET name = m.name FROM members m WHERE s.line_user_id = m.line_user_id AND (s.name IS NULL OR s.name = '');
UPDATE loans l SET name = m.name FROM members m WHERE l.line_user_id = m.line_user_id AND (l.name IS NULL OR l.name = '');

CREATE OR REPLACE FUNCTION get_my_dashboard(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile JSONB;
    v_activities JSONB;
    v_equipments JSONB;
    v_member members%ROWTYPE;
BEGIN
    -- 1. 查詢會員個人資料與數位社員證狀態
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;

    IF FOUND THEN
        v_profile := jsonb_build_object(
            'name', COALESCE(v_member.name, ''),
            'department', COALESCE(v_member.department, ''),
            'studentId', COALESCE(v_member.student_id, ''),
            'isOfficial', COALESCE(v_member.is_official_member, FALSE) AND (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE),
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
            'expireDate', '尚未核發/尚未繳費 (Not issued/Unpaid)'
        );
    END IF;

    -- 2. 查詢該社員所報名的歷史與近期活動
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'eventId', e.id,
            'eventName', e.title,
            'date', to_char(e.start_date, 'YYYY/MM/DD') || CASE WHEN e.end_date != e.start_date THEN ' ~ ' || to_char(e.end_date, 'YYYY/MM/DD') ELSE '' END,
            'reviewStatus', s.status,
            'payStatus', CASE 
                WHEN s.status LIKE '%已繳費%' OR s.status LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN s.status LIKE '%待確認%' OR s.status LIKE '%Checking%' THEN '待確認 Checking'
                ELSE '未繳費'
            END,
            'code', s.id
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
        ORDER BY e.start_date DESC
    ) t;

    -- 3. 查詢該社員的所有裝備租借紀錄 (由 loans 與 loan_items, equipments 聚合)
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
            'status', l.status
        ) AS eq
        FROM loans l
        WHERE l.line_user_id = p_line_user_id
        ORDER BY l.start_date DESC
    ) t;

    -- 組合回傳前端 DashboardData 結構
    RETURN jsonb_build_object(
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

-- 授權前端客戶端角色執行此 RPC 函式
GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

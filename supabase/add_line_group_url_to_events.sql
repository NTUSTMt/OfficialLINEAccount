-- ==============================================================================
-- 台科登山社：活動專屬群組連結 (line_group_url) 擴充遷移腳本
-- 執行此腳本為 events 資料表加入 line_group_url 欄位並更新相關 RPC 函式
-- ==============================================================================

-- 1. 新增 line_group_url 欄位
ALTER TABLE events ADD COLUMN IF NOT EXISTS line_group_url TEXT;

-- 2. 重新授權與更新 get_my_dashboard RPC
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

    -- 2. 查詢該社員所報名的歷史與近期活動 (正取且非取消者才釋出 lineGroupUrl)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'eventId', e.id,
            'eventName', e.title,
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
            'loanId', l.id,
            'items', string_agg(eq.name || ' x' || li.quantity, ', '),
            'date', to_char(l.pickup_date, 'YYYY/MM/DD') || ' ~ ' || to_char(l.return_date, 'YYYY/MM/DD'),
            'status', l.status,
            'payStatus', CASE 
                WHEN COALESCE(l.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(l.payment_status::text, '') LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(l.payment_status::text, '') LIKE '%待確認%' OR COALESCE(l.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN l.status::text LIKE '%已歸還%' OR l.status::text LIKE '%已取件%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'code', l.id,
            'totalRent', l.total_rent
        ) AS eq
        FROM loans l
        JOIN loan_items li ON l.id = li.loan_id
        JOIN equipments eq ON li.equipment_id = eq.id
        WHERE l.line_user_id = p_line_user_id
        GROUP BY l.id, l.pickup_date, l.return_date, l.status, l.payment_status, l.total_rent
        ORDER BY l.pickup_date DESC
    ) t;

    -- 4. 組合最終 JSON 回傳
    RETURN jsonb_build_object(
        'status', 'success',
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

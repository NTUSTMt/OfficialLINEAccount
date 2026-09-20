-- ==============================================================================
-- 台科登山社：活動專屬群組連結 (line_group_url) 擴充與相關 RPC 完整遷移腳本
-- 執行此腳本為 events 資料表加入 line_group_url 欄位並更新所有讀寫 RPC 函式：
-- 1. events 表新增 line_group_url
-- 2. get_my_dashboard (社員端個人主頁，僅正取錄取者回傳 lineGroupUrl)
-- 3. get_admin_events_rpc (幹部端活動清單，回傳 lineGroupUrl 供卡片與編輯表單讀取)
-- 4. save_admin_event_rpc (幹部端活動儲存，UPSERT line_group_url 至 events 表)
-- ==============================================================================

-- 1. 新增 line_group_url 欄位
ALTER TABLE events ADD COLUMN IF NOT EXISTS line_group_url TEXT;

-- 2. 重新授權與更新 get_my_dashboard RPC (使用正確的 loans 欄位 start_date / end_date)
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

    -- 3. 查詢該社員的所有裝備租借紀錄 (修正為 start_date 與 end_date，並對齊前端欄位格式)
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

GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;


-- 3. 更新幹部活動清單秒開 RPC (包含 line_group_url 欄位)
CREATE OR REPLACE FUNCTION get_admin_events_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_officer_record officers%ROWTYPE;
    v_events JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！',
            'events', '[]'::jsonb
        );
    END IF;

    -- 查詢幹部個人稱謂
    SELECT * INTO v_officer_record FROM officers WHERE line_user_id = trim(p_officer_line_user_id) LIMIT 1;

    -- 聚合活動與報名人數統計 (包含 line_group_url)
    SELECT COALESCE(jsonb_agg(evt), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'name', e.title,
            'startDate', to_char(e.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(e.end_date, 'YYYY/MM/DD'),
            'deadline', to_char(e.deadline AT TIME ZONE 'Asia/Taipei', 'YYYY/MM/DD'),
            'cost', CASE WHEN e.fee > 0 THEN '$' || e.fee ELSE '免費' END,
            'status', COALESCE(e.status, '關閉'),
            'shortDesc', COALESCE(e.summary, ''),
            'fullDesc', COALESCE(e.itinerary, ''),
            'imageUrl', COALESCE(e.cover_image_url, ''),
            'driveFolderUrl', COALESCE(e.drive_folder_url, ''),
            'spreadsheetUrl', COALESCE(e.spreadsheet_url, ''),
            'spreadsheetId', COALESCE(e.spreadsheet_id, ''),
            'lineGroupUrl', COALESCE(e.line_group_url, ''),
            'stats', jsonb_build_object(
                'total', COUNT(s.id) FILTER (WHERE s.status::text NOT LIKE '%取消%' AND s.status::text NOT LIKE '%Cancelled%'),
                'accepted', COUNT(s.id) FILTER (WHERE s.status::text LIKE '%正取%'),
                'waitlisted', COUNT(s.id) FILTER (WHERE s.status::text LIKE '%備取%'),
                'pending', COUNT(s.id) FILTER (WHERE s.status::text NOT LIKE '%正取%' AND s.status::text NOT LIKE '%備取%' AND s.status::text NOT LIKE '%取消%' AND s.status::text NOT LIKE '%Cancelled%')
            ),
            'rowNumber', ROW_NUMBER() OVER (ORDER BY e.start_date DESC) + 1
        ) AS evt
        FROM events e
        LEFT JOIN event_signups s ON e.id = s.event_id
        GROUP BY e.id, e.title, e.start_date, e.end_date, e.deadline, e.fee, e.status, e.summary, e.itinerary, e.cover_image_url, e.drive_folder_url, e.spreadsheet_url, e.spreadsheet_id, e.line_group_url
        ORDER BY e.start_date DESC
    ) sub;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'officerRole', COALESCE(v_officer_record.role, '幹部'),
        'officerName', COALESCE(v_officer_record.name, '幹部'),
        'events', v_events
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO anon, authenticated, service_role;


-- 4. 更新建立或更新活動資料 RPC (確保 line_group_url 寫入與更新)
CREATE OR REPLACE FUNCTION save_admin_event_rpc(
    p_officer_line_user_id TEXT,
    p_event_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id TEXT;
    v_cost_num INTEGER := 0;
    v_start_date DATE;
    v_end_date DATE;
    v_deadline TIMESTAMPTZ;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足');
    END IF;

    -- 解析活動編號：若未提供，全系統統一以 E{yyMM}-{兩位流水號} 格式自 Supabase events 表取號
    v_event_id := trim(COALESCE(p_event_data->>'eventId', ''));
    IF v_event_id = '' THEN
        DECLARE
            v_prefix TEXT := 'E' || to_char(NOW(), 'YYMM') || '-';
            v_max_seq INTEGER := 0;
            v_curr_seq INTEGER;
            r RECORD;
        BEGIN
            FOR r IN SELECT id FROM events WHERE id LIKE v_prefix || '%' LOOP
                BEGIN
                    v_curr_seq := (regexp_replace(substring(r.id from length(v_prefix) + 1), '[^0-9]', '', 'g'))::INTEGER;
                    IF v_curr_seq > v_max_seq THEN
                        v_max_seq := v_curr_seq;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                END;
            END LOOP;
            v_event_id := v_prefix || lpad((v_max_seq + 1)::TEXT, 2, '0');
        END;
    END IF;

    -- 解析費用
    BEGIN
        v_cost_num := (regexp_replace(COALESCE(p_event_data->>'cost', '0'), '[^0-9]', '', 'g'))::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_cost_num := 0;
    END;

    -- 解析日期
    v_start_date := (replace(p_event_data->>'startDate', '/', '-'))::DATE;
    IF p_event_data->>'endDate' IS NOT NULL AND trim(p_event_data->>'endDate') != '' THEN
        v_end_date := (replace(p_event_data->>'endDate', '/', '-'))::DATE;
    ELSE
        v_end_date := v_start_date;
    END IF;

    IF (p_event_data->>'deadline') ~ 'T|\+|:\d{2}' THEN
        v_deadline := (p_event_data->>'deadline')::TIMESTAMPTZ;
    ELSE
        v_deadline := (replace(p_event_data->>'deadline', '/', '-') || ' 23:59:59+08')::TIMESTAMPTZ;
    END IF;

    -- UPSERT 進入 events 表
    INSERT INTO events (
        id,
        title,
        fee,
        start_date,
        end_date,
        deadline,
        status,
        summary,
        itinerary,
        cover_image_url,
        drive_folder_url,
        spreadsheet_url,
        spreadsheet_id,
        line_group_url,
        updated_at
    )
    VALUES (
        v_event_id,
        COALESCE(p_event_data->>'name', '未命名活動'),
        v_cost_num,
        v_start_date,
        v_end_date,
        v_deadline,
        COALESCE(p_event_data->>'status', '未來開放'),
        COALESCE(p_event_data->>'shortDesc', ''),
        COALESCE(p_event_data->>'fullDesc', ''),
        COALESCE(p_event_data->>'imageUrl', ''),
        NULLIF(trim(COALESCE(p_event_data->>'driveFolderUrl', '')), ''),
        NULLIF(trim(COALESCE(p_event_data->>'spreadsheetUrl', '')), ''),
        NULLIF(trim(COALESCE(p_event_data->>'spreadsheetId', '')), ''),
        NULLIF(trim(COALESCE(p_event_data->>'lineGroupUrl', '')), ''),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        fee = EXCLUDED.fee,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        deadline = EXCLUDED.deadline,
        status = EXCLUDED.status,
        summary = EXCLUDED.summary,
        itinerary = EXCLUDED.itinerary,
        cover_image_url = CASE WHEN EXCLUDED.cover_image_url != '' THEN EXCLUDED.cover_image_url ELSE events.cover_image_url END,
        drive_folder_url = COALESCE(EXCLUDED.drive_folder_url, events.drive_folder_url),
        spreadsheet_url = COALESCE(EXCLUDED.spreadsheet_url, events.spreadsheet_url),
        spreadsheet_id = COALESCE(EXCLUDED.spreadsheet_id, events.spreadsheet_id),
        line_group_url = COALESCE(EXCLUDED.line_group_url, events.line_group_url),
        updated_at = NOW();

    -- 排入 sync_queue 佇列
    INSERT INTO sync_queue (table_name, action, record_id, payload)
    VALUES (
        'events',
        'UPSERT',
        v_event_id,
        p_event_data || jsonb_build_object('savedBy', trim(p_officer_line_user_id))
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'eventId', v_event_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) TO anon, authenticated, service_role;

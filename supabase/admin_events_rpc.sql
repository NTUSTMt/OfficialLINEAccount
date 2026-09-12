-- ==============================================================================
-- 野境戶外系統：幹部活動管理與名單審核 RPC 函式 (SECURITY DEFINER)
-- 目的：極速聚合後台活動清單、報名名單與即時審核狀態變更，落實最高規格幹部個資防護
-- ==============================================================================

-- 1. 建立幹部資料表 (officers)
CREATE TABLE IF NOT EXISTS officers (
    id BIGSERIAL PRIMARY KEY,
    line_user_id TEXT UNIQUE,            -- 幹部 LINE User ID (U123456...)
    name TEXT NOT NULL,                  -- 幹部姓名
    role TEXT DEFAULT '幹部',             -- 幹部職位 (如 社長/活動長/器材長)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officers_line_user_id ON officers(line_user_id);

-- 關閉 anon 直接讀取 officers 表，僅能透過 SECURITY DEFINER RPC
ALTER TABLE officers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anon read officers" ON officers;
DROP POLICY IF EXISTS "Service role full access officers" ON officers;
CREATE POLICY "Service role full access officers" ON officers
    FOR ALL USING (auth.role() = 'service_role');

-- 2. 內部幹部鑑權函式 (is_officer)
CREATE OR REPLACE FUNCTION is_officer(p_line_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN FALSE;
    END IF;

    -- 支援本機開發測試帳號
    IF trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM officers WHERE line_user_id = trim(p_line_user_id)
    );
END;
$$;

-- 3. 自動/手動同步幹部快取 (sync_officer_cache_rpc)
-- 當使用者首次於前端經由 GAS 通過幹部驗證時，自動登錄至 Supabase officers 表
CREATE OR REPLACE FUNCTION sync_officer_cache_rpc(
    p_officer_line_user_id TEXT,
    p_name TEXT DEFAULT '',
    p_role TEXT DEFAULT '幹部'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_officer_line_user_id IS NULL OR trim(p_officer_line_user_id) = '' OR trim(p_officer_line_user_id) = 'TEST_USER_ID' THEN
        RETURN jsonb_build_object('success', true, 'message', '測試帳號不寫入');
    END IF;

    INSERT INTO officers (line_user_id, name, role, updated_at)
    VALUES (
        trim(p_officer_line_user_id),
        COALESCE(NULLIF(trim(p_name), ''), '幹部成員'),
        COALESCE(NULLIF(trim(p_role), ''), '幹部'),
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE
    SET name = CASE WHEN EXCLUDED.name != '幹部成員' THEN EXCLUDED.name ELSE officers.name END,
        role = CASE WHEN EXCLUDED.role != '幹部' THEN EXCLUDED.role ELSE officers.role END,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. 幹部活動清單與報名統計秒開 RPC (get_admin_events_rpc)
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

    -- 聚合活動與報名人數統計
    SELECT COALESCE(jsonb_agg(evt), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'name', e.title,
            'startDate', to_char(e.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(e.end_date, 'YYYY/MM/DD'),
            'deadline', to_char(e.deadline, 'YYYY/MM/DD'),
            'cost', CASE WHEN e.fee > 0 THEN '$' || e.fee ELSE '免費' END,
            'status', COALESCE(e.status, '關閉'),
            'shortDesc', COALESCE(e.summary, ''),
            'fullDesc', COALESCE(e.itinerary, ''),
            'imageUrl', COALESCE(e.cover_image_url, ''),
            'stats', jsonb_build_object(
                'total', COUNT(s.id) FILTER (WHERE s.status NOT LIKE '%取消%' AND s.status NOT LIKE '%Cancelled%'),
                'accepted', COUNT(s.id) FILTER (WHERE s.status LIKE '%正取%'),
                'waitlisted', COUNT(s.id) FILTER (WHERE s.status LIKE '%備取%'),
                'pending', COUNT(s.id) FILTER (WHERE s.status NOT LIKE '%正取%' AND s.status NOT LIKE '%備取%' AND s.status NOT LIKE '%取消%' AND s.status NOT LIKE '%Cancelled%')
            ),
            'rowNumber', ROW_NUMBER() OVER (ORDER BY e.start_date DESC) + 1
        ) AS evt
        FROM events e
        LEFT JOIN event_signups s ON e.id = s.event_id
        GROUP BY e.id, e.title, e.start_date, e.end_date, e.deadline, e.fee, e.status, e.summary, e.itinerary, e.cover_image_url
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

-- 5. 單一活動報名名冊秒開 RPC (get_admin_event_signups_rpc)
CREATE OR REPLACE FUNCTION get_admin_event_signups_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signups JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', '權限不足，僅限登山社幹部查閱報名名單！',
            'signups', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_signups
    FROM (
        SELECT jsonb_build_object(
            'rowNumber', ROW_NUMBER() OVER (ORDER BY s.created_at ASC),
            'signupCode', s.id,
            'userId', s.line_user_id,
            'name', COALESCE(m.name, '未知報名者'),
            'gender', COALESCE(m.gender, ''),
            'phone', COALESCE(m.phone, ''),
            'lineId', COALESCE(m.line_id, ''),
            'email', COALESCE(m.email, ''),
            'address', COALESCE(m.address, ''),
            'birthday', COALESCE(m.birthday, ''),
            'idNumber', COALESCE(m.id_card, ''),
            'emerName', COALESCE(m.emergency_contact_name, ''),
            'emerRel', COALESCE(m.emergency_contact_rel, ''),
            'emerPhone', COALESCE(m.emergency_contact_phone, ''),
            'emerAddr', COALESCE(m.emergency_contact_address, ''),
            'experience', COALESCE(m.outdoor_experience, ''),
            'fitnessTest', COALESCE(m.fitness_desc, ''),
            'strengthProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'department', COALESCE(m.department, ''),
            'studentId', COALESCE(m.student_id, ''),
            'medicalHistory', COALESCE(m.medical_history, ''),
            'isOfficial', CASE WHEN COALESCE(m.is_official_member, FALSE) THEN '是' ELSE '否' END,
            'reviewResult', s.status,
            'notifyStatus', '',
            'payStatus', CASE 
                WHEN s.status LIKE '%已繳費%' OR s.status LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN s.status LIKE '%待確認%' OR s.status LIKE '%Checking%' THEN '待確認 Checking'
                ELSE '未繳費'
            END,
            'remark', COALESCE(s.notes, '')
        ) AS item
        FROM event_signups s
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE s.event_id = trim(p_event_id)
        ORDER BY s.created_at ASC
    ) sub;

    RETURN jsonb_build_object(
        'status', 'success',
        'signups', v_signups
    );
END;
$$;

-- 6. 審核個別社員報名狀態 RPC (update_signup_status_rpc)
CREATE OR REPLACE FUNCTION update_signup_status_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT,
    p_signup_id TEXT,
    p_review_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼');
    END IF;

    UPDATE event_signups
    SET status = trim(p_review_result),
        updated_at = NOW()
    WHERE id = trim(p_signup_id);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到該筆報名紀錄');
    END IF;

    -- 排入 sync_queue 異步同步至 Google Sheets
    INSERT INTO sync_queue (table_name, action, record_id, payload)
    VALUES (
        'event_signups',
        'UPDATE',
        trim(p_signup_id),
        jsonb_build_object(
            'eventId', trim(p_event_id),
            'signupId', trim(p_signup_id),
            'reviewResult', trim(p_review_result),
            'updatedBy', trim(p_officer_line_user_id)
        )
    );

    RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 7. 快速切換活動開放狀態 RPC (update_event_status_rpc)
CREATE OR REPLACE FUNCTION update_event_status_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足');
    END IF;

    UPDATE events
    SET status = trim(p_status),
        updated_at = NOW()
    WHERE id = trim(p_event_id);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到該活動編號');
    END IF;

    -- 排入 sync_queue
    INSERT INTO sync_queue (table_name, action, record_id, payload)
    VALUES (
        'events',
        'UPDATE',
        trim(p_event_id),
        jsonb_build_object('status', trim(p_status))
    );

    RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 8. 建立或更新活動資料 RPC (save_admin_event_rpc)
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

    -- 解析活動編號
    v_event_id := trim(COALESCE(p_event_data->>'eventId', ''));
    IF v_event_id = '' THEN
        v_event_id := 'E' || to_char(NOW(), 'YYYYMMDD_HH24MISS');
    END IF;

    -- 解析費用 (純數字)
    BEGIN
        v_cost_num := (regexp_replace(COALESCE(p_event_data->>'cost', '0'), '[^0-9]', '', 'g'))::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_cost_num := 0;
    END;

    -- 解析日期
    v_start_date := (replace(p_event_data->>'startDate', '/', '-'))::DATE;
    v_end_date := (replace(COALESCE(NULLIF(p_event_data->>'endDate', ''), p_event_data->>'startDate'), '/', '-'))::DATE;
    v_deadline := (replace(p_event_data->>'deadline', '/', '-') || ' 23:59:59')::TIMESTAMPTZ;

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

-- 9. 授權執行 RPC 函式
GRANT EXECUTE ON FUNCTION is_officer(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_officer_cache_rpc(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_event_status_rpc(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) TO anon, authenticated;

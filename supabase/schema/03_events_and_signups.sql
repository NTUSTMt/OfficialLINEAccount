-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 03 - 活動、報名與心得評價 (03_events_and_signups.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 活動資料表 (events) -> Google Sheets: Events
-- 包含中英雙語行程、費用、日期、LINE群組、雲端相簿與名冊試算表
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,                                 -- 活動編號 (如 E01, E2409-01)
    title TEXT NOT NULL,                                 -- 活動名稱 (中文)
    title_en TEXT,                                       -- 活動名稱 (英文)
    fee INTEGER NOT NULL DEFAULT 0,                      -- 預計活動費用 (純數字)
    start_date DATE NOT NULL,                            -- 活動開始日期 (YYYY-MM-DD)
    end_date DATE NOT NULL,                              -- 活動結束日期 (YYYY-MM-DD)
    deadline TIMESTAMPTZ NOT NULL,                       -- 報名截止時間
    status TEXT NOT NULL DEFAULT '報名中 Open',          -- 報名狀態 (報名中 Open / 已截止 Closed / 已結束 Finished)
    summary TEXT,                                        -- 活動簡介 (中文)
    summary_en TEXT,                                     -- 活動簡介 (英文)
    itinerary TEXT,                                      -- 詳細行程 (中文)
    itinerary_en TEXT,                                   -- 詳細行程 (英文)
    cover_image_url TEXT,                                -- 封面圖網址
    drive_folder_url TEXT,                               -- Google Drive 專屬活動相簿資料夾網址
    spreadsheet_url TEXT,                                -- Google Sheets 專屬活動名冊試算表網址
    spreadsheet_id TEXT,                                 -- 專屬名冊試算表 ID
    line_group_url TEXT,                                 -- LINE 活動群組加入網址
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS line_group_url TEXT;

CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. 活動報名名冊 (event_signups) -> Google Sheets: Signups
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_signups (
    id TEXT PRIMARY KEY,                                 -- 報名專屬碼 (如 S123456)
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 隊員真實姓名 (快照方便直觀檢索)
    line_id TEXT,                                        -- LINE ID (關聯 members.line_id 方便幹部出隊聯絡)
    status event_signup_status_enum NOT NULL DEFAULT '審核中 Checking', -- 審核狀態
    payment_status payment_status_enum NOT NULL DEFAULT '未繳費 Unpaid', -- 活動繳費狀態
    notification_status TEXT DEFAULT '未發送',           -- LINE 錄取/取消推播狀態 (未發送 / 已發送)
    is_official_member_snapshot BOOLEAN NOT NULL DEFAULT FALSE, -- 報名當下社員資格快照
    cancel_reason TEXT,                                  -- 取消報名原因自述
    notes TEXT,                                          -- 幹部備註 (如：【已繳費待退款】)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signups_event_id ON event_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_signups_line_user_id ON event_signups(line_user_id);
CREATE INDEX IF NOT EXISTS idx_signups_status ON event_signups(status);
CREATE INDEX IF NOT EXISTS idx_signups_payment_status ON event_signups(payment_status);

-- 建立防止同一用戶在同一活動重複「有效報名」之 Partial Unique Index (已取消 Cancelled 除外)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_signups_active_unique
    ON event_signups (line_user_id, event_id)
    WHERE status != '已取消 Cancelled'::event_signup_status_enum;

DROP TRIGGER IF EXISTS trg_signups_updated_at ON event_signups;
CREATE TRIGGER trg_signups_updated_at
BEFORE UPDATE ON event_signups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. 活動心得與登頂相片 (reflections) -> Google Sheets: Reflections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reflections (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    name TEXT,                                           -- 社員姓名
    difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 5),
    beauty_rating INTEGER CHECK (beauty_rating >= 1 AND beauty_rating <= 5),
    content TEXT,                                        -- 心得內文
    photo_urls JSONB DEFAULT '[]'::jsonb,                -- Google Drive 登頂相片連結陣列
    is_public BOOLEAN DEFAULT TRUE,                      -- 是否公開展示於全螢幕心得牆
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_reflections_event_user UNIQUE (event_id, line_user_id)
);

ALTER TABLE reflections ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_reflections_event_public ON reflections (event_id, is_public);

DROP TRIGGER IF EXISTS trg_reflections_updated_at ON reflections;
CREATE TRIGGER trg_reflections_updated_at
BEFORE UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. 活動原子報名 RPC (signup_rpc)
-- 包含活動截止檢查、個人個資完整度檢查、防重複報名，且不覆蓋 members.updated_at
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signup_rpc(
    p_event_id TEXT,
    p_line_user_id TEXT,
    p_signup_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event RECORD;
    v_member RECORD;
    v_missing_fields TEXT[] := ARRAY[]::TEXT[];
    v_days_since_update NUMERIC;
    v_existing_signup RECORD;
    v_is_official BOOLEAN := FALSE;
    v_actual_signup_id TEXT := p_signup_id;
    v_retry_count INT := 0;
BEGIN
    -- 1. 檢查活動是否存在
    SELECT * INTO v_event FROM events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', '活動不存在或已被刪除'
        );
    END IF;

    -- 2. 檢查活動是否截止或關閉
    IF (v_event.status ILIKE '%關閉%' OR v_event.status ILIKE '%closed%' OR v_event.status ILIKE '%已截止%' OR v_event.status ILIKE '%已結束%')
       OR (v_event.deadline IS NOT NULL AND NOW() > v_event.deadline) THEN
        RETURN jsonb_build_object(
            'status', 'closed',
            'message', '此活動報名已截止或已關閉'
        );
    END IF;

    -- 3. 檢查社員個資是否齊全
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'profile_incomplete',
            'message', '尚未填寫個人資料，請先至個人資料頁面完成登記',
            'missing_fields', ARRAY['name', 'phone', 'birthday', 'id_card', 'emergency_contact_name', 'emergency_contact_phone']
        );
    END IF;

    IF v_member.name IS NULL OR trim(v_member.name) = '' THEN v_missing_fields := array_append(v_missing_fields, 'name'); END IF;
    IF v_member.phone IS NULL OR trim(v_member.phone) = '' THEN v_missing_fields := array_append(v_missing_fields, 'phone'); END IF;
    IF v_member.birthday IS NULL OR trim(v_member.birthday) = '' THEN v_missing_fields := array_append(v_missing_fields, 'birthday'); END IF;
    IF v_member.id_card IS NULL OR trim(v_member.id_card) = '' THEN v_missing_fields := array_append(v_missing_fields, 'id_card'); END IF;
    IF v_member.emergency_contact_name IS NULL OR trim(v_member.emergency_contact_name) = '' THEN v_missing_fields := array_append(v_missing_fields, 'emergency_contact_name'); END IF;
    IF v_member.emergency_contact_phone IS NULL OR trim(v_member.emergency_contact_phone) = '' THEN v_missing_fields := array_append(v_missing_fields, 'emergency_contact_phone'); END IF;

    IF array_length(v_missing_fields, 1) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'profile_incomplete',
            'message', '請至個人資料補齊必填欄位後再進行報名',
            'missing_fields', v_missing_fields
        );
    END IF;

    -- 4. 檢查 180 天個資更新時效
    IF v_member.updated_at IS NOT NULL THEN
        v_days_since_update := EXTRACT(EPOCH FROM (NOW() - v_member.updated_at)) / 86400;
        IF v_days_since_update > 180 THEN
            RETURN jsonb_build_object(
                'status', 'profile_expired',
                'message', '您的個人資料已超過 180 天未確認，請先進入個資頁面檢視並儲存確認最新登山安全資訊',
                'days_since_update', ROUND(v_days_since_update)
            );
        END IF;
    END IF;

    -- 5. 檢查是否已有有效報名紀錄
    SELECT * INTO v_existing_signup 
    FROM event_signups 
    WHERE event_id = p_event_id AND line_user_id = p_line_user_id;

    IF FOUND THEN
        IF v_existing_signup.status != '已取消 Cancelled'::event_signup_status_enum THEN
            RETURN jsonb_build_object(
                'status', 'already_signed_up',
                'message', '您已報名過此活動（狀態：' || v_existing_signup.status::text || '），請勿重複報名',
                'signup_id', v_existing_signup.id
            );
        END IF;
    END IF;

    -- 6. 正式社員資格快照判定
    IF v_member.is_official_member IS TRUE 
       OR (v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at >= CURRENT_DATE) THEN
        v_is_official := TRUE;
    END IF;

    -- 7. 寫入或重新啟用報名紀錄
    IF v_existing_signup.id IS NOT NULL THEN
        UPDATE event_signups
        SET status = '審核中 Checking'::event_signup_status_enum,
            payment_status = '未繳費 Unpaid'::payment_status_enum,
            is_official_member_snapshot = v_is_official,
            cancel_reason = NULL,
            notes = NULL,
            name = COALESCE(v_member.name, event_signups.name),
            line_id = COALESCE(v_member.line_id, event_signups.line_id),
            notification_status = '未發送',
            updated_at = NOW()
        WHERE id = v_existing_signup.id;

        RETURN jsonb_build_object(
            'status', 'success',
            'message', '報名成功！已為您重新送出報名審核',
            'signup_id', v_existing_signup.id
        );
    ELSE
        -- 新增報名記錄，防主鍵碰撞重試
        LOOP
            BEGIN
                INSERT INTO event_signups (
                    id,
                    event_id,
                    line_user_id,
                    name,
                    line_id,
                    status,
                    payment_status,
                    notification_status,
                    is_official_member_snapshot,
                    created_at,
                    updated_at
                ) VALUES (
                    v_actual_signup_id,
                    p_event_id,
                    p_line_user_id,
                    v_member.name,
                    v_member.line_id,
                    '審核中 Checking'::event_signup_status_enum,
                    '未繳費 Unpaid'::payment_status_enum,
                    '未發送',
                    v_is_official,
                    NOW(),
                    NOW()
                );
                EXIT;
            EXCEPTION WHEN unique_violation THEN
                v_retry_count := v_retry_count + 1;
                IF v_retry_count > 5 THEN
                    RETURN jsonb_build_object(
                        'status', 'error',
                        'message', '產生報名編號時發生重複衝突，請稍後重試'
                    );
                END IF;
                v_actual_signup_id := 'S' || to_char(NOW(), 'YYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 100)::TEXT, 2, '0');
            END;
        END LOOP;

        RETURN jsonb_build_object(
            'status', 'success',
            'message', '報名成功！審核結果將透過 LINE 官方帳號推播通知',
            'signup_id', v_actual_signup_id
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', '報名作業失敗: ' || SQLERRM
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. 活動報名取消 RPC (cancel_event_signup_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_event_signup_rpc(
    p_line_user_id TEXT,
    p_signup_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_signup RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN := FALSE;
    v_is_service_role BOOLEAN := FALSE;
    v_refund_pending BOOLEAN := FALSE;
    v_note TEXT;
BEGIN
    IF p_line_user_id IS NULL OR p_signup_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);
    v_is_service_role := (COALESCE(auth.role(), '') = 'service_role')
        OR (COALESCE(auth.jwt() ->> 'role', '') = 'service_role');

    IF NOT v_is_service_role THEN
        IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: 缺少有效身分憑證');
        END IF;
        IF NOT v_is_officer AND trim(v_jwt_sub) != trim(p_line_user_id) THEN
            RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人活動報名');
        END IF;
    END IF;

    SELECT * INTO v_signup
    FROM event_signups
    WHERE (id = p_signup_id OR event_id = p_signup_id)
      AND line_user_id = trim(p_line_user_id)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此報名紀錄或非本人申請');
    END IF;

    IF v_signup.status = '已取消 Cancelled'::event_signup_status_enum THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此報名紀錄已取消');
    END IF;

    v_refund_pending := v_signup.payment_status::text IN ('已繳費 Paid', '待確認 Checking');
    v_note := NULLIF(trim(COALESCE(v_signup.notes, '')), '');

    IF v_refund_pending AND position('【已繳費待退款】' IN COALESCE(v_note, '')) = 0 THEN
        v_note := concat_ws(E'\n', v_note, '【已繳費待退款】');
    END IF;
    IF p_reason IS NOT NULL AND trim(p_reason) <> '' THEN
        v_note := concat_ws(E'\n', v_note, '[取消原因] ' || trim(p_reason));
    END IF;

    UPDATE event_signups
    SET status = '已取消 Cancelled'::event_signup_status_enum,
        cancel_reason = COALESCE(NULLIF(trim(p_reason), ''), v_signup.cancel_reason, '社員自個人主頁取消'),
        notes = v_note,
        updated_at = NOW()
    WHERE id = v_signup.id;

    RETURN jsonb_build_object(
        'status', 'success',
        'refund_pending', v_refund_pending,
        'message', '活動報名已成功取消！'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 幹部端 RPC：取得活動清單與報名人數統計 (get_admin_events_rpc)
-- 包含雙語英文欄位與分類名額計數
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_events_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_officer_record officers%ROWTYPE;
    v_events JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！',
            'events', '[]'::jsonb
        );
    END IF;

    SELECT * INTO v_officer_record FROM officers WHERE line_user_id = trim(p_officer_line_user_id) LIMIT 1;

    SELECT COALESCE(jsonb_agg(evt), '[]'::jsonb)
    INTO v_events
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'name', e.title,
            'nameEn', COALESCE(e.title_en, ''),
            'startDate', to_char(e.start_date, 'YYYY/MM/DD'),
            'endDate', to_char(e.end_date, 'YYYY/MM/DD'),
            'deadline', to_char(e.deadline AT TIME ZONE 'Asia/Taipei', 'YYYY/MM/DD'),
            'cost', CASE WHEN e.fee > 0 THEN '$' || e.fee ELSE '免費' END,
            'status', COALESCE(e.status, '報名中 Open'),
            'shortDesc', COALESCE(e.summary, ''),
            'shortDescEn', COALESCE(e.summary_en, ''),
            'fullDesc', COALESCE(e.itinerary, ''),
            'fullDescEn', COALESCE(e.itinerary_en, ''),
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
        GROUP BY e.id, e.title, e.title_en, e.start_date, e.end_date, e.deadline, e.fee, e.status, e.summary, e.summary_en, e.itinerary, e.itinerary_en, e.cover_image_url, e.drive_folder_url, e.spreadsheet_url, e.spreadsheet_id, e.line_group_url
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

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：儲存或新增活動 (save_admin_event_rpc)
-- 支援自動生成 E{yyMM}-{流水號} 格式與雙語行程
-- ------------------------------------------------------------------------------
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
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法編輯活動');
    END IF;

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
        v_cost_num := regexp_replace(COALESCE(p_event_data->>'cost', '0'), '[^0-9]', '', 'g')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_cost_num := 0;
    END;

    -- 解析日期
    v_start_date := (p_event_data->>'startDate')::DATE;
    v_end_date := COALESCE(NULLIF(p_event_data->>'endDate', '')::DATE, v_start_date);
    v_deadline := COALESCE(
        NULLIF(p_event_data->>'deadline', '')::TIMESTAMPTZ,
        (v_start_date::TEXT || ' 23:59:59+08')::TIMESTAMPTZ
    );

    INSERT INTO events (
        id,
        title,
        title_en,
        start_date,
        end_date,
        deadline,
        fee,
        status,
        summary,
        summary_en,
        itinerary,
        itinerary_en,
        cover_image_url,
        drive_folder_url,
        spreadsheet_url,
        spreadsheet_id,
        line_group_url,
        updated_at
    ) VALUES (
        v_event_id,
        trim(p_event_data->>'name'),
        NULLIF(trim(p_event_data->>'nameEn'), ''),
        v_start_date,
        v_end_date,
        v_deadline,
        v_cost_num,
        COALESCE(NULLIF(trim(p_event_data->>'status'), ''), '報名中 Open'),
        NULLIF(trim(p_event_data->>'shortDesc'), ''),
        NULLIF(trim(p_event_data->>'shortDescEn'), ''),
        NULLIF(trim(p_event_data->>'fullDesc'), ''),
        NULLIF(trim(p_event_data->>'fullDescEn'), ''),
        NULLIF(trim(p_event_data->>'imageUrl'), ''),
        NULLIF(trim(p_event_data->>'driveFolderUrl'), ''),
        NULLIF(trim(p_event_data->>'spreadsheetUrl'), ''),
        NULLIF(trim(p_event_data->>'spreadsheetId'), ''),
        NULLIF(trim(p_event_data->>'lineGroupUrl'), ''),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        title_en = COALESCE(EXCLUDED.title_en, events.title_en),
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        deadline = EXCLUDED.deadline,
        fee = EXCLUDED.fee,
        status = EXCLUDED.status,
        summary = COALESCE(EXCLUDED.summary, events.summary),
        summary_en = COALESCE(EXCLUDED.summary_en, events.summary_en),
        itinerary = COALESCE(EXCLUDED.itinerary, events.itinerary),
        itinerary_en = COALESCE(EXCLUDED.itinerary_en, events.itinerary_en),
        cover_image_url = COALESCE(EXCLUDED.cover_image_url, events.cover_image_url),
        drive_folder_url = COALESCE(EXCLUDED.drive_folder_url, events.drive_folder_url),
        spreadsheet_url = COALESCE(EXCLUDED.spreadsheet_url, events.spreadsheet_url),
        spreadsheet_id = COALESCE(EXCLUDED.spreadsheet_id, events.spreadsheet_id),
        line_group_url = COALESCE(EXCLUDED.line_group_url, events.line_group_url),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'status', 'success',
        'eventId', v_event_id,
        'message', '活動儲存成功'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：快速變更活動狀態 (update_event_status_rpc)
-- ------------------------------------------------------------------------------
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
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法變更狀態');
    END IF;

    UPDATE events 
    SET status = trim(p_status),
        updated_at = NOW()
    WHERE id = trim(p_event_id);

    RETURN jsonb_build_object(
        'status', 'success',
        'eventId', p_event_id,
        'newStatus', trim(p_status)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. 幹部端 RPC：取得指定活動完整報名名冊 (get_admin_event_signups_rpc)
-- 確保 Unpaid 優先權正確解析
-- ------------------------------------------------------------------------------
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
            'id', s.id,
            'userId', s.line_user_id,
            'lineUserId', s.line_user_id,
            'name', COALESCE(s.name, m.name, '未知報名者'),
            'gender', COALESCE(m.gender, ''),
            'nationality', COALESCE(m.nationality, ''),
            'phone', COALESCE(m.phone, ''),
            'lineId', COALESCE(m.line_id, ''),
            'realLineId', COALESCE(m.line_id, ''),
            'email', COALESCE(m.email, ''),
            'address', COALESCE(m.address, ''),
            'birthday', COALESCE(m.birthday, ''),
            'idNumber', COALESCE(m.id_card, ''),
            'idCard', COALESCE(m.id_card, ''),
            'emerName', COALESCE(m.emergency_contact_name, ''),
            'emerRel', COALESCE(m.emergency_contact_rel, ''),
            'emerPhone', COALESCE(m.emergency_contact_phone, ''),
            'emerAddr', COALESCE(m.emergency_contact_address, ''),
            'emergencyContact', CASE 
                WHEN m.emergency_contact_name IS NOT NULL AND m.emergency_contact_name != '' THEN
                    m.emergency_contact_name || ' (' || COALESCE(m.emergency_contact_rel, '未填關係') || ') ' || COALESCE(m.emergency_contact_phone, '')
                ELSE '未填寫'
            END,
            'experience', COALESCE(m.outdoor_experience, ''),
            'climbingExp', COALESCE(m.outdoor_experience, ''),
            'fitnessTest', COALESCE(m.fitness_desc, ''),
            'fitnessDesc', COALESCE(m.fitness_desc, ''),
            'strengthProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'fitnessProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'department', COALESCE(m.department, ''),
            'studentId', COALESCE(m.student_id, ''),
            'medicalHistory', COALESCE(m.medical_history, ''),
            'isOfficial', CASE WHEN COALESCE(m.is_official_member, FALSE) THEN '是' ELSE '否' END,
            'reviewResult', s.status,
            'notifyStatus', COALESCE(s.notification_status, ''),
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%未繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Unpaid%' THEN '未繳費'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') = 'Paid' OR COALESCE(s.payment_status::text, '') LIKE '%已繳費 Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
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

-- ------------------------------------------------------------------------------
-- 10. 幹部端 RPC：審核報名名單錄取狀態 (update_signup_status_rpc)
-- ------------------------------------------------------------------------------
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
DECLARE
    v_status_val event_signup_status_enum;
    v_status_text TEXT;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法審核');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼');
    END IF;

    v_status_text := trim(p_review_result);
    IF v_status_text LIKE '%正取（已繳費）%' OR v_status_text LIKE '%Confirmed (Paid)%' THEN
        v_status_val := '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取（有意願）%' OR v_status_text LIKE '%Waitlisted (Interested)%' THEN
        v_status_val := '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%正取%' OR v_status_text LIKE '%Confirmed%' THEN
        v_status_val := '正取 Confirmed'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%備取%' OR v_status_text LIKE '%Waitlisted%' THEN
        v_status_val := '備取 Waitlisted'::event_signup_status_enum;
    ELSIF v_status_text LIKE '%取消%' OR v_status_text LIKE '%Cancelled%' THEN
        v_status_val := '已取消 Cancelled'::event_signup_status_enum;
    ELSE
        v_status_val := '審核中 Checking'::event_signup_status_enum;
    END IF;

    UPDATE event_signups
    SET status = v_status_val,
        updated_at = NOW()
    WHERE id = trim(p_signup_id)
      AND (event_id = trim(p_event_id) OR trim(p_event_id) = '');

    RETURN jsonb_build_object(
        'status', 'success',
        'signupId', p_signup_id,
        'newStatus', v_status_val::TEXT
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. 心得與相片 RPC：儲存心得 (save_reflection_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_reflection_rpc(p_line_user_id TEXT, p_details JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id TEXT;
    v_difficulty INTEGER;
    v_beauty INTEGER;
    v_content TEXT;
    v_image_url TEXT;
    v_photo_urls JSONB;
    v_is_public BOOLEAN;
    v_member_name TEXT;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', '缺少必要的 line_user_id 參數');
    END IF;

    v_event_id := p_details->>'eventId';
    IF v_event_id IS NULL OR trim(v_event_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', '缺少必要的 eventId 參數');
    END IF;

    v_difficulty := COALESCE((p_details->>'difficulty')::INTEGER, 5);
    v_beauty := COALESCE((p_details->>'beauty')::INTEGER, 5);
    v_content := COALESCE(p_details->>'content', '');
    v_image_url := COALESCE(p_details->>'imageUrl', '');
    v_is_public := COALESCE((p_details->>'isPublic')::BOOLEAN, TRUE);

    SELECT COALESCE(name, '') INTO v_member_name FROM members WHERE line_user_id = p_line_user_id LIMIT 1;
    IF v_member_name IS NULL OR v_member_name = '' THEN
        v_member_name := COALESCE(p_details->>'authorName', '');
    END IF;

    IF v_image_url != '' THEN
        v_photo_urls := jsonb_build_array(v_image_url);
    ELSE
        v_photo_urls := '[]'::jsonb;
    END IF;

    INSERT INTO reflections (
        event_id,
        line_user_id,
        name,
        difficulty_rating,
        beauty_rating,
        content,
        photo_urls,
        is_public,
        updated_at
    ) VALUES (
        v_event_id,
        p_line_user_id,
        v_member_name,
        v_difficulty,
        v_beauty,
        v_content,
        v_photo_urls,
        v_is_public,
        NOW()
    )
    ON CONFLICT (event_id, line_user_id)
    DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), reflections.name),
        difficulty_rating = EXCLUDED.difficulty_rating,
        beauty_rating = EXCLUDED.beauty_rating,
        content = EXCLUDED.content,
        is_public = EXCLUDED.is_public,
        photo_urls = CASE 
            WHEN jsonb_array_length(EXCLUDED.photo_urls) > 0 THEN EXCLUDED.photo_urls
            ELSE reflections.photo_urls
        END,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', TRUE,
        'eventId', v_event_id,
        'lineUserId', p_line_user_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. 心得牆查詢 RPC：公開心得牆 (get_event_public_reflections_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_event_public_reflections_rpc(p_event_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reflections JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
    INTO v_reflections
    FROM (
        SELECT 
            ref.id,
            ref.event_id,
            COALESCE(ref.name, m.name, '匿名山友') AS author_name,
            ref.difficulty_rating,
            ref.beauty_rating,
            ref.content,
            ref.photo_urls,
            to_char(ref.created_at, 'YYYY/MM/DD') AS created_at
        FROM reflections ref
        LEFT JOIN members m ON ref.line_user_id = m.line_user_id
        WHERE ref.event_id = p_event_id
          AND ref.is_public = TRUE
        ORDER BY ref.created_at DESC
    ) r;

    RETURN jsonb_build_object(
        'success', TRUE,
        'eventId', p_event_id,
        'reflections', v_reflections
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. 個人成就與登山里程碑 RPC (get_my_achievements)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_achievements(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activities JSONB := '[]'::jsonb;
    v_completed_count INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'completedCount', 0,
            'activities', '[]'::jsonb
        );
    END IF;

    SELECT 
        COALESCE(jsonb_agg(item), '[]'::jsonb),
        COUNT(*)
    INTO v_activities, v_completed_count
    FROM (
        SELECT jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'titleEn', COALESCE(e.title_en, ''),
            'date', to_char(e.start_date, 'YYYY/MM/DD'),
            'coverImageUrl', COALESCE(e.cover_image_url, ''),
            'hasReflection', (r.id IS NOT NULL),
            'rating', r.beauty_rating,
            'difficulty', r.difficulty_rating,
            'review', COALESCE(r.content, '')
        ) AS item
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN reflections r ON (r.event_id = e.id AND r.line_user_id = s.line_user_id)
        WHERE s.line_user_id = p_line_user_id
          AND (s.status = '正取 Confirmed'::event_signup_status_enum OR s.status = '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum)
          AND e.end_date < CURRENT_DATE
        ORDER BY e.start_date DESC
    ) t;

    RETURN jsonb_build_object(
        'completedCount', v_completed_count,
        'activities', v_activities
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 14. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- events
DROP POLICY IF EXISTS "Public read events" ON events;
CREATE POLICY "Public read events" ON events
    FOR SELECT USING (status != '草稿 Draft');

DROP POLICY IF EXISTS "Service role full access events" ON events;
CREATE POLICY "Service role full access events" ON events
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers manage events" ON events;
CREATE POLICY "Officers manage events" ON events
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- event_signups
DROP POLICY IF EXISTS "Service role full access signups" ON event_signups;
CREATE POLICY "Service role full access signups" ON event_signups
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all signups" ON event_signups;
CREATE POLICY "Officers can manage all signups" ON event_signups
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own signups" ON event_signups;
CREATE POLICY "Members can read own signups" ON event_signups
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can insert own signups" ON event_signups;
CREATE POLICY "Members can insert own signups" ON event_signups
    FOR INSERT TO authenticated
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can cancel own signups" ON event_signups;
CREATE POLICY "Members can cancel own signups" ON event_signups
    FOR UPDATE TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

-- reflections
DROP POLICY IF EXISTS "Public read reflections" ON reflections;
CREATE POLICY "Public read reflections" ON reflections
    FOR SELECT USING (is_public = TRUE);

DROP POLICY IF EXISTS "Service role full access reflections" ON reflections;
CREATE POLICY "Service role full access reflections" ON reflections
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Members read own reflections" ON reflections;
CREATE POLICY "Members read own reflections" ON reflections
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members manage own reflections" ON reflections;
CREATE POLICY "Members manage own reflections" ON reflections
    FOR ALL TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Officers manage reflections" ON reflections;
CREATE POLICY "Officers manage reflections" ON reflections
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 權限指派
GRANT EXECUTE ON FUNCTION signup_rpc(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION cancel_event_signup_rpc(TEXT, TEXT, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION save_reflection_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_event_public_reflections_rpc(TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION get_my_achievements(TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_admin_event_rpc(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_event_status_rpc(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 15. 外部日曆快取表 (external_calendar_events)
-- 快取 Google Calendar 主日曆與學校訂閱校曆
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_calendar_events (
    id TEXT PRIMARY KEY,                                 -- Google Event ID 或外部日曆唯一識別碼
    calendar_type TEXT NOT NULL,                         -- 'club' (社團主日曆) 或 'school' (學校訂閱校曆)
    title TEXT NOT NULL,                                 -- 行程標題
    description TEXT,                                    -- 行程詳細說明
    start_time TIMESTAMPTZ NOT NULL,                     -- 起始時間戳記
    end_time TIMESTAMPTZ NOT NULL,                       -- 結束時間戳記
    is_all_day BOOLEAN DEFAULT FALSE,                    -- 是否為整天行程
    location TEXT,                                       -- 地點資訊
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_cal_start ON public.external_calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_ext_cal_type ON public.external_calendar_events(calendar_type);

DROP TRIGGER IF EXISTS trg_external_calendar_events_updated_at ON public.external_calendar_events;
CREATE TRIGGER trg_external_calendar_events_updated_at
BEFORE UPDATE ON public.external_calendar_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Officers read external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Officers read external_calendar_events" ON public.external_calendar_events
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Officers manage external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Officers manage external_calendar_events" ON public.external_calendar_events
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Service role full access external_calendar_events" ON public.external_calendar_events;
CREATE POLICY "Service role full access external_calendar_events" ON public.external_calendar_events
    FOR ALL TO service_role
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 16. 幹部端 RPC：社務日程聚合查詢 (get_schedule_feed)
-- 整合活動、報名截止日、隊員繳費、裝備借還雙錨點與外部日曆
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_schedule_feed(
    p_officer_line_user_id TEXT,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_query_text TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'all'
)
RETURNS TABLE (
    item_id TEXT,
    source_type TEXT,
    title TEXT,
    sub_text TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_macro BOOLEAN,
    status_badge TEXT,
    link_path TEXT,
    details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. 身分鑑權校驗 (限社團幹部)
    IF NOT is_officer(p_officer_line_user_id) THEN
        RAISE EXCEPTION '權限不足：僅限社團幹部存取社務日程 (Insufficient permissions)';
    END IF;

    -- 2. 業務資料聚合查詢
    RETURN QUERY
    WITH all_items AS (
        -- 活動主體 (綠色/彩色橫條，巨觀行程)
        SELECT
            e.id AS item_id,
            'event' AS source_type,
            e.title AS title,
            COALESCE(e.status, '活動') AS sub_text,
            (e.start_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (COALESCE(e.end_date, e.start_date)::text || ' 23:59:59+08')::timestamptz AS end_time,
            TRUE AS is_macro,
            e.status AS status_badge,
            '/admin-web/events?id=' || e.id AS link_path,
            jsonb_build_object(
                'event_id', e.id,
                'title', e.title,
                'fee', e.fee,
                'status', e.status,
                'summary', e.summary,
                'itinerary', e.itinerary,
                'drive_folder_url', e.drive_folder_url,
                'spreadsheet_url', e.spreadsheet_url,
                'start_date', e.start_date,
                'end_date', e.end_date,
                'deadline', e.deadline
            ) AS details
        FROM events e

        UNION ALL

        -- 報名截止日 (醒目標籤，巨觀節點)
        SELECT
            e.id || '_deadline' AS item_id,
            'deadline' AS source_type,
            e.title || ' 報名截止' AS title,
            '截止時間: ' || to_char(e.deadline AT TIME ZONE 'Asia/Taipei', 'YYYY/MM/DD HH24:MI') AS sub_text,
            e.deadline AS start_time,
            e.deadline AS end_time,
            TRUE AS is_macro,
            '截止日' AS status_badge,
            '/admin-web/roster?eventId=' || e.id AS link_path,
            jsonb_build_object(
                'event_id', e.id,
                'title', e.title,
                'deadline', e.deadline,
                'status', e.status,
                'fee', e.fee
            ) AS details
        FROM events e
        WHERE e.deadline IS NOT NULL

        UNION ALL

        -- 財務繳費申報 (細部業務，灰底白字微型標籤)
        SELECT
            p.id AS item_id,
            'finance' AS source_type,
            COALESCE(p.name, '隊員') || ' 繳費申報' AS title,
            '$' || p.amount::text || ' (' || COALESCE(p.type, '繳費') || ')' AS sub_text,
            p.created_at AS start_time,
            p.created_at AS end_time,
            FALSE AS is_macro,
            p.status AS status_badge,
            '/admin-web/finance' AS link_path,
            jsonb_build_object(
                'payment_id', p.id,
                'name', p.name,
                'amount', p.amount,
                'bank_last5', p.bank_last5,
                'type', p.type,
                'status', p.status,
                'proof_image_url', p.proof_image_url,
                'notes', p.notes,
                'officer_notes', p.officer_notes,
                'target_id', p.target_id,
                'target_type', p.target_type,
                'created_at', p.created_at
            ) AS details
        FROM payments p

        UNION ALL

        -- 裝備借出 (借出日錨點，標示 借: 器材)
        SELECT
            l.id || '_pickup' AS item_id,
            'loan_pickup' AS source_type,
            '借: ' || COALESCE(l.name, '隊員') AS title,
            COALESCE(l.purpose, '裝備借出') AS sub_text,
            (l.start_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (l.start_date::text || ' 23:59:59+08')::timestamptz AS end_time,
            FALSE AS is_macro,
            l.status AS status_badge,
            '/admin-web/loans' AS link_path,
            jsonb_build_object(
                'loan_id', l.id,
                'name', l.name,
                'items', l.items,
                'purpose', l.purpose,
                'status', l.status,
                'payment_status', l.payment_status,
                'total_fee', l.total_fee,
                'start_date', l.start_date,
                'end_date', l.end_date
            ) AS details
        FROM loans l
        WHERE l.status NOT LIKE '已取消%'

        UNION ALL

        -- 裝備應還 (應還日錨點，標示 應還: 器材)
        SELECT
            l.id || '_return' AS item_id,
            'loan_return' AS source_type,
            '應還: ' || COALESCE(l.name, '隊員') AS title,
            COALESCE(l.purpose, '裝備應還') AS sub_text,
            (l.end_date::text || ' 00:00:00+08')::timestamptz AS start_time,
            (l.end_date::text || ' 23:59:59+08')::timestamptz AS end_time,
            FALSE AS is_macro,
            l.status AS status_badge,
            '/admin-web/loans' AS link_path,
            jsonb_build_object(
                'loan_id', l.id,
                'name', l.name,
                'items', l.items,
                'purpose', l.purpose,
                'status', l.status,
                'payment_status', l.payment_status,
                'total_fee', l.total_fee,
                'start_date', l.start_date,
                'end_date', l.end_date
            ) AS details
        FROM loans l
        WHERE l.status NOT LIKE '已取消%'

        UNION ALL

        -- 外部日曆事件 (社團行事曆與學校校曆)
        SELECT
            ext.id AS item_id,
            CASE 
                WHEN ext.calendar_type = 'school' THEN 'school' 
                ELSE 'club_calendar' 
            END AS source_type,
            ext.title AS title,
            COALESCE(ext.location, ext.description, '') AS sub_text,
            ext.start_time AS start_time,
            ext.end_time AS end_time,
            TRUE AS is_macro,
            CASE 
                WHEN ext.calendar_type = 'school' THEN '校曆' 
                ELSE '日曆' 
            END AS status_badge,
            '/admin-web/schedule' AS link_path,
            jsonb_build_object(
                'calendar_id', ext.id,
                'calendar_type', ext.calendar_type,
                'title', ext.title,
                'description', ext.description,
                'location', ext.location,
                'is_all_day', ext.is_all_day
            ) AS details
        FROM public.external_calendar_events ext
    )
    SELECT
        a.item_id,
        a.source_type,
        a.title,
        a.sub_text,
        a.start_time,
        a.end_time,
        a.is_macro,
        a.status_badge,
        a.link_path,
        a.details
    FROM all_items a
    WHERE
        -- 分類篩選
        (
            p_category IS NULL 
            OR p_category = '' 
            OR p_category = 'all'
            OR (p_category = 'events' AND a.source_type IN ('event', 'deadline'))
            OR (p_category = 'school' AND a.source_type = 'school')
            OR (p_category = 'finance' AND a.source_type = 'finance')
            OR (p_category = 'loans' AND a.source_type IN ('loan_pickup', 'loan_return'))
            OR (p_category = 'club_calendar' AND a.source_type = 'club_calendar')
            OR (p_category = a.source_type)
        )
        -- 時間範圍篩選 (支援交集覆蓋)
        AND (p_start_time IS NULL OR a.end_time >= p_start_time)
        AND (p_end_time IS NULL OR a.start_time <= p_end_time)
        -- 關鍵字模糊比對
        AND (
            p_query_text IS NULL 
            OR trim(p_query_text) = ''
            OR a.title ILIKE '%' || trim(p_query_text) || '%'
            OR a.sub_text ILIKE '%' || trim(p_query_text) || '%'
            OR a.status_badge ILIKE '%' || trim(p_query_text) || '%'
            OR a.details::text ILIKE '%' || trim(p_query_text) || '%'
        )
    ORDER BY a.start_time ASC, a.is_macro DESC, a.item_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_schedule_feed(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;


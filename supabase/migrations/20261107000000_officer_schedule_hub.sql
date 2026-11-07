-- ==============================================================================
-- Migration: 20261107000000_officer_schedule_hub.sql
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- 幹部後台社務日程 (Calendar & Activity Hub) 快取表與聚合 RPC
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 外部日曆快取表 (external_calendar_events)
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

-- ------------------------------------------------------------------------------
-- 2. RLS 安全存取策略
-- ------------------------------------------------------------------------------
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
-- 3. 幹部端 RPC：社務日程聚合查詢 (get_schedule_feed)
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
            (e.end_date::text || ' 23:59:59+08')::timestamptz AS end_time,
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

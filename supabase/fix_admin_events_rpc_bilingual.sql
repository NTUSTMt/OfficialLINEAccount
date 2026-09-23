-- ==============================================================================
-- 幹部端活動清單雙語欄位修復 (get_admin_events_rpc)
-- 確保幹部後台活動清單與編輯表單能正確讀取 title_en, summary_en, itinerary_en
-- ==============================================================================

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

    -- 聚合活動與報名人數統計 (包含 line_group_url 與雙語英文欄位)
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
            'status', COALESCE(e.status, '關閉'),
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

GRANT EXECUTE ON FUNCTION get_admin_events_rpc(TEXT) TO anon, authenticated, service_role;

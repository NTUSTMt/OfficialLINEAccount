-- ==============================================================================
-- 國立臺灣科技大學登山社 - 活動心得共享與全螢幕心得牆 RPC
-- ==============================================================================

ALTER TABLE reflections ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_reflections_event_public ON reflections (event_id, is_public);

-- 1. 更新 save_reflection_rpc 支援 is_public 與 authorName
CREATE OR REPLACE FUNCTION public.save_reflection_rpc(p_line_user_id text, p_details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        RAISE EXCEPTION '缺少必要的 line_user_id 參數';
    END IF;

    v_event_id := p_details->>'eventId';
    IF v_event_id IS NULL OR trim(v_event_id) = '' THEN
        RAISE EXCEPTION '缺少必要的 eventId 參數';
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
$function$;

-- 2. 新增 get_event_public_reflections_rpc 供全螢幕心得牆查詢
CREATE OR REPLACE FUNCTION public.get_event_public_reflections_rpc(p_event_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_results JSONB;
BEGIN
    IF p_event_id IS NULL OR trim(p_event_id) = '' THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(r_item), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'id', r.id,
            'eventId', r.event_id,
            'lineUserId', r.line_user_id,
            'authorName', COALESCE(NULLIF(r.name, ''), m.name, '登山山友'),
            'difficulty', r.difficulty_rating,
            'beauty', r.beauty_rating,
            'content', r.content,
            'photoUrls', r.photo_urls,
            'imageUrl', CASE 
                WHEN jsonb_array_length(r.photo_urls) > 0 THEN r.photo_urls->>0 
                ELSE NULL 
            END,
            'isPublic', r.is_public,
            'createdAt', to_char(r.created_at, 'YYYY/MM/DD')
        ) AS r_item
        FROM reflections r
        LEFT JOIN members m ON r.line_user_id = m.line_user_id
        WHERE r.event_id = p_event_id
          AND COALESCE(r.is_public, TRUE) = TRUE
        ORDER BY r.created_at DESC
    ) t;

    RETURN v_results;
END;
$function$;

GRANT EXECUTE ON FUNCTION save_reflection_rpc(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_event_public_reflections_rpc(TEXT) TO anon, authenticated, service_role;

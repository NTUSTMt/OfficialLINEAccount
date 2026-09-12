-- ==============================================================================
-- 野境戶外系統：歷史紀錄 (History.tsx) 與 活動成就牆 (Achievements.tsx) 安全 RPC 函式
-- 目的：
-- 1. get_my_payment_history: 50ms 內聚合本人繳費紀錄、自動分類與累計已核銷總金額
-- 2. get_my_achievements: 50ms 內聚合本人已結束之出隊歷史與心得評價
-- 3. save_reflection_rpc: 原子性安全 UPSERT 心得與評分至 reflections 表
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 取得個人歷史繳費紀錄 RPC (get_my_payment_history)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_payment_history(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_history JSONB := '[]'::jsonb;
    v_total_spent INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'totalSpent', 0,
            'history', '[]'::jsonb
        );
    END IF;

    -- 1. 自癒修復舊資料中 amount 為 0 的 payments 紀錄
    -- A. 純社費修復 (Membership Fee, 預設 200)
    UPDATE payments
    SET amount = 200, updated_at = NOW()
    WHERE line_user_id = p_line_user_id
      AND (amount IS NULL OR amount = 0)
      AND (type ILIKE '%社費%' OR type ILIKE '%社籍%' OR type ILIKE '%Membership%')
      AND type NOT ILIKE '%活動%' AND type NOT ILIKE '%裝備%';

    -- B. 活動費用修復 (從 events 表提取費用)
    UPDATE payments p
    SET amount = COALESCE((
        SELECT e.fee 
        FROM events e 
        WHERE (p.type ILIKE '%' || e.title || '%' OR p.type ILIKE '%' || e.id || '%')
          AND e.fee > 0
        LIMIT 1
    ), 0),
    updated_at = NOW()
    WHERE p.line_user_id = p_line_user_id
      AND (p.amount IS NULL OR p.amount = 0)
      AND p.type ILIKE '%活動%'
      AND p.type NOT ILIKE '%裝備%';

    -- C. 裝備租借費用 (從 loans 及 loan_items 提取)
    UPDATE payments p
    SET amount = COALESCE((
        SELECT l.total_rent 
        FROM loans l 
        WHERE l.line_user_id = p_line_user_id
          AND l.total_rent > 0
          AND (
            p.type ILIKE '%' || l.id || '%' 
            OR EXISTS (
                SELECT 1 FROM loan_items li 
                JOIN equipments eq ON li.equipment_id = eq.id 
                WHERE li.loan_id = l.id AND p.type ILIKE '%' || eq.name || '%'
            )
          )
        ORDER BY l.created_at DESC
        LIMIT 1
    ), 0),
    updated_at = NOW()
    WHERE p.line_user_id = p_line_user_id
      AND (p.amount IS NULL OR p.amount = 0)
      AND p.type ILIKE '%裝備%'
      AND p.type NOT ILIKE '%活動%';

    -- D. 複合申報項目 (活動 + 裝備 或 + 社費)
    UPDATE payments p
    SET amount = (
        COALESCE(CASE WHEN (p.type ILIKE '%社費%' OR p.type ILIKE '%社籍%' OR p.type ILIKE '%Membership%') THEN 200 ELSE 0 END, 0) +
        COALESCE((
            SELECT SUM(e.fee) 
            FROM events e 
            WHERE (p.type ILIKE '%' || e.title || '%' OR p.type ILIKE '%' || e.id || '%')
              AND e.fee > 0
        ), 0) +
        COALESCE((
            SELECT SUM(l.total_rent) 
            FROM loans l 
            WHERE l.line_user_id = p_line_user_id
              AND l.total_rent > 0
              AND (
                p.type ILIKE '%' || l.id || '%' 
                OR EXISTS (
                    SELECT 1 FROM loan_items li 
                    JOIN equipments eq ON li.equipment_id = eq.id 
                    WHERE li.loan_id = l.id AND p.type ILIKE '%' || eq.name || '%'
                )
              )
        ), 0)
    ),
    updated_at = NOW()
    WHERE p.line_user_id = p_line_user_id
      AND (p.amount IS NULL OR p.amount = 0)
      AND ((p.type ILIKE '%活動%' AND p.type ILIKE '%裝備%') OR (p.type ILIKE '%社費%' AND (p.type ILIKE '%活動%' OR p.type ILIKE '%裝備%')));

    -- 2. 查詢該用戶之所有繳費紀錄並按時間降冪排序
    SELECT 
        COALESCE(jsonb_agg(h), '[]'::jsonb),
        COALESCE(SUM(
            CASE 
                WHEN (status LIKE '%已確認%' OR status LIKE '%已核對%' OR status LIKE '%已繳%' OR status = 'Paid')
                     AND status NOT LIKE '%待確認%' AND status NOT LIKE '%待核對%' AND status NOT LIKE '%Checking%'
                THEN display_amount 
                ELSE 0 
            END
        ), 0)
    INTO v_history, v_total_spent
    FROM (
        SELECT jsonb_build_object(
            'id', id,
            'date', to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'),
            'type', CASE 
                WHEN type ILIKE '%社籍%' OR type ILIKE '%社費%' OR type ILIKE '%Membership%' THEN '社費'
                WHEN type ILIKE '%活動%' OR type ILIKE '%登山%' OR type ILIKE '%act_%' THEN '活動'
                WHEN type ILIKE '%裝備%' OR type ILIKE '%租用%' OR type ILIKE '%eq_%' THEN '裝備'
                ELSE '全部'
            END,
            'title', COALESCE(type, '未命名項目'),
            'amount', display_amount,
            'last5Digits', COALESCE(bank_last5, ''),
            'note', COALESCE(officer_notes, ''),
            'status', COALESCE(status, '待確認 Checking')
        ) AS h,
        display_amount,
        status
        FROM (
            SELECT 
                id,
                created_at,
                type,
                bank_last5,
                officer_notes,
                status,
                COALESCE(amount, 0) AS display_amount
            FROM payments
            WHERE line_user_id = p_line_user_id
        ) sub
        ORDER BY created_at DESC
    ) t;

    RETURN jsonb_build_object(
        'totalSpent', v_total_spent,
        'history', v_history
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. 取得個人活動成就與出隊歷程 RPC (get_my_achievements)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_achievements(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activities JSONB := '[]'::jsonb;
    v_total_attended INTEGER := 0;
    v_reflections_count INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'totalAttended', 0,
            'reflectionsCount', 0,
            'activities', '[]'::jsonb
        );
    END IF;

    -- 查詢已結束且審核為正取的出隊活動
    SELECT 
        COALESCE(jsonb_agg(act), '[]'::jsonb),
        COUNT(*),
        COUNT(reflection_id)
    INTO v_activities, v_total_attended, v_reflections_count
    FROM (
        SELECT 
            jsonb_build_object(
                'eventId', e.id,
                'title', e.title,
                'date', to_char(e.end_date, 'YYYY/MM/DD'),
                'img', COALESCE(e.cover_image_url, 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400'),
                'hasReflected', (r.id IS NOT NULL),
                'reflection', CASE 
                    WHEN r.id IS NOT NULL THEN jsonb_build_object(
                        'difficulty', COALESCE(r.difficulty_rating, 5),
                        'beauty', COALESCE(r.beauty_rating, 5),
                        'content', COALESCE(r.content, ''),
                        'imageUrl', CASE 
                            WHEN jsonb_typeof(r.photo_urls) = 'array' AND jsonb_array_length(r.photo_urls) > 0 
                            THEN r.photo_urls->>0 
                            ELSE '' 
                        END
                    )
                    ELSE NULL 
                END
            ) AS act,
            r.id AS reflection_id
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN reflections r ON r.event_id = e.id AND r.line_user_id = p_line_user_id
        WHERE s.line_user_id = p_line_user_id
          AND (s.status LIKE '%正取%' OR s.status LIKE '%Confirmed%' OR s.status LIKE '%錄取%')
          AND s.status NOT LIKE '%取消%'
          AND e.end_date < CURRENT_DATE
        ORDER BY e.end_date DESC
    ) t;

    RETURN jsonb_build_object(
        'totalAttended', v_total_attended,
        'reflectionsCount', v_reflections_count,
        'activities', v_activities
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 提交活動心得與評分 RPC (save_reflection_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_reflection_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
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

    IF v_image_url != '' THEN
        v_photo_urls := jsonb_build_array(v_image_url);
    ELSE
        v_photo_urls := '[]'::jsonb;
    END IF;

    INSERT INTO reflections (
        event_id,
        line_user_id,
        difficulty_rating,
        beauty_rating,
        content,
        photo_urls,
        updated_at
    ) VALUES (
        v_event_id,
        p_line_user_id,
        v_difficulty,
        v_beauty,
        v_content,
        v_photo_urls,
        NOW()
    )
    ON CONFLICT (event_id, line_user_id)
    DO UPDATE SET
        difficulty_rating = EXCLUDED.difficulty_rating,
        beauty_rating = EXCLUDED.beauty_rating,
        content = EXCLUDED.content,
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
-- 4. 權限設定 (僅開放執行 RPC，不開放底層表直接存取)
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE reflections FROM anon;

GRANT EXECUTE ON FUNCTION get_my_payment_history(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_my_achievements(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_reflection_rpc(TEXT, JSONB) TO anon, authenticated, service_role;

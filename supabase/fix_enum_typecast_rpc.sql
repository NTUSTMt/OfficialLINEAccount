-- ==============================================================================
-- 台科登山社社團系統：修復 ENUM 列舉型別 LIKE / NOT LIKE 運算子錯誤 RPC 總匯修復檔
-- 目的：修復 PostgreSQL ERROR 42883 (operator does not exist: event_signup_status_enum ~~ unknown)
-- 執行方式：將本檔案內容整段貼至 Supabase SQL Editor 執行即可一鍵修復
-- ==============================================================================

-- 1. 個人主頁 Dashboard 極速秒開 RPC 函式 (get_my_dashboard)
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

    -- 2. 查詢該社員所報名的歷史與近期活動 (加上 s.status::text 轉型)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'eventId', e.id,
            'eventName', e.title,
            'date', to_char(e.start_date, 'YYYY/MM/DD') || CASE WHEN e.end_date != e.start_date THEN ' ~ ' || to_char(e.end_date, 'YYYY/MM/DD') ELSE '' END,
            'reviewStatus', s.status,
            'payStatus', CASE 
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN s.status::text LIKE '%待確認%' OR s.status::text LIKE '%Checking%' THEN '待確認 Checking'
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

GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

-- 2. 個人歷史繳費紀錄 RPC (get_my_payment_history)
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

    SELECT 
        COALESCE(jsonb_agg(h), '[]'::jsonb),
        COALESCE(SUM(
            CASE 
                WHEN (status::text LIKE '%已核銷%' OR status::text LIKE '%Confirmed%' OR status::text LIKE '%已確認%' OR status::text LIKE '%已核對%' OR status::text LIKE '%已繳%' OR status::text = 'Paid')
                     AND status::text NOT LIKE '%待確認%' AND status::text NOT LIKE '%待核對%' AND status::text NOT LIKE '%Checking%'
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
            'name', COALESCE(name, ''),
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
                name,
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

GRANT EXECUTE ON FUNCTION get_my_payment_history(TEXT) TO anon, authenticated, service_role;

-- 3. 個人活動成就與出隊歷程 RPC (get_my_achievements)
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

    -- 查詢已結束且審核為正取的出隊活動 (加上 s.status::text 轉型)
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
          AND (s.status::text LIKE '%正取%' OR s.status::text LIKE '%Confirmed%' OR s.status::text LIKE '%錄取%')
          AND s.status::text NOT LIKE '%取消%'
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

GRANT EXECUTE ON FUNCTION get_my_achievements(TEXT) TO anon, authenticated, service_role;

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

    -- 聚合活動與報名人數統計 (加上 s.status::text 轉型)
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
            'driveFolderUrl', COALESCE(e.drive_folder_url, ''),
            'spreadsheetUrl', COALESCE(e.spreadsheet_url, ''),
            'spreadsheetId', COALESCE(e.spreadsheet_id, ''),
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
        GROUP BY e.id, e.title, e.start_date, e.end_date, e.deadline, e.fee, e.status, e.summary, e.itinerary, e.cover_image_url, e.drive_folder_url, e.spreadsheet_url, e.spreadsheet_id
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
            'id', s.id,
            'userId', s.line_user_id,
            'lineUserId', s.line_user_id,
            'name', COALESCE(s.name, m.name, '未知報名者'),
            'gender', COALESCE(m.gender, ''),
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
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                WHEN s.status::text LIKE '%待確認%' OR s.status::text LIKE '%Checking%' THEN '待確認 Checking'
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

GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO anon, authenticated, service_role;

-- 6. 查詢待繳項目 RPC (get_unpaid_items_rpc)
CREATE OR REPLACE FUNCTION get_unpaid_items_rpc(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_is_expired BOOLEAN := FALSE;
    v_is_unpaid BOOLEAN := FALSE;
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_is_official BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    -- 1. 檢查社費狀態
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;

    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;

        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;

        -- 只要不是有效正式社員（尚未入社或社籍已過期），且目前無待審核社費單，即提供繳社交費選項
        IF NOT v_is_official THEN
            IF (v_member.payment_status IS NULL OR (
                v_member.payment_status::text NOT LIKE '%待確認%' 
                AND v_member.payment_status::text NOT LIKE '%Checking%'
            )) THEN
                v_membership := jsonb_build_array(
                    jsonb_build_object(
                        'id', 'fee_membership',
                        'name', '社籍與社費 (Membership Fee)',
                        'amount', 200
                    )
                );
            END IF;
        END IF;
    ELSE
        -- members 表中尚無該使用者，肯定非社員，提供繳社交費選項
        v_membership := jsonb_build_array(
            jsonb_build_object(
                'id', 'fee_membership',
                'name', '社籍與社費 (Membership Fee)',
                'amount', 200
            )
        );
    END IF;

    -- 2. 查詢正取活動欠款 (從 event_signups 與 events 關聯)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', 'act_' || e.id,
            'name', '活動：' || e.title,
            'amount', COALESCE(e.fee, 0)
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
          AND (s.status::text LIKE '%正取%' OR s.status::text LIKE '%Confirmed%')
          AND s.status::text NOT LIKE '%取消%'
          AND (s.payment_status IS NULL OR (
              s.payment_status::text NOT LIKE '%已繳費%' 
              AND s.payment_status::text NOT LIKE '%Paid%'
              AND s.payment_status::text NOT LIKE '%待確認%'
              AND s.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY e.start_date ASC
    ) t;

    -- 3. 查詢裝備租借欠款 (從 loans 與 loan_items、equipments 關聯)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', COALESCE(eq_sub.name, '裝備租借'),
            'amount', CASE 
                WHEN li.subtotal IS NOT NULL AND li.subtotal > 0 THEN li.subtotal
                ELSE COALESCE(l.total_rent, 0)
            END,
            'orderId', l.id,
            'qty', COALESCE(li.quantity, 1),
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD'),
            'purpose', COALESCE(l.purpose, '個人使用'),
            'isOfficial', CASE WHEN v_is_official THEN '是' ELSE '否' END
        ) AS eq
        FROM loans l
        LEFT JOIN loan_items li ON l.id = li.loan_id
        LEFT JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
        WHERE l.line_user_id = p_line_user_id
          AND l.status::text NOT LIKE '%取消%'
          AND l.status::text NOT LIKE '%歸還%'
          AND (l.payment_status IS NULL OR (
              l.payment_status::text NOT LIKE '%已繳費%' 
              AND l.payment_status::text NOT LIKE '%Paid%'
              AND l.payment_status::text NOT LIKE '%待確認%'
              AND l.payment_status::text NOT LIKE '%Checking%'
          ))
        ORDER BY l.start_date ASC
    ) t;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_unpaid_items_rpc(TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 7. 建立 event_signup_status_enum 全域隱式轉型 (IMPLICIT CAST)
-- 徹底根治：column "status" is of type event_signup_status_enum but expression is of type text
-- ==============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_signup_status_enum') THEN
        CREATE OR REPLACE FUNCTION text_to_event_signup_status_enum(val text)
        RETURNS event_signup_status_enum AS $cast$
        BEGIN
            IF val LIKE '%正取（已繳費）%' OR val LIKE '%Confirmed (Paid)%' THEN
                RETURN '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
            ELSIF val LIKE '%備取（有意願）%' OR val LIKE '%Waitlisted (Interested)%' THEN
                RETURN '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
            ELSIF val LIKE '%正取%' OR val LIKE '%Confirmed%' THEN
                RETURN '正取 Confirmed'::event_signup_status_enum;
            ELSIF val LIKE '%備取%' OR val LIKE '%Waitlisted%' THEN
                RETURN '備取 Waitlisted'::event_signup_status_enum;
            ELSIF val LIKE '%取消%' OR val LIKE '%Cancelled%' THEN
                RETURN '已取消 Cancelled'::event_signup_status_enum;
            ELSE
                RETURN '審核中 Checking'::event_signup_status_enum;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RETURN '審核中 Checking'::event_signup_status_enum;
        END;
        $cast$ LANGUAGE plpgsql IMMUTABLE;

        DROP CAST IF EXISTS (text AS event_signup_status_enum);
        CREATE CAST (text AS event_signup_status_enum)
        WITH FUNCTION text_to_event_signup_status_enum(text) AS IMPLICIT;
    END IF;
END $$;

-- ==============================================================================
-- 8. 取得個人待繳清單 RPC (get_unpaid_payments) - 前端主要呼叫接口
-- 支援過期社員與非正式社員強制提供社費選項，裝備享 5 折
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_unpaid_payments(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_member members%ROWTYPE;
    v_is_official BOOLEAN := FALSE;
    v_is_expired BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    -- 1. 查詢社員基本資料與社籍狀態
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;
    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;

        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;

        -- 只要不是有效正式社員（尚未入社或社籍已過期），自動提供繳社交費選項
        IF NOT v_is_official THEN
            v_membership := jsonb_build_array(
                jsonb_build_object(
                    'id', 'fee_membership',
                    'name', '社籍與社費 (Membership Fee)',
                    'amount', 200
                )
            );
        END IF;
    ELSE
        -- members 表中尚無該使用者，肯定非社員，提供繳社交費選項
        v_membership := jsonb_build_array(
            jsonb_build_object(
                'id', 'fee_membership',
                'name', '社籍與社費 (Membership Fee)',
                'amount', 200
            )
        );
    END IF;

    -- 2. 查詢正取活動欠款 (從 event_signups 與 events 關聯)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', 'act_' || e.id,
            'name', e.title,
            'amount', COALESCE(e.fee, 0),
            'eventId', e.id,
            'date', to_char(e.start_date, 'YYYY-MM-DD')
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
          AND s.status::text LIKE '%正取%'
          AND (
              s.payment_status IS NULL 
              OR s.payment_status::text LIKE '%未繳費%'
              OR s.payment_status::text LIKE '%Unpaid%'
              OR (
                  s.payment_status::text NOT LIKE '%已繳費%' 
                  AND s.payment_status::text NOT LIKE '%待確認%' 
                  AND s.payment_status::text NOT LIKE '%Checking%'
                  AND s.payment_status::text != '已繳費 Paid'
                  AND s.payment_status::text != 'Paid'
              )
          )
        ORDER BY e.start_date ASC
    ) t;

    -- 3. 查詢裝備租借欠款 (從 loans 與 loan_items 關聯)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', COALESCE(eq_sub.name, '裝備租借'),
            'amount', CASE 
                WHEN li.subtotal IS NOT NULL AND li.subtotal > 0 THEN li.subtotal
                ELSE COALESCE(l.total_rent, 0)
            END,
            'orderId', l.id,
            'qty', COALESCE(li.quantity, 1),
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD'),
            'purpose', COALESCE(l.purpose, '個人使用'),
            'isOfficial', CASE WHEN v_is_official THEN '是' ELSE '否' END
        ) AS eq
        FROM loans l
        LEFT JOIN loan_items li ON l.id = li.loan_id
        LEFT JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
        WHERE l.line_user_id = p_line_user_id
          AND l.status::text NOT LIKE '%取消%'
          AND l.status::text NOT LIKE '%歸還%'
          AND (
              l.payment_status IS NULL 
              OR l.payment_status::text LIKE '%未繳費%'
              OR l.payment_status::text LIKE '%Unpaid%'
              OR (
                  l.payment_status::text NOT LIKE '%已繳費%' 
                  AND l.payment_status::text NOT LIKE '%Paid%'
                  AND l.payment_status::text NOT LIKE '%待確認%'
                  AND l.payment_status::text NOT LIKE '%Checking%'
                  AND l.payment_status::text != '已繳費 Paid'
                  AND l.payment_status::text != 'Paid'
              )
          )
        ORDER BY l.start_date ASC
    ) t;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_unpaid_payments(TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 9. 審核個別社員報名狀態 RPC (update_signup_status_rpc)
-- 包含：安全轉型為 event_signup_status_enum，徹底杜絕型別錯誤
-- ==============================================================================
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
    WHERE id = trim(p_signup_id);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到該筆報名紀錄 (' || trim(p_signup_id) || ')');
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

GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ==============================================================================
-- 台科登山社社團系統 (NTUST Mountaineering Club System)
-- 一鍵修復：個人主頁審核/繳費狀態分離、裝備繳費標籤與移除 RPC 多餘 sync_queue 寫入
-- 檔案：supabase/fix_dashboard_and_sync_rpc.sql
-- 說明：請至 Supabase 控制台 > SQL Editor 貼上執行此腳本即可一鍵完成修復
-- ==============================================================================

-- 1. 確保 event_signup_status_enum 與 payment_status_enum 列舉型別完整存在與全域隱式轉換
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_signup_status_enum') THEN
        CREATE TYPE event_signup_status_enum AS ENUM (
            '正取 Confirmed',
            '正取（已繳費）Confirmed (Paid)',
            '備取 Waitlisted',
            '備取（有意願）Waitlisted (Interested)',
            '審核中 Checking',
            '已取消 Cancelled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
            '已繳費 Paid',
            '待確認 Checking',
            '未繳費 Unpaid'
        );
    END IF;
END $$;

-- 1.1 event_signup_status_enum 隱式轉換
CREATE OR REPLACE FUNCTION text_to_event_signup_status_enum(val text)
RETURNS event_signup_status_enum AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' THEN
        RETURN '審核中 Checking'::event_signup_status_enum;
    END IF;

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

-- 1.2 payment_status_enum 隱式轉換 (徹底防禦空字串與未知字串轉型報錯)
CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val text)
RETURNS payment_status_enum AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' THEN
        RETURN '未繳費 Unpaid'::payment_status_enum;
    ELSIF val LIKE '%已繳費%' OR val = 'Paid' OR val LIKE '%已繳費 Paid%' THEN
        RETURN '已繳費 Paid'::payment_status_enum;
    ELSIF val LIKE '%待確認%' OR val LIKE '%Checking%' THEN
        RETURN '待確認 Checking'::payment_status_enum;
    ELSE
        RETURN '未繳費 Unpaid'::payment_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '未繳費 Unpaid'::payment_status_enum;
END;
$cast$ LANGUAGE plpgsql IMMUTABLE;

DROP CAST IF EXISTS (text AS payment_status_enum);
CREATE CAST (text AS payment_status_enum)
WITH FUNCTION text_to_payment_status_enum(text) AS IMPLICIT;

-- 2. 重建個人主頁 RPC 函式 (get_my_dashboard)
-- 修正：活動繳費狀態由 event_signups.payment_status 獨立判定，杜絕「審核中 Checking」誤判為「待確認」
-- 新增：裝備租借輸出 payStatus，呈現租借款項繳費狀態
-- 核心修復：嚴格使用 payment_status::text 轉型，絕不將空字串直接作為 enum 傳入 COALESCE
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

    -- 2. 查詢該社員所報名的歷史與近期活動 (直接讀取 s.payment_status 判定繳費狀態)
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
            'code', s.id
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
        ORDER BY e.start_date DESC
    ) t;

    -- 3. 查詢該社員的所有裝備租借紀錄 (包含 payStatus 繳費狀態)
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

    -- 組合回傳前端 DashboardData 結構
    RETURN jsonb_build_object(
        'profile', v_profile,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_dashboard(TEXT) TO anon, authenticated, service_role;

-- 3. 重建 update_signup_status_rpc
-- 修正：移除手動 insert sync_queue，徹底交由 trg_sync_signups 觸發器自動且標準化寫入完整欄位
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
    -- 幹部鑑權檢查
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法審核');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼 (Missing Signup Code)');
    END IF;

    -- 安全轉型為 enum
    v_status_text := trim(COALESCE(p_review_result, ''));
    v_status_val := text_to_event_signup_status_enum(v_status_text);

    -- 更新 event_signups 表 (觸發 trg_sync_signups 自動排入完整規格 sync_queue)
    UPDATE event_signups
    SET status = v_status_val,
        updated_at = NOW()
    WHERE id = trim(p_signup_id);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到該筆報名紀錄 (' || trim(p_signup_id) || ')');
    END IF;

    RETURN jsonb_build_object('status', 'success');
END;
$$;

GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

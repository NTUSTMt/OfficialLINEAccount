-- ==============================================================================
-- 台科登山社社團系統 (NTUST Mountaineering Club System)
-- 修復審核狀態 Enum 型別相容性與 RPC 函式 (Fix Signup Status Enum & RPC)
-- 檔案：supabase/fix_signup_status_enum.sql
-- 說明：請至 Supabase 控制台 > SQL Editor 直接執行此腳本即可一鍵完成修復
-- ==============================================================================

-- 1. 確保 event_signup_status_enum 列舉型別完整存在
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
END $$;

-- 2. 建立從 text 到 event_signup_status_enum 之全域隱式轉換 (IMPLICIT CAST)
-- 徹底根治：column "status" is of type event_signup_status_enum but expression is of type text
CREATE OR REPLACE FUNCTION text_to_event_signup_status_enum(val text)
RETURNS event_signup_status_enum AS $cast$
BEGIN
    IF val IS NULL THEN
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

-- 3. 重新建立 update_signup_status_rpc，確保明確型別賦值與錯誤透明化
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
    -- 鑑權檢查
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', '權限不足，非幹部無法審核');
    END IF;

    IF p_signup_id IS NULL OR trim(p_signup_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少報名專屬碼 (Missing Signup Code)');
    END IF;

    -- 安全對應列舉值
    v_status_text := trim(COALESCE(p_review_result, ''));
    v_status_val := text_to_event_signup_status_enum(v_status_text);

    -- 更新 event_signups 表 (嚴格帶入 enum 型別)
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
            'eventId', trim(COALESCE(p_event_id, '')),
            'signupId', trim(p_signup_id),
            'reviewResult', v_status_val::text,
            'updatedBy', trim(p_officer_line_user_id)
        )
    );

    RETURN jsonb_build_object('status', 'success');
END;
$$;

-- 4. 授權 RPC 執行權限
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

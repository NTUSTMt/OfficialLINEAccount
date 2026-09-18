-- ==============================================================================
-- 台科登山社社團系統：修復 sync_queue RLS 阻斷問題 (Fix sync_queue RLS Policy)
-- 版本：v0.1.157 (2026-09-18)
-- 說明：
-- 1. 將 trg_fn_enqueue_sync 觸發函式宣告為 SECURITY DEFINER 與 SET search_path = public，
--    確保任何透過前端 anon key 觸發之資料異動（如裝備更新、活動登記等）排入 sync_queue 時，
--    皆能以資料庫定義者權限順利寫入，徹底根絕 PostgreSQL 42501 (RLS policy violation) 錯誤。
-- 2. 針對 sync_queue 資料表補充 INSERT RLS 策略作為雙重防護。
-- ==============================================================================

-- 1. 修正 trg_fn_enqueue_sync 觸發函式
CREATE OR REPLACE FUNCTION trg_fn_enqueue_sync()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec_id TEXT;
    target_payload JSONB;
    act TEXT;
BEGIN
    -- 防遞迴守衛
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        act := 'DELETE';
        target_payload := to_jsonb(OLD);
    ELSE
        act := TG_OP; -- 'INSERT' 或 'UPDATE'
        target_payload := to_jsonb(NEW);
    END IF;

    -- 根據不同資料表自動抓取代表性主鍵
    IF (TG_TABLE_NAME = 'members') THEN
        rec_id := COALESCE(target_payload->>'line_user_id', '');
    ELSIF (TG_TABLE_NAME = 'events' OR TG_TABLE_NAME = 'equipments' OR TG_TABLE_NAME = 'loans' OR TG_TABLE_NAME = 'payments' OR TG_TABLE_NAME = 'event_signups') THEN
        rec_id := COALESCE(target_payload->>'id', '');
    ELSIF (TG_TABLE_NAME = 'reflections') THEN
        rec_id := COALESCE(target_payload->>'event_id', '') || '_' || COALESCE(target_payload->>'line_user_id', '');
    ELSE
        rec_id := COALESCE(target_payload->>'id', 'unknown');
    END IF;

    -- 寫入 sync_queue 佇列 (由 GAS 定時排程或 Webhook 批次取走並寫入 Google Sheets)
    INSERT INTO sync_queue (table_name, action, record_id, payload, status)
    VALUES (TG_TABLE_NAME, act, rec_id, target_payload, 'pending');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 為 sync_queue 補充 INSERT 政策，確保系統觸發與業務寫入不受阻
DROP POLICY IF EXISTS "Allow insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow insert to sync_queue" ON sync_queue
    FOR INSERT WITH CHECK (true);

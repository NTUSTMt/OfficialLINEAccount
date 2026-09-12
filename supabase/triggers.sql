-- ==============================================================================
-- 野境戶外裝備租借系統 (Wilderness Gear Rental Store)
-- Supabase 自動寫入 sync_queue 觸發器 (Triggers for Background Sync)
-- 版本：v0.1.45 (2026-09-12)
-- ==============================================================================

-- 1. 通用背景同步觸發函式
CREATE OR REPLACE FUNCTION trg_fn_enqueue_sync()
RETURNS TRIGGER AS $$
DECLARE
    rec_id TEXT;
    target_payload JSONB;
    act TEXT;
BEGIN
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

-- 2. 為 7 大核心資料表綁定自動佇列觸發器
DROP TRIGGER IF EXISTS trg_sync_members ON members;
CREATE TRIGGER trg_sync_members
AFTER INSERT OR UPDATE OR DELETE ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_events ON events;
CREATE TRIGGER trg_sync_events
AFTER INSERT OR UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_signups ON event_signups;
CREATE TRIGGER trg_sync_signups
AFTER INSERT OR UPDATE OR DELETE ON event_signups
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_reflections ON reflections;
CREATE TRIGGER trg_sync_reflections
AFTER INSERT OR UPDATE OR DELETE ON reflections
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_equipments ON equipments;
CREATE TRIGGER trg_sync_equipments
AFTER INSERT OR UPDATE OR DELETE ON equipments
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_loans ON loans;
CREATE TRIGGER trg_sync_loans
AFTER INSERT OR UPDATE OR DELETE ON loans
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

DROP TRIGGER IF EXISTS trg_sync_payments ON payments;
CREATE TRIGGER trg_sync_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_sync();

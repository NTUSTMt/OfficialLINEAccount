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

-- ------------------------------------------------------------------------------
-- 3. 社員姓名自動帶入觸發器 (Auto-fill Member Name on Insert/Update)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_auto_fill_member_name()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
        SELECT name INTO NEW.name FROM members WHERE line_user_id = NEW.line_user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_name_payments ON payments;
CREATE TRIGGER trg_auto_name_payments
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_loans ON loans;
CREATE TRIGGER trg_auto_name_loans
BEFORE INSERT OR UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_signups ON event_signups;
CREATE TRIGGER trg_auto_name_signups
BEFORE INSERT OR UPDATE ON event_signups
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

DROP TRIGGER IF EXISTS trg_auto_name_reflections ON reflections;
CREATE TRIGGER trg_auto_name_reflections
BEFORE INSERT OR UPDATE ON reflections
FOR EACH ROW EXECUTE FUNCTION trg_fn_auto_fill_member_name();

-- ------------------------------------------------------------------------------
-- 4. 社員更名連動更新子資料表觸發器 (Cascade Update Member Name)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_sync_member_name_to_children()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE payments SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE loans SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE event_signups SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
        UPDATE reflections SET name = NEW.name WHERE line_user_id = NEW.line_user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_member_name ON members;
CREATE TRIGGER trg_sync_member_name
AFTER UPDATE OF name ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_member_name_to_children();


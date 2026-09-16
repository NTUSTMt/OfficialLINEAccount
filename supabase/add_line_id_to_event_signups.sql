-- ==============================================================================
-- 台科登山社資料庫遷移：event_signups 新增 line_id 欄位並自動綁定 members.line_id
-- ==============================================================================

-- 1. 在 event_signups 新增 line_id 欄位 (自訂 LINE ID)
ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS line_id TEXT;

-- 2. 歷史資料回填：自 members 自動補齊現有報名之 line_id
UPDATE event_signups s 
SET line_id = m.line_id 
FROM members m 
WHERE s.line_user_id = m.line_user_id 
  AND (s.line_id IS NULL OR s.line_id = '')
  AND m.line_id IS NOT NULL;

-- 3. 觸發器一：新報名寫入時，若 line_id 為空則自動從 members 繼承 (含防遞迴守衛)
CREATE OR REPLACE FUNCTION trg_fn_sync_signup_line_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 嚴格防遞迴守衛
    IF pg_trigger_depth() > 1 THEN 
        RETURN NEW; 
    END IF;

    -- 若 line_id 為空，自動由 members 查詢補齊
    IF (NEW.line_id IS NULL OR trim(NEW.line_id) = '') AND NEW.line_user_id IS NOT NULL THEN
        SELECT line_id INTO NEW.line_id 
        FROM members 
        WHERE line_user_id = trim(NEW.line_user_id) 
        LIMIT 1;
    END IF;

    -- 若姓名 name 為空，亦自動由 members 補齊
    IF (NEW.name IS NULL OR trim(NEW.name) = '') AND NEW.line_user_id IS NOT NULL THEN
        SELECT name INTO NEW.name 
        FROM members 
        WHERE line_user_id = trim(NEW.line_user_id) 
        LIMIT 1;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_signup_sync_member_info ON event_signups;
CREATE TRIGGER trg_signup_sync_member_info
BEFORE INSERT OR UPDATE OF line_user_id ON event_signups
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_signup_line_id();

-- 4. 觸發器二：當 members 之 line_id 或 name 變更時，自動聯動更新該社員所有報名資料 (含防遞迴守衛)
CREATE OR REPLACE FUNCTION trg_fn_update_signups_on_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 嚴格防遞迴守衛
    IF pg_trigger_depth() > 1 THEN 
        RETURN NEW; 
    END IF;

    IF (NEW.line_id IS DISTINCT FROM OLD.line_id) OR (NEW.name IS DISTINCT FROM OLD.name) THEN
        UPDATE event_signups
        SET line_id = COALESCE(NEW.line_id, event_signups.line_id),
            name = COALESCE(NEW.name, event_signups.name)
        WHERE line_user_id = NEW.line_user_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_sync_to_signups ON members;
CREATE TRIGGER trg_member_sync_to_signups
AFTER UPDATE OF line_id, name ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_update_signups_on_member_change();

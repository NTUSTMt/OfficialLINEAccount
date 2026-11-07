-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 06 - 系統佇列、日誌、防遞迴觸發器與排程 (06_system_and_queues.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 系統動態組態設定表 (app_config)
-- 儲存 ADMIN_GROUP_ID、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 等執行期狀態
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_app_config_updated_at ON app_config;
CREATE TRIGGER trg_app_config_updated_at
BEFORE UPDATE ON app_config
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. LINE Webhook 冪等去重表 (webhook_events)
-- 防止 LINE Webhook 重試機制造成之重複處理
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    webhook_event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at DESC);

-- ------------------------------------------------------------------------------
-- 3. GAS Worker 非同步失敗重試記錄表 (worker_failures)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS worker_failures (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_worker_failures_updated_at ON worker_failures;
CREATE TRIGGER trg_worker_failures_updated_at
BEFORE UPDATE ON worker_failures
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Google Sheets 背景同步佇列表 (sync_queue)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_queue (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    action TEXT NOT NULL,                                -- INSERT / UPDATE / DELETE
    record_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',              -- pending / processing / completed / failed
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);

-- ------------------------------------------------------------------------------
-- 5. 幹部社務彙整推播佇列表 (admin_notification_digest_queue)
-- 解決 LINE 官方帳號群組推播免費則數耗盡問題之彙整機制
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_notification_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,                              -- loan_created / loan_cancelled / event_cancelled / officer_intent / patrol_report
    title TEXT NOT NULL,
    summary TEXT,
    bubble_payload JSONB NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_digest_queue_unsent 
ON admin_notification_digest_queue (is_sent, created_at ASC)
WHERE is_sent = FALSE;

-- ------------------------------------------------------------------------------
-- 6. 操作與安全稽核日誌表 (audit_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. 通用背景同步觸發函式 (trg_fn_enqueue_sync)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
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
    -- 專案規範防遞迴守衛：杜絕 stack depth limit exceeded
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

    IF (TG_TABLE_NAME = 'members') THEN
        rec_id := COALESCE(target_payload->>'line_user_id', '');
    ELSIF (TG_TABLE_NAME = 'events' OR TG_TABLE_NAME = 'equipments' OR TG_TABLE_NAME = 'loans' OR TG_TABLE_NAME = 'payments' OR TG_TABLE_NAME = 'event_signups') THEN
        rec_id := COALESCE(target_payload->>'id', '');
    ELSIF (TG_TABLE_NAME = 'reflections') THEN
        rec_id := COALESCE(target_payload->>'event_id', '') || '_' || COALESCE(target_payload->>'line_user_id', '');
    ELSE
        rec_id := COALESCE(target_payload->>'id', 'unknown');
    END IF;

    INSERT INTO sync_queue (table_name, action, record_id, payload, status)
    VALUES (TG_TABLE_NAME, act, rec_id, target_payload, 'pending');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- 8. 社員姓名自動帶入觸發函式 (trg_fn_auto_fill_member_name)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_auto_fill_member_name()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

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
-- 9. 社員更名連動更新子資料表觸發函式 (trg_fn_sync_member_name_to_children)
-- 嚴格遵照專案規範：資料庫 Trigger 必設防遞迴守衛
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_sync_member_name_to_children()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

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

-- ------------------------------------------------------------------------------
-- 10. 定時排程函式：daily-patrol 自動巡檢 (invoke_daily_patrol)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoke_daily_patrol()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_supabase_url FROM app_config WHERE key = 'SUPABASE_URL';
  SELECT value INTO v_service_role_key FROM app_config WHERE key = 'SUPABASE_SERVICE_ROLE_KEY';

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://bvyyuobmizfrosbgcqbu.supabase.co';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/daily-patrol',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
      ),
      body := '{"source": "pg_cron"}'::jsonb
    ) INTO v_request_id;

    RAISE NOTICE 'Triggered daily-patrol Edge Function via pg_net (Request ID: %)', v_request_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'invoke_daily_patrol encountered an error: %', SQLERRM;
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. 定時推播排程觸發函式 (invoke_admin_digest)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invoke_admin_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_supabase_url text;
    v_service_role_key text;
    v_request_id bigint;
BEGIN
    SELECT value INTO v_supabase_url FROM app_config WHERE key = 'SUPABASE_URL';
    SELECT value INTO v_service_role_key FROM app_config WHERE key = 'SUPABASE_SERVICE_ROLE_KEY';

    IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
        v_supabase_url := 'https://bvyyuobmizfrosbgcqbu.supabase.co';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        SELECT net.http_post(
            url := v_supabase_url || '/functions/v1/notify-dispatcher',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
            ),
            body := '{"action": "dispatch_admin_digest", "source": "pg_cron"}'::jsonb
        ) INTO v_request_id;

        RAISE NOTICE 'Triggered admin_digest via pg_net (Request ID: %)', v_request_id;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'invoke_admin_digest encountered an error: %', SQLERRM;
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. 系統安全輔助函式：自動啟用所有資料表之 RLS (rls_auto_enable)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    END LOOP;
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notification_digest_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- app_config
DROP POLICY IF EXISTS "Service role full access app_config" ON app_config;
CREATE POLICY "Service role full access app_config" ON app_config
    FOR ALL USING (auth.role() = 'service_role');

-- webhook_events
DROP POLICY IF EXISTS "Service role full access webhook_events" ON webhook_events;
CREATE POLICY "Service role full access webhook_events" ON webhook_events
    FOR ALL USING (auth.role() = 'service_role');

-- worker_failures
DROP POLICY IF EXISTS "Service role full access worker_failures" ON worker_failures;
CREATE POLICY "Service role full access worker_failures" ON worker_failures
    FOR ALL USING (auth.role() = 'service_role');

-- sync_queue
DROP POLICY IF EXISTS "Service role full access sync_queue" ON sync_queue;
CREATE POLICY "Service role full access sync_queue" ON sync_queue
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow insert to sync_queue" ON sync_queue
    FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow authenticated insert to sync_queue" ON sync_queue
    FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

-- admin_notification_digest_queue
DROP POLICY IF EXISTS "Service role full access digest_queue" ON admin_notification_digest_queue;
CREATE POLICY "Service role full access digest_queue" ON admin_notification_digest_queue
    FOR ALL USING (auth.role() = 'service_role');

-- audit_logs
DROP POLICY IF EXISTS "Service role full access audit_logs" ON audit_logs;
CREATE POLICY "Service role full access audit_logs" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated insert audit_logs" ON audit_logs;
CREATE POLICY "Authenticated insert audit_logs" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Officers read audit_logs" ON audit_logs;
CREATE POLICY "Officers read audit_logs" ON audit_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Service role full access audit" ON audit_logs;
CREATE POLICY "Service role full access audit" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated insert audit" ON audit_logs;
CREATE POLICY "Authenticated insert audit" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Officers read audit" ON audit_logs;
CREATE POLICY "Officers read audit" ON audit_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 權限指派
GRANT EXECUTE ON FUNCTION invoke_daily_patrol() TO service_role;
GRANT EXECUTE ON FUNCTION invoke_admin_digest() TO service_role;
GRANT EXECUTE ON FUNCTION rls_auto_enable() TO service_role;

-- ------------------------------------------------------------------------------
-- 10. 回滾備援宣告 (Rollback Statements)
-- ------------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Officers can read all members" ON members;
-- DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
-- DROP TABLE IF EXISTS audit_logs CASCADE;

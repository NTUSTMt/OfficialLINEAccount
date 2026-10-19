-- ==============================================================================
-- 幹部社務彙整佇列資料表與 pg_cron 排程 (admin_notification_digest_queue)
-- 解決 LINE 官方帳號群組推播免費額度快速耗盡問題
-- ==============================================================================

-- 1. 建立幹部彙整佇列資料表
CREATE TABLE IF NOT EXISTS public.admin_notification_digest_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- 'loan_created', 'loan_cancelled', 'event_cancelled', 'officer_intent', 'patrol_report'
    title TEXT NOT NULL,
    summary TEXT,
    bubble_payload JSONB NOT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 建立未發送項目的檢索索引
CREATE INDEX IF NOT EXISTS idx_admin_digest_queue_unsent 
ON public.admin_notification_digest_queue (is_sent, created_at ASC)
WHERE is_sent = FALSE;

-- 3. 啟用 RLS 與存取策略
ALTER TABLE public.admin_notification_digest_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'admin_notification_digest_queue' 
    AND policyname = 'service_role_all_digest_queue'
  ) THEN
    CREATE POLICY service_role_all_digest_queue
    ON public.admin_notification_digest_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 4. 建立調用 notify-dispatcher dispatch_admin_digest 之預存程序
CREATE OR REPLACE FUNCTION invoke_admin_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 5. 設定 pg_cron：每兩天晚上 21:00 台北時間 (UTC 13:00) 執行彙整推播
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('admin_digest_job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'admin_digest_job');

    -- 每兩天 UTC 13:00 (台北時間 21:00) 執行
    PERFORM cron.schedule(
      'admin_digest_job',
      '0 13 */2 * *',
      'SELECT invoke_admin_digest();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule setup notice: %', SQLERRM;
END $$;

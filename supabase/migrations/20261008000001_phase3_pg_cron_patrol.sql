-- ==============================================================================
-- Phase 3: pg_cron 定時巡檢排程與 Edge Function 觸發器
-- ==============================================================================

-- 1. 啟用 pg_cron 與 pg_net 擴充功能（若尚未啟用）
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. 建立調用 daily-patrol Edge Function 之預存程序
CREATE OR REPLACE FUNCTION invoke_daily_patrol()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  -- 嘗試自 app_config 讀取或使用預設環境變數
  SELECT value INTO v_supabase_url FROM app_config WHERE key = 'SUPABASE_URL';
  SELECT value INTO v_service_role_key FROM app_config WHERE key = 'SUPABASE_SERVICE_ROLE_KEY';

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://bvyyuobmizfrosbgcqbu.supabase.co';
  END IF;

  -- 透過 pg_net 發送 HTTP POST 觸發 daily-patrol Edge Function
  SELECT net.http_post(
    url := v_supabase_url || '/functions/v1/daily-patrol',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
    ),
    body := '{"source": "pg_cron"}'::jsonb
  ) INTO v_request_id;

  RAISE NOTICE 'Triggered daily-patrol Edge Function via pg_net (Request ID: %)', v_request_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'invoke_daily_patrol encountered an error: %', SQLERRM;
END;
$$;

-- 3. 設定 pg_cron 每日台北時間 00:00 (UTC 16:00) 執行每日自動巡檢
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 先移除既有同名排程，確保冪等性
    PERFORM cron.unschedule('daily_patrol_job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_patrol_job');

    -- 新增每日 16:00 UTC (00:00 Asia/Taipei) 排程
    PERFORM cron.schedule(
      'daily_patrol_job',
      '0 16 * * *',
      'SELECT invoke_daily_patrol();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule setup notice: %', SQLERRM;
END $$;


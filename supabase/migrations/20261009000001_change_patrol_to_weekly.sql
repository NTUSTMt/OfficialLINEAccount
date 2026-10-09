-- ==============================================================================
-- 調整巡檢排程為每週一 00:00 (Asia/Taipei, UTC 16:00 Sunday)
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 移除每日巡檢舊排程
    PERFORM cron.unschedule('daily_patrol_job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_patrol_job');

    -- 移除已存在的每週巡檢排程（若有）
    PERFORM cron.unschedule('weekly_patrol_job')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly_patrol_job');

    -- 新增每週一 00:00 台北時間 (UTC 16:00 Sunday, cron '0 16 * * 0') 排程
    PERFORM cron.schedule(
      'weekly_patrol_job',
      '0 16 * * 0',
      'SELECT invoke_daily_patrol();'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule setup notice: %', SQLERRM;
END $$;

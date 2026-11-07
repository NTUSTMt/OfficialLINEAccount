// test/148_officer_schedule_hub_migration.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('148. 社務日程資料庫遷移與 RPC 結構檢驗', () => {
  const migrationPath = path.resolve('supabase/migrations/20261107000000_officer_schedule_hub.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 檔案必須存在');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // 1. 外部日曆快取表結構
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.external_calendar_events'), '必須建立 external_calendar_events 表');
  assert.ok(sql.includes('calendar_type TEXT NOT NULL'), '必須包含 calendar_type 欄位');
  assert.ok(sql.includes('idx_ext_cal_start'), '必須建立 start_time 索引');

  // 2. 核心 RPC 函式與安全規範
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION get_schedule_feed'), '必須定義 get_schedule_feed RPC');
  assert.ok(sql.includes('p_officer_line_user_id TEXT'), '必須包含幹部 ID 鑑權參數');
  assert.ok(sql.includes('SECURITY DEFINER'), 'RPC 必須為 SECURITY DEFINER');
  assert.ok(sql.includes('SET search_path = public'), '必須設置 search_path = public 杜絕路徑劫持');
  assert.ok(sql.includes('is_officer(p_officer_line_user_id)'), '必須調用 is_officer 進行權限校驗');

  // 3. 業務資料聚合 (UNION ALL)
  assert.ok(sql.includes("'event' AS source_type"), '必須聚合出隊活動');
  assert.ok(sql.includes("'deadline' AS source_type"), '必須聚合報名截止日');
  assert.ok(sql.includes("'finance' AS source_type"), '必須聚合繳費申報');
  assert.ok(sql.includes("'loan_pickup' AS source_type"), '必須聚合裝備借出');
  assert.ok(sql.includes("'loan_return' AS source_type"), '必須聚合裝備應還');
  assert.ok(sql.includes('details JSONB'), '回傳欄位必須包含 details JSONB');

  // 4. 零 Emoji 規範
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(sql), 'SQL 遷移檔案嚴禁包含任何 Emoji');
});

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('149. 社務日程前端型別與 Client API 檢驗', () => {
  const typesPath = path.resolve('src/types/schedule.ts');
  assert.ok(fs.existsSync(typesPath), 'src/types/schedule.ts 必須存在');
  const typesContent = fs.readFileSync(typesPath, 'utf8');

  // 1. 核心介面與型別定義檢驗
  assert.ok(typesContent.includes('export interface ScheduleFeedItem'), '必須匯出 ScheduleFeedItem');
  assert.ok(typesContent.includes('export type ScheduleCategoryFilter'), '必須匯出 ScheduleCategoryFilter');
  assert.ok(typesContent.includes('export type ScheduleViewMode'), '必須匯出 ScheduleViewMode');
  assert.ok(typesContent.includes('export interface CalendarDateCell'), '必須匯出 CalendarDateCell');
  assert.ok(typesContent.includes('export interface FetchScheduleOptions'), '必須匯出 FetchScheduleOptions');
  assert.ok(typesContent.includes('export interface CalendarSyncResult'), '必須匯出 CalendarSyncResult');
  assert.ok(typesContent.includes('export type ScheduleSourceType'), '必須匯出 ScheduleSourceType');

  // 檢驗細部業務結構欄位定義
  assert.ok(typesContent.includes('bank_last5?: string;'), '必須包含 bank_last5 欄位');
  assert.ok(typesContent.includes('stats?: {'), '必須包含 stats 欄位');
  assert.ok(typesContent.includes('items?: Array<{ name: string; qty: number }> | string;'), '必須包含 items 欄位');

  // 2. Client API 函式定義檢驗
  const clientPath = path.resolve('src/utils/supabaseClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  assert.ok(clientContent.includes('fetchScheduleFeed'), 'supabaseClient 必須實作 fetchScheduleFeed 函式');
  assert.ok(clientContent.includes('get_schedule_feed'), 'fetchScheduleFeed 必須調用 get_schedule_feed RPC');
  assert.ok(clientContent.includes('p_officer_line_user_id'), 'fetchScheduleFeed 必須帶入 p_officer_line_user_id');
  assert.ok(clientContent.includes('triggerCalendarSync'), 'supabaseClient 必須實作 triggerCalendarSync 函式');
  assert.ok(clientContent.includes('sync_calendar'), 'triggerCalendarSync 必須指派 sync_calendar 動作');

  // 3. 零 Emoji 規範檢驗
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(typesContent), 'types 檔案嚴禁包含任何 Emoji');
  assert.ok(!emojiRegex.test(clientContent), 'client 檔案嚴禁包含任何 Emoji');
});

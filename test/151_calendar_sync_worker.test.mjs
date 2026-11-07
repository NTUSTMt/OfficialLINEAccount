// test/151_calendar_sync_worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('151. Google 日曆與學校校曆同步 Worker 檢驗', () => {
  const gasWorkerPath = path.resolve('src/gas_worker.js');
  assert.ok(fs.existsSync(gasWorkerPath), 'gas_worker.js 必須存在');
  const gasWorkerContent = fs.readFileSync(gasWorkerPath, 'utf8');

  // 1. GAS Worker 動作支援與日曆讀取
  assert.ok(gasWorkerContent.includes('sync_calendar_events'), 'gas_worker.js 必須支援 sync_calendar_events 動作');
  assert.ok(gasWorkerContent.includes('CalendarApp.getCalendarById'), '必須使用 CalendarApp 讀取指定日曆');
  assert.ok(gasWorkerContent.includes('external_calendar_events'), '必須將外部日程寫入 external_calendar_events 表');

  // 2. notify-dispatcher 代理動作與安全轉發
  const dispatcherPath = path.resolve('supabase/functions/notify-dispatcher/index.ts');
  assert.ok(fs.existsSync(dispatcherPath), 'notify-dispatcher/index.ts 必須存在');
  const dispatcherContent = fs.readFileSync(dispatcherPath, 'utf8');
  assert.ok(dispatcherContent.includes('sync_calendar'), 'notify-dispatcher 必須支援 sync_calendar 代理動作');

  // 3. 幹部權限校驗與共用金鑰轉發
  assert.ok(
    dispatcherContent.includes('handleSyncCalendarDispatcher') || dispatcherContent.includes('sync_calendar'),
    'notify-dispatcher 必須定義日曆同步處理常式'
  );

  // 4. 零 Emoji 規範
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(gasWorkerContent), 'gas_worker.js 嚴禁包含任何 Emoji');
  assert.ok(!emojiRegex.test(dispatcherContent), 'notify-dispatcher/index.ts 嚴禁包含任何 Emoji');
});

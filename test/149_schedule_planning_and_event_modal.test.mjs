// test/149_schedule_planning_and_event_modal.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

test('149.1 scheduleHighlightUtils 可出隊時段分類與排程衝突偵測結構檢驗', () => {
  const utilsPath = path.resolve('src/utils/scheduleHighlightUtils.ts');
  assert.ok(fs.existsSync(utilsPath), 'scheduleHighlightUtils.ts 必須存在');
  const src = fs.readFileSync(utilsPath, 'utf8');

  assert.ok(src.includes('export function computeScheduleDayHighlights'), '必須匯出 computeScheduleDayHighlights');
  assert.ok(src.includes('export function getDayHighlight'), '必須匯出 getDayHighlight');
  assert.ok(src.includes('export function detectScheduleConflicts'), '必須匯出 detectScheduleConflicts');

  // 假日/補假/排除補班補課
  assert.ok(src.includes('國定假日'), '必須識別國定假日');
  assert.ok(src.includes('補假'), '必須識別補假');
  assert.ok(src.includes('補班'), '必須排除補班日');
  assert.ok(src.includes('補行上班'), '必須排除補行上班日');

  // 寒暑假與運動會/校慶
  assert.ok(src.includes('寒假'), '必須識別寒假區間');
  assert.ok(src.includes('暑假'), '必須識別暑假區間');
  assert.ok(src.includes('運動會'), '必須識別運動會');
  assert.ok(src.includes('校慶'), '必須識別校慶');

  // 考試週
  assert.ok(src.includes('期中考'), '必須識別期中考');
  assert.ok(src.includes('期末考'), '必須識別期末考');
  assert.ok(src.includes('parseExplicitEndDateFromTitle'), '必須解析標題中的「至M月D日」考試截止區間');
  assert.ok(src.includes('formatExamLabel'), '必須精簡考試週顯示標籤');

  // 衝突來源
  assert.ok(src.includes("source_type === 'event'"), '衝突偵測必須涵蓋既有活動');
  assert.ok(src.includes("source_type === 'club_calendar'"), '衝突偵測必須涵蓋社團行事曆');
  assert.ok(src.includes("source_type === 'school'"), '衝突偵測必須涵蓋學校考試週');

  assert.ok(!emojiRegex.test(src), 'scheduleHighlightUtils.ts 嚴禁包含任何 Emoji');
});

test('149.2 WebAdminEventModal 預設未來開放、條件必填與非阻擋式衝突提示檢驗', () => {
  const modalPath = path.resolve('src/components/admin/WebAdminEventModal.tsx');
  assert.ok(fs.existsSync(modalPath), 'WebAdminEventModal.tsx 必須存在');
  const src = fs.readFileSync(modalPath, 'utf8');

  assert.ok(src.includes("status: '未來開放'"), '新增活動預設狀態必須為「未來開放」');
  assert.ok(src.includes("const isOpenStatus = formData.status === '開放'"), '必須依據活動狀態切換條件必填欄位');
  assert.ok(src.includes('required={isOpenStatus}'), 'deadline / deadline_time / fee 僅於開放狀態設為必填');
  assert.ok(src.includes('detectScheduleConflicts'), '必須整合即時排程衝突偵測');
  assert.ok(src.includes('wa-conflict-banner'), '必須顯示非阻擋式衝突提示區塊');
  assert.ok(src.includes('save_admin_event_rpc'), '必須透過 save_admin_event_rpc 寫入活動');
  assert.ok(!emojiRegex.test(src), 'WebAdminEventModal.tsx 嚴禁包含任何 Emoji');
});

test('149.3 WebAdminSchedule 與 WebAdminEvents 整合檢驗', () => {
  const schedulePath = path.resolve('src/pages/web-admin/WebAdminSchedule.tsx');
  const eventsPath = path.resolve('src/pages/web-admin/WebAdminEvents.tsx');
  const cssPath = path.resolve('src/pages/web-admin/webAdmin.css');

  const scheduleSrc = fs.readFileSync(schedulePath, 'utf8');
  const eventsSrc = fs.readFileSync(eventsPath, 'utf8');
  const cssSrc = fs.readFileSync(cssPath, 'utf8');

  // WebAdminSchedule
  assert.ok(scheduleSrc.includes('showDayHighlights'), 'WebAdminSchedule 必須包含可出隊底色開關狀態');
  assert.ok(scheduleSrc.includes('computeScheduleDayHighlights'), 'WebAdminSchedule 必須計算日曆底色標記');
  assert.ok(scheduleSrc.includes('wa-cal-legend'), 'WebAdminSchedule 必須顯示底色圖例');
  assert.ok(scheduleSrc.includes('在此日期開隊'), 'WebAdminSchedule 選定日期明細必須提供「在此日期開隊」按鈕');
  assert.ok(scheduleSrc.includes('WebAdminEventModal'), 'WebAdminSchedule 必須原地開啟 WebAdminEventModal');
  assert.ok(scheduleSrc.includes("status: '未來開放'"), '從日曆快速開隊預設狀態必須為「未來開放」');

  // WebAdminEvents
  assert.ok(eventsSrc.includes('WebAdminEventModal'), 'WebAdminEvents 必須共用 WebAdminEventModal');
  assert.ok(eventsSrc.includes('conflictSourceItems'), 'WebAdminEvents 必須傳入排程衝突檢查來源');

  // CSS
  assert.ok(cssSrc.includes('.wa-cal-day-holiday'), 'webAdmin.css 必須定義假日底色樣式');
  assert.ok(cssSrc.includes('.wa-cal-day-break'), 'webAdmin.css 必須定義寒暑假/運動會底色樣式');
  assert.ok(cssSrc.includes('.wa-cal-day-exam'), 'webAdmin.css 必須定義考試週底色樣式');
  assert.ok(cssSrc.includes('.wa-conflict-banner'), 'webAdmin.css 必須定義衝突提示樣式');
  assert.ok(cssSrc.includes('background-color: #f1f5f9;'), '系統資訊微標籤 (.micro-tag) 必須採用淡灰底色');

  assert.ok(!emojiRegex.test(scheduleSrc), 'WebAdminSchedule.tsx 嚴禁包含任何 Emoji');
  assert.ok(!emojiRegex.test(eventsSrc), 'WebAdminEvents.tsx 嚴禁包含任何 Emoji');
});

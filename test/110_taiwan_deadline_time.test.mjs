import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('110. 報名截止加入時間，以台灣時間為準驗證 (Taiwan Deadline Time)', () => {
  const dateUtilsPath = path.join(rootDir, 'src', 'utils', 'dateUtils.ts');
  const adminEventFormPath = path.join(rootDir, 'src', 'components', 'admin', 'AdminEventForm.tsx');
  const webAdminEventsPath = path.join(rootDir, 'src', 'pages', 'web-admin', 'WebAdminEvents.tsx');
  const adminEventsPath = path.join(rootDir, 'src', 'pages', 'AdminEvents.tsx');
  const adminEventCardPath = path.join(rootDir, 'src', 'components', 'admin', 'AdminEventCard.tsx');
  const gasPath = path.join(rootDir, 'src', 'gas.js');
  const zhPath = path.join(rootDir, 'src', 'locales', 'zh.json');
  const enPath = path.join(rootDir, 'src', 'locales', 'en.json');

  it('應驗證 dateUtils.ts 存在並包含台灣時區轉換核心函式', () => {
    assert.ok(fs.existsSync(dateUtilsPath), 'dateUtils.ts 檔案必須存在');
    const content = fs.readFileSync(dateUtilsPath, 'utf-8');
    assert.ok(content.includes('parseTaiwanDeadline'), '必須具備 parseTaiwanDeadline 函式');
    assert.ok(content.includes('formatTaiwanDateTime'), '必須具備 formatTaiwanDateTime 函式');
    assert.ok(content.includes('buildTaiwanIsoString'), '必須具備 buildTaiwanIsoString 函式');
    assert.ok(content.includes('isTaiwanDeadlinePassed'), '必須具備 isTaiwanDeadlinePassed 函式');
    assert.ok(content.includes('Asia/Taipei'), '必須明確指定 Asia/Taipei 台灣時區');
    assert.ok(content.includes('+08:00'), '必須具備 +08:00 偏移格式');
  });

  it('應驗證 AdminEventForm.tsx 具備截止時間欄位與台灣時間標示', () => {
    assert.ok(fs.existsSync(adminEventFormPath), 'AdminEventForm.tsx 檔案必須存在');
    const content = fs.readFileSync(adminEventFormPath, 'utf-8');
    assert.ok(content.includes('deadlineTime'), 'AdminEventFormData 必須包含 deadlineTime 欄位');
    assert.ok(content.includes('type="time"'), '表單必須包含 type="time" 輸入框');
    assert.ok(content.includes('台灣時間'), '表單必須標註台灣時間');
    assert.ok(content.includes('adminEvents.deadlineTimeLabel'), '表單必須使用多語系標籤');
  });

  it('應驗證 WebAdminEvents.tsx 具備截止時間欄位並在卡片與提交中支援時分', () => {
    assert.ok(fs.existsSync(webAdminEventsPath), 'WebAdminEvents.tsx 檔案必須存在');
    const content = fs.readFileSync(webAdminEventsPath, 'utf-8');
    assert.ok(content.includes('deadline_time'), 'formData 必須包含 deadline_time 狀態');
    assert.ok(content.includes('type="time"'), 'WebAdmin 表單必須包含 type="time" 輸入框');
    assert.ok(content.includes('buildTaiwanIsoString'), '儲存時必須透過 buildTaiwanIsoString 產生標準台灣時間');
    assert.ok(content.includes('formatTaiwanDateTime'), '卡片展示必須透過 formatTaiwanDateTime 呈現完整時分');
    assert.ok(content.includes('parseTaiwanDeadline'), '載入編輯必須透過 parseTaiwanDeadline 解析台灣日期與時間');
  });

  it('應驗證 AdminEvents.tsx 支援台灣時間截止編輯、暫存與送出', () => {
    assert.ok(fs.existsSync(adminEventsPath), 'AdminEvents.tsx 檔案必須存在');
    const content = fs.readFileSync(adminEventsPath, 'utf-8');
    assert.ok(content.includes('parseTaiwanDeadline'), '編輯必須透過 parseTaiwanDeadline 解析');
    assert.ok(content.includes('buildTaiwanIsoString'), '送出與暫存草稿必須透過 buildTaiwanIsoString 處理');
    assert.ok(content.includes('deadlineTime'), 'formData 必須包含 deadlineTime');
  });

  it('應驗證 AdminEventCard.tsx 整合 formatTaiwanDateTime 與 isTaiwanDeadlinePassed', () => {
    assert.ok(fs.existsSync(adminEventCardPath), 'AdminEventCard.tsx 檔案必須存在');
    const content = fs.readFileSync(adminEventCardPath, 'utf-8');
    assert.ok(content.includes('formatTaiwanDateTime'), '必須使用 formatTaiwanDateTime');
    assert.ok(content.includes('isTaiwanDeadlinePassed'), '必須使用 isTaiwanDeadlinePassed');
  });

  it('應驗證 gas.js 包含 _formatEventDateTime 並支援以台灣時區精準判定截止', () => {
    assert.ok(fs.existsSync(gasPath), 'gas.js 必須存在');
    const content = fs.readFileSync(gasPath, 'utf-8');
    assert.ok(content.includes('function _formatEventDateTime'), '必須包含 _formatEventDateTime 函式');
    assert.ok(content.includes('Asia/Taipei'), '必須使用 Asia/Taipei 格式化');
    assert.ok(content.includes('yyyy/MM/dd HH:mm'), '必須支援包含時分的格式');
  });

  it('應驗證多語系檔包含截止時間標籤', () => {
    const zh = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));
    const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
    assert.ok(zh.adminEvents.deadlineTimeLabel, 'zh.json 必須包含 deadlineTimeLabel');
    assert.ok(en.adminEvents.deadlineTimeLabel, 'en.json 必須包含 deadlineTimeLabel');
  });
});

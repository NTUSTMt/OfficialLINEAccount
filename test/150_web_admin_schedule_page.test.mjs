// test/150_web_admin_schedule_page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('150. 電腦版幹部工作站「社務日程」頁面整合檢驗', () => {
  const pagePath = path.resolve('src/pages/web-admin/WebAdminSchedule.tsx');
  assert.ok(fs.existsSync(pagePath), 'WebAdminSchedule.tsx 必須存在');
  const content = fs.readFileSync(pagePath, 'utf8');

  // 1. 核心功能結構
  assert.ok(content.includes('WebAdminSchedule'), '必須匯出 WebAdminSchedule 元件');
  assert.ok(content.includes('fetchScheduleFeed'), '必須調用 fetchScheduleFeed 取得資料');
  assert.ok(content.includes('calendar') && content.includes('timeline'), '必須支援日曆與時間軸視圖切換');

  // 2. 搜尋自動切換為時間軸機制與 300ms 防抖
  assert.ok(content.includes('searchQuery') || content.includes('searchKeyword'), '必須包含搜尋關鍵字狀態');
  assert.ok(content.includes('debounceTimer') && content.includes('300'), '必須實作 300ms 搜尋防抖計時器');
  assert.ok(content.includes("'timeline'"), '搜尋狀態下必須支援自動切換為時間軸檢視');
  assert.ok(content.includes('formatTraditionalChineseDate'), '必須包含 formatTraditionalChineseDate 日期格式防護');

  // 3. 展開明細與向下滑動
  assert.ok(content.includes('selectedDate') || content.includes('activeDate'), '必須包含選定日期狀態');
  assert.ok(content.includes('scrollIntoView') || content.includes('detail-section'), '點擊日期必須平滑向下滑動至明細');

  // 4. 路由與導覽列整合
  const layoutContent = fs.readFileSync(path.resolve('src/pages/web-admin/WebAdminLayout.tsx'), 'utf8');
  assert.ok(layoutContent.includes('/admin-web/schedule'), '導覽列必須包含社務日程路由連結');
  assert.ok(layoutContent.includes('社務日程'), '導覽列必須顯示繁體中文「社務日程」');

  const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.ok(appContent.includes('WebAdminSchedule'), 'App.tsx 必須引入 WebAdminSchedule');
  assert.ok(appContent.includes('path="schedule"'), 'App.tsx 必須註冊 schedule 路由');

  // 5. 零 Emoji 規範
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(content), 'WebAdminSchedule.tsx 嚴禁包含任何 Emoji');
});

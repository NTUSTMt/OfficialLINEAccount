# 幹部後台社務日程 (Calendar & Activity Hub) 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在電腦版幹部工作站新增「社務日程」頂層功能頁（`/admin-web/schedule`），整合 Google 日曆、學校校曆與 Supabase 業務時間資料，提供固定格高月曆（含多日跨格彩色長條）與智能聚合時間軸雙模式檢視、全域搜尋與分類篩選。

**Architecture:** 
後端於 Supabase 新增 `external_calendar_events` 快取表，並透過 `get_schedule_feed` 預存程序利用 `UNION ALL` 在 SQL 層高效聚合出隊活動、截止日、隊員繳費、裝備借還（借出與應還雙錨點）及外部日曆；Google 日曆由既有 GAS Worker 同步並經 `notify-dispatcher` 安全代理。前端新增 `WebAdminSchedule.tsx`，結合固定格高月曆、多日事件跨欄排版、點選向下滑動展開條列明細，並於搜尋時自動切換至時間軸串流呈現。

**Tech Stack:** React 18, TypeScript, Vite, Supabase (PostgreSQL 17, RPC, RLS), Lucide-react, Google Apps Script, Node.js Test Runner.

**Spec:** [docs/superpowers/specs/2026-11-07-officer-schedule-hub-design.md](file:///Users/brianhung/Documents/OfficialLINEAccount/docs/superpowers/specs/2026-11-07-officer-schedule-hub-design.md)

## Global Constraints

- 嚴格遵守零 Emoji 規範：所有介面文字、標籤、按鈕、程式碼註解、提交訊息與測試一律不得包含任何 Emoji。
- 專案文件與介面主要語言為繁體中文。
- 嚴格落實 Trigger 防遞迴守衛：所有關聯觸發函式開頭必須包含 `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`。
- 所有 `SECURITY DEFINER` 預存程序必須明確設置 `SET search_path = public`。
- 前端呼叫錯誤訊息一律直接顯示完整具體的錯誤原因，嚴禁遮蔽或靜默吞沒。
- 新增套件或依賴必須遵循 `pnpm`。

## Review Focus

1. **跨週多日長條斷行排版**：出隊或考試週若跨越多個星期（例如自週五至下週二），長條應於週六切斷並於下週日接續渲染，不可跑版或溢出格線。
2. **搜尋與日期區間聯動**：在月曆檢視輸入搜尋字串時，系統自動切換為時間軸檢視並展開跨月/跨年歷史結果；清空搜尋框時自動切回月曆檢視並重設為當前月。
3. **同日業務智能聚合**：同一天內若同類業務（如隊員繳費或裝備借還）筆數 ≥ 3 筆，時間軸卡片預設自動折疊為「本日共計 N 筆繳費申報 ($金額)」，點擊原地展開各筆明細。
4. **裝備借還日期雙錨點**：借用記錄僅於「借出日」（標示「借: 器材」）與「應還日」（標示「應還: 器材」）呈現微型灰底標籤，不連續佔滿租借期間每日格子。
5. **未登入與權限防護**：非幹部使用者（`is_officer = false` 或無幹部 Session）進入該頁面一律阻斷跳轉，RPC 拒絕回傳任何敏感繳費與個資。

---

### Task 1: 資料庫遷移與排程聚合 RPC 實作

**Files:**
- Create: `supabase/migrations/20261107000000_officer_schedule_hub.sql`
- Modify: `supabase/schema/03_events_and_signups.sql`
- Modify: `supabase/schema/00_master_schema.sql`
- Test: `test/148_officer_schedule_hub_migration.test.mjs`

**Interfaces:**
- Consumes: `is_officer(p_line_user_id TEXT)` from `supabase/schema/02_members_and_officers.sql`
- Produces: 
  - Table `external_calendar_events`
  - RPC function `get_schedule_feed(p_officer_line_user_id TEXT, p_start_time TIMESTAMPTZ, p_end_time TIMESTAMPTZ, p_query_text TEXT, p_category TEXT)` returning `TABLE(item_id TEXT, source_type TEXT, title TEXT, sub_text TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, is_macro BOOLEAN, status_badge TEXT, link_path TEXT, details JSONB)`

- [ ] **Step 1: Write the failing migration test**

```javascript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/148_officer_schedule_hub_migration.test.mjs`
Expected: FAIL with "Migration 檔案必須存在"

- [ ] **Step 3: Implement `supabase/migrations/20261107000000_officer_schedule_hub.sql` and sync to `supabase/schema/`**

撰寫 migration 腳本：
1. 建立 `external_calendar_events` 表與 RLS 政策。
2. 建立 `get_schedule_feed` 預存程序，完整包含活動、截止日、財務申報、裝備借出與應還雙錨點、外部日曆等資料來源之 `UNION ALL`，並於 `p_query_text IS NOT NULL` 時提供 ILIKE 模糊比對。
3. 同步更新 `supabase/schema/03_events_and_signups.sql` 與 `supabase/schema/00_master_schema.sql`。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/148_officer_schedule_hub_migration.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261107000000_officer_schedule_hub.sql supabase/schema/ test/148_officer_schedule_hub_migration.test.mjs
git commit -m "feat(db): add external_calendar_events table and get_schedule_feed rpc"
```

---

### Task 2: 前端型別定義與 Supabase Client API 串接

**Files:**
- Create: `src/types/schedule.ts`
- Modify: `src/utils/supabaseClient.ts`
- Test: `test/149_schedule_client_api.test.mjs`

**Interfaces:**
- Consumes: `supabase` from `src/utils/supabaseClient.ts`, `WebAuthSession` from `src/utils/webAuth.ts`
- Produces: 
  - Types: `ScheduleFeedItem`, `ScheduleCategoryFilter`, `ScheduleViewMode`, `CalendarDateCell`
  - Function: `fetchScheduleFeed(officerId: string, options: FetchScheduleOptions): Promise<ScheduleFeedItem[]>`
  - Function: `triggerCalendarSync(jwt: string): Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: Write the failing API client test**

```javascript
// test/149_schedule_client_api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('149. 社務日程前端型別與 Client API 檢驗', () => {
  const typesPath = path.resolve('src/types/schedule.ts');
  assert.ok(fs.existsSync(typesPath), 'src/types/schedule.ts 必須存在');
  const typesContent = fs.readFileSync(typesPath, 'utf8');

  assert.ok(typesContent.includes('export interface ScheduleFeedItem'), '必須匯出 ScheduleFeedItem');
  assert.ok(typesContent.includes('export type ScheduleCategoryFilter'), '必須匯出 ScheduleCategoryFilter');
  assert.ok(typesContent.includes('export type ScheduleViewMode'), '必須匯出 ScheduleViewMode');

  const clientPath = path.resolve('src/utils/supabaseClient.ts');
  const clientContent = fs.readFileSync(clientPath, 'utf8');
  assert.ok(clientContent.includes('fetchScheduleFeed'), 'supabaseClient 必須實作 fetchScheduleFeed 函式');
  assert.ok(clientContent.includes('get_schedule_feed'), 'fetchScheduleFeed 必須調用 get_schedule_feed RPC');

  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(typesContent), 'types 檔案嚴禁包含任何 Emoji');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/149_schedule_client_api.test.mjs`
Expected: FAIL with "src/types/schedule.ts 必須存在"

- [ ] **Step 3: Implement `src/types/schedule.ts` and `src/utils/supabaseClient.ts`**

1. 定義 `ScheduleFeedItem` 完整欄位（含 `details` JSON 結構：`stats`, `bankLast5`, `items` 等）。
2. 在 `src/utils/supabaseClient.ts` 新增 `fetchScheduleFeed`，支援日期區間、搜尋關鍵字、分類過濾條件與錯誤處理。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/149_schedule_client_api.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/schedule.ts src/utils/supabaseClient.ts test/149_schedule_client_api.test.mjs
git commit -m "feat(schedule): add schedule feed types and client api"
```

---

### Task 3: 幹部工作站「社務日程」前端頁面與雙視圖實作

**Files:**
- Create: `src/pages/web-admin/WebAdminSchedule.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`
- Modify: `src/pages/web-admin/WebAdminLayout.tsx`
- Modify: `src/App.tsx`
- Test: `test/150_web_admin_schedule_page.test.mjs`

**Interfaces:**
- Consumes: `fetchScheduleFeed` from `src/utils/supabaseClient.ts`, `WebAuthSession` from `src/utils/webAuth.ts`
- Produces: 
  - Page Component `WebAdminSchedule` at route `/admin-web/schedule`
  - Navigation item in `WebAdminLayout`

- [ ] **Step 1: Write the failing UI component test**

```javascript
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

  // 2. 搜尋自動切換為時間軸機制
  assert.ok(content.includes('searchQuery') || content.includes('searchKeyword'), '必須包含搜尋關鍵字狀態');
  assert.ok(content.includes("'timeline'"), '搜尋狀態下必須支援自動切換為時間軸檢視');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/150_web_admin_schedule_page.test.mjs`
Expected: FAIL with "WebAdminSchedule.tsx 必須存在"

- [ ] **Step 3: Implement `WebAdminSchedule.tsx`, styles in `webAdmin.css`, navigation in `WebAdminLayout.tsx` & route in `App.tsx`**

1. 建立 `src/pages/web-admin/WebAdminSchedule.tsx`：
   - 頂部 Toolbar：搜尋框、分類篩選、月份導覽、視圖切換按鈕。
   - 月曆視圖：固定格高 110px、多日事件橫跨長條排版演算法、單日醒目標籤置頂、細部業務灰底白字、超額省略「⋮ 另有 N 筆」。
   - 選定日期明細區（點擊日期時平滑滑入日曆下方）：條列當日活動卡片、繳費卡片、裝備卡片，提供一鍵跳轉。
   - 時間軸視圖：倒序排列，同日同類業務 ≥ 3 筆智能折疊為「本日共計 N 筆...」概要卡片，點擊展開。
   - 搜尋聯動：輸入關鍵字時自動切換至時間軸視圖，並全域檢索；清空時自動還原為月曆視圖。
2. 在 `webAdmin.css` 補齊月曆格子、多日長條、時間軸串流與卡片樣式（使用深色主題變數）。
3. 在 `WebAdminLayout.tsx` 導覽列新增「社務日程」連結，在 `App.tsx` 註冊路由。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/150_web_admin_schedule_page.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/web-admin/WebAdminSchedule.tsx src/pages/web-admin/WebAdminLayout.tsx src/pages/web-admin/webAdmin.css src/App.tsx test/150_web_admin_schedule_page.test.mjs
git commit -m "feat(admin): implement web admin schedule page with calendar and timeline views"
```

---

### Task 4: Google 日曆與學校校曆同步整合 (GAS Worker & Edge Proxy)

**Files:**
- Modify: `src/gas_worker.js`
- Modify: `supabase/functions/notify-dispatcher/index.ts`
- Test: `test/151_calendar_sync_worker.test.mjs`

**Interfaces:**
- Consumes: Google Calendar API via GAS, Supabase Service Role Key
- Produces: Action `sync_calendar_events` in `gas_worker.js`, Action `sync_calendar` in `notify-dispatcher`

- [ ] **Step 1: Write the failing sync worker test**

```javascript
// test/151_calendar_sync_worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('151. Google 日曆與學校校曆同步 Worker 檢驗', () => {
  const gasWorkerContent = fs.readFileSync(path.resolve('src/gas_worker.js'), 'utf8');
  assert.ok(gasWorkerContent.includes('sync_calendar_events'), 'gas_worker.js 必須支援 sync_calendar_events 動作');
  assert.ok(gasWorkerContent.includes('CalendarApp.getCalendarById'), '必須使用 CalendarApp 讀取指定日曆');
  assert.ok(gasWorkerContent.includes('external_calendar_events'), '必須將外部日程寫入 external_calendar_events 表');

  const dispatcherContent = fs.readFileSync(path.resolve('supabase/functions/notify-dispatcher/index.ts'), 'utf8');
  assert.ok(dispatcherContent.includes('sync_calendar'), 'notify-dispatcher 必須支援 sync_calendar 代理動作');

  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.ok(!emojiRegex.test(gasWorkerContent), 'gas_worker.js 嚴禁包含任何 Emoji');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/151_calendar_sync_worker.test.mjs`
Expected: FAIL with "gas_worker.js 必須支援 sync_calendar_events 動作"

- [ ] **Step 3: Implement `sync_calendar_events` in `gas_worker.js` and proxy in `notify-dispatcher`**

1. 在 `gas_worker.js` 實作 `_handleSyncCalendarEvents`，讀取社團主日曆與訂閱學校校曆，格式化為統一 JSON 批次 UPSERT 至 `external_calendar_events` 表。
2. 在 `notify-dispatcher` 新增 `sync_calendar` action，校驗幹部 JWT 憑證後攜帶安全密鑰轉發 GAS，確保前端安全不洩漏密鑰。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/151_calendar_sync_worker.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gas_worker.js supabase/functions/notify-dispatcher/index.ts test/151_calendar_sync_worker.test.mjs
git commit -m "feat(sync): add google and school calendar sync action to gas worker and edge proxy"
```

---

### Task 5: 全量回歸驗證、文件維護與版本發布

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `Changelog.md`

- [ ] **Step 1: Execute full test suite**

Run: `pnpm test`
Expected: All tests pass (710+ tests, 0 failures).

- [ ] **Step 2: Bump version tag in `package.json`**

Update version from `0.1.329` to `0.1.330`.

- [ ] **Step 3: Update `README.md` and `Changelog.md` in Traditional Chinese**

1. 在 `README.md` 以繁體中文新增「社務日程 (Calendar & Activity Hub)」功能介紹與操作指南。
2. 在 `Changelog.md` 新增 `[0.1.330]` 之 Added 條目。

- [ ] **Step 4: Verify zero emojis across updated files**

Run command to verify no emoji in touched markdown and json files.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md Changelog.md
git commit -m "chore(release): bump version to v0.1.330 and update documentation for schedule hub"
```

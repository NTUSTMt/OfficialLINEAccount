# 電腦版財務對帳頁面重構與詳細報表實作計畫 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為台科登山社管理後台重新設計電腦版財務對帳頁面，實現活動專屬聯動篩選、雙模式滑出式詳細報表（含輕量 SVG 圖表、學期自訂時間過濾與 CSV/列印匯出）、單筆審核繳費提醒、以及端到端閉環之新增追加款項功能。

**Architecture:** 前端使用 React 19 與 TypeScript 在 `src/pages/web-admin/WebAdminFinance.tsx` 整合活動下拉選單與全域聯動，並拆分出獨立模組：輕量 SVG 圖表 (`FinanceReportCharts.tsx`)、報表抽屜 (`FinanceReportDrawer.tsx`)、提醒確認彈窗 (`PaymentReminderModal.tsx`) 與新增款項抽屜 (`AddPaymentDrawer.tsx`)。後端推播於 `notify-dispatcher` Edge Function 新增 `notify_payment_reminder` Action，社員端 `Payment.tsx` 擴充 URL query 參數解析以達到完整閉環。

**Tech Stack:** React 19, TypeScript, Lucide-react, Supabase Direct Client (Postgres), Deno (Supabase Edge Function), Native SVG/CSS.

**Spec:** [`docs/superpowers/specs/2026-10-18-finance-reconciliation-redesign-design.md`](file:///Users/brianhung/.gemini/antigravity/worktrees/OfficialLINEAccount/redesign_finance_reconciliation_page/docs/superpowers/specs/2026-10-18-finance-reconciliation-redesign-design.md)

## Global Constraints

- 嚴格遵守專案無 Emoji 規範（UI、程式碼、提交訊息與註解皆不得使用 Emoji）。
- 所有 API 與資料庫錯誤必須直接顯示完整錯誤原因（`error.message`、Postgres 錯誤碼、HTTP 狀態碼），嚴禁遮蔽。
- 嚴禁使用無差別批次推播繳費提醒，必須採單筆預覽確認流程。
- 圖表採用自研純 SVG/CSS 實作，零外部依賴，不引入額外圖表套件。
- 嚴格遵守 Test 66 解耦標準，不得修改或污染 `event_signups.notification_status`。
- 修改或新增依賴一律使用 pnpm。

## Review Focus

1. `payments` 寫入時主鍵為 null 造成 Postgres not-null 違規：由前端函式生成 `PAY_` 前綴唯一 ID 並剔除 `payment_status` 欄位。
2. 既有 `fetchFinanceItemsFromSupabase` 將未核銷之 `payments` 一律轉為 `待確認 Checking`，導致新增的 `待繳費 Unpaid` 狀態遺失：修正狀態映射邏輯。
3. LINE Flex 卡片中活動名稱或款項名稱過長導致卡片破版：Flex text 必須設定 `wrap: true` 與妥善 flex 比例。
4. 社員點擊 LINE 卡片開啟 LIFF 時若未帶有 query 參數則維持既有三合一繳費流程，不應拋出例外或白屏。
5. 活動篩選器選定活動後，報表抽屜切換活動模式時需正確鎖定該活動，若切換為「全部活動」則呈現全社活動聚合數據。

---

### Task 1: 後端 Edge Function 實作 `notify_payment_reminder` 與 Flex 卡片模板

**Files:**
- Modify: `supabase/functions/notify-dispatcher/index.ts`
- Test: `test/118_notify_payment_reminder.test.mjs`

**Interfaces:**
- Consumes: `pushMessage` from `../_shared/lineClient.ts`, `getSupabaseAdminClient` from `../_shared/supabaseClient.ts`
- Produces: `notify_payment_reminder` handler in dispatcher accepting `PaymentReminderPayload` (lineUserId, userName, title, amount, dueDate, notes, bankInfo, actionUrl)

- [ ] **Step 1: 建立失敗測試 `test/118_notify_payment_reminder.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('notify-dispatcher index.ts contains notify_payment_reminder case and handler', () => {
  const code = fs.readFileSync('supabase/functions/notify-dispatcher/index.ts', 'utf8');
  assert.match(code, /case\s+"notify_payment_reminder":/);
  assert.match(code, /handleNotifyPaymentReminder/);
  assert.match(code, /前往回報匯款/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/118_notify_payment_reminder.test.mjs`
Expected: FAIL (case not found)

- [ ] **Step 3: 在 `supabase/functions/notify-dispatcher/index.ts` 實作 `handleNotifyPaymentReminder`**

實作解析 `title`、`amount`、`dueDate`、`notes`、`bankInfo`、`actionUrl`，構建精美 LINE Flex Bubble 卡片（包含標題、應繳金額、款項備註、銀行帳號與前往繳費按鈕），並在主 `switch (action)` 加入 `case "notify_payment_reminder":`。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/118_notify_payment_reminder.test.mjs`
Expected: PASS

---

### Task 2: 社員繳費端 (`Payment.tsx`) 支援網址參數解析與追加款項自動帶入

**Files:**
- Modify: `src/pages/Payment.tsx`
- Test: `test/119_payment_page_url_params.test.mjs`

**Interfaces:**
- Consumes: URL query params `targetId`, `type`, `amount`
- Produces: Dynamic pending payment item in `Payment.tsx` prefilled with fee details

- [ ] **Step 1: 建立失敗測試 `test/119_payment_page_url_params.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Payment.tsx parses targetId, type, amount from URL search params', () => {
  const code = fs.readFileSync('src/pages/Payment.tsx', 'utf8');
  assert.match(code, /searchParams|URLSearchParams/);
  assert.match(code, /targetId/);
  assert.match(code, /urlType|paramType/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/119_payment_page_url_params.test.mjs`
Expected: FAIL

- [ ] **Step 3: 修改 `src/pages/Payment.tsx` 支援讀取 query 參數**

在元件掛載時透過 `new URLSearchParams(window.location.search)` 讀取 `targetId`, `type`, `amount`。若存在，動態將其加入待繳清單並預設勾選與填入金額，支援直接申報該筆追加款項。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/119_payment_page_url_params.test.mjs`
Expected: PASS

---

### Task 3: 資料層與狀態映射校正 (`supabaseClient.ts` & `admin.ts`)

**Files:**
- Modify: `src/utils/supabaseClient.ts`
- Modify: `src/types/admin.ts`
- Test: `test/120_finance_unpaid_payments_mapping.test.mjs`

**Interfaces:**
- Consumes: Supabase `payments` table
- Produces:
  - Updated `fetchFinanceItemsFromSupabase` preserving `'待繳費 Unpaid'`
  - `createManualPaymentRequestsInSupabase(requests: NewPaymentRequest[], officerUserId: string): Promise<{ success: boolean; count: number; error?: string }>`

- [ ] **Step 1: 建立失敗測試 `test/120_finance_unpaid_payments_mapping.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('supabaseClient.ts exports createManualPaymentRequestsInSupabase and correctly maps Unpaid status', () => {
  const code = fs.readFileSync('src/utils/supabaseClient.ts', 'utf8');
  assert.match(code, /createManualPaymentRequestsInSupabase/);
  assert.match(code, /PAY_/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/120_finance_unpaid_payments_mapping.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作狀態映射校正與 `createManualPaymentRequestsInSupabase`**

1. 在 `fetchFinanceItemsFromSupabase` 中：檢查 `p.status`，若為 `'待繳費 Unpaid'` 則保留 `'待繳費 Unpaid'`，不再強制設為 `'待確認 Checking'`。
2. 實作 `createManualPaymentRequestsInSupabase`：為每位對象生成唯一 ID `PAY_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`，組裝合法欄位，批次寫入 `payments`。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/120_finance_unpaid_payments_mapping.test.mjs`
Expected: PASS

---

### Task 4: 輕量自研 SVG/CSS 視覺圖表與 KPI 元件 (`FinanceReportCharts.tsx`)

**Files:**
- Create: `src/components/admin/FinanceReportCharts.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`
- Test: `test/121_finance_report_charts.test.mjs`

**Interfaces:**
- Produces:
  - `ExpectedVsReceivedBar: React.FC<{ expected: number; received: number; pending: number }>`
  - `StatusDonutChart: React.FC<{ confirmed: number; checking: number; unpaid: number }>`
  - `CategoryDonutChart: React.FC<{ activity: number; equipment: number; membership: number; general: number }>`
  - `RevenueTrendChart: React.FC<{ data: Array<{ label: string; amount: number }> }>`

- [ ] **Step 1: 建立失敗測試 `test/121_finance_report_charts.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('FinanceReportCharts.tsx exports SVG charting components', () => {
  assert.ok(fs.existsSync('src/components/admin/FinanceReportCharts.tsx'));
  const code = fs.readFileSync('src/components/admin/FinanceReportCharts.tsx', 'utf8');
  assert.match(code, /ExpectedVsReceivedBar/);
  assert.match(code, /StatusDonutChart/);
  assert.match(code, /CategoryDonutChart/);
  assert.match(code, /RevenueTrendChart/);
  assert.match(code, /<svg/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/121_finance_report_charts.test.mjs`
Expected: FAIL (file does not exist)

- [ ] **Step 3: 實作 `FinanceReportCharts.tsx` 與 CSS 樣式**

使用原生語義化 SVG `<circle strokeDasharray>`, `<rect>`, `<path>` 搭配 CSS 變數，實作零外部依賴、高效能、無鋸齒的圖表元件與互動式 Tooltip。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/121_finance_report_charts.test.mjs`
Expected: PASS

---

### Task 5: 繳費提醒二次確認預覽視窗 (`PaymentReminderModal.tsx`)

**Files:**
- Create: `src/components/admin/PaymentReminderModal.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`
- Test: `test/122_payment_reminder_modal.test.mjs`

**Interfaces:**
- Consumes: `notifyDispatcher` from `../../utils/api`
- Produces: `PaymentReminderModal: React.FC<PaymentReminderModalProps>`

- [ ] **Step 1: 建立失敗測試 `test/122_payment_reminder_modal.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PaymentReminderModal.tsx exists and renders preview with single-send confirmation', () => {
  assert.ok(fs.existsSync('src/components/admin/PaymentReminderModal.tsx'));
  const code = fs.readFileSync('src/components/admin/PaymentReminderModal.tsx', 'utf8');
  assert.match(code, /PaymentReminderModal/);
  assert.match(code, /notifyDispatcher/);
  assert.match(code, /notify_payment_reminder/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/122_payment_reminder_modal.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `PaymentReminderModal.tsx`**

實作單筆確認視窗：
1. 顯示收件者姓名、待繳項目、金額、備註編輯欄位。
2. 呈現即時 LINE Flex 卡片預覽。
3. 點擊「確認發送」後呼叫 `notifyDispatcher('notify_payment_reminder', payload)`，處理成功與錯誤反饋。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/122_payment_reminder_modal.test.mjs`
Expected: PASS

---

### Task 6: 右側滑出式詳細財務報表抽屜 (`FinanceReportDrawer.tsx`)

**Files:**
- Create: `src/components/admin/FinanceReportDrawer.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`
- Test: `test/123_finance_report_drawer.test.mjs`

**Interfaces:**
- Consumes: `FinanceReportCharts.tsx`, `AdminFinanceItem`, `PaymentReminderModal`
- Produces: `FinanceReportDrawer: React.FC<FinanceReportDrawerProps>`

- [ ] **Step 1: 建立失敗測試 `test/123_finance_report_drawer.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('FinanceReportDrawer.tsx exports drawer with dual modes, CSV export and print view', () => {
  assert.ok(fs.existsSync('src/components/admin/FinanceReportDrawer.tsx'));
  const code = fs.readFileSync('src/components/admin/FinanceReportDrawer.tsx', 'utf8');
  assert.match(code, /FinanceReportDrawer/);
  assert.match(code, /exportCsv/);
  assert.match(code, /window\.print/);
  assert.match(code, /學期/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/123_finance_report_drawer.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `FinanceReportDrawer.tsx`**

實作滑出式抽屜：
1. 雙模式切換：活動專案明細 vs 全社綜合走勢。
2. 學年度/學期（如 113-2, 113-1）與自訂日期快速過濾。
3. 整合 SVG 視覺圖表與 KPI 達成率指標。
4. 異常與未繳名冊專區，提供單筆「發送提醒」觸發彈窗。
5. CSV UTF-8 BOM 匯出功能與 `@media print` 列印視圖。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/123_finance_report_drawer.test.mjs`
Expected: PASS

---

### Task 7: 新增繳費 / 追加款項抽屜 (`AddPaymentDrawer.tsx`)

**Files:**
- Create: `src/components/admin/AddPaymentDrawer.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`
- Test: `test/124_add_payment_drawer.test.mjs`

**Interfaces:**
- Consumes: `createManualPaymentRequestsInSupabase`, `notifyDispatcher`, `AdminEvent`, `AdminMemberListItem`
- Produces: `AddPaymentDrawer: React.FC<AddPaymentDrawerProps>`

- [ ] **Step 1: 建立失敗測試 `test/124_add_payment_drawer.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AddPaymentDrawer.tsx exports drawer with multi-member selection and amount customization', () => {
  assert.ok(fs.existsSync('src/components/admin/AddPaymentDrawer.tsx'));
  const code = fs.readFileSync('src/components/admin/AddPaymentDrawer.tsx', 'utf8');
  assert.match(code, /AddPaymentDrawer/);
  assert.match(code, /createManualPaymentRequestsInSupabase/);
  assert.match(code, /全選|選取/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/124_add_payment_drawer.test.mjs`
Expected: FAIL

- [ ] **Step 3: 實作 `AddPaymentDrawer.tsx`**

實作追加款項滑出抽屜：
1. 款項名稱、關聯活動選擇、款項類別、統一金額與說明填寫。
2. 雙模式名冊勾選（活動正取名單快速全選 vs 全社名單搜尋勾選）。
3. 已選名單列表，支援個別金額微調。
4. 勾選立即發送 LINE 卡片通知核取方塊。
5. 送出寫入與推播執行。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test test/124_add_payment_drawer.test.mjs`
Expected: PASS

---

### Task 8: 整合至 `WebAdminFinance.tsx` (Toolbar, Activity Filter, Global Linkage & State Management)

**Files:**
- Modify: `src/pages/web-admin/WebAdminFinance.tsx`
- Modify: `package.json` (遞增版本號 tag)
- Modify: `README.md` (記錄新功能規格與架構)
- Test: Full verification (`pnpm test` and `pnpm run build`)

**Interfaces:**
- Consumes: `FinanceReportDrawer`, `AddPaymentDrawer`, `PaymentReminderModal`
- Produces: Fully redesigned desktop finance reconciliation page with activity filtering and analytics

- [ ] **Step 1: 建立整合測試 `test/125_web_admin_finance_integration.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('WebAdminFinance.tsx integrates activity filter, report drawer, and add payment drawer', () => {
  const code = fs.readFileSync('src/pages/web-admin/WebAdminFinance.tsx', 'utf8');
  assert.match(code, /FinanceReportDrawer/);
  assert.match(code, /AddPaymentDrawer/);
  assert.match(code, /selectedEventId|eventFilter/);
  assert.match(code, /財務分析報表/);
  assert.match(code, /新增繳費項目/);
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test test/125_web_admin_finance_integration.test.mjs`
Expected: FAIL

- [ ] **Step 3: 修改 `WebAdminFinance.tsx` 整合所有模組**

1. 工具列加入「活動專屬篩選器」下拉選單（分組顯示進行中、未來籌備中與歷史活動）。
2. 工具列加入「財務分析報表」與「+ 新增繳費項目」按鈕。
3. 主款項表格與頂部卡片即時聯動篩選條件。
4. 渲染 `FinanceReportDrawer`、`AddPaymentDrawer` 與 `PaymentReminderModal`。
5. 遞增 `package.json` 版本號並更新 `README.md`。

- [ ] **Step 4: 執行完整測試與建置驗證**

Run: `node --test test/*.test.mjs && pnpm run build`
Expected: All tests PASS, build succeeds with zero TypeScript errors.

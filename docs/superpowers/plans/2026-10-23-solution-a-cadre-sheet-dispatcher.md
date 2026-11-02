# 幹部試算表安全轉發調度器 (Solution A: Cadre Spreadsheet Dispatcher) 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 透過 Supabase Edge Function (`notify-dispatcher`) 建立安全轉發通道，使幹部於前端點擊「建立試算表」與「手動同步名冊」時，能通過嚴密的幹部身分鑑權，並由後端安全攜帶 `GAS_WORKER_SECRET` 調用 Google Apps Script，達成 100% 正常寫入試算表且絕不向前端暴露機密。

**Architecture:** 
1. **Edge Function 鑑權與轉發端點 (`supabase/functions/notify-dispatcher/index.ts`)**：
   - 新增 `create_event_sheet` 與 `sync_event_sheet_signups` 處理函式。
   - 驗證呼叫者的 `verifiedUserId` 具備社團幹部資格 (`await isUserOfficer(verifiedUserId)`)，非幹部回傳 403。
   - 幹部通過校驗後，於後端向 `GAS_WORKER_URL` 發起請求，於 Header 注入 `x-worker-secret: GAS_WORKER_SECRET`，並回傳試算表網址與同步結果。
2. **共用 API 客戶端模組擴充 (`src/utils/api.ts`)**：
   - 擴充 `callDispatcherAction` 泛型函式，支援接收 `notify-dispatcher` 回傳之具體業務資料物件 (`data`)。
   - 封裝 `createEventSheetViaDispatcher` 與 `syncEventSheetViaDispatcher`。
3. **前端幹部介面無縫接入 (`src/pages/web-admin/WebAdminRoster.tsx` 與 `src/pages/AdminEvents.tsx`)**：
   - 將原本直連 `GAS_API_URL` 之建立與全量同步呼叫，改為透過 `callDispatcherAction` 調用 Edge Function。
   - 保留現有完整的失敗自癒容錯機制（如向 Supabase 輪詢 `spreadsheet_url`）。

**Tech Stack:** TypeScript, React 19, Deno (Supabase Edge Function), Node.js native test runner.

---

## Global Constraints

- 嚴格遵守無 Emoji 規範（回覆、提交訊息、程式碼、註解與文件皆不得使用 Emoji）。
- 所有錯誤處理必須直接透明輸出具體錯誤原因（`error.message`、Postgres 錯誤碼、HTTP 狀態碼），嚴禁遮蔽或替換為空泛訊息。
- 測試執行採用 `node --test` 直接執行，確保沙盒相容。
- 既有 89+ 項測試套件必須全數保持通過。

---

### Task 1: Edge Function notify-dispatcher 實作幹部試算表轉發端點

**Files:**
- Modify: `supabase/functions/notify-dispatcher/index.ts`
- Test: `test/138_cadre_sheet_dispatcher.test.mjs`

**Interfaces:**
- Produces:
  - `handleCreateEventSheetDispatcher(payload)`: 幹部驗證、呼叫 GAS Worker 並回傳 `{ spreadsheetId, spreadsheetUrl, driveFolderUrl }`
  - `handleSyncEventSheetDispatcher(payload)`: 幹部驗證、呼叫 GAS Worker 並回傳 `{ synced_count, spreadsheetUrl }`
  - Action 路由註冊: `create_event_sheet`, `sync_event_sheet_signups`

- [x] **Step 1: 建立失敗測試 `test/138_cadre_sheet_dispatcher.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('138. notify-dispatcher 幹部試算表轉發端點驗證 (Solution A)', () => {
  const rootDir = process.cwd();
  const dispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const code = fs.readFileSync(dispatcherPath, 'utf8');

  it('1. notify-dispatcher 必須支援 create_event_sheet 路由與幹部鑑權', () => {
    assert.ok(code.includes('case "create_event_sheet":'), '必須具備 create_event_sheet action');
    assert.ok(code.includes('handleCreateEventSheetDispatcher'), '必須具備 handleCreateEventSheetDispatcher 函式');
    
    const handler = code.substring(code.indexOf('async function handleCreateEventSheetDispatcher'));
    assert.ok(handler.includes('isUserOfficer'), '建立試算表必須校驗 isUserOfficer');
    assert.ok(handler.includes('x-worker-secret'), '轉發 GAS 必須攜帶 x-worker-secret');
  });

  it('2. notify-dispatcher 必須支援 sync_event_sheet_signups 路由與幹部鑑權', () => {
    assert.ok(code.includes('case "sync_event_sheet_signups":'), '必須具備 sync_event_sheet_signups action');
    assert.ok(code.includes('handleSyncEventSheetDispatcher'), '必須具備 handleSyncEventSheetDispatcher 函式');
    
    const handler = code.substring(code.indexOf('async function handleSyncEventSheetDispatcher'));
    assert.ok(handler.includes('isUserOfficer'), '名冊同步必須校驗 isUserOfficer');
    assert.ok(handler.includes('x-worker-secret'), '轉發 GAS 必須攜帶 x-worker-secret');
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'notify-dispatcher 代碼不得包含 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/138_cadre_sheet_dispatcher.test.mjs`。

- [x] **Step 3: 修改 `supabase/functions/notify-dispatcher/index.ts`**

實作轉發函式並註冊 switch case。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/138_cadre_sheet_dispatcher.test.mjs`。

---

### Task 2: 前端共用通訊模組擴充 `callDispatcherAction`

**Files:**
- Modify: `src/utils/api.ts`
- Test: `test/139_call_dispatcher_action.test.mjs`

**Interfaces:**
- Produces:
  - `callDispatcherAction<T>(action: string, payload: Record<string, unknown>): Promise<{ success: boolean; data?: T; message?: string }>`

- [x] **Step 1: 建立失敗測試 `test/139_call_dispatcher_action.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('139. 前端 callDispatcherAction 通訊模組擴充驗證', () => {
  const rootDir = process.cwd();
  const apiPath = path.join(rootDir, 'src/utils/api.ts');
  const code = fs.readFileSync(apiPath, 'utf8');

  it('1. api.ts 必須匯出 callDispatcherAction 且回傳 data 泛型欄位', () => {
    assert.ok(code.includes('export const callDispatcherAction'), '必須匯出 callDispatcherAction');
    assert.ok(code.includes('data: json'), '必須將 json 封裝至 data 欄位回傳');
  });

  it('2. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'api.ts 代碼不得包含 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/139_call_dispatcher_action.test.mjs`。

- [x] **Step 3: 修改 `src/utils/api.ts`**

實作 `callDispatcherAction`。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/139_call_dispatcher_action.test.mjs`。

---

### Task 3: 前端幹部後台接入 Edge Function 轉發

**Files:**
- Modify: `src/pages/web-admin/WebAdminRoster.tsx`
- Modify: `src/pages/AdminEvents.tsx`
- Test: `test/140_cadre_sheet_frontend_integration.test.mjs`

**Interfaces:**
- Consumes: `callDispatcherAction` from `../../utils/api`
- Produces: 
  - `WebAdminRoster.tsx`: 使用 `callDispatcherAction('create_event_sheet', ...)` 與 `callDispatcherAction('sync_event_sheet_signups', ...)`
  - `AdminEvents.tsx`: 使用 `callDispatcherAction('create_event_sheet', ...)`

- [x] **Step 1: 建立失敗測試 `test/140_cadre_sheet_frontend_integration.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('140. 幹部頁面試算表建立與同步接入 Dispatcher 驗證', () => {
  const rootDir = process.cwd();
  const rosterPath = path.join(rootDir, 'src/pages/web-admin/WebAdminRoster.tsx');
  const adminEventsPath = path.join(rootDir, 'src/pages/AdminEvents.tsx');
  const rosterCode = fs.readFileSync(rosterPath, 'utf8');
  const adminEventsCode = fs.readFileSync(adminEventsPath, 'utf8');

  it('1. WebAdminRoster 必須透過 callDispatcherAction 觸發 create_event_sheet 與 sync_event_sheet_signups', () => {
    assert.ok(rosterCode.includes('callDispatcherAction'), 'WebAdminRoster 必須引用 callDispatcherAction');
    assert.strictEqual(
      rosterCode.includes('fetch(`${GAS_API_URL}?${query.toString()}`)'),
      false,
      'WebAdminRoster 不得直連 GAS_API_URL 建立試算表'
    );
  });

  it('2. AdminEvents 必須透過 callDispatcherAction 觸發 create_event_sheet', () => {
    assert.ok(adminEventsCode.includes('callDispatcherAction'), 'AdminEvents 必須引用 callDispatcherAction');
    assert.strictEqual(
      adminEventsCode.includes('gasGet<any>(appendAuthToken(`${GAS_API_URL}?${query.toString()}`))'),
      false,
      'AdminEvents 不得直連 GAS_API_URL 建立試算表'
    );
  });

  it('3. 代碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(rosterCode), false, 'WebAdminRoster 代碼不得包含 Emoji');
    assert.strictEqual(emojiRegex.test(adminEventsCode), false, 'AdminEvents 代碼不得包含 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/140_cadre_sheet_frontend_integration.test.mjs`。

- [x] **Step 3: 修改 `src/pages/web-admin/WebAdminRoster.tsx` 與 `src/pages/AdminEvents.tsx`**

將直連 GAS 改為調用 `callDispatcherAction`。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/140_cadre_sheet_frontend_integration.test.mjs`。

---

### Task 4: 整合驗證與版本文件維護

**Files:**
- Modify: `package.json` (遞增至 0.1.321)
- Modify: `README.md`
- Modify: `Changelog.md`

- [x] **Step 1: 執行既有測試套件與全數新測試**

執行：
```sh
node --test test/138_cadre_sheet_dispatcher.test.mjs
node --test test/139_call_dispatcher_action.test.mjs
node --test test/140_cadre_sheet_frontend_integration.test.mjs
node --test test/133_gas_worker_security_hardening.test.mjs
node --test test/77_event_sheet_sync_transparency.test.mjs
node --test test/63_manual_create_event_sheet_and_import.test.mjs
```

- [x] **Step 2: 遞增版本至 `0.1.321` 並更新文檔**

# 安全稽核十項漏洞修復實作計畫 (Security Vulnerabilities Remediation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 針對安全稽核報告確認的 10 項安全弱點（包含 GAS Worker 機密洩漏與越權刪除/讀取、Supabase RPC IDOR 與鑑權旁路、Admin Portal 寬鬆 RLS、Edge Function 虛假 pg_cron 偽造與 Vercel 缺少 HSTS）進行全方位端到端加固與防禦修復。

**Architecture:** 
1. **GAS Thin Worker 邊界加固 (`src/gas_worker.js`)**：移除 Google 試算表 `_CONFIG` 頁籤明文寫入 `SUPABASE_SERVICE_ROLE_KEY` 之重大弱點，移除公開 `ANYONE_WITH_LINK` 權限；將試算表建立、名冊個資同步與 Drive 檔案刪除動作全面收攏至 `_verifyWorkerSecret` 鑑權防護網之後，僅保留公開相片上傳。
2. **Supabase PL/pgSQL RPC 鑑權加固 (`supabase/migrations/20261023_security_remediation_p3.sql`)**：修正 `save_member_profile`、`cancel_event_signup_rpc`、`cancel_equipment_loan_rpc`、`signup_rpc` 與 `save_reflection_rpc`，杜絕匿名呼叫時因 `v_jwt_sub IS NULL` 或缺少身分比對產生的 IDOR 與旁路漏洞；撤銷 `admin_portal_rpc.sql` 殘存的 11 條寬鬆 `USING (true)` 策略。
3. **Edge Function 鑑權校驗加固 (`supabase/functions/notify-dispatcher/index.ts`)**：修正 `isPgCron` 判斷式，杜絕任意 Bearer Token 偽造 `source: "pg_cron"` 取得 `SYSTEM_CRON` 權限；推播通知強制採用 `verifiedUserId` 進行幹部權限檢驗。
4. **Vercel HTTP 安全標頭加固 (`vercel.json`)**：補齊 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`。

**Tech Stack:** JavaScript (Google Apps Script), PostgreSQL / PL/pgSQL (Supabase), TypeScript / Deno (Supabase Edge Functions), JSON (Vercel Config), Node.js native test runner.

**Spec:** [`security_audit_report.md`](file:///Users/brianhung/.gemini/antigravity/brain/868a2382-72e7-4083-8a1d-64cbf9912fd7/security_audit_report.md) 與 [`FINDINGS-DETAIL.md`](file:///Users/brianhung/.gemini/antigravity/brain/868a2382-72e7-4083-8a1d-64cbf9912fd7/scratch/audit-run-1/FINDINGS-DETAIL.md)

## Global Constraints

- 嚴格遵守無 Emoji 規範（回覆、提交訊息、程式碼、註解與文件皆不得使用 Emoji）。
- 所有錯誤處理必須直接透明輸出具體錯誤訊息（`error.message`、Postgres 錯誤碼、HTTP 狀態碼），嚴禁遮蔽或替換為空泛訊息。
- 專案依賴管理一律使用 pnpm。
- 測試執行採用 `node --test` 直接執行，避免沙盒環境限制。
- 遵循既有向後相容性，既有 89+ 項測試套件必須全數保持通過。

## Review Focus

1. GAS Worker 鑑權分流調整後，公開體能證明上傳（`upload_drive_files`）不得受阻，但刪除與試算表操作必須嚴格阻斷未鑑權請求。
2. `cancel_event_signup_rpc` 與 `cancel_equipment_loan_rpc` 匿名呼叫（缺少 JWT）必須被明確拒絕，不得因 `v_jwt_sub IS NULL` 放行。
3. `save_member_profile` 與 `signup_rpc` 必須確保一般社員僅能操作本人的 `line_user_id`，非本人且非幹部之寫入操作必須被 403 阻擋。
4. `notify-dispatcher` 之 `isPgCron` 必須嚴格比對 `serviceRoleKey`，任何非 service_role 之 Bearer Token 不得藉由 `source: "pg_cron"` 偽造身分。
5. `admin_portal_rpc.sql` 移除寬鬆 RLS 策略後，既有幹部管理功能必須正常運作（仰賴 `desktop_admin_security.sql` 之既有嚴密 RLS 政策）。

---

### Task 1: GAS Thin Worker 鑑權與機密外洩修復 (Findings 1, 2, 3)

**Files:**
- Modify: `src/gas_worker.js:70-85, 120-135, 420-445`
- Test: `test/133_gas_worker_security_hardening.test.mjs`

**Interfaces:**
- Consumes: `_verifyWorkerSecret(e)` in `src/gas_worker.js`
- Produces: 
  - `_handleCreateEventSheet` 不再向 `_CONFIG` 工作表寫入 `SUPABASE_SERVICE_ROLE_KEY`，移除 `ANYONE_WITH_LINK` 預設公開分享
  - `create_event_sheet`、`sync_event_sheet_signups`、`sync_event_roster`、`delete_drive_file`、`delete_drive_files` 在 `doGet` 與 `doPost` 中全面移入 `_verifyWorkerSecret` 檢驗之後
  - 僅放行 `health_check` 與 `upload_drive_files` / `upload_drive_file` / `upload_image_to_drive`

- [x] **Step 1: 建立失敗測試 `test/133_gas_worker_security_hardening.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('133. GAS Worker 機密防洩漏與鑑權收攏測試', () => {
  const rootDir = process.cwd();
  const gasWorkerPath = path.join(rootDir, 'src/gas_worker.js');
  const code = fs.readFileSync(gasWorkerPath, 'utf8');

  it('1. _handleCreateEventSheet 不得將 SUPABASE_SERVICE_ROLE_KEY 寫入 _CONFIG 工作表', () => {
    assert.strictEqual(
      code.includes("_setOrUpdateConfigRow(configSheet, 'SUPABASE_SERVICE_ROLE_KEY'"),
      false,
      '禁止將 SUPABASE_SERVICE_ROLE_KEY 寫入 Google 試算表'
    );
  });

  it('2. _handleCreateEventSheet 不得預設將試算表分享予 ANYONE_WITH_LINK', () => {
    assert.strictEqual(
      code.includes('DriveApp.Access.ANYONE_WITH_LINK'),
      false,
      '禁止預設開放 ANYONE_WITH_LINK 讀取'
    );
  });

  it('3. doGet 中敏感操作 (試算表建立、名冊同步、檔案刪除) 必須位於 _verifyWorkerSecret 之後', () => {
    const doGetSection = code.substring(code.indexOf('function doGet'), code.indexOf('function doPost'));
    const verifyIndex = doGetSection.indexOf('_verifyWorkerSecret(e)');
    assert.ok(verifyIndex > 0, 'doGet 必須包含 _verifyWorkerSecret 檢查');

    const createSheetIndex = doGetSection.indexOf("action === 'create_event_sheet'");
    const syncSignupsIndex = doGetSection.indexOf("action === 'sync_event_sheet_signups'");
    const deleteDriveIndex = doGetSection.indexOf("action === 'delete_drive_file'");

    assert.ok(createSheetIndex > verifyIndex, 'create_event_sheet 必須在 _verifyWorkerSecret 之後');
    assert.ok(syncSignupsIndex > verifyIndex, 'sync_event_sheet_signups 必須在 _verifyWorkerSecret 之後');
    assert.ok(deleteDriveIndex > verifyIndex, 'delete_drive_file 必須在 _verifyWorkerSecret 之後');
  });

  it('4. doPost 中敏感操作 (檔案刪除、試算表建立、名冊同步) 必須位於 _verifyWorkerSecret 之後', () => {
    const doPostSection = code.substring(code.indexOf('function doPost'), code.indexOf('function _workerSuccess'));
    const verifyIndex = doPostSection.indexOf('_verifyWorkerSecret(e)');
    assert.ok(verifyIndex > 0, 'doPost 必須包含 _verifyWorkerSecret 檢查');

    const deleteDriveIndex = doPostSection.indexOf("action === 'delete_drive_file'");
    const createSheetIndex = doPostSection.indexOf("action === 'create_event_sheet'");
    const syncSignupsIndex = doPostSection.indexOf("action === 'sync_event_sheet_signups'");

    assert.ok(deleteDriveIndex > verifyIndex, 'delete_drive_file 必須在 _verifyWorkerSecret 之後');
    assert.ok(createSheetIndex > verifyIndex, 'create_event_sheet 必須在 _verifyWorkerSecret 之後');
    assert.ok(syncSignupsIndex > verifyIndex, 'sync_event_sheet_signups 必須在 _verifyWorkerSecret 之後');
  });

  it('5. 程式碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'gas_worker.js 不得包含任何 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/133_gas_worker_security_hardening.test.mjs`，確認失敗輸出。

- [x] **Step 3: 修改 `src/gas_worker.js` 實現防護**

1. 於 `_handleCreateEventSheet` 移除 `if (SUPABASE_SERVICE_ROLE_KEY) _setOrUpdateConfigRow(configSheet, 'SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);` 與 `DriveApp.Access.ANYONE_WITH_LINK` 區塊。
2. 於 `doGet` 中，將 `create_event_sheet`、`sync_event_sheet_signups`、`delete_drive_file` 移至 `_verifyWorkerSecret(e)` 檢驗之後。
3. 於 `doPost` 中，將 `delete_drive_file`、`create_event_sheet`、`sync_event_sheet_signups` 移至 `_verifyWorkerSecret(e)` 檢驗之後。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/133_gas_worker_security_hardening.test.mjs`，確認全數 PASS。

---

### Task 2: Supabase PL/pgSQL RPC 鑑權與 IDOR 漏洞加固 (Findings 4, 5, 8, 9)

**Files:**
- Create: `supabase/migrations/20261023_security_remediation_p3.sql`
- Modify: `supabase/fix_save_member_profile_nationality.sql`
- Test: `test/134_supabase_rpc_security_guards.test.mjs`

**Interfaces:**
- Produces:
  - `save_member_profile`: 驗證 `auth.role() = 'service_role'` 或 `(auth.jwt() ->> 'sub' = trim(p_line_user_id))` 或 `COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE)`，未通過回傳 `Forbidden: 禁止越權修改他人個人資料`。
  - `cancel_event_signup_rpc` & `cancel_equipment_loan_rpc`: 若 caller 非 service_role，強制要求 `v_jwt_sub IS NOT NULL`；若為空回傳 `Unauthorized: 缺少有效身分憑證`，若不匹配本人且非幹部回傳 `Forbidden`。
  - `signup_rpc`: 驗證 `auth.role() = 'service_role'` 或 `auth.jwt() ->> 'sub' = trim(p_line_user_id)` 或幹部身分，杜絕未鑑權報名。
  - `save_reflection_rpc`: 驗證 `auth.role() = 'service_role'` 或 `auth.jwt() ->> 'sub' = trim(p_line_user_id)` 或幹部身分。

- [x] **Step 1: 建立失敗測試 `test/134_supabase_rpc_security_guards.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('134. Supabase RPC 身分鑑權與 IDOR 防護加固驗證', () => {
  const rootDir = process.cwd();
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261023_security_remediation_p3.sql');
  assert.ok(fs.existsSync(migrationPath), '必須建立 20261023_security_remediation_p3.sql 遷移腳本');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('1. save_member_profile 必須校驗 caller 身分與 p_line_user_id 一致性', () => {
    assert.ok(sql.includes('FUNCTION save_member_profile'), '必須包含 save_member_profile 定義');
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes("current_setting('request.jwt.claim.sub'"),
      'save_member_profile 必須讀取 caller JWT sub'
    );
    assert.ok(
      sql.includes('禁止越權修改他人個人資料') || sql.includes('Forbidden'),
      'save_member_profile 必須包含越權拒絕邏輯'
    );
  });

  it('2. cancel_event_signup_rpc 必須拒絕匿名與缺失 JWT 呼叫', () => {
    assert.ok(sql.includes('FUNCTION cancel_event_signup_rpc'), '必須包含 cancel_event_signup_rpc 定義');
    assert.ok(
      sql.includes('缺少有效身分憑證') || sql.includes('Unauthorized'),
      'cancel_event_signup_rpc 必須在 v_jwt_sub 為空時拒絕'
    );
  });

  it('3. cancel_equipment_loan_rpc 必須拒絕匿名與缺失 JWT 呼叫', () => {
    assert.ok(sql.includes('FUNCTION cancel_equipment_loan_rpc'), '必須包含 cancel_equipment_loan_rpc 定義');
    assert.ok(
      sql.includes('缺少有效身分憑證') || sql.includes('Unauthorized'),
      'cancel_equipment_loan_rpc 必須在 v_jwt_sub 為空時拒絕'
    );
  });

  it('4. signup_rpc 必須檢查 caller 身分', () => {
    assert.ok(sql.includes('FUNCTION signup_rpc'), '必須包含 signup_rpc 定義');
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes('service_role'),
      'signup_rpc 必須驗證 caller 身分'
    );
  });

  it('5. save_reflection_rpc 必須檢查 caller 身分', () => {
    assert.ok(sql.includes('FUNCTION save_reflection_rpc'), '必須包含 save_reflection_rpc 定義');
    assert.ok(
      sql.includes("auth.jwt() ->> 'sub'") || sql.includes('service_role'),
      'save_reflection_rpc 必須驗證 caller 身分'
    );
  });

  it('6. SQL 腳本無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(sql), false, 'SQL 腳本不得包含任何 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/134_supabase_rpc_security_guards.test.mjs`。

- [x] **Step 3: 撰寫 `supabase/migrations/20261023_security_remediation_p3.sql`**

實現 5 個安全加固的 RPC 函式，並更新 `supabase/fix_save_member_profile_nationality.sql`。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/134_supabase_rpc_security_guards.test.mjs`。

---

### Task 3: 移除 Admin Portal 殘存寬鬆 RLS 策略 (Finding 7)

**Files:**
- Modify: `supabase/admin_portal_rpc.sql:935-968`
- Add to: `supabase/migrations/20261023_security_remediation_p3.sql`
- Test: `test/135_admin_portal_rls_hardening.test.mjs`

**Interfaces:**
- Produces: 
  - 徹底移除 `supabase/admin_portal_rpc.sql` 中 11 條 `Allow anon read/update/insert` 策略
  - 於 migration 腳本加入對應 `DROP POLICY IF EXISTS` 指令，確保生產資料庫中若有殘存寬鬆策略一併清除

- [x] **Step 1: 建立失敗測試 `test/135_admin_portal_rls_hardening.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('135. Admin Portal 寬鬆 RLS 策略清除驗證', () => {
  const rootDir = process.cwd();
  const rpcPath = path.join(rootDir, 'supabase/admin_portal_rpc.sql');
  const migrationPath = path.join(rootDir, 'supabase/migrations/20261023_security_remediation_p3.sql');
  const rpcSql = fs.readFileSync(rpcPath, 'utf8');
  const migSql = fs.readFileSync(migrationPath, 'utf8');

  it('1. admin_portal_rpc.sql 不得包含 Allow anon 寬鬆策略之建立語句', () => {
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read members"'),
      false,
      '禁止 Allow anon read members'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon update members"'),
      false,
      '禁止 Allow anon update members'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read payments"'),
      false,
      '禁止 Allow anon read payments'
    );
    assert.strictEqual(
      rpcSql.includes('CREATE POLICY "Allow anon read loans"'),
      false,
      '禁止 Allow anon read loans'
    );
  });

  it('2. migration 腳本必須包含明確的 DROP POLICY 清理陳述式', () => {
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read members" ON members;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update members" ON members;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon insert payments" ON payments;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon read loans" ON loans;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon update loans" ON loans;'));
    assert.ok(migSql.includes('DROP POLICY IF EXISTS "Allow anon insert loans" ON loans;'));
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/135_admin_portal_rls_hardening.test.mjs`。

- [x] **Step 3: 修改 `supabase/admin_portal_rpc.sql` 並補充 migration**

移除行 936-968 寬鬆策略建立陳述式，並在 migration 中加入完整 DROP 陳述。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/135_admin_portal_rls_hardening.test.mjs`。

---

### Task 4: Edge Function notify-dispatcher 鑑權加固與推播防冒用 (Finding 6)

**Files:**
- Modify: `supabase/functions/notify-dispatcher/index.ts:1650-1658, 2220-2245`
- Test: `test/136_notify_dispatcher_auth_hardening.test.mjs`

**Interfaces:**
- Produces:
  - `isPgCron`: 僅在 `isServiceRole` 為真且符合特定 action/source 時判定為 pg_cron，徹底阻絕任意 Bearer Token 偽造。
  - `handleSendEventNotifications`: 強制優先採用 `verifiedUserId` 檢查幹部權限，杜絕由 client payload 偽造 `userId`。

- [x] **Step 1: 建立失敗測試 `test/136_notify_dispatcher_auth_hardening.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('136. notify-dispatcher 鑑權防偽造加固驗證', () => {
  const rootDir = process.cwd();
  const dispatcherPath = path.join(rootDir, 'supabase/functions/notify-dispatcher/index.ts');
  const code = fs.readFileSync(dispatcherPath, 'utf8');

  it('1. isPgCron 不得允許任意非 service_role 的 Bearer Token 偽造', () => {
    assert.strictEqual(
      code.includes('isServiceRole || Boolean(bearerToken)'),
      false,
      '禁止以任意 Bearer Token 判定為 isPgCron'
    );
    assert.ok(
      code.includes('isServiceRole') && code.includes('isPgCron'),
      'isPgCron 必須嚴格要求 isServiceRole'
    );
  });

  it('2. handleSendEventNotifications 必須優先採用 verifiedUserId 校驗幹部身分', () => {
    const handlerSection = code.substring(
      code.indexOf('async function handleSendEventNotifications'),
      code.indexOf('const { data: event }')
    );
    assert.ok(
      handlerSection.includes('json.verifiedUserId || json.userId') ||
      handlerSection.includes('const userId = json.verifiedUserId'),
      'handleSendEventNotifications 必須採用 verifiedUserId'
    );
  });

  it('3. 程式碼無 Emoji 規範驗證', () => {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.strictEqual(emojiRegex.test(code), false, 'notify-dispatcher 代碼不得包含 Emoji');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/136_notify_dispatcher_auth_hardening.test.mjs`。

- [x] **Step 3: 修改 `supabase/functions/notify-dispatcher/index.ts`**

修正 `isPgCron` 定義與 `handleSendEventNotifications` 權限校驗。

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/136_notify_dispatcher_auth_hardening.test.mjs`。

---

### Task 5: Vercel 配置補齊 HSTS 安全標頭 (Finding 10)

**Files:**
- Modify: `vercel.json:11-20`
- Test: `test/137_vercel_security_headers.test.mjs`

**Interfaces:**
- Produces: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` 在全站回應標頭中生效。

- [x] **Step 1: 建立失敗測試 `test/137_vercel_security_headers.test.mjs`**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('137. Vercel 安全標頭 HSTS 驗證', () => {
  const rootDir = process.cwd();
  const vercelPath = path.join(rootDir, 'vercel.json');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

  it('1. vercel.json 必須在全站 headers 中包含 Strict-Transport-Security', () => {
    const globalHeaderRule = vercelConfig.headers.find((h) => h.source === '/(.*)');
    assert.ok(globalHeaderRule, '必須有針對全站 /(.*) 的標頭規則');

    const hsts = globalHeaderRule.headers.find((header) => header.key === 'Strict-Transport-Security');
    assert.ok(hsts, '必須設定 Strict-Transport-Security');
    assert.ok(hsts.value.includes('max-age=63072000'), 'max-age 必須至少兩年');
    assert.ok(hsts.value.includes('includeSubDomains'), '必須包含 includeSubDomains');
    assert.ok(hsts.value.includes('preload'), '必須包含 preload');
  });
});
```

- [x] **Step 2: 執行測試確認失敗**

執行 `node --test test/137_vercel_security_headers.test.mjs`。

- [x] **Step 3: 修改 `vercel.json` 補充 HSTS 標頭**

- [x] **Step 4: 重新執行測試並確認全數通過**

執行 `node --test test/137_vercel_security_headers.test.mjs`。

---

### Task 6: 整合回歸驗證、文件維護與版本更新

**Files:**
- Modify: `package.json` (版本由 0.1.319 升級至 0.1.320)
- Modify: `README.md` (繁體中文更新安全加固紀錄)
- Modify: `Changelog.md` (紀錄十項漏洞修復與安全性改善)

- [x] **Step 1: 執行既有測試套件與全數新測試**

執行：
```sh
node --test test/132_fix_payment_status_unpaid_precedence.test.mjs
node --test test/108_drive_photo_upload_compatibility.test.mjs
node --test test/94_fitness_proof_upload_and_drive_delete.test.mjs
node --test test/77_event_sheet_sync_transparency.test.mjs
node --test test/63_manual_create_event_sheet_and_import.test.mjs
node --test test/133_gas_worker_security_hardening.test.mjs
node --test test/134_supabase_rpc_security_guards.test.mjs
node --test test/135_admin_portal_rls_hardening.test.mjs
node --test test/136_notify_dispatcher_auth_hardening.test.mjs
node --test test/137_vercel_security_headers.test.mjs
```
確認所有測試皆無錯誤。

- [x] **Step 2: 遞增 `package.json` 版本號至 `0.1.320`**

- [x] **Step 3: 更新 `README.md` 與 `Changelog.md`**

詳實記錄本次 10 項弱點修復範圍與安全防護措施。

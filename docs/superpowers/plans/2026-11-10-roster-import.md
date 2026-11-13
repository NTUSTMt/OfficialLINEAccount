# 活動報名名冊：跨活動與社員名冊人員導入功能實作計畫 (Roster Import Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在電腦版幹部工作站報名名冊（`WebAdminRoster`）新增「新增/導入人員」功能，支援從其他活動複製名單（備案轉隊）與從社員名冊（含幹部篩選）手動補登人員，並具備防重與重啟已取消紀錄機制。

**Architecture:** 
1. 建立獨立純函式庫 `src/utils/rosterImportUtils.ts` 處理報名編號生成、名單分流（新寫入 vs 重啟更新已取消 vs 略過有效重複）與欄位快照格式化。
2. 開發 `src/components/admin/RosterImportModal.tsx` 雙分頁彈窗元件，透過 Supabase Client 批次寫入 `event_signups` 並記錄操作稽核日誌。
3. 於 `src/pages/web-admin/WebAdminRoster.tsx` 工具列整合開啟按鈕與回調重整機制。

**Tech Stack:** React 19, TypeScript, Lucide-react, Supabase JS Client, Node.js Test Runner.

**Spec:** [docs/superpowers/specs/2026-11-10-roster-import-design.md](file:///Users/brianhung/Documents/OfficialLINEAccount/docs/superpowers/specs/2026-11-10-roster-import-design.md)

---

## Global Constraints
- 嚴格禁止在回覆、提交訊息、程式碼與測試檔案中使用任何 Emoji。
- 遵循繁體中文文件與介面用語。
- 套件管理必須使用 `pnpm`。
- 錯誤訊息必須完整透明顯示具體錯誤原因與代碼，嚴禁模糊替換。
- 資料庫防重遵循 `idx_event_signups_active_unique` 規範。

---

## Review Focus
1. 目標活動若已存在「已取消 Cancelled」之同人員紀錄，系統必須執行 UPDATE 重啟更新而非重複 INSERT。
2. 目標活動若已存在有效報名者，彈窗列表必須自動反灰禁選並標註「已在此名冊中」，防止觸發 unique index 錯誤。
3. 跨活動複製已繳費人員時，必須正確將 `payment_status` 設為 `'已繳費 Paid'` 且自動在備註帶入 `【自來源活動名轉入】`，但不得改動 `payments` 原始單據。
4. 社員名冊篩選幹部時，正確比對 `is_officer === true`，若社員缺少身分證字號或緊急聯絡人，必須顯示「個資待補齊」徽章而不硬性阻擋。
5. 批次寫入後必須記錄管理員稽核日誌 `logWebAuditAction`（動作名稱 `BATCH_IMPORT_SIGNUPS`）。

---

### Task 1: 建立人員導入分流與格式化函式庫 (`rosterImportUtils.ts`)

**Files:**
- Create: `src/utils/rosterImportUtils.ts`
- Create: `test/106_roster_import.test.mjs`

- [x] **Step 1: 撰寫單元測試**
  建立 `test/106_roster_import.test.mjs`，測試以下行為：
  1. `generateSignupId()` 產生符合 `S` 開頭且不重複的編號。
  2. `partitionImportCandidates()`：
     - 若人員在目標名冊中已為有效狀態（審核中、正取、備取），判定為 `conflict`（禁用）。
     - 若人員在目標名冊中為已取消（`Cancelled`），判定為 `reactivate`（需 UPDATE）。
     - 若人員不在目標名冊中，判定為 `insert`（需 INSERT）。
  3. `formatSignupRowForInsert()` 與 `formatSignupRowForReactivate()` 正確設定 `status`、`payment_status`、快照欄位，並於 `notes` 自動加上來源活動標籤。
  4. 驗證程式碼與測試檔案無任何 Emoji。

- [x] **Step 2: 執行測試確認失敗**
  執行 `node --test test/106_roster_import.test.mjs`，確認因模組尚未建立而失敗。

- [x] **Step 3: 實作 `src/utils/rosterImportUtils.ts`**
  實作函式：
  - `generateSignupId(): string`
  - `partitionImportCandidates(candidates, existingTargetSignups)`
  - `buildImportNotes(originalNotes, sourceEventTitle, customNotes)`
  - `checkProfileCompleteness(member)`

- [x] **Step 4: 執行測試確認通過**
  執行 `node --test test/106_roster_import.test.mjs`，確認所有單元測試通過。

---

### Task 2: 實作雙分頁人員導入彈窗元件 (`RosterImportModal.tsx`)

**Files:**
- Create: `src/components/admin/RosterImportModal.tsx`
- Modify: `src/pages/web-admin/webAdmin.css`

- [x] **Step 1: 定義元件介面與狀態**
  在 `RosterImportModal.tsx` 中定義：
  - Props: `isOpen`, `onClose`, `targetEventId`, `targetEventTitle`, `existingSignups`, `onSuccess`, `currentUserId`.
  - 分頁切換狀態：`from_event`（從其他活動複製）與 `from_members`（從社員名冊新增）。
  - 選取狀態 `selectedIds: Set<string>`、狀態設定、載入中與錯誤訊息提示。

- [x] **Step 2: 實作分頁 1（從其他活動複製）**
  - 載入活動清單（以 `start_date` 倒序）。
  - 選擇來源活動後，撈取該活動 `event_signups` 與 `members` 關聯。
  - 渲染名冊列表，標示原狀態、繳費狀態；若已存在於目標名冊則反灰並標示「已在此名冊中」。
  - 提供快捷勾選：「全選正取」、「全選備取」、「清空選取」。
  - 提供匯入選項：目標錄取狀態（維持原狀態 / 統一正取 / 統一備取）、目標繳費狀態（維持原繳費狀態 / 統一未繳費）、是否保留備註。

- [x] **Step 3: 實作分頁 2（從社員名冊新增）**
  - 載入 `members` 清單。
  - 支援關鍵字搜尋（姓名、學號、系所、電話）與「僅顯示幹部（`is_officer`）」切換。
  - 標註「個資待補齊」徽章（若缺少 `id_card` 或 `emergency_contact_name`）。
  - 提供匯入選項：目標錄取狀態（預設正取）、目標繳費狀態、自訂幹部備註。

- [x] **Step 4: 實作批次寫入與稽核邏輯**
  - 使用 `partitionImportCandidates` 區分 `insert` 與 `reactivate`。
  - 對 `reactivate` 呼叫 `supabase.from('event_signups').update(...)` 清除 `cancel_reason`。
  - 對 `insert` 呼叫 `supabase.from('event_signups').insert(...)`。
  - 寫入稽核紀錄 `logWebAuditAction`。
  - 發生錯誤時直接印出 PostgreSQL 錯誤訊息；成功後呼叫 `onSuccess()` 並關閉視窗。

- [x] **Step 5: 樣式調整與防跑版檢查**
  檢視 `webAdmin.css`，確保彈窗、分頁切換列、搜尋框、勾選表格與徽章在電腦版幹部工作站下樣式一致且無溢出破版。

---

### Task 3: 整合至 `WebAdminRoster.tsx` 與重新整理聯動

**Files:**
- Modify: `src/pages/web-admin/WebAdminRoster.tsx`

- [x] **Step 1: 引入 `RosterImportModal` 與狀態**
  - 在 `WebAdminRoster.tsx` 新增 `isImportModalOpen` 狀態。
  - 在頂部工具列（AI 評分與匯出 TSV 按鈕旁）新增「+ 新增/導入人員」按鈕（帶 `UserPlus` 圖示）。

- [x] **Step 2: 掛載彈窗並綁定資料重整**
  - 當 `isImportModalOpen === true` 且有 `selectedEventId` 時渲染 `RosterImportModal`。
  - 傳入 `existingSignups={signups}`、`onSuccess={loadSignups}` 與 `currentUserId={session.userId}`。

- [x] **Step 3: 驗證型別與建置**
  執行 `pnpm run build`，確認 TypeScript 型別與 Vite 打包完全無錯誤。

---

### Task 4: 自動化測試擴充、驗證與文件更新

**Files:**
- Modify: `test/106_roster_import.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `Changelog.md`

- [x] **Step 1: 擴充測試案例**
  在 `test/106_roster_import.test.mjs` 加入元件結構檢查與原始碼約束檢查：
  - 驗證 `WebAdminRoster.tsx` 包含「新增/導入人員」按鈕與 `RosterImportModal`。
  - 驗證 `RosterImportModal.tsx` 包含雙分頁、防重判定、重啟更新已取消、個資提示與無 Emoji 規範。

- [x] **Step 2: 執行完整測試套件**
  執行 `pnpm run test`，確認全數 700+ 項測試通過。

- [x] **Step 3: 遞增版本號並更新文件**
  - 依專案規範在 `package.json` 遞增 patch 版本號。
  - 依專案規範以繁體中文更新 `README.md` 與 `Changelog.md`（無 Emoji）。

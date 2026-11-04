# 幹部頁面功能擴充實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為社團幹部管理後台新增三大核心功能：去識別化 AI 體能與登山經驗評估排序、活動內容 AI 一鍵雙語翻譯（總字數上限 1400 字元且格式鏡像對應）、以及名單表格橫縱雙向色彩標記與原地直接編輯。

**Architecture:** 後端擴充既有之 Supabase Edge Function (`notify-dispatcher`)，新增 `ai_evaluate_applicants` 與 `ai_translate_event` 兩項 action，安全調用 Gemini API；前端在 `src/utils/api.ts` 封裝型別通訊層，於 `WebAdminEvents`/`AdminEventForm` 整合一鍵翻譯與還原，並於 `WebAdminRoster` 擴充雙向色彩調色盤、原地編輯（靜默儲存）與 AI 評估分數呈現/排序，同時 100% 完整保留名單表格既有功能。

**Tech Stack:** React 19, TypeScript, Vite, Supabase Edge Functions (Deno), Google Gemini 3.5 Flash, Lucide-react.

**Spec:** [`docs/superpowers/specs/2026-11-03-admin-features-design.md`](file:///Users/brianhung/Documents/OfficialLINEAccount/docs/superpowers/specs/2026-11-03-admin-features-design.md)

## Global Constraints
- 回覆、提交訊息與程式註解中嚴禁使用任何 Emoji。
- 嚴禁讓 AI 存取任何 PII（姓名、電話、學號、Line ID、身分證號、緊急聯絡人資訊等）。
- 嚴禁在前端暴露 Gemini API 金鑰。
- 活動簡介與行程之總字數上限為 1400 字元。
- 英文輸出格式必須嚴格鏡像對應中文版（分天結構、時間箭頭符號 `→`、地點序列）。
- 表格調色盤介面不可出現「選擇顏色：」等文字，直接顯示純色圓圈。
- 備註原地編輯於 onBlur 或 Enter 時自動靜默儲存，不跳出 Toast 提示。
- 100% 保留現有名單表格所有既有功能（欄位順序、欄寬縮放、隱藏、凍結、搜尋、篩選、推播、查看證件、個人檔案彈窗、匯出）。
- 嚴格遵守 pnpm 套件管理與繁體中文文件規範。

## Review Focus
1. 去識別化防護：確認前端在打包報名資料傳送給後端前，已完全剝除所有敏感個資欄位。
2. 英文翻譯字數與格式：翻譯結果總字數是否嚴格 ≤ 1400 字元，且保留分天與箭頭對齊。
3. 表格雙向色彩衝突與持久化：橫向與縱向同時上色時，儲存格背景透明度自然疊加且重新整理後完整保留。
4. 原地編輯靜默儲存與錯誤處理：備註與狀態更新不跳成功通知，但若網路失敗必須有錯誤警示，且不丟失使用者輸入。
5. 現有表格功能無回歸（Zero-regression）：縮放、凍結、多重篩選與自訂欄位排序等既有行為均維持正常。

---

## Tasks

### Task 1: 後端 Edge Function (`notify-dispatcher`) 擴充 AI 評估與翻譯端點
**Files:**
- `supabase/functions/notify-dispatcher/aiService.ts` (新建)
- `supabase/functions/notify-dispatcher/index.ts` (修改)
- `supabase/functions/notify-dispatcher/aiService.test.ts` (新建)

- [x] Step 1: 建立 `supabase/functions/notify-dispatcher/aiService.ts`，實作 `evaluateApplicantsAi` 與 `translateEventAi` 函式，包含對 Gemini API 的結構化呼叫（指定 responseSchema 或 JSON mode）、後端第二道去識別化防護驗證，以及錯誤處理。
- [x] Step 2: 撰寫 `supabase/functions/notify-dispatcher/aiService.test.ts` 驗證去識別化檢查、Prompt 組裝、JSON 結構解析與字數截斷邏輯。
- [x] Step 3: 在 `supabase/functions/notify-dispatcher/index.ts` 的 action 路由中新增 `ai_evaluate_applicants` 與 `ai_translate_event` 處理邏輯，包含幹部權限驗證。
- [x] Step 4: 執行 Deno 測試確認後端 AI 邏輯正常運作：
  `deno test --allow-net --allow-env supabase/functions/notify-dispatcher/aiService.test.ts`

---

### Task 2: 前端通訊層封裝與型別定義
**Files:**
- `src/types/admin.ts` (修改)
- `src/utils/api.ts` (修改)

- [x] Step 1: 在 `src/types/admin.ts` 新增 AI 評估資料型別（`ApplicantEvaluation`、`ApplicantEvaluationResult`）與活動翻譯輸入/輸出型別（`EventTranslationInput`、`EventTranslationResult`）。
- [x] Step 2: 在 `src/utils/api.ts` 新增 `evaluateApplicantsViaAi` 函式，落實前端前端個資剝除（僅保留 `anonymousId`, `outdoor_experience`, `fitness_desc`, `medical_history`），並實作報名名冊超過 30 人時每 25 人一組的自動分批機制。
- [x] Step 3: 在 `src/utils/api.ts` 新增 `translateEventViaAi` 函式，傳送活動標題、簡介、行程並接收鏡像翻譯結果。
- [x] Step 4: 執行型別檢查：
  `pnpm run typecheck`

---

### Task 3: 活動內容 AI 一鍵雙語翻譯介面整合
**Files:**
- `src/components/admin/AdminEventForm.tsx` (修改)
- `src/pages/web-admin/WebAdminEvents.tsx` (修改)

- [x] Step 1: 在 `AdminEventForm.tsx` 與 `WebAdminEvents.tsx` 英文分頁/欄位旁新增「AI 一鍵雙語翻譯」按鈕，加入 Loading 旋轉動畫與防重複點擊鎖定。
- [x] Step 2: 實作直接填入 `title_en`、`summary_en`、`itinerary_en` 之狀態更新邏輯，並保存翻譯前的前次內容快照，提供「一鍵還原」按鈕。
- [x] Step 3: 限制總字數提示與輸入框字數計算器，確保總長度不超過 1400 字元。
- [x] Step 4: 執行建置驗證：
  `pnpm run build`

---

### Task 4: 名單表格橫縱雙向色彩調色盤與持久化
**Files:**
- `src/pages/web-admin/WebAdminRoster.tsx` (修改)
- `src/pages/web-admin/webAdmin.css` (修改)

- [x] Step 1: 定義 6 色色彩常數（灰、藍、綠、黃、橘、紫）的標頭色、邊框色與微底色（`rgba`）。
- [x] Step 2: 在 `WebAdminRoster.tsx` 擴充 `TablePreferences` 型別，新增 `columnColors: Record<string, string>` 與 `rowColors: Record<string, string>`，整合進依 `eventId` 索引的 `localStorage` 持久化邏輯。
- [x] Step 3: 在縱向欄位標頭與橫向列序號旁新增純色圓圈按鈕，點擊展開極簡浮動選色器（無文字，僅 6 個純色圓點），選取後即時套用微底色與邊條。
- [x] Step 4: 測試點擊外側關閉調色盤、清除色彩（灰）、重整頁面後顏色持久化維持，並驗證橫縱色彩交疊時的自然透明度融合。

---

### Task 5: 名單表格原地直接編輯與 AI 體能經驗評估排序
**Files:**
- `src/pages/web-admin/WebAdminRoster.tsx` (修改)

- [x] Step 1: 實作原地直接編輯：將審核狀態改為原地下拉選單（即時寫入 Supabase `event_signups`），備註筆記改為原地文字輸入框（於 `onBlur` 或 `Enter` 時靜默背景更新，不跳任何 Toast 提示，失敗時彈出具體錯誤）。
- [x] Step 2: 工具列新增「AI 體能與經驗綜合排序」按鈕，點擊時觸發所有非取消報名者的去識別化評估流程。
- [x] Step 3: 評估結果快取至 `localStorage`（`wa_roster_ai_evaluations_v1_${eventId}`），表格新增「AI 適合度」與「評估理由」欄位，並支援點擊「依 AI 分數排序」進行原地名單重排。工具列提供「重新評估」按鈕。
- [x] Step 4: 執行嚴格無回歸驗證（Regression check）：逐一測試既有之欄位縮放、拖曳順序、凍結、隱藏、全文字搜尋、狀態篩選、推播通知發送、查看證件及匯出 Google Sheets 功能，確認 100% 正常運作。

---

### Task 6: 專案品質保證與文件維護
**Files:**
- `README.md` (修改)
- `Changelog.md` (修改)
- `package.json` (修改)

- [x] Step 1: 遞增 `package.json` 版本號至 `0.1.325`。
- [x] Step 2: 以繁體中文更新 `Changelog.md`（遵循 Keep a Changelog 規範與 `[0.1.325]`）。
- [x] Step 3: 以繁體中文更新 `README.md`（同步版本標籤與最新異動紀錄）。
- [x] Step 4: 執行全套自動化測試套件（`pnpm test`）、型別檢查（`pnpm exec tsc -b`）與前端建置（`pnpm run build`），確認 100% 通過。
- `CHANGELOG.md` (修改)
- `package.json` (修改)

- [ ] Step 1: 執行 TypeScript 型別檢查：
  `pnpm run typecheck`
- [ ] Step 2: 執行前端 Production Build：
  `pnpm run build`
- [ ] Step 3: 遞增 `package.json` 版本號 tag。
- [ ] Step 4: 以繁體中文更新 `README.md`（紀錄幹部 AI 審核、雙語翻譯與表格自訂色彩功能）與 `CHANGELOG.md`（於 `[Unreleased]` 新增 `Added` 條目）。

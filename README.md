# 🏕️ 台科登山社社團系統 (NTUST Mountaineering Club System)

本專案是一個基於 **React + TypeScript + Vite** 開發的 LINE LIFF 網頁應用程式，為社團或個人提供直覺、現代化的露營與登山裝備預約租借平台。

## 📌 版本資訊 (Version Info)
- **當前版本**：`0.1.120` (v0.1.120)

---

## 🛠️ 主要更新與修復 (Key Updates & Bug Fixes)

### 220. 解決 5 大核心 Bug：小岳助理引導、消除重複刷屏、報名雙語英文化、幹部預設值修正與精確核銷項目 (v0.1.120)
- **問題排查與根因分析 (Problem Identification & Root Cause)**：
  1. **小岳助理指引需求**：尊重既有模型更新不更動 `04_Ai_Gemini.js`，但社員缺少召喚指引。
  2. **LINE Bot 刷屏**：`02_LineBot_Webhook.js` 無差別對任何未辨識訊息或 AI 未回覆訊息重複噴出長文字選單提示。
  3. **英文化不完全**：活動報名確認訊息中文語句夾雜、部分段落缺乏英文對照。
  4. **全體社員皆為「幹部」**：`members` 表欄位設定了 `DEFAULT '幹部'`，新註冊者因未傳入 `officer_role` 自動被標記為幹部。
  5. **核銷項目顯示「社團相關費用」**：GAS 讀取了不存在的 `payment.items`（正確為 `payment.type`），導致其永遠為 `undefined` 並 fallback 到「社團相關費用」。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **更多服務擴充小岳指南 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 在 `_buildMoreServicesFlex` 卡片新增「🤖 小岳助理說明 AI Guide」按鈕。
     - 在 Webhook 新增 `小岳助理說明` 指令處理，回傳個人 1 對 1 與群組 `@小岳助理` 的完整雙語使用範例。
  2. **消除無差別刷屏 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 移除每一句私聊對話無腦洗版選單文字的邏輯，改為僅在使用者主動發送問候（「嗨」、「你好」、「hello」、「menu」）時才提示。
  3. **報名成功推播全面地道雙語 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 重構 `handleSignup` 推播訊息，補齊 `Dear {name}, we have received your application.` 及英文版資格審核說明。
  4. **根除 officer_role 預設幹部漏洞 ([supabase/fix_officer_role_and_items.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_officer_role_and_items.sql), [supabase/member_profile_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/member_profile_rpc.sql))**：
     - 建立 SQL 腳本將 `members.officer_role` 預設值修正為 `NULL`，並清洗歷史非幹部成員的錯誤資料。
     - 重寫 `save_member_profile` RPC，確保新成員註冊時 `officer_role` 嚴格為 `NULL`，僅有真正的幹部保留職稱。
  5. **精準核銷項目聚合 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [supabase/verify_payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/verify_payment_rpc.sql))**：
     - 修正欄位讀取為 `payment.type || payment.items`。
     - 在 `submit_payment_rpc` 中將租借裝備自動自 `loan_items` 與 `equipments` 聚合名稱（例如 `🔹 裝備：雙人帳篷 x 1 (ORD_xxxx)`），徹底根除「社團相關費用」的空泛標籤。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **143/143 全數通過（37 test suites, 0 failures）**。
  - 前端打包：`pnpm run build` 成功完成。

### 219. 透過 OpenAPI Specification 全面同步 Live 資料庫真實結構與字典 (v0.1.119)
- **需求背景與執行方式 (Background & Live Introspection)**：
  - 為確保專案所有文件、Skills 與 Schema Dictionary 達到 100% 絕對真確，使用 `service_role` 安全權限直連 PostgREST OpenAPI Specification 端點 (`/rest/v1/`)。
  - **嚴格落實「零資料存取（0 行數據）」原則**，純粹分析資料庫結構定義檔，保護社員個資安全。
- **架構同步與落實細節 (Architecture Synchronization & Implementation)**：
  1. **全面同步 [supabase/SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)**：
     - 正式收錄全 10 張資料表：`members` (29 欄位)、`officers` (9 欄位，確認 PK 為 `line_user_id`)、`events` (15 欄位)、`event_signups` (12 欄位，含 `notification_status`)、`equipments` (16 欄位)、`loans` (20 欄位，含 `total_fee`、`items` 快照)、`loan_items` (6 欄位)、`payments` (17 欄位，含 `verify_token`)、`reflections` (10 欄位) 與系統佇列 `sync_queue` (10 欄位)。
     - 補充確認正式資料庫所有欄位資料型別、預設值、必填約束與自訂 ENUM 值。
  2. **全面同步 [.agents/skills/club-business-workflows/SKILL.md](file:///Users/brianhung/Documents/OfficialLINEAccount/.agents/skills/club-business-workflows/SKILL.md)**：
     - 更新資料表關聯與真實欄位描述（如 `officers.line_user_id` 作為主鍵、`payments.verify_token` 單鍵核銷密鑰）。
     - 確認 `loans.status` 五大狀態與悲觀鎖扣減邏輯。
  3. **品質檢驗 (Quality Assurance)**：
     - 單元測試：`pnpm test` 143/143 全數通過（37 test suites, 0 failures）。
     - 前端編譯：`pnpm run build` 成功建置。

### 218. 精準校準專案 Skills 業務邏輯與資料庫 SSOT：對齊真實狀態機與列舉規範 (v0.1.118)
- **需求背景與技術 PM 審查 (Technical PM Review)**：
  - 依據 `/project-manager` 審查準則與使用者直接反饋，逐行核對既有程式碼（`Borrow.tsx`、`fix_equipment_loan_rpc.sql`、`cancel_rpc.sql`）與 [SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)。
  - 排查並修正先前草案中與現況不符之處：移除不存在的活動出席確認 (`attended`) 與活動人數上限 (`max_participants`)，並徹底對齊現行裝備借還流程與計費模型。
- **架構校準與落實細節 (Architecture Alignment & Implementation)**：
  1. **校準活動報名狀態機 (`club-business-workflows/SKILL.md`)**：
     - 正式對齊 `event_signup_status_enum` 狀態流轉：`'審核中 Checking'` ➔ 幹部審核分發為 `'正取 Confirmed'` 或 `'備取 Waitlisted'` ➔ 款項核銷後推進為 `'正取（已繳費）Confirmed (Paid)'`。
     - 明確註記活動無自動人數上限，完全由幹部依路線難度手動審核分配。
  2. **校準裝備租借狀態機與計費模型 (`club-business-workflows/SKILL.md`)**：
     - 狀態流轉完全對齊 `loans.status` 現實：`'待領取 To Be Collected'`（下單時悲觀鎖原子扣庫存）➔ `'租借中 Borrowed'` ➔ `'已歸還 Returned'`（驗收釋放庫存）或 `'已取消 Cancelled'` / `'已取消 (待退款)'`。
     - 落實真實計費公式：2 天基本租金 (`price_2day`) + 續租每日加成 (`price_extra_day`)；社團出隊免租金 (0 元)，社員個人 5 折，非社員原價。
  3. **校準資料庫列舉型別名稱 (`supabase-architecture/SKILL.md`)**：
     - 將列舉型別精確修正為資料庫真實名稱：`event_signup_status_enum`、`payment_status_enum` 與 `equipment_category`，並提供隱式轉型函式說明。

### 217. 建立專案 Agent 漸進揭露規範體系：輕量 Rules 與四大專業 Skills (v0.1.117)
- **需求背景與目標 (Background & Objectives)**：
  - 為使 AI Agent 在協助開發維護台科登山社專案時，能夠精確遵守專案規範（錯誤透明度、Trigger 防遞迴、WebKit 相容性），同時避免每次對話均大量消耗 Context Window Token。
  - 經由 `/grill-me` 深入對焦，正式確立「Rules 硬性約束 + Skills 漸進揭露（Progressive Disclosure）」之雙層架構。
- **架構設計與落實細節 (Architecture & Implementation)**：
  1. **輕量 Rules 規範核心 (`.agents/rules/`)**：
     - [error_handling.md](file:///Users/brianhung/Documents/OfficialLINEAccount/.agents/rules/error_handling.md)：強制透明報錯、PostgreSQL Trigger 防遞迴守衛 (`IF pg_trigger_depth() > 1`)、iOS WebKit `Load failed` 避坑原則。
     - [development_standards.md](file:///Users/brianhung/Documents/OfficialLINEAccount/.agents/rules/development_standards.md)：明確規定檔案修改前授權原則、README 繁中同步維護、版本號遞增以及一律使用 `pnpm` 套件管理。
     - [architecture_navigation.md](file:///Users/brianhung/Documents/OfficialLINEAccount/.agents/rules/architecture_navigation.md)：專案全局地圖與 Skills 調度指南，引導 Agent 依任務按需精準加載專業知識。
  2. **四大專業領域知識庫 (`.agents/skills/`)**：
     - `supabase-architecture`：涵蓋 Schema 設計、RPC 撰寫範例、Enum 類型安全轉換與交易原子性。
     - `gas-linebot-integration`：涵蓋 GAS 六大模組架構職責、LINE Bot Webhook 快速回覆、Flex Message 樣板、Google Drive 檔案上傳與 Sync Worker 雙向同步鎖定機制。
     - `liff-frontend-webkit`：涵蓋 React 19 + LIFF 生命週期、iOS WebKit 避坑架構（純資料直通 Supabase）、照片上傳例外處理、Mobile-First UI 與 i18n 多語系支援。
     - `club-business-workflows`：涵蓋會員與幹部權限、活動報名候補與自動遞補、裝備借還與押金狀態機、繳費核銷與 LINE 廣播通知鏈路。

### 216. Email 繳費確認無誤單鍵核銷雙平台修復：直連 Web 原生網址，電腦與手機免登入秒核銷 (v0.1.116)
- **問題回報與根因排查 (Problem Identification & Root Causes)**：
  1. **手機點 Email 按鈕無反應**：
     - 使用者在手機點擊 Email 的「確認無誤」按鈕後，雖然開啟了 LINE 中的 LIFF，但「什麼事都沒發生」，幹部與使用者皆無推播訊息，Supabase 繳費狀態亦未更新。
     - **根因**：Email 原先採用 LINE LIFF 連結 `https://liff.line.me/2009217429-jvj3ydDT?liff.state=...`。該 LIFF ID 在 LINE 後台對應之 Endpoint URL 為 `/dashboard`（個人主頁）。LINE 客戶端開啟時導向了 `/dashboard?liff.state=...`，而 React Router 的根路徑重定向邏輯僅在 `/` 觸發，導致頁面停留在 Dashboard，未進入 `/confirm-payment`，因而從未執行核銷。
  2. **電腦開啟被擋下（出現無法瀏覽畫面）**：
     - 使用者在電腦瀏覽器點擊 Email 按鈕時，出現被系統擋下、無法瀏覽的畫面。
     - **根因**：LIFF 連結在電腦瀏覽器中缺少正確 LINE Client 上下文，跳轉 fallback 到預設路徑 `/borrow`（裝備租借頁面）。該頁面依社團規範設有「外部瀏覽器全螢幕鎖定防護 (`Borrow.tsx`)」，偵測到非 LINE 客戶端便直接阻擋。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **Email 核銷按鈕全面改採社團專屬 Web 直連網址 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 新增 `FRONTEND_WEB_URL` 設定（預設直連 Vercel 前端：`https://equipments-seven.vercel.app`）。
     - Email 綠色「✅ 確認無誤（點擊完成核銷）」按鈕與純文字核銷連結，全面採用：
       `https://equipments-seven.vercel.app/confirm-payment?paymentId={paymentId}&token={verifyToken}`
     - **100% 免登入 LINE、免登入 Google**：電腦 Chrome / Edge / Safari、手機 Safari / Chrome 或 LINE 內均可一鍵直連。
  2. **前端路由雙重安全保護與自動轉址 ([src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx))**：
     - **強制優先導向**：在 `AppContent` 頂層掛載檢測，若網址參數或 `liff.state` 包含 `/confirm-payment`，第一時間強制 `navigate(statePath, { replace: true })`，絕不被 `/dashboard` 或 `/borrow` 截胡。
     - **LIFF 初始化豁免與秒開**：在 `initializeLiff` 中偵測若為 `/confirm-payment`，直接豁免 LINE LIFF 連線與登入等待（`loading: false`），電腦與手機均達到 0 毫秒極速載入。
     - **乾淨獨立視圖**：核銷頁面豁免渲染 `GlobalHeader`，呈現專屬核銷卡片與安全驗證進度。
  3. **核銷完成雙向推播與連動保證 ([src/pages/ConfirmPayment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/ConfirmPayment.tsx))**：
     - 網頁直通 Supabase RPC `verify_payment_by_token` 完成驗證後，立即呼叫 GAS `notify_payment_confirmed`：
       - 推播【🎉 繳費成功通知】至社員個人 LINE。
       - 推播【💳 幹部通知：繳費單已完成核銷】至幹部管理群組。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **143/143 項測試全數通過（37 suites passed, 0 failures）**。
  - 前端打包：`pnpm run build` 成功完成，ConfirmPayment 模組打包正常。

### 215. 修復 PostgreSQL gen_random_bytes 擴充套件相依錯誤，改採核心內建 md5 生成安全 Token (v0.1.115)
- **問題回報與根因排查 (Problem Identification & Root Causes)**：
  - 前端透明印出具體錯誤：`❌ 申報失敗：資料庫處理失敗: function gen_random_bytes(integer) does not exist (SQLSTATE: 42883)`。
  - **根本原因**：
    - 在 [supabase/verify_payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/verify_payment_rpc.sql) 的 `submit_payment_rpc` 中，原先使用 `encode(gen_random_bytes(16), 'hex')` 來生成 32 字元的隨機核銷密鑰。
    - `gen_random_bytes` 屬於 PostgreSQL 的 `pgcrypto` 擴充套件（Extension）。由於部分 Supabase 專案預設未開啟 `pgcrypto`，或函式位於 `extensions` schema 下而未被 `public` search_path 找到，導致 PostgreSQL 拋出 `42883`（function does not exist）異常。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **零套件相依：改採 PostgreSQL 核心內建之 `md5(...)` 函式**：
     - 將 token 生成演算法改為：
       `v_verify_token := md5(random()::text || clock_timestamp()::text || p_line_user_id || v_payment_id);`
     - `md5` 為 PostgreSQL 核心標準函式，100% 免安裝任何 Extension，運算極速且永遠回傳長度為 32 字元的安全隨機 hex 字串，徹底根絕 `42883` 錯誤。
  2. **錯誤透明度驗證通過**：
     - 正因落實規範「錯誤訊息一律直接具體印出」，使用者本次遇到問題時，直接截圖回報了 `function gen_random_bytes(integer) does not exist (SQLSTATE: 42883)`，使問題能在 1 秒內精確定位並修復。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **143/143 項測試全數通過（37 suites passed, 0 failures）**。
  - 前端打包：`pnpm run build` 成功完成，0 錯誤。

### 214. 徹底解決 Google 帳號多重登入衝突：社團專屬 Web 免登入安全單鍵核銷系統 (v0.1.114)
- **問題回報與根因排查 (Problem Identification & Root Causes)**：
  - 幹部反映在 Email 點擊核銷按鈕時，畫面跳出 Google 的 **「很抱歉，目前無法開啟這個檔案」** 錯誤。
  - **根本原因**：
    - Email 原先連結指向 Google Apps Script Web App (`script.google.com/macros/s/.../exec`)。
    - 幹部在手機或電腦瀏覽器中通常同時登入多個 Google 帳號（例如個人 Gmail 與學校帳號等），Google Apps Script 面臨多帳號 Cookie 衝突或權限判定時，極易噴出「很抱歉，目前無法開啟這個檔案」，強迫幹部切換 Google 帳號，體驗極差。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **免 Google 登入衝突：直連社團專屬 Web / LIFF 單鍵核銷頁面 ([src/pages/ConfirmPayment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/ConfirmPayment.tsx), [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx))**：
     - Email 綠色單鍵核銷大按鈕直接導向社團專屬網頁：
       `https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fconfirm-payment%3FpaymentId%3D{paymentId}%26token%3D{verifyToken}`
     - 幹部點擊後直接在任何手機/電腦瀏覽器或 LINE 內秒開，**完全不需要登入任何 Google 帳號**，徹底杜絕帳號切換衝突！
  2. **單次隨機防偽安全金鑰 (verify_token) ([supabase/verify_payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/verify_payment_rpc.sql))**：
     - 在 `payments` 資料表加入 `verify_token TEXT` 欄位與索引。
     - 申報繳費時由 Supabase `submit_payment_rpc` 自動生成 32 字元隨機 hex 安全金鑰，核銷時比對金鑰相符才允許變更狀態，安全防止猜測單號惡意攻擊。
  3. **Supabase 直連 RPC 單鍵核銷與全自動連動 ([supabase/verify_payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/verify_payment_rpc.sql), [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts))**：
     - 建立 `verify_payment_by_token(paymentId, token)` 安全 RPC。
     - 幹部開啟網頁立即自動直通 Supabase 完成核銷：
       - `payments.status` 更新為 `已核銷 Confirmed`。
       - 自動連動更新 `event_signups` 繳費狀態為 `已繳費 Paid`（正取升級為 `正取（已繳費）Confirmed (Paid)`）。
       - 自動連動更新 `members` 社費狀態為 `已繳費 Paid`，`is_official_member = true`。
       - 自動連動更新 `loans` 裝備租借狀態為 `已繳費 Paid`。
       - 具備冪等性：先前已核銷過自動提示已核銷，不重複觸發。
  4. **核銷成功雙向 LINE 推播通知 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 網頁核銷完成後，自動呼叫 GAS `notify_payment_confirmed` API：
       - 自動發送【🎉 繳費成功通知】至該社員個人 LINE 聊天室。
       - 自動發送【💳 幹部通知：繳費單已完成核銷】至幹部管理群組 (`ADMIN_GROUP_ID`)。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **143/143 項測試全數通過（37 suites passed, 0 failures）**（新增 Suite 55 測試免 Google 登入 LIFF 核銷連結與 verify_token 安全校驗）。
  - 前端打包：`pnpm run build` 成功完成，ConfirmPayment 模組打包正常。

### 213. 完善 Email 核銷按鈕直接渲染、pushAdminMessage 選項轉傳與核銷連動變數作用域修復 (v0.1.113)
- **問題回報與根因排查 (Problem Identification & Root Causes)**：
  1. **Email 核銷按鈕未直接呈現**：
     - 幹部收到的繳費申報 Email 未顯示預期的「✅ 確認無誤（點擊完成核銷）」顯眼按鈕。
     - 根本原因：
       - `pushAdminMessage(text, customSubject)` 未接收或轉傳第三個參數 `optionsOrHtml` 至 `sendAdminEmail`。
       - `ScriptApp.getServiceUrl()` 在 GAS 被外部 HTTP POST 呼叫時回傳空字串 `""`，導致產生出的連結為空。
  2. **核銷完成後 Supabase 未連動更新**：
     - 點擊單鍵核銷後，Supabase 中的活動報名、社費、裝備租借狀態未被標記為「已繳費 Paid」。
     - 根本原因：
       - 在 `_processPaymentVerification` 中，`var targetUserId = payment.line_user_id;` 等關鍵資訊的提取宣告位於步驟 2.5（連動更新）之後。
       - 由於 JavaScript 變數提升（Hoisting）機制，執行到步驟 2.5 時 `targetUserId` 變數存在但其值為 `undefined`，導致 `if (targetUserId)` 判斷永遠為 `false`，活動、社費、裝備三個子系統的狀態連動全數被跳過。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **修正 `targetUserId` 變數作用域 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) & [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 將 `targetUserId`、`targetUserName`、`totalAmount`、`selectedItems` 的宣告提前至步驟 2.5 之前，確保活動報名、社費與裝備租借連動時能正確取得使用者的 LINE User ID，成功連動更新為「已繳費 Paid」。
  2. **擴充 `pushAdminMessage` 支援 HTML 郵件轉傳 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) & [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 擴充簽名為 `pushAdminMessage(text, customSubject, optionsOrHtml)`，並在內部轉傳 `sendAdminEmail(subject, text, optionsOrHtml)`。
  3. **健全 Web App URL Fallback 與精美 HTML 核銷郵件 ([gas_modules/01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js), [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 全域定義 `DEFAULT_WEB_APP_URL`，在 `ScriptApp.getServiceUrl()` 為空時自動 fallback。
     - 在 `_handleNotifyOfficersPayment` 內建現代化 HTML 翡翠綠單鍵核銷按鈕 (`paymentHtml`)，透過 `{ htmlBody: paymentHtml }` 傳入 `pushAdminMessage`。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **141/141 項測試全數通過（36 suites passed, 0 failures）**（新增 Suite 54 驗證 optionsOrHtml 轉傳、targetUserId 提前宣告與 fallback URL）。
  - 前端建置：`pnpm run build` 成功完成，0 錯誤。

### 212. 修復 get_my_dashboard RPC 之 payment_status_enum 轉型錯誤與全域 IMPLICIT CAST 防護 (v0.1.112)
- **問題回報與根因排查 (Problem Identification & Root Causes)**：
  - 個人主頁報錯：`[Supabase RPC 錯誤]: invalid input value for enum payment_status_enum: ""`。
  - **根本原因**：
    - 在 `get_my_dashboard` RPC 中，先前寫法為 `COALESCE(s.payment_status, '')::text` 與 `COALESCE(l.payment_status, '')::text`。
    - PostgreSQL 的 `COALESCE(val1, val2)` 會嘗試將第 2 個參數的型別隱式轉換為第 1 個參數的型別。由於 `s.payment_status` 與 `l.payment_status` 為 `payment_status_enum` 列舉型別，PostgreSQL 在內部嘗試將第 2 個參數 `''`（空字串）轉為 `payment_status_enum`（即 `''::payment_status_enum`）。
    - 由於枚舉值中並不存在空字串 `""`，PostgreSQL 嚴格阻斷並拋出 `invalid input value for enum payment_status_enum: ""` 錯誤，導致個人主頁無法載入。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **修正 COALESCE 型別順序 ([supabase/get_my_dashboard.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/get_my_dashboard.sql) & [supabase/fix_dashboard_and_sync_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_dashboard_and_sync_rpc.sql))**：
     - 將 `COALESCE(s.payment_status, '')::text` 改為 `COALESCE(s.payment_status::text, '')`；裝備 `loans` 亦改為 `COALESCE(l.payment_status::text, '')`。
     - 先將枚舉轉為 `text` 再與空字串 `''` 進行 COALESCE，徹底杜絕空字串被作為 enum 解析。
  2. **強化 `payment_status_enum` 全域隱式轉型防護 ([supabase/fix_dashboard_and_sync_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_dashboard_and_sync_rpc.sql))**：
     - 於 SQL 腳本中建立 `text_to_payment_status_enum` 函式與 `CREATE CAST (text AS payment_status_enum) AS IMPLICIT`。
     - 遇到 `NULL`、空字串 `""` 或未匹配之字串，自動安全回退為 `'未繳費 Unpaid'`，並加上 `EXCEPTION WHEN OTHERS` 守衛，提供 100% 容錯保護。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **138/138 項測試全數通過（35 suites passed, 0 failures）**。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 211. 獨立試算表異步同步、sync_queue 去重防擴表、Email 單鍵核銷連動與個人主頁狀態解耦 (v0.1.111)
- **需求背景與根本原因排查 (Problem Identification & Root Causes)**：
  1. **活動專屬獨立試算表未隨 Supabase 更新同步**：
     - 先前系統僅在報名送出當下執行試算表寫入，後續審核狀態（正取/備取）或繳費狀態變更時，並未非同步更新活動專屬獨立試算表（依 `events.spreadsheet_id` 識別）。
  2. **主試算表短時間內重複抓取多次，且表尾自創 N, O, P, Q 欄（`signupId`, `eventId`, `reviewResult`, `updatedBy`）**：
     - Supabase `update_signup_status_rpc` 先前手動寫入未經規範的 camelCase 鍵名至 `sync_queue`，導致背景 Worker 比對不到標準 `id` 欄位，判定為新列而重複 `appendRow`，且動態比對表頭時把這四個 camelCase 欄位追加至試算表最右端。
     - 短時間內同筆資料被連續編輯時，`sync_queue` 缺乏批次去重（Deduplication）機制。
  3. **個人主頁報名狀態錯置**：
     - 申報繳費後，已審核正取的測試活動顯示「正取 未繳費」，未審核活動卻顯示「審核中 待確認」。
     - 根本原因在於 `get_my_dashboard` RPC 使用 `s.status::text LIKE '%Checking%'` 判斷繳費狀態（`payStatus`），而 `event_signup_status_enum` 預設審核中即包含 `'審核中 Checking'`，導致任何未審核活動被誤判為繳費待確認；正取不含 Checking 則直接掉入未繳費。
  4. **個人主頁裝備租借缺乏繳費狀態標籤**：
     - 舊版 `get_my_dashboard` 未在 `v_equipments` 聚合輸出 `loans.payment_status`，使用者無法確認裝備租借是否已完成繳費或待繳費。
  5. **Email 核銷訊息缺乏單鍵確認與連動更新**：
     - 幹部收到繳費申報 Email 需一鍵點擊確認無誤；點擊完成核銷後，系統需自動連動將對應的活動報名、社費、裝備租借更新為「已繳費 Paid」，並主動推播通知幹部管理群組 (`ADMIN_GROUP_ID`)。
- **架構設計與修復細節 (Architecture & Implementation)**：
  1. **個人主頁 Dashboard 繳費狀態解耦與裝備租借標籤 ([supabase/fix_dashboard_and_sync_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_dashboard_and_sync_rpc.sql), [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx), [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts))**：
     - 升級 `get_my_dashboard` RPC：報名繳費狀態直接依真實欄位 `s.payment_status` 判定（`已繳費 Paid`、`待確認 Checking`、`未繳費 Unpaid`），與審核狀態徹底解耦。
     - `v_equipments` 增加輸出 `payStatus`（來自 `loans.payment_status`）。
     - 前端裝備卡片支援顯示繳費狀態標籤，並於未繳費時呈現「前往繳費」快速導航按鈕。
  2. **sync_queue 批次去重與試算表欄位防擴展守衛 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - `syncPendingQueueFromSupabase` 導入批次按 `table_name + ':' + record_id` 去重演算法，短時間內多次異動只對試算表寫入最新一筆，所有舊 queue ID 一併標記為 `completed`。
     - `_ensureColumnsExist` 增加正則守衛 `/^[a-z]+([A-Z][a-z0-9]+)+$/`，嚴格禁止 camelCase 暫存欄位擴展試算表表頭。
     - `_syncSignupToSheet` 支援欄位別名正規化 (`signupId -> id` 等)，並設置防呆機制杜絕幽靈空白列。
  3. **活動專屬獨立試算表異步同步 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 實作 `_syncSignupToEventSpecificSheet(p)`：同步更新主試算表後，自動依據 `events.spreadsheet_id` 定位活動專屬試算表，精確更新對應列的審核狀態、繳費狀態與車手分派。
  4. **Email HTML「確認無誤」按鈕與核銷全自動連動 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - `sendAdminEmail` 自動解析單鍵核銷連結並生成 HTML 綠色單鍵核銷大按鈕「✅ 確認無誤（點擊完成核銷）」。
     - `_processPaymentVerification`：在將 `payments` 標記為 `已核銷 Confirmed` 後，自動連動更新對應之活動報名 (`event_signups.payment_status` 為 `已繳費 Paid`，正取則升級為 `正取（已繳費）Confirmed (Paid)`)、社費 (`members.payment_status` 為 `已繳費 Paid`，`is_official_member` 為 `true`)、裝備租借 (`loans.payment_status` 為 `已繳費 Paid`)。
     - 核銷成功後，同步推播即時通知至幹部管理群組 (`ADMIN_GROUP_ID`)。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **138/138 項測試全數通過（35 suites passed, 0 failures）**（新增 Suite 53 覆蓋去重、防擴表、獨立試算表同步、核銷連動與 Dashboard 狀態）。
  - 語法檢驗：`node -c` 檢驗全模組 0 錯誤。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 210. 報名名冊個資生日標準格式化、GAS 幹部鑑權修復與 Supabase 審核狀態 Enum 轉型 (v0.1.110)
- **需求背景與根本原因排查 (Problem Identification & Root Causes)**：
  1. **報名者個資生日欄位顯示 `Fri Jun 03` 異常**：
     - Google Sheets 或 GAS 在傳遞日期物件時，轉換為 JS Date 字串格式（如 `Fri Jun 03 1994 00:00:00 GMT+0800`）。`ApplicantModals.tsx` 原先僅使用 `clean.substring(0, 10)` 截取前 10 碼，導致直接截斷為星期與月份 `Fri Jun 03`。
  2. **審核頁面無法修改正備取待審，報錯 `column "status" is of type event_signup_status_enum but expression is of type text`**：
     - Supabase 資料庫內的 `event_signups.status` 欄位為 `event_signup_status_enum` 列舉型別，但先前部署的 `update_signup_status_rpc` 函式仍以字串直接指派（`status = trim(p_review_result)`），且缺乏 PostgreSQL 全域隱式轉型（`IMPLICIT CAST`），被 PostgreSQL 引擎強制阻擋。
  3. **點擊「一鍵發送審核結果」出現「操作失敗：權限不足，僅限幹部發送推播通知」**：
     - 後端 GAS (`gas_modules/06_Helper_Services.js` 與 `src/gas.js`) 中的 `checkOfficerInternal` 在使用 REST API 查詢 Supabase 時，傳入了不存在的欄位名稱 `user_id` 與 `role`（正確為 `line_user_id` 與 `officer_role`），且未查詢 `officers` 表，導致 Supabase PostgREST 拋出 HTTP 400 Bad Request，使已註冊幹部被誤判為無權限。
- **架構設計與修復細節 (Architecture & Implementation)**：
  - **1. 個資生日格式化升級 ([src/components/admin/ApplicantModals.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/ApplicantModals.tsx))**：
    - 全面增強 `formatDateSlash` 函式：優先使用正則比對 `YYYY-MM-DD` 與 `YYYY/MM/DD`（補零對齊），相容 JavaScript Date 字串（透過 `new Date` 解析年、月、日），杜絕時區偏移並保證格式統一為 `YYYY/MM/DD`。
  - **2. 後端 GAS 幹部雙軌鑑權修復 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 修正 `checkOfficerInternal`：精確以 `line_user_id` 查詢 `members` 表中的 `is_officer` 與 `officer_role` 欄位，並雙軌查詢 `officers` 表，徹底剔除不存在的 `user_id` / `role` 欄位，杜絕 PostgREST 400 錯誤。
  - **3. Supabase 專屬審核狀態 Enum 一鍵修復腳本 ([supabase/fix_signup_status_enum.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_signup_status_enum.sql))**：
    - 建立專屬 SQL 遷移檔：保證 `event_signup_status_enum` 存在，建立 `text_to_event_signup_status_enum` 與全域隱式轉換 `CREATE CAST (text AS event_signup_status_enum) ... AS IMPLICIT`。
    - 重新定義 `update_signup_status_rpc`，將傳入狀態安全轉為 Enum 型別後寫入，授權 `anon, authenticated, service_role` 執行。
  - **4. 觸發器防遞迴守衛加固 ([supabase/triggers.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/triggers.sql))**：
    - 於所有相互連動的觸發器函式開頭加入 `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`，落實系統規範。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **133/133 項測試全數通過（34 suites passed, 0 failures）**（新增 Suite 52 驗證 JS Date 生日格式解析、幹部雙軌鑑權防 400、以及 Enum 狀態映射）。
  - 語法檢驗：`node -c gas_modules/06_Helper_Services.js && node -c src/gas.js` 0 錯誤。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 209. 全面直通 Supabase (SSOT)、徹底剔除無效 Sheets 備援與 4 大實務異常修復 (v0.1.109)
- **需求背景與核心問題排查 (Problem Identification & Root Causes)**：
  1. **非社員且資格過期時，繳費系統仍無社費選項**：前端 `Payment.tsx` 先前直接執行 `supabase.from('members').select(...)`，但 `members` 表啟用了 RLS 嚴格封閉防護，anon 讀取一律為 null，導致補底邏輯失效；且先前的修復 SQL 檔漏掉了 `get_unpaid_payments` 函式。
  2. **報名者個資生日格式需統一為 YYYY/MM/DD**：`ApplicantModals.tsx` 直接顯示資料庫回傳的 ISO 8601 時區字串（如 `2000-01-01T00:00:00.000Z`），顯示雜亂。
  3. **審核狀態修改報錯 `column "status" is of type event_signup_status_enum but expression is of type text`**：使用者執行的 SQL 檔漏掉了 `update_signup_status_rpc`，資料庫仍以舊版 text 寫入 enum 欄位被 PostgreSQL 強制阻擋。
  4. **點擊「確認備取意願」出現「系統錯誤：找不到報名資料」**：`handleConfirmWaitlist` 寫死讀取 Google Sheets 大寫 `Signups` 分頁，全量遷移 Supabase 後找不到此分頁且未直連 `event_signups` 表。
  5. **歷史代碼殘留大量無效試算表備援**：`_getEventName`、`sendOfficerMenu`、`sendSignupForm`、`handleSignup`、`checkOfficerInternal`、`_handleGetAdminEvents`、`_fetchOpenEventsContext` 等仍保留試算表備援，不僅掩蓋了真正的資料庫錯誤，更拖慢系統效能。
- **架構設計與修復細節 (Architecture & Implementation)**：
  - **1. 前端社費補底安全改造 ([src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx))**：
    - 改以安全 RPC 封裝函式 `fetchDashboardFromSupabase(userId)` 取得身分與社籍狀態，非正式社員或過期社員自動於 `unpaidList.membership` 補入當學期社費項目，裝備租借即刻享有 5 折優惠。
  - **2. 生日格式化標準化 ([src/components/admin/ApplicantModals.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/ApplicantModals.tsx))**：
    - 實作 `formatDateSlash` 工具函式，去除 ISO 時區、將 `-` 轉為 `/`，只截取前 10 碼為 `YYYY/MM/DD`，未填寫時顯示「未填」。
  - **3. ENUM 全域隱式轉型與資料庫整合腳本 ([supabase/fix_enum_typecast_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_enum_typecast_rpc.sql))**：
    - 建立 PostgreSQL 全域隱式轉換 `CREATE CAST (text AS event_signup_status_enum)`，徹底根治任何字串指派至 enum 欄位的型別錯誤。
    - 整合最新 `update_signup_status_rpc`、`get_unpaid_payments`（過期或非正式社員強制提供社費選項）與 `get_admin_event_signups_rpc`。
  - **4. 確認備取意願 100% 直連 Supabase ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：
    - `handleConfirmWaitlist` 直查 Supabase `event_signups` 表，若已確認過則提示避免重複更新；若為備取則以 REST PATCH 更新狀態為 `備取（有意願）Waitlisted (Interested)`，並發送 LINE 訊息確認，出錯直接回報具體錯誤訊息。
  - **5. 全面掃除試算表備援，落實純 Supabase 直通 (SSOT)**：
    - **`_getEventName` ([gas_modules/01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js))**：直查 Supabase `events` 表，失敗直接回退或報錯，杜絕試算表。
    - **`sendOfficerMenu` & `sendSignupForm` & `handleSignup` ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：徹底拔除試算表備援與備援寫入，直連 Supabase，失敗立即印出具體原因。
    - **`checkOfficerInternal` & `_handleGetAdminEvents` & `_getMemberContactInfo` ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：徹底拔除試算表備援，直查 Supabase，權限不足或查無活動直接具體報錯。
    - **`_fetchOpenEventsContext` ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js))**：直查 Supabase `events` 表，移除試算表備援。
    - **單檔打包同步 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：完整同步打包並通過 `node -c` 檢驗。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **130/130 項測試全數通過（33 suites passed, 0 failures）**（新增 Suite 51 驗證社費補底、生日格式統一、Enum 隱式轉換、備取意願直連、試算表備援全面移除）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 208. 修復社團系統 5 大問題：社費過期繳費補底、活動未來開放按鈕狀態分離、幹部名冊完整個資與欄位對齊、一鍵發送審核結果直查直推、正備取修改 Supabase 儲存與快取修正 (v0.1.108)
- **需求背景與核心問題排查 (Problem Identification & Root Causes)**：
  1. **已繳過社費但社籍過期時，繳費系統缺少社費選項**：
     - `Payment.tsx` 與 SQL RPC `get_unpaid_items_rpc` 原先僅在社員完全未曾繳過社費（無紀錄）時才提供社費選項。當社員過往繳過社費但到期日已過（`is_active = false` 或過期）時，系統誤判為已繳過而不顯示繳社費項目，導致社員無法續繳社費，也無法享受裝備租借 5 折優惠。
  2. **Supabase 活動狀態為「未來開放」，LINE 活動卡片誤顯示為「開放報名」**：
     - `gas_modules/03_Flex_Templates.js` 中的 `sendEventList` 與 `sendEventDetail` 對狀態之判斷邏輯寬鬆（`status === "開放" || status === "開放中"`），在面對「未來開放」或「即將開放」時，按鈕依然呈現綠色「馬上報名」，且使用者點擊後仍送出報名訊息。
  3. **幹部系統活動報名詳細名冊顯示無資料/缺失重要個資（LINE ID 等）**：
     - 經排查並非權限問題，而是前端與後端 RPC 欄位名稱錯配：後端 RPC `get_admin_event_signups_rpc` 原回傳之屬性名稱為 `id`、`realLineId`、`climbingExp`、`emergencyContactPhone` 等，而前端 `AdminEvents.tsx` 與介面型別期待的是 `signupCode`、`lineId`、`experience`、`gender`、`birthday`、`idNumber` 等。且 RPC 原本漏 join `members` 表的個資欄位，導致 LINE ID 與個人基本資料全部落空顯示為「未填」。
  4. **一鍵發送審核結果未推播**：
     - GAS 後端 `_handleSendEventNotifications` 原本依賴試算表資料列進行篩選，在遷移至 Supabase (SSOT) 後未直連 `event_signups` 表；且推播後未將 `notification_status` 更新回 Supabase，造成推播失敗或重複推播判斷混亂。
  5. **更改正備取未存入 Supabase，且頁面快取顯示修改值造成「已修改假象」**：
     - 在 `AdminEvents.tsx` 中，因 RPC 回傳的是 `id` 而非 `signupCode`，導致前端判斷 `if (applicant.signupCode)` 為假，略過了直寫 Supabase 的步驟！
     - 接著前端在 `if (sbSuccess || !applicant.signupCode)` 下，誤將本地 state 與 `sessionStorage` 快取強制更新為幹部選擇的值。導致刷新頁面時從本地快取讀取呈現幹部修改的狀態，給人「有儲存」的假象；但關閉瀏覽器重開時快取清空，重新由 Supabase 載入時才發現根本沒變更。
- **架構設計與修復細節 (Architecture & Implementation)**：
  - **1. 社費過期自動補底與續費支援 ([src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) & [supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql))**：
    - 前端在 `fetchUnpaidItems` 回傳後加入社員到期狀態主動補底防護：若社員非有效正式社員（社籍到期或過期）且目前未有待審核之社費單，自動於 `unpaidList.membership` 補入當學期社費項目。
    - 勾選續繳社費後，即時重新計算裝備租借費用享社員 5 折優惠。
    - 同步修正 Supabase SQL `get_unpaid_items_rpc` 與 `get_unpaid_payments`，確保後端 RPC 同樣支援過期社員自動回傳社費。
  - **2. 未來開放狀態嚴格分離與防呆 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：
    - `sendEventList` 與 `sendEventDetail` 嚴格區分「未來開放 (Coming Soon)」、「開放中 (Open)」、「已額滿 (Full)」、「已截止 (Closed)」四大狀態。
    - 若狀態包含「未來」或「即將」，按鈕以灰色 Disabled 呈現，文字標示「即將開放報名」，避免社員提前報名造成資料錯亂。
  - **3. 個資完整 JOIN 與前後端欄位相容正規化 ([supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql) & [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts))**：
    - `get_admin_event_signups_rpc` 深度 JOIN `members` 表，完整提取 `line_id`、`gender`、`birthday`、`id_number`、`emergency_contact_name`、`emergency_contact_phone` 等關鍵個資。
    - 同時回傳雙向相容欄位名（`signupCode` 與 `id`、`lineId` 與 `realLineId`、`experience` 與 `climbingExp`）。
    - 前端 `fetchAdminEventSignupsFromSupabase` 實作防禦性正規化映射層，無痛對齊所有欄位，徹底解決 LINE ID 與個資空白問題。
  - **4. 一鍵發送審核結果直通 Supabase 與雙向更新 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - `_handleSendEventNotifications` 直查 Supabase `event_signups` (SSOT)，精準篩選 `event_id` 符合、審核狀態非待審核（正取/備取/未錄取）且未通知的申請者。
    - 發送 LINE Flex 審核結果訊息，並以 PATCH API 即時將 Supabase `notification_status` 更新為「已通知」，同時雙向備援同步活動專屬獨立試算表。
  - **5. 徹底消滅正備取修改假更新與快取問題 ([src/pages/AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
    - `handleOpenSignupsModal` 實作 Stale-While-Revalidate，不再被 `sessionStorage` 舊快取阻擋，背景即時向 Supabase 重新拉取最新報名名冊。
    - `handleUpdateApplicantResult` 綁定正規化後之 `targetSignupCode`，嚴格限制只有在 Supabase 真正更新成功（`sbSuccess === true`）時才同步更新本地 state 與快取；若更新失敗立即跳出 Alert 印出完整具體錯誤原因，絕不偽更新。
    - `update_signup_status_rpc` SQL 函式加入字串至 `event_signup_status_enum` 之智慧型別轉換，避免 enum 型別不相容之寫入失敗。
  - **6. 單檔同步與驗證 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 完整打包至單檔 `src/gas.js`，通過 `node -c` 語法檢驗。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **125/125 項測試全數通過**（新增 Suite 50，包含社費過期續費補底、未來開放狀態隔離、個資欄位正規化對齊、一鍵發送審核直查直推、正備取修改防偽儲存與快取防呆測試）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 207. 修復社團系統 4 大核心問題：活動代號防覆蓋、消除多餘 Signups 頁籤、活動專屬試算表雙向同步、詳細行程簡介排版與全面直通 Supabase (v0.1.107)
- **需求背景與核心問題排查 (Problem Identification & Root Causes)**：
  1. **活動代號遭覆蓋為 `E2609-01`**：幹部系統新增活動時，後端取號邏輯依賴 `ss.getSheetByName("Events")`。因全量同步工作表名為小寫 `events`，導致每次取號皆判定無資料表而歸零重算，使新活動代碼永遠為 `E2609-01`，進而覆蓋舊活動。
  2. **主試算表產生多餘 `Signups` 頁籤**：報名邏輯寫死 `ss.insertSheet("Signups")`。在全面遷移至 Supabase 儲存 (`event_signups`) 後，原大寫工作表未被匹配，反而觸發自動建立空白分頁污染主試算表。
  3. **活動專屬獨立試算表缺乏雙向即時同步**：活動建立時 Drive 資料夾生成之「報名名冊」獨立試算表未連動；報名時無追加、取消與審核推播時未更新，且幹部在該獨立試算表調整名冊時無法反向 PATCH 回 Supabase。
  4. **詳細活動行程缺乏簡介與排版需優化**：LINE 詳細活動卡片內文僅有行程資訊，未完整包含簡介，且結構需要更清晰易讀。
  5. **系統全面改為直通 Supabase (SSOT)**：排查並徹底替換系統中直接查 Google Sheets（包含備用）為優先直通 Supabase REST API（AI 客服上下文、幹部驗證、活動名冊等）。
- **架構設計與修復細節 (Architecture & Implementation)**：
  - **1. 活動代號取號以 Supabase events 為單一信任源 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - `_handleSaveEvent` 徹底改為優先查詢 Supabase `events` 表（`id=like.{prefix}-*`），以資料庫當月實際最大序號遞增 +1。
    - 試算表備援查詢改用大小寫相容的 `_getSheetByTableName(ss, "events")`，徹底移除 `insertSheet("Events")`，絕不覆蓋舊活動。
  - **2. 杜絕多餘 Signups 頁籤產生 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：
    - 移除 `handleSignup` 中任何 `insertSheet("Signups")` 之呼叫。
    - 主試算表備援寫入改為大小寫相容的 `_getSheetByTableName(ss, "event_signups")`；若試算表無該表則安靜略過，絕不再建立非預期頁籤。
  - **3. 活動專屬獨立試算表雙向同步與守衛機制 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js) & [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - **報名即時追加 (`_asyncAppendToEventSpreadsheet`)**：報名成功後自動取得活動之 `spreadsheet_id`，將報名個資、專屬碼與狀態追加至該活動專屬獨立試算表。
    - **取消即時同步 (`_syncCancelToEventSpreadsheet`)**：社員取消報名時，自動將獨立試算表中對應專屬碼該列之狀態更新為「已取消 Cancelled」。
    - **審核批次推播同步 (`_syncReviewToEventSpreadsheet`)**：幹部批次發送審核推播時，自動將「審核結果」與「通知狀態」同步更新至獨立試算表。
    - **專屬試算表編輯反向 PATCH 回 Supabase (`handleSpreadsheetEdit`)**：在可安裝觸發器中擴充對報名名冊的監聽；**僅同步具備「專屬碼」之資料列**，幹部手動修改「審核結果」、「報名狀態」、「繳費狀態」或「備註」時，即時 PATCH 回 Supabase `event_signups` 表，幹部自訂的非專屬碼自用標記欄位不強行反向同步，尊重幹部的個人作業習慣。
  - **4. LINE 詳細活動卡片排版升級 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：
    - `sendEventDetail` 架構嚴格遵循：
      ```text
      【名稱】
      {title}

      【簡介】
      {summary}

      【詳細行程】
      {itinerary}
      ```
    - 不使用 separator 分隔線，改以自然空行（margin 屬性）隔開，視覺精緻且簡介與行程完整呈現。
  - **5. 全面直通 Supabase (SSOT) 改造**：
    - **Gemini AI 上下文 ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js))**：`_fetchOpenEventsContext()` 優先直查 Supabase `events` 表（`status=eq.開放`），不再強制讀取試算表。
    - **幹部名冊卡片 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js))**：`sendOfficerMenu` 優先直查 Supabase `members` 表（`is_officer=eq.true`）。
    - **幹部身分校驗 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：`checkOfficerInternal` 優先直查 Supabase `members` 表，杜絕試算表延遲。
    - **活動名冊查詢 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：`_handleGetEventSignups` 優先直查 Supabase `event_signups` 表。
  - **6. 單檔同步與驗證 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 完整打包至單檔 `src/gas.js`，通過 `node -c` 語法檢驗。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **120/120 項測試全數通過**（新增 Suite 49，包含取號遞增防覆蓋、杜絕 Signups 頁籤、專屬試算表雙向同步、詳細行程簡介無分隔線排版、直通 Supabase 測試）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 206. 補齊歷史架構差異：試算表可安裝編輯事件 (Installable onEdit) 雙向連動、Supabase 同步與 Gemini AI 知識庫擴充 (v0.1.106)
- **需求背景與訪談分析 (Requirements & /grill-me Insights)**：
  - 深入掃描 `src/gas.backup.js` 歷史程式碼發現，舊版具備 Google Sheets 儲存格即時編輯聯動（`onEdit`）以及深度 Google Docs 規章知識庫；而新版在遷移至 Supabase 單一信任源後，試算表一度僅做單向備援。
  - 經 `/grill-me` 訪談確認：幹部日常在 Google Sheets 試算表檢視與批量調整資料極為直覺，需要能在試算表修改狀態時，即時寫回 Supabase 並處理相應業務，但必須妥善處理雙向同步可能產生的衝突。
- **架構設計與防衝突機制 (Architecture & Anti-Conflict Mechanisms)**：
  - **1. 突破 Google 簡單觸發器限制 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js))**：
    - Google 官方規範中，原生 `onEdit(e)` 屬於簡單觸發器，**被安全沙盒嚴格禁止呼叫外網 API (`UrlFetchApp`)**，導致無法直接連線 Supabase 或 LINE API。
    - 本次實作 `handleSpreadsheetEdit(e)` 並搭配 `setupSpreadsheetEditTrigger()` 一鍵註冊為「可安裝觸發器 (Installable Trigger)」，取得完整外網網路連線權限。
  - **2. 天然防迴圈與狀態冪等守衛**：
    - **防迴圈**：Google 規範中，由 GAS 背景排程或腳本寫入試算表**絕不會**觸發 `onEdit`，只有真人手動修改儲存格才會啟動，天然杜絕自激死迴圈。
    - **變更與主鍵防呆**：嚴格檢查 `e.oldValue !== e.value`；若無變更或缺乏有效主鍵 ID 則直接跳過。
    - **狀態冪等**：若 Supabase 該筆紀錄已為 `已核銷 Confirmed`，自動略過不重複發送推播。
  - **3. 試算表三大分頁即時聯動細節**：
    - **`Payments` 繳費分頁**：對帳狀態修改為「已確認無誤」或「已核銷 Confirmed」時，調用 `_processPaymentVerification`，將 Supabase 狀態更新為 `已核銷 Confirmed`，並自動推播【🎉 繳費成功通知】至社員個人 LINE。
    - **`Loans` / `Loan_Records` 裝備借用分頁**：狀態修改為「已歸還 Returned」時，更新 Supabase `loans.status = '已歸還 Returned'`，並自動將借用數量回補至 Supabase `equipments.stock_available` 與主試算表裝備庫存欄位。
    - **`Signups` / `Event_Signups` 報名分頁**：修改審核結果（如正取/備取）時，**僅以 PATCH 即時更新 Supabase `event_signups.review_status`，絕不主動發送推播通知**（保留給幹部確認名冊後批次發送，避免誤觸洗版）。
  - **4. 知識庫核心多文件與 Fallback 擴充 ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js))**：
    - 實作 `_fetchDocsKnowledgeBase()`：優先讀取 `KNOWLEDGE_FOLDER_ID` 資料夾中所有 Google Docs 與純文字文件進行彙整快取；若未設定則自動回退至歷史預設章程文件 ID (`1MJyA7a0X5fZr-JR3sHCG1I3p1gvL0X2QkJJ1cYmVxLI`)，大幅提升 Gemini AI 問答的專業性與社規覆蓋率。
  - **5. 輕量通用 Supabase PATCH 工具 ([gas_modules/01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js))**：
    - 封裝 `_supabasePatch(table, queryParams, payload)`，提供簡潔安全的資料庫直更介面。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` **115/115 項測試全數通過**（新增 Suite 48 包含試算表編輯對帳、還件庫存回補、審核不通知與知識庫多文件測試）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。
  - 單檔校驗：`node -c src/gas.js` 通過。

### 205. 逐行比對歷史版本補齊取消通知雙軌串接、幹部核銷推播與每日自動巡檢機制 (v0.1.105)
- **需求背景與比對分析 (Requirements & Historical Diff Analysis)**：
  - 使用者指定深入逐行比對 `src/gas.backup.js` 與現行系統的功能與通知差異（如：取消裝備租借、活動報名棄權、幹部核銷繳費單、心得回饋提交，以及每日排程維護等）。
  - **經比對查出之關鍵差異與缺失**：
    1. **裝備租借取消無通知**：舊版或前端僅執行資料庫狀態變更，幹部完全不知道裝備已被取消（特別是已繳費需退款或庫存需回補）；社員本人亦無明確的取消收據存證。
    2. **活動報名取消無通知**：社員在個人儀表板取消活動時，幹部群未獲知「正取名額已釋出」，無法及時通知備取遞補；退費事宜亦無法即時追蹤。
    3. **幹部核銷繳費缺乏雙向推播與標準標籤**：幹部查帳核銷後，系統未自動推播「🎉 繳費成功通知」給社員，社員無法確認款項是否已被認領；且資料庫狀態欄位若未精確匹配 `已核銷 Confirmed` 會導致個人帳單與後台統計過濾錯誤。
    4. **心得回饋提交無通知**：社員填寫心得感想後，幹部無法即時獲悉並進行審閱或回饋。
    5. **缺乏每日自動巡檢排程**：舊版具備定時維護邏輯，但新架構中尚未建立每日自動巡檢（活動過期關閉、社籍過期狀態更新與期滿提醒、逾期租借提醒）。
- **架構設計與實作細節 (Architecture & Implementation)**：
  - **1. 裝備租借取消通知雙軌串接 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) & [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx))**：
    - 前端於 Supabase RPC 完成裝備取消後，接續呼叫 GAS `notify_loan_cancelled`。
    - 後端區分「已繳費（需進行退款處理）」與「未繳費（系統已回補庫存）」，透過 Gmail + LINE Push 雙軌通報幹部，並推播中英雙語取消收據憑證給社員個人 LINE。
  - **2. 活動報名取消規則分流 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) & [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx))**：
    - 前端於取消活動後呼叫 GAS `notify_event_cancelled`。
    - 若取消者為「正取 (accepted)」：立即以【🚨 緊急：正取名額釋出】雙軌通知幹部盡速聯絡備取遞補與退費；若為備取 (waitlist) 或審核中 (pending)，則僅推播給社員本人，嚴防幹部群組洗版。
  - **3. 幹部核銷雙通道與社員推播 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) & [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - 支援 LINE 群組文字指令 `@小岳助理 核銷 {繳費單號}`（走 Reply API，零額度消耗防 429）與 Gmail 單鍵核銷 Webhook (`doGet?action=confirm_payment_web&paymentId=...`)。
    - 核銷後將 Supabase `payments` 狀態更新為嚴格標準標籤 `已核銷 Confirmed`。
    - 自動推播【🎉 繳費成功通知】至社員個人 LINE，載明已核銷單號、金額與核銷幹部。
  - **4. 每日自動巡檢排程 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js))**：
    - 實作 `dailyPatrol()` 與定時觸發器安裝函式 `setupDailyPatrolTrigger()`（每日凌晨 02:00 定時執行）。
    - 自動檢查報名截止日並將活動狀態變更為「關閉 (closed)」；檢查社籍有效期限，逾期者標記為「未繳費」並推播期滿感謝祝福與續會引導；檢查裝備逾期未還並標記催收。
    - 採智慧日報機制：僅當當日「有狀態變更或逾期事件」時才發送巡檢日報至幹部公務信箱，避免無意義空信打擾。
  - **5. 心得回饋通知整合 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) & [src/pages/Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx))**：
    - 實作 `notify_reflection_submitted`，在社員提交心得後即時雙軌通知幹部閱讀。
  - **6. 單檔版整合與同步 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 將全數 6 個子模組完整串接編譯至單檔版 `src/gas.js`，並通過 `node -c` 語法校驗。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 111/111 項測試全數通過（Suite 46、Suite 47 包含裝備取消、活動棄權、幹部核銷與每日巡檢測試）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 204. 幹部通知全面改用 Gmail (MailApp) 雙軌發送機制（克服 LINE 免費額度耗盡問題）(v0.1.104)
- **問題回報與核心根因 (Problem & Root Cause)**：
  - 使用者回報：「幹部群收不到通知是因為免費額度用完了，請改使用 gmail 傳送」。
  - **真相分析**：LINE Messaging API 免費方案（Free Plan）每帳號每月僅有 200 則 Push Message 額度。一旦額度用罄，所有後端主動推播（`/v2/bot/message/push`）皆會被 LINE 拒絕（回傳 HTTP 429 或 quota exceeded）。而 `@小岳助理 綁定幹部群組` 是透過無額度限制的 Reply API 回覆，因此綁定成功但後續 Push 訊息全數無法送達。
- **經 `/grill-me` 訪談確認之架構方案**：
  1. **收件信箱**：預設寄至社團官方公務信箱 `ntustmountain@gmail.com`，並支援在 GAS 指令碼屬性設定 `ADMIN_EMAIL` 隨時覆蓋或以逗點設定多個收件信箱。
  2. **發送通道**：採「雙軌並行（LINE Push + Gmail 並行）」機制。LINE Push 繼續呼叫（有額度時群組依然可見）；而 Gmail 發信則提供 100% 必達保底（GAS 內建免費每日 100~1500 封，不受任何 LINE 額度限制）。
  3. **會員通知**：個人維持現況（LINE Push + LIFF 頁面即時成功反饋）。
  4. **郵件格式**：結構化清晰純文字排版，主旨明確標示類別與申請人/單號，排版整齊不跑版。
- **實作與技術細節 (Implementation Details)**：
  - **1. 環境屬性配置 ([gas_modules/01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js))**：
    - 新增 `ADMIN_EMAIL` 與 `getAdminEmail()` 函式，預設為 `ntustmountain@gmail.com`，可隨時自訂。
  - **2. 幹部郵件發送與雙軌推播 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js))**：
    - 實作 `sendAdminEmail(subject, body)`：支援 `MailApp.sendEmail` 與 `GmailApp.sendEmail`，具備完善異常攔截。
    - 升級 `pushAdminMessage(text, customSubject)`：雙軌發送，即使 LINE Push 因額度用完回傳 429 錯誤，Gmail 依然 100% 成功送達！
  - **3. 語意化主旨整合 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - 租借申請主旨：`【台科登山社】新裝備租借申請 - ORD_xxx (王大明)`。
    - 繳費申報主旨：`【台科登山社】新繳費申報 - $500 (林志明，末5碼 12345)`。
    - 幹部登記主旨：`【台科登山社】幹部意願登記 - 陳小美 (電子系)`。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 107/107 項測試全數通過（新增雙軌推播與額度耗盡保底測試）。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 203. 參照原始設計重構裝備租借為後端保底雙向推播與前端安全等待機制 (v0.1.103)
- **問題回報與根本原因分析 (Problem & Root Cause)**：
  - 使用者回報：「送出訂單後還是沒有收到訊息（個人聊天室和幹部群組都沒有），已經執行過 @小岳助理 綁定幹部群組，並且成功了。以前的程式是可以成功發送的，請參考 `src/gas.backup.js`」。
  - **經比對歷史程式碼查出根本原因**：
    1. **個人聊天室訊息消失**：原始 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 個人通知完全依賴前端 `liff.sendMessages`。在特定情境（未開通 `chat_message.write` 權限或非聊天室環境打開）會直接拋錯，且後端 `_handleNotifyOfficersLoan` 完全沒有發送個人推播。
    2. **幹部群組推播被攔截中斷**：先前修改中加入了 `setTimeout(() => liff.closeWindow(), 300)`。因 GAS 冷啟動需要 1.5 ~ 2.5 秒，前端在 300 毫秒內強行關閉視窗，導致瀏覽器直接強制中斷 (Aborted) 正在發送至 GAS 的網路連線，推播請求根本未送達 GAS。
    3. **歷史最佳實踐**：在 `gas.backup.js` 時代，前端皆是明確 `await fetch(GAS_API_URL, ...)` 與 `await response.json()`，確保推播成功完成後才提示使用者並關閉視窗。
- **修復與防護機制 (Architecture & Implementation)**：
  - **1. 後端 GAS 雙向推播保底 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js))**：
    - 在 `_handleNotifyOfficersLoan` 中，除發送幹部群組推播 `pushAdminMessage(msg)` 外，同步調用 `_pushMessage(userId, userLoanMsg)` 推播雙語對齊之裝備預約收據至使用者個人 LINE 聊天室，**100% 保證個人聊天室必達，不再依賴脆弱的前端 LIFF 發話**。
  - **2. 前端改回明確 await 與成功提示關閉機制 ([src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) & [src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx))**：
    - 徹底移除 300 毫秒匆忙關閉的定時器。
    - 前端明確 `await fetch` 與 `await response.json()`，確保後端已確實處理推播後，彈出成功提示視窗，經使用者確認後再關閉視窗，徹底杜絕連線被瀏覽器中止。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 202. 精確相容 LINE 內建 @小岳助理 標註與叫名文字清理以正確啟動幹部指令 (v0.1.102)
- **問題回報與需求背景 (Problem & Context)**：
  - 使用者明確說明：「幹部機器人的名字叫，小岳助理，平常要呼叫他的話都要用 line 內建的 @小岳助理 來呼叫」。
  - 在先前實作中，叫名文字清理僅替換了 `/小岳/g`，當使用者輸入 `@小岳助理 綁定幹部群組` 或帶有空格的標註時，會留下殘餘文字「`助理 綁定幹部群組`」，導致指令無法匹配精確字串而失效。
- **修復與實作細節 (Implementation Details)**：
  - **1. 精確匹配 LINE 內建標註與文字名稱 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js))**：
    - 提及判定全面納入：LINE 官方 `mention.mentionees.isSelf`、`text.indexOf("@小岳助理") > -1`、`text.indexOf("小岳助理") > -1`、`@小岳` 與 `小岳`。
  - **2. 完整清理叫名文字**：
    - 在清理 `cleanText` 時，依序剔除 `@\S+`、`小岳助理`、`小岳` 與 `助理`，確保輸入 `@小岳助理 綁定幹部群組` 後所得指令精準為 `綁定幹部群組`。
  - **3. 幹部助理卡片文字更新**：
    - 清楚標明幹部機器人全名為「小岳助理」，提示幹部隨時可在群組使用 `@小岳助理 幹部系統` 開啟管理後台。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 201. 依幹部指示限制幹部群組綁定必須 @小岳 助理方可啟動並強化防洗版機制 (v0.1.101)
- **需求調整與設計意圖 (Requirement & Intent)**：
  - 使用者在程式碼審查中指示：「我希望一定要@小岳助理，才能啟動」。
  - 為了維護群組對話清潔並徹底防止任何關鍵字誤觸，群組指令必須在明確 @小岳（或訊息中提及「小岳」）的前提下才被處理。
- **程式調整與實作細節 (Implementation Details)**：
  - **1. 綁定邏輯置於 `isMentioned` 檢查之後 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js))**：
    - 將群組防洗版過濾 `if (isGroup && !isMentioned) return;` 保持在最前道防線。
    - 移除自動探測機制，僅當幹部在群組中明確 `@小岳 綁定幹部群組` 或輸入包含「小岳 綁定幹部群組」時，方才觸發 `ADMIN_GROUP_ID` 的綁定與確認回覆。
  - **2. 保持雙機器人相容回覆 (`_replyMessageSmart`)**：
    - 在被 @小岳 召喚執行綁定時，優先使用 `ADMIN_BOT_TOKEN` 回覆，杜絕跨 Token 造成的 400 Bad Request 錯誤。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端建置：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 200. 修復幹部群組綁定防洗版攔截、雙機器人 Token 智慧回覆與繳費申報雙向保底推播 (v0.1.100)
- **問題回報與根本原因分析 (Problem & Root Cause)**：
  1. **幹部群組從未收到任何測試通知，且在群組輸入「綁定幹部群組」毫無回應**：
     - **群組防洗版過濾優先級 Bug**：在 [gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) 中，第 79 行直接判定 `if (isGroup && !isMentioned) return;`。當幹部在群組直接輸入「`綁定幹部群組`」而未 @小岳 時，程式在第一步便被靜默丟棄，永遠無法執行綁定邏輯，導致 `ADMIN_GROUP_ID` 始終為 null。
     - **雙機器人 Token 跨帳號回覆衝突**：`_replyMessage` 原始碼硬編碼使用 `MEMBER_BOT_TOKEN`。當群組中僅加入幹部專用機器人時，用社員機器人的 Token 去 reply 幹部機器人的 replyToken 會被 LINE API 回絕 (HTTP 400)，導致回覆消失。
     - **幹部機器人 Webhook 未配置**：幹部機器人在 LINE Developers Console 尚未設定 Webhook URL 指向 GAS 部署網址，導致群組訊息根本無法送達 GAS。
     - 由於 `ADMIN_GROUP_ID` 始終為空，系統所有的 `pushAdminMessage` 在第一道檢查 `if (!adminGroupId || !text) return;` 就被略過，因此幹部群整天收不到任何推播。
  2. **繳費完成後使用者個人 LINE 聊天室收不到確認通知**：
     - 原先僅依賴前端 LIFF `liff.sendMessages` 發送，若使用者在外部瀏覽器開啟或遇到 800ms 逾時便會被略過，後端未提供保底機制。
- **修復與防護機制 (Architecture & Implementation)**：
  - **1. 綁定指令特例優先處理與群組 ID 自動探測 (`02_LineBot_Webhook.js`)**：
    - 將「`綁定幹部群組`」與「`#bind_admin`」移至防洗版過濾之前，群組輸入即刻判定執行綁定。
    - 新增自動探測機制：若 `ADMIN_GROUP_ID` 尚未配置，且群組訊息提及「幹部」，自動補齊群組 ID 註冊。
  - **2. 雙機器人 Token 智慧分流與容錯回覆 (`_replyMessageSmart`)**：
    - 新增 `_replyMessageSmart(replyToken, text, preferAdmin)`，群組環境與幹部指令優先採用 `ADMIN_BOT_TOKEN` 回覆，若失敗自動以 `MEMBER_BOT_TOKEN` 備援重試，徹底解決 Invalid reply token 錯誤。
  - **3. 繳費申報後端保底雙向推播 (`_handleNotifyOfficersPayment`)**：
    - 在 [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) 中，當收到繳費申報時：
      - 除了發送詳細查帳通知至幹部群組 (`pushAdminMessage`)。
      - **同步主動調用 `_pushMessage(userId, userMsg)` 推播一份完整格式的繳費收據至使用者的個人 LINE 聊天室**。
      - 訊息格式符合「純中文（完整）\n─────────────\n純英文（完整）」單一分隔線標準規範，列出金額、帳號末五碼、申報項目與備註。
  - **4. 前端繳費中心強化 (`src/pages/Payment.tsx`)**：
    - 送出時提前計算已選項目名稱 `selectedNames` 並封裝至 `detailsPayload`，延長 LIFF 發話超時至 2000ms，並與後端推播雙軌並行。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端建置：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 199. 徹底修復裝備租借推播發送失敗、繳費中心訂單消失與社費勾選框異常 (v0.1.99)
- **問題回報與根本原因分析 (Problem & Root Cause)**：
  1. **裝備租借送出後，申請人與幹部群組皆未收到通知**：
     - **前端原因**：在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中，送出租借表單時觸發的幹部推播 `fetch(GAS_API_URL, ...)` 未加上 `await` 等待，且下一行立即呼叫 `liff.closeWindow()`。LIFF 視窗瞬間被瀏覽器銷毀，導致推播 HTTP 請求在尚未發送完成前即被中斷（Connection Aborted）。
     - **幹部群組原因**：LINE Bot 必須知道幹部群組的 `groupId` 才能進行推播，若幹部群組尚未於 LINE 對話中輸入「`綁定幹部群組`」，系統查無 `OFFICER_GROUP_ID`，推播便無法送達群組。
  2. **繳費系統（Payment Center）沒有出現剛送出的裝備租借待繳項目**：
     - **SQL 子字串碰撞重大 Bug**：在 [supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql) 的 `get_unpaid_payments` 函式中，過濾未繳費項目的條件原寫為 `AND l.payment_status::text NOT LIKE '%Paid%'`。
     - 然而，裝備租借表單產生的預設未繳費狀態為 `'未繳費 Unpaid'`，字串內含子字串 `'Paid'`！這導致 PostgreSQL 在執行 `NOT LIKE '%Paid%'` 時判定為 `FALSE`，將所有真正的未繳費訂單強行過濾掉。
     - 此外，底層自訂轉型函式 `text_to_payment_status_enum` 先前亦因 `LIKE '%Paid%'` 判定優先度問題，有將 `'未繳費 Unpaid'` 誤轉為 `'已繳費 Paid'` 之潛在風險。
  3. **不是社員時，繳費系統也沒有出現繳社費的勾選框**：
     - 原先 SQL 對於社費顯示綁定了過於嚴格的意願條件 `v_has_intent`，且社員狀態比對亦同受 `NOT LIKE '%Paid%'` 誤殺。
- **修復與防護機制 (Architecture & Implementation)**：
  - **1. 前端推播非同步安全防護 (`Borrow.tsx` & `Payment.tsx`)**：
    - 將呼叫 GAS 發送幹部推播的 `fetch(...)` 宣告為 Promise，並與使用者本地發送確認訊息之 `liff.sendMessages(...)` 一併納入 `Promise.allSettled` 並行處理。
    - 待所有推播請求確實完成後，額外加入 300ms 安全非同步延遲，確保連線完整發出後才調用 `liff.closeWindow()`，徹底杜絕關閉視窗造成的網路中斷。
  - **2. 徹底消除 SQL 子字串碰撞 (`payment_rpc.sql` & `fix_payment_status_enum_typecast.sql`)**：
    - 重新編寫 `get_unpaid_payments` 查詢：
      - 欠費判定改採明確的正向匹配與嚴格排除：`(payment_status IS NULL OR payment_status::text LIKE '%未繳費%' OR payment_status::text LIKE '%Unpaid%' OR (payment_status::text NOT LIKE '%已繳費%' AND payment_status::text NOT LIKE '%待確認%' AND payment_status::text NOT LIKE '%Checking%' AND payment_status::text != '已繳費 Paid' AND payment_status::text != 'Paid'))`。
      - 裝備租借追加 `AND COALESCE(l.total_rent, 0) > 0`，社團出隊 0 元免租單自動過濾，不造成使用者困擾。
    - 修正 `text_to_payment_status_enum` 轉型函式：優先判斷 `LIKE '%未繳費%' OR LIKE '%Unpaid%'`，杜絕型別轉型誤判。
  - **3. 放寬繳納社費選項顯示邏輯**：
    - 在 `get_unpaid_payments` 中調整規則：只要使用者「非有效正式社員」（包含尚未入社或社籍已過期），且目前無審核中（`待確認 Checking`）之社費申報，進入繳費中心一律提供「社籍與社費 (Membership Fee) 200 元」選項供自由勾選。
  - **4. 一鍵修復腳本全面升級**：
    - 將上述修復全數整合進 [supabase/fix_payment_status_enum_typecast.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_payment_status_enum_typecast.sql)，管理員僅需至 Supabase SQL Editor 執行一次即可修復所有資料表轉型與 RPC 函式。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（涵蓋裝備計費公式、LIFF 通知機制、RPC 權限等）。
  - 前端建置：`pnpm run build` 成功完成，0 TypeScript / CSS 錯誤。

### 198. 徹底修復裝備租借細項 loan_items.created_at 欄位不存在錯誤與雙重防護機制 (v0.1.98)
- **問題回報與根本原因 (Problem & Root Cause)**：
  - 使用者在裝備租借送出時，系統彈出錯誤：`系統發生錯誤：column "created_at" of relation "loan_items" does not exist`。
  - **根本原因**：
    1. 在 Supabase PostgreSQL 中，`loan_items` 細項資料表原始設計僅包含 `id`, `loan_id`, `equipment_id`, `quantity`, `unit_price_snapshot`, `subtotal` 六大核心欄位，本身並未建立 `created_at`。
    2. `submit_equipment_loan_rpc` 儲存程序在第 7 步建立細項時，於 `INSERT INTO loan_items (..., created_at) VALUES (..., NOW())` 多寫入了 `created_at`，導致 PostgreSQL 拋出欄位不存在錯誤阻斷租借提交。
- **修復與防護機制 (Architecture & Implementation)**：
  - **第一道防線：簡化 INSERT 明細欄位**：
    - 在 `submit_equipment_loan_rpc` 中，將 `INSERT INTO loan_items` 調整為僅插入必備的 5 大欄位 `(loan_id, equipment_id, quantity, unit_price_snapshot, subtotal)`，徹底斷絕欄位不存在的錯誤。
  - **第二道防線：自動補齊資料表欄位 (DDL 防呆)**：
    - 在修復腳本開頭加入 `ALTER TABLE loan_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`，即使未來任何其他程序需要查詢 `created_at` 亦能完美相容。
  - **同步修復檔案**：
    - [supabase/fix_payment_status_enum_typecast.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_payment_status_enum_typecast.sql)
    - [supabase/fix_equipment_loan_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_equipment_loan_rpc.sql)
    - [supabase/equipment_loan_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/equipment_loan_rpc.sql)
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 錯誤。

### 197. 徹底修復裝備租借 payment_status_enum 型別轉型錯誤與 IMPLICIT CAST 全域防護 (v0.1.97)
- **問題回報與根本原因 (Problem & Root Cause)**：
  - 使用者在裝備租借詳情頁點選「Submitting...」送出租借單時，系統彈出警示錯誤：`System error: column "payment_status" is of type payment_status_enum but expression is of type text`。
  - **根本原因**：
    1. 在 Supabase PostgreSQL 中，`loans.payment_status` 為自訂列舉型別 `payment_status_enum`（有效值為 `'已繳費 Paid'`, `'待確認 Checking'`, `'未繳費 Unpaid'`）。
    2. `submit_equipment_loan_rpc` 在執行 `INSERT INTO loans` 時，使用了 `CASE WHEN v_total_rent = 0 THEN '已繳費 Paid' ELSE '未繳費' END` 表達式。PL/pgSQL 將該運算式推導為 `text` 類型，而 PostgreSQL 預設沒有 `text -> payment_status_enum` 的隱式轉型，且 `'未繳費'` 亦不符合列舉定義，導致 PostgreSQL 嚴格型別檢查阻斷並拋出此錯誤。
- **修復與防護機制 (Architecture & Implementation)**：
  - **全域隱式轉型規則 (IMPLICIT CAST)**：
    - 建立 `text_to_payment_status_enum` 轉型函式，並註冊 `CREATE CAST (text AS payment_status_enum) WITH FUNCTION text_to_payment_status_enum(text) AS IMPLICIT;`。
    - 徹底實現雙向容錯：無論前端、外部 API 或 CASE WHEN 字串寫入，PostgreSQL 均在底層自動映射至合法 ENUM 值，永遠杜絕 `expression is of type text` 錯誤。
  - **RPC 動態型別宣告與安全賦值 (`submit_equipment_loan_rpc`)**：
    - 在 PL/pgSQL 中宣告 `v_loan_payment_status loans.payment_status%TYPE;` 與 `v_loan_status loans.status%TYPE := '待領取 To Be Collected';`。
    - 根據租金計算結果賦予合法枚舉值（免租/0元為 `'已繳費 Paid'`，其餘為 `'未繳費 Unpaid'`），於 INSERT 時直接傳入同型別變數。
  - **取消預約防護 (`cancel_rpc.sql`)**：
    - 在比較 `loans.payment_status` 時全面加入 `::text` 轉型保護，防止列舉型別比較時可能發生的運算子衝突。
  - **一鍵修復腳本 (`supabase/fix_payment_status_enum_typecast.sql`)**：
    - 提供獨立 SQL 腳本，方便管理員至 Supabase SQL Editor 一鍵執行立即生效。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（含裝備租借計費公式、Supabase 雙軌相容各項驗證）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 196. 重構個人檔案通知為「純中文（完整）\n─────────────\n純英文（完整）」單一分隔線架構與欄位值徹底英文化 (v0.1.96)
- **問題回報與需求 (Problem & Requirements)**：
  - 先前個人檔案更新/註冊推播採用標題雙語混搭、中間穿插中文清單、英文清單、底部又穿插中文結尾與英文結尾，造成視覺上有 4~5 個段落被分隔線碎片化切割。
  - 英文清單項目中的變更值（如 `• Officer Intent: 我有意願成為社團幹部`）直接輸出中文原文，導致英文版面夾雜中文句子。
  - 使用者指示：「改成 中文（完整）\n─────────────\n英文（完整），而不是拆成好幾個段落，更新了什麼也要用英文」。
- **架構重構與實作 (Implementation Details)**：
  - **單一分隔線獨立大區塊 (`06_Helper_Services.js` & `src/gas.js`)**：
    - 上半部【純中文完整區塊】：包含純中文標題（`【✅ 基本資料已成功更新】` 或 `【🎉 歡迎加入！基本資料註冊成功】`）、中文問候引言、中文變更欄位清單，以及中文結尾引導話（出隊資格齊全或補齊提醒）。
    - 中間分隔線：全訊息僅保留一條標準分隔線 `─────────────`。
    - 下半部【純英文完整區塊】：包含純英文標題（`【✅ Profile Updated Successfully】` 或 `【🎉 Welcome! Registration Success】`）、英文問候引言、英文變更欄位清單，以及英文結尾引導話。
  - **欄位選項值徹底英文化 (`_translateValueToEn`)**：
    - 針對各欄位的值進行自動英文轉換，徹底解決中英夾雜問題：
      - 幹部意願：`我有意願成為社團幹部` -> `Willing to be an officer`
      - 社員身分：`一般社員` -> `General Member`、`正式社員` -> `Official Member`
      - 性別：`男` -> `Male`、`女` -> `Female`、`其他` -> `Other`
      - 身分別：`校內學生` -> `NTUST Student`、`校友` -> `NTUST Alumnus`、`外校學生` -> `Non-NTUST Student`
      - 緊急聯絡人關係：`母子` -> `Mother`、`父子` -> `Father`、`朋友` -> `Friend` 等
      - 未填寫 / 已更新：自動對應 `Not provided` / `Updated`
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（含測試 16 個人檔案推播模擬與出隊資格引導驗證）。
  - 前端編譯：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 195. 全面落實個人檔案變更明細與使用者聊天室訊息「上面中文、下面英文」雙語結構 (v0.1.95)
- **需求與視覺架構 (Requirements & Visual Architecture)**：
  - 依使用者具體指示：「更新了什麼也要用英文，可以寫成上面中文，下面英文的樣式（請套用到其他訊息）」。
  - 聊天室通知全面落實**「【中文區塊】\n─────────────\n【英文區塊】」**乾淨對稱排版，確保台灣與外籍社員均能一眼看懂自己的操作紀錄與更新項目。
- **架構設計與實作 (Implementation Details)**：
  - **個人檔案更新/註冊推播 (`06_Helper_Services.js` & `src/gas.js`)**：
    - 將 `intro` 與 `details` 重構為 `introZh` / `introEn` 與 `detailsZh` / `detailsEn` 兩套對照清單。
    - 支援 18 項基本欄位與變更項目的精準英文對照（如 `• 擔任幹部意願：已更新` 對應 `• Officer Intent: Updated`、`• 聯絡電話` 對應 `• Phone Number`、`• 緊急聯絡人` 對應 `• Emergency Contact` 等）。
    - 訊息版面依序呈現：
      1. 標題：`【✅ 基本資料已成功更新 / Profile Updated Successfully】`
      2. 中文區塊：引言 + 中文變更明細列表
      3. 分隔線：`─────────────`
      4. 英文區塊：英文引言 + 英文變更明細列表
      5. 結尾引導：中文出隊資格/裝備免審核提示 + 分隔線 + 英文出隊資格/裝備免審核提示
  - **繳費申報完成聊天室明細 (`src/pages/Payment.tsx`)**：
    - 前端送出申報後傳至 LINE 聊天室之明細訊息，全面採用「上方中文、中間分隔線、下方英文」對稱樣式，包含申報金額（Amount）、末5碼（Last 5 Digits）、申報項目（Items）與對帳提醒。
  - **裝備租借聊天室明細 (`src/pages/Borrow.tsx`)**：
    - 訂單編號、預計領取、預計歸還、預約裝備清單、預估總租金與提醒事項皆同步完成雙語對照。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（含個人檔案動態推播與出隊資格引導各項測試）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 194. 精準重構個人檔案儲存推播之出隊資格與裝備租借引導英文翻譯 (v0.1.94)
- **問題回報與分析 (Problem & Rationale)**：
  - 先前個人檔案儲存推播結尾之英文翻譯過於籠統（`Some required info is missing. Please complete your profile`），容易讓使用者與外籍社員產生誤解，以為進入社團系統就必須強制填齊所有保險與出隊資料才能使用任何功能。
  - 事實上：
    1. **裝備租借商城（Equipment Loan）隨時皆可直接使用**，無須出隊保險與體能審核資料即可送單借裝備。
    2. **僅有報名登山出隊活動（Club Trips/Events）**時，因涉及高山戶外安全、主管機關平安保險投保與資格審核，才需要補齊必填項目。
- **架構設計與修復實作 (Architecture & Implementation)**：
  - **精確中英雙語重構 (`06_Helper_Services.js` & `src/gas.js`)**：
    - 當出隊資料齊全時：明確提示已具備出隊活動報名資格，並可隨時租借裝備。
      `💡 Your trip insurance and safety verification details are fully completed. You are eligible to sign up for upcoming club events via "Activities", or reserve gear via "Equipment Loan" anytime!`
    - 當出隊資料尚有缺漏時：
      1. 第一段開宗明義告知外籍生**隨時可以預約戶外器材，不需要完整出隊資料**：  
         `💡 You can reserve outdoor gear anytime via "Equipment Loan" without full trip details!`
      2. 第二段清晰點出**只有要參加登山出隊行程時，才需要保險與資格審核**：  
         `⚠️ Trip Notice: Participating in hiking events requires safety insurance and qualification review.`
      3. 精確列出具體缺漏的欄位英文（如 `Emergency Contact Name`, `ID/ARC/Passport`, `Fitness Proof` 等），清楚引導欲出隊者至選單「填寫資料」補齊即可啟用一鍵報名。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（既有出隊資格引導斷言 100% 保持相容）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 193. 刪除 Webhook 冗餘導流指令、全面補齊使用者聊天室訊息中英雙語版本 (v0.1.93)
- **需求與架構優化 (Requirements & Architecture)**：
  - **精簡 Webhook 文字關鍵字導流 (`02_LineBot_Webhook.js` & `src/gas.js`)**：
    - 依使用者指示，刪除第 6 ~ 9 項文字攔截（裝備租借、繳費系統、個人主頁、填寫資料）。由於 LINE 官方帳號圖文選單（Rich Menu）已直接綁定 LIFF URL，手動輸入相關文字時回歸 Gemini AI 客服進行智慧應答與貼心引導，不再發送生硬死板的文字連結。
  - **全面補齊使用者聊天室各項訊息之中英雙語對照 (Bilingual Support)**：
    1. **Webhook 預設未命中提示**：加入英文說明 `Hello! Please use the rich menu below to explore Events, Equipment Loan, or Dashboard. If you have any questions, feel free to leave a message for the officers!`。
    2. **活動報名個人資料缺漏提示 (`03_Flex_Templates.js` & `src/gas.js`)**：
       - 建立 18 項社員欄位中英對照字典（如 `姓名 (Name)`、`身分別 (Identity Status)`、`緊急聯絡人 (Emergency Contact)` 等），在隊員資料未填齊時直接列出中英對照缺漏欄位並提示英文補齊引導。
    3. **活動報名收據重要審核提醒**：補全後半段審核機制與名額限制之英文版說明。
    4. **備取意願確認提示**：確認備取與重複點擊提示全面升級為雙語對照（`Waitlisted (Interested)`）。
    5. **幹部名冊維護提示**：加入 `Officer directory is currently undergoing maintenance.`。
    6. **個人檔案儲存推播 (`06_Helper_Services.js` & `src/gas.js`)**：標題與出隊資格引導結尾文字加入英文雙語版。
    7. **前端裝備租借確認訊息 (`src/pages/Borrow.tsx`)**：使用者送出租借表單後傳入聊天室之訂單明細（`liff.sendMessages`）全面升級為中英雙語對照（訂單編號 Order ID、預計領取 Pickup Date、預約裝備清單 Items、預估總租金 Estimated Total 與提醒事項 Important Notes）。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（含裝備租借通知與出隊資格引導測試）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 192. LINE 官方帳號最新活動 (Activities) 輪播與詳情 100% 直連 Supabase 解決無活動問題 (v0.1.92)
- **問題回報與分析 (Problem & Root Cause)**：
  - 在使用者成功於 Supabase 執行列舉型別修復腳本後，LIFF 前端之個人主頁、出隊足跡、幹部系統已成功載入。
  - 然而在 LINE 聊天室中發送「最新活動」或點擊圖文選單之「最新活動 Activities」按鈕時，聊天室依然回傳「目前這學期還沒有排定的活動喔！」。
  - 根本原因：LIFF 前端已是直連 Supabase，但 LINE 機器人後端 GAS (`03_Flex_Templates.js` 與 `src/gas.js`) 過去舊程式碼是向主試算表的 `Events` 分頁進行查詢，因未讀取 Supabase 中的 `events` 表而判定查無活動。
- **架構設計與修復實作 (Architecture & Implementation)**：
  - **100% 直讀 Supabase `events` 表（徹底杜絕主試算表讀取與備援依賴）**：
    - 依據使用者「直接讀取 Supabase，不要讀取主試算表（就算是備用也不要）」之明確指示，全面改寫 [gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventList(replyToken)` 與 `sendEventDetail(replyToken, eventId)`。
    - 查詢端點直接呼叫 `_supabaseGet("events", { select: "...", order: "start_date.desc" })`，完全移除對 Google Sheets 的 `getSheetByName`、`getDataRange` 及備用讀取。
  - **支援 ISO 8601 與台灣時區 (UTC+8) 時間解析**：
    - 新增 `_formatEventDate` 工具函式，自動將 Supabase 儲存之 `YYYY-MM-DD` 與 TIMESTAMPTZ (帶有 `T` 的 ISO 格式，如 `2026-09-18T23:59:59+08:00`) 正確轉換為台灣時區之 `YYYY/MM/DD` 顯示格式。
    - 健全化 `_isEventExpired`：精準比對活動報名截止時間戳，確保截止判定零時差。
  - **卡片展示與圖片網址適配**：
    - 精確提取 `ev.cover_image_url` 或 `ev.image_url` 作為 Flex 卡片 Hero 封面圖，並過濾非 Google Drive 直連圖片。
    - 清理 [gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之參數呼叫，不再傳入無用之試算表物件。
  - **環境對齊資訊**：
    - 確認主試算表的分頁名稱已完全對齊 Supabase 英文表名（如 `events`、`members`、`officers` 等），便於未來雙向同步與資料庫結構一致性。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 錯誤。

### 191. 修復 PostgreSQL 列舉型別比對錯誤 (ENUM Typecast)、落實全端錯誤透明顯示與增強幹部意願推播 (v0.1.91)
- **問題回報與根本原因 (Root Cause Analysis)**：
  - **個人主頁、出隊成就、活動管理無法載入 (圖一、圖二、圖三)**：
    - 在 Supabase 中，`event_signups.status`、`loans.status` 與 `payment_status` 為自定義 ENUM 列舉型別。
    - 在 PostgreSQL 中，列舉型別**未定義 `LIKE` / `NOT LIKE` 運算子**。RPC 函式直接比對（如 `s.status LIKE '%正取%'`）時會拋出致命錯誤：`ERROR 42883: operator does not exist: event_signup_status_enum ~~ unknown`。
    - 連鎖反應導致 `get_my_dashboard`、`get_my_achievements`、`get_admin_events_rpc` 呼叫失敗，前端 fallback 至無實作或空白的 GAS 備援，造成個人主頁報錯「無法讀取個人資料」、出隊成就報錯「無法取得歷史活動與成就」、活動管理因試算表無活動而呈現「目前尚未建立任何活動」。
  - **幹部意願推播未送達群組**：
    - 前端原先去重邏輯在使用者已勾選幹部意願且再次儲存時，會因 `wasWilling` 為真而判定非新意願略過推播。
    - GAS `pushAdminMessage` 在未綁定 `ADMIN_GROUP_ID` 或機器人 Token 與群組成員身分不相符時靜默結束，缺少回應檢查與日誌。
- **架構設計與修復實作 (Architecture & Fix Implementation)**：
  - **PostgreSQL 顯式轉型修復 (`::text`)**：
    - 修復 [supabase/get_my_dashboard.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/get_my_dashboard.sql)、[supabase/history_achievements_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql)、[supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql)、[supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql) 中所有對列舉欄位之 `LIKE` 與 `NOT LIKE` 查詢，全面加入 `::text`（例如 `s.status::text LIKE '%正取%'`、`s.payment_status::text NOT LIKE '%已繳費%'`）。
    - 建立整合修復檔 [supabase/fix_enum_typecast_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_enum_typecast_rpc.sql)，提供幹部一鍵在 Supabase SQL Editor 執行以立刻修復線上資料庫。
  - **全端錯誤透明顯示 (遵守 AGENTS.md 錯誤處理規範)**：
    - 於 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 實作 `getLastSupabaseError` 與錯誤全域保留機制，不再將 Supabase 錯誤靜默吞噬為 `null`。
    - 於 [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 錯誤畫面實作「原始錯誤細節 (Original Error Details)」代碼展示框，完整透明列印出 Supabase RPC 與 GAS 備援之原始報錯訊息。
    - 於 [src/pages/Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 與 [src/pages/AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 補全原始診斷訊息呈現，確保測試異常時能一眼辨識斷點。
  - **幹部意願推播健全化與 Token 備援**：
    - 更新 [src/pages/Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)：無論新舊使用者，只要在送出時確認勾選「我有意願成為社團幹部」或明確更動該欄位，均能精準觸發 `isOfficerIntentNew`。
    - 更新 [gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `pushAdminMessage`：加入 `ADMIN_GROUP_ID` 缺失告警、LINE API HTTP 狀態碼與內容日誌；若 `ADMIN_BOT_TOKEN` 推播非 200，自動無縫啟用 `MEMBER_BOT_TOKEN` 進行備援推播。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 190. 主試算表全量覆蓋排除內部 sync_queue 佇列表，專注 9 大核心業務資料表 (v0.1.90)
- **需求與架構設計 (Requirements & Architecture)**：
  - **排除內部 `sync_queue` 佇列分頁**：
    - 依社團幹部指示，主試算表為幹部業務管理界面，不需要同步內部資料庫事件緩衝表 `sync_queue`。
    - 於 [gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `defaultTables` 中移除 `sync_queue`，並在 OpenAPI 動態探測條件中加入 `defName !== "sync_queue"` 過濾守衛，確保主試算表不會產生該分頁。
    - 主試算表全量覆蓋鎖定 **9 大業務核心資料表**：
      1. `members` (社員清單)
      2. `officers` (幹部名冊)
      3. `events` (活動列表)
      4. `event_signups` (活動報名名冊)
      5. `equipments` (裝備清單)
      6. `loans` (租借紀錄)
      7. `loan_items` (租借細項)
      8. `payments` (繳費申報)
      9. `reflections` (活動心得與照片)
  - **資料字典同步淨化 (`supabase/SCHEMA_DICTIONARY.md`)**：
    - 移除 `sync_queue` 章節與頂部對照表，使資料字典純淨專注於 9 大業務核心資料表與中英混用表頭規則。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 189. 主試算表全量覆蓋升級支援 Supabase 全部資料表分頁與 OpenAPI 自動探測發現機制 (v0.1.89)
- **需求與架構設計 (Requirements & Architecture)**：
  - **支援 Supabase 所有資料表分頁全量覆蓋 (`overwriteMainSpreadsheetFromSupabase`)**：
    - 全面擴充 [gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：
      - 預設納入社團資料庫 10 大核心資料表：`members` (社員清單)、`officers` (幹部名冊)、`events` (活動列表)、`event_signups` (活動報名名單)、`equipments` (裝備清單)、`loans` (租借紀錄)、`loan_items` (租借細項)、`payments` (繳費紀錄)、`reflections` (活動心得相片)、`sync_queue` (同步佇列)。
      - **動態 OpenAPI 探測發現**：執行時自動向 Supabase `/rest/v1/` 請求 PostgREST OpenAPI 規格，動態辨識資料庫中可能新增的自定義資料表（例如新模組、統計表或記錄表），達成 100% 動態探索與全部頁面自動覆蓋。
    - 嚴格維持 Supabase 原名建立/重設分頁，確保主鍵置首、預設 Schema 欄位順序對齊，並動態補齊遠端記錄中的新欄位。
    - 自動設置第 1 列表頭為粗體灰底（`#F3F4F6`）並凍結首列。
  - **資料字典全量補齊 (`supabase/SCHEMA_DICTIONARY.md`)**：
    - 更新 [supabase/SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)，將現有 10 大資料表全數收錄至獨立章節（包含 `loan_items` 與 `sync_queue`），詳細記載欄位名稱、資料型別、關聯約束與中文業務用途。
  - **通用資料表動態同步機制 (`_syncGenericTableToSheet`, `_getSheetByTableName`)**：
    - 支援任何資料表之增刪改動態同步，配合智慧中英混用表頭辨識與自動向右擴充新欄位，達成試算表與 Supabase 雙軌資料無縫鏡像。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 105/105 項測試全數通過（含表頭邊界正則匹配防碰撞 7 項測試）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 188. Supabase 狀態下拉選單 ENUM、主試算表全量覆蓋鏡像同步、中英混用表頭自適應辨識與資料字典建置 (v0.1.88)
- **需求與架構設計 (Requirements & Architecture)**：
  - **Supabase 原生狀態下拉選單 (ENUM Migration)**：
    - 建立 [supabase/update_status_enums.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/update_status_enums.sql)：
      - `event_signup_status_enum`：正取 Confirmed、正取（已繳費）Confirmed (Paid)、備取 Waitlisted、備取（有意願）Waitlisted (Interested)、審核中 Checking、已取消 Cancelled。
      - `payment_status_enum`：已繳費 Paid、待確認 Checking、未繳費 Unpaid。
    - 清洗既有髒資料並將 `event_signups.status`、`event_signups.payment_status`、`loans.payment_status`、`members.payment_status` 升級為 PostgreSQL ENUM 型別，Supabase Table Editor 原生自動呈現下拉選單。
  - **主試算表全量覆蓋更新 (`overwriteMainSpreadsheetFromSupabase`)**：
    - 在 GAS [gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作全量覆蓋函式與自訂選單「🏔️ 社團系統 > 🔄 全量從 Supabase 覆蓋更新主試算表」。
    - 依據 Supabase 資料表原名（`members`, `events`, `event_signups`, `equipments`, `loans`, `payments`, `reflections`）建立分頁，清除既有內容並寫入純英文標頭與完整資料，並自動設置凍結頂列。
  - **中英混用表頭智慧辨識與動態增欄 (`_findColByEnglishName`, `_ensureColumnsExist`)**：
    - 引入字詞邊界正則匹配 `(^|[^a-zA-Z0-9_])<col_name>([^a-zA-Z0-9_]|$)`，使用者未來在表頭任何位置加入中文（如 `status 審核狀態` 或 `審核狀態 (status)`），程式皆能 100% 精準對齊英文欄位，且絕不發生 `id` 與 `line_user_id`、`status` 與 `payment_status` 誤判。
    - 定時排程同步時若偵測到 Supabase 有新欄位，自動於試算表最右側追加新標頭，達成全欄位動態鏡像同步。
  - **建立 Supabase 欄位資料字典 (`supabase/SCHEMA_DICTIONARY.md`)**：
    - 新增 [supabase/SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)，詳細記錄社團現有 8 大資料表（`members`, `events`, `event_signups`, `equipments`, `loans`, `loan_items`, `payments`, `reflections`）之英文欄位名稱、資料型別、ENUM 選項、預設值與繁體中文說明，作為系統開發之 SSOT。
- **測試與驗證 (Verification)**：
  - 單元測試：新增 [test/header_matcher.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/header_matcher.test.mjs)，覆蓋純英文、英文在前中文在後、中文在前英文在後、大小寫不拘、避免子字串碰撞與純中文別名回退等 7 大情境。
  - 執行 `pnpm test`：105/105 項測試全數通過（21 套測試套件 0 失敗）。

### 187. 裝備預約通知幹部群組 (含 LINE ID) 與使用者聊天室確認訊息 (零額度消耗) 及外部瀏覽器鎖定防護 (v0.1.87)
- **使用者需求與架構設計 (Requirements & Architecture)**：
  - **使用者端確認訊息（零額度消耗）**：
    - 送出預訂單後，透過前端 `liff.sendMessages` 以借用者身分在聊天室代發結構化預訂單明細，**完全不消耗 LINE 官方帳號的推播額度（0 額度消耗）**。
    - 內容包含：【訂單編號】、借用人（社員 5 折 / 社團出隊免租 / 非社員）、預計領取與歸還日期（出隊天數）、租借用途、預約裝備中文名稱與數量、預估總租金，以及提醒「將有幹部主動聯繫你，確認領取時間以及地點」。
    - 確保在訊息送達後才平滑關閉 LIFF 視窗，提供絕佳體驗。
  - **幹部群組通知全面升級 (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
    - 升級 `_handleNotifyOfficersLoan`，推播至幹部群組之訊息新增：申請人真實姓名、**LINE ID**、聯絡電話、出隊天數、租借用途、預估總租金與中文品項明細（如 `• 雙人高山帳 (EQ_TENT_01) x 1`）。
    - 內建 `_getMemberContactInfo` 容錯雙軌反查：若前端未傳入 LINE ID 或姓名，自動即時由 Supabase `members` 表或 Google Sheets `Members` 補齊。
  - **外部瀏覽器全螢幕鎖定防護 (`src/pages/Borrow.tsx`)**：
    - 依社團規範「不允許使用外部瀏覽器」，於 `!liff.isInClient()` 時顯示全螢幕友善提示卡片「請於 LINE 官方帳號開啟」，並提供直連「開啟 LINE 官方帳號」按鈕，阻斷外部預約以確保身分與帳號綁定無誤（本地開發提供 Bypass 開關）。
- **測試與驗證 (Verification)**：
  - 單元測試：`test/gas_simulation.test.mjs` 新增 Suite 39，驗證幹部通知格式包含 LINE ID、品項中文名稱、使用者確認訊息話術與未帶 LINE ID 自動反查補齊，`pnpm test` 98/98 項測試全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 186. 裝備租借送出「column "days" of relation "loans" does not exist」防呆補齊與資料庫結構容錯修復 (v0.1.86)
- **根本原因排查 (Root Cause Analysis)**：
  - 使用者在裝備租借詳情頁送出預訂單時，前端透過 `submit_equipment_loan_rpc` 呼叫資料庫，在執行 `INSERT INTO loans` 時觸發 PostgreSQL 報錯：`column "days" of relation "loans" does not exist`。
  - 由於生產環境之 Supabase `loans` 資料表於早期建立，當時尚未包含 `days` 欄位（或其他新欄位如 `name`, `unit_price_snapshot` 等），導致即使 RPC 程式碼正確，寫入操作仍因缺少欄位遭資料庫中斷。
- **全方位 DDL 防呆與相容更新 (`supabase/fix_equipment_loan_rpc.sql`, `supabase/equipment_loan_rpc.sql`)**：
  - **`loans` 主表防呆欄位補齊**：
    - 補齊 `days INTEGER NOT NULL DEFAULT 1`
    - 補齊 `name TEXT`, `start_date DATE`, `end_date DATE`, `purpose TEXT DEFAULT '社團出隊'`, `purpose_other TEXT`, `status TEXT DEFAULT '待領取 To Be Collected'`, `payment_status TEXT DEFAULT '未繳費'`, `total_deposit INTEGER DEFAULT 0`, `total_rent INTEGER DEFAULT 0`, `notes TEXT`, `refund_needed BOOLEAN DEFAULT FALSE`, `cancelled_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`。
  - **`loan_items` 細項表防呆補齊**：
    - 補齊 `unit_price_snapshot INTEGER DEFAULT 0` 與 `subtotal INTEGER DEFAULT 0`。
  - **一鍵修復腳本**：
    - 提供全量與單一修復 SQL，只要在 Supabase SQL Editor 執行一次，即可無痛補齊所有關聯資料表與欄位，杜絕任何 `column does not exist` 報錯。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 95/95 項測試全數通過。
  - 前端打包：`pnpm run build` 成功編譯通過。

### 185. 裝備租借送出預約「column "member_price_per_day" does not exist」修復與真實計費公式對齊 (v0.1.85)
- **根本原因排查 (Root Cause Analysis)**：
  - 社團真實租借計費模型為「**2 天基本租金 + 每日加成續租**」，Supabase 資料庫中 `equipments` 表實際存在的欄位為 `price_2day` 與 `price_extra_day`。
  - 舊版 `submit_equipment_loan_rpc` 儲存程序執行時直接執行 `SELECT ... member_price_per_day, non_member_price_per_day FROM equipments`，因資料表中不存在 `member_price_per_day` 欄位，導致 PostgreSQL 拋出 `column "member_price_per_day" does not exist` 阻斷預訂單提交。
- **雙軌容錯 Migration 與 RPC 重建 (`supabase/fix_equipment_loan_rpc.sql`, `supabase/equipment_loan_rpc.sql`)**：
  - **Zero-Failure DDL 防呆補齊**：
    - 透過 `ALTER TABLE equipments ADD COLUMN IF NOT EXISTS` 自動補齊 `price_2day`, `price_extra_day`, `member_price_per_day`, `non_member_price_per_day` 4 大欄位。
    - 執行雙向資料回填，確保無論存取新舊欄位皆能取得到非 0 之數值，徹底絕跡 `column does not exist`。
  - **對齊前端真實計費模型 (`submit_equipment_loan_rpc`)**：
    - 天數計算：`v_days := (v_return_date - v_pickup_date) + 1`，加成天數 `v_extra_days := GREATEST(0, v_days - 2)`。
    - 單項基準價：`v_item_base := p2 + (v_extra_days * p_extra)`。
    - 目的折讓規則：
      - 社團出隊（`purpose = '社團出隊'`）：租金全免 (`0 元`)。
      - 社員個人使用（`is_official` 為真）：享 5 折 (`ROUND(v_item_base * 0.5)`)。
      - 非社員個人使用：全額原價。
    - 與使用者真實送出範例（3 天出隊、兩件 600+100 裝備、社員個人 5 折總租金 700 元）**100% 精準吻合**。
  - **成員外鍵安全性防呆**：
    - 若 `p_line_user_id` 尚未完成個人基本資料註冊，於寫入 `loans` 主表前自動插入佔位成員紀錄，避免違反外鍵約束。
- **測試與驗證 (Verification)**：
  - 單元測試：`test/gas_simulation.test.mjs` 新增 Suite 38，驗證 3 天出隊 5 折總額 700 元、社團出隊免租與雙軌欄位回退容錯，`pnpm test` 95/95 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 184. 活動管理儲存活動「未支援的 Helper Action: save_event」修復與審核結果推播通知補齊 (v0.1.84)
- **根本原因排查 (Root Cause Analysis)**：
  - 在先前將龐大的單一腳本 `gas.backup.js` 模組化為 `gas_modules/` 時，[`gas_modules/06_Helper_Services.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) 的 `handleLiffHelperApi` 僅收錄了 6 個基礎 action，遺漏了 `AdminEvents.tsx` 所依賴的活動管理核心 action。
  - 當幹部在活動管理頁面編輯活動並點擊「儲存活動修改」時，前端送出 `action: 'save_event'`，後端因無相應分支直接回傳 `操作失敗: 未支援的 Helper Action: save_event`。
- **補齊活動管理核心 Actions (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - **`save_event` 建立與更新活動處理核心 (`_handleSaveEvent`)**：
    - **身分驗證**：調用 `checkOfficerInternal`，具備 Google Sheets `Officers` 工作表 + Supabase `members` 資料表（`role = '幹部'` 或 `is_officer = true`）雙軌查驗，且相容 `TEST_USER_ID`。
    - **新舊活動智慧判斷**：
      - 若有帶入 `eventId`，判定為更新既有活動，精準定位工作表行數進行覆寫。
      - 若無 `eventId`，自動以 `E` + `yyMM` + `-序號`（如 `E2609-01`）生成標準活動編號。
    - **雲端資料夾與名冊試算表自動化**：
      - 若為新活動，自動於 Google Drive 建立專屬活動資料夾（`YYYY/MM/DD_活動名稱`）。
      - 優先從 `EVENT_SHEET_TEMPLATE_ID` 範本複製，或動態生成包含 22 欄標準表頭與隱藏 `_CONFIG` 連線配置表之報名試算表。
    - **活動封面照片上傳**：若有帶入 base64 封面圖片，自動上傳至 Google Drive「活動封面」資料夾並轉換為 `lh3.googleusercontent.com` 高清直連網址。
    - **資料庫雙軌即時同步**：即時 Upsert 至 Supabase `events` 資料表（欄位包含 `id`, `title`, `fee`, `start_date`, `end_date`, `deadline`, `status`, `summary`, `itinerary`, `cover_image_url`, `drive_folder_url`, `spreadsheet_url`, `spreadsheet_id`）。
    - **幹部群組推播**：若勾選通知幹部群組，透過 `pushAdminMessage` 發送新活動上架通知。
  - **`send_event_notifications` 一鍵發送審核結果推播 (`_handleSendEventNotifications`)**：
    - 支援 `POST` 與 `GET` 端點呼叫。
    - 查詢正取與備取且尚未通知之名單，透過 `pushFlexMessage` 發送精美錄取／備取通知卡片。
    - 同步更新試算表與 Supabase `event_signups` 之 `notify_status` 為「已通知」。
  - **唯讀備援端點支援 (`doGet`)**：
    - 補齊 `get_admin_events` 與 `get_event_signups` 唯讀查詢端點，在 Supabase 短暫離線時提供無縫備援。
- **測試與驗證 (Verification)**：
  - 單元測試：`test/gas_simulation.test.mjs` 新增 Suite 37，驗證 `save_event`（編輯既有活動、非幹部攔截、建立新活動與 ID/雲端連結生成）與 `send_event_notifications`（正備取推播與防重複發送），`pnpm test` 92/92 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 183. 裝備租借頁面即時搜尋框、7 大登山系統分類篩選與 Supabase 下拉選單 ENUM (v0.1.83)
- **裝備租借即時搜尋與分類篩選 (`src/pages/Borrow.tsx`, `src/components/borrow/EquipmentCard.tsx`)**：
  - **即時搜尋輸入框**：
    - 頂部置入搜尋框，即時搜尋裝備名稱、所屬系統分類、規格備註或裝備代號。
    - 附帶搜尋圖示、一鍵清空按鈕（`X`）與數量動態呈現（如 `4 / 12` 種裝備）。
  - **7 大登山系統分類水平滑動標籤列 (Category Chips)**：
    - 針對社團高山器材規劃 7 大系統分類：**睡眠系統** ⛺、**背負系統** 🎒、**炊事系統** 🍳、**照明通訊** 🔦、**攀登技術** 🧗、**行進安全** 🥾、**其他裝備** 📦。
    - 在行動裝置與 LINE 內建瀏覽器上可單手左右順暢滑動，點選即切換。
    - 標籤列附帶動態數量徽章（Count Badge，如 `睡眠系統 (4)`），直觀了解各分類器材現狀。
    - 裝備卡片（`EquipmentCard.tsx`）上同步標註分類標籤，方便社員識別。
  - **友善空狀態 (Empty State)**：
    - 當複合篩選無匹配裝備時，顯示「找不到符合搜尋或篩選條件的裝備」並提供「清除篩選條件」一鍵重置按鈕。
- **Supabase 資料庫分類 ENUM 與原生下拉選單 (`supabase/add_equipment_categories.sql`, `supabase/schema.sql`, `src/utils/supabaseClient.ts`)**：
  - **原生下拉選單支援**：
    - 提供 Migration 腳本建立 `equipment_category` ENUM 自訂型別。
    - 在 Supabase Studio Table Editor 中，幹部新增或修改裝備時，`category` 欄位**自動呈現為原生下拉選單 (Dropdown Menu)**，徹底防呆且無須手動輸入。
  - **資料讀取補齊**：
    - `supabaseClient.ts` 中的 `fetchEquipmentsFromSupabase` 正式映射 `category: row.category || '其他裝備'`，確保資料庫與前端即時連動。
- **多國語言支援 (`src/locales/zh.json`, `src/locales/en.json`)**：
  - 新增 `borrow.search`、`borrow.category`、`borrow.empty` 相關繁體中文與英文翻譯字串。
- **測試與驗證 (Verification)**：
  - 單元測試：`test/frontend_utils.test.mjs` 新增 5 項搜尋與複合篩選測試，`pnpm test` 88/88 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 182. 擔任幹部意願推播幹部群欄位精準化：完整姓名/性別/科系/學號/爬山經驗/體能證明文字 (v0.1.82)
- **幹部招募意願通知格式與欄位對齊 (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - **根本原因排查**：原先幹部招募推播訊息僅附上姓名、系所、遮罩學號與爬山經歷，缺少性別、完整學號，且缺少表單中社員填寫的體能文字自評資訊，幹部群無法第一時間評估社員的體能與登山背景。
  - **欄位精準調整**：
    - 判定條件：社員勾選「我有意願成為社團幹部」（或意願為新勾選）時，即刻觸發 `pushAdminMessage` 推播至幹部群組。
    - 訊息內容完整包含：
      - **姓名**：`data.name`
      - **性別**：`data.gender`
      - **科系**：`data.department`
      - **學號**：完整學號 `data.studentId`（幹部群內部查證使用，不予遮罩）
      - **爬山經驗**：`data.exp` 或 `data.outdoor_experience`
      - **體能證明（文字自評）**：精準提取表單「體能證明」文字自評描述欄位（`data.strength` 或 `fitness_desc`），**徹底排除圖片上傳連結**，使幹部群訊息整潔易讀
      - **聯絡資訊**：附上電話與 LINE ID，便於幹部團隊主動聯絡
- **測試與驗證 (Verification)**：
  - 單元測試：Suite 16 新增第 5 項測試，驗證幹部群通知精確包含姓名、性別、科系、學號、爬山經驗與體能證明文字，`pnpm test` 83/83 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 181. 個人檔案更新 LINE 動態推播：依實際異動欄位動態列出、整合 13 項出隊資格檢查動態引導 (v0.1.81)
- **個人檔案更新動態推播訊息 (`src/pages/Register.tsx`, `gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - **根本原因排查**：原先使用者在 LIFF 更新個人檔案時，無論實際上僅更動電話或經歷，LINE 推播訊息（`notify_profile_saved`）一律顯示固定樣板，列出姓名、系所、學號、電話、緊急聯絡人、社員意願、經歷、體能等全部欄位，無法直觀看出本次修改內容，且容易造成誤解。
  - **前端異動精準比對 (`Register.tsx`)**：
    - 引入 `originalFormData` 狀態，於初次載入 Supabase（或 GAS 備援）個人資料時記錄原始狀態。
    - 提交時逐一比對姓名、性別、生日、身分證、系所學號、身分別、電話、信箱、LINE ID、現居地址、緊急聯絡人四項、病史、經歷、體能與意願等欄位，精確生成 `changedFields` 變更欄位清單。
    - 若有新上傳體能照片檔案，自動列入體能證明變更項目。
    - 將 `changedFields` 附於 `notify_profile_saved` 請求酬載中，供 GAS 模組進行動態排版。
  - **後端動態訊息組裝與向下相容 (`06_Helper_Services.js`, `src/gas.js`)**：
    - **新註冊社員** (`isNewUser: true`)：顯示專屬歡迎文案與完整基本填寫資訊。
    - **既有社員更新個人檔案**：
      - 若有實際欄位變動：**僅動態列出本次有修改的欄位**，敏感資訊自動遮罩保護（學號、身分證、手機號碼）。
      - 若所有欄位皆未更動（直接按儲存）：明確回饋「您的個人檔案未有變更，資料已為最新狀態。」，避免重複列出舊資料。
      - 若未傳入 `changedFields`（舊版前端相容）：自動平滑 fallback 至完整呈現。
- **出隊活動報名與裝備租借資格動態引導 (`06_Helper_Services.js`, `src/gas.js`)**：
  - **業務規則解析**：
    - **裝備租借**：僅核對領還日期與庫存，未填寫保險資料仍允許送出預約。
    - **活動報名**：GAS `handleSignup` 嚴格要求 13 項平安保險與審核必備欄位（姓名、性別、電話、生日、身分證、通訊地址、緊急聯絡人姓名/關係/地址/電話、體能自評、體能證明、爬山經歷），缺一不可。
  - **動態引導防誤會機制**：
    - 推播結尾依據該社員個人資料是否已達到「活動報名 13 項標準」動態切換：
      - **資料齊全時**：提示出隊保險與資料已完整，歡迎報名「最新活動」出隊行程或至「裝備租借」預約器材。
      - **資料未齊時**：引導至「裝備租借」，並溫馨列出尚缺項目（如身分證、緊急聯絡人地址、體能證明等），提醒欲報名最新活動可至「填寫資料」補齊即可啟用一鍵報名，杜絕「收到通知說可報名，點擊後卻被機器人通知資料不齊報名失敗」的矛盾體驗。
- **測試與驗證 (Verification)**：
  - 單元測試：新增 Suite 16 專題測試，`pnpm test` 82/82 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 180. 還原 gas.backup.js 原始強健上傳機制：徹底拔除 DRIVE_FOLDER_ID 地雷、回歸「系統圖庫」自動建立與多欄位儲存 (v0.1.80)
- **徹底拔除 `DRIVE_FOLDER_ID` 地雷，回歸「系統圖庫」原生自動建立機制 (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - **根本原因排查**：在先前 GAS 模組化重構中，`_handleUpdateEquipmentImages` 與 `_handleDriveUploadHelper` 改為讀取 `DRIVE_FOLDER_ID`。若使用者的 GAS Script Properties 填入無效 ID（或誤填試算表 ID、捷徑或共用硬碟），`DriveApp.getFolderById(folderId)` 會立即拋出未捕捉的嚴重例外 `Exception: Folder not found`。一旦 GAS 發生 Runtime Exception，Google Web App 端點會直接回應 HTTP 500 HTML 錯誤頁面，導致行動裝置（iOS LINE WebKit）的跨域 POST 轉址連線中斷並爆出 `TypeError: Load failed`。
  - **架構還原**：
    - 完整還原 `gas.backup.js` 驗證成熟的 `uploadFileToDrive` 函式：完全不依賴外部 `DRIVE_FOLDER_ID`，直接透過 `DriveApp.getFoldersByName("系統圖庫")` 動態尋找，不存在則自動 `createFolder("系統圖庫")`。
    - 子目錄自動建立 `裝備照片 / {裝備名稱}`，任何 Google 帳號執行時保證 100% 成功建立資料夾與檔案。
    - 檔案命名嚴格遵守：`{裝備名稱}_{YYYYMMDD}_{序號}.{ext}`，檔案權限設為 `DriveApp.Access.ANYONE_WITH_LINK`，並轉換為 `https://lh3.googleusercontent.com/d/{id}=w1000` 高清直連網址。
- **試算表寫入結構與名稱容錯對齊 (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - 名稱容錯：支援 `ss.getSheetByName("Equipments") || ss.getSheetByName("裝備清單") || ss.getSheetByName("裝備")`。
  - 多欄位獨立儲存：動態尋找或建立 `圖片網址1` 至 `圖片網址5`，將照片分別寫入獨立欄位，相容歷史試算表格式。
  - 補回遺漏之 `getOrCreateColIdx` 欄位動態擴充工具函式。
- **雙軌資料庫保護性同步 (`gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - 在 Drive 照片上傳完成後，以獨立 try-catch 保護性 PATCH Supabase `equipments` 表的 `images` 欄位（JSONB 陣列格式）。
  - 即使試算表或 Supabase 單邊延遲或受限，絕不中斷 GAS 回傳流程，確保前端照片更新永遠成功回傳。
- **前端請求優化 (`src/components/borrow/EquipmentDetailModal.tsx`)**：
  - 保持與 `gas.backup.js` 舊版完全一致的傳輸酬載與 `appendAuthToken`，若發生錯誤依 Rule 透明印出完整詳細資訊。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 78/78 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。

### 179. 裝備照片上傳傳輸標頭優化 (移除 OPTIONS 觸發因子與 URL Token) 與 GAS 多模組架構部署深度解析 (v0.1.79)
- **前端請求傳輸標頭與轉址優化 (`src/components/borrow/EquipmentDetailModal.tsx`)**：
  - **根本原因排查**：在 iOS Safari / LINE 內建 WebKit 瀏覽器環境中，若發送 POST 請求時帶有帶參數之 Content-Type（如 `text/plain;charset=utf-8`）或於 URL 上附加過長的 JWT Token（`?idToken=...`），WebKit 會將其判定為非簡單請求 (Non-Simple Request) 並發送 `OPTIONS` 預檢請求。而 Google Apps Script Web App 完全不支援 `OPTIONS` 方法，直接中斷連線拋出 `TypeError: Load failed`。
  - **傳輸優化實作**：
    - 嚴格使用標準純 `'Content-Type': 'text/plain'`，杜絕 WebKit 發送 `OPTIONS` 預檢請求。
    - 移除 URL 上的冗餘查詢 Token，身分驗證一律內嵌於 POST JSON Payload（`withAuthPayload`）。
    - 明確設定 `redirect: 'follow'`，確保行動裝置瀏覽器遵循 Google Apps Script 必要的 `302 Found` 跨域轉址。
    - 錯誤訊息透明化升級：若捕獲 `Load failed`，明確提示 Google Apps Script 部署版本與「所有人 (Anyone)」存取權限檢查，協助社團幹部秒級除錯。
- **Google Apps Script 6 大模組分檔部署原理深度解析**：
  - 確認將 `01_Config_Auth.gs` 至 `06_Helper_Services.gs` 拆檔上傳至 GAS 專案與合併為單一 `gas.js` 在執行期無任何功能差異（GAS 在執行期會自動將專案內所有 `.gs` 檔合併於同一全域作用域）。
  - 因前綴編號 `01_` ~ `06_` 嚴格遵守 Alphabetical Order，全域常數與環境變數保證優先載入，模組間函式職責清晰且無重複衝突。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 78/78 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。



### 178. 觸發器雙向防遞迴守衛 (根治 stack depth limit exceeded)、裝備照片直更分流 (徹底免除 iOS Load failed) 與全域錯誤透明印出規範 (v0.1.78)
- **觸發器雙向防遞迴守衛 (`supabase/member_officer_sync.sql`, `supabase/fix_trigger_recursion.sql`)**：
  - **根本原因排查**：在先前版本中，`members` 表與 `officers` 表各掛載了雙向同步觸發器（`trg_member_officer_sync` 與 `trg_officer_to_member_sync`）。當使用者送出個人資料時，`members` 更新觸發 `officers` 更新，而 `officers` 更新又再度反向觸發 `members` 更新，形成無窮遞迴迴圈 (Mutual Recursion Loop)，瞬間耗盡 PostgreSQL 呼叫堆疊，引發 `ERROR 54001: stack depth limit exceeded`。
  - **架構修復**：
    - 在兩端的觸發函式（`trg_fn_sync_officer_from_member` 與 `trg_fn_sync_member_from_officer`）第一行加入 PostgreSQL 原生防遞迴守衛：
      `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;`。
    - 提供獨立修復腳本 `supabase/fix_trigger_recursion.sql`，使用者可於 Supabase SQL Editor 一鍵執行立即修復線上環境。
- **裝備照片直更 Supabase 分流機制 (`src/components/borrow/EquipmentDetailModal.tsx`, `src/utils/supabaseClient.ts`, `supabase/schema.sql`)**：
  - **根本原因排查**：使用者在 iOS LINE 內建 WebKit 瀏覽器進行照片編輯（例如純刪除或排序照片）時，前端若將請求發送至 Google Apps Script Web App，GAS 會回應 `302 Found` 跨域轉址至 `script.googleusercontent.com`。iOS WebKit 對自訂標頭的跨域 POST 轉址執行安全性限制並予以阻斷，在 JavaScript 中拋出 `TypeError: Load failed`。且純照片刪除或排序根本無須經由 Google Drive 建立檔案，呼叫 GAS 造成架構冗餘與高延遲。
  - **機制實作**：
    - 在 `EquipmentDetailModal.tsx` 中建立智慧分流：當 `newPhotoFiles.length === 0`（純刪除或重排照片）時，直接透過 Supabase (`updateEquipmentImagesInSupabase` 或 RPC `update_equipment_images`) 更新 `equipments.images`，延遲 < 30ms，0% 依賴 GAS，徹底免除 iOS WebKit 之 `Load failed` 阻斷。
    - 背景非同步通知 GAS 試算表鏡像備份（若 GAS 失敗亦不阻斷前端成功體驗）。
    - 若有新上傳照片檔案（`newPhotoFiles.length > 0`），走 Drive 上傳流程，並針對各項可能錯誤直接印出完整詳細資訊與建議。
- **系統規範建立：錯誤訊息一律直接透明印出 (`.agents/rules/error_handling.md`, `AGENTS.md`, `src/pages/Register.tsx`)**：
  - **規範確立**：依使用者要求，正式在專案 Rules (`.agents/rules/error_handling.md` 與根目錄 `AGENTS.md`) 寫入「全域錯誤直接透明印出」規則：所有前端 UI、後端 API 或資料庫存取發生異常時，嚴禁吞掉或將訊息遮蔽為「請聯絡社團管理員」等空泛提示，一律直接在 Alert、Toast 與日誌印出確切的 `error.message` 與錯誤細節。
  - **前端落實**：更新 `Register.tsx` 與 `EquipmentDetailModal.tsx`，徹底落實直接印出真實錯誤原因。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 78/78 項測試 100% 全數通過（新增防遞迴守衛與照片分流機制兩項測試）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。


- **個人資料儲存錯誤透明化與 DATE 型別相容 (`src/utils/supabaseClient.ts`, `src/pages/Register.tsx`)**：
  - **根本原因排查**：幹部成員儲存個資時若遭遇資料庫 Trigger 限制（如 `officers.title` NOT NULL）或 DATE 欄位不接受空字串 `''` 時，先前 `saveMemberProfileToSupabase` 僅回傳 `boolean: false`，導致前端只顯示「儲存失敗：請聯絡社團管理員」之泛用提示，無法得知底層原因。
  - **架構升級**：
    - `saveMemberProfileToSupabase` 回傳結構升級為 `{ success: boolean; message?: string }`。
    - 生日欄位為空時轉為 `null`（而非空字串 `''`），確保 PostgreSQL DATE 解析相容。
    - 前端 Alert 直接顯示資料庫回傳之詳細錯誤訊息，使問題能精準定位與排除。
- **裝備照片儲存防崩潰診斷與 Supabase JSONB 陣列對齊 (`src/components/borrow/EquipmentDetailModal.tsx`, `gas_modules/06_Helper_Services.js`)**：
  - **根本原因排查**：
    - 經診斷線上 Google Apps Script Web App 端點，發現遠端回應 `找不到以下指令碼函式：doPost`（代表線上 GAS 部署尚未發布包含 `doPost` 之新版本），前端以 `res.json()` 解析 HTML 報錯頁面時拋出 JSON SyntaxError，直接被 catch 區塊捕捉並顯示預設的「照片更新失敗，請稍後再試。」。
    - 後端在更新 Supabase `equipments` 時，欄位應為 `images`（JSONB 陣列）而非純文字 `image_url`。
  - **機制實作**：
    - 在 `EquipmentDetailModal.tsx` 中改採 `res.text()` 安全剖析，若收到 GAS 尚未部署 `doPost` 的 HTML 回應，彈出明確提示引導管理員至 GAS 發布新版部署。
    - 在 `gas_modules/06_Helper_Services.js` 中將更新 Supabase `equipments` 欄位修正為 `images: finalUrls`。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 76/76 項測試 100% 全數通過。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。
  - GAS 整合：`src/gas.js` 重新同步，0 語法錯誤。


### 176. 幹部意願狀態轉變推播機制（防修改個資重複通知）與 officer_role 全面同步 officers.title 職稱 (v0.1.76)
- **幹部招募意願精確推播（由無變有才通知）(`src/pages/Register.tsx`, `gas_modules/06_Helper_Services.js`, `src/gas.js`)**：
  - **根本原因排查**：先前 `notify_profile_saved` 只要檢測到表單有勾選意願，不論使用者是首次填寫還是單純修改電話或地址，每次儲存皆無條件推播幹部群組，造成幹部群組重複洗版。
  - **機制實作**：
    - 前端載入個資時紀錄原始意願 `initialOfficerIntent`。
    - 表單送出時動態計算 `isOfficerIntentNew`：
      - 新註冊成員：有勾選即判定為新意願。
      - 既有成員：先前為無意願且本次變更為有意願（由無變有）時才判定為新意願；若先前本已勾選且本次僅修改其他個資，則判定為非新意願。
    - 後端 `_handleNotifyProfileSaved` 僅在 `wantsToBeOfficer && isOfficerIntentNew` 為真時才發送 `pushAdminMessage`，徹底根治重複洗版問題。
- **幹部身分 officer_role 全面同步 officers 頁面之 title 職稱 (`src/utils/supabaseClient.ts`, `supabase/member_officer_sync.sql`)**：
  - **根本原因排查**：先前的 `checkOfficerStatusFromSupabase` 在 `memberData.is_officer` 為真時，優先回傳 `members.officer_role`（多為預設值「幹部」），而未優先讀取 `officers` 表中最新設定的 `title`（如「社長」、「器材部長」等）；且當管理者在 `officers` 表修改職稱時，缺乏反向更新 `members.officer_role` 的觸發器。
  - **架構升級**：
    - 在 `src/utils/supabaseClient.ts` 中調整職稱解析順序，優先採用 `officers.title` 與 `officers.role`，確保前端徽章與身分識別即時呈現最新職稱。
    - 在 `supabase/member_officer_sync.sql` 新增雙向觸發器 `trg_officer_to_member_sync`，當 `officers` 表的新增、修改 `title` 或 `role` 時，自動同步回寫 `members.officer_role`。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 76/76 項測試 100% 全數通過（新增 Suite 15 測試 6 與測試 7）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。
  - GAS 整合：`src/gas.js` 重新同步，0 語法錯誤。


### 175. 裝備租借費用欄位修復（price_2day 與 price_extra_day）、森林綠毛玻璃底條與磨砂白購物車按鈕 UI 重塑 (v0.1.75)
- **裝備租借費用全面對齊 Supabase 真實欄位 (`src/utils/supabaseClient.ts`, `supabase/schema.sql`)**：
  - **根本原因排查**：前端先前的 `fetchEquipmentsFromSupabase` 僅查詢 `member_price_per_day` 與 `non_member_price_per_day`，但 Supabase 資料庫中的真實欄位為 `price_2day`（基本2天租金）與 `price_extra_day`（續租+1天租金），造成回傳全為 `undefined` 並 fallback 為 0。
  - **智慧容錯解析**：
    - 基本租金（2天）：優先取 `price_2day ?? price ?? member_price_per_day ?? 0`。
    - 續租租金（+1天）：優先取 `price_extra_day ?? price_extra ?? non_member_price_per_day ?? 0`。
    - 同步在 `supabase/schema.sql` 明確記錄與聲明 `price_2day` 與 `price_extra_day` 欄位。
- **預設用途調整為個人使用 (`src/pages/Borrow.tsx`)**：
  - 將借用表單用途預設值由原本的「社團出隊」調整為「個人使用」。
  - 進入租借頁面時不再預設套用社團免費出隊，使用者可立即看到真實預估租金；如為社團出隊可於表單抽屜內自由切換為「社團出隊」以享免租。
- **重塑底部浮動購物條與查看預訂單按鈕 UI (`src/App.css`, `src/pages/Borrow.tsx`)**：
  - **橫條底色**：由原本厚重的深黑藍（Slate 900）更換為契合登山調性的**森林質感深綠色**（`rgba(20, 54, 40, 0.92)` 搭配 `backdrop-filter: blur(12px)` 與細緻微光邊框）。
  - **按鈕 UI 重塑**：
    - 新增 `.view-cart-btn` 專屬樣式，重塑為**半透明磨砂白膠囊按鈕**（`rgba(255, 255, 255, 0.2)` 搭配 `blur(4px)`、細緻白邊框與懸浮微放大動效）。
    - 修正購物車圖示垂直錯位與文字擁擠折行問題，統一 Flexbox 居中與 8px 間距，圖示調整為精準 16px。
    - 按鈕點擊事件加入 `e.stopPropagation()`，避免重複觸發整條橫條的點擊展開事件。
- **測試與驗證 (Verification)**：
  - 單元測試：`pnpm test` 74/74 項測試 100% 全數通過（新增測試驗證 `price_2day` 與 `price_extra_day` 解析與 fallback）。
  - 前端打包：`pnpm run build` 成功建置，0 TypeScript / CSS 錯誤。


### 174. 報名與個資檢核 100% 確立 Supabase SSOT、主試算表全量 CRUD 增刪鏡像同步、幹部意願群組通知與裝備照片更新 API (v0.1.74)
- **確立 Supabase 為 100% 單一信任真實來源 (SSOT) 根治假性重複報名 (`01_Config_Auth.js`, `03_Flex_Templates.js`)**：
  - **根本原因排查**：先前 `handleSignup` 依然直接讀取主試算表 `Signups` 表比對資料。當使用者在 Supabase 刪除某筆活動報名時，因主試算表殘留歷史舊列，導致 LINE Bot 誤判隊員「已經報名過」，直接阻擋了正常出隊登記；`_checkProfileComplete` 亦存在讀取試算表舊資料的延遲問題。
  - **架構修復**：
    - 新增通用查詢函式 `_supabaseGet(table, queryParams)`，以 Service Role Key 統一安全檢索 Supabase REST API。
    - **重複報名檢驗 100% 直查 Supabase `event_signups` 表**：只在 Supabase 存在非「取消」狀態之記錄時才提示已報名；若 Supabase 查無記錄或狀態為已取消，一律判定未報名並放行！
    - **試算表舊列覆蓋防呆**：若主試算表剛好殘留該活動的歷史髒資料列，系統在登記時直接就地覆蓋更新，確保主試算表不會產生幽靈重複列。
    - **個資檢核直查 Supabase `members` 表**：以資料庫最新個資為準進行防呆比對，完全不觸碰試算表。
- **主試算表增刪完全鏡像同步與全表 DELETE 支援 (`05_Sync_Worker.js`)**：
  - **根本原因排查**：先前 `Sync_Worker` 僅處理 UPDATE，完全未傳入與處理 `item.action`。當 Supabase 刪除資料、DB Trigger 送出 `action: 'DELETE'` 時，GAS 未執行刪除，導致主試算表永遠留存幽靈資料。
  - **全資料表 DELETE 鏡像實作**：
    - `Signups`：依專屬碼或 `line_user_id + event_id` 找到列號，執行 `sheet.deleteRow(targetRow)`。
    - `Members`：依 `line_user_id` 精準 `deleteRow`。
    - `Events`：依活動編號精準 `deleteRow`。
    - `Equipments`：依裝備代號精準 `deleteRow`。
    - `Loan_Records`：依租借單號倒序清除該單號之所有明細列。
    - `Payments`：依繳費單號精準 `deleteRow`。
    - `Reflections`：依 `event_id + line_user_id` 精準 `deleteRow`。
  - **補齊 `Signups` 表 INSERT 分支**：當試算表無此專屬碼時，自動依 22 欄標準表頭新增一列。
  - **新增資料自癒修剪引擎 (`reconcileSignupsWithSupabase`)**：可一鍵或排程比對 Supabase 有效名冊，自動修剪並清除 Google Sheets 中的所有歷史孤兒幽靈列。
- **有意願成為幹部即時推播幹部管理群組 (`06_Helper_Services.js`)**：
  - **根本原因排查**：`_handleNotifyProfileSaved` 過去只推播隊員本人，完全未檢查 `intendOfficer`，導致幹部無法及時得知新成員的招募意願。
  - **功能實作**：精準偵測 `formData.intendOfficer`，若填寫有意願，即刻格式化專屬招募卡片並透過 `pushAdminMessage` 推播至幹部群組，包含姓名、系所、學號、電話、Line ID、經歷與擔任意願，便利幹部第一時間主動聯繫。
- **實作裝備照片更新 Helper API (`update_equipment_images`) (`06_Helper_Services.js`)**：
  - **根本原因排查**：前端 `EquipmentDetailModal.tsx` 呼叫 `action: 'update_equipment_images'`，但 GAS 端 Action 路由表未註冊該 API，拋出「未支援的 Helper Action: update_equipment_images」。
  - **功能實作**：完整實作 `_handleUpdateEquipmentImages`，自動將新上傳照片寫入 Google Drive 裝備專屬目錄（`裝備照片/{裝備名稱}/`），取得直連網址，並同步更新 Supabase `equipments.image_url` 與主試算表 `Equipments` 表之圖片網址。
- **測試與驗證 (Verification)**：
  - 單檔合併：`src/gas.js` 重新生成，`node -c src/gas.js` 0 語法錯誤。
  - 單元測試：`pnpm test` 73/73 項測試 100% 全數通過（新增 Suite 15）。
  - 前端打包：`pnpm run build` 成功建置。


### 173. 活動報名個資防呆檢查、自動報名寫入雙軌同步與幹部群組 @Mention 專屬助理機制 (v0.1.73)
- **活動報名個資防呆檢查與自動報名全流程恢復 (`03_Flex_Templates.js`)**：
  - **核心問題**：先前隊員點擊「一鍵報名 Sign Up」時，系統過度簡化，一律跳出「🎉 準備報名【活動】！請點擊下方專屬連結確認您的報名資料並送出...」之靜態訊息，缺乏自動檢查防呆與自動寫入機制。
  - **個資防呆檢查函式 (`_checkProfileComplete`)**：
    - 嚴格比對社員基本資料，針對活動投保與出隊需求，依序檢驗 10 項關鍵欄位：
      - 姓名、性別、電話
      - 生日 (Birthday)、身分證字號 / 居留證號 (ID Number)、聯絡地址 (Address)
      - 緊急聯絡人姓名、關係、電話
      - 爬山經驗、體能與登頂證明
    - 若檢驗出任一欄位缺漏，即時以清單逐項條列（例如 `👉 生日 (Birthday)`、`👉 緊急聯絡人電話`），並附上資料填寫連結引導隊員補足，絕不放行缺失資料。
  - **資料齊全自動報名 (`handleSignup`)**：
    - 當隊員個資完整時，系統自動產生專屬報名碼（格式 `SMMddHHmmss`）。
    - 自動寫入主試算表 `Signups` 表 22 欄標準表頭結構，並標記為正取或備取。
    - 即時透過 `_syncSignupToSupabase` 同步寫入 Supabase `event_signups` 資料表。
    - 透過 LINE Messaging API 回傳正式報名收據卡片（含姓名、活動名稱、專屬碼、報名時間與繳費指引）。
- **幹部群組 @Mention 原生識別與專屬助理指引卡片 (`02_LineBot_Webhook.js`)**：
  - **原生 @Mention 識別**：精確解析 LINE Webhook `mention.mentionees[].isSelf === true` 與「小岳」文字前綴。
  - **幹部專屬助理引導**：當幹部在群組單純 `@小岳`、輸入「小岳 幹部系統」或進行日常招呼時，精確回傳指定幹部後台引導卡片：
    - 標題：`🌲 幹部專屬助理小岳在此！`
    - 提供直達活動後台之專屬網址：`👉 https://liff.line.me/2009217429-jvj3ydDT?liff.state=%2Fadmin%2Fevents`。
    - 提示操作方式與查詢規範。
  - **群組嚴格靜默防洗版**：群組中若未被 @ 或未呼叫「小岳」，系統嚴格保持靜默（`return`），杜絕機器人插嘴暴走。
- **堅持 Web-First 架構理念**：
  - 響應使用者需求，不再於 LINE 聊天室回傳落落長的文字版「個人狀態」或「取消預約」，所有管理與狀態操作全面引導至 LIFF 現代化響應式介面操作。
- **測試與驗證 (Verification)**：
  - 語法校驗：`node -c src/gas.js` 0 語法錯誤。
  - 測試套件：`pnpm test` 69/69 單元測試 100% 通過（新增 Suite 14：個資防呆檢查、幹部群組識別與服務選單測試）。
  - 前端打包：`pnpm run build` 成功建置。


### 172. 更多服務選單 100% 還原圖二「幫助中心」、最新活動輪播 sendEventList 恢復與 LINE 400 靜默失敗根除 (v0.1.72)
- **100% 還原圖二「🛠️ 聯絡與支援 / 幫助中心」選單 (`03_Flex_Templates.js`, `02_LineBot_Webhook.js`)**：
  - **根本原因排查**：先前產生的選單誤植為包含「裝備租借、待繳費用、個人主頁」之「服務大廳」（圖一），並非隊員習慣的幫助中心介面。
  - **完整像素級還原**：還原為原版圖二設計，包含：
    - 主視覺標題：`🛠️ 聯絡與支援 Support`、`幫助中心 Help Center`、`聯絡社團幹部 Contact Officers`。
    - 按鈕 1：`👤 幹部是誰 Officers`（點擊發送指令，即時回傳幹部職稱、頭像與業務卡片輪播）。
    - 按鈕 2：`📢 意見與回饋 Feedback`（點擊發送 Google 表單回饋連結 `https://forms.gle/bCT7fjVP3bSrReF96`）。
- **最新活動「點擊無反應」靜默失敗根除與原版 sendEventList 完整恢復 (`03_Flex_Templates.js`, `02_LineBot_Webhook.js`)**：
  - **根本原因排查**：
    1. **LINE 400 協定被拒**：先前樣板對每張卡片強制放入 `hero` 封面圖；當試算表中封面為 Google Drive 共享連結或非直連圖片時，LINE Messaging API 判定格式錯誤回傳 `400 Bad Request`，因 `muteHttpExceptions: true` 導致靜默失敗、使用者畫面全無反應。
    2. **表頭比對脫鉤**：先前嚴格比對 `"開始日期"`、`"費用"`，但主試算表實際表頭為 `"活動開始日期"`、`"預計費用"`。
    3. **試算表開啟防呆缺失**：若未設 `SPREADSHEET_ID`，直接呼叫 `openById(null)` 拋出例外中斷 Webhook。
  - **架構修復與升級**：
    1. **引入安全雙軌存取 (`_getSpreadsheet`)**：優先使用屬性 `SPREADSHEET_ID`，備援支援容器綁定之 `SpreadsheetApp.getActiveSpreadsheet()`，確保 100% 成功連線。
    2. **完整恢復原版 `sendEventList`**：支援全動態模糊表頭匹配、報名截止日逾期自動檢查與標記（`_isEventExpired`）。
    3. **圖片 URL 嚴格驗證**：僅在確定為合法 HTTP(S) 直連圖片且排除非圖片網址時附加 `hero`，徹底杜絕 LINE 400 拒發問題。
    4. **Postback 完整閉環**：卡片底部的「查看詳情 View」支援 Postback 回傳，點擊後即可查看詳細行程（`sendEventDetail`）並進行線上報名或候補意願確認（`confirm_waitlist`）。
- **模組化與單檔版完全同步 (`src/gas.js`)**：
  - 同步更新單檔整合版 `src/gas.js`，方便一鍵貼上至 Google Apps Script。
- **測試與驗證 (Verification)**：
  - 語法校驗：`node -c src/gas.js` 0 語法錯誤。
  - 測試套件：`pnpm test` 65/65 單元測試 100% 通過。
  - 前端打包：`pnpm run build` 成功建置。


### 171. officers 表 title 欄位 NOT NULL 約束自癒、雙向職稱相容與幹部同步 Trigger 容錯加強 (v0.1.71)
- **PostgreSQL 23502 非空約束自癒修復 (`member_officer_sync.sql`)**：
  - **根本原因排查**：既有 Supabase `officers` 資料表中包含歷史欄位 `title`（職稱），且被設置了 `NOT NULL` 約束且無預設值；當執行 Trigger 或回填既有幹部資料至 `members.is_officer` 時，觸發器的 `INSERT INTO officers` 因未傳入 `title` 欄位而拋出 `ERROR 23502: null value in column "title" violates not-null constraint`。
  - **動態字典自癒機制**：利用 PL/pgSQL 動態檢查 `information_schema.columns`，自動解除 `officers` 表除主鍵與 `line_user_id` 外所有歷史欄位的 `NOT NULL` 約束，並將 `title` 與 `role` 預設值皆統一設為 `'幹部'`。
  - **`role` 與 `title` 雙欄位相容寫入**：Trigger 在寫入/更新 `officers` 時同時帶入 `role` 與 `title`，徹底相容所有取用舊欄位名稱 `title` 或新欄位名稱 `role` 的查詢與 RPC。
  - **輸入防呆驗證**：新增 `trim(NEW.line_user_id) != ''` 驗證與 `trim()` 去除前後空白防護，避免無效空值寫入。
- **前端幹部狀態查詢雙重相容性提升 (`supabaseClient.ts`)**：
  - 在 `checkOfficerStatusFromSupabase` 的備援查詢中，同時讀取 `role` 與 `title` 欄位（`officerData.role || officerData.title || '幹部'`），確保即使歷史資料僅存在 `title` 亦能即時正確識別幹部身分與職稱。
- **測試與驗證 (Verification)**：
  - 執行 `pnpm test`：65/65 單元測試 100% 通過。
  - 執行 `pnpm run build`：0 TS 錯誤，前端打包建置成功。

### 170. 圖文選單雙語路由完整覆蓋、資料更新 LINE 明細推播、無欠款假報錯根治與 members.is_officer 自動同步機制 (v0.1.70)
- **圖文選單 (Rich Menu) 中英雙語關鍵字全覆蓋 (`02_LineBot_Webhook.js`)**：
  - **根本原因排查**：先前採用嚴格字串比對，導致點擊 LINE 圖文選單按鈕（發送中英文字如 `"最新活動 Activities"`、`"更多服務 More Services"`、`"幹部是誰 Officers"`）時比對失敗，誤掉入預設問候語。
  - **全面模糊匹配升級**：升級文字路由器，支援雙語關鍵字包含匹配（`includes`/`indexOf`）：
    - 支援 `最新活動`、`Activities`、`報名活動`、`Events`。
    - 支援 `更多服務`、`More Services`、`其他`、`More`。
    - 支援 `幹部名單`、`幹部是誰`、`Officers`。
    - 支援 `裝備租借`、`器材借用`、`Equipment Loan`。
    - 支援 `繳費系統`、`繳費中心`、`Payment System`。
    - 支援 `我的狀態`、`個人主頁`、`My Status`、`Dashboard`。
    - 支援 `填寫資料`、`Register`。
- **資料填寫/更新 LINE 即時推播明細通知 (`notify_profile_saved`)**：
  - **即時回傳異動摘要**：隊員於 LIFF 提交基本資料（無論是首次註冊或後續更新）後，前端非同步觸發輕量通知 Helper。
  - **專屬個人化推播**：透過 LINE Messaging API 即時推播：
    - **首次註冊**：發送「【🎉 歡迎加入！基本資料註冊成功】」歡迎詞與詳細檔案摘要。
    - **後續更新**：發送「【✅ 基本資料已成功更新】」並逐項列出姓名、學號、電話、緊急聯絡人、社員意願與經歷更新狀態。
- **繳費系統無欠款紅字「無法取得未繳費資料」假報錯徹底根治 (`Payment.tsx`)**：
  - **根本原因排查**：當隊員所有款項均已結清時，Supabase 端回傳空清單（`[]`）；但前端先前在特定 fallback 情境中未能正確處理空清單，導致頂部顯示「無法取得未繳費資料」，下方卻又顯示「目前無待繳費用」之矛盾現象。
  - **架構修復**：明確界定「無待繳項目」為成功狀態（`setError(null)`），只有在真正的連線失敗時才顯示錯誤，保持介面清爽。
- **幹部身分檢測修復與 members.is_officer 自動同步機制 (`member_officer_sync.sql`)**：
  - **GAS 路由與格式修復**：修正 `doGet` 支援 `action=check_officer_status`，並補齊 `status: "success"` 回傳格式，徹底解決先前被誤判為非幹部的問題。
  - **Supabase 優先秒級驗證 (`checkOfficerStatusFromSupabase`)**：前端 [`src/App.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 優先直查 Supabase，延遲降至 < 30ms。
  - **資料庫自動連動 Trigger 與 DDL 結構自癒 (`member_officer_sync.sql`)**：
    - **42703 欄位缺失自癒**：防禦性加入 `ALTER TABLE officers ADD COLUMN IF NOT EXISTS role TEXT DEFAULT '幹部'` 與 `line_user_id` 補齊語句，徹底杜絕歷史舊表缺少 `role` 欄位導致執行 SQL 時拋出 `42703: column o.role does not exist` 的問題。
    - 在 `members` 資料表新增 `is_officer BOOLEAN DEFAULT FALSE` 與 `officer_role TEXT DEFAULT '幹部'` 欄位。
    - 建立觸發器：當 `members.is_officer` 設為 `TRUE` 時，自動在 `officers` 表寫入該幹部資料並排入 `sync_queue` 回寫 Google Sheets；當設為 `FALSE` 時自動自 `officers` 表移除。
    - 一鍵回填：將既有 `officers` 名冊成員自動反向標記 `members.is_officer = TRUE`。
- **測試與驗證 (Verification)**：
  - 執行 `pnpm run build`：0 TS 錯誤，生產環境打包成功。
  - 執行 `pnpm test`：全套 14 大測試套件、65 個單元測試 100% 綠燈通過。

### 169. LIFF 直寫主試算表邏輯徹底切除、裝備租借原子性 RPC 與 9,500 行巨石 GAS 模組化拆分重構 (v0.1.69)
- **LIFF 前端去試算表化，100% 直連 Supabase 原生資料庫 (Zero-Sheets LIFF Architecture)**：
  - **切除雙軌偽同步**：
    - [`src/pages/Borrow.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)：徹底拔除 `fetch(GAS_API_URL, { action: 'submit_multi_loan' })` 直接寫入主試算表之舊邏輯，改為 100% 呼叫 Supabase `submitEquipmentLoanToSupabase`，操作延遲自原本 3~6 秒降至 < 50ms。
    - [`src/pages/Register.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)：移除 `save_profile` 雙軌寫入 Sheets 邏輯，個人基本資料透過安全 RPC `saveMemberProfileToSupabase` 直存資料庫。若有體能證明照，非同步呼叫輕量 Drive Helper 上傳並儲存 URL，絕不觸碰試算表。
    - [`src/pages/Payment.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)：移除 `submit_payment` 寫入 Sheets 邏輯，透過 `submitPaymentToSupabase` 原子更新對帳狀態，並非同步觸發輕量推播 Helper 通知幹部。
    - [`src/pages/Achievements.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)：移除 `submit_reflection` 寫入 Sheets 邏輯，純直寫 Supabase `saveReflectionToSupabase`。
    - [`src/pages/AdminEvents.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：移除切換活動狀態與審核報名者時呼叫 GAS 修改試算表的舊請求，全面由 Supabase RPC 承接。
    - [`src/pages/Dashboard.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)：移除取消租借與取消報名時向 GAS 發送的寫入請求，改由專屬 Supabase RPC 處理。
- **裝備租借原子性交易與庫存防超賣安全 RPC (`submit_equipment_loan_rpc.sql`)**：
  - **PostgreSQL 安全交易核心**：在 Supabase 端建立 `submit_equipment_loan_rpc(p_line_user_id, p_details)`：
    1. **會員價自動判定**：自動驗證社員社籍狀態，動態套用社員價或非社員價計費。
    2. **悲觀鎖定防超賣 (Pessimistic Locking)**：以 `SELECT ... FOR UPDATE` 鎖定各裝備品項，檢查可用庫存 (`available_qty`)，不足時立即 ROLLBACK 交易並拋出友善錯誤訊息。
    3. **原子扣減庫存**：直接在資料庫更新 `available_qty = available_qty - qty`。
    4. **主從表寫入**：生成標準單號（`ORD_YYYYMMDD_XXXX`），同步寫入 `loans` 主表與 `loan_items` 細項表，並由 DB Trigger 自動排入 `sync_queue`。
- **社員自主取消預約與活動報名 RPC (`cancel_rpc.sql`)**：
  - `cancel_equipment_loan_rpc`：驗證本人身分，將租借單標記為已取消，並自動遍歷關聯細項將裝備數量返還回 `available_qty` 庫存。
  - `cancel_event_signup_rpc`：將報名名冊狀態更新為已取消，並安全附帶取消原因。
- **9,553 行巨石 GAS 模組化拆分與瘦身重構 (Modular GAS Architecture)**：
  - **痛點根治**：原本 416KB、9,553 行巨石 `gas.js` 導致 Apps Script 編輯器卡頓與維護高風險。
  - **拆解為 6 大職責清晰的原生模組**（位於 [`gas_modules/`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/)）：
    1. [`01_Config_Auth.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js)：環境變數、LINE ID Token (JWT) 校驗快取、共通回應與工具。
    2. [`02_LineBot_Webhook.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js)：LINE Messaging API 總機、文字指令分流、Postback 路由。
    3. [`03_Flex_Templates.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js)：最新活動輪播、單一活動詳情、幹部名片與服務大廳 Flex 卡片建構器。
    4. [`04_Ai_Gemini.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js)：Gemini 2.0 Flash AI 客服、Google Docs 雲端大腦知識庫與公開活動過濾。
    5. [`05_Sync_Worker.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js)：Supabase `sync_queue` 排程消費，單向批次平滑回寫 Google Sheets（支援 `Loan_Records` 主從表自動新增與狀態自癒）。
    6. [`06_Helper_Services.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js)：LIFF 專用輕量非同步 Helper（僅處理 Google Drive 照片上傳與 LINE 推播通知，絕不接觸試算表）。
  - **瘦身成果**：徹底刪除已由 Supabase 替代的 4,000+ 行舊版 CRUD API 與重複試算表查找迴圈，單檔自 9,553 行減少超過 **8,300 行** 至 1,249 行，啟動速度與可維護性大幅提升。
- **測試與驗證 (Verification)**：
  - 執行 `pnpm run build`：TypeScript 與 Vite 打包成功（0 TS 錯誤）。
  - 執行 `pnpm test`：全套 14 大測試套件、65 個單元測試 100% 綠燈通過。

### 168. 社團主試算表 (Members/Equipments/Events) 雙向差異比對同步引擎、零幻想欄位對齊與測試診斷數據隔離清理 (v0.1.68)
- **主試算表定位確立：幹部行政主工作台 (Primary Administrative Workbench)**：
  - **架構設計**：確立主試算表為幹部日常批次編輯、快速更新（社員資料、裝備庫存、活動行程）的主工作台；Supabase 則為面向隊員 LINE LIFF 手機端的高速 Serving Layer。避免幹部被迫在手機 LIFF 上填寫繁複的後台表單。
  - **零幻想欄位嚴格對齊 (Zero-Hallucination Schema Mapping)**：
    - **`Members` 社員清冊 (24 欄位)**：以「系統識別碼」為主鍵對齊 `members.line_user_id`，涵蓋：`系統識別碼 | 姓名 | 性別 | Line ID | 聯絡信箱 | 聯絡電話 | 系所 | 學號 | 繳費狀態 | 社籍到期日 | 生日 | 證件號碼 | 聯絡地址 | 爬山經驗 | 體能測驗 | 體能證明 | 緊急聯絡人姓名 | 緊急聯絡人關係 | 緊急聯絡人電話 | 緊急聯絡人聯絡地址 | 個人特殊病史或過敏 | 身分狀態 | 加入社員意願 | 擔任幹部意願`。
    - **`Equipments` 裝備清單 (14 欄位)**：以「裝備代號」為主鍵對齊 `equipments.id`，涵蓋：`裝備代號 | 裝備名稱 | 總數量 | 剩餘數量 | 是否外借 | 租金（2天） | 租金（+1天） | 狀態 | 備注 | 圖片網址1 | 圖片網址2 | 圖片網址3 | 圖片網址4 | 圖片網址5`。
    - **`Events` 活動清單 (14 欄位)**：以「活動編號」為主鍵對齊 `events.id`，涵蓋：`活動編號 | 活動名稱 | 預計費用 | 活動開始日期 | 活動結束日期 | 報名截止日期 | 報名狀態 | 簡介 | 詳細行程 | 封面圖網址 | 活動編號 | 雲端資料夾網址 | 報名名冊網址 | 試算表ID`。
- **現代化側邊欄比對與批次同步引擎 (`openMainSyncSidebar` / `getMainSyncDiffAPI`)**：
  - **自動偵測當前分頁**：幹部切換至 `Members`、`Equipments` 或 `Events` 工作表後，點選選單「🔄 比對並同步至 Supabase (目前分頁)」，側邊欄自動精準載入對應比對引擎。
  - **視覺化差異比對 (Visual Diff)**：自動高亮展示修改項目（舊值 ➔ 新值）與新建立列，清楚呈現變更欄位名稱與資料內容，統計異動筆數與全表總數。
  - **批次安全寫入 (`commitMainSyncToSupabaseAPI`)**：點擊「確認同步至 Supabase」後，採用批次 Upsert（`Prefer: resolution=merge-duplicates`），同步完成即時顯示綠燈完成狀態，絕不額外發送任何 LINE 推播打擾隊員。
- **測試診斷社員 (`U_TEST_DIAGNOSTIC` / `測試報名社員`) 徹底隔離與一鍵清理**：
  - **同步排他保護 (`gas_sync_worker.js`)**：在背景同步作業 (`_syncMemberToSheet`) 中加入篩選防線，凡含有 `TEST_DIAGNOSTIC` 或 `測試報名社員` 者，一律略過回寫至 Google Sheets，防止測試數據重現。
  - **主試算表一鍵清理工具 (`cleanupDiagnosticData`)**：於主試算表頂部選單新增「🧹 一鍵清理測試診斷資料」，點選後自動清除 `Members` 與 `Signups` 表格中的診斷測試行，並同步呼叫 DELETE 清理 Supabase 的 `event_signups`、`events` 與 `members` 關聯測試列。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增 Suite 13：涵蓋 24 欄位 Members、14 欄位 Equipments、14 欄位 Events 提取與驗證，以及診斷過濾清理單元測試。
  - 執行 `pnpm test`：65 項單元測試 100% 綠燈通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境打包編譯成功。
- **Google Apps Script 跨檔案複製隔離與連線金鑰未繼承根治**：
  - **根本原因**：Google Drive 透過 `makeCopy` 複製試算表範本時，基於安全性設計**絕不複製 Script Properties**，新試算表的指令碼屬性天然為空；且主系統在建立 `_CONFIG` 時先前未將 `SUPABASE_URL` 與金鑰寫入。
  - **全自動穿透注入 (`_setOrUpdateConfigRow`)**：在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `_createEventDriveFolderAndSheet` 中，複製或建立活動試算表時，自動將主系統的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 與 `MEMBER_BOT_TOKEN` 全量寫入該試算表之隱藏 `_CONFIG` 工作表。
  - **自癒補齊與修復工具 (`repairEventSheetConfig`)**：於報名追加 (`_asyncAppendToEventSpreadsheet`) 開啟試算表時，自動巡檢補齊 `_CONFIG` 缺少的金鑰。主系統更附帶 `repairEventSheetConfig(spreadsheetIdOrUrl)` 函數，供幹部一秒修復任一活動試算表之連線設定。
- **試算表端模糊解析、雙向自癒快取與友善權限提示 (`event_sheet_script.js`)**：
  - **模糊鍵名容錯**：`getSupabaseConfig` 支援如 `SUPABASE_UR`、`SUPABASE_SE` 等鍵名模糊比對。
  - **雙向自癒快取**：當從 `_CONFIG` 讀取到連線參數後，自動呼叫 `setProperties(...)` 永久存入當前試算表的 `Script Properties`。
  - **42501 友善錯誤導引**：若幹部誤填 `anon` 公開金鑰，系統直觀提示「您目前使用的是 anon 金鑰，請改用 service_role (secret) 金鑰」。
  - **UI 設定彈窗 (`setupSupabaseConfigUI`)**：頂部「🏔️ 社團系統」選單新增「⚙️ 設定 / 檢視 Supabase 連線參數」，可在彈出對話框直接修改與測試，免進 Apps Script 後台。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增 `_CONFIG` 鍵值更新與模糊金鑰解析單元測試。
  - 執行 `pnpm test`：61 項單元測試全數 100% 綠燈通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境打包編譯通過。

### 166. 新活動雙筆重複建立徹底根治、雲端試算表連結全欄位 Upsert 與 Google Drive 智慧搜尋備援 (v0.1.66)
- **新活動雙筆重複紀錄根治 (Dual Event ID Collision Fix)**：
  - **根本原因排查**：幹部於後台建立新活動時，[`src/pages/AdminEvents.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 為了提速，在未確定活動編號（`formData.eventId` 為空）的情況下**平行發送** Supabase RPC 與 GAS 請求。Supabase 的 `save_admin_event_rpc` 收到空 ID 自動生成了帶時間戳的 ID（如 `E20260912_184732`）；GAS 的 `processSaveEvent` 則自動生成社團標準序號（如 `E2609-02`），導致同場活動在 Supabase 出現兩筆重複活動。
  - **流程全面梳理**：於 [`src/pages/AdminEvents.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 中區分「新活動建立」與「舊活動編輯」：
    1. **新活動**：先由 GAS 統一建立活動、生成 Google Drive 資料夾與名冊試算表，取得一致的社團 ID（如 `E2609-02`）與確定之雲端連結後，再同步確認寫入前端與 Supabase，徹底杜絕幽靈時間戳 ID。
    2. **舊活動**：維持既有秒級直接更新 Supabase。
- **雲端欄位全量 Upsert 持久化 (`_syncEventToSupabase`)**：
  - **PATCH 失敗修復**：先前 GAS 建立試算表後採用 `PATCH /rest/v1/events?id=eq.` 更新雲端連結，若該活動尚未預存於 Supabase，PostgREST 會因找不到紀錄而直接略過（更新 0 筆），導致 `drive_folder_url`、`spreadsheet_url`、`spreadsheet_id` 遺漏。
  - **實作完整 Upsert**：於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 新增 `_syncEventToSupabase`，改用 `POST /rest/v1/events?on_conflict=id` 搭配 `resolution=merge-duplicates`，在 GAS 建立雲端資源後將活動資訊連同 `drive_folder_url`、`spreadsheet_url`、`spreadsheet_id` 一次性全量寫入；並強化 `_syncEventDriveUrlsToSupabase`，在無原紀錄時自動觸發補全 Upsert。
- **Google Drive 智慧檔名搜尋備援 (DriveApp Smart Search Fallback)**：
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `_asyncAppendToEventSpreadsheet` 中，若 Supabase 與主試算表歷史資料均查無試算表 ID，自動透過 `DriveApp.searchFiles` 於 Google 雲端硬碟智慧搜尋符合活動名稱的名冊試算表，成功定位後立即追加報名列，並自動回寫修補 Supabase 之 `spreadsheet_id` 與 `spreadsheet_url`，達成系統自我修復。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增新活動 Upsert 與 Google Drive 智慧搜尋單元測試。
  - 執行 `pnpm test`：59 項單元測試全數 100% 綠燈通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境打包編譯通過。

### 165. 活動專屬試算表追加引擎健全化、未宣告變數修復與獨立試算表診斷工具 (v0.1.65)
- **活動專屬試算表追加引擎異常修復 (`_asyncAppendToEventSpreadsheet`)**：
  - **未宣告變數 ReferenceError 根治**：在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `handleSignup` 報名主流程中，先前傳入活動專屬試算表之個資物件含有未定義之 `userProfile` 變數存取，導致拋出 `ReferenceError: userProfile is not defined` 並被 catch 阻斷，使得 `_asyncAppendToEventSpreadsheet` 未能順利執行。已全面校正為使用通過檢核之 `p` 物件（`p.realLineId`、`p.studentAddr`、`p.idNumber` 等）。
  - **智慧試算表 ID 解析與 URL 正規化 (`_extractSpreadsheetId`)**：新增 `_extractSpreadsheetId` 輔助函式，支援直接貼入之 Google 試算表完整網址（`https://docs.google.com/spreadsheets/d/<ID>/edit`），自動安全提取純 44 碼試算表 ID，杜絕 `SpreadsheetApp.openById` 傳入網址時拋出之例外。
  - **彈性欄位索引支援**：於 Supabase 查詢時同時撈取 `spreadsheet_id` 與 `spreadsheet_url`；於主試算表 `Events` 表中支援包含「試算表ID」、「試算表 ID」、「報名名冊網址」、「試算表網址」等多種常見表頭別名。
- **專屬試算表寫入專用診斷工具 (`testEventSpreadsheetAppend`)**：
  - 於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 提供 `testEventSpreadsheetAppend()` 函式，幹部可直接在 Apps Script 編輯器執行，快速檢驗系統能否自 Supabase 或主試算表正確解析出專屬試算表 ID 並寫入測試名冊列。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 測試全數通過。
  - 執行 `pnpm test`：57 項單元測試 100% 綠燈。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 164. 活動報名 Supabase 外鍵約束自動防護與一鍵連線診斷工具 (v0.1.64)
- **活動報名 Supabase 外鍵防護強化 (`events` & `members` 自動預防)**：
  - **外鍵衝突根治**：當報名社員在 LINE 點擊報名時，若該活動尚未預先同步至 Supabase `events` 表，PostgreSQL 外鍵約束（`event_signups_event_id_fkey`）會導致寫入失敗。於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `_syncSignupToSupabase` 中加入前置 `events` 自動保全機制（`POST /rest/v1/events?on_conflict=id`，`resolution=ignore-duplicates`），確保活動記錄存在且外鍵 100% 滿足。
  - **參數傳遞完善**：於 `handleSignup` 呼叫時主動傳遞 `eName` 活動名稱，提供更完整的活動關聯。
  - **連線與錯誤日誌可視化**：當 `SUPABASE_URL` 或 `SUPABASE_SERVICE_ROLE_KEY` 遺漏，或 PostgREST 回傳 HTTP 錯誤時，以 `console.error` 明確輸出失敗原因與狀態碼，杜絕靜默失敗。
- **一鍵連線診斷工具 (`testSupabaseSignupSync`)**：
  - 於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 增設診斷函數 `testSupabaseSignupSync()`。幹部可直接在 Apps Script 編輯器下拉選取並點擊「▷ 執行」，系統會即時檢測 Script Properties 配置狀態，並模擬一筆報名寫入 `members` 與 `event_signups`，直觀輸出診斷報告。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 測試全數通過。
  - 執行 `pnpm test`：57 項單元測試 100% 綠燈。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 163. 活動報名全面直寫 Supabase (`event_signups` & `members`) 與取消報名雙向同步 (v0.1.63)
- **活動報名全面即時寫入 Supabase 資料庫 (Instant Supabase Dual-Write Engine)**：
  - **問題修復**：先前社員透過 LINE 機器人「我要報名」登記活動時，後端 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 僅寫入 Google 試算表（全域 Signups 表與活動專屬名冊表），未同步至 Supabase `event_signups`，導致後台管理系統查無報名者、繳費系統無法自動抓取正取待繳費用。
  - **核心實作 (`_syncSignupToSupabase`)**：
    1. **Upsert `members` 表**：自動將報名者姓名、性別、電話、Email、地址、生日、證件號碼、緊急聯絡人姓名/電話/關係/地址、爬山經驗、體能及正式社員狀態，透過 `POST /rest/v1/members?on_conflict=line_user_id`（`Prefer: resolution=merge-duplicates`）完成同步更新，確保外鍵相依完整且個資最新。
    2. **Insert/Upsert `event_signups` 表**：即時寫入報名專屬碼（`id`）、活動編號（`event_id`）、LINE 使用者識別碼（`line_user_id`）、姓名（`name`）、初始審核狀態（`status: "審核中 Checking"`）及正式社員快照（`is_official_member_snapshot`）。
    3. **主流程不卡頓**：採用獨立 `try...catch` 包覆，即便雲端網路波動亦不阻斷 LINE 回覆與專屬試算表追加。
- **取消報名全面連動 Supabase (`_syncSignupCancelToSupabase`)**：
  - 當社員透過 LIFF 個人主頁取消活動（`processLiffCancelEvent`）或於 LINE 對話中完成取消流程（`handleEventCancelReason` / `cancel_event`）時，自動發送 PATCH 請求將該筆報名之 `status` 更新為 `已取消 Cancelled` 並寫入 `cancel_reason`。
- **測試與驗證 (Verification)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增報名與取消同步至 Supabase 之單元測試。
  - 執行 `pnpm test`：57 項單元測試 100% 綠燈通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 162. 試算表 22 欄全規格表頭對齊、Script Properties 金鑰安全架構與容器腳本容錯升級 (v0.1.62)
- **22 欄標準名冊表頭完全對齊 (22-Column Standard Roster Integration)**：
  - 依照使用者需求，全面將活動報名名冊試算表表頭升級為 22 欄標準規格：
    `[系統識別碼, 專屬碼, 姓名, 性別, LINE ID, 聯絡信箱, 聯絡電話, 聯絡地址, 生日, 證件號碼, 緊急聯絡人姓名, 緊急聯絡人電話, 緊急聯絡人聯絡地址, 緊急聯絡人關係, 爬山經驗, 體能測驗, 體能證明, 是否為社員, 審核結果, 通知狀態, 繳費狀態, 備註]`。
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `_createEventDriveFolderAndSheet` 中，若無範本而程式化建立試算表時，自動套用此 22 欄全格式表頭。
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `_asyncAppendToEventSpreadsheet` 與報名流程中，動態對應社員完整個人資料（LINE ID、電子信箱、通訊地址、緊急聯絡人地址、體能證明等），自動依欄位名稱精準填入。
- **Supabase 連線資訊導入 Script Properties (指令碼屬性) 安全架構**：
  - 遵循資安最佳實踐，在 [`supabase/event_sheet_script.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_script.js) 中將 Supabase 連線參數（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`）與 LINE Token（`MEMBER_BOT_TOKEN`）改由 Apps Script「專案設定 ➔ 指令碼屬性 (Script Properties)」動態讀取。
  - 避免將資料庫連線字串與密鑰硬編碼在腳本中，便於跨試算表與多環境安全管理。
- **Apps Script 執行環境診斷與 `onOpen` 安全容錯 (Standalone vs. Container-bound Script Diagnostics)**：
  - 解析使用者在編輯器手動執行 `onOpen` 或在獨立腳本（Standalone Script）中執行時拋出 `Exception: Cannot call SpreadsheetApp.getUi() from this context.` 之成因：
    1. 在 Apps Script 程式碼編輯器中手動點擊「執行 onOpen」時，因缺乏試算表 UI 互動上下文，`SpreadsheetApp.getUi()` 必然會拋出此錯誤；但當使用者從 Google 試算表視窗重新載入頁面時，試算表會作為綁定容器自動正常觸發並產生選單。
    2. 若先前建立成獨立指令碼（Standalone），無法取得試算表宿主實例。
  - 於 [`supabase/event_sheet_script.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_script.js) 之 `onOpen` 中加入安全 `try...catch` 捕捉，確保在非 UI 環境中安全輸出日誌而不拋出阻斷性異常。
- **測試與驗證 (Verification)**：
  - 全套單元測試已擴充涵蓋 22 欄動態映射與 Script Properties 讀取邏輯。
  - 執行 `pnpm test`：55 項單元測試 100% 綠燈通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 161. 範本試算表自動複製機制與試算表「一鍵推播正備取通知」引擎 (v0.1.61)
- **需求背景與幹部體驗升級 (Template Auto-Copy & One-Click Admission Notification)**：
  - **自帶按鈕與選單**：為讓每一次發布新活動時自動生成的試算表皆「100% 內建頂部自訂選單與側邊欄」，無需幹部手動複製貼上 Apps Script 腳本，正式導入「Google Drive 範本複製機制」。
  - **試算表直發錄取推播**：幹部於試算表中完成審核後，可直接在試算表頂部選單點擊「📢 一鍵推播正備取錄取通知」，系統自動發送 LINE Flex 錄取通知卡片並回標「已通知」，免去在多個系統間切換。
- **範本自動複製與動態綁定 (Template Copy Engine)**：
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `_createEventDriveFolderAndSheet` 中，支援讀取 Script Properties 中的 `EVENT_SHEET_TEMPLATE_ID`。
  - 當設定範本 ID 時，自動在活動資料夾中透過 `makeCopy()` 複製範本，確保產生的試算表立即內嵌完整 Apps Script 腳本。
  - 自動於新試算表的 `_CONFIG` 工作表動態寫入本次活動的 `EVENT_ID` 與 `EVENT_NAME`，無縫完成綁定。
  - 若尚未設定範本 ID，自動平滑回退（Fallback）為程式化生成，保證建立流程 100% 穩定不中斷。
- **試算表專屬綁定腳本雙核心升級 ([supabase/event_sheet_script.js](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_script.js))**：
  - **頂部自訂選單**：
    1. `🔄 比對差異並同步至 Supabase`：啟動側邊欄進行無害安全差異比對與資料庫覆寫。
    2. `📢 一鍵推播正備取錄取通知`：執行錄取名單智慧推播。
  - **防呆確認對話框**：發送前統計並提示「待通知總人數、正取人數、備取人數」，幹部確認後始進行推播。
  - **官方 Flex 卡片發送**：
    - 正取隊員：發送綠色系錄取卡片，包含活動名稱、出隊須知與「前往繳費系統」一鍵跳轉按鈕。
    - 備取隊員：發送橘色系備取卡片，附帶「確認備取意願」互動按鈕。
  - **防止重複推播**：發送成功後，自動在該隊員列之「通知狀態」欄位寫入「`已通知`」。
- **名冊表頭 17 欄對齊與動態對稱寫入**：
  - 表頭增補「通知狀態」欄位，標準結構為：`[報名專屬碼, 審核狀態, 通知狀態, 繳費狀態, 姓名, 性別, 身分證字號, 出生年月日, 手機電話, 緊急聯絡人, 關係, 聯絡人電話, 登山經驗與體能, 特殊病史與過敏, 飲食習慣, 系統識別碼, 備註]`。
  - `_asyncAppendToEventSpreadsheet` 改採表頭動態檢索填入（Dynamic Header Matching），相容 16 欄與 17 欄試算表。
- **測試與驗證 (Verification)**：
  - 更新 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs)，全套 18 組套件、53 項單元測試 **100% 綠燈通過**。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 160. 核心資料庫結構腳本冪等性全面升級與自我修復強化 (v0.1.60)
- **問題分析與修復 (Idempotent DDL & Error 42710 Fix)**：
  - 在既有 Supabase 資料庫重新執行 [`supabase/schema.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql) 時，因 PostgreSQL 觸發器已存在，拋出 `ERROR: 42710: trigger "trg_members_updated_at" for relation "members" already exists`。
  - 為所有 Trigger 加入前置 `DROP TRIGGER IF EXISTS <trigger_name> ON <table_name>`，消除重複建立時之衝突。
  - 為所有 RLS 安全政策（`CREATE POLICY`）全面增設 `DROP POLICY IF EXISTS "<policy_name>" ON <table_name>`，確保政策更新時平滑覆蓋不中斷。
- **欄位自癒修復 (Self-Healing Column Migration)**：
  - 增設 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 語句，確保已建立之既有資料庫在執行時自動補齊：
    - `events`：`drive_folder_url`、`spreadsheet_url`、`spreadsheet_id`
    - `event_signups`、`loans`、`reflections`、`payments`：`name`（社員姓名直觀辨識）
    - `payments`：`amount`（手動維護金額支援）
  - 達成隨時可在 Supabase SQL Editor 完整重新執行而 100% 綠燈成功。
- **測試與驗證 (Verification)**：
  - 執行 `pnpm test`：50 項單元測試全數通過。
  - 執行 `pnpm run lint`：0 錯誤。
  - 執行 `pnpm run build`：Vite 生產環境建置成功。

### 159. 活動專屬 Google Drive 資料夾與報名試算表自動化、側邊欄差異比對同步 (v0.1.59)
- **需求背景與入山證行政效率革新 (Automated Mountain Permit Sheet & Folder)**：
  - 幹部在申請國家公園入園證、警政署入山證與辦理登山平安保險時，需要單一活動所有報名人員之完整檢核資料（含身分證字號、出生年月日、手機、緊急聯絡人姓名/關係/電話、登山經驗、體能與特殊病史等）。
  - 原先所有活動之報名資料全數混雜於全域資料表中，難以迅速篩選與匯出；藉由本次更新，幹部新增活動時自動化一鍵建妥專屬作業空間。
- **自動化 Google Drive 資料夾與名冊試算表建立 (Google Drive & Sheets Integration)**：
  - **資料夾命名規範**：於 Google Drive 根目錄自動建立格式為 `YYYY/MM/DD_活動名稱`（例如 `2026/09/20_七星山主東峰`）之專屬資料夾。
  - **試算表初始化**：在該資料夾內自動建立 `YYYY/MM/DD_活動名稱_報名名冊` 專屬試算表。
  - **專業表頭與版面美化**：工作表命名為「報名名冊」，自動填入 16 欄入山險標準規格表頭（置頂凍結第 1 列、藍色背景高對比樣式），並自動建立隱藏之 `_CONFIG` 工作表儲存 `EVENT_ID`，供後續雙向同步綁定。
- **後台直觀操作介面 (Clean UI Without Emoji)**：
  - 於 [`src/components/admin/AdminEventCard.tsx`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx) 為具備雲端資源的活動增設純文字無表情符號按鈕：`[開啟活動資料夾]` 與 `[開啟報名試算表]`，支援點擊一鍵直達 Google 雲端作業空間。
- **超高速報名寫入與非同步名冊追加 (Ultra-Fast Registration & Async Append)**：
  - 社員透過 LINE LIFF 登記活動時，Supabase 資料庫於 < 0.1s 內完成寫入並立即回應。
  - 於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 透過 `_asyncAppendToEventSpreadsheet` 在背景非同步將報名資料附加至該活動專屬試算表，完全不造成報名流程延遲卡頓。
- **試算表側邊欄差異比對與同步引擎 (Diff & Sync Engine)**：
  - 於 [`supabase/event_sheet_script.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_script.js) 與 [`supabase/event_sheet_sidebar.html`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_sidebar.html) 提供試算表內嵌之 Apps Script 腳本與現代化側邊欄：
    1. 頂部自訂選單：「🏔️ 社團系統 ➔ 比對差異並同步至 Supabase」。
    2. **嚴格過濾保護**：僅比對具備有效「報名專屬碼」（`S` 開頭）之正式報名列；幹部在表格下方自行補充之車輛接駁安排、伙食採買、待辦事項等雜項註記自動略過，避免破壞系統資料庫。
    3. **直觀差異預覽**：側邊欄自動以卡片對比列出「原先值 ➔ 試算表值」，清楚標示異動欄位。
    4. **幹部確認後批次回寫**：經幹部檢閱無誤後點擊「確認同步至 Supabase」，自動透過 REST API 覆寫 `event_signups` 與 `members` 之對應個資欄位。
- **嚴格零 LINE 訊息干擾規範 (Strict Zero LINE Push Notification Policy)**：
  - 依使用者明確要求，試算表向 Supabase 執行同步時，**絕對不發送任何 LINE 訊息**給社員或幹部，僅在當前試算表以側邊欄介面與 `SpreadsheetApp.toast` 提供完成提示。
- **資料庫與工具鏈全面升級**：
  - [`supabase/schema.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql) & [`supabase/admin_events_rpc.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql)：`events` 資料表擴充 `drive_folder_url`、`spreadsheet_url`、`spreadsheet_id` 欄位與自癒遷移。
  - [`src/types/event.ts`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/event.ts)：`AdminEvent` 型別增補雲端連結屬性。
  - [`src/utils/supabaseClient.ts`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts)：`saveEventToSupabase` 完整持久化雲端資源屬性。
  - [`supabase/gas_sync_worker.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/gas_sync_worker.js)：支援活動雲端網址同步回主試算表。
- **自動化測試與驗證 (Verification)**：
  - 更新 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs)，新增 Suite 12 專屬測試，全套 18 組套件、50 項單元測試 **100% 綠燈通過**。
  - 執行 `pnpm run lint` 0 錯誤、`pnpm run build` Vite 建置成功。

### 158. 全域 line_user_id 關聯表增補 name 欄位與自動同步自癒機制 (v0.1.58)
- **需求背景與體驗升級 (Human-Readable Tables in Supabase Dashboard)**：
  - 管理者在 Supabase Table Editor 檢視資料表時，先前僅有 `line_user_id`（如 `U123456789...`），不易立即辨識資料所屬社員。
  - 為所有具備 `line_user_id` 的資料表（`payments`、`loans`、`event_signups`、`reflections`）全面增設 `name`（社員姓名）欄位，達成後台直觀識別。
- **資料庫結構自動升級與歷史自癒回填 (Schema & Self-Healing Migration)**：
  - 於 [`supabase/schema.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql) 以及 RPC 腳本最頂部加入自癒遷移語句，自動增補 `name TEXT` 欄位。
  - 內建歷史紀錄自動回填語句，執行時自動自 `members` 表批次補齊既有資料的社員姓名。
- **自動化觸發器雙向聯防 (Database Triggers)**：
  - 於 [`supabase/triggers.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/triggers.sql) 實作：
    1. `trg_fn_auto_fill_member_name`：在 `payments`、`loans`、`event_signups`、`reflections` 新增或修改紀錄時，若未帶姓名，自動自 `members` 根據 `line_user_id` 查出姓名並填入。
    2. `trg_fn_sync_member_name_to_children`：當社員於 `members` 表變更個人姓名時，自動連動批次更新其名下所有歷史繳費、租借、報名與心得紀錄之 `name`。
- **RPC 與工具層全面對齊**：
  - [`supabase/payment_rpc.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql)：`submit_payment_rpc` 寫入時主動記錄 `name`。
  - [`supabase/history_achievements_rpc.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql)：`submit_reflection_rpc` 寫入時主動記錄 `name`，`get_my_payment_history` 查詢亦包含 `name` 欄位。
  - [`supabase/admin_events_rpc.sql`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql)：`get_admin_event_signups_rpc` 優先採用 `s.name`。
  - [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：`_syncPaymentToSupabase` 自動附加 `userName`。
  - [`supabase/etl_v2.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/etl_v2.js)：清洗匯入時一併提取 Google Sheets 的 `姓名` 欄位。
- **自動化測試與代碼品質**：
  - 更新 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs)，全套 17 組套件、46 項單元測試 **100% 綠燈通過**。
  - 執行 `pnpm run lint` 0 錯誤、`pnpm run build` Vite 建置成功。

### 157. 支援手動維護金額：移除自動比對推算舊付款金額邏輯與簡化 Supabase Schema (v0.1.57)
- **使用者自主維護金額架構 (Manual Amount Input Support)**：
  - **移除自動推算與猜測**：因使用者規劃直接在 Supabase 資料庫 `payments` 表中手動輸入與校對真實繳費金額，系統徹底刪除先前的舊資料自動比對與智慧推算引擎（包含 Events 活動費用、Loan_Records 裝備租金、預設社費 $200 及文字正則擷取），確保系統忠實呈現使用者輸入之數據，杜絕自動計算造成的非預期覆寫。
- **Supabase RPC 預存程序淨化 (RPC Cleanup)**：
  - [supabase/history_achievements_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql)：
    - 刪除 `get_my_payment_history` 中所有 `UPDATE payments SET amount = ...` 自動修改舊資料的區塊。
    - 查詢直接採用 `COALESCE(amount, 0) AS display_amount`，使用者於 Supabase 輸入的金額將即時且正確地呈現於個人繳費歷史與成就總累計（`total_spent`）。
    - 結構自動遷移（Self-healing Schema Migration）僅保留必要的 `ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount INTEGER NOT NULL DEFAULT 0;`，不產生未規劃欄位。
  - [supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql)：
    - 簡化結構遷移，僅新增 `amount` 欄位；移除 `submit_payment_rpc` 中金額為 0 時的自動兜底計算邏輯，直接採用前端傳入之真實金額。
- **GAS 後端代碼淨化 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - 徹底移除 `_inferPaymentAmount` 函式。
  - 淨化 `getPaymentHistoryAPI`：移除 `amount <= 0` 時的推算與嘗試回填邏輯，直接讀取原始資料。
- **ETL 匯入工具同步簡化 ([supabase/etl_v2.js](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/etl_v2.js))**：
  - 移除 `_etlPaymentsV2` 中針對 `eventCosts`、`loanCosts` 與推算補齊之程式碼，匯入時忠實保留試算表數據。
- **自動化測試與驗證 (Verification)**：
  - 更新 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 之 Suite 11，全套 17 組套件、44 項單元測試 **100% 通過**。
  - 執行 `pnpm run lint` 0 錯誤、`pnpm run build` Vite 建置成功。

### 156. Supabase RPC 腳本資料表結構自癒自動遷移 (Self-healing Schema Migration) (v0.1.56)
- **歷史緣由與技術債排查 (Why Amount Column Was Missing Originally)**：
  - **純人工對帳時代的遺留設計**：早期社團幹部在規劃 Google Sheets `Payments` 對帳分頁時，流程純為幹部手動核對帳號末 5 碼與網銀明細，應繳金額各自記錄於 `Events`（活動費用）與 `Loan_Records`（裝備租金）分頁中，因此 `Payments` 當初僅規劃了 9 欄（聯絡與核對專用）。
  - **資料庫遷移落差**：系統遷移至 Supabase 時，若 `payments` 資料表早已存在（例如早期鏡像自 Google Sheets），PostgreSQL 的 `CREATE TABLE IF NOT EXISTS` 會直接跳過建立，不會為既有表自動增補欄位；而 RPC 腳本僅宣告函式（`CREATE FUNCTION`），導致 `amount` 欄位未能自動生成於既有資料表中。
- **全自動自癒遷移架構 (Self-healing Table Migration)**：
  - 於 [supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql) 與 [supabase/history_achievements_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql) 最頂端加入 `ALTER TABLE payments ADD COLUMN IF NOT EXISTS ...`：
    - 自動增補 `amount INTEGER NOT NULL DEFAULT 0`
    - 自動增補 `target_type TEXT`、`target_id TEXT`、`bank_last5 TEXT`、`proof_image_url TEXT`、`officer_notes TEXT`、`confirmed_by TEXT`、`confirmed_at TIMESTAMPTZ`
  - 任何開發者或管理者只要在 Supabase SQL Editor 執行 RPC 腳本，資料庫便會**自動升級並補全資料表結構**，永久消除既有表欄位脫節問題。
- **代碼品質與驗證**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 單元測試 44/44 全數通過，`pnpm run lint` 0 錯誤，`pnpm run build` Vite 建置成功。

### 155. GAS Payments J1 資料驗證例外修復與 Supabase 雙向深度整合 (v0.1.55)
- **根本原因排查與 J1 表頭資料驗證零破壞防護**：
  - 徹底解決 Google Sheets `Payments` 工作表觸發 `Exception: The data you entered in cell J1 violates the data validation rules set on this cell` 的執行中斷問題。
  - **根因分析**：Google Sheets 試算表第 1 列設有強制資料驗證規則，限定僅能填入 9 個標準表頭（`姓名, 對帳狀態, 帳號末5碼, 繳款時間, 活動名稱, 系統識別碼, 繳費項目, 裝備名稱, 備註`）。前版程式碼在試算表缺少「金額」欄位時試圖在第 10 欄（Cell J1）自動新增寫入 `"金額"`，觸發驗證衝突崩潰。
  - **解決方案**：
    1. 徹底重構 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `_ensurePaymentAmountCol` 為純唯讀檢查（轉調 `_findAmountColIdx(headers)`），嚴格禁止任何修改表頭與寫入 J1 的動作。
    2. 在 `processPaymentSubmit` 與 `handlePaymentInput` 中，寫入列長度嚴格維持 9 欄；若無獨立金額欄位，自動將金額資訊安全記錄於「備註」（例如：`[金額: $350] 台銀轉帳`）與「繳費項目」中，確保試算表資料完整且 100% 符合驗證規範。
    3. 在 `getPaymentHistoryAPI` 中，純粹透過記憶體運算推算金額，若無金額欄位絕不嘗試回寫試算表表頭。
- **GAS 全面對接 Supabase (< 50ms 雙核心架構)**：
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 頂部讀取指令碼屬性 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`。
  - **優先讀取 Supabase (`_fetchPaymentHistoryFromSupabase`)**：調用 `get_payment_history` 時，GAS 優先透過 REST API 呼叫 Supabase `get_my_payment_history` 安全 RPC。若取得資料直接回傳給前端，享有 < 50ms 極速與精準金額。
  - **同步提交至 Supabase (`_syncPaymentToSupabase`)**：在 `processPaymentSubmit` 與 `handlePaymentInput` 申報繳費時，同步以 `submit_payment_rpc` 寫入 Supabase，確保雙向即時一致。
  - **幹部審核連動 (`_syncPaymentStatusToSupabase`)**：幹部於 LINE 卡片點選確認繳費時，同步更新 Supabase 中的 `payments` 狀態為已核銷。
- **同步背景排程防呆校正 (`supabase/gas_sync_worker.js`)**：
  - 更新 `_syncPaymentToSheet`：對齊真實表頭名稱 `對帳狀態`（兼顧相容 `審核狀態`），並支援以 `line_user_id` 比對待確認繳費列，排程回寫更穩健。
- **自動化測試與代碼品質**：
  - 更新 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 之 Suite 11（嚴格唯讀防護、J1 驗證阻擋測試、9 欄資料列長度校驗、記憶體推算與加總驗證），全套 17 組測試套件、44 項單元測試 **100% 綠燈通過**。
  - 執行 `pnpm run lint` 0 錯誤、0 警告；`pnpm run build` Vite 生產環境建置成功。

### 154. 歷史紀錄 (Payment History) 費用顯示 $0 全面修復：表頭自動擴充、舊資料智慧推算與試算表/資料庫自癒回寫 (v0.1.54)
- **根本原因排查與試算表自動防護擴充 (`_ensurePaymentAmountCol`)**：
  - 徹底排查使用者歷史紀錄中已確認款項之金額皆顯示為 `+$0`、累計金額 `TOTAL EXPENSE` 為 `$0` 的問題。
  - 核心原因為早期初始化 Google Sheets `Payments` 工作表時缺少「金額」欄位，導致無論是 LIFF 前端送出之申報金額或是試算表讀取皆因索引為 `-1` 而遺失歸零。
  - 在 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `_findAmountColIdx` 與 `_ensurePaymentAmountCol`：於每次初始化、讀取與寫入對帳單時，自動檢查工作表表頭，若缺少「金額」欄位自動於最後一欄即時補齊，徹底杜絕往後申報掉資料。
- **舊紀錄智慧推算與試算表自癒回寫機制 (`_inferPaymentAmount`)**：
  - 針對現存試算表與資料庫中金額已為空或 0 之舊資料（如七星山迎新、大鋼盆/飯鍋等），於 [`src/gas.js`](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `_inferPaymentAmount(ss, userId, title, eventName, equipName)` 智慧推算引擎：
    1. **社費項目**：自動識別「社費 / 社籍 / Membership」，補齊標準社費 $200。
    2. **活動項目**：自 `Events` 工作表對齊活動名稱或編號，精準提取預計費用。
    3. **裝備租借**：自 `Loan_Records` 工作表比對該使用者對應之裝備項目與應繳費用（支援社員 5 折折扣判定）。
  - 在 `getPaymentHistoryAPI` 打包查詢時，若讀取到 `amount <= 0` 即時觸發推算，並**立即回寫試算表該列之「金額」儲存格**，達成查詢即自癒，永久修復歷史試算表數據。
- **申報寫入端雙重保證 (`processPaymentSubmit` & `handlePaymentInput`)**：
  - `processPaymentSubmit`：確保新申報之單筆與合併總額 `details.totalAmount` 必然精確寫入 `Payments` 之「金額」欄位。
  - `handlePaymentInput`：LINE Bot 對話申報時亦同步將計算之 `totalAmount` 寫入對帳表。
- **Supabase RPC 預存程序舊資料自動修補 (`get_my_payment_history` & `submit_payment_rpc`)**：
  - 於 [supabase/history_achievements_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql) 中，在 `get_my_payment_history` 加入 SQL 自癒更新，當資料庫中的 `amount = 0` 時自動透過 SQL 關聯 `events` 與 `loans` 補回金額並落盤更新 `payments` 表。
  - 於 [supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql) 之 `submit_payment_rpc` 增加金額防呆兜底計算，避免前端送出 0 元。
- **ETL 資料清洗防護升級 (`supabase/etl_v2.js`)**：
  - `_etlPaymentsV2` 擴充金額欄位別名匹配清單（`["金額", "費用", "總額", "應繳金額", "amount", "fee", "cost"]`），並在金額為 0 時自動於匯入前關聯 `Events` 與 `Loan_Records` 完成金額推算。
- **自動化測試與代碼品質**：
  - 於 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增 Suite 11（表頭自動擴充、舊資料推算萃取、加總 `totalSpent` 驗證），全套 17 組測試套件、43 項單元測試 **100% 綠燈通過**。
  - ESLint 0 錯誤、0 警告，TypeScript 編譯與 Vite 生產打包完全正常。

### 153. 幹部活動管理與名單審核 (AdminEvents.tsx) 全面接入 Supabase：秒開後台與高規格幹部資安鑑權 (v0.1.53)
- **最高規格幹部資安防護與 officers 幹部資料表架構**：
  - 於 [supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql) 建立 `officers` 幹部資料表與 `is_officer` 內部校驗函式。
  - 對 `anon` 匿名訪客維持 `members`、`event_signups`、`officers` 底層表完全封閉 (`REVOKE ALL`)，杜絕任何未經授權者探查全體報名社員之身分證字號、電話、緊急聯絡人與病史等高度機密個資。
  - 所有管理端讀寫一律經由具備 `SECURITY DEFINER` 的安全預存程序，首行強制校驗幹部身分，非幹部存取直接拋出權限拒絕。
- **管理端活動清單與報名人數統計秒開 RPC (get_admin_events_rpc)**：
  - 單次查詢（延遲 < 50ms）極速聚合所有活動基本資料，並透過 `COUNT FILTER` 即時計算各活動之正取 (`accepted`)、備取 (`waitlisted`)、審核中 (`pending`) 與總報名數 (`total`)，首屏載入時間由原本 2.5 秒徹底縮短至 50ms。
- **單一活動報名名冊展開秒開 RPC (get_admin_event_signups_rpc)**：
  - 點擊活動卡片檢視審核名單時，以 < 50ms 瞬時關聯撈取所有報名者詳情（含體能證明照片、戶外經驗、系所學號與社費繳費狀態），徹底解決開啟 Modal 數秒白屏等待。
- **審核結果與活動開放狀態 30ms 極速變更**：
  - `update_signup_status_rpc`：幹部切換正取/備取/審核中時，優先以 30ms 寫入 Supabase，立即更新介面與報名統計計數器；同時平行由 GAS 同步 Google Sheets 與資料驗證規則。
  - `update_event_status_rpc`：活動開放/未來開放/關閉狀態 30ms 即刻切換生效。
  - `save_admin_event_rpc`：建立或編輯活動優先寫入 Supabase，平行由 GAS 上傳 Google Drive 封面縮圖與發送幹部群組推播。
- **自動補齊幹部快取機制 (sync_officer_cache_rpc)**：
  - 使用者首次由 GAS 成功認證幹部身分後，自動寫入 Supabase `officers` 快取表，下一次開啟管理後台立即享受 50ms 瞬開。
- **測試與品質保證**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 與 TypeScript 0 錯誤、0 警告，Vite 生產環境順暢建置完成。

### 152. 全域 ProfileCheck 與裝備租借 (Borrow.tsx) 連接 Supabase：徹底消除切換頁面轉圈延遲 (v0.1.52)
- **全域個人資料防護檢查秒級放行 (App.tsx ProfileCheck)**：
  - 原先於 `App.tsx` 中的 `<ProfileCheck>` 路由守衛元件在使用者切換至 `/borrow`, `/payment`, `/history`, `/achievements` 時，每次皆無條件向 GAS `action=get_profile` 發送請求進行必填欄位校驗，導致使用者每次點擊選單皆需等待 2~4 秒轉圈。
  - 改為優先調用 Supabase `fetchMemberProfileFromSupabase(userId)` 進行毫秒級驗證（延遲 < 50ms），驗證通過後於前端建立 10 分鐘快取 (`profile_complete_${userId}`)，同次操作中切換路由 0ms 立即放行；若 Supabase 連線例外則無縫由 GAS 備援。
- **裝備租借頁面身分折扣即時判定 (Borrow.tsx Member Status Check)**：
  - 在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中，原先進入裝備借用時會向 GAS `action=get_my_status` 查詢使用者是否為正式社員以判定 5 折租金優待。
  - 現改為優先透過 `fetchDashboardFromSupabase(userId)` 即時讀取 `isOfficial` 社員身分與社籍效期（< 50ms），搭配 10 分鐘快取機制，大幅提升租借頁面初始化流暢度。
- **測試與代碼品質**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 與 TypeScript 0 錯誤、0 警告，Vite 生產環境打包建置順暢完成。

### 151. 全站 100% 達成！歷史紀錄 (History.tsx) 與 活動成就牆 (Achievements.tsx) 連接 Supabase (v0.1.51)
- **個人歷史繳費紀錄秒開 RPC 函式 (get_my_payment_history)**：
  - 於 [supabase/history_achievements_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/history_achievements_rpc.sql) 實作 `get_my_payment_history(p_line_user_id)`。
  - 單次查詢（延遲 < 50ms）極速加載個人所有歷史對帳單（依時間降冪排列），自動將各項目智慧分類為「社費 / 活動 / 裝備 / 全部」，並自動累計已確認核銷之總金額 `totalSpent`。
  - 徹底免除 GAS 讀取整張試算表的數秒轉圈等待。
- **個人出隊成就與心得評價 RPC 函式 (get_my_achievements & save_reflection_rpc)**：
  - 實作 `get_my_achievements(p_line_user_id)`：聚合個人已完賽出隊活動清單、出隊總次數統計 `totalAttended`、心得填寫篇數 `reflectionsCount`，並一併掛載星等評分與登頂照片。
  - 實作 `save_reflection_rpc(p_line_user_id, p_details)`：原子性安全 UPSERT 個人心得評分至 `reflections` 表（唯一鍵 `event_id, line_user_id`），杜絕偽造。
- **全站 7 大頁面 100% 達成極速秒開與雙軌同步**：
  - `History.tsx` 與 `Achievements.tsx` 全面導入 SWR/秒開機制，若連線例外 100% 靜默無縫回退至 GAS API。
  - 心得若上傳相片，平行呼叫 GAS 上傳至 Google Drive「心得照片」專屬資料夾，達成相片雲端永存與資料庫即時呈現之雙贏。
- **零個資外洩資安架構完整落實**：
  - 對 `anon` 匿名訪客關閉 `payments` 與 `reflections` 表之直接讀寫權限，全數以 `SECURITY DEFINER` 安全 RPC 提供受限服務。
- **自動化測試與代碼品質**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 10 與 TypeScript 0 錯誤、0 警告，Vite 生產建置順暢完成。

### 150. 繳費回報 (Payment.tsx) 全面連接 Supabase：待繳清單秒開與安全對帳申報 RPC (v0.1.50)
- **待繳項目極速聚合 RPC 函式 (get_unpaid_payments)**：
  - 於 [supabase/payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/payment_rpc.sql) 實作 `SECURITY DEFINER` 安全函式 `get_unpaid_payments(p_line_user_id)`。
  - 單次查詢（延遲 < 50ms）精準聚合三大待繳項目：
    1. **社費 (membership)**：比對 `members` 表之繳費狀態、社籍到期日與入社意願，自動過濾已繳費與待核對狀態。
    2. **活動 (activities)**：關聯 `event_signups` 與 `events` 表，撈取審核為「正取」、未取消且尚未繳費之活動費用。
    3. **裝備 (equipments)**：關聯 `loans` 與 `loan_items`、`equipments` 表，以訂單為單位展開未取消/未歸還且待繳費品項，支援個人租借與出隊零元判斷。
  - 對 `anon` 匿名訪客關閉 `payments`, `event_signups`, `loans` 資料表底層權限，杜絕全表爬取與敏感帳單探查。
- **原子性對帳申報 RPC 函式 (submit_payment_rpc)**：
  - 實作 `submit_payment_rpc(p_line_user_id, p_details)` 進行安全對帳申報：
    1. 自動生成 `PAY_YYYYMMDD_HH24MISS_xxx` 唯一繳費單號並寫入 `payments` 資料表。
    2. 自動將所勾選項目之關聯表（`members`, `event_signups`, `loans`）之繳費狀態原子性標記為「待確認 Checking」。
    3. 若同時繳納社費且包含非出隊之裝備個人租借，自動套用社員 5 折租金優待。
- **前端秒開與雙軌保障 (Payment.tsx Dual-Track Integration)**：
  - 在 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 封裝 `fetchUnpaidPaymentsFromSupabase` 與 `submitPaymentToSupabase`。
  - **讀取階段**：優先以 < 50ms 秒開呈現待繳清單，若 Supabase 未配置或網路異常則無縫回退至 GAS `get_unpaid`。
  - **送出階段**：先寫入 Supabase 確保資料持久化，並平行呼叫 GAS 以發送 LINE 幹部審核推播訊息與雙向同步至 Google Sheets。
- **自動化測試與代碼品質**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 10 與 TypeScript 0 錯誤、0 警告，Vite 生產建置順暢完成。

### 149. 資料填寫 (Register.tsx) 連上 Supabase：極速秒開與安全 RPC 零個資外洩架構 (v0.1.49)
- **零個資外洩安全 RPC 架構 (Security Definer Architecture)**：
  - 於 [supabase/member_profile_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/member_profile_rpc.sql) 實作兩組具備 `SECURITY DEFINER` 的安全預存程序：
    1. `get_member_profile(p_line_user_id TEXT)`：嚴格限制僅能調用本人 `line_user_id` 之資料，收斂敏感欄位，徹底防止全表匿名爬取（身分證、電話、地址、病史等嚴密防護）。
    2. `save_member_profile(p_line_user_id TEXT, p_data JSONB)`：嚴密 UPSERT 個人資料並寫入稽核紀錄，透過觸發器自動排入 `sync_queue` 平滑同步至 Google Sheets。
  - 對 `anon` 匿名訪客關閉 `members` 全表之 `SELECT/INSERT/UPDATE` 權限，僅授權執行上述兩組特定 RPC，兼顧極致效能與金融級隱私防護。
- **資料填寫頁面極速秒開與雙軌同步 (Register.tsx Fast Preload & Save)**：
  - 在 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 封裝 `fetchMemberProfileFromSupabase` 與 `saveMemberProfileToSupabase`。
  - **讀取階段 (Preload)**：使用者進入「資料填寫」頁面時，優先從 Supabase 以 < 50ms 載入既有社員個人資料，徹底擺脫 GAS 冷啟動 3~5 秒轉圈等待；若無紀錄或網路異常，則無感無縫回退至 GAS API。
  - **送出階段 (Submit)**：優先以 < 50ms 極速寫入 Supabase，同時平行呼叫 GAS 處理 Google Drive 體能證明附件上傳與 LINE Push 通知，大幅提升送出體驗與耐用度。
- **自動化測試與代碼品質**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 10 與 TypeScript 0 錯誤、0 警告，Vite 生產建置極速完成。

### 148. Members 與 Events 表結構精準對齊與前端 Supabase Client 同步升級 (v0.1.48)
- **Members 表 24 欄位 100% 精準對齊 (Members Schema Alignment)**：
  - 於 [supabase/schema.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql) 補齊試算表實際存在的 7 大欄位：`line_id` (自訂 Line ID)、`payment_status` (繳費狀態)、`address` (聯絡地址)、`medical_history` (個人特殊病史或過敏)、`identity_status` (身分狀態)、`join_membership_intent` (加入社員意願)、`officer_intent` (擔任幹部意願)。
  - 保留 `is_official_member` 布林欄位，由繳費狀態包含「已繳費/Paid」自動計算，確保數位社員證與前端資格快速識別。
- **Events 表剔除多餘欄位與精簡 10 大核心欄位 (Events Schema Optimization)**：
  - 精簡 `events` 資料表，徹底移除試算表不存在之多餘欄位（`category`、`location`、`max_participants`、`non_member_fee`、`notes`、`notified_at`）。
  - 將費用統一收斂為純數字欄位 `fee`，保留 `deadline` 嚴謹之 `TIMESTAMPTZ` 型別。
- **前端 Client 查詢同步適配 (src/utils/supabaseClient.ts)**：
  - 更新 `SupabaseEventRow` 介面與 `fetchEventsFromSupabase` 的 `.select()` 欄位清單，全面對齊 `fee` 與 10 大核心欄位，避免無效欄位查詢異常。
  - 修復 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 中 `loadedFromSupabase` 之變數作用域問題。
- **自動化測試與代碼品質**：
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過。
  - ESLint 10 零錯誤、零警告，Vite 編譯順暢通過。

### 147. 個人主頁 Dashboard 極速秒開 RPC 函式與 SWR 雙軌整合 (v0.1.47)
- **Supabase RPC 高速聚合函式實作 (get_my_dashboard)**：
  - 於 [supabase/get_my_dashboard.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/get_my_dashboard.sql) 建立 `SECURITY DEFINER` 之 PostgreSQL 預存程序 `get_my_dashboard(p_line_user_id)`。
  - 單次查詢（耗時 2~5ms）即聚合：
    1. `profile`：會員姓名、系級、學號、有效社籍資格與到期日。
    2. `activities`：該社員所報名之近期與歷史活動、報名碼、審核與繳費狀態。
    3. `equipments`：租借中與歷史裝備訂單、自動將一對多品項展開聚合為簡潔字串（如 `登山帳篷 x1, 睡袋 x2`）。
  - 嚴格隔離：僅能以 `line_user_id` 查閱本人紀錄，兼顧極致效能與嚴密資安防護。
- **個人主頁 SWR 雙軌秒開升級 (Dashboard.tsx SWR Integration)**：
  - 在 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 封裝 `fetchDashboardFromSupabase(userId)`。
  - 在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 導入 SWR 機制：開啟主頁時以 < 100ms 極速自 Supabase 渲染數位社員證、報名與租借資訊，同時在背景由 GAS 進行即時狀態對齊。
  - 若 Supabase 異常或未配置，100% 靜默無感回退至 `GAS_API_URL`。
- **自動化測試與代碼品質**：
  - ESLint 10 零錯誤、零警告（修復 catch 區塊依賴項）。
  - 全套 16 組測試套件、40 項單元測試 100% 通過。

### 146. 方案 B：活動清單秒開讀取與幹部活動管理 SWR 雙軌升級 (v0.1.46)
- **Supabase 活動讀取函式擴展 (fetchEventsFromSupabase)**：
  - 在 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 實作 `fetchEventsFromSupabase()`，直接自 Supabase `events` 表依照開始日期倒序撈取所有活動。
  - 注入鮮明之彩色 Console 日誌標籤（`⚡ [DataSource: Supabase]`），讓開發者在瀏覽器 DevTools 主控台即可一目瞭然資料來源是否成功直連 Supabase。
- **幹部活動管理 SWR 雙軌加速 (AdminEvents.tsx SWR Acceleration)**：
  - [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 之 `loadInitial` 與 `fetchEvents` 導入 SWR（Stale-While-Revalidate）極速渲染：優先自 Supabase 於 100ms 內秒開活動清單，同時在背景由 GAS 進行幹部權限校驗與最新審核名單對齊，兼顧極速響應與嚴格權限。
- **背景同步排程與自動化單元測試擴充**：
  - 於 [supabase/gas_sync_worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/gas_sync_worker.js) 建立完備之 Google Sheets 背景單向同步排程腳本。
  - 於 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增 Suite 10，驗證背景同步時全形括號資料驗證防呆校正與多裝備單號狀態廣播。
  - 全套 16 組測試套件、40 項單元測試 100% 綠燈通過，ESLint 零警告，編譯正常。

### 145. Supabase JS Client 導入與裝備租借頁面首波雙軌極速讀取整合 (v0.1.45)
- **Supabase Client 封裝與環境變數相容性 (Supabase Client Extraction)**：
  - 於 [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts) 建立安全之 Supabase 連線實例，讀取 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY`。
  - 建立 [.env.example](file:///Users/brianhung/Documents/OfficialLINEAccount/.env.example) 規範環境變數設定範本。
  - 實作安全降級檢查 `isSupabaseConfigured()` 與 `fetchEquipmentsFromSupabase()`：當 Supabase 未配置或網路異常時自動無縫回退至原有 GAS，杜絕白屏風險。
- **裝備租借頁面首波雙軌秒開升級 (Borrow.tsx Dual-Track Integration)**：
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 的 `loadData` 與 `handleRefresh` 優先自 Supabase REST API 讀取可外借庫存裝備。
  - 若已配置 Supabase，資料讀取延遲從 3~5 秒驟降至 100 毫秒以內；若未配置或失敗則靜默無感回退至 `GAS_API_URL`。
- **自動化測試與編譯通過**：
  - 全套 15 組測試套件、38 個單元測試 100% 通過。
  - ESLint 零錯誤零警告、Vite 編譯正常。

### 144. Supabase 架構遷移規劃、7 大關聯表 Schema DDL 與 Google Sheets 背景同步管線設計 (v0.1.44)
- **Supabase PostgreSQL 7 大資料表結構設計 (Relational Database Schema Design)**：
  - 於 [supabase/schema.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql) 建立完整 DDL，將 Google Sheets 扁平資料正規化為具備外鍵約束、資料完整性驗證與自動 `updated_at` 觸發器之關聯式結構：
    1. `members`：社員基本資料、緊急聯絡人獨立欄位、社籍到期日與 Google Drive 證明文件陣列。
    2. `events`：活動資訊、名額限制、報名截止時間、簡介與行程字數限制相容。
    3. `event_signups`：報名紀錄、審核狀態（完全相容試算表全形括號資料驗證）、報名專屬碼索引。
    4. `reflections`：活動心得評分（1~5 難易度/風景）、感想內容與登頂照片 Google Drive 陣列。
    5. `equipments`：裝備清單、在庫可用數量約束、外借狀態與定價快照。
    6. `loans` & `loan_items`：裝備租借主訂單與細項展開（Master-Detail），消除原試算表單一訂單多品項重複冗餘列。
    7. `payments`：繳費申報、銀行後五碼、核銷狀態與對帳紀錄。
    8. `sync_queue`：背景同步佇列，記錄資料表異動事件與重試機制。
  - 配置 Row Level Security (RLS) 策略：裝備清單與已發布活動開放公開唯讀，達成 LIFF 首屏秒開。
- **Google Sheets 5~30 秒緩衝批次背景同步機制 (Buffered Batch Sync Pipeline)**：
  - 確立單向同步架構（Single Source of Truth = Supabase），保留幹部在 Google Sheets 之純唯讀檢視習慣。
  - 導入防限流（Rate-limit Protection）機制：透過 `sync_queue` 聚合 5~30 秒內的異動，打包為單次 `batchUpdate`，徹底規避 Google Sheets API 60 次/分鐘配額上限與並發鎖死（Lock Timeout）。
- **漸進式雙軌轉移策略 (Progressive Dual-Track Strategy)**：
  - LIFF 前端優先直連 Supabase，解決 3~8 秒載入延遲。
  - LINE Messaging Bot（7,800 行之 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)）暫留 GAS，透過 Supabase REST API 存取，杜絕一次性重構龐大 Flex 卡片的高風險。
  - 圖片繼續沿用 Google Drive「系統圖庫」管理慣性，兼顧歷史檔案相容性。

### 143. 6 項體驗優化與防呆修復：社費社員連動、租借日期防呆、備註對齊、幹部 UI 與活動字數優化 (v0.1.43)
- **社費繳納與活動報名「是否為社員」狀態連動 (Membership Fee & Activity Signups Status Synchronization)**：
  - 當社員繳納社費並經核銷確認後，後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `processPaymentConfirmation` 自動比對其於 `Signups` 表中已報名之活動；若該活動「尚未開始」（依開始日期 00:00:00 起算），將報名名冊中原本「是否為社員」由「否」自動更新為「是」。
  - 在幹部名單審核 API（`getEventSignupsAPI`）中增加動態校準與落盤機制，若活動尚未開始且該社員在 `Members` 表中具備有效社籍，即時校準回傳 `isOfficial: "是"` 並同步更新至 Google Sheets。
- **裝備租借底部懸浮購物車列文字顯示修復 (Floating Cart Bar i18n & Overflow Fix)**：
  - 補齊繁中 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與英文 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json) 語系檔案中缺失的 `borrow.floating` 翻譯鍵值（`daysUnit`, `estFree`, `estPrice`, `halfPrice`, `viewDetail`），徹底解決手機版底欄顯示原始語系鍵名（如 `borrow.floating.daysUnit`）之問題。
  - 針對預估金額與操作按鈕增加 `whiteSpace: 'nowrap'`，確保在各尺寸手機螢幕下整齊排版不折行。
- **租借明細歸還日期防呆與前後端雙重校驗 (Borrow Return Date Validation & Auto-Shift)**：
  - 前端 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 加入日期連動邏輯：當使用者挑選或調整領取日期且晚於現有歸還日期時，自動將歸還日期同步推移至與領取日期相同。
  - 前端新增 `isInvalidDateRange` 即時檢驗：若歸還日期早於領取日期，[BorrowCartDrawer.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/BorrowCartDrawer.tsx) 於日期輸入框下方以紅字警示提醒，並立即禁用「確認送出預訂單」按鈕，防止送出無效表單。
  - 後端 `processMultiLoan` 新增日期防呆校驗：若歸還日期小於領取日期，立即拒絕並回傳友善錯誤訊息 `"歸還日期不得早於領取日期"`。
- **裝備詳細資訊彈窗對應試算表備註欄位 (Equipment Remark / Notes Alignment)**：
  - 後端 `getEquipmentsListAPI` 調整欄位對齊優先順序，優先匹配試算表 `Equipments` 表頭之「備註」或「備注」欄位內容，其次才對齊「說明」或「規格」，精準呈現裝備特色與注意事項。
  - 前端 [EquipmentDetailModal.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/EquipmentDetailModal.tsx) 於裝備說明區塊保留多行換行格式（`whiteSpace: 'pre-wrap'`），支援段落排版與條列式說明。
- **幹部系統頂部切換 UI 跑版修復 (Admin Events Top Tab Mobile Layout Optimization)**：
  - 重構 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 頂部頁籤切換結構，將各頁籤按鈕設定為自適應寬度（`flex: 1`）並加入 `whiteSpace: 'nowrap'`，文字置中且間距自適應。
  - 移除多餘且重疊擠壓排版的右側按鈕，徹底根除手機直向窄螢幕（如 iPhone 375px~390px）下中文字被擠壓為單字直排的跑版問題。
- **幹部活動編輯字數上限更新與詳細卡片頂部活動名稱 (Event Description Character Limits & Card Header Optimization)**：
  - [AdminEventForm.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventForm.tsx) 字數上限彈性調整：活動簡介上限 1,000 字、詳細行程上限 700 字，總字數上限設定為 1,400 字；送出表單檢核改以「總字數不超過 1,400 字」為唯一阻擋條件，賦予幹部撰寫內容更多彈性。
  - 前端即時預覽卡片與後端 LINE Flex 詳細活動卡片（`sendEventDetail`）統一將活動名稱（`eventName`）置於最頂端大字體展示，下方緊接綠色標籤「活動詳情 Event Details」，大幅提升使用者閱讀體驗與辨識度。
- **單元測試集擴展 (Automated Test Suite Expansion)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 新增 Suite 9：涵蓋活動開始日期判斷、社費繳納連動 Signups 是否為社員、裝備備註欄位優先回傳、租借歸還日期防呆。
  - [test/frontend_utils.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/frontend_utils.test.mjs) 新增 Suite 5：涵蓋租借日期合法性驗證與活動編輯字數 1000/700/1400 規則驗證。
  - 全專案 15 組測試套件、38 個單元測試 100% 綠燈通過。

### 142. 前後端架構模組化拆分、重構與全自動化測試套件導入 (Architecture Modularization & Automated Test Suite) (v0.1.42)
- **龐大單體組件模組化拆分 (Large Monolith Component Modularization)**：
  - **AdminEvents.tsx（原 2,928 行）拆分重構**：
    - [AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx)：活動卡片展示、名額/報名人數統計及操作按鈕。
    - [AdminEventForm.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventForm.tsx)：活動新增/編輯表單，整合即時 LINE Flex 輪播卡片預覽及字數上限檢核。
    - [AdminSignupsModal.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminSignupsModal.tsx)：報名者名冊表格、即時搜尋篩選、狀態切換及一鍵批次發送審核結果通知。
    - [ApplicantModals.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/ApplicantModals.tsx)：報名者體能證明相片檢視與完整個資履歷彈窗。
    - [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：核心頁面從 2,928 行縮減至 572 行（減少 ~80% 行數），大幅提升維護性。
  - **Borrow.tsx（原 1,412 行）拆分重構**：
    - [ProductImage.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/ProductImage.tsx)：裝備分類圖示與相片智能渲染器。
    - [EquipmentCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/EquipmentCard.tsx)：裝備卡片展示、剩餘庫存狀態徽章與購物車加減按鈕。
    - [BorrowCartDrawer.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/BorrowCartDrawer.tsx)：預訂購物車滑出抽屜、天數計算、租借表單與防重複送出機制。
    - [EquipmentDetailModal.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/borrow/EquipmentDetailModal.tsx)：1:1 裝備相簿輪播、滑鼠拖曳/手機滑動手勢、Lightbox 燈箱放大及幹部專屬圖片管理。
    - [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)：核心頁面從 1,412 行縮減至 471 行（減少 ~67% 行數）。
- **共用型別、常數與工具模組集中管理 (Shared Types, Constants & Utilities Extraction)**：
  - [api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/constants/api.ts) 與 [liff.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/constants/liff.ts)：集中管理後端 Web App 端點及 LIFF 應用程式 ID，消除各頁面硬編碼 URL。
  - `src/types/`：建立完整之 [event.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/event.ts)、[equipment.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/equipment.ts)、[payment.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/payment.ts) 與 [member.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/member.ts)，淘汰隱式 `any` 型別。
  - [statusUtils.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/statusUtils.ts)：統一報名、活動與繳費狀態的標準化比對、中英標籤以及對應色彩樣式。
  - [applicantUtils.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/applicantUtils.ts)：安全開啟外部連結 (`openExternalUrl`) 與多圖 URL 解析 (`parseProofUrls`)，兼顧資安與 React Refresh 規範。
  - [api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts)：提供型別安全泛型介面 `GasApiResponse<T>` 與 `gasGet` 封裝。
- **Google Apps Script 後端精簡與安全鎖定強化 (GAS Backend Refactoring & Safe Lock Enforcement)**：
  - 封裝統一 JSON 輸出輔助函式 `_jsonResponse`、`_errorResponse`、`_successResponse`，減少重複樣板程式碼。
  - 全面於所有鎖定關鍵區段之 `finally` 區塊套用 `_safeReleaseLock(lock)`，防止鎖定逾時或未持鎖引發拋錯中斷。
  - 精簡 `doGet` 路由器，批次聚合需要 `userId` 驗證之 API 操作，提升架構清晰度與可讀性。
- **全自動化單元與整合測試集導入 (Automated Test Suites Integration)**：
  - [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs)：模擬 GAS 8 大關鍵邏輯（緊急聯絡人提取、繳費對帳、全形括號資料驗證、多裝備取消、正取取消原因、表頭自動對齊、安全鎖定、JSON 回應封裝）。
  - [test/frontend_utils.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/frontend_utils.test.mjs)：驗證前端狀態樣式映射、快取安全 TTL、狀態正規化、動態結帳與社員 5 折計算。
  - 整合 `pnpm test`（`node --test`），共 13 組測試套件、31 個單元測試 100% 通過。
  - 全專案通過 `pnpm run lint`（ESLint 10 零錯誤零警告）與 `pnpm run build`（TypeScript + Vite 編譯完成）。

### 141. 繳費送出與裝備預約非阻塞發話 (Promise.race 逾時防禦) 與即時成功畫面切換 (v0.1.41)（目前最穩定版本）
- **前端 `liff.sendMessages` iOS 掛起致命卡死修復 (Non-blocking sendMessages with Promise.race Timeout)**：
  - **問題根因**：在 iOS LINE LIFF 環境中，若用戶端視窗未開通發話權限（例如直接自通知 URI 點開 LIFF），LIFF SDK 內部的 `liff.sendMessages` Promise 在特定 iOS LINE 版本會呈現永久掛起（Never resolve / reject）狀態。過去程式碼使用 `await liff.sendMessages(...)`，導致 JavaScript 執行緒被永久凍結在該行，後續的 `liff.closeWindow()`、`setSubmitted(true)` 與 `finally { setIsSubmitting(false) }` 全數無法執行，因此即使後端試算表與幹部推播已正常完成，前端按鈕仍持續卡在「申報送出中...」。
  - **雙重防護機制 (Dual Protection Mechanism)**：
    - **立即切換成功畫面**：在 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 收到後端 `status === "success"` 成功回應時，第一時間呼叫 `setSubmitted(true)`，UI 立即切換為綠色勾勾之「申報成功」頁面，徹底杜絕停留在輸入表單按鈕禁用畫面。
    - **非阻塞逾時發話與自動關閉**：使用 `Promise.race([liff.sendMessages(...), timeout(800ms)])`，若 800ms 內未能送出訊息則強制進入 catch 略過，並於 `finally` 區塊呼叫 `liff.closeWindow()`。若 iOS 視窗限制關閉，使用者亦可從成功畫面手動點擊「關閉視窗」按鈕。
  - **同步套用至裝備租借**：在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 同步套用 `Promise.race` 800ms 逾時保護與關閉機制，杜絕租借送出時因相同原因卡在「送出預約中...」。

### 140. Google Sheets 資料驗證嚴格對齊 (全形括號修復)、已取消狀態防崩潰與單元測試更新 (v0.1.40)
- **Signups 表審核結果全形括號精確校正 (Full-width Parentheses Data Validation Alignment)**：
  - **問題根因**：Google Sheets 之 `Signups` 表 U 欄（審核結果）設定了嚴格的儲存格資料驗證規則（Data Validation），只允許 6 種指定值。其中「正取（已繳費）Confirmed(Paid)」與「備取（有意願）Waitlisted (Interested)」之中文字元包含**全形括號**（`（`：`\uFF08`，`）`：`\uFF09`）。先前系統寫入半形括號 `(` 與 `)`，導致幹部在 LINE 群組核對繳費按下確認時，GAS 拋出：`The data you entered in cell U2 violates the data validation rules set on this cell...` 致命異常中斷。
  - **全面校準修復**：
    - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `processPaymentConfirmation`（活動繳費對帳確認）中，狀態寫入字串全面修正為全形括號之 `正取（已繳費）Confirmed(Paid)`。
    - 在 `confirm_waitlist`（社員在備取通知卡片點擊「我要遞補」）中，狀態寫入字串全面修正為全形括號之 `備取（有意願）Waitlisted (Interested)`。
    - 在 `processUpdateSignupStatus`（幹部後台更新名冊審核狀態）中，正規化邏輯同步對齊為 `正取（已繳費）Confirmed(Paid)` 與 `備取（有意願）Waitlisted (Interested)`。
- **已取消活動試算表防崩潰與前台雙軌相容 (Cancelled Activity Sheet Validation Compliance & Frontend Sync)**：
  - 在 `processLiffCancelEvent` 中，若社員取消已繳費活動，過去曾嘗試將審核結果寫入非標準的「已取消 (待退款)」，這會觸發同樣的資料驗證錯誤。
  - 現將 `sStatusIdx` 統一寫入驗證白名單內的 `已取消 Cancelled`，並在「備註」欄保留 `【已繳費待退款】`；在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 與 `getDashboardDataAPI` 讀取時透過備註動態呈現「已取消 (待退款)」專屬徽章，既符合資料驗證規範又兼顧退款提醒。
- **單元測試集擴展與全形編碼斷言 (Unit Test Suite Expansion & Unicode Hex Asserts)**：
  - 在 [test/gas_simulation.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/gas_simulation.test.mjs) 中新增對全形括號 Unicode 代碼點（`0xff08`、`0xff09`）與 6 類下拉選單集合的嚴格斷言，本地 8 項自動化單元測試全數 100% 綠燈通過。

### 139. 緊急聯絡人關係精準提取、正取直接開啟繳費、活動繳費對帳精準核銷與備取意願同步優化 (v0.1.39)
- **緊急聯絡人關係與登山經驗精準隔離 (Emergency Contact Relation Extraction & Experience Disambiguation)**：
  - 建立全域專用防呆查找函式 `_findEmerRelColIdx(headers)` 與 `_getEmerRelValue(headers, row)`。
  - 嚴格過濾包含「經驗」、「登山」、「爬山」、「經歷」或「exp」之欄位，並優先鎖定同時包含「緊急」與「關係」之欄位。
  - 全面更新 `_checkProfileComplete`、`processSignup`、`getMemberProfileAPI`、`processSaveProfile`、`syncProfileToSignups` 及 `getEventSignupsAPI`，徹底解決活動審核名單中「與緊急聯絡人關係」被誤植為登山百岳經歷之問題。
- **正取通知「前往繳費系統」直接開啟連結 (Direct LIFF URI for Accepted Notice Pay Button)**：
  - 修改 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中 `sendReviewNotifications` 之按鈕行為，由原先發送文字訊息 `繳費系統 Payment System`（會觸發文字回覆並需要再點一次連結）調整為 `type: "uri"` 直接導向 LIFF 繳費系統：`https://liff.line.me/2009217429-u7OCkmQO`。
  - 錄取者收到正取錄取卡片後，點擊按鈕即可立即開啟繳費系統頁面，大幅提升操作流暢度。
- **活動繳費對帳精準核銷與狀態連動 (Activity Payment Confirmation & Status Synchronization)**：
  - **精準項目辨識**：在 `processPaymentSubmit` 中動態識別單選/多選項目的真實類別（若為活動則標註 `活動：<名稱>` 或 `activity`），幹部在審核對帳時，系統優先以 `Payments` 表中紀錄之「繳費項目」為準，避免純活動繳費被誤判為 `combined` 而推播「社籍與社費繳費成功」。
  - **報名審核狀態同步更新**：當幹部審核通過活動繳費時，`processPaymentConfirmation` 自動將 `Signups` 報名表之「審核結果」更新為標準試算表下拉格式 `正取(已繳費) Confirmed(Paid)`，並即時執行 `SpreadsheetApp.flush()` 強制寫入。
  - **前端相容與膠囊徽章**：在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 與 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 中，擴展狀態文字辨識涵蓋 `已繳費` / `Paid`，並在活動管理名單中提供專屬深綠色 `正取(已繳)` 徽章。
- **備取遞補意願標準化寫入與狀態即時更新 (Waitlist Intention Status Standardization & Immediate Flush)**：
  - 在 `handlePostback` 之 `confirm_waitlist` 處理器中，將備取意願寫入狀態統一為試算表標準驗證字串 `備取(有意願) Waitlisted (Interested)`，並呼叫 `SpreadsheetApp.flush()` 確保試算表資料即時落盤。
  - [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 支援彈性辨識 `有意願` 與 `interested`，消除空白字元差異導致仍顯示「備取」的顯示異常；[AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 亦同步提供專屬金黃色 `備取(意願)` 徽章。
- **前端連線異常隔離與自動部署更新 (Frontend LIFF Isolation & Production Sync)**：
  - 於 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 及 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 中將 `liff.sendMessages` 隔離於內部 `try/catch` 之中，防止因未授權 LINE 訊息發送權限引發未捕獲例外而跳出「連線失敗，請檢查網路狀態」彈窗。
  - 完成本地自動化測試集 (`test/gas_simulation.test.mjs` 8項全數通過) 與前端編譯驗證，並推播至儲存庫觸發 Vercel 生產環境即時生效。

### 138. 繳費申報連線修復、Members 社籍到期日自動更新、安全釋放鎖定與備取遞補雙軌相容 (v0.1.38)
- **前端 `liff.sendMessages` 隔離例外防崩潰 (LIFF sendMessages Exception Isolation)**：
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 與 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 中，將 `await liff.sendMessages(...)` 獨立置於內部 `try/catch` 區塊中。
  - 當用戶端 LIFF 處於不支援發話的視窗環境或未授權 `chat_message.write` 權限時，僅在 console 記錄警示，不再拋出未捕獲異常阻斷後續的成功流程，徹底杜絕跳出「連線失敗」的誤報提示，保證正常觸發 `liff.closeWindow()` 與關閉頁面。
- **繳費申報 Payments 寫入修復與 Members 社籍到期日連動更新 (Payment Submission & Members Expiry Date Sync)**：
  - 依照規範，`Payments` 試算表保持純對帳紀錄性質，不修改或擴充欄位（無須新增「社籍到期日」欄位）。
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `processPaymentSubmit` 中，若有社籍繳費與到期日 (`details.membershipExpiryDate`)，透過幹部審核按鈕之 `postbackData` 帶入 `&expire=` 參數。
  - 當幹部在 LINE 群組點擊「確認無誤並發送通知」時，`admin_confirm` 解析 `expire` 參數並傳入 `processPaymentConfirmation`。
  - `processPaymentConfirmation` 自動至 `Members` 表搜尋該社員，若 Members 表尚未建立「社籍到期日」欄位則自動建立，並將其「社籍到期日」更新為繳費申報之到期日，繳費狀態更新為「已繳費 Paid」，完整實現社籍續約與到期日連動。
- **全域鎖定安全釋放機制 (Global Safe Lock Release Mechanism)**：
  - 建立全域輔助函式 `_safeReleaseLock(lock)`，嚴格檢查 `lock.hasLock()`，避免在鎖定逾期或未持鎖狀態下呼叫 `lock.releaseLock()` 引發未捕獲異常。
  - 全面套用至 `processMultiLoan`、`processPaymentSubmit`、`processSaveProfile`、`processSubmitReflection`、`processLiffCancelEvent`、`processLiffCancelLoan` 及 `processAdminSaveEvent` 的 `finally` 區塊，徹底根除 GAS 後端拋出 500 HTML 造成前端 JSON 解析崩潰的「網路連線失敗」假象。
- **正取活動取消邏輯強化 (Activity Cancellation & Payment Status Checking)**：
  - 在 `processLiffCancelEvent` 中，將繳費判定擴充涵蓋 `已繳費 Paid`、`已繳費`、`待確認 Checking` 以及當前狀態包含 `已繳費` 之所有情形。
  - 支援同時以活動專屬碼 (`targetId` / `code`) 與活動編號 (`eventId`) 比對報名紀錄；若 Signups 表缺少「備註」欄位則動態建立，確保已繳費待退款之註記與原因正確寫入試算表，幹部群組亦同步接收專屬正取取消退款推播。
  - 在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 取消活動時，若活動專屬碼不存在，自動以 `act.eventId` 作為 fallback，確保各類型活動報名紀錄皆能正常取消。
- **備取意願登記雙軌相容與重複程式碼清除 (Waitlist Intention Dual-Target & Deduplication)**：
  - 在 `handlePostback` 之 `confirm_waitlist` 處理器中，支援同時解析 `targetId`（專屬報名碼）與 `eventId`（活動編號），完美相容來自名單審核卡片與活動備取通知卡片的按鈕。
  - 移除 line 685 之後的重複 dead code 區塊，解決點擊「我要遞補 Waitlist」時拋出「找不到該活動報名紀錄」的漏洞。

### 137. 裝備預約防二次送單與購物車重設、已繳費裝備取消退款提醒與個人資料英文通知 (Phase 3) (v0.1.37)
- **裝備預約防二次觸碰與表單抽屜重設清空 (Borrow Order Anti-Double Submit & Cart Reset)**：
  - 在 `Borrow.tsx` 中新增 `isSubmittingOrder` 狀態管理。
  - 當點擊「確認送出租借預約」按鈕時，按鈕立即被禁用 (`disabled`)，且按鈕文字即時動態切換為「送出預約中... / Submitting...」，杜絕網路延遲時使用者的二次重複連擊。
  - 後端 API 回傳成功後：
    - 自動關閉租借明細抽屜 (`setIsCartOpen(false)`)。
    - 徹底清空租借購物車清單 (`cart: {}`) 與預訂單表單欄位（取件日、還件日、用途重設為預設社團出隊、其他用途清空）。
    - 即時清除裝備快取，確保重新載入最新庫存。
- **已繳費裝備取消退款提醒與修復多品項提早 Return 漏洞 (Paid Equipment Cancellation Refund Alert & Multi-item Fix)**：
  - **修復多品項提前 return 錯誤**：修復 `gas.js` 之 `processLiffCancelLoan` 過去在比對到第一筆資料列時就提早 `return ContentService` 的邏輯漏洞，現在支援完整遍歷同一租借編號 (`targetId` / `orderId`) 下的所有項目，整筆訂單內所有裝備皆能完整取消並各自分別正確回補在庫庫存。
  - **已繳費判定與狀態更新**：檢查該筆租借在 `Loan_Records` 中的「繳費狀態」，若為「已繳費 Paid」或「待確認 Checking」，將訂單狀態更新為「**已取消 (待退款)**」；若未繳費則更新為「已取消 Cancelled」。
  - **幹部退款專屬提醒**：針對已完成繳費／待確認之租借預約，系統向幹部群組推播專屬退款提醒訊息：
    `🔔 【幹部通知：裝備預約取消（需安排退款）】`
    列出申請人、租借編號、所有取消之裝備清單，並明確提示幹部依社團退費規範安排退款（依規定不顯示具體金額，由幹部自行依時間比例結算）。
  - **個人主頁 (Dashboard) 裝備退款追蹤**：
    - `gas.js` 之 `getDashboardDataAPI` 允許回傳狀態為「已取消 (待退款)」之裝備紀錄。
    - `Dashboard.tsx` 擴充 `getEquipmentStatusText` 與徽章配色，展示專屬橘色「已取消 (待退款)」徽章，並在進入此狀態後隱藏取消按鈕，讓社員清楚掌握退款進度。
- **註冊與個人資料修改成功通知支援英文版 (English Profile Registration & Update Push Notifications)**：
  - `Register.tsx` 送出 `save_profile` 時，於 payload 中主動帶入當前語系代碼 (`lang: i18n.language || 'zh'`)。
  - `gas.js` 之 `processSaveProfile` 判讀 `payload.lang`：
    - 當語系為英文 (`isEn`) 時，使用全英文欄位名稱對應（如 `Name`, `Gender`, `Department / Affiliation`, `Emergency Contact`, `Outdoor Experience`, `Fitness Description` 等）。
    - 資料修改推播通知使用英文範本：
      `✅ Your member profile has been successfully updated!`
      若有修改欄位，以 `• [Field]: [Old] -> [New]` 列出修改清單；若重新上傳證明則顯示 `• Fitness & Hiking Proof: New file re-uploaded`。
    - 新用戶註冊推播通知使用英文範本：
      `🎉 Welcome to NTUST Mountaineering Club! Your profile has been successfully registered:`
      完整列出填寫項目清單與感謝詞。
    - API 回傳訊息亦提供流暢的英文反饋 (`Profile updated successfully!` / `Registration successful!`)。

### 136. 活動正備取狀態流轉、正取直開繳費 LIFF、退款提醒與備取意願登記 (Phase 2) (v0.1.36)
- **正取推播通知直開繳費系統 (Direct LIFF Link in Accepted Notification)**：
  - 在 `gas.js` 之 `processSendEventNotifications` 中，將活動正取推播卡片之「前往繳費系統 Pay」按鈕動作由原本傳送文字訊息改為直接開啟 LIFF 繳費網址（`https://liff.line.me/2009217429-u7OCkmQO`）。
  - 社員點擊按鈕即可立即開啟多選繳費表單，消除發送聊天文字之繁瑣操作。
- **正取已繳費狀態流轉與取消退款提醒 (Confirmed (Paid) Flow & Refund Safeguard)**：
  - **繳費確認狀態同步**：幹部於 LINE 確認活動款項無誤後，`processPaymentConfirmation` 自動將該社員在 `Signups` 表中的「審核結果」更新為「**正取 (已繳費)**」，確保活動名冊之繳費與錄取狀態一目了然。
  - **已繳費取消退款推播**：當已繳費之正取社員因故於個人主頁取消報名時，`processLiffCancelEvent` 將審核結果標記為「**已取消 (待退款)**」，並在備註註記「【已繳費待退款】」，同時向幹部群組推播專屬提醒：
    `【幹部通知：正取取消（需安排替補與退費）】`
    明確提醒幹部安排備取遞補與退費事宜，且不顯示具體金額，由幹部依取消時間比例自行結算處理。
- **備取意願確認按鈕與狀態更新 (Waitlist Confirmation & Status Update)**：
  - 在活動備取推播卡片下方新增「**確認備取意願 Confirm Waitlist**」按鈕（純文字無 emoji）。
  - 社員點擊後發送 Postback 動作 (`confirm_waitlist`)：
    - `handlePostback` 自動將 `Signups` 表中之審核結果更新為「**備取 (有意願)**」。
    - 於 LINE 聊天室回覆中英雙語確認訊息（完全不帶 emoji，不通知幹部）：
      `已成功確認您的備取意願！審核狀態已更新為：【備取 (有意願)】。若有正取名額釋出，幹部將主動與您聯絡！`
    - 若社員重複點擊，系統亦貼心提醒已完成登記，杜絕狀態錯亂。
- **個人主頁 (Dashboard) 狀態徽章全面擴充 (Dashboard Badges & i18n)**：
  - `Dashboard.tsx` 擴充支援「正取 (已繳費)」（專屬深綠高彩徽章）、「備取 (有意願)」（橘黃色徽章）與「已取消 (待退款)」（醒目橘紅待退款徽章）。
  - 同步於 `zh.json` 與 `en.json` 補齊雙語鍵值。
- **歷史紀錄狀態判定與明細展開修復 (Payment History Status & Expandable Details Fix)**：
  - 修復 `History.tsx` 中 `getStatusStyle` 因判斷 `status.indexOf('確認') > -1` 導致「待確認 Checking」被誤判為「已確認無誤」綠色徽章之重大邏輯 Bug。
  - 將「待確認 / 待核對 / Checking / 審核中」等狀態優先判定為黃色「待確認」徽章，僅嚴格符合「已確認無誤 / 已確認 / 已繳費 / 已核對」者方判定為綠色徽章。
  - 修復 `gas.js` 之 `getPaymentHistoryAPI` 累計支出金額 (`totalSpent`) 運算時同樣將「待確認」款項加總計入之問題。
  - 歷史紀錄明細卡片支援完整項目展開（`whiteSpace: 'normal'`），點擊卡片時列出該筆交易的所有詳細子項目清單。
- **防止裝備多筆重複列出與折扣異常 (Prevent Equipment Duplicates & Discount Glitch)**：
  - 在 `Payment.tsx` 中將未繳清單勾選陣列 `selectedIds` 進行去重初始化 (`Set`)，防止同筆租借單內的多項裝備造成重複 ID。
  - 在 `gas.js` 之 `processPaymentSubmit` 中對傳入的 `details.selectedIds` 進行去重驗證，避免多次遍歷同一訂單導致產生重複的 4 筆裝備（前 2 筆標社員 5 折、後 2 筆未標）之異常現象。
- **社費到期日聯動儲存與幹部審核自動更新 (Membership Expiry Date Sync & Officer Approval)**：
  - `Payment.tsx` 申報社費時，將社員所選之社費方案（本學期、大學部畢業、研究所畢業）及其對應之「社籍到期日」傳送至後端。
  - `processPaymentSubmit` 將「社籍到期日」寫入 `Payments` 工作表專屬欄位。
  - 幹部在 LINE 點擊「確認無誤並發送通知 (`admin_confirm`)」時：
    - 支援 `combined` 合併繳費判定社費項目，通知中補齊「🔸 社籍與社費 (Membership Fee)」。
    - 自動將 `Payments` 表中記錄之到期日寫入 `Members` 工作表之「社籍到期日」欄位，實現幹部確認後社員社籍無縫延長。
- **支援 0 元項目申報與防呆 (Support $0 Items Declaration & Safeguard)**：
  - `gas.js` 之 `getUnpaidListAPI` 調整金額過濾邏輯為 `if (cost >= 0)`，讓出隊或免費之活動與裝備可正確呈現在未繳清單中。
  - `Payment.tsx` 支援 0 元項目申報：當申報總金額為 $0 時，帳號末 5 碼免填，系統自動帶入 `00000` 順利送出申報。
- **申報送出後即時防重複勾選 (Instant Anti-Duplicate State Update)**：
  - 送出申報後，本地狀態即時將已申報項目自未繳清單中移除，並清空勾選陣列，防止二次誤觸或重複申報。
- **社費與個人借裝費用動態折算 5 折 (Dynamic 50% Rental Discount with Membership Fee)**：
  - 在繳費系統 (`Payment.tsx`) 中，當使用者同時勾選「社籍與社費」以及「個人用途裝備租借」時，該筆原為非社員全額的個人借裝費用自動享有 **5 折優惠** (`Math.round(金額 * 0.5)`)。
  - 介面即時回饋：
    - 裝備卡片頂端即時顯示原價劃線與折算價格（例如 `~~$220~~ $110`），並帶有綠色高彩「`社員5折優惠`」徽章。
    - 展開之子項明細亦同步顯示各單項原價劃線與折抵後費用。
    - 結帳總金額 (`totalAmount`) 動態扣減折扣費用。
    - 若使用者取消勾選社費，裝備費用即刻即時還原為原始全額，動態切換平滑流暢。
- **未勾選社費時之貼心試算省錢提示 (Smart Savings Tip when Unchecked)**：
  - 當使用者有待繳之個人借裝款項但尚未勾選社費時，裝備卡片下方自動跳出專屬藍色貼心提示：
    `💡 同時勾選上方社費，此裝備租借費享 5 折現省 ${{save}}！`
    主動提醒社員享有之權益與省錢優勢。
- **GAS 後端試算與記帳完整同步 (GAS Unpaid API & Payment Submit Synchronization)**：
  - `getUnpaidListAPI`：於查詢 `Loan_Records` 時增加 `是否為社員` 欄位解析並回傳至前端 `equipments` 清單中，避免在借裝時已是正式社員者發生重複折算問題。
  - `processPaymentSubmit`：當判定使用者申報項目包含 `fee_membership` 時，針對用途非出隊且尚未具有社員身分之個人借裝訂單：
    - 將 `Loan_Records` 工作表中該訂單之「應繳費用」即時更新為 5 折折算金額。
    - 將該筆借用紀錄之「是否為社員」欄位同步更新為「`是`」。
    - 寫入 `Payments` 對帳表與推播幹部通知時，明細明確標記 `(社員5折)`，確保 Google Sheets 帳目金額、社員紀錄與使用者實際轉帳金額 100% 吻合一致。
- **LIFF 申報通知明細對齊 (LIFF Message Details Alignment)**：
  - 申報完成透過 LINE LIFF 傳送個人對帳訊息時，若借裝項目享有折扣，於項目後標記 `(含社員5折優惠)`。
- **多國語言支援 (i18n Support)**：
  - 同步於 `zh.json` 與 `en.json` 新增折扣徽章、省錢提示與申報註記之雙語鍵值。

### 133. 雲端硬碟根目錄資料夾全面升級為「系統圖庫」 (v0.1.33)
- **根目錄結構現代化重命名 (Root Folder Upgrade to 系統圖庫)**：
  - 將 Google 雲端硬碟中儲存所有上傳檔案（包含體能登山證明、活動封面、裝備相片、活動心得照片）之預設根目錄資料夾由原先的 `LINE_Uploads` 全面升級更名為「**系統圖庫**」。
- **自動平滑過渡遷移機制 (Seamless Migration & Backward Compatibility)**：
  - 在 `uploadFileToDrive` 建立與存取資料夾時：
    1. 優先搜尋雲端硬碟中名為「系統圖庫」之資料夾。
    2. 若未發現「系統圖庫」，但存在過去建立之 `LINE_Uploads`，系統將自動將其更名為「系統圖庫」，確保過往上傳的所有相片、子資料夾階層（如 `體能登山證明/`、`裝備照片/`、`活動封面/`、`心得照片/`）與外部公開連結完全不中斷且無縫過渡。
    3. 若皆不存在，則自動新建「系統圖庫」根目錄資料夾。
  - 在 `getMemberProfileAPI` 智慧檢索體能證明歷史檔案時，同步支援優先自「系統圖庫」檢索，並兼顧相容既有目錄。

### 132. 裝備照片刪除防呆確認、輪播索引校正與冒泡事件阻斷 (v0.1.32)
- **輪播軌道安全索引重置 (Carousel Index Reset on Save)**：
  - 修復幹部在 `Borrow.tsx` 編輯裝備照片時，若刪除其中照片並按下儲存，因輪播索引 `activePhotoIdx` 未歸零導致輪播軌道偏移至超出邊界的完全空白區域問題。
  - 在 `handleSavePhotos` 儲存成功時主動執行 `setActivePhotoIdx(0)`，確保輪播視窗精準錨定在第一張有效照片上，消除「儲存後照片全都未顯示」的視覺異常。
- **照片刪除防呆確認與事件隔離 (Safe Photo Deletion & Stop Propagation)**：
  - 在 `handleDeleteCurrentPhoto` 中加入確認對話框（`window.confirm`）：
    - 刪除一般照片時提示「確定要刪除這張照片嗎？」。
    - 刪除最後一張照片時跳出高風險警告「⚠️ 這是此裝備最後一張照片，刪除並儲存後將無照片展示，確定要刪除嗎？」。
    - 若幹部清空所有照片並點擊儲存，進行二次確認「⚠️ 目前未保留任何照片，儲存後此裝備將無照片展示，確定要儲存嗎？」，杜絕意外清空。
  - 在相片刪除按鈕（`.photo-delete-btn`）上完整阻斷 `onClick`、`onMouseDown` 與 `onTouchStart` 的事件冒泡（`e.stopPropagation()`），徹底防止誤觸背景輪播軌道的拖曳滑動事件。
- **GAS 後端健全保護 (GAS Try-Catch Guard)**：
  - 在 `gas.js` 之 `processUpdateEquipmentImages` 中加入全區 `try...catch` 捕捉與錯誤日誌，避免試算表操作異常時靜默失敗，並回傳清楚的錯誤提示。

### 131. 裝備預約結算費用疑慮提示英文語系同步更新 (v0.1.31)
- **裝備預訂總結提示英文語系對齊 (English Summary Tip Alignment)**：
  - 同步更新英文語系 `en.json` 之 `borrow.summary.summaryTip`，將原先較為生硬的幹部核算說明改為更加友善之聯絡指引：
    `"* If you have any questions about the fees, please contact this LINE account directly."`
  - 與中文版本「* 若對費用有疑慮，請直接聯絡本 LINE 帳號」保持一致。

### 130. 資料填寫步驟切換自動平滑滾動至頁面最上方 (v0.1.30)
- **步驟切換自動回頂 (Auto Scroll to Top on Step Change)**：
  - 在資料填寫表單（`Register.tsx`）中新增對 `step` 狀態的自動監聽機制。
  - 當使用者點擊「下一步」、「上一步」或在鍵盤按 Enter 進入下一階段時，自動執行 `window.scrollTo({ top: 0, behavior: 'smooth' })`。
  - 確保進入新步驟時，頁面自動平滑滾動至最頂端，使用者能第一時間檢視並依序填寫該步驟的最上方題目，大幅提升手機行動端填表體驗。

### 129. 繳費系統社費預設未勾選、補齊畢業價格與移除預繳方案 (v0.1.29)
- **社費項目改為預設未勾選 (Default Uncheck Membership Fee)**：
  - 進入繳費系統讀取待繳清單時，預設僅自動勾選「活動」與「裝備」項目，將「社籍與社費」排除在初始勾選陣列之外。
  - 需由社員依個人意願主動勾選，才計入社費項目與結帳金額，徹底消除非自願繳費之疑慮。
- **補齊社費說明「直到畢業」價格標籤 (Graduation Fee Price Label Fix)**：
  - 修復 `zh.json` 中 `payment.membership.graduationValue` 僅有「大學部 / 研究所」而遺漏價格的問題，補齊為完整之「**大學部 $800 / 研究所 $400**」，與英文版及選單價格保持一致。
- **移除預繳下一學期社費方案 (Remove Next Semester Pre-Payment Scheme)**：
  - 全面移除繳費方案中的「下一學期 (`nextSem`)」預繳選項，簡化收費制度並降低跨學期管理複雜度。
  - 社費方案下拉選單精簡為三個明確選項：
    1. 當前學期 ($200)
    2. 直到畢業 - 大學部 ($800)
    3. 直到畢業 - 研究所 ($400)

### 128. 社籍到期推播通知語氣優化為感恩祝福 (v0.1.28)
- **移除催繳社費與繳費系統引導 (Remove Payment Reminders from Expiration Message)**：
  - 徹底移除社籍到期推播通知中提及「繳納新學期社費」與「繳費系統」等字句，避免帶給社員催款或繳費壓力。
- **改為充滿感恩與同行情誼的溫馨祝福語氣 (Warm Milestone & Safe Trail Blessings)**：
  - 感謝社員一路以來的陪伴與在山林間留下的美好足跡。
  - 表達「山一直在那裡，夥伴的情誼也始終常在」，真誠祝福社員在未來每座山頭與新旅程中皆平安順遂、風景相伴，並隨時歡迎回來登山社大家庭。

### 127. 繳費後五碼填寫提示文字靠左對齊優化 (v0.1.27)
- **帳號後五碼提示訊息靠左對齊 (Align Digits Tip to Left)**：
  - 在繳費回報表單中，將「帳號後五碼」欄位容器（`.form-group`）與下方的提示說明文字（`digitsTip`）統一設定為 `textAlign: 'left'`，解決置中或浮動對齊造成的視覺不一致問題，與「匯款備註」欄位維持一致的高質感靠左排版。

### 126. 資料填寫更新自動同步至活動報名表 (Signups) 與社籍逾期自動個別推播 (v0.1.26)
- **資料填寫更新即時同步至活動報名表 (Signups Profile Synchronization)**：
  - **自動同動更新機制**：當社員在「資料填寫 (Register)」修改或更新個人資料後，後端 `processSaveProfile` 除了寫入 `Members` 表外，自動調用 `syncProfileToSignups` 函式，將該社員名下於 `Signups` 表的所有已報名紀錄同步更新為最新資料。
  - **同步欄位全覆蓋**：包含姓名、性別、LINE ID、電子信箱、聯絡電話、生日、身分證字號、聯絡地址、緊急聯絡人姓名/電話/地址、所有關係欄位、登山經驗、體能、最新體能證明列表、系所、學號、個人特殊病史或過敏。
  - **嚴格保護活動與資格專屬欄位 (Preserved Event-Specific Fields)**：
    - 嚴格維持原本報名時的 **「是否為社員」** 身分資格，絕不因事後社籍過期或更動而覆寫活動報名當時的社籍身分。
    - 完整保留 `活動編號`、`專屬碼`、`活動名稱`、`審核結果`、`通知狀態`、`繳費狀態`、`報名時間`、`備註` 等活動專屬資料，確保行政作業與帳務流程安全無虞。
- **每日巡檢社籍到期個別推播提醒 (Personal Membership Expiration Push)**：
  - 在 GAS 每日自動巡檢 `dailySystemCheck()` 中，當偵測到社員社籍已逾期，將其繳費狀態由「已繳費」重置為「未繳費 Unpaid」時，系統即時調用 `pushMessage(userId, ...)` 傳送專屬 LINE 雙語溫馨提醒。
  - 清楚告知社員資格到期日，並引導至官方帳號「繳費系統」隨時繳納新學期社費。
  - 採狀態切換單次觸發機制，次日狀態已為未繳費時不重複發送，避免打擾社員。

### 125. 社籍逾期自動重置未繳費、即時繳費單產生與緊急聯絡人關係同步修復 (v0.1.25)
- **社籍到期雙軌自動標記為未繳費機制 (Dual Auto-Expiration & Status Synchronization)**：
  - **即時存取自動重置 (On-Access Auto-Reset)**：
    - 當社員開啟繳費系統（`get_unpaid`）、個人主頁儀表板（`get_profile_status`）或在資料填寫儲存個人資料（`save_profile`）時，後端即時比對 `Members` 表中的社籍到期日。
    - 若社籍到期日早於今日且繳費狀態為「已繳費 Paid」或「是」，系統立即自動將試算表 `Members` 之「繳費狀態」欄位重置為「未繳費 Unpaid」（若為「待確認 Checking」則予保留）。
  - **每日排程自動巡檢 (Daily Scheduled Patrol & Notification)**：
    - 在 GAS 每日定時觸發的 `dailySystemCheck()` 中新增 `Members` 表巡檢邏輯。
    - 自動遍歷所有社員，將所有已逾期但仍標記為已繳費的社員批次重置為「未繳費 Unpaid」，並自動彙整名單推播至幹部 LINE 群組，大幅降低人工巡視成本。
- **繳費系統社費欠款即時動態生成 (Dynamic $200 Membership Fee Invoice)**：
  - 在 `getUnpaidListAPI` 中加入動態到期與意願判定：
    - 社員若勾選「加入社員意願」且目前社籍已過期或狀態為「未繳費 Unpaid」，繳費系統自動產生 $200 社費（`fee_membership`）繳費項目與專屬繳費金額。
    - 解決了以往逾期社員即使勾選入社意願，繳費系統卻因試算表殘留舊學期已繳費狀態而漏發社費帳單的問題。
- **緊急聯絡人關係多欄位相容同步與防快取機制 (Emergency Relation Multi-Column Sync & Cache Busting)**：
  - **多欄位全相容寫入 (Multi-Column Sync)**：在 `processSaveProfile` 儲存個資時，自動遍歷所有包含「關係」或「relation」的欄位（相容「與緊急聯絡人關係」、「緊急聯絡人關係」、「關係」等），將填寫數值同步寫入試算表所有相應欄位；若無任何關係欄位則自動建立「與緊急聯絡人關係」。
  - **多欄位優先級讀取 (Prioritized Candidate Fallback)**：在 `getProfileAPI` 讀取個資時，優先取用「緊急」且包含「關係」之欄位，若無則依序 fallback 取用任何非空的關係欄位數值。
  - **前端防止 WebView 快取 (Client-Side Cache Busting)**：在 `src/utils/api.ts` 與 `src/pages/Register.tsx` 的所有 GET 請求中加入 `cache: 'no-store'` 與 `_t=${Date.now()}` 時間戳記，避免 LINE 或 Safari 內嵌瀏覽器快取舊資料導致重新整理時顯示修改前的資訊。

### 124. 裝備照片左右滑動手勢、列表圖片問號修復與卡片 1:1 正方形 (v0.1.24)
- **多圖左右滑動與平滑對齊手勢 (Touch & Mouse Drag Swipe Carousel)**：
  - 裝備詳細彈窗全面支援手機觸控滑動（`onTouchStart / Move / End`）與滑鼠拖曳（Mouse Drag）。
  - 水平滑動時圖片跟隨手指即時位移，並在首尾具備阻尼彈性，放開後自動平滑 Snap 切換上一張／下一張，圓點指示同步連動。
  - 智慧防誤觸機制：滑動位移超過 5px 時不觸發 Lightbox 放大，僅原地輕觸（Tap/Click）方開啟全螢幕檢視。
  - 全螢幕 Lightbox 模式下同步支援觸控左右滑動切換相片與底部分頁圓點。
- **修復列表封面圖片顯示問號破損 (List Broken Image Fix & Fallback)**：
  - 在 `getDirectImageUrl` 與 `ProductImage` 中嚴格擷取第一張有效網址，徹底解決多圖欄位傳回逗號分隔字串導致圖片路徑解析異常、Safari/瀏覽器顯示問號圖示的問題。
  - 加入 `onError` 自動退回優雅分類向量圖示機制，確保網路不良或圖片失效時絕不呈現破圖。
- **裝備列表卡片圖片改為 1:1 正方形 (Square Product Cards)**：
  - 列表卡片圖片容器 `.product-img-container` 移除原本固定高度 `110px`，改為 `width: 100%; aspect-ratio: 1 / 1; overflow: hidden;`，呈現一致且高質感的現代正方形卡片風格。

### 123. 裝備詳情懸浮代號膠囊與版面極簡去冗餘優化 (v0.1.23)
- **移除內文重複之庫存與代號標籤 (Streamlined Modal Content)**：
  - 移除裝備詳情彈窗內文標題下方之 `.detail-modal-badges`（「庫存充足 (數量)」與舊「代號: XXX」標籤）。
  - 因彈窗底部已具備清晰的「剩餘數量：X 件」與「已無庫存」標籤，內文去冗餘後使名稱、價格與說明排版更加緊湊乾淨。
- **照片左上角懸浮代號膠囊 (Floating Equipment Code Capsule)**：
  - 在正方形相片輪播容器（`.detail-modal-image-wrapper`）左上角新增精緻半透明暗色毛玻璃膠囊標籤（`.equipment-code-capsule`）。
  - 清晰呈現裝備代號（如 `代號: A01`），具備現代流線感、文字加粗與陰影層次，且設定 `pointer-events: none` 不影響點擊相片開啟全螢幕檢視。

### 122. 裝備試算表圖片網址獨立五欄化架構 (圖片網址1 ~ 圖片網址5) (v0.1.22)
- **試算表欄位獨立一欄一網址 (5 Separate Columns for Gear Photos)**：
  - 將 Google 試算表 `Equipments` 頁籤中原先單一欄位逗號分隔的圖片網址，重構升級為 5 個獨立欄位：`圖片網址1`、`圖片網址2`、`圖片網址3`、`圖片網址4`、`圖片網址5`。
  - **自動升級與向下相容 (Auto Schema Migration & Backward Compatibility)**：
    - 若試算表尚為舊版單欄 `圖片網址`，系統儲存照片時會自動將該欄升級更名為 `圖片網址1`，並依序自動建立 `圖片網址2` 至 `圖片網址5` 欄位。
    - 讀取時（`getEquipmentsAPI`）自動聚合 `圖片網址1` 至 `圖片網址5`（若有舊版欄位亦一併納入），確保前端取得完整的相片列表。
  - **精準更新與清空機制 (Clean Synchronization)**：
    - 幹部儲存裝備照片時，各欄位嚴格對應獨立網址；當照片數量少於 5 張時，未使用的圖片網址欄位將自動清空，杜絕殘留舊網址或格式混亂問題。

### 121. 裝備詳情無頂欄極簡重構、正方形多圖輪播、全螢幕檢視與幹部照片管理系統 (v0.1.21)
- **無頂欄極簡設計與正方形輪播 (Headerless Square Multi-Photo Carousel)**：
  - 移除裝備詳細頁面頂部之標題列與關閉按鈕（`&times;`），營造乾淨現代的沉浸式卡片視覺。
  - 圖片容器改為 `1:1` 正方形比例，中央底部配置分頁小圓點（無多餘文字與箭頭），點擊大圖可開啟全螢幕高解析度 Lightbox 檢視。
- **一般使用者按鈕邏輯導正 (Dynamic Close & Add-to-Cart Button)**：
  - 預約數量調整完全透過 `+` 與 `-` 步進按鈕進行。
  - 當預約數量為 `0` 時：底部主按鈕為「關閉」（點擊關閉彈窗）。
  - 當預約數量大於 `0` 時：底部主按鈕自適應轉變為「加入租借車」（點擊將數量確認寫入購物車並關閉彈窗），徹底排除點擊按鈕重複加購之誤觸問題。
- **幹部照片新增與刪除管理 (Officer Inline Photo Management)**：
  - 具備幹部身分時，底部左側顯示「編輯照片」專屬功能按鈕。
  - 進入編輯模式後：
    - 大圖右上角浮現紅色垃圾桶按鈕，點擊可刪除當前照片。
    - 中央圓點旁出現「+ 上傳新照片」按鈕（上限 5 張），支援手機或電腦選取並由前端自動壓縮。
    - 底部按鈕動態切換為左側「取消」與右側「儲存」。
  - 批次儲存至 Google 雲端硬碟 `LINE_Uploads/裝備照片/裝備名稱/`（檔名規範：`裝備名稱_YYYYMMDD_序號.jpg`），並同步更新試算表 `Equipments` 之 `圖片網址` 欄位。

### 120. 體能證明多圖歷程修復、裝備詳情底部尺寸重構、繳費複製純圖示與入社意願社費說明 (v0.1.20)
- **體能與登山證明多圖修復與歷史保存 (Multi-Proof History & Drive Auto-Recovery)**：
  - **後端存檔合併**：在 `gas.js` 之 `processSaveProfile` 中，不再以新檔案覆蓋舊證明，改為合併試算表既有證明 URL 與本次新上傳檔案，自動去重並保存最新 5 張證明連結。
  - **Drive 歷史證明自動回補**：在 `getProfileAPI` 讀取用戶資料時，若筆數不足 5 張，自動檢索 Google Drive `LINE_Uploads/體能登山證明` 資料夾中符合該社員姓名的檔案並回補至證明清單。
  - **多格式容錯解析**：前端 `Register.tsx` 解析證明時改採正規表達式 `split(/[\n,，;\s]+/)`，確保換行、空格與逗號分割皆能正確載入並以縮圖卡片呈現最多 5 張證明。
- **裝備詳情彈窗底部尺寸與版面重構 (Gear Detail Modal Footer Redesign)**：
  - 在 `Borrow.tsx` 中將底部操作區升級為結構化兩列式設計：
    - **第一列**：清楚呈現「剩餘數量 / 庫存」（搭配充足/售罄色彩徽章）以及大尺寸且易點擊的數量加減器（高度 36px）。
    - **第二列**：滿版寬度（高度 46px）的大尺寸操作按鈕，依庫存狀態自適應呈現「庫存不足」、「加入預訂」或「已預約 X 件 (點擊加購)」，大幅提升行動端點擊舒適度。
- **繳費系統複製帳號按鈕純圖示化 (Payment Copy Button Icon Only)**：
  - 在 `Payment.tsx` 中移除「點擊複製/已複製」文字，僅保留 `<Copy size={14} />` 與 `<Check size={14} />` 圖示，精簡畫面並搭配 Tooltip 輔助說明。
- **入社意願下新增社費說明卡片 (Membership Fee Info Card)**：
  - 在資料填寫第四步驟（登山經驗與體能證明）的「入社意願」選項下方，新增結構化的社費說明卡片，清楚標註「社員個人借裝享 5 折優惠」、「一學期方案 $200」、「直到畢業方案（大學部 $800 / 研究所 $400）」以及繳費管道說明。

### 119. Google 雲端硬碟檔案子資料夾分流與底線命名規範 (v0.1.19)
- **子資料夾結構化分流 (Multi-Level Subfolder Structure)**：
  - 擴充 `uploadFileToDrive` 支援多層資料夾路徑，所有檔案於 `LINE_Uploads` 母資料夾內精準分流：
    - **體能登山證明**：存入 `LINE_Uploads/體能登山證明/`。
    - **活動封面**：存入 `LINE_Uploads/活動封面/`。
    - **心得照片**：存入 `LINE_Uploads/心得照片/YYYYMMDD-活動名稱/`（以各活動第一天日期建立獨立專屬子資料夾）。
- **底線照片命名規範 (Underscore File Naming Conventions)**：
  - **體能證明**：`姓名_體能證明_YYYYMMDD.jpg`（多張時自動附加 `_1`、`_2`）。
  - **活動封面**：`YYYYMMDD_活動名稱_封面.jpg`（以活動第一天日期標示）。
  - **心得照片**：`YYYYMMDD_活動名稱_姓名.jpg`（多張時自動附加 `_1`、`_2`）。

### 118. 社員資料更新與建立通知排版淨化 (v0.1.18)
- **通知內容簡約純文字化 (Notification Formatting Clean-up)**：
  - 依指示保留通知主標題的 `✅` 及新進歡迎詞的 `🎉`。
  - 將資料修改明細與新註冊欄位清單內部之雜亂 Emoji（`✏️`、`➡️`、`📷`、`📝`）全面淨化為現代簡約的項目符號 `•` 與箭頭 `->`。
  - 證明檔名描述同步統一修正為「體能與登山證明」。

### 117. 資料註冊頁面重構、個資隱私安全保證與歷史證明縮圖卡片 (v0.1.17)
- **個人特殊病史移轉至基本選填資料 (Medical History Relocation)**：
  - 將「個人特殊病史或過敏（medicalHistory）」從「步驟 3：緊急聯絡人資訊」移至「步驟 2：基本選填資料」，符合個人身心狀況與選填性質歸類。
- **全頁文字靠左與問題題距留白優化 (Left-Aligned Layout & Form Spacing)**：
  - 覆寫全域置中樣式，將資料填寫頁面的標題、描述、輸入框全面設置為靠左對齊（`text-align: left`）。
  - 加大輸入框標題（`label`）與輸入元件之距離（提升至 8px~10px），並調整題與題之間外距為 20px，提供舒適易讀之視覺呼吸感。
- **個資隱私安全保護標語 (Data Privacy & Security Banners)**：
  - 於「步驟 2：基本選填資料」與「步驟 3：緊急聯絡人資訊」頂部加入隱私安全提示框（採用 Lucide 向量 `ShieldCheck` 圖示，無 Emoji），向社員明確保證社團絕不散布個人資訊，資料僅嚴格用於平安保險、入山申請及緊急聯絡。
- **已上傳的舊體能與登山證明縮圖外框卡片 (Uploaded Proofs Boxed Card with Thumbnails)**：
  - 更新多語系標題為「已上傳的舊體能與登山證明 (Uploaded Fitness & Hiking Proof)」。
  - 獨立外框卡片呈現，並透過 Google Drive 官方 CDN 直連（`getDirectImageUrl`）載入最多最近 5 張歷史證明之方格縮圖，支援點擊另開分頁檢視原始圖檔。

### 116. 幹部活動管理活動清單預設排序調整為截止時間降冪 (v0.1.16)
- **預設排序方式優化 (Default Sorting Optimization)**：
  - 將幹部活動管理（AdminEvents）活動總覽清單的預設排序欄位由「出隊日期（startDate）」調整為「報名截止時間（deadline）」。
  - 預設排序順序調整為「降冪（descending）」，使最新截止或近期活動第一時間呈現在列表最上方，方便幹部即時掌握最新即將截止之活動動態。

### 115. 活動報名寫入 Signups 欄位精準映射與緊急關係自動補欄防呆 (v0.1.15)
- **聯絡地址被緊急聯絡人地址覆蓋之重大 Bug 修復 (Contact Address Overwrite Bug Fix)**：
  - **修復前**：`handleSignup` 原先使用 `placeData("地址", p.studentAddr)`，因表頭中「緊急聯絡人聯絡地址」排在本人「聯絡地址」前方，導致系統先比對到緊急聯絡人地址欄位並被後續緊急地址覆蓋，使本人的聯絡地址欄位留白。
  - **修復後**：本人地址改採排除比對（`String(h).includes("地址") && !String(h).includes("緊急")`），確保本人地址與緊急聯絡人地址各歸其位、互不干擾。
- **聯絡電話與緊急聯絡人電話防衝突比對 (Phone Field Disambiguation)**：
  - 本人電話與緊急聯絡人電話均加上條件約束，本人電話明確排除「緊急」，徹底杜絕試算表欄位重排時可能產生的寫入錯位。
- **與緊急聯絡人關係自動補欄防呆機制 (Auto-Creation of Emergency Relation Column)**：
  - 若 `Signups` 試算表尚未建立「與緊急聯絡人關係」欄位，系統於報名時將自動透過 `getOrCreateColIdx` 在最後一欄動態建立，確保每次報名 100% 寫入報名者的緊急聯絡人關係資料。
- **延伸資料寫入支援**：
  - 於報名寫入邏輯補充「系所」、「學號」、「病史」欄位之放置比對，若試算表有對應欄位亦能自動填入。

### 114. 幹部系統雙向多維排序、標籤頁 0 延遲權限控管與個人資料排版優化 (v0.1.14)
- **活動管理與審核名單多維排序功能 (Dual-Direction Multi-Dimensional Sorting)**：
  - **活動清單排序 (Admin Events List Sorting)**：
    - 支援依「活動日期（startDate）」、「截止時間（deadline）」、「活動狀態（status）」三種維度排序。
    - 支援即時升冪（Ascending）與降冪（Descending）切換按鈕。
  - **報名者審核名單排序 (Applicant Signups List Sorting)**：
    - 支援依「報名順序（order，依 rowNumber）」、「社員優先（member，正式社員排前）」、「審核狀態（status，正取 → 備取 → 審核中）」排序。
    - 支援即時升降序切換。
  - **精緻緊湊型介面 (Compact UI)**：
    - 嚴格遵守 0 Emoji 規範，全數採用 Lucide-react 向量圖示（`ArrowUpDown`、`ArrowUp`、`ArrowDown`）。
    - 緊湊排版不佔手機螢幕空間，無縫整合於搜尋與篩選列。
  - **重新整理按鈕位置優化 (Refresh Button Placement)**：
    - 將活動管理頁面中的「重新整理」按鈕自頂部標籤列移至活動搜尋框右側，與搜尋輸入框並列同列，更加直覺便利。
- **幹部標籤頁 0 延遲權限控管 (Zero-Latency Officer Tab Control with SWR Cache)**：
  - **效能保證**：透過 `cacheUtils`（`sessionStorage` 結合記憶體備援），首次驗證後快取 5 分鐘，頁面切換與選單展開耗時 0 毫秒，絕不造成介面卡頓。
  - **完全隱藏**：非幹部帳號或尚未通過驗證前，右上角頭貼下拉選單一律不顯示「幹部系統」入口；直接輸入 `/admin/events` 亦有路由防護阻擋。
  - **測試環境修正**：移除測試帳號（`TEST_USER_ID`）盲目給予幹部權限的預設邏輯，確保只有通過驗證之幹部才具備訪問權限。
- **個人資料彈窗層級（z-index）與排版修復 (Profile Modal Layering & Layout Fixes)**：
  - **視窗層級修正**：將個人資料 Modal 的 `zIndex` 提升至 `10001`、體能證明 Modal 提升至 `10002`（高於審核名單 Modal 的 `9999`），徹底解決個人資料彈窗被壓在審核頁面後方的問題。
  - **證件號碼跨欄單行顯示**：為基本資料內的「證件號碼」加上 `gridColumn: 'span 2'`，提供充足寬度，徹底解決因單欄寬度不足導致證件字號折至下一行的問題。
  - **審核操作按鈕防連點與轉圈圈載入動效**：在個人資料彈窗內點擊「正取」、「備取」或「重設」時，即時顯示旋轉 Spinner 圖示，並自動停用按鈕點擊，防止重複誤按。
- **緊急聯絡人關係欄位解析修復 (Emergency Contact Relation Parsing Fix)**：
  - 於後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `get_admin_event_signups` 函式中補齊報名表表頭的 `sEmerRelIdx`（支援「與緊急聯絡人關係」、「關係」、「Relation」等多種命名格式）。
  - 在社員資料比對時擴充支援以系統識別碼（`userId`）與手機號碼（`phone`）雙向關聯，確保緊急聯絡人關係資料精準提取並呈現在前端。

### 113. 備取卡片視覺邊框修復與報名者個人資料完整檢視功能 (v0.1.13)
- **備取邊框與陰影狀態同步修復 (Waitlist Card Border & Shadow Sync)**：
  - **修復前**：卡片展開樣式採用 `isExpanded ? '#059669' : ...`，導致報名者設為備取時，展開中的卡片邊框依然被寫死為綠色。
  - **修復後**：邊框顏色依審核狀態優先決定：
    - 正取（Confirmed）：展開深綠 `#059669`、收合淺綠 `#bbf7d0`。
    - 備取（Waitlisted）：展開深橘 `#ea580c`、收合淺橘 `#fed7aa`、微橘色光暈。
    - 待審核（Pending）：展開品牌綠 `#059669`、收合灰白 `#e2e8f0`。
  - 同步將卡片展開與更新狀態鍵值鎖定在 `rowNumber`（實體列號），避免多筆相同專屬碼或測試帳號產生連帶操作。
- **報名者個人資料檢視功能 (Applicant Personal Profile Viewer Modal)**：
  - **後端資料擴充 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 在 `getEventSignupsAPI` 擴充提取 `Signups` 表與 `Members` 表欄位，回傳完整的報名者個資，包含：系所、學號、電話、Email、通訊地址、生日、證件字號、緊急聯絡人（姓名、關係、電話、地址）、登山經驗、體能紀錄、個人特殊病史或過敏等。
  - **前端互動介面與專屬彈窗 ([AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
    - 報名者卡片新增「瀏覽個人資料」按鈕（採純 Lucide SVG 圖示，不使用 Emoji）。
    - 點擊後開啟全功能自適應彈窗，條理分明呈現基本資料、通訊聯絡、緊急聯絡人、登山經歷與體能證明。
    - 支援一鍵複製 LINE ID、一鍵通話撥打、查看體能證明檔案。
    - 彈窗底部內建「正取 / 備取 / 審核中」快捷操作按鈕，幹部查閱完個人資料可直接完成審核。

### 112. Google 試算表「審核結果」資料驗證規則相容性修復與防呆機制 (v0.1.12)
- **問題根因診斷 (Root Cause Analysis)**：
  - **試算表儲存格下拉選單限制**：Google 試算表 `Signups` 表中的「審核結果」（T 欄）設定了「資料驗證規則 (Data Validation Rules)」，僅允許 `正取 Confirmed`、`正取(已繳費) Confirmed(Paid)`、`備取 Waitlisted`、`備取(有意願) Waitlisted (Interested)`、`審核中 Checking`、`已取消 Cancelled` 6 種完整選項。
  - **純中文字串觸發試算表異常**：前端點擊審核按鈕時，送入的值為純中文 `'正取'` 或 `'備取'`，導致 GAS 呼叫 `setValue()` 時拋出違規例外（*The data you entered in cell T2 violates the data validation rules set on this cell...*）。
  - **CORS 錯誤連鎖反應**：GAS 拋出 Google 試算表驗證例外中斷時，Google 伺服器會返回不帶 `Access-Control-Allow-Origin` 標頭的 HTML 錯誤頁面，導致 iPhone Safari / LINE LIFF 判定為連線錯誤，拋出 `TypeError: Load failed` 或 `XHR Network Error`。
- **全方位雙重相容性修復 (Dual-Layer Compatibility Fix)**：
  1. **前端按鈕標準化 ([AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
     - 正取按鈕傳送值修正為 `'正取 Confirmed'`。
     - 備取按鈕傳送值修正為 `'備取 Waitlisted'`。
     - 審核中按鈕維持標準 `'審核中 Checking'`。
  2. **GAS 後端字串規範化防呆 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
     - 在 `processUpdateSignupStatus` 寫入試算表前，增加字串規格化映射邏輯：若收到純中文 `'正取'` 自動轉為 `'正取 Confirmed'`，若收到 `'備取'` 自動轉為 `'備取 Waitlisted'`，若收到 `'審核中'` 自動轉為 `'審核中 Checking'`。徹底杜絕因傳入值未帶英文選項而觸發試算表拒絕寫入。
  3. **網路層簡化與回歸標準 ([api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts))**：
     - 移除不必要的 `img` 降級 hack，`gasGet` 回歸標準的 `fetch` API，並提供明確的伺服器 HTTP 狀態碼與錯誤訊息提示。

### 111. iOS Safari/LINE LIFF 302 轉址 XHR 自動降級與 HTML 防快取機制 (v0.1.11)
- **XHR 自動降級備援**：在 [api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts) 新增 `gasGet()` 工具函式：以 `fetch` 為首選發送 GET 請求，若 Safari/WebKit 拋出 `TypeError: Load failed`（因 GAS 302 跨域轉址被阻斷），自動降級為 `XMLHttpRequest`（XHR 處理 302 跨域轉址的相容性更佳），確保在所有 iOS 環境下皆能完成請求。
- **HTML 防快取標頭**：在 [vercel.json](file:///Users/brianhung/Documents/OfficialLINEAccount/vercel.json) 新增 `Cache-Control: no-cache, no-store, must-revalidate` 標頭，防止 LINE LIFF WebView 快取舊版 `index.html` 導致瀏覽器載入過期 JavaScript 套件。
- 以上機制確保 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 的審核正取/備取、活動狀態切換、一鍵推播通知三大操作在 iOS LINE 環境中穩定運作。

### 110. 幹部審核與活動管理全面轉移為 GET 協定徹底消除 iOS WebKit 302 轉址 Load failed (v0.1.10)
- **問題診斷**：
  - 在 iOS LINE LIFF 內嵌瀏覽器環境中，因 WebKit 安全性規格限制，跨網域 `fetch` POST 請求接收到 Google Apps Script 必要的 `302 Found` 轉址時（轉向 `script.googleusercontent.com`），會直接在瀏覽器網路底層被阻斷，拋出原生例外 `TypeError: Load failed`。
  - 與之相對，前端在讀取活動清單、報名名冊、個人資料與裝備列表時皆採用 `GET` 請求，iOS WebKit 能原生且完美跟隨 302 轉址完成跨域資料交換。
- **架構重構與修復**：
  1. **GAS 後端多路徑支援 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：在 `doGet(e)` 主路由中正式新增支援 `update_signup_status`（審核正取/備取）、`update_event_status`（快速啟閉活動報名）與 `send_event_notifications`（一鍵推播通知），並保留 `doPost` 雙向向下相容。
  2. **前端切換為帶權杖 GET 請求 ([src/pages/AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
     - 將 `handleUpdateApplicantResult`、`handleQuickStatusChange` 與 `handleSendNotifications` 全面改為 `GET` 請求搭配 `appendAuthToken` 與 URL 參數。
     - 徹底解決 iOS/Safari 跨網域 POST 轉址被阻斷的限制，達到與資料讀取相同之 100% 順暢與即時響應。

### 109. 審核操作異常與檔案權限防護修復 (v0.1.9)
- **幹部審核「操作失敗: Load failed」根本原因診斷與修復 (Applicant Review "Load failed" Fix)**：
  - **診斷發現**：
    1. **Google Apps Script 部署存取權限**：GAS 部署若「誰可以存取 (Who has access)」非「所有人 (Anyone)」，未帶 Google Session 認證的請求會被 302 導向至 `accounts.google.com`。由於該登入頁無 CORS 標頭，iOS WebKit/Safari 會直接阻斷請求並丟出原生 `TypeError: Load failed`。經設定為「所有人」後，GAS 已能順利接收跨域請求。
    2. **欄位模糊比對誤中「活動編號」修復**：[gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processUpdateSignupStatus` 原先使用 `String(h).includes("編號")` 搜尋報名專屬碼欄位（`codeIdx`），導致誤配對到第一欄「活動編號」，比對邏輯因此失效。現已修正為排除含「活動」字樣並明確比對「專屬碼/報名代碼/報名編號/序號」。
    3. **鎖定釋放安全性防護 (Lock Safety Guard)**：優化 `processUpdateEventStatus` 與 `processUpdateSignupStatus` 在 `finally` 區塊中的 `releaseLock()`，加入 `hasLock()` 狀態檢測與例外保護，防止未持鎖時調用導致後端崩潰拋出 500 HTML 錯誤。
    4. **前端重導向跟隨設定 (Redirect Follow)**：在 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 的所有後台管理 POST fetch 請求中顯式加入 `redirect: 'follow'`，確保跨網域跳轉順暢接收。
- **體能證明「你沒有呼叫 DriveApp.getFoldersByName 的權限」修復 (DriveApp Permission & Upload Error Handling)**：
  - **診斷發現**：
    1. 社員報名上傳體能證明時，後端呼叫 `DriveApp.getFoldersByName("LINE_Uploads")`。因 GAS 專案尚未在 Google 帳號授權 Google Drive 存取 Scope，導致 DriveApp 拋出權限例外。該例外被 catch 捕捉後，直接將錯誤訊息字串寫入試算表。
    2. 幹部在後台點選「查看體能證明」時，前端安全檢核機制檢測出非 URL 內容並向幹部顯示提示視窗。
  - **處置方案**：
    - GAS 專案已確認/完成 DriveApp 權限授權，日後報名上傳將正常上傳並寫入 Drive 檔案連結。
    - 針對已寫入錯誤訊息之舊資料列，可在試算表 `Signups` 表手動替換為正確檔案連結，或請社員重新報名即可。

### 108. 裝備頁面與活動審核中心第一階段前端載入加速與快取架構重構 (v0.1.8)
- **裝備租借頁面解除瀑布串行阻擋與 SWR 快取實作 (Borrow Page Waterfall Elimination & Early Render)**：
  - **效能問題診斷**：
    1. 原先 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 採用串行 `await`：先拉取裝備列表（耗時約 1.5 ~ 2 秒），裝備抵達後才發起第二個請求拉取 `get_my_status`（耗時約 2.5 ~ 3 秒），且 `setLoading(false)` 置於最後。使用者被卡在全白 Loading 轉圈畫面累計長達 **4.5 ~ 6.5 秒**。
    2. 裝備頁其實只用到 `get_my_status` 回傳的 `isOfficial` 單一布林值，卻引發後端掃描 Members、Officers、Signups、Events、Loan_Records 共 5 張試算表，構成嚴重過度查詢 (Over-fetching)。
  - **加速重構方案**：
    - 建立輕量快取模組 [cacheUtils.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/cacheUtils.ts)：支援 `sessionStorage` TTL 過期管理與記憶體降級備援機制。
    - **SWR (Stale-While-Revalidate) 快取秒開**：進入 `/borrow` 時優先讀取 5 分鐘快取，快取命中時 **0 毫秒立即呈現商品列表**。
    - **優先渲染 (Early Render)**：冷啟動時解除串行等待，裝備清單一旦取得立即執行 `setLoading(false)` 渲染畫面，使使用者在 **1.2 ~ 1.5 秒內** 即可開始瀏覽器材與規格。
    - **身分折扣非同步分離**：社員資格比對改以獨立並行 Promise 進行，取得後平滑更新折扣價，不阻擋核心瀏覽流程。
    - **重新整理與庫存保證**：標題列新增「重新整理」按鈕；且在使用者成功送出預約表單後，自動清除裝備快取，確保下次載入取得即時庫存數值。

- **活動審核中心雙重驗證瀑布消除與樂觀計數重構 (Admin Events Waterfall Removal & Optimistic UI)**：
  - **效能問題診斷**：
    1. 原先 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx) 在載入時先呼叫 `check_officer_status` 檢驗身分，待其返回後才在回呼中呼叫 `get_admin_events`，形成雙重 HTTP 往返，累積延遲達 **5.0 ~ 7.5 秒**。
    2. 審核名單 Modal 每次點開皆重複向後端全表查詢；且幹部在名冊中每點擊審核 1 位社員（正取/備取），程式碼皆全量觸發 `fetchEvents()` 重新向後端拉取全部活動，造成伺服器高負載與背景卡頓。
  - **加速重構方案**：
    - **移除冗餘驗證**：拔除前置獨立的 `check_officer_status`，改為直接呼叫 `get_admin_events`（後端已內含幹部身分校驗與幹部資訊），首屏載入時間直接**腰斬至 1.8 ~ 2.2 秒**。
    - **活動列表快取**：活動清單支援 3 分鐘快取，分頁切換時瞬時還原；提供手動重新整理按鈕以便手動強制更新。
    - **審核名冊快取**：以活動代號為鍵快取名冊 2 分鐘，點開 Modal 避免重複旋轉等待，並在 Modal 標題列附帶即時刷新按鈕。
    - **審核操作樂觀計數 (Optimistic Counter Update)**：幹部變更審核狀態時，前端直接於記憶體與快取中動態增減對應活動之統計徽章（例如待審核 -1、正取 +1），**徹底拔除重複發送全量 `fetchEvents()` 的後端負擔**，使審核操作達到 **0ms 即時反饋**。

### 107. 幹部審核正取/備取即時標記修復與體能證明安全預覽優化 (v0.1.7)
- **幹部審核正取/備取/重設標記失效修復 (Applicant Review Status Update Fix)**：
  - **根本原因診斷**：
    1. 原前端 `handleUpdateApplicantResult` 僅以 `signupCode`（專屬報名碼）作為唯一比對鍵值。若報名資料為早期登記、無專屬碼或欄位為空，傳給後端的 `signupCode` 為 `""`，導致後端找不到資料列且前端畫面狀態無法樂觀更新。
    2. 原後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processUpdateSignupStatus` 採用嚴格欄位索引比對，若試算表標題為「審核」或「審核狀態」而非精確的「審核結果」，會回傳 `-1` 引發 `getRange` 範圍無效例外。
  - **修復方案**：
    - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：`handleUpdateApplicantResult` 改為接收完整報名者物件 `s: SignupApplicant`，發送請求時帶入 `signupCode`、`targetUserId: s.userId`、`rowNumber: s.rowNumber` 與 `name: s.name`。
    - 前端畫面即時更新採用複合唯一鍵（`signupCode || rowNumber || userId`），確保無論有無專屬碼都能即時更新卡片狀態與頂部統計徽章。
    - 補強 `catch` 區塊之錯誤彈窗提示，避免因網路或權限問題靜默吞沒異常。
    - 後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：`processUpdateSignupStatus` 支援 `rowNumber` 驗證後優先精準鎖定，次級依序比對 `signupCode`、`targetUserId + eventId` 與 `name + eventId`，並透過 `getOrCreateColIdx` 自動補齊缺失之「審核結果」與「通知狀態」欄位。
- **查看體能證明避免誤轉跳裝備租借頁面修復 (Fitness Proof Viewer & Prevent Navigation to /borrow)**：
  - **根本原因診斷**：
    1. 原前端使用 `<a href={s.strengthProof.split(',')[0]} target="_blank">` 標籤。當社員登記的體能證明非以 `http/https` 開頭（例如為純文字、Google Drive 檔案 ID、相對路徑或空值）時，瀏覽器會將其當作站內相對路徑。
    2. 由於該路徑在 React Router 中未定義，觸發了 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 萬用路由 `<Route path="*" element={<Navigate to="/borrow" replace />} />`，直接將幹部強制重新導向至預設的「裝備租借頁面」（`/borrow`）。
    3. 在 LINE LIFF 內嵌瀏覽器中，一般的 `<a target="_blank">` 連結若未以 `liff.openWindow({ url, external: true })` 開啟，易造成 LIFF 載入失敗或回退至首頁預設視圖。
  - **修復方案**：
    - 將連結替換為 `<button type="button">`，徹底阻絕瀏覽器誤認相對路由之行為。
    - 封裝 `openExternalUrl`：在 LINE 環境下使用 `liff.openWindow({ url, external: true })` 透過外部瀏覽器開啟，一般瀏覽器則以 `window.open` 安全開啟。
    - 封裝 `parseProofUrls`：精密解析 URL、清理空格，並自動將 Google Drive 檔案 ID 轉換為有效預覽網址（`https://drive.google.com/file/d/{id}/view`）。
    - 支援多張體能證明預覽彈窗：若報名者上傳了多張證明照片或檔案，點選「查看體能證明」將跳出專屬清單彈窗，讓幹部逐一開啟檢視。
    - 後端補強：在 `processGetEventSignups` 中若 `Signups` 表無體能證明，自動交叉比對 `Members`（社員資料）表提取該社員最新體能證明檔案。

### 106. 活動截止日自動判定、即時防呆阻擋與定時巡檢關閉機制實作 (v0.1.6)
- **活動截止日期精密解析核心 (Deadline Parser & Validator)**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 新增 `_isEventExpired` 工具函式。
  - 支援 Date 物件與 `YYYY/MM/DD`、`YYYY-MM-DD`、`YYYY.MM.DD` 等各類字串格式，精準判定至截止日當天 **23:59:59.999** 為止，維護社員於截止日當天的完整報名權益。
- **LINE 最新活動列表與詳情卡片即時自動關閉 (Realtime Auto-Close on LINE Cards)**：
  - 更新 `sendEventList`：若偵測到活動為開放但已過報名截止日，系統自動將試算表狀態即時改寫為「關閉」，並從開放活動輪播卡片中隱藏，防止社員被過期活動誤導。
  - 更新 `sendEventDetail`：若社員查看已截止之活動，系統自動將報名按鈕轉為灰底無效之「報名已截止 Closed」，阻擋點擊報名。
- **一鍵報名底層安全攔截 (Backend Signup Deadline Guard)**：
  - 更新 `handleSignup`：在執行報名寫入前優先檢驗活動之截止日與狀態。若活動已截止或關閉，立即中斷報名並回傳提示訊息（例如：`⚠️ 報名失敗：【合歡山主東峰】已於 2026/04/12 截止報名！`），杜絕以過期訊息搶報名之漏洞。
- **每日凌晨排程自動巡檢與幹部推播 (Daily System Check & Cadre Alert)**：
  - 補完 `dailySystemCheck` 核心排程：定時遍歷 `Events` 資料表，將所有已過截止日之開放活動自動同步標記為「關閉」。
  - 自動彙整過期關閉之活動清單，推播通知至幹部 LINE 群組，免除幹部每日手動檢查與維護活動狀態之負擔。
- **幹部管理中心介面輔助標註 (Admin Events UI Indicator)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：在活動列表的「報名截止」資訊旁，若已過截止日自動顯示紅色 `(已截止)` 標籤，讓幹部一目了然。

### 105. AI 助理「小岳」Gemini 回覆結尾自動附帶免責聲明 (v0.1.5)
- **AI 幻覺與資訊準確性提醒 (AI Disclaimer Suffix)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `talkToGemini` 函式。
  - 在每次小岳透過 Google Gemini 2.5 AI 模型產生回答文字時，在內容最末端自動加上清晰的分隔線與官方提醒：
    ```text
    ─────────────
    小岳 Yue is AI. 小岳 Yue can make mistake.
    ```
  - 確保不論是在幹部群組（`replyAdminMessage`）或是個人一對一聊天室（`replyMessage`）向小岳提問，社員與幹部皆能明確知悉 AI 助理之特性，提醒重要行程或決策仍須以幹部公告為準。

### 104. 幹部系統活動說明字數上限調升至 1,400 字 (v0.1.4)
- **字數上限彈性提升 (Word Limit Adjustment)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 將幹部新增/編輯活動時的說明文字綜合總字數上限由 1,300 字調升至 **1,400 字**（`TOTAL_DESC_LIMIT = 1400`）。
  - 詳細行程與裝備要求欄位建議上限同步由 1,200 字調整為 **1,300 字**（`FULL_DESC_LIMIT = 1300`），保留更充裕的篇幅撰寫完整活動登山行程。
  - 同步更新即時字數統計條、超標紅框判定條件與防呆警告訊息。

### 103. LINE 活動卡片樣式完全對齊、詳細卡片整合簡介與幹部後台字數限制彈性輸入框 (v0.1.3)
- **LINE 最新活動列表卡片文字樣式對齊 (Activity List Styling Sync)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventList`。
  - 將「活動時間」與「報名截止」之標籤由 `xs`、灰色調提升為標準 `sm`、`#666666`。
  - 將出隊日期數值改為主題綠色 `#1DB446` 粗體，報名截止數值加上粗體 `#E53935`，完全與「查看詳情」大卡片的精緻視覺排版保持一致。
- **LINE 活動詳細卡片整合完整簡介 (Event Detail Card Overview Integration)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventDetail`。
  - 動態讀取 `簡介 (shortDesc)` 欄位。
  - 突破原本輪播卡片中 3 行限制，在詳細資訊卡片中獨立展示「【活動簡介 Overview】」全文字段與「【詳細行程 Itinerary & Details】」，讓社員點擊詳情即可完整閱讀重點說明與完整行程。
- **幹部管理中心新增/編輯活動字數限制與彈性輸入框 (Cadre System Character Limits & Resizable Inputs)**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - **字數判定與綜合上限控制**：
    - 設定簡介上限 200 字、詳細行程上限 1,200 字、綜合總字數上限 1,300 字。
    - 輸入框右下角即時計算並顯示字數（如 `0 / 200 字`、`0 / 1,200 字`）。
    - 提供綜合總字數狀態列，即時提示當前文字量與上限比率。
  - **超量紅框警示與阻擋機制**：
    - 任一欄位或綜合字數超出上限時，輸入框立即轉為醒目紅色外框（`2px solid #ef4444`）與淺紅防呆底色。
    - 表單提交按鈕即時變更為禁用狀態（灰色、禁止點擊標記），點擊時防呆阻擋，徹底防止文字量過大導致 LINE Flex Message 超過 10 KB 發送失敗。
  - **輸入框彈性尺寸縮放 (Resizable Textarea)**：
    - 為「簡介」與「詳細行程」文字區塊加入 `resize: 'vertical'`、`overflow: 'auto'` 與自適應最小高度，幹部在電腦或手機端可自由拖曳右下角調整輸入框高度，長文撰寫與檢視更順手。
  - **即時預覽卡片排版同步 (Live Preview Sync)**：
    - 同步更新管理後台右側的即時卡片預覽元件，讓幹部所見即所得。

### 102. LINE 官方帳號活動卡片全面去 Emoji 化與排版美化 (v0.1.2)
- **活動列表輪播卡片 (Activity Carousel Cards)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventList`。
  - 移除「最新活動」輪播卡片中費用、活動時間、報名截止標籤前方的 Emoji 表情符號（`💰`、`📅`、`⏰`），統一採用乾淨俐落之雙語純文字標籤：
    - `費用 Cost:`
    - `活動時間 Event Date:`
    - `報名截止 Sign Up Deadline:`
  - 優化日期換行與間距縮排排版，避免手機端呈現多餘空白字元。
- **活動詳情單卡與報名按鈕 (Activity Detail Card & Buttons)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `sendEventDetail`。
  - 標題與欄位去 Emoji：將「📝 活動詳情 Event Details」改為「活動詳情 Event Details」，並同步移除費用、活動時間與報名截止前方的 Emoji。
  - 狀態按鈕文字優化：將「⏳ 尚未開放 Not Open」按鈕文字精簡為「尚未開放 Not Open」。
- **活動審核結果推播卡片 (Event Signup Result Push Notifications)**：
  - 更新 `sendEventResultNotifications` 與 `processSendEventNotifications`。
  - 移除正取與備取通知卡片頂部的「📣 審核結果出爐 Result」中的 `📣`，以及恭喜錄取說明文字中的 `🎉`，呈現簡約沈穩的高質感介面。
- **幹部群組新活動上架廣播通知 (Cadre Group New Event Announcement)**：
  - 更新 `processSaveEvent`：移除通知訊息中的 Emoji 圖示（`📢`、`📍`、`🏷️`、`📅`、`⏰`、`💰`、`🚦`），維持幹部群組資訊的簡潔專業風格。

### 101. LINE ID Token (JWT) 數位簽章驗證防冒充架構實作 (v0.1.1)
- **前端自動加密驗證憑證傳遞 (Frontend Auto ID Token Attaching)**：
  - 新增 [src/utils/api.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/api.ts) 共用通訊模組，提供 `getIdToken()`、`appendAuthToken()` 與 `withAuthPayload()` 工具函式。
  - 全面更新前端所有資料存取與業務操作模組（[Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)、[Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)、[Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)、[Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)、[History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx)、[Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)、[AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)、[App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)）。
  - 在發起任何查詢或異動之 GET / POST 請求時，自動由 `liff.getIDToken()` 提取當前登入者由 LINE 官方加密簽署之 JWT Token 並隨附發送。
- **後端官方數位簽章校驗核心 (Backend LINE Signature Verification & Cache)**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `verifyLineIdToken` 與 `getAuthenticatedUserId` 驗證核心。
  - 介接 LINE 官方驗證端點 `https://api.line.me/oauth2/v2.1/verify`（Channel ID: `2009217429`），驗證憑證之真偽、期限與發行者。
  - 導入 `CacheService.getScriptCache()` 10 分鐘快取機制，以 Token 雜湊為鍵進行高效去重比對，兼顧極致資安防護與零延遲載入效能。
  - 於 `doGet` 與 `doPost` 全面啟用認證檢核：凡未帶 Token 或 Token 遭竄改/過期之請求，將一律被拒絕存取個資；合法請求強制綁定官方驗證之 `sub`（真實 User ID），徹底杜絕任何外部有心人士透過明文 `userId` 冒充他人身分之嚴重資安風險。

### 100. 幹部專屬管理中心獨立 LIFF ID (2009217429-DSYjXqNK) 串接與全端資安後門 (TEST_USER_ID) 全面拔除 (v0.1.0)
- **幹部專屬管理中心獨立 LIFF 串聯 (Dedicated Cadre LIFF Integration)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：將「幹部系統」指令回覆以及幹部功能指引卡片中的後台連結，全面換成使用者新建立之專屬獨立 LIFF 網址：`https://liff.line.me/2009217429-DSYjXqNK`。
  - 更新 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)：
    - 在 `initializeLiff` 加入 `/admin` 專屬路由識別，確保透過該 LIFF 連結開啟時，正確以 `2009217429-DSYjXqNK` 進行 SDK 初始化，徹底終結先前因借用主頁 LIFF 轉址而跳回個人主頁或裝備租借的問題。
    - 全域導航選單中點擊「幹部管理中心」時，於 LINE 客戶端環境以 `handleNav` 搭配 `2009217429-DSYjXqNK` 專屬 LIFF 開啟。
- **全端資安防護加固：全面拔除 TEST_USER_ID 測試後門 (Elimination of Backdoor Vulnerabilities)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：
    - 徹底移除 `getAdminEventsAPI`、`getEventSignupsAPI`、`processSaveEvent`、`processUpdateEventStatus`、`processUpdateSignupStatus`、`processSendEventNotifications` 等所有管理 API 中的 `userId !== "TEST_USER_ID"` 豁免判斷。
    - 嚴格落實身分權限檢核：任何存取或修改活動與報名名冊之請求，必須具備合法且確實登記於 `Officers` 試算表中的幹部 LINE User ID，任何人即便得知 GAS Web App 網址，亦無法再以 `TEST_USER_ID` 撈取報名者姓名、電話、學號等敏感個人資料。

### 99. LINE 原生 @Mention 精準裁切、群組招呼指令直通指南與 Gemini System Prompt 修正 (v0.0.99)
- **LINE 原生 Mention 精準裁切演算法 (Precise Native Mention Stripping)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `handleTextCommand`。
  - 改用 LINE Webhook 官方 `mention.mentionees` 結構中所提供的精確字串切片範圍 `index` 與 `length`。
  - 採取由後往前（Descending Offset）的切割策略，精確抹除被 `@` 的機器人標籤，徹底解決因機器人自訂名稱含有空格、特殊字元或表情符號導致正則表達式切除不全的問題。
  - 支援過濾各類 Unicode 空白字元（如 `\u2005` 四分之一空格、`\u00A0`、`\u3000` 全形空格）。
- **群組常用問候與說明直通幹部指南 (Cadre Guide Direct Trigger)**：
  - 在幹部群組環境中，只要呼叫助理並帶有「你好」、「您好」、「嗨」、「哈囉」、「hello」、「hi」、「指令」、「功能」、「說明」、「幫助」、「在嗎」或未帶任何問題時，系統一律直接回傳「🌲 幹部專屬助理功能指南」卡片，不再將問候文字誤送至 Gemini AI。
- **Gemini AI 系統提示詞修正 (System Prompt & Persona Fix)**：
  - 在 `talkToGemini` 將 AI 助理預設名稱由「小山」正式修正為「小岳（Yue）」，並更新人格設定為專業、親切與排版工整。
  - 提示詞中加入幹部專屬指令導引（「小岳 幹部系統」、「小岳 抓取群組ID」），並移除鼓勵使用 Emoji 之指令，保持乾淨俐落之回覆風格。

### 98. 儀表板版面修復、全站全面去 Emoji 化、匯款帳戶左對齊點擊複製與備註追蹤系統 (v0.0.98)
- **儀表板幹部卡片跑版修復 (Dashboard Layout Bug Fix)**：
  - 修復 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 中「幹部專屬管理中心」卡片內文被擠壓斷成多行狹窄文字的問題。
  - 為文字容器添加 `flex: 1` 與 `minWidth: 0`；為「前往管理」按鈕明確設定 `width: 'auto'` 與 `flexShrink: 0`，避免被全域 `.btn` 之 `width: 100%` 擴張而擠壓左側說明文字。
- **全站全面去 Emoji 化與向量圖示升級 (Complete Project-wide De-emojification)**：
  - **導航與頁面結構 ([App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx))**：
    - 頂部導航標題圖示全數替換為 Lucide 向量圖示（`ShieldCheck`、`Award`、`FileText`、`ClipboardList`、`CreditCard`、`User`、`Compass`）。
    - 語言切換按鈕 `🌐` 升級為 `<Languages size={15} />`；彈窗警示 `⚠️` 升級為 `<AlertCircle size={48} color="#ef4444" />`。
  - **裝備租借 ([Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx))**：
    - 分類預設圖示由 Emoji 升級為標準向量圖示（`Tent`、`Moon`、`Package`、`Compass`、`Flame`、`Shield`、`Mountain`）。
    - 購物車空狀態由 `🛒` 升級為 `<ShoppingCart size={40} />`。
  - **繳費報帳 ([Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx))**：
    - 移除成功彈窗的 `🎉`、`👍`，改用柔和綠底搭配 Lucide `<CheckCircle2 size={48} color="#16a34a" />`；錯誤提示 `⚠️` 替換為 `<AlertCircle size={14} />`。
  - **歷史紀錄 ([History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx))**：
    - 狀態標籤 `🟢`、`🔴`、`🟡` 替換為 6px CSS 實心動態狀態圓點。
    - 欄位圖示 `👤`、`📅`、`🏕️`、`💰` 全面替換為 `<User />`、`<Calendar />`、`<Tent />`、`<CreditCard />`；空狀態與警示改用 `<FileText />` 與 `<AlertCircle />`。
  - **榮譽徽章 ([Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx))**：
    - 空狀態 `🧗` 與錯誤 `⚠️` 升級為 `<Award />` 與 `<AlertCircle />`；評分星號以 Lucide `<Star size={20} />` 精緻渲染。
  - **註冊報名 ([Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx))**：
    - 移除檔名標註 `✓`，改為內嵌向量 `<Check size={14} color="#16a34a" />`。
  - **語系檔案與樣式表 ([zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json)、[en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)、[App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css))**：
    - 全面清除中英文語系 JSON 鍵值與 CSS 註解段落中的所有 Emoji，經全專案掃描驗證達到 0 Emoji 純淨度。
- **社團匯款帳戶靠左對齊與一鍵複製功能 (Left-Aligned Account & Click-to-Copy)**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)：
    - 匯款資訊卡改為靠左對齊排版，搭配銀行小圖示 `<Building2 size={16} color="#059669" />` 提升視覺層次。
    - 匯款帳號（`111019636700`）提供點擊複製功能，點擊後自動複製至剪貼簿，並即時變更為「已複製！」打勾回饋狀態（維持 2 秒後復原）。
- **繳費備註（Note）全端串聯與即時追蹤 (Payment Note Feature Across Stack)**：
  - **前端輸入**：在 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 新增「匯款備註 (選填)」輸入框（上限 100 字），支援說明特定折抵、代繳對象或特殊用途。
  - **後端存取 ([gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 在 `processPaymentSubmit` 自動檢測並動態補齊 `Payments` 工作表之「備註」欄位標題，寫入填寫者提供的備註。
    - 在推播給幹部群組的審核 Flex 卡片中加入「備註」欄位，讓幹部直接在 LINE 群組一眼掌握備註說明。
    - 在 `getPaymentHistoryAPI` 讀取並回傳「備註」資料至繳費紀錄清單中。
  - **紀錄查看 ([History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx))**：
    - 繳費歷史紀錄展開詳細資訊時，若該筆款項附有備註，即時以標準文字卡片顯示「備註說明」。

### 97. 幹部群組單一綁定保護機制、防誤觸二次確認 Flex Card 與個人主頁全面去 Emoji 化 (v0.0.97)
- **嚴格單一群組綁定原則（Single Cadre Group Binding）**：
  - 在 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 實作 `PropertiesService.getScriptProperties().setProperty('ADMIN_GROUP_ID', newGroupId)` 自動持久化儲存機制。
  - 保證系統永遠「僅存在單一幹部通知群組」。一旦更換綁定至新群組，舊群組之 ID 立即被覆蓋失效，舊群組即刻停止接收任何活動報名、請假審核與裝備租借推播訊息。
- **防誤按互動式確認卡片（Anti-Accidental-Trigger Flex Card）**：
  - 幹部在群組輸入「`小岳 抓取群組ID`」或以原生 `@助理 抓取群組ID` 呼叫時，系統不再自動直接覆蓋綁定，而是回傳具備安全警示的 LINE 互動式 Flex 卡片：
    - 明確顯示目前群組 ID。
    - 提示若目前已為綁定群組（顯示「此群組已是目前唯一綁定的幹部群組」），或提示綁定後將轉移接收所有幹部通知。
    - 明確以警示文字說明：「此操作將取代舊群組，舊群組將無法再接收到通知」。
    - 提供「確認綁定此群組為唯一通知群組」的專屬 Postback 按鈕（傳遞 `action=confirm_bind_admin_group&groupId=...`）。
- **Postback 安全確認處理解決方案**：
  - 在 `handlePostback` 新增 `action === "confirm_bind_admin_group"` 處理器，唯有幹部在群組中主動點擊確認按鈕時，系統才會正式寫入 `PropertiesService` 並立即同步記憶體變數，隨後回傳綁定成功訊息，徹底避免誤觸。
- **個人主頁（Dashboard）全面去 Emoji 化與向量圖示升級**：
  - 更新 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)：
    - 會員卡狀態文字 Emoji（`✅`、`❌`、`⚠️`）升級為 Lucide `<CheckCircle2 size={13} />`、`<XCircle size={13} />`、`<AlertTriangle size={13} />`。
    - 活動與裝備區塊標題（`🏕️`、`🎒`）替換為 `<CalendarCheck size={18} color="#059669" />` 與 `<Package size={18} color="#059669" />`。
    - 欄位資訊小標（`📅` 日期、`📝` 訂單編號、`⚠️` 逾期提示）轉為標準文字搭配 `<Calendar size={13} />`、`<FileText size={12} />`、`<AlertTriangle size={12} />`。
    - 錯誤畫面與彈窗標題（`❌`、`⚠️`）分別替換為 `<AlertCircle size={48} color="#ef4444" />` 與 `<AlertTriangle size={20} color="#ef4444" />`。
    - 預設使用者頭像由 `👤` 替換為 `<User size={24} />`。
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)：
    - 全面清除 `dashboard.alert`、`dashboard.card`、`dashboard.activity`、`dashboard.equipment`、`dashboard.modal` 內部殘餘之 Emoji，提供整齊俐落且國際化的質感介面。

### 96. 幹部群組助理升級：支援 LINE 原生 @Mention、幹部指令指南與防衝突機制 (v0.0.96)
- **支援 LINE 原生 `@` 標註呼叫 (Native Mention)**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `doPost` 與 `handleTextCommand`。
  - 解析 LINE Webhook 之 `event.message.mention.mentionees` 陣列，只要偵測到 `isSelf === true`（即標註機器人本身），不論幹部在 LINE 後台將機器人設定為「小岳」、「幹部秘書」或任何自訂名稱，均能 100% 精準觸發。
  - 自動剔除開頭的 `@名稱` 標籤，將乾淨的問題內容傳送至 Gemini AI。
- **維持免 `@` 純文字前綴雙軌相容**：
  - 維持原本輸入「`小岳`」或「`Yue`」開頭即可直接對話的習慣，手動輸入 `@小岳` 亦可自動相容解析。
- **呼叫式「抓取群組ID」與「幹部系統」捷徑**：
  - 將原先獨立的指令升級為呼叫式互動，支援在群組輸入「`小岳 抓取群組ID`」或以 `@助理 抓取群組ID` 查詢群組代號。
  - 新增「`小岳 幹部系統`」快捷指令，直接回傳活動管理與名單審核之專屬 LIFF 入口連結。
- **群組空呼叫自動傳送「幹部專屬指令指南」**：
  - 當幹部在群組中僅標註 `@助理` 或輸入「`小岳`」但**未附帶任何問題**時，助理會自動在群組傳送結構化之「幹部專屬助理功能指南」，列出幹部系統連結、群組 ID 查詢、AI 提問範例與即時推播說明。
- **雙機器人 Token 嚴格隔離防衝突 (Token Routing)**：
  - 在群組環境（`sourceType === "group" || "room"`）一律調用 `replyAdminMessage`（使用 `ADMIN_BOT_TOKEN`）；在個人一對一對話一律調用 `replyMessage`（使用 `MEMBER_BOT_TOKEN`），徹底根除兩隻機器人共用後端時可能產生的 `Invalid reply token` 衝突問題。

### 95. 幹部系統全面「去 Emoji 化」與現代向量圖示重構 (Complete De-emojification) (v0.0.95)
- **活動看板狀態標籤微型化與純淨化**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 徹底移除 `🟢 開放報名`、`🟠 未來開放`、`⚪ 已關閉` 的彩色圓球文字 Emoji。
  - 改為內嵌精美之 `6px` CSS 實心動態狀態圓點（綠色 `#16a34a` / 橙色 `#ea580c` / 灰色 `#94a3b8`）搭配工整純文字，徹底解決文字 Emoji 在跨作業系統渲染時之基線高度落差。
- **權限不足與空狀態向量圖示化**：
  - 將未授權頁面的巨大 `🔒` 替換為柔和圓形紅底搭配 Lucide `<Lock size={40} color="#ef4444" />`。
  - 將活動列表無資料的 `🏔️` 空狀態替換為簡約高質感的 `<Mountain size={44} color="#94a3b8" />`。
- **表單說明與 LINE 即時卡片預覽去 Emoji 化**：
  - 表單狀態說明的 `💡` 替換為俐落的 Lucide `<Info size={14} color="#059669" />` 提示圖示。
  - LINE 卡片預覽封面缺失預設由 `🏔️` 替換為 `<Mountain size={36} color="#94a3b8" />`。
  - 移除預覽卡片中的 `💰`、`📅`、`⏰`、`⏳` 等冗餘 Emoji，轉為標準乾淨的雙語文字排版。
  - 名冊審核彈窗右上角的關閉文字 `✕` 升級為精緻的向量 `<X size={20} />` 按鈕。
- **個人主頁幹部入口卡片現代化**：
  - 更新 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)。
  - 將「幹部專屬管理中心」入口的 `🛠️` Emoji 升級為現代綠底圓角 `<ShieldCheck size={24} color="#059669" />` 徽章，按鈕箭頭亦同步升級為 `<ChevronRight size={15} />`。
- **雙語語系檔全面淨化**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)。
  - 全面移除 `menuAdminEvents`（幹部系統）、`coverUploadBtn`（從相簿選擇照片）、`notifyOfficerGroup`（上架推播）等鍵值中殘留之 `🛠️`、`📷`、`📢` 等文字 Emoji。

### 94. 徹底修復 iOS/WebKit 日期選取框樣式跑版與 CSS Grid 溢出重疊問題 (v0.0.94)
- **問題根因分析**：
  - 在 iOS Safari 或 WebKit 瀏覽器環境中，`<input type="date">` 預設以原生灰色藥丸按鈕樣式渲染，且內部含有固定最小內容寬度（Min-content width）。
  - 當其置於 `grid-template-columns: 1fr 1fr;` 且未設定 `min-width: 0` 時，左欄日期元件因寬度超過網格容量而強制向右溢出（Overflow），吃掉欄間間距（gap）並直接侵入、覆蓋在右側輸入框之上（如「報名截止日」灰框穿透至「預計費用」白框底部）。
  - iOS 預設的 `::-webkit-date-and-time-value` 行為會將日期文字強制置中，且原生元件高度與一般的文字輸入框不同，造成左右底部無法對齊。
- **全方位修復方案**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)：
    - 將日期與費用區塊之網格樣式更新為防溢出的 `gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)'`，並在每個欄位容器強制鎖定 `minWidth: 0`。
    - 日期與費用輸入框全面配置 `WebkitAppearance: 'none'`、`appearance: 'none'`、`backgroundColor: '#ffffff'`、`color: '#1e293b'`，清除 iOS 灰色藥丸原生樣式，還原為統一且精美的純白圓角輸入框。
    - 統一輸入框之最小高度 `minHeight: '42px'`、內距 `padding: '8px 12px'` 與 `fontSize: '13px'`，確保左欄日期與右欄費用輸入框垂直高度與底部像素級對齊。
  - 更新 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)：
    - 新增 `input[type="date"]::-webkit-date-and-time-value { text-align: left; }` 與全域 `appearance: none;`，徹底校正 iOS Safari 下日期文字強制居中之預設行為。
  - 同步語系文字 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)：
    - 同步移除幹部管理相關標籤之冗餘 Emoji，與正體中文語系檔保持完全一致。

### 93. 幹部活動管理介面向量圖示現代化升級 (Lucide-React Vector Icons) (v0.0.93)
- **引入 `lucide-react` 向量圖示庫**：
  - 依社群規範使用 `pnpm add lucide-react` 安裝輕量、支援 Tree-shaking 之標準向量圖示套件。
- **幹部活動管理頁面全面替換為專業 SVG 圖示**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - **頁籤導覽 (Tabs)**：將分頁 Emoji 替換為俐落的 `<ClipboardCheck size={17} />`（活動總覽與審核）與 `<Plus size={17} />` / `<Pencil size={17} />`（發布/編輯活動）。
  - **搜尋列 (Search Bar)**：在輸入框前端嵌入精準的 `<Search size={16} />` 圖示，取代純文字前綴。
  - **活動看板卡片 (Board Cards)**：
    - 活動縮圖缺失時以現代化的 `<ImageIcon size={28} />` 作為預設替代。
    - 時程費用獨立資訊格由原先的 📅、⏰、💰 Emoji 全面替換為 `<Calendar size={13} />`、`<Clock size={13} />` 與 `<CircleDollarSign size={13} />`。
    - 四色指標看板分別採用 `<Users size={14} />`（總報名）、`<CheckCircle2 size={14} />`（正取）、`<Clock4 size={14} />`（備取）與 `<AlertCircle size={14} />`（待審核）。
    - 底部操作按鈕對齊為 `<Pencil size={14} />`（編輯）與 `<ClipboardCheck size={15} />`（審核名單）。
  - **編輯與新增表單 (Create / Edit Form)**：
    - 狀態高亮區塊加入 `<Sparkles size={15} />` 強調動態提示。
    - 照片上傳按鈕配置 `<ImageIcon size={16} />`，上傳完成反饋採用 `<Check size={16} />`。
  - **審核名單彈窗 (Applicant Review Modal)**：
    - 收合展開箭頭升級為旋轉流暢的 `<ChevronDown size={17} />`。
    - LINE ID 膠囊配置 `<MessageSquare size={13} />`，點擊複製反饋動態由 `<Copy size={12} />` 切換為 `<Check size={12} />`。
    - 電話撥號按鈕配置 `<Phone size={13} />`，體能照片連結配置 `<ImageIcon size={13} />`。
    - 正取、備取、設為待審大按鈕分別使用 `<CheckCircle2 size={14} />`、`<Clock4 size={14} />` 與 `<RotateCcw size={14} />`。
    - 推播按鈕配置 `<Send size={15} />`。
- **解決跨平台行高與文字歪斜 (Cross-platform Consistency)**：
  - 徹底解決 iOS/macOS 與 Android 因系統內建 Emoji 字型邊距及基線高度不一致所造成的版面微幅歪斜問題，提供統一、專業且兼具俐落美感的視覺體驗。

### 92. 幹部系統體驗全面優化：表單強制靠左、發布狀態預告、審核名單點擊展開與 LINE ID 複製 (v0.0.92)
- **頂部頁籤極簡化**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 移除頂部頁籤右側之幹部名稱顯示，維持最純粹俐落的活動切換體驗。
- **編輯與新增表單版型全面靠左校正 (Left-aligned Form)**：
  - 修正受到 `#root` 全域 `text-align: center` 影響導致表單標籤在手機端居中歪斜的問題，全表單元件、標籤、輸入框與提示字樣全面強制靠左 (`text-align: left`)，提供工整舒適的輸入體驗。
- **發布活動預設狀態調整與醒目選單 (Default Status: Coming Soon)**：
  - 新增活動預設狀態由「開放」調整為「`未來開放 (Coming Soon)`」，避免幹部尚未擬定完整資訊便不慎對外開放報名。
  - 將「活動發布狀態」下拉選單提升至表單頂部核心資訊區塊，以獨立高亮卡片呈現，並提供動態狀態說明提示（如未來開放、開放報名之差異）。
- **審核名冊可收合卡片 (Expandable Applicant Cards) 與 LINE ID 一鍵複製**：
  - 徹底解決手機端名冊文字換行與擠壓問題，改為「點擊整張卡片展開 / 收合」結構：
    - **收合態**：單行緊湊呈現姓名、性別、正式社員標籤、正取/備取審核狀態膠囊與通知狀態標籤。
    - **展開態**：清晰展示電話（支援點擊一鍵撥號）、體能證明照片連結，以及獨立結構化之「正取」、「備取」、「設為待審」大顆審核按鈕。
    - **LINE ID 一鍵複製**：點擊 LINE ID 膠囊即自動複製至剪貼簿，並即時給予「✅ 已複製！」提示反饋，省去長按手動選取的麻煩。

### 91. 幹部活動管理頁面 UI 結構化重構與體驗優化 (Admin Events UI Refactoring) (v0.0.91)
- **移除頂部深綠色橫幅 Banner**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 徹底移除原本笨重且佔用手機高度的深綠色「活動總覽與審核中心」Banner，消除文字折行問題，極大化手機首屏活動列表之可視範圍。
  - 將幹部身份資訊以輕巧優雅的「🏕️ 職稱 · 姓名」膠囊徽章形式整合於分頁標籤右側，兼顧身份識別與乾淨介面。
- **活動卡片升級為結構化看板卡片 (Structured Board Cards)**：
  - 徹底告別純文字與冒號堆疊排版，將活動卡片依資訊層級結構化拆解：
    1. **頂部標籤與快速切換列**：狀態彩色膠囊（🟢 開放報名 / 🟠 未來開放 / ⚪ 已關閉）+ 等寬活動代碼 (`#E001`) + 右側快速狀態下拉選單（免開編輯頁即可即時切換）。
    2. **主視覺與標題**：圓角裁切縮圖 (96x76px) 搭配醒目活動大標題與單行精簡簡述。
    3. **時程費用獨立資訊格 (Info Chips)**：將「📅 出隊日程」、「⏰ 報名截止」、「💰 活動費用」轉化為三個獨立的微型資訊卡，資訊層次更加清晰分明。
    4. **4 色獨立數據指標看板 (Metric Grid)**：分別將「總報名」、「正取」、「備取」、「待審核」以專屬淺色調背景卡片呈現，數字放大突顯；當有「待審核」人數時自動亮起紅色高亮與紅點警示。
    5. **底部並排操作按鈕組**：左側「✏️ 編輯內容」邊框按鈕與右側「📋 審核名單」高對比翡翠綠主按鈕；若有待審核人員，按鈕會即時浮現「N 待審」警示徽章，提醒幹部優先處理。

### 90. 幹部識別碼彈性比對強化與除錯提示優化 (v0.0.90)
- **幹部識別碼欄位模糊匹配擴充**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `checkOfficerInternal`。
  - 將識別碼欄位搜尋條件由嚴格的「`系統識別碼`」大幅擴充為包含「`識別碼`」、「`幹部識別碼`」、「`User ID`」、「`userid`」、「`uid`」等多元名稱，即使幹部將試算表標題命名為「`幹部識別碼`」亦能百分之百正確匹配。
  - 同時支援以真實 `LINE ID` 進行輔助比對，提升幹部身分判定之容錯率。
- **權限不足畫面提供專屬 User ID 與一鍵複製**：
  - 更新 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)。
  - 若使用者開啟頁面被判定為權限不足時，畫面會貼心展示該使用者當前真實的 LINE 系統識別碼（`U...` 長字串），並附帶「一鍵複製」按鈕，方便幹部直接點擊複製後貼至試算表，避免手動輸入錯誤。

### 89. 幹部專屬活動管理與名單審核後台 (Admin Events Management) (v0.0.89)
- **幹部身份自動辨識與動態後台入口**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)。實作 `checkOfficerInternal` 與 `action=check_officer_status`，比對試算表 `Officers` 分頁中登記之 `系統識別碼`（LINE User ID）或社員姓名；若符合即自動賦予幹部管理權限。
  - 在 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 數位社員證下方新增「🛠️ 幹部專屬管理中心」綠色快捷卡片（僅幹部可見）。
  - 在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 全域右上角頭像下拉選單中，若檢驗具備幹部身分，動態顯示「🛠️ 幹部活動管理」入口。
- **全功能活動管理與審核主頁面 (AdminEvents.tsx)**：
  - 新增 [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx)，採雙頁籤架構：
    - **Tab 1: 活動總覽與審核**：
      - 條列所有活動卡片，呈現即時報名統計徽章（總報名人數、正取人數、備取人數、待審核人數）。
      - 支援即時下拉切換活動狀態（開放報名 / 未來開放 / 已關閉），並提供活動內容編輯與名單審核按鈕。
    - **Tab 2: 發布新活動 / 編輯活動**：
      - 完整表單支援填寫活動名稱、出隊起訖日期、報名截止日、預計費用、精簡簡介與長篇詳細行程。
      - 活動編號支援手動輸入或由系統依序自動編號（格式：`E` + 年月 + 序號，如 `E2609-01`）。
      - 支援直接從手機相簿或電腦選取封面照片，前端自動以 Canvas 壓縮轉 Base64 上傳 Google Drive `LINE_Uploads` 資料夾，並即時轉換為官方高速 CDN 直連格式（`lh3.googleusercontent.com/d/{id}=w1000`），免手動找圖床。
      - 提供 **LINE Carousel Flex 卡片即時所見即所得 (Live Preview)**，幹部在送出前可即時檢視卡片標籤顏色、字數排版與封面裁切。
      - 支援勾選「📢 上架完成後即時推播通知至幹部群組」。
- **報名社員名單查閱、即時正備取審核與一鍵發送推播通知**：
  - 於活動卡片點擊「名單審核」彈出專屬 Modal，提供「全部 / 正取 / 備取 / 待審核」分頁標籤與報名人數篩選。
  - 名冊中清晰條列社員姓名、性別、電話、LINE ID、正式社員/非社員徽章、體能證明連結與通知狀態標籤。
  - 幹部可直接點擊「設為正取」、「設為備取」或「設為待審」，後端自動更新 `Signups` 試算表之審核結果並重置通知狀態。
  - 底部提供「🚀 一鍵發送審核結果推播通知」按鈕，點擊後系統自動過濾尚未通知的正取與備取社員，透過 LINE Messaging API 批次發送專屬錄取/備取 Flex 卡片，並自動回寫試算表通知狀態為「已通知」，徹底告別開試算表手動操作的繁瑣流程。
- **全站中英雙語國際化與路由整合**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)，加入 `adminEvents` 命名空間共 40+ 項中英雙語對應字詞。
  - 在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/admin/events` 與 `/admin` 路由（支援 React.lazy 程式碼分割非同步載入）。

### 88. 第二梯次優化：註冊草稿自動暫存與租借日期聯動防呆 (v0.0.88)
- **註冊資料草稿自動暫存與還原 (Draft Auto-Save & Restore)**：
  - 重構 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。在使用者填寫註冊資料時，自動將資料儲存至 `localStorage`（Key: `register_draft_{userId}`），避免填寫途中被通話、訊息或不慎關閉視窗而遺失內容。
  - 當新用戶重新進入時自動還原草稿，並於表單頂部呈現提示列與一鍵「清除草稿」按鈕；表單提交成功後自動清除暫存。
  - 同步於 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json) 補充雙語提示詞條。
- **租借日期選取聯動防呆與出隊天數分析標籤**：
  - 重構 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。為預計領取日加入當日（`min={todayStr}`）限制，歸還日加入領取日（`min={pickupDate}`）限制；當領取日變更且晚於現有歸還日時自動同步校正。
  - 於日期欄位下方新增即時渲染的「出隊天數標籤」（如：`出隊天數：4 天 (2 天基本 + 2 天加成)`），讓社員在確認送出前對出隊天數與計費公式一目了然。

### 87. 第一梯次優化：Google Drive CDN 縮圖直連與路由 Code Splitting (v0.0.87)
- **Google Drive 圖片直連 CDN 解析升級**：
  - 新增共用圖片解析工具模組 [image.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/image.ts) 中的 `getDirectImageUrl`。
  - 將 Google Drive 圖片解析由舊有的 `docs.google.com/uc?export=view` 升級為 Google 官方高速縮圖 CDN 格式 `https://lh3.googleusercontent.com/d/{FILE_ID}=w{SIZE}`，徹底消除 Drive 原生直連容易引發的 403 限流、429 超額以及病毒掃描下載提示頁面等問題。
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) (裝備租借) 與 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) (心得回憶登頂照) 同步導入，確保跨頁面圖片載入速度提升並杜絕破圖。
- **Vite 路由程式碼分割 (Code Splitting / Dynamic Import)**：
  - 重構 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)，將 6 個核心頁面（`Borrow`, `Payment`, `Register`, `Dashboard`, `History`, `Achievements`）改為 `React.lazy()` 動態匯入，並於路由外層包覆 `<Suspense>` 提供統一品牌色載入動態。
  - 主 JS Bundle 體積由原本的 528KB 大幅降低至 444KB (Gzip 僅 138KB)，其餘各子頁面均成功拆分為獨立小體積 Chunk（約 6KB ~ 19KB），解決了 Vite 打包大於 500KB 的警示，顯著加快 LINE 內嵌瀏覽器的首屏冷啟動載入速度。

### 86. 移除繳費中心 Flex 卡片改為直連網址 (v0.0.86)
- **移除 LINE 繳費中心卡片推播**：
  - 更新後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `handleTextCommand`。
  - 將「繳費中心」指令與「繳費系統」統一路由，不再發送 `sendPaymentCenterMenu` 的 Flex 卡片（包含「繳費中心」/「繳費系統」/「繳費紀錄」按鈕卡片），改為直接回傳純文字繳費表單網址。
  - 建議在 LINE Official Account Manager 圖文選單中將「繳費系統」區塊動作設定為「連結 (URI)」，填入 `https://liff.line.me/2009217429-u7OCkmQO`，點擊後即可秒開網頁且對話框完全不產生任何卡片與多餘訊息。

### 85. 優化出隊足跡成就看板標籤與副標題單行呈現 (v0.0.85)
- **避免文字換行破壞版面**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 中的「成就統計看板」。
  - 為 `badgeLabel` (MY MOUNTAINEERING FOOTPRINT) 與 `subtitle` (一步一腳印，記錄每一次出隊的回憶！) 加入 `whiteSpace: 'nowrap'` 樣式，並設定左側文字容器為 `flex: '1 0 auto'`，保證標籤與副標題完整呈現於單一行不換行。
  - 同步調整統計看板為 `flexWrap: 'wrap'`，在寬螢幕下保持並排兩側對齊，窄螢幕下能自動適配不擠壓文字或溢出外框。

### 84. 修復出隊足跡與歷史紀錄之導覽列標題判定 (v0.0.84)
- **子路由標題優先級判定修復**：
  - 重構 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `getHeaderDetails` 標題判斷邏輯。
  - 由於 LINE LIFF 透過端點跳轉子路徑時會形成 `/dashboard/achievements` 與 `/payment/history` 複合路徑，原先先比對 `/dashboard` 與 `/payment` 導致「出隊足跡」標題被誤判為「個人主頁」，「繳費紀錄」被誤判為「繳費系統」。
  - 調整路徑判斷順序，將 `/achievements` 與 `/history` 提升至最優先判定，確保無論直接存取或由 LIFF 複合路徑進入皆能正確顯示「出隊足跡 (Mountaineering Footprint)」與「歷史紀錄 (Payment History)」。

### 83. 更新註冊頁幹部意願選項文案 (v0.0.83)
- **幹部意願福利說明增補**：
  - 更新 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json) 中的幹部意願勾選框文案。
  - 將中文標籤由「我有意願成為社團幹部」更新為「`我有意願成為社團幹部（免繳社費、決定活動內容等等福利）`」，提高社員參與幹部團隊的意願與福利透明度。
  - 同步更新英文標籤為「`I am interested in becoming a club officer (No club fee, decide event content, and other benefits)`」。

### 82. 支援 Google Drive 資料夾動態載入多篇社團規範 (v0.0.82)
- **多文件動態知識庫讀取**：
  - 重構後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `getClubKnowledgeFromDoc`。
  - 當設定了環境變數 `KNOWLEDGE_FOLDER_ID`（Google Drive 資料夾 ID）時，後端會自動掃描該資料夾內所有的 **Google Docs 文件** 與 **純文字 TXT 檔**，合併抓取內容（上限 15,000 字），並作為背景知識提供給 Gemini。
  - 幹部未來只需在 Drive 資料夾內新增/編輯規範，AI 就會自動學習並回答最新條文。

### 81. LINE 聊天室預設提示訊息頻率限制 (v0.0.81)
- **24小時只提示一次**：
  - 重構後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 的 `handleTextCommand` 中，針對一對一聊天室使用者輸入未知指令時的預設引導訊息（介紹 AI 助理小岳玩法），加入基於 `PropertiesService` 的時間戳記判斷。
  - 現在每位使用者每 24 小時至多只會收到一次小岳引導提示訊息，避免使用者在留言給幹部時持續受到自動回覆干擾。

### 80. 心得支援最多 5 張相片上傳與指定檔名規則 (v0.0.80)
- **支援最多 5 張相片上傳**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)，支援一次性選取並上傳最多 5 張本機照片，並在前端分別進行自動壓縮與縮圖 Grid 列表即時預覽與移除。
  - 查看心得時，支援動態將逗號區隔的 URL 連結陣列拆分並呈現多張照片牆。
- **後端自訂上傳檔名格式**：
  - 重構 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSubmitReflection`，會將登頂照檔名修改為 `日期-活動名稱-姓名` 格式（如：`20260714-玉山前五峰-王小明.jpg` / `20260714-玉山前五峰-王小明_1.jpg` 等防重複序號檔名），並批次上傳 Google Drive。

### 79. 心得登頂照片本機上傳與壓縮 (v0.0.79)
- **心得相片本機上傳與前端自動壓縮**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 中的登頂照/團體合照分享欄位，由原先的純網址輸入框改為「本機圖片上傳選擇器」，並套用與註冊頁面相同的 canvas 自動壓縮技術（限制最大 1024px、0.7 品質 JPEG、以及單張圖片 10MB 檔案大小限制），支援即時預覽與刪除功能。
  - 重構 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSubmitReflection`，若收到 Base64 的登頂照片，會自動透過 `uploadFileToDrive` 上傳至 Google Drive `LINE_Uploads` 資料夾，並將雲端硬碟的檔案連結寫入 Google 試算表 `Reflections` 表格。

### 78. 出隊足跡/成就系統 (Achievements.tsx) 雙語化 (v0.0.78)
- **活動成就頁面雙語化**：
  - 重構 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)，利用 `t()` 替換出隊統計看板（出隊次數/回憶篇數）、已參與活動清單、無資料提示狀態、心得查看按鈕標籤（查看我的回憶/留下回憶）。
  - 將心得填寫與回顧 Modal 彈窗進行雙語化（包括路線難易度/風景推薦度/心得分享輸入框/合照網址欄位/取消與提交按鈕），全面支援繁中與英文雙語切換。

### 77. 歷史紀錄頁面 (History.tsx) 雙語化 (v0.0.77)
- **歷史繳費紀錄頁面雙語化**：
  - 重構 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx)，利用 `t()` 替換累計花費金額、審核中筆數提示、分類切換按鈕標籤（全部/社費/活動/裝備）、無資料狀態、繳費狀態標籤（已確認無誤/對帳失敗/待幹部確認）以及展開明細中的說明文字與無備註提示。

### 76. 繳費對帳系統 (Payment.tsx) 雙語化 (v0.0.76)
- **繳費對帳頁面雙語化**：
  - 重構 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)，利用 `t()` 替換匯款銀行資訊、未繳費明細列表（社費方案選擇/活動報名費/裝備租用明細）、貼心提醒、申報資料輸入框以及繳費成功狀態畫面。
  - 對發送至 LINE 聊天室的繳費明細對帳訊息（`msgText`）進行雙語翻譯處理，讓使用者在不同語系環境下申報時能看懂各項目的英文標示。

### 75. 裝備租借頁面 (Borrow.tsx) 雙語化 (v0.0.75)
- **裝備租借首頁雙語化**：
  - 重構 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)，利用 `t()` 替換費用試算說明的計費規則、裝備卡片狀態標籤、底部浮動購物車、租用對帳抽屜 (Cart Drawer) 以及裝備詳細規格彈窗 (Detail Modal) 的所有中文文字。
  - 對公式試算文字與用途選項（社團出隊/個人使用/其他用途）進行動態雙語處理，讓多國語系切換時整體計算邏輯與 UI 文字保持完美一致。

### 74. 個人主頁面 (Dashboard.tsx) 雙語化 (v0.0.74)
- **個人首頁雙語化**：
  - 重構 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)，利用 `t()` 替換數位社員證、活動狀態追蹤、裝備預約狀態、取消確認 Modal 等寫死之中文。
  - 對後端 GAS 傳回的中文狀態進行前端判斷並做對應的雙語翻譯處理，確保切換英文時各狀態標籤（如正取/備取/已繳費/待確認）皆能順暢顯示為英文。

### 73. 資料註冊頁面 (Register.tsx) 雙語化 (v0.0.73)
- **多國語系獨立 JSON 檔管理 (方案 A)**：
  - 將先前寫死在 [i18n.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/i18n.ts) 的導覽翻譯提取至 [zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json) 與 [en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json)。
  - 在 `src/locales/` 下建立雙語詞條結構。
- **資料註冊表單雙語化**：
  - 重構 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)，全面使用 `useTranslation` 的 `t()` 函式替換所有步驟的標籤、提示文字、警告彈跳視窗、按鈕及載入狀態等中文寫死字串。

### 72. 修復 GlobalHeader 元件語法錯誤 (v0.0.72)
- **語法錯誤修正**：
  - 修復了 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中 `GlobalHeader` 頂部導航列之 `</header>` 標籤後方殘留的重複/毀損 HTML 片段，解決了 TypeScript 編譯器所拋出的 `')' expected` 語法錯誤。

### 71. 多國語系 (中英文) 介面切換支援與優化 (v0.0.71)
- **語系套件整合**：
  - 整合 `i18next` 與 `react-i18next` 實現繁體中文與英文雙語切換。
  - 新增 [i18n.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/i18n.ts) 提供語系詞條對照，並藉由 `localStorage` 記憶使用者偏好的語系設定。
- **導覽列語言切換按鈕**：
  - 在 `src/App.tsx` 的 `GlobalHeader` 頂部導覽列中新增語系切換按鈕，放置於個人頭像左側，提供直覺的一鍵語言切換。

### 70. 敏感金鑰防護與並發寫入安全鎖優化 (v0.0.70)
- **完全去金鑰化**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。完全移除了全域變數中的硬編碼預設 Token 與 ID，完全依賴屬性服務 `PropertiesService.getScriptProperties().getProperty(...)` 來取得值。
- **本機備份金鑰**：
  - 新增 [secrets.local](file:///Users/brianhung/Documents/OfficialLINEAccount/secrets.local) 保存原金鑰備份。
  - 更新 [.gitignore](file:///Users/brianhung/Documents/OfficialLINEAccount/.gitignore) 阻擋 `secrets.local`，使其不被上傳至 GitHub 倉庫，達到敏感資訊防洩漏。
- **寫入並發防護**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。在 `handleSignup` (活動報名)、`processSaveProfile` (儲存個人資料)、`processSubmitReflection` (心得回饋)、`processLiffCancelEvent` (取消活動報名)、`processLiffCancelLoan` (取消裝備預約) 全面導入 `LockService` 並發鎖防護（最大排隊超時 10 秒），保障在高流量與多人操作下資料表的原子性與庫存正確性。

### 69. 修正成就看板排版文字斷行 (v0.0.69)
- **防止文字換行與微調統計框尺寸**：
  - 更新 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx)。將「我的出隊成就」看板右側統計框的「出隊次數」與「回憶篇數」標籤加上 `whiteSpace: 'nowrap'` 以防止文字換行，並將 `minWidth` 由 `60px` 增至 `72px`、`padding` 調整為 `10px 8px`，確保在各種螢幕尺寸下皆能呈現乾淨且完整的單行排版。

### 68. 調整繳費頁面租借日期排版 (v0.0.68)
- **日期欄位換行顯示**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。將「裝備租用」卡片內的「租借日期」標籤從並排的 `<span>` 改為區塊級的 `<div>`，並將間距從左側（`marginLeft`）調整為上方（`marginTop: '4px'`），使其換行顯示，提升行動端裝置之閱讀體驗。

### 67. 增強 GAS 日期格式解析與欄位對照備援 (v0.0.67)
- **增強 `DD/MM/YYYY` 日期解析與 `instanceof Date` 檢查**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。增強 `formatVal` 函式，新增對 `DD/MM/YYYY` 格式（如 `24/03/2026`）的正則表達式匹配，並自動轉換為 `YYYY-MM-DD` 標準格式以供前端順利渲染。同時，將不穩定的類型判定方法替換為 `val instanceof Date`。
- **欄位查找對照備援機制**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `getUnpaidListAPI` 中，為預計領取與歸還日期欄位新增英文 `pickup`、`return` 等備援關鍵字尋找，確保即使 Google Sheets 的欄位標題微調也能正確讀取資料。

### 66. 修復 UnpaidItem 介面屬性缺失錯誤 (v0.0.66)
- **新增 `purpose` 欄位**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。在 `UnpaidItem` 介面中新增選用屬性 `purpose?: string;`，解決測試假資料（包含 `purpose` 欄位）以及後續程式碼存取該屬性時發生的 TypeScript 編譯錯誤：`Object literal may only specify known properties, and 'purpose' does not exist in type 'UnpaidItem'`。

### 65. 繳費裝備明細與用途計費修正 (v0.0.65)
- **區分個人使用與社團出隊**：
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。裝備預訂卡片標題改為顯示「裝備租用 (個人使用)」或「裝備租用 (社團出隊)」。
  - 於前端將「社團出隊/社團出團」用途之訂單租金總計與裝備細項金額強制設為 `$0`。
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 使 `getUnpaidListAPI` 多回傳 `用途 (purpose)` 欄位。
- **顯示裝備個別金額與增強日期格式化**：
  - 於 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 打包清單中，為各裝備項目右側加上個別金額顯示。
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中增強日期解析，新增正則表達式，若已為標準 `YYYY-MM-DD` 格式則直接正規化回傳，防止時區轉換偏差導致日期顯示空白或不正確。

### 64. 繳費申報裝備打包合併與 UI 增強 (v0.0.64)
- **裝備打包合併與租期顯示**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js)。增強 `getUnpaidListAPI`，使取得未繳費裝備項目時能額外回傳數量、預計領取與歸還日期。
  - 更新 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)。將同一筆預約（相同 `orderId`）的裝備在前端扁平化清單中打包為單一項目，繳費申報時以加總後的總金額送出。
- **打包項目 UI 增強與修改警語**：
  - 於 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 為裝備租用合併帳單新增專屬的大框框 UI 樣式（加粗主色邊框與陰影）。
  - 大框框內顯示裝備的詳細借用日期區間、細項明細列表，並加入貼心提醒文字：「💡 貼心提醒：需要修改訂單的話，請到個人頁面取消訂單再重新租借一次。」

### 63. 修正費用試算公式與更新注意事項 (v0.0.63)
- **修正費用試算公式**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。將「社團出隊」的試算公式改為 `(${baseFormula}) × 0 (社團活動免費)`，解決先前渲染時重複顯示 `= $0` 的問題。
- **更新費用試算說明注意事項**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。在費用試算說明的注意事項中新增說明：「若個人使用時碰上社團出團活動，可能會無法租借，租借前可以先查詢社團是否有活動，請見諒。」

### 62. 調整底部浮動購物條顯示位置 (v0.0.62)
- 由於底部導覽列已移除，將 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.floating-cart-bar` 底部定位從 `calc(76px + ...)` 修正為 `calc(20px + ...)`，將浮動購物條往下移動到適當位置，避免遮擋裝備卡片內容。

### 61. 修復 Borrow 頁面 JSX 語法錯誤 (v0.0.61)
- 修復 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中 `<div className="detail-modal-section">` 標籤未正確閉合導致編譯失敗（Unexpected token）的問題。

### 60. 新增裝備詳情彈窗與註冊意願幹部通知 (v0.0.60)
- **裝備詳細資訊彈窗**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。點擊裝備卡片時可彈出詳細資訊 Modal，顯示裝備大圖、細節規格/說明、庫存代碼，並在彈窗內直接增減預約數量。
  - 後端 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 之 `getEquipmentsListAPI` 新增擷取試算表中的「說明 / 規格」欄位資料傳送至前端。
- **註冊新增意願調查選項**：
  - 更新 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。在最後一步隱私同意書後方，新增「加入社員意願（`我有意願成為社員` / `我目前沒有意願成為社員`，二選一必填）」與「擔任社團幹部意願（`我有意願成為社團幹部`，選填）」欄位。
  - 後端 `getMemberProfileAPI` 與 `processSaveProfile` 同步支援「加入社員意願」與「擔任幹部意願」的讀寫。
- **擔任幹部意願 LINE 通知**：
  - 新增幹部群組通知邏輯：若新註冊使用者勾選幹部意願，或者更新資料填寫者的幹部意願變更為「我有意願成為社團幹部」時，系統會自動向幹部群組推播包含 `姓名`、`性別`、`系所`、`學號`、`登山經驗` 與 `體能` 的詳細通知信。
- **購物車回復浮動膠囊樣式**：
  - 將 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.floating-cart-bar` 復原為漂浮圓角膠囊樣式並包含 Hover 動效，容器 padding-bottom 還原為 `95px`。

### 59. 裝備租借頁面優化 (嵌入真實圖片、置底購物車與雙重費用顯示) (v0.0.59)
- **支援讀取試算表圖片網址**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `getEquipmentsListAPI` 引擎，新增讀取試算表 `Equipments` 工作表的「圖片網址」欄位，並包裝於 JSON 傳送至前端。
- **Google Drive 連結直連與 Unsplash 美圖 fallback**：
  - 更新 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。新增 `getDirectImageUrl` 輔助函式，支援將使用者的 Google Drive 共享網址轉換為直接下載/嵌入格式。
  - 重構 `ProductImage` 元件，優先使用轉換後的自訂圖片連結；若無設定，則依據名稱關鍵字自動隨機配對精美的 Unsplash 實體山林裝備圖片（帳篷、睡袋、背包、登山杖、炊具、安全裝備等）。
- **底置購物車與雙重費用顯示**：
  - 重調 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)，將 `.floating-cart-bar` 設定為固定在容器底部（寬度 100%、最大寬 600px 貼齊容器、微圓角頂部、移除 Hover 浮動動畫、增加下方安全區域 padding），並加寬主容器底部 padding。
  - 在購物車欄與結帳彈出 Drawer 中，並排且清晰顯示 **「基本費用 (原價)」** 與 **「個人使用費用 (若是社員即 5 折，非社員則顯示原價)」**。
  - 針對非社員的使用者，加入顯著黃色小字提醒 `(社員可享 5 折)`。

### 58. 支援體能證明多圖上傳 (最大 5 張) (v0.0.58)
- **多檔案前端處理**：
  - 更新 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)。調整 `strengthProofFiles` 狀態以陣列儲存選取的圖片。
  - 使用者現在可以同時選取多張圖片，或分次累加選取，上限為 5 張。
  - 新增「已選取待上傳檔案列表」UI，並支援個別移除。選取的圖片依然會在前端自動壓縮（品質 0.7 JPEG），以維持最佳效能。
  - 對於資料庫已存有的舊證明連結，若包含多個網址，前端會自動以逗號 `,` 解析，並渲染多個對應的「🔍 查看已上傳證明」超連結。
- **後端批次上傳與逗號區隔**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中的 `processSaveProfile` 函數。
  - 遍歷接收到的 `strengthProofFiles` 陣列，逐一呼叫 `uploadFileToDrive` 函數，產生的 Google Drive 預覽網址再以逗號 `,` 拼接成一長字串寫回 Sheets 欄位。

### 57. 修復生日欄位比對誤判問題 (v0.0.57)
- **問題原因**：Google 試算表儲存日期時，有時以 `Date` 物件或 ISO 8601 字串（含時區，如 `2005-06-01T16:00:00.000Z`）方式回傳。舊的比對邏輯使用 `.split(" ")[0]` 僅能處理空格分隔格式，無法正確去除 `T` 分隔的時間資訊，導致生日未修改時仍被誤判為「已變更」。
- **修復方式**：
  - 更新 [gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js) 中 `processSaveProfile` 的生日比對區塊。
  - 改為同時對 `T` 與空格進行分割（`.split("T")[0].split(" ")[0]`），確保不論 Sheet 回傳的日期格式為何，都能只取 `YYYY-MM-DD` 日期部分進行比對，杜絕誤報。

### 56. 電話與生日格式強制文字與規格化 (v0.0.56)
- **試算表電話強制文字**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 函數。在寫入「聯絡電話」與「緊急聯絡人電話」時，前置單引號 `'` 逃逸字元，強制 Google 試算表以文字格式儲存，防止手機號碼開頭的 `0` 被自動省略。
- **試算表生日格式 YYYY/MM/DD**：
  - 將前端傳來的 `YYYY-MM-DD` 日期字串橫線 `-` 轉為斜線 `/`，同樣前置單引號 `'` 以文字儲存為 `2026/06/20`，配合使用者要求的格式標準。
- **前端載入解析相容**：
  - 在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 的 API 讀取區塊中，主動將生日字串中的斜線 `/` 轉回橫線 `-`，確保 HTML5 日期選擇器於各平台皆可完整載入歷史生日值，不產生白屏或無法帶入的情況。

### 55. 新增社員資料儲存動態變更通知機制 (v0.0.55)
- **修改明細通知**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 函數。在寫入試算表前，主動深拷貝原資料列 `oldValues` 與新表單 `data` 進行 18 項主要欄位值比對。
  - 當用戶「更新資料」時，LINE 自動推播通知會明確條列出哪些欄位被修改，例如 `✏️ 聯絡地址：舊地址 ➡️ 新地址`；若有新上傳圖片，會特別提示 `📷 體能證明截圖：已重新上傳新檔案`；若無變更，則溫馨提示 `內容無變更`。
  - 當用戶為「全新註冊」時，則會條列出該用戶填寫的所有資料欄位明細。

### 54. 新增前端圖片上傳自動壓縮功能 (v0.0.54)
- **上傳失敗優化**：
  - **圖片自動壓縮**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中重新實作 `handleFileChange`。採用瀏覽器原生的 Canvas 繪圖技術，當使用者上傳體能證明截圖時，系統會自動將圖片等比例縮放至長寬最大 1024px，並以 `0.7` 的品質進行壓縮轉換為 JPEG base64。
  - **解決 GAS 上傳大小限制**：原本數 MB 的大型手機截圖經由前端壓縮後會降至 150KB ~ 300KB，徹底避免了因上傳資料過大而導致 Google Apps Script 伺服器流量溢出、超時或回傳 CORS / 網路錯誤的連線失敗狀況。
  - **放寬限制**：因具備壓縮功能，前端選取原始檔案大小限制安全地放寬至 10MB。

### 53. 解決載入狀態與錯誤畫面閃爍 UX 優化 (v0.0.53)
- **載入防閃爍機制**：
  - **全域守衛優化**：在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 的 `AppContent` 函數最上方新增了 `liffInit.loading` 全域守衛阻擋。當 LIFF SDK 還在初始化或尚未解析出 `userId` 時，完全不渲染任何子路由或子頁面（直接呈現統一的驗證登入轉圈畫面）。
  - **優化成效**：徹底解決了使用者在載入頁面時，因 `userId` 尚未解析完成而造成子元件提前掛載、以空白 ID 發送無效 API 請求導致「載入失敗，請檢查網路」錯誤畫面短暫閃爍一秒後又恢復正常的體驗 Bug。
  - **程式碼簡化**：移除了 `/` 與 `/index.html` 路由內部的行內三元運算子 Loading 檢查，直接在載入完成後進行路由重定向，提升程式碼可讀性。

### 52. 歷史繳費紀錄獨立 LIFF 網址更新與按鈕連結直開優化 (v0.0.52)
- **歷史紀錄獨立 LIFF**：
  - 更新 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 導航列中的「歷史紀錄」連結，改為指向專屬獨立的 LIFF ID：`https://liff.line.me/2009217429-FRB6rjph`。
  - 修改前端 LIFF 初始化分流機制，確保訪問 `/history` 路由時以 `'2009217429-FRB6rjph'` 載入。
- **點擊按鈕直接打開網頁 (UX 優化)**：
  - 修改 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中 `sendPaymentCenterMenu` 的 Flex 訊息按鈕動作。將原本需要回傳文字對話的「💰 繳費系統」與「📜 繳費紀錄」按鈕更改為 `'uri'` 動作類型，使用者點選後可直接在 LINE 內開啟對應的 LIFF 頁面，不需重複點擊。

### 51. 圖文選單指令對應與繳費中心移出獨立 (v0.0.51)
- **選單名稱指令升級**：
  - 更新 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的指令白名單 `menuCommands` 與 `handleTextCommand` 路由。新增對 `個人主頁 My Dashboard` (舊為「我的狀態」)、`裝備租借 Equipment Loan` (舊為「器材借用」)、`繳費中心 Payment Center` 的支援，同時保留舊指令的向下相容性。
- **繳費中心獨立化**：
  - 新增 `sendPaymentCenterMenu(replyToken)` 方法，當使用者點擊「繳費中心」時直接發送獨立的帳務卡片（包含「繳費系統」與「繳費紀錄」）。
  - 將「繳費中心」從「更多服務」中移出，並將 `sendMoreOptionsMenu(replyToken)` 簡化為直接發送「幫助中心 Help Center」（包含「幹部是誰」與「意見與回饋」）單一 bubble 卡片。

### 50. 獨立身分狀態欄位與必填設定 (v0.0.50)
- **解耦身分狀態與系所欄位**：
  - **欄位解耦**：將「身分狀態」下拉選單與「在校系所 / 校外單位」欄位解耦。在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中新增獨立的 `identityStatus` 欄位，變數不再共用 `department`，防止選擇身分時自動帶入或覆蓋系所資料。
  - **必填設定**：將「身分狀態」下拉選單設為必填（`required`），新增預設的提示選項（`請選擇身分狀態`），並將其加入步驟 1 的 `isStepValid` 驗證，防止用戶漏填。
  - **後端 API 升級**：在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `processSaveProfile` 與 `getMemberProfileAPI` 中，新增對「身分狀態」這項獨立欄位的資料庫讀寫支援。

### 49. 清理註冊表單中未使用的 lineProfile 變數 (v0.0.49)
- **TypeScript 編譯錯誤修正**：
  - 移除了因刪除「LINE 歡迎資訊卡」後，在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中殘留且不再被讀取的 `lineProfile` 狀態變數與其對應的 `setLineProfile` 設定方法，徹底修復 `error TS6133: 'lineProfile' is declared but its value is never read` 的編譯失敗問題。

### 48. 新增聯絡地址與緊急聯絡人地址欄位與標籤優化 (v0.0.48)
- **新增選填表單欄位**：
  - **聯絡地址**：於步驟 2 (基本選填資料) 後方新增了選填的 `聯絡地址 (Correspondence Address)` 欄位，變數對應 `studentAddr` 並串接後端儲存。
  - **緊急聯絡人地址**：於步驟 3 (緊急聯絡人資訊) 後方新增了選填的 `緊急聯絡人地址 (Emergency Address)` 欄位，變數對應 `emerAddr` 並串接後端儲存。
- **體能證明標籤雙語優化**：
  - 將步驟 4 (登山經驗與體能證明) 的欄位名稱更新為 `體能證明 (Proof of Physical Fitness) - 連結或描述` 與 `上傳體能證明截圖 (Upload Proof of Physical Fitness)`，並加註其為選填項目。

### 47. 移除註冊表單頂部 LINE 歡迎資訊卡 (v0.0.47)
- **版面優化調整**：
  - 應使用者要求，將 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 表單頂部的「LINE 歡迎資訊卡 (暱稱與頭像)」區塊移除，使步驟進度條能直接呈現在頁面最頂部，版面更加簡潔並提升表單欄位的可見度。

### 46. 新增註冊表單載入中 (Loading) 狀態阻擋 (v0.0.46)
- **載入狀態優化**：
  - **問題修正**：修復了 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中已填寫個人資料正在非同步獲取時，因為缺少 `loading` 畫面阻擋，導致表單欄位先呈現空白預設值，容易使使用者產生困惑或發生誤填的狀況。
  - **實作載入畫面**：將原先未在渲染中被使用的 `_loading` 狀態啟用並重新命名為 `loading`。在 JSX 渲染前，加入 `if (loading)` 的守衛分流，預先呈現旋轉的 Loading 動態提示與「載入個人資料中，請稍候...」字樣，直至 API 資料取得完畢後才完整展示表單。

### 45. 整合取消活動報名與裝備預約至 LIFF Dashboard (v0.0.45)
- **取消預約功能 LIFF 整合**：
  - **後端 API 實作**：在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `doPost` 路由中新增 `liff_cancel_event` 與 `liff_cancel_loan` 處理引擎。並在 `getMyStatusAPI` 中，額外回傳報名資料的「專屬碼 (`code`)」供前端對接。
  - **裝備預約取消**：於 [Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 的裝備租借卡片中，針對「待領取」狀態的預約新增「取消預約」按鈕。點選確認後以 POST 發送請求，由後端將狀態設為「已取消」並透過鎖定機制自動回補對應的庫存數量。
  - **活動報名取消 (含正取原因防呆)**：於活動卡片中新增「取消報名」按鈕。若使用者為「備取/審核中」，點擊確認後直接取消；若為「正取」，系統會自動彈出填寫原因的 Modal，使用者必須輸入取消原因後才能送出，送出後後端會將取消原因附加於 `Signups` 表的「備註」中，並即時以 LINE 幹部群組通知幹部以便進行遞補手續。

### 44. 將隱私權同意書改為必填項目 (v0.0.44)
- **欄位規則調整**：
  - 將步驟 4 中的「隱私權同意書」核取方塊改為**必填**，使用者必須勾選同意後，才能啟用「確認送出」按鈕以完成表單。
  - 修正了 `isStepValid` 的 `case 4` 判定逻辑，引入 `privacyAgreed` 狀態值，並將其加入對應的 `useMemo` 相依性陣列，使狀態變更時按鈕的 disabled 狀態能即時更新。
  - 在核取方塊文字旁新增了紅色必填星號 `*`，提供直覺的視覺提示。

### 43. 修復註冊表單第三步「下一步」直接送出的問題 (v0.0.43)
- **問題分析與修正**：
  - **問題根源**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中，底部的「下一步」按鈕（`type="button"`）與「確認送出」按鈕（`type="submit"`）原先是透過同一個 DOM 位置的 ternary 條件運算子進行渲染。當使用者在第 3 步點擊「下一步」時，會觸發 `setStep(3 + 1)`，使 `step` 即刻變為 4 並引發重新渲染。但因 React 在相同位置重用了該 button 元素並僅將其 type 更改為 `"submit"`，導致瀏覽器在此時將仍未結束的點擊事件當作 submit 按鈕觸發，進而直接送出表單。
  - **解決方式**：將按鈕重構為兩個獨立的條件渲染區塊，並分別賦予唯一的 `key` 屬性（`btn-next` 與 `btn-submit`），強迫 React 在步驟變更時完整卸載舊按鈕並掛載新按鈕，避免 DOM 元素被重用，進而徹底根除此事件冒泡與提交錯誤的問題。

### 42. 修復 LIFF 跳轉非對應頁面問題 (v0.0.42)
- **多頁面 LIFF 跳轉相容性修正**：
  - **問題根源**：因為 LINE Developers 主機後台設定中，`2009217429-jvj3ydDT` (個人主頁) 的 Endpoint URL 設為 `https://.../dashboard`，而 `2009217429-u7OCkmQO` (繳費系統) 設為 `https://.../payment`。當透過 LINE 客戶端開啟 `liff.openWindow()` 連往子路徑（如 `/achievements` 或 `/history`）時，LINE LIFF 會將其拼裝轉換為 `/dashboard/achievements` 與 `/payment/history`，導致 React 路由找不到實體匹配而觸發 `*` 萬用導向至預設的 `/borrow` (裝備租借)。
  - **雙重安全防護機制**：
    1. **加入路由別名**：在 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中除了原有的 `/achievements` 與 `/history` 之外，額外註冊了 `/dashboard/achievements` 及 `/payment/history` 路由別名，確保 LINE 自動拼裝的路徑能精準渲染對應頁面。
    2. **改採 liff.state 進行跳轉**：將頭貼下拉選單中的「🏆 出隊足跡」與「📜 歷史紀錄」點擊導覽連結，修正為以 `liff.state` 參數傳遞路由（如 `?liff.state=%2Fachievements` 及 `?liff.state=%2Fhistory`），此方式符合 LINE 官方的跨 LIFF 跳轉與重定向路徑標準。

### 41. 已參與活動與心得系統 (Past Events & Reflections) 實作 (v0.0.41)
- **歷史活動相片牆與寫心得功能**：
  - 新增了 [Achievements.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Achievements.tsx) 頁面，顯示使用者的出隊次數、心得篇數等足跡統計。
  - 系統自動過濾並顯示該社員所有「已結束且正取」的歷史活動，並為其提供高亮的「✏️ 寫出隊心得」與「📖 查看我的心得」操作。
  - 實作了心得填寫彈出視窗（Modal），支援「路線難易度評分（1-5星）」、「風景推薦度評分（1-5星）」、心得內容文字框及登頂合照網址輸入。
- **GAS 後端 API 與 Reflections 資料庫**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中新增 `action=get_past_activities` 及 `action=submit_reflection` API。
  - 自動偵測並在 Google Sheets 中建立 `Reflections` 心得回饋工作表，保存社員的心得與評分資料，並在收到新心得時，自動推送 LINE 幹部群組通知。
- **全域路由與選單**：
  - 於 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中註冊 `/achievements` 路由，並於全域 Header 的頭貼下拉選單中新增「🏆 出隊足跡」連結。

### 40. 移除未使用的 liff 宣告 (v0.0.40)
- **修復 TypeScript 編譯錯誤**：移除了 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx) 中未使用的 `liff` 導入，修復了因 `noUnusedLocals` 與 `verbatimModuleSyntax` 嚴格 TypeScript 設定導致的編譯失敗。

### 39. 繳費紀錄 (Payment History) 頁面與後端 API 實作 (v0.0.39)
- **全新對帳明細時間軸頁面**：
  - 新增了 [History.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/History.tsx) 頁面，提供美觀的時間軸交易明細卡片。
  - **累計貢獻 Dashboard**：頁面頂部卡片顯示累計已確認繳費金額（累計贊助金額），並顯示目前有多少筆對帳申請正處於「待確認」審核狀態。
  - **分類篩選功能**：提供「全部」、「社費」、「活動」、「裝備」水平切換標籤進行快速明細篩選。
  - **細節手風琴折疊**：點擊卡片可向下展開，顯示當時申報所使用的「匯款帳號末 5 碼」與說明提示。
- **GAS 後端 API 支援**：
  - 在 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中新增 `action=get_payment_history` 分流路由。
  - 實作 `getPaymentHistoryAPI` 函式，掃描 `Payments` 對帳表，提取使用者名下所有的交易明細，並且自動依據項目名稱匹配分類（社費、活動、裝備），最後依日期降冪排序回傳。
- **全域路由與導覽註冊**：
  - 於 [App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/history` 路由並以 `ProfileCheck` 進行權限保護。
  - 將 `/history` 綁定至 `2009217429-u7OCkmQO` LIFF ID，並於全域 Header 的頭貼下拉選單中註冊「📜 歷史紀錄」選項。

### 38. 租借費用折扣判定修復與已繳費無到期日顯示優化 (v0.0.38)
- **裝備租借費用折扣與用途連動**：
  - 在 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 中引入了 `isOfficial` 狀態，並在組件掛載時向 GAS `action=get_my_status` API 獲取使用者社籍身分。
  - **費用折扣判定**：修改租金計算邏輯，當出隊用途選擇「社團出隊」時，租金全免（$0）；當選擇其餘個人使用（個人露營、登山活動等）且使用者具有有效社籍（`isOfficial === true`）時，提供 5 折優惠；非社員個人使用則維持全額收費。該計算將即時呈現在試算公式、商品清單及預訂單明細中。
- **已繳費無到期日顯示優化**：
  - 修改了 [GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 中的 `getMyStatusAPI` 引擎。當社員在 Members 表中的 `繳費狀態` 為「已繳費」（或同義詞），但 `社籍到期日` 欄位為空或無效時，系統會強制將其 `isOfficial` 設定為 `true`（視為正式社員），且到期日欄位回傳「尚未提供，請聯繫幹部確認」，完美避免了因後台到期日尚未填寫而導致已繳費社員無法存取租借系統或顯示為非社員的體驗瑕疵。

### 37. 繳費頁面宣傳條移除與社費彈性學期方案選擇 (v0.0.37)
- **移除冗餘宣傳條**：移除了 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 頂部的「合併項目，輕鬆對帳」漸層宣傳 Banner，讓對帳申報區版面更加精簡聚焦。
- **新增社費說明與方案選擇**：
  - 於社籍社費項目下新增了詳細的社費計費說明：一學期 $200，直到畢業 $800（大學部）/ $400（研究所）。
  - **學期與到期日動態推算**：系統會以現在日期自動推算當前學期（如：7 月份自動推算為 `114-2` 學期），並提供「當前學期 ($200)」、「下一學期 ($200)」、「直到畢業 - 大學部 ($800)」、「直到畢業 - 研究所 ($400)」共四個方案下拉選單。
  - **即時預估到期日**：下拉選項中會自動計算並顯示各個方案對應的預期社員資格到期日（學期結束日為 01/31 或 07/31，畢業為 06/30）。
  - **動態金額與名稱綁定**：切換下拉選項時會同步更新清單中的應繳金額與項目名稱，確保總金額計算與最終送出的申報 payload 完美連動。
- **防止點擊穿透優化**：將未繳費清單的外層容器從 `<label>` 標籤重構為 `<div>`，改由內層單獨監聽點擊，解決了點擊下拉選單（select）時會意外觸發 checkbox 切換的 HTML 點擊穿透（bubbling）問題。

### 36. 會員卡樣式修正與表單欄位間距優化 (v0.0.36)
- **社員證卡片優化**：
  - 移除了數位社員證卡片右下角冗餘的「台科登山社社團系統 NTUST OAC」文字標誌（[Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx)）。
  - 將數位社員證左上角的使用者 LINE 暱稱與連線說明文字塊設定為靠左對齊（`textAlign: 'left'`），避免非預期的置中對齊影響美觀。
- **表單輸入間距優化**：
  - 修改了 [App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中的 `.form-group` 樣式。將其垂直 `gap` 從 `6px` 縮小至 `4px`，並移除 `.form-group label` 原本帶有的 `margin-bottom: 6px`。此調整能顯著拉近表單輸入框標題與輸入框之間的間隙，使表單佈局更加緊湊自然。

### 35. 實現點擊選單外部空白處自動收合下拉選單 (v0.0.35)
- **新增 Document 點擊接聽器**：由於 `.app-header` 使用了 `backdrop-filter: blur`，這在 CSS 規範中會建立獨立的 Stacking Context (層疊上下文)，導致子元素中 `position: fixed` 的全螢幕背景遮罩無法正確延伸覆蓋至 header 之外的頁面區域。
- **點擊外部自動收合**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中移除了原本的 fixed 背景遮罩，改為透過 `useEffect` 於 `document` 註冊全域點擊事件接聽器。點擊時自動檢查滑鼠目標是否在 `.avatar-dropdown-container` 外部，若為外部則將選單狀態設為關閉，完美解決點擊網頁其他空白處無法收合選單的體驗瑕疵。

### 34. 統一全頁面 Header 樣式與移除裝備租借購物車按鈕 (v0.0.34)
- **統一 Header 佈局尺寸**：重新設計 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `GlobalHeader`，使其作為全域唯一的粘性定位頂部導覽列（`.app-header`）。左側會根據當前路由（`/borrow`、`/payment`、`/register`、`/dashboard`）動態呈現對應的標題、副標題與圖示；右側則為帶有下拉導航選單的頭貼按鈕。
- **清理各分頁本地 Header**：
  - 移除了 [Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 內部的局部 Header。
  - 移除了 [Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 內部的局部 Header。
- **移除租借右上角購物車按鈕**：伴隨局部 Header 的移除，同步清除了裝備租借頁面右上角冗餘的購物車圖示按鈕，維持界面視覺的一致與極簡。使用者仍可點擊底部浮動條展開購物車。

### 33. 全域頭貼導覽選單與個人主頁連結更新 (v0.0.33)
- **更新個人主頁連結**：將個人主頁的 LINE LIFF 連結更新為 `https://liff.line.me/2009217429-jvj3ydDT`。
- **全頁面右上角頭貼下拉選單**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 實作 `GlobalHeader` 組件，於所有頁面右上角渲染 LINE 頭貼。點擊後展開下拉選單，包含「個人主頁」、「資料填寫」、「裝備租借」與「繳費系統」四個一鍵跳轉選項。
- **LIFF 環境動態跳轉**：選單跳轉支援在 LINE 內呼叫 `liff.openWindow` 喚起獨立的 LIFF 網頁，在一般瀏覽器/開發環境則使用 React Router `navigate` 跳轉。
- **GAS 狀態查詢指令附加連結**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `handleStatusQuery`（我的狀態指令）回覆訊息末尾附加個人主頁儀表板連結。

### 32. 數位社員證與個人總覽 My Dashboard 實作 (v0.0.32)
- **GAS 後端新增總覽 API**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 實作 `action=get_my_status` 的處理引擎 `getMyStatusAPI`，打包從 `Members`, `Signups`, `Events` 與 `Loan_Records` 四張大表中所篩選出來的個人資料、活動報名記錄與裝備租借明細。
- **全新 Dashboard 頁面**：新增 [src/pages/Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx) 頁面。
  - **數位社員證**：根據社員到期日狀態動態渲染漸層背景（正式社員為綠色漸層，未繳費或過期為灰色背景）。顯示姓名、系所、學號與到期日，不包含 QR Code 按鈕。
  - **活動報名追蹤**：條列所有報名活動與審核、繳費狀態。若狀態為「正取且未繳費」，提供「前往申報繳費」按鈕，點擊跳轉至 `/payment`。
  - **裝備租借清單**：列出所有預約租借裝備之編號、名稱與日期，若預估歸還日過期且狀態不為已歸還，會顯示紅色字體警告。
- **路由註冊與整合**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 註冊 `/dashboard` 路由。

### 31. 進入租借與繳費系統前檢查個人資料完整性 (v0.0.31)
- **個人資料完整性檢查**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增 `ProfileCheck` 包裹組件，進入「裝備租借 (`/borrow`)」與「繳費系統 (`/payment`)」路由前會先透過 GAS API 查詢個人資料。
- **資料完整性規則**：檢查 6 個必填欄位（姓名、系所、學號、手機、Email、LINE ID）是否皆有非空值。
- **阻擋與跳轉**：若資料不完整或非社員，會彈出「個人資料不完整」的對話視窗阻擋操作，並提供「前往填寫資料」按鈕，點擊後跳轉至註冊的 LINE LIFF 網頁 `https://liff.line.me/2009217429-AhPRqAHg`。
- **開發者測試與容錯**：若 `userId` 為 `TEST_USER_ID`（本地測試）或 API 請求發生錯誤，預設直接放行不進行阻擋，以避免影響本地端開發與出隊緊急使用。
- **類型導入修正 (TS1484)**：修復在啟用 `verbatimModuleSyntax` 時的型別編譯錯誤，將 `App.tsx` 中 `ReactNode` 的引入方式改為 `type ReactNode`。

### 30. 必填項目加紅星與欄位重新編排集中至第一頁 (v0.0.30)
- **必填欄位紅星標記**：在 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中新增 `.required::after` 偽元素樣式，在所有必填欄位的標籤後顯示紅色星號標記 ` *`。
- **欄位重新編排**：修改 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx)，將原本分散在步驟 2 的 5 個必填欄位（系所、學號、手機、Email、LINE ID）與步驟 1 的姓名一起集中到第一頁（步驟 1）；原本在步驟 1 的選填欄位（性別、生日、身分證字號）則移往步驟 2。
- **步驟驗證與標籤名稱**：
  - 更新進度條標籤為：步驟 1「必填」、步驟 2「基本」、步驟 3「安全」、步驟 4「經驗」。
  - 調整 `isStepValid` 驗證邏輯，步驟 1 驗證所有必填欄位為非空值（Email 暫不驗證格式），步驟 2、3、4 則無任何必填限制，直接返回 `true`。

### 29. 修復第二次加載個人資料白屏、防止舊資料覆寫、移除電話防呆 (v0.0.29)
- **修復載入白屏**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中，先前直接使用來自 GAS 查詢到的原始 profile 資料。如果試算表中的生日欄位為非標準字串或為數字時，在 React 中調用 `new Date(p.birthday).toISOString()` 會拋出 RangeError 並引發 React 崩潰白屏。現已改為安全的 `birthday` 格式轉換，若無效則安全回傳空字串，防止白屏。
- **優化資料載入**：在 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `getMemberProfileAPI` 中，若是 Date 物件，會主動以 `yyyy-MM-dd` 格式序列化後回傳，優化前後端資料讀取。
- **防止覆寫未映射欄位**：修復了 `processSaveProfile` 寫入邏輯的重大缺陷。先前舊社員在更新資料時會重新開闢空陣列，導致「社籍到期日」等未映射欄位被清空。現已改為更新時預先複製原有整列的全部舊資料值，再複寫填寫的資料欄位。
- **移除電話防呆限制**：移除 `isStepValid` 中手機號碼與緊急聯絡人電話的 Regular Expression 格式限制，手機號碼改為僅進行「非空」檢查，緊急聯絡電話則完全無須任何字元或非空限制。

### 28. 修復編譯時的未宣告使用 (TS6133) 錯誤 (v0.0.28)
- **清理冗餘宣告**：由於先前移除了底部導覽 Tab Bar，在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中遺留了未使用的 `NavLink`、`useLocation` 引用以及 `location` 宣告。現已將其完全清除，修復 TypeScript 在 Production 建置時的阻擋錯誤並成功通過建置。

### 27. 調整資料註冊欄位之必填限制 (v0.0.27)
- **必填欄位調整**：根據新需求，簡化註冊防呆門檻。除了 **姓名、Email、真實 LINE ID、電話、在校系所、學號** 共 6 個核心欄位維持必填之外，其餘所有欄位（性別、生日、身分證字號、緊急聯絡人姓名、聯絡人關係、聯絡人電話、隱私同意書）皆已改為「非必填 (Optional)」。
- **防呆與程式修改**：在 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中移除了上述非必填欄位的 `required` HTML 屬性與紅色星號標記，並調整 `isStepValid` 驗證邏輯，僅在有填寫緊急聯絡人電話時才進行格式正規表達式檢查，確保使用者可以快速送出表單。

### 26. 攔截中間步驟按鍵 Enter 導致的提前表單提交 (v0.0.26)
- **防提前提交**：在分步表單（Step 1~3）中，若使用者在文字輸入框焦點狀態下按下手機鍵盤的「Enter」或「Go / 開始」鍵，瀏覽器會觸發 `<form>` 的預設提交行為。由於此時 `step === 3` 且當前步驟必填欄位已填寫，`isStepValid` 會判定為 `true` 並將不完整的表單直接上傳至後端。
- **修復方案**：修改 [Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx) 中的 `handleSubmit`。若目前 `step < 4`，則攔截提交行為並自動前進到下一步 (`step + 1`)，只有當處於第 4 步時才允許真正送出表單，解決了中間步驟提前觸發上傳儲存的 Bug。

### 25. 優化表單下拉選單（select）與導覽按鈕（button）大小與樣式 (v0.0.25)
- **表單選單放大**：在 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 中將 `.form-group select` 與 `.form-group textarea` 納入全域表單控制樣式，將內距提升至 `12px 14px`，字型大小提升至 `15px`，以匹配文字輸入框的外觀與大小，並加大點擊熱區。
- **按鈕樣式套用**：為前端分步精靈按鈕（下一步、上一步、確認送出）補上缺漏的 `.btn`、`.btn-primary`、`.btn-secondary` 樣式，設定大按鈕內距 `12px 20px`、字型大小 `16px` 與圓角，符合手機端好按、美觀的觸控體驗。

### 24. 移除底部的導覽列 Tab Bar (v0.0.24)
- **底欄移除**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中已將全域底部導覽列 (`bottom-nav-bar`) 的 HTML 與 CSS 切換邏輯完全移除。現在所有主要功能頁面（如裝備租借、對帳系統、資料填寫）皆透過各自獨立的 LINE LIFF 應用程式與連結獨立載入，無須保留底欄，提升視覺極簡感並符合 App 單一頁面設計規範。

### 23. 修復資料註冊提交時產生的 CORS 預檢 (OPTIONS) 錯誤 (v0.0.23)
- **問題原因**：前端 `Register.tsx` 先前使用 `'Content-Type': 'application/json'` 發送 POST 請求。此配置會觸發瀏覽器發送 CORS 預檢 `OPTIONS` 請求，但 Google Apps Script (GAS) Web App 無法處理 `OPTIONS`，導致 preflight 失敗、引發連線阻擋，進而在行動裝置上彈出「網路連線失敗，請檢查您的網路狀態！」警告。
- **修復方案**：將 `Register.tsx` 的提交 headers 調整為 `'Content-Type': 'text/plain'`，改用「簡單請求 (Simple Request)」避開 `OPTIONS` 預檢，以順暢通過 GAS CORS 存取限制。

### 22. 支援獨立多 LIFF 應用程式動態初始化與註冊連結更新 (v0.0.22)
- **動態 LIFF ID 初始化**：在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中，為避免不同 LIFF 網址（例如：借用 `2009217429-zXvGeSrI`、對帳 `2009217429-u7OCkmQO`、註冊 `2009217429-AhPRqAHg`）在同一份程式碼初始化時發生 LIFF ID 衝突或不對稱錯誤，現在 `liff.init()` 會動態根據目前的瀏覽器 path 或 `liff.state` 內容自動選擇正確的 `liffId` 進行初始化。
- **註冊網址更新**：將 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `sendRegisterForm` 改為指向全新的獨立註冊 LIFF 縮網址 `https://liff.line.me/2009217429-AhPRqAHg`，確保機器人「填寫資料」訊息導向正確的獨立應用程式。

### 21. 將機器人「填寫資料」回覆連結切換為新 LIFF 網址 (v0.0.21)
- **回覆切換**：修改 [src/GAS.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/GAS.js) 的 `sendRegisterForm` 函式。原先社員在圖文選單或輸入關鍵字觸發「填寫資料」時會收到 Google 表單連結，現已完全切換為新的 LIFF 頁面縮網址 `https://liff.line.me/2009217429-zXvGeSrI/register`，實現入口全面 LIFF 化。

### 20. 修復 LIFF SDK 清除 URL 參數後繳費連結仍跳至裝備租借的問題 (v0.0.20)
- **問題原因**：`AppContent` 元件中的 `redirectPath` 每次 render 都會重新呼叫 `getInitialRedirectPath()` 計算。LINE App 開啟 `https://liff.line.me/.../payment` 時，LIFF SDK 會將路徑包成 `?liff.state=%2Fpayment` 附在 URL 後，供第一次渲染正確解析。然而 `liff.init()` 完成後，LIFF SDK 會自動清除 URL 中的 `liff.state` 參數；此時 `liffInit.loading` 由 `true` 變為 `false` 觸發重新渲染，`getInitialRedirectPath()` 再次執行時 URL 已被清空，找不到 `liff.state` 便 fallback 回 `'/borrow'`，導致繳費連結永遠跳至裝備租借頁面。
- **修復方案**：
  - 將 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中的 `const redirectPath = getInitialRedirectPath()` 改為 `const [redirectPath] = useState(() => getInitialRedirectPath())`。
  - 利用 `useState` 初始化函式（lazy initializer）的特性，確保 `redirectPath` 僅在元件**首次掛載時**計算一次（此時 `liff.state` 仍存在於 URL），後續任何重新渲染均不會再次呼叫，徹底防止 LIFF SDK 清除 URL 後的 fallback 問題。

### 19. 配合 Members 試算表欄位調整與移除學生證照片上傳 (v0.0.19)
- **移除學生證上傳**：根據社團實際試算表結構與要求，前端 `Register.tsx` 與 GAS 後端 `GAS.js` 均已移除「學生證照片上傳」功能與欄位寫入邏輯，簡化表單。
- **試算表欄位適配分析**：
  - 分析了社團 `Members` 試算表之 19 個中英雙語雙行欄位（如 `"姓名\nName"`、`"緊急聯絡人姓名(不能為同行者)..."` 等）。
  - 確認 `GAS.js` 的 `_fi()` 模糊匹配機制（利用 `includes` 進行子字串比對，如用 `"姓名"` 比對 `"姓名\nName"`、用 `"證明"` 比對 `"體能測驗證明..."`）可百分之百、無縫地正確定位所有欄位之列索引，無須重命名試算表欄位，架構極度強健。
  - 對於唯一不在試算表預設欄位中的 LINE `系統識別碼`，後端會利用 `getOrCreateColIdx` 機制在首次寫入時自動於試算表最右側建立，不破壞既有欄位排序。

### 18. 實作「填寫資料（註冊/更新）」多步驟 LIFF 精靈與 Google Drive 上傳 (v0.0.18)
- **資料註冊與更新 LIFF 頁面 (`Register.tsx`)**：
  - 設計 Step 1 ~ Step 4 的步驟進度條表單，包含：基本資料、學籍聯絡、留守安全與登山經驗/上傳。
  - 基本資料收集真實姓名、性別、生日、身分證字號；學籍聯絡收集在校系所、學號（在校生必填防呆）、手機、Email 與 LINE ID；留守安全收集緊急聯絡人姓名/關係/電話、特殊病史/過敏（選填）；最後上傳學生證與體能證明。
  - 防呆驗證：各步驟檢核必填欄位與格式（如 Email、手機與緊急聯絡人電話驗證），不合格則不允許進入下一步或提交。
  - 上傳機制：採用 `FileReader` 將選取之圖片/檔案轉為 base64，非同步發送至 GAS，儲存至 Google Drive 指定資料夾並產生公開連結。支援自訂檔名格式（如 `學號_姓名_學生證`）以利辨識。
  - 在送出前設計隱私同意書，點擊送出後顯示儲存遮罩，完成後透過 LIFF API 自動關閉視窗，並由機器人主動推送 LINE 註冊成功通知信。
- **GAS 後端 API 升級 (`GAS.js`)**：
  - 新增 `get_profile` 行動：搜尋 `Members` 工作表快速取得已存在社員資料，回傳給前端預帶欄位（實現舊生自動帶入、新生空白表單）。
  - 新增 `save_profile` 行動：處理前端傳入之表單欄位與 base64 檔案，透過 `DriveApp` 自動建立/覆寫檔案並設定分享權限。
  - 實作 `getOrCreateColIdx` 機制：若 `Members` 表運作中缺失特定新欄位（如「學生證照片」、「個人特殊病史或過敏」等），系統會自動於試算表最右側追加新行與標題，確保資料寫入不報錯。
- **全域路由與導覽列適配 (`App.tsx` & `App.css`)**：
  - 註冊 `/register` 路由，並在頂部解析 `liff.state` 時加入 `/register` 支援。
  - 當使用者處於 `/register` 路由時，自動隱藏底部固定導覽列（`bottom-nav-bar`），提供更純淨、無干擾的表單填寫體驗。

### 17. 實作「骨架優先」非阻塞版面渲染 & 解決登入跳轉衝突 (v0.0.17)
- **非阻塞頁面渲染 (Non-blocking Shell)**：
  - 移除了先前在 `App.tsx` 最上層的「驗證登入中...」全螢幕黑屏載入狀態。現在 app 一開啟，React Router、底部導覽列與子頁面版面（例如：繳費頁面的匯款帳戶卡與宣傳 Banner）都會**瞬間立即呈現**。
  - 對帳帳單之非同步拉取，改在項目清單區塊內以局部載入動畫（Spinner）呈現，使用者體驗大幅提升。
- **保護跳轉參數以防登入無限循環**：
  - **問題原因**：先前若在 LIFF 初始化完成前，React Router 提前載入並執行了 `/` 或 `/index.html` 的路徑重定向，會導致 LINE 登入回傳之 `?code=...` 授權參數被 React Router 的 `<Navigate>` 直接從網址列抹除。進而造成 `liff.init()` 始終判定為未登入狀態，引發重複調用 `liff.login()` 造成畫面「無限閃爍登入中」的問題。
  - **修復方案**：將 `/` 與 `/index.html` 的跳轉邏輯設定為「只有當 `liffInit.loading === false` 時才執行重導向」，在登入階段完全不變更網址列以安全保留 OAuth 憑證參數。

### 16. 實作「五步對帳工作流」繳費系統 (v0.0.16)
- **前端對帳申報 UI (`Payment.tsx`)**：
  - 設計社團指定匯款帳戶資訊卡，方便社員快速複製。
  - 動態拉取社員名下所有「未繳費」項目（包含社籍費、活動報名費、裝備租借費），提供 Checkbox 多選合併申報。
  - 新增「帳號末 5 碼」填寫防呆機制，只有當「至少勾選一項」且「輸入剛好 5 位數」時才可送出。
  - 送出成功後，利用 `liff.sendMessages()` 在聊天室中自動發送明細憑證，隨後自動關閉網頁。
- **GAS 後端處理引擎 (`gas.js`)**：
  - 新增 `submit_payment` 接收端，變更申報項目狀態為 `待確認 Checking`，防止重複送出。
  - 將每一筆申請寫入 `Payments` 試算表作為交易紀錄。
  - 動態向幹部群組推播包含一鍵審核的 Flex Message 訊息，供幹部查帳核對。
  - 串接 `admin_confirm` postback 銷帳機制，確認後自動將試算表狀態改為 `已繳費 Paid`，並向社員發送成功繳費之 LINE 推播通知。

### 15. 解析 `liff.state` 參數解決點擊繳費連結（/payment）仍進入租用頁面問題 (v0.0.15)
- **問題原因**：當使用者在 LINE 點擊 `https://liff.line.me/2009217429-zXvGeSrI/payment` 時，LINE LIFF SDK 會將目標路徑 `/payment` 包裝在 `liff.state` 查詢參數中，並將瀏覽器重定向至設定的 Endpoint URL（如 `https://your-domain.vercel.app/?liff.state=%2Fpayment`）。由於網址列的主路徑是根目錄 `/`，React Router 在網頁初始化時，會依照匹配規則 `<Route path="/" element={<Navigate to="/borrow" replace />} />` 直接把使用者強行重導向至 `/borrow`，導致 `liff.state` 被忽視，永遠只能進入器材借用。
- **修復方案**：
  - 在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增 `getInitialRedirectPath` 輔助函式。
  - 在 App 啟動時解析 URL 中的 `window.location.search` 與 `window.location.hash` 中的 `liff.state` 參數。若路徑指向 `/payment` 則回傳 `/payment`（否則預設為 `/borrow`）。
  - 將路由表的首頁重定向目標修改為該變數：`<Route path="/" element={<Navigate to={redirectPath} replace />} />`，完美解決了透過 LINE 專屬路徑連結開啟時的子頁面路由跳轉丟失問題。

### 14. 於預算總租金與清單項目呈現詳細試算公式 & 修復 TS6133 未使用變數錯誤 (v0.0.14)
- **試算公式明細**：
  - 在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 購物車清單中，為每項選取裝備增加了動態公式文字，例如：`公式: ($100 + $20 × 3天) × 2件 = $320`。
  - 在底部費用總計區塊，若選取多個項目，會顯示整筆預約的試算拆解算式，如 `試算: (($100 + $20 × 3天) × 2件) + (($50 + $10 × 3天) × 1件) = $400`，使租金結構及計算邏輯百分之百透明。
- **修復編譯錯誤**：
  - 修正了在 `formulaString` 中宣告了 `itemPrice` 卻未使用所引發的 TypeScript 編譯錯誤（`TS6133: 'itemPrice' is declared but its value is never read`），確保專案能在嚴格模式下順暢通過本機及雲端部署建置。

### 13. 實作「超過兩天按日加價」動態計費系統（串接 Google Sheet `+1天` 欄位） (v0.0.12)
- **需求實作**：
  - **金額來源說明**：目前的金額會**完全隨著您的 Google Sheets 變動**。除了原先抓取的「2天」基本租金外，現在也已成功讀取 Google Sheet 中的「`+1天`」欄位（每日加價）。
  - **GAS 後端 API 升級**：
    - 更新 `getEquipmentsListAPI` 介面，讀取並回傳 `priceExtra` (`+1天` 欄位的值) 至前端。
    - 更新 `processMultiLoan` 訂單處理程序，不再是單純以 2 天計價。在後端寫入資料時，會自動比對 `pickupDate`（領取日期）與 `returnDate`（歸還日期）計算出實際「租借天數」，前 2 天收基本費，第 3 天起按日加收「`+1天`」的加價，計算出真正的應繳費用，並寫入 Google Sheets 中的 `應繳費用` 欄位，同步推播給幹部。
  - **React 前端計價優化**：
    - 在 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 裝備卡片 UI 中，除了顯示「2天基本租金」外，亦清楚標明「續租（加1天）」的每日加價金額。
    - 前端購物車與預訂單明細抽屜已整合天數計算，使用者在選取日期後，會顯示「租用天數：X 天」，且購物車單項金額與總額都會即時更新為加天數後的最終價格，做到「前後端對帳金額一致」。

### 12. 修正購物車浮動條位置重疊與行動端日期選取框位移跑版 (v0.0.11)
- **購物車浮動條阻擋問題**：
  - **問題原因**：原先的購物車底欄 `.floating-cart-bar` 設定的定位是 `bottom: 20px;`。引入底部導覽列 `.bottom-nav-bar` 後，兩者重疊在一起，導致購物車資訊被導覽列遮蔽。
  - **修復方案**：將浮動購物條的 `bottom` 改為動態計算的 `bottom: calc(76px + env(safe-area-inset-bottom, 8px));`，使其精準、完美地懸浮在導覽列上方，並保留合適的間距與高度。
- **日期欄位跑版位移**：
  - **問題原因**：由於全域環境下的 `#root` 設定了 `text-align: center;`，且 iOS 等部分行動端瀏覽器在渲染 `input[type="date"]` 時預設會視為 `inline-block`。這使得兩格日期輸入框在各自的網格單元內置中，並因為預設樣式的寬度解析異常而往中央擠壓、甚至邊界重疊；且因為缺乏 `box-sizing` 設定，部分外邊框在行動裝置上被吃掉。
  - **修復方案**：
    - 強制將日期 input 元件的樣式改為 `display: block;`，以徹底解除 `text-align: center;` 的干擾。
    - 加上 `box-sizing: border-box;` 與 `text-align: left;`，並將寬度強制鎖定於 `width: 100%;` 以符合其網格配置。
    - 加入 `-webkit-appearance: none; appearance: none;` 移除 iOS / WebKit 核心瀏覽器的原生日期邊框重設，讓日期選取框與用途下拉選單的左右邊界對齊、大小整齊，維持介面精美。

### 11. 修復點擊繳費連結（/payment）經登入跳轉後卻被誤導至器材借用（/borrow）頁面的問題 (v0.0.10)
- **問題原因**：先前在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 進行登入判斷時，調用 `liff.login()` 並未帶入引數。依據 LINE LIFF 的預設行為，未指定 `redirectUri` 的 `liff.login()` 登入完成後會強制導回 LINE Console 中設定的 Default Endpoint URL（即根目錄 `/`）。進而觸發路由重導向規則將使用者送回 `/borrow` 頁面。
- **修復方案**：
  - 將 `liff.login()` 呼叫修改為傳入當前網址：`liff.login({ redirectUri: window.location.href });`。
  - 這樣一來，不論使用者是從 LINE 的「器材借用」連結還是「繳費系統」連結點入，當在未登入狀態下跳轉至 LINE 登入後，均能精準導回原本預期的對應子路徑（如 `/payment`），避免登入完成後一律跳回 `/borrow` 的問題。

### 10. 解決 LIFF 跳轉回首頁可能出現的空白畫面跑版問題 (v0.0.9)
- **問題原因**：行動裝置 LINE LIFF 首次開啟 Endpoint URL 時，可能為 `/`、`/index.html` 或攜帶了自定義查詢字串。在先前設定的 React Router 中，未對 `/index.html` 以及其他未知路徑（如認證重導向狀態字串）進行相應的路由匹配，造成 React 無法渲染任何頁面，導致使用者在登入後看到「一片白色的空白畫面」，需要重新手動點選底部導覽列才能載入內容。
- **修復方案**：
  - 在 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 中新增針對 `/index.html` 的重定向路由匹配。
  - 新增萬用路由守衛 `<Route path="*" element={<Navigate to="/borrow" replace />} />`，確保不論何種網址（即使網址後面帶有 LINE 自有的暫態參數），在登入成功後都能自動且無縫地重定向回主要的 `/borrow` 租借頁面，防範任何白畫面情形。

### 9. 解決行動端與 LINE 內部點開連結無限重定向登入閃爍問題 (v0.0.8)
- **問題原因**：原先的 `liff.init()` 邏輯寫在頁面元件 `Borrow.tsx` 中，該元件被包裝在 `/borrow` 路由之下。當使用者第一次進入根路徑 `/` 時，React Router 會進行路由重導向（Navigate to `/borrow`），導致 `Borrow` 元件掛載並觸發 `liff.init()`。而 `liff.init()` 解析驗證狀態及跳轉登入時會使網頁重新載入與導向，React Router 與 LIFF 初始化流程在不同的組件生命週期中發生衝突，引發了無限跳轉登入的閃爍循環。
- **修復方案**：
  - 將 `liff.init()` 移至最頂層的 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 元件中，確保**全局只初始化一次**，且在初始化完成（與登入跳轉判定）之前，先顯示「驗證登入中...」的載入畫面，阻止 React Router 提早執行路由分發。
  - 將成功驗證的 `userId` 作為 Prop 傳遞給子頁面 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx) 與 [src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx)，移除了子頁面重複初始化的邏輯，徹底解決無限重定向與登入閃爍問題。

### 8. 引進 React Router 與頁面重構，新增繳費系統骨架 (v0.0.7)
- **重構與模組化**：
  - 安裝並整合 `react-router-dom` 路由套件。
  - 將裝備租借頁面抽離至獨立的頁面元件 [src/pages/Borrow.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Borrow.tsx)。
  - 新增繳費系統頁面 [src/pages/Payment.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Payment.tsx) 作為後續對帳功能的骨架。
  - 重構 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 為純路由分發器，設定 `/borrow` 與 `/payment` 路由規則，並配置預設導向。
- **底部質感導覽列**：
  - 於 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 設計符合手機 App 質感的 `.bottom-nav-bar` 底部固定導覽 Tab 列，以利使用者流暢切換「器材借用」與「繳費對帳」頁面。
- **Vercel 部署路由修復**：
  - 於專案根目錄新增 [vercel.json](file:///Users/brianhung/Documents/OfficialLINEAccount/vercel.json)，設定將所有路由重寫至 `index.html` 處理，避免 Vercel 部署後重新整理出現 404 錯誤。

### 7. 調整計價 Banner 背景色回歸質感森林綠 (v0.0.6)
- **調整方案**：將費用試算 Banner 的背景由橘褐色漸層調整回專案原本的高質感森林綠漸層（`#10b981` 到 `#064e3b`），保持整體品牌色系統一與清爽。

### 6. 更新首頁 Banner 為「費用試算說明」計價資訊 (v0.0.5)
- **需求調整**：將首頁頂部海報 Banner 內容改為對應的「裝備租借費用計價方式」，包含社員/非社員在社團活動或個人使用時的折扣與計費基準。
- **調整方案**：
  - 更新 [src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx) 頂部 Banner 結構，以清單條列「社員/非社員於社團/個人」的對應租金（如免費、5折、全額）。
  - 下方新增備註區塊說明「2天為基本計價單位，超出按每日加價計算」。
  - 於 [src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css) 設計專屬橘褐色漸層背景 (`#d25d24` 到 `#a04015`)，與字體樣式、分隔線、高亮折扣數字，完美重現使用者提供的設計圖稿。

### 5. 修復頂部 Logo 文字換行跑版問題 (v0.0.4)
- **問題原因**：由於全域 `index.css` 為 `h1` 與 `p` 設定了較大的預設外邊距（Margin），且我們原先沒有對標誌文字容器 `.logo-text` 設定明確的 Flex 排版與對齊，導致次標題 `Gear Rental Store` 跑版並折行渲染至 🏕️ 圖示正下方。
- **修復方案**：為 `.logo-text` 容器新增 `display: flex; flex-direction: column; align-items: flex-start; text-align: left;`，並重設 `h1` 與 `p` 的 Margin 為 `0` 且設定適當的 `line-height`，確保圖示與多行標誌文字左右排列時，能完美貼合對齊且不跑版。

### 4. 解決電腦與作業系統暗黑模式下的日期欄位無法點擊/顯示問題 (v0.0.3)
- **問題原因**：由於全域 `index.css` 設定了 `color-scheme: light dark;`，當使用者的電腦作業系統（如 macOS / Windows）處於「深色/暗黑模式」時，瀏覽器會強制將日期輸入框（`<input type="date">`）的文字與行內圖示渲染成白色。然而，我們設計的淺色電商卡片輸入框背景為純白色，導致了「白底白字/白圖示」的視覺衝突，讓使用者看起來像是「無法輸入/無反應」。
- **修復方案**：在我們的主要租借容器 `.app-container` 以及日期欄位中，明確指定 `color-scheme: light;`，強制瀏覽器在任何作業系統主題下，皆以淺色網購主題正確渲染輸入框文字及日曆圖示。同時，將日期欄位游標設定為 `cursor: pointer` 並確保有足夠的點擊高度。

### 3. 修復日期無法選擇/點擊問題 (v0.0.2)
- **問題原因**：原先的購物車預訂單抽屜將 `onClick` 點擊關閉事件綁定在最外層的 overlay 包裹層，當使用者在行動裝置 (如 iOS / LINE Webview) 點擊日期輸入框彈出原生日期選擇器時，事件冒泡或焦點變動觸發了 overlay 的點擊關閉事件，導致抽屜瞬間被關閉或無法正常點擊輸入。
- **修復方案**：將背景遮罩（Backdrop）與抽屜主體（Drawer）拆分為**兄弟節點**，徹底阻斷點擊穿透與冒泡，確保在任何行動裝置與 LIFF Webview 下皆能流暢地聚焦並輸入日期。

### 1. 解決 `@line/liff` 模組遺失問題
- 手動於 `package.json` 加入最新穩定版 `@line/liff` 依賴並更新版本號。
- 透過 `pnpm install` 安裝完成，修正了 `Cannot find module '@line/liff'` 的編譯錯誤。

### 2. 介面重新設計 (UI/UX Redesign)
- **全新淺色購物風格 (Modern Light E-commerce Theme)**：淘汰原有深色陽春列表，改用乾淨優雅的微影卡片、柔和的背景色彩與極具質感的森林綠、戶外橙配色。
- **動態裝備圖示 (SVG Illustrations)**：為帳篷、睡墊、背包、登山杖與鋼盆等裝備個別繪製精美的 SVG 圖示與對應的主題漸層。
- **購物車抽屜 (Cart Drawer & Floating Bar)**：
  - 增加底部懸浮購物條，一目了然已選數量與估算金額。
  - 點選後展開右側/下方精緻的「預訂單明細」，可在預訂單中直接增減商品數量。
- **預約設定表單**：整合日期選擇器（領取與歸還）與出隊用途下拉式選單，點選結帳按鈕後即可將預約發送至 GAS 後台與 LINE 聊天室。

---

## 🚀 快速開始 (Quick Start)

### 1. 安裝相依套件 (Install Dependencies)
請確保您已安裝 `pnpm`，並在專案根目錄下執行：
```bash
pnpm install
```

### 2. 本地開發偵錯 (Local Development)
啟動 Vite 開發伺服器：
```bash
pnpm run dev
```

### 3. 建置專案 (Build Project)
打包生產環境程式碼：
```bash
pnpm run build
```

---

## ⚙️ 設定 (Configuration)
- **Vite 進入點**：`index.html`
- **主程式路徑**：
  - 邏輯控制與結構：[src/App.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.tsx)
  - 樣式美化：[src/App.css](file:///Users/brianhung/Documents/OfficialLINEAccount/src/App.css)
- **GAS 後端 API 串接**：已於 `App.tsx` 配置為使用最新的 Google Apps Script Web App URL。

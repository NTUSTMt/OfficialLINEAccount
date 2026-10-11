# 更新紀錄 (Changelog)

所有本專案的重要異動皆會記錄於本文件。

## [0.1.295] - 2026-10-11

### 錯誤修復：TypeScript 建置型別錯誤修復 (Fix LiffInitState jwtReady TS Errors)

- 根本原因：0.1.294 於 App.tsx 引入 `jwtReady` 旗標以解決 JWT Race Condition，但 `AppContent` 元件之 props 型別宣告未同步加入 `jwtReady: boolean`，且三處 `setLiffInit` 呼叫點缺少該屬性，導致 Vercel build 階段 TypeScript 編譯報錯 (TS2339 與 TS2345)。
- 前端修復 (src/App.tsx)：
  - 宣告統一介面 `interface LiffInitState`，明確包含 `jwtReady: boolean`。
  - 將 `AppContent` 傳入型別與 `useState` 初始化宣告全面對齊 `LiffInitState`。
  - 補齊免登入直通路徑 (`/confirm-payment`, `/admin-web`)、外部瀏覽器阻擋頁面、以及例外捕獲 fallback 中的 `setLiffInit` 呼叫之 `jwtReady` 屬性。

## [0.1.294] - 2026-10-11

### 錯誤修復：資料填寫頁空白問題 (JWT Race Condition Fix)

- 根本原因：phase2 安全加固後，`get_member_profile` RPC 在無 JWT 時回傳 `{error: 'Unauthorized'}` 物件而非 `NULL`，導致前端初始化時因 `line-auth` JWT 交換尚未完成即發起 RPC 呼叫，資料填寫頁看不到任何已儲存的個人資料。
- 後端修復 (supabase/migrations/20261011_fix_get_member_profile_null_on_no_jwt.sql)：
  - `get_member_profile` 在 JWT 缺失時改回傳 `NULL`（而非 error object），讓前端得以重試而非永久放棄。
  - IDOR/BOLA 守衛保留：持有 JWT 但試圖讀取他人資料仍回傳 `Forbidden` 錯誤。
  - 匿名安全性由既有的 `REVOKE anon EXECUTE` 在 PostgREST 呼叫層把關，函式本身無需額外防禦。
- 前端修復 (src/App.tsx + src/pages/Register.tsx)：
  - `App.tsx`：`liffInit` state 新增 `jwtReady: boolean` 旗標；JWT 交換完成（成功或失敗）後統一在 `finally` 區塊設為 `true`，確保 Register 得知 JWT 已就緒。
  - `Register.tsx`：接收 `jwtReady` prop，`useEffect` 依賴陣列加入 `jwtReady`，在 JWT 尚未就緒時提前返回，等旗標為 `true` 後才發起 `fetchMemberProfileFromSupabase`。

## [0.1.293] - 2026-10-11


### 安全性修復與雲端部署 (Custom JWT Integration & Cloud Deployment)
- 前端 LIFF 整合 Custom JWT 身分鑑權機制 (C-2)：
  - src/utils/supabaseClient.ts: 新增 setSupabaseAuthToken 與 getSupabaseAuthToken 介面，於 createClient 之 global.fetch 請求攔截器自動動態附加 Authorization: Bearer <token> Header。
  - src/App.tsx: 在 liff.isLoggedIn() 登入初始化成功後，自動提取 liff.getIDToken() 並向 line-auth Edge Function 交換具備 sub: line_user_id 宣告之 Custom JWT，杜絕資料庫 PostgREST RPC 匿名回退 IDOR 越權風險。
- 雲端 Supabase 專案 (bvyyuobmizfrosbgcqbu) 正式部署：
  - 資料庫遷移套用：成功透過 apply_migration 套用 20261011_phase2_security_remediation.sql，強制 C-1 (撤銷 anon 權限)、C-2 (JWT sub 強制校驗)、C-3 (後端重新計算活動費用)、H-1 (SET search_path = public)、H-2 (取消 RPC 宣告驗證)、L-4 (撤銷 anon 管理權限)。
  - Edge Functions 正式版部署：
    - line-auth: 升級至 v22 (ACTIVE)，支援前端動態傳入 LIFF Channel ID 與自適應 CORS 嚴格白名單。
    - line-webhook: 升級至 v24 (ACTIVE)，具備 Fail-Closed 密鑰防禦與 timingSafeEqual 恆常時間簽章驗證。
    - notify-dispatcher: 升級至 v20 (ACTIVE)，具備嚴格 CORS 白名單與 IP Rate Limiting 頻率保護。
- 能力網址 (Capability URL) 架構確認：
  - 維持現有 Google Drive 架構，現有與歷史繳費證明、體檢證明不受任何破壞，具備非推測性隨機 Token，社員與幹部皆能透過身分鑑權正常預覽與存取。
- 自動化測試與建置：
  - test/113_comprehensive_security_remediation.test.mjs 包含前端 JWT 注入等 12 項安全性測試全數通過。
  - pnpm build 打包順利完成 (0 錯誤)。

## [0.1.292] - 2026-10-11

### 安全性修復與加固 (Phase 2 Remediation)
- 簽章驗證改採恆常時間演算法 (M-1)：
  - supabase/functions/_shared/lineClient.ts 實作 timingSafeEqual 函式比對 HMAC-SHA256 簽章，防止微秒級時間差側信道外洩攻擊。
- Webhook 密鑰缺失防禦轉向 Fail-Closed (H-4)：
  - supabase/functions/line-webhook/index.ts 於缺少 Channel Secret 密鑰時立即回傳 500 拒絕處理，徹底移除 Fail-Open 略過簽章校驗邏輯。
- CORS 跨來源白名單收緊 (M-2)：
  - supabase/functions/line-auth/index.ts 與 notify-dispatcher/index.ts 導入預設官方白名單（Vercel 網域與本機開發環境），徹底移除任意 Origin 動態反射弱點。
- 推播介面實作速率限制 (M-3)：
  - supabase/functions/notify-dispatcher/index.ts 實作記憶體 IP 速率限制 (Rate Limiting)，超額請求立即回傳 429 Too Many Requests，保護 LINE 訊息額度。
- GAS 入口簽章檢驗與敏感 Helper 防護 (C-4)：
  - src/gas.js doPost 支援 X-Line-Signature 簽章校驗；_handleDriveDeleteHelper 檔案刪除加入 SECURITY_GUARD 與幹部授權防護。
- 資料庫加固 Migration 腳本 (C-1, C-2, C-3, H-1, H-2, L-4)：
  - 建立 supabase/migrations/20261011_phase2_security_remediation.sql：
    - C-1: 撤銷 sync_officer_cache_rpc 對 anon 之執行權限，並配置幹部或 service_role 特權守衛。
    - C-2: get_member_profile 與 get_my_dashboard 強制驗證 JWT sub 宣告，杜絕匿名回退 IDOR 越權。
    - C-3: submit_payment_rpc 由資料庫端依照 events.fee 重新計算應繳金額，禁止信任前端 0 元自動核銷。
    - H-1: submit_equipment_loan_rpc 與 cancel_* 特權 RPC 全面補齊 SET search_path = public。
    - H-2: cancel_equipment_loan_rpc 與 cancel_event_signup_rpc 強制比對 JWT sub 宣告，防範越權取消。
    - L-4: 撤銷 save_admin_event_rpc, get_admin_event_signups_rpc 對 anon 之執行權限。
- 業務需求評估確認（維持現狀）：
  - H-3: 維持 Google Drive 現有機制，不遷移至 Supabase Storage，以無序 Capability File ID 與資料庫 RLS 保護隱私。
  - L-1: 裝備借用 0 元出隊免租金審核維持現狀，保留填寫便利性。
  - L-2: 幹部群組繳費通知之單鍵核銷按鈕維持現狀，保障審核體驗。
  - L-3: Webhook 原始文字日誌維持現狀，利於 AI 客服故障排查。
- 自動化測試套件：
  - 新增 test/113_comprehensive_security_remediation.test.mjs 包含 11 項核心漏洞檢驗（全部 100% 通過）。
  - 全量回歸測試：62 項測試全數通過（0 failed）。

## [0.1.291] - 2026-10-11

### 安全性修復與加固
- 機密脫敏防護 (C-1, C-2)：
  - 清理 .env.example，移除真實 Supabase 金鑰與 SUPABASE_SERVICE_ROLE_KEY，替換為安全佔位符。
- 身分驗證強制執行 (C-3)：
  - notify-dispatcher Edge Function 移除可選之 ENFORCE_ID_TOKEN 開關，改為預設強制校驗 ID Token，無 Token 直接回傳 401 Unauthorized。
- 資料庫 RPC 權限收緊與防偽冒 (C-4, H-7, H-9)：
  - 重構 is_officer 鑑權邏輯，未攜帶有效 JWT 宣告時直接拒絕，徹底根絕匿名傳入他人幹部 ID 查表偽冒之重大漏洞。
  - 撤銷所有幹部管理與敏感 RPC 對 anon 角色的 EXECUTE 授權，僅限 authenticated 與 service_role。
- 跨來源資源共享限制 (H-1)：
  - line-auth 與 notify-dispatcher 移除無條件萬用字元 Access-Control-Allow-Origin: *，改為依據 ALLOWED_ORIGINS 與請求來源動態驗證。
- 移除硬編碼 Channel ID 與測試後門 (H-2, L-4)：
  - 移除 Edge Functions 與前端原始碼中 2009217429 之硬編碼 fallback，全面由環境變數讀取。
  - 徹底移除 lineClient.ts 中的 TEST_USER_ID 測試後門繞過邏輯。
- HTTP 安全標頭與點擊劫持防護 (H-3, L-5)：
  - 在 vercel.json 中配置 X-Content-Type-Options: nosniff、Referrer-Policy、Permissions-Policy 以及具備 frame-ancestors 守衛之 Content-Security-Policy。
- 佇列資料庫 RLS 收緊 (H-5)：
  - 收緊 sync_queue RLS 寫入政策，移除 WITH CHECK (true)，僅允許 authenticated 角色或系統觸發器寫入。
- 伺服端渲染 XSS 防禦 (H-8)：
  - gas.backup.js 在將訊息寫入 alertBox innerHTML 前進行完整 HTML 實體跳脫。
- 前端隱私保護與快取管理 (L-1, L-2)：
  - Register.tsx 本地表單草稿自動過濾身分證字號與病史欄位。
  - Borrow.tsx 幹部身分快取導入時效性驗證與自動清理。
- 邊界防禦與 CI/CD 流程 (L-6, L-8, L-9)：
  - line-auth 導入記憶體 IP 速率限制 (Rate Limiting)。
  - update_equipment_images RPC 配置 is_officer 守衛與固定 search_path = public。
  - 新增 .github/workflows/security.yml 自動化安全性審查工作流程。
  - 新增完整資料庫變更腳本 supabase/migrations/20261011_harden_security_and_rls.sql 與回滾腳本。
- 自動化測試套件：
  - 新增 test/112_security_vulnerability_fixes.test.mjs 完整驗證 14 項安全性弱點之修復（29 項測試全數通過）。
- 雲端 Supabase 正式部署上線：
  - PostgreSQL 安全性遷移腳本 (20261011000000_harden_security_and_rls) 成功套用至遠端專案 (bvyyuobmizfrosbgcqbu)。
  - is_officer 鑑權防偽冒函式、update_equipment_images 裝備圖片 RPC 與 9 項幹部管理 RPC 權限正式收緊，撤銷 anon 權限。
  - sync_queue RLS 寫入政策正式套用 authenticated 限制。
  - line-auth Edge Function 升級部署至 version 20 (ACTIVE)。
  - notify-dispatcher Edge Function 升級部署至 version 19 (ACTIVE)。

## [0.1.290] - 2026-10-11

### 新增與變更
- 系統分頁圖示 (Favicon) 與標題全新更換：
  - 將官方登山社標誌 (登山社logo.png) 整合進前端公開資源庫 (public/logo.png 與 public/favicon.png)。
  - 更新 index.html 中的分頁圖示連結 (<link rel="icon" type="image/png" href="/logo.png" /> 與 <link rel="apple-touch-icon" href="/logo.png" />)。
  - 更新預設網頁標題為「國立臺灣科技大學登山社」，並將語言屬性設定為繁體中文 (zh-Hant-TW)。

## [0.1.289] - 2026-10-11

### 新增與變更
- 移除過時通知與純文字破冰：
  - 移除「我已完成個人資料填寫」之文字破冰回覆：因社員填寫個人資料完成時，前端 LIFF 已直接傳送卡片 diff 訊息，後端不再回覆純文字訊息。
  - 徹底移除「幹部群組：心得感想發表通知」：前端 src/pages/Achievements.tsx 移除 notifyDispatcher('notify_reflection_submitted') 呼叫；後端 notify-dispatcher 移除 handleNotifyReflectionSubmitted 路由與實作。
- 8 項核心互動訊息全面升級為 LINE Flex Message 卡片：
  - 活動報名已截止通知：line-webhook (buildEventClosedFlex) 採用警示橘紅主題卡片，清晰標示活動名稱與截止時間。
  - 備取意願確認回覆：line-webhook (buildWaitlistConfirmedFlex / buildWaitlistFailedFlex) 成功採用森林綠主題、失敗採用深灰警示卡片。
  - 幹部專屬助理小岳使用指南：line-webhook (buildAdminAssistantGuideFlex) 採用深藍管理員主題卡片，列舉常用指令並提供「進入幹部管理後台」按鈕。
  - 個人繳費核銷成功推播：notify-dispatcher (buildPaymentVerifiedPersonalFlex) 採用森林綠主題與金牌核銷標籤，清楚列出活動名稱、對帳後五碼與金額。
  - 幹部群組：裝備預約取消通知：notify-dispatcher (buildLoanCancelledAdminFlex) 採用警示橘紅主題，列明借用人、裝備清單、原借還日期，並提供「前往裝備管理」按鈕。
  - 幹部群組：繳費核銷完成通知：notify-dispatcher (buildPaymentConfirmedAdminFlex) 採用藍綠主題，列明活動、社員、末五碼、金額、核銷人與時間，並提供「查看財務管理」按鈕。
  - 幹部群組：新幹部意願登記通知：notify-dispatcher (buildOfficerIntentAdminFlex) 採用紫靛色主題，列明申請人、系級、意願組別與自我介紹，並提供「前往社員管理」按鈕。
  - 幹部群組：正取社員取消報名緊急通知：notify-dispatcher (buildEventCancelledAdminFlex) 採用緊急朱紅主題，列明活動名稱、社員資訊、空出名額，並提供「前往活動名冊」按鈕。
- 雲端 Edge Functions 正式部署：
  - 正式部署 line-webhook (v23) 與 notify-dispatcher (v18) 至 Supabase 正式環境。
- 自動化測試套件：
  - 新增 test/111_flex_card_upgrades.test.mjs 完整驗證 9 款 Flex 卡片模板結構與欄位完整性。

## [0.1.288] - 2026-10-11

### 新增與變更
- Supabase Edge Functions 後端全面支援台灣截止時間 (UTC+8) 時分呈現與正式部署：
  - 共用時區工具強化 (supabase/functions/_shared/dateUtils.ts)：
    - 強化 parseTaipeiDate 函式，支援未標示時區之日期時間字串，預設補齊 +08:00 台灣時區。
  - LINE Webhook 活動卡片與逾期訊息升級 (supabase/functions/line-webhook)：
    - flexTemplates.ts：活動清單輪播卡片與活動詳情卡片之報名截止日期格式化為帶有時分的台灣時間 (YYYY/MM/DD HH:mm)。
    - index.ts：活動截止 (status === "closed") 時的文字回覆，將截止時間以台灣時區精確格式化為 YYYY/MM/DD HH:mm。
  - 幹部群組推播通知升級 (supabase/functions/notify-dispatcher/index.ts)：
    - 新活動發布或資訊更新推播至幹部群組時，報名截止時間統一格式化為 YYYY/MM/DD HH:mm 台灣時間。
  - 雲端 Edge Functions 部署：
    - 正式部署 line-webhook (v22) 與 notify-dispatcher (v17) 至 Supabase 正式環境。

## [0.1.287] - 2026-10-10

### 新增與變更
- 報名截止加入時間，以台灣時間 (Asia/Taipei, UTC+8) 為準全面架構升級：
  - 台灣時區工具模組建立 (src/utils/dateUtils.ts)：
    - 新增 parseTaiwanDeadline、formatTaiwanDateTime、buildTaiwanIsoString 與 isTaiwanDeadlinePassed。
  - 幹部端活動表單升級 (AdminEventForm.tsx & WebAdminEvents.tsx)：
    - 報名截止區塊加入「截止時間 (台灣時間) *」輸入框 (type="time")，預設 23:59。
  - 活動卡片與列表展示升級 (AdminEventCard.tsx & WebAdminEvents.tsx & AdminEventsHistory.tsx)：
    - 活動卡片截止時間欄位呈現完整 YYYY/MM/DD HH:mm。
  - Supabase 預存程序 save_admin_event_rpc 強化：
    - deadline 未帶時區偏移時強制附加 +08:00。
  - GAS LINE Bot 後端訊息與逾期判定升級 (src/gas.js)：
    - 新增 _formatEventDateTime 並支援以台灣時區精準判定截止。
  - 多語系字典更新 (src/locales/zh.json & src/locales/en.json)：
    - 補充 deadlineDateLabel 與 deadlineTimeLabel。

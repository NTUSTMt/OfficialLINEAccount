# 更新紀錄 (Changelog)

所有本專案的重要異動皆會記錄於本文件。

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
  - 新增 test/112_security_vulnerability_fixes.test.mjs 完整驗證 14 項安全性弱點之修復。

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

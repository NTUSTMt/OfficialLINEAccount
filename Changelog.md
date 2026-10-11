# 更新紀錄 (Changelog)

所有本專案的重要異動皆會記錄於本文件。

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

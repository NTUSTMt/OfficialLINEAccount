# 更新紀錄 (Changelog)

所有本專案的重要異動皆會記錄於本文件。

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

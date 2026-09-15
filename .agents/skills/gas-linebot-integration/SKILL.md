---
name: gas-linebot-integration
description: >-
  Use this skill when developing or debugging Google Apps Script (GAS) modules, handling LINE Bot Webhooks, modifying Flex Message templates, managing Google Drive file uploads, or configuring Google Sheets and Supabase bidirectional synchronization (Sync Worker).
---

# GAS 後端與 LINE Bot 串接指引 (GAS & LINE Bot Integration)

本指南規範 `gas_modules/` 模組化後端、LINE Messaging API 整合、Google Drive 檔案串接與 Google Sheets 雙向同步機制。

---

## 1. GAS 後端模組劃分架構

專案將龐大的 Google Apps Script 拆解為 6 大模組，各自職責清晰切分：

```text
gas_modules/
├── 01_Config_Auth.js       # 全域常數、Script Properties、管理員權限驗證與 Token 管理
├── 02_LineBot_Webhook.js    # doPost Webhook 入口、事件路由 (Follow, Message, Postback)
├── 03_Flex_Templates.js     # LINE Flex Message (Bubble/Carousel) 樣板排版生成器
├── 04_Ai_Gemini.js          # Google Gemini AI 登山知識問答與智慧推薦整合
├── 05_Sync_Worker.js        # Supabase 與 Google Sheets 定時/即時雙向同步 (ETL)
└── 06_Helper_Services.js    # Google Drive 檔案上傳、Base64 解碼、群組通知與審計日誌
```

---

## 2. LINE Bot Webhook 與 Flex Templates 規範

### (1) 快速回應 (1000ms SLA)
- LINE Messaging API 的 `replyToken` 有短暫的時效限制（1~3 秒內必須回應，否則失效）。
- Webhook 入口 `doPost(e)` 接收到請求後，應先完成路由分派；如遇耗時作業（如大型試算表重算），應以快速回應機制先通知使用者，或藉由觸發器非同步排程執行。

### (2) Flex Message 排版標準 (`03_Flex_Templates.js`)
- 所有送給使用者的卡片訊息（活動宣傳、報名確認、繳費憑證狀態、裝備借用清冊）一律使用 Flex Message。
- Flex 樣板必須符合 LINE Flex Message 規範版本（Flex Message 2.0+），必須提供替代文字 (`altText`) 以免通知欄顯示空白。
- 按鈕動作使用 `postback` 或 `uri`，`postback.data` 採用鍵值格式（例如 `action=view_event&event_id=123`），方便 `02_LineBot_Webhook.js` 解析。

---

## 3. Google Drive 檔案上傳與 GAS 302 重導向機制

### (1) WebKit 跨域重導向特性
- 當瀏覽器對 GAS Web App 發出 POST 請求時，Google 伺服器會強制回傳 `302 Moved Temporarily`，將請求重導向至 `script.googleusercontent.com`。
- **純資料更新嚴禁走 GAS**：iOS LINE WebKit 瀏覽器會攔截並阻斷跨域 302 POST，產生 `TypeError: Load failed`。純欄位、純狀態更新必須走 Supabase REST 直通。

### (2) 必經 GAS 之檔案上傳流程 (`06_Helper_Services.js`)
- 當使用者上傳繳費水單、活動照片時，由於需將檔案實體存入 Google Drive：
  1. 前端將圖檔轉為 Base64 字串，包裹為 JSON 酬載發送至 GAS Web App。
  2. GAS 接收後，調用 `06_Helper_Services.js` 中的 `uploadBase64ToDrive()`，存入指定的社團 Google Drive 資料夾。
  3. 設定公開存取權限並產出 Web View 連結。
  4. 將產生的 Google Drive URL 回寫至 Supabase 資料表。
  5. 發生任何錯誤時，直接將完整的 Google 錯誤字串回傳給前端顯示，嚴禁遮蔽。

---

## 4. Sync Worker 雙向同步機制 (`05_Sync_Worker.js`)

專案維護 Google Sheets（便於社團幹部試算表檢視）與 Supabase（支援 LIFF 高併發與即時查詢）之間的資料一致性：

1. **防併發鎖定機制 (LockService)**：
   - 執行雙向同步前，必須先獲取腳本鎖：
     ```javascript
     const lock = LockService.getScriptLock();
     if (!lock.tryLock(10000)) {
       throw new Error('同步任務衝突：另一個同步程序正在執行中，請稍後重試。');
     }
     ```
2. **差異化更新 (Idempotent Upsert)**：
   - 透過以 UUID 或 LINE User ID 為主鍵比對，僅同步有異動之資料欄位，避免覆寫最新修訂時間。
3. **錯誤直接報告**：
   - 若同步發生斷線或 Schema 不一致，於幹部群組發送警報並寫入 Audit Log。

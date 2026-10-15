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

---

## 5. Google Sheets 批次名冊寫入與資料驗證防禦規範

在透過 GAS 薄 Worker 或 Sync Worker 將 Supabase 名冊匯入至活動專屬試算表時，必須強制落實以下四大防禦機制：

### (1) 表頭比對嚴格排他 (Header Collision Prevention)
- **禁止使用泛用單詞做模糊比對**：嚴禁使用包含 `'狀態'`、`'電話'`、`'地址'`、`'意願'` 等詞的子字串比對（`indexOf`），否則「繳費狀態」會被命中為「審核狀態」，造成欄位錯位與資料驗證報警。
- **實施兩階段排他比對**：
  - 優先全字精確匹配（Exact Match, `h === c`）。
  - 排他順序：必須先比對多字詞（如「緊急聯絡人電話」先於「聯絡電話」；「繳費狀態」與「審核結果」各自獨立匹配清單）。

### (2) 欄位值標準化 (Data Validation Compliance)
- 若範本試算表欄位已設定資料驗證（下拉選單），寫入之字串必須 100% 符合規範值：
  - **繳費狀態**：強制正規化為 `'已繳費 Paid'`、`'待確認 Checking'`、`'未繳費 Unpaid'`。
  - **審核結果**：強制正規化為 `'正取 Confirmed'`、`'備取 Waitlisted'`、`'已取消 Cancelled'`、`'審核中 Checking'`。

### (3) 列數擴展與驗證報錯自動救援機制 (Fault Tolerance & Row Expansion)
- **列數邊界擴充**：寫入前檢查 `startRow + rows.length - 1 > sheet.getMaxRows()`，列數不足時必須主動調用 `sheet.insertRowsAfter()` 補足，杜絕邊界崩潰。
- **Data Validation 報錯自動救援**：在 `setValues` 捕捉 Validation Exception；若範本自訂下拉選單阻擋，系統應自動執行 `range.clearDataValidations()` 解除衝突並覆寫重試，保證全量名冊 100% 入庫。

### (4) 前端 302 重導向自癒驗證 (Failed to fetch Self-Healing)
- 因 GAS Web App 回傳 302 跨網域重導向時，瀏覽器可能拋出 `TypeError: Failed to fetch`。
- 前端發起建立請求若遇 Fetch 異常，應在 catch 區塊中向 Supabase `events` 資料表查詢最新 `spreadsheet_url` 與 `spreadsheet_id` 進行自癒驗證，確認雲端已建置完成則平順接軌，杜絕假警報。


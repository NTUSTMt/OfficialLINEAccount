# 🏔️ 國立臺灣科技大學登山社 - 社團官方數位系統 (NTUST Hiking Club Official System)

[![Version](https://img.shields.io/badge/version-v0.1.138-emerald.svg)](package.json)
[![React](https://img.shields.io/badge/React-19.2.7-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.2-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.1.1-646CFF.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![LINE LIFF](https://img.shields.io/badge/LINE-LIFF%20v2.29-00C300.svg)](https://developers.line.biz/en/docs/liff/)

本系統為**國立臺灣科技大學登山社**打造之現代化官方 LINE 數位生態系，整合 **LINE Front-end Framework (LIFF)**、**Supabase PostgreSQL (單一信任源)** 與 **Google Apps Script (GAS 模組化後端)**，提供社員活動報名、裝備租借、繳費申報、心得登頂紀錄與幹部即時審核自動化。

> 📜 **歷史文件封存**：前版龐大日誌與過往除錯歷史（v0.1.0 ~ v0.1.123，逾 3,000 行紀錄）已完整歸檔至 [README_ARCHIVE.md](file:///Users/brianhung/Documents/OfficialLINEAccount/README_ARCHIVE.md)。

---

## 📑 目錄 (Table of Contents)
- [1. 系統架構總覽 (Architecture Overview)](#1-系統架構總覽-architecture-overview)
- [2. 專案目錄結構 (Project Structure)](#2-專案目錄結構-project-structure)
- [3. Supabase 資料庫與信任源規範 (Database & Single Source of Truth)](#3-supabase-資料庫與信任源規範-database--single-source-of-truth)
- [4. 資料修改途徑與試算表同步機制 (Data Modification & Sheet Sync)](#4-資料修改途徑與試算表同步機制-data-modification--sheet-sync)
- [5. 開發與交付規範 (Development Guidelines & Agent Rules)](#5-開發與交付規範-development-guidelines--agent-rules)
- [6. 本地開發與部署流程 (Quick Start & Deployment)](#6-本地開發與部署流程-quick-start--deployment)
- [7. 最新版本異動紀錄 (Changelog v0.1.138)](#7-最新版本異動紀錄-changelog-v01138)

---

## 1. 系統架構總覽 (Architecture Overview)

```mermaid
graph TD
    User([社員 / 幹部 使用者]) -->|LINE Chat 點擊選單| LIFF[React 19 LIFF 前端應用]
    User -->|LINE 文字或卡片互動| Webhook[GAS LineBot Webhook]

    subgraph "前端 Client (React 19 + TypeScript + Vite)"
        LIFF --> Router[React Router DOM]
        Router --> Dashboard[個人主頁 Dashboard]
        Router --> AdminEvents[活動與名冊管理 AdminEvents]
        Router --> Borrow[裝備租借 Borrow]
        Router --> Payment[繳費申報 Payment]
        Router --> ConfirmPayment[免登入單鍵核銷 ConfirmPayment]
    end

    subgraph "單一信任源 (Supabase PostgreSQL)"
        LIFF -->|純資料讀寫 直連 < 50ms| Supabase[(Supabase DB)]
        Supabase --> Triggers[防遞迴 Triggers]
        Triggers --> SyncQueue[sync_queue 背景佇列]
    end

    subgraph "後端模組 (Google Apps Script)"
        Webhook --> GAS[02_LineBot_Webhook.js]
        GAS --> FlexTemplates[03_Flex_Templates.js]
        GAS --> GeminiAI[04_Ai_Gemini.js]
        GAS --> DriveUpload[06_Helper_Services.js 上傳圖檔至 Drive]
        DriveUpload -->|回寫 Drive URL| Supabase
        SyncWorker[05_Sync_Worker.js 定時排程] -->|定時消費 sync_queue| GSheets[(Google 主試算表 / 活動專屬名冊)]
        GSheets -.->|handleSpreadsheetEdit 特定分頁反向監聽| Supabase
    end
```

---

## 2. 專案目錄結構 (Project Structure)

```text
OfficialLINEAccount/
├── src/                          # 前端原始碼 (React 19 + TypeScript)
│   ├── components/               # 共用 UI 元件 (AdminEventCard, AdminEventForm, etc.)
│   ├── pages/                    # 主要業務頁面 (Dashboard, AdminEvents, Borrow, Payment...)
│   ├── utils/                    # 工具函式 (supabaseClient.ts, directImage.ts, cache.ts...)
│   ├── i18n/                     # 多語系配置 (zh-TW, en)
│   └── gas.js                    # GAS 整合全模組單檔備援 Bundle
├── gas_modules/                  # GAS 模組化後端 (職責分離)
│   ├── 01_Config_Auth.js         # 全域設定、環境變數、JWT 驗證與全域中英表頭對照
│   ├── 02_LineBot_Webhook.js     # doPost Webhook 入口、文字/圖片事件路由、Email Webhook
│   ├── 03_Flex_Templates.js      # LINE Flex Message (活動卡片輪播、詳情、借用清冊)
│   ├── 04_Ai_Gemini.js           # Gemini AI 登山知識問答與裝備推薦
│   ├── 05_Sync_Worker.js         # Supabase sync_queue 排程消費、試算表同步與每日自動巡檢
│   └── 06_Helper_Services.js     # Google Drive 檔案上傳、身分驗證、郵件發送與通知
├── supabase/                     # Supabase 資料庫定義與 RPC Migration 腳本
│   ├── schema.sql                # 核心 Schema、ENUM 定義與索引
│   ├── triggers.sql              # 背景佇列寫入觸發器 (含防遞迴守衛)
│   ├── admin_events_rpc.sql      # 活動管理、截止日解析 (+08) 與報名名冊 RPC
│   ├── member_profile_rpc.sql    # 社員個資儲存與幹部身分防護 RPC
│   └── SCHEMA_DICTIONARY.md      # 資料庫欄位字典與資料型別規範
├── test/                         # Node.js 內建輕量化單元測試集 (155+ Tests)
├── README.md                     # 本專案核心導覽 (本文件)
├── README_ARCHIVE.md             # 歷史詳細改版紀錄封存
├── MEMBER_GUIDE.md               # 社員使用指南 (LINE 內嵌文檔)
└── AGENTS.md                     # AI Agent 開發守則與專案憲章
```

---

## 3. Supabase 資料庫與信任源規範 (Database & Single Source of Truth)

1. **單一信任源原則 (Single Source of Truth)**：
   - 專案所有核心商業狀態（社員狀態、活動名冊、租借庫存、繳費狀態）以 **Supabase PostgreSQL** 為唯一信任源。
   - Google Sheets 僅作為幹部試算表檢視輔助與離線備忘，嚴禁將 Google Sheets 當作業務判斷的真理來源。
2. **防遞迴守衛 (Recursion Guards)**：
   - 所有 PostgreSQL 觸發器與連動函式開頭必須強制具備防遞迴守衛：
     ```sql
     IF pg_trigger_depth() > 1 THEN
         RETURN NEW;
     END IF;
     ```
3. **時區標準 (Asia/Taipei UTC+8)**：
   - 活動截止時間 (`events.deadline`) 儲存時一律標記為台灣時區（如 `YYYY-MM-DD 23:59:59+08`）。
   - 查詢與格式化時一律使用 `AT TIME ZONE 'Asia/Taipei'`，防止跨日多算一天（例如 9/22 23:59 被誤轉為 9/23）。
4. **純資料走 Supabase 直通**：
   - 無 Google Drive 實體圖檔上傳之純欄位更新，前端直接走 Supabase REST Client / RPC，杜絕 iOS LINE WebKit 對 GAS 302 跨域重導向之 `Load failed` 報錯。

---

## 4. 資料修改途徑與試算表同步機制 (Data Modification & Sheet Sync)

### (1) 修改 Supabase 的四大途徑

| 途徑 | 適用情境 | 即時性與可靠度 | 試算表連動方式 |
| :--- | :--- | :--- | :--- |
| **途徑一：LIFF 幹部前台網頁** *(首選)* | 活動建立與編輯、報名名冊審核、裝備歸還、核銷操作。 | **極速 (<50ms)**，具前端資料校驗與防併發保護。 | Supabase 觸發器寫入 `sync_queue`，定時同步至主試算表。 |
| **途徑二：Supabase 官方 Dashboard** | 資料庫維護、歷史資料清洗、批次 SQL 修正。 | **即時生效**。 | 自動觸發 `sync_queue` 排程同步至主試算表。 |
| **途徑三：主試算表直接編輯** | 幹部偏好試算表批次對帳、名冊直接填寫審核結果。 | **即時生效**（需安裝 Trigger，僅限特定欄位）。 | 透過 `handleSpreadsheetEdit` 即時 PATCH 回寫 Supabase。 |
| **途徑四：LINE Bot 群組推播 / Email 核銷** | 幹部於群組點擊審核按鈕、於通知信點擊「確認無誤」。 | **即時生效** (GAS 呼叫 Supabase API)。 | 自動更新 Supabase，再排程同步至試算表。 |

### (2) 試算表即時反向同步範圍與限制
若幹部直接在主試算表儲存格中編輯，系統透過 `handleSpreadsheetEdit`（需在試算表選單點選「🏔️ 社團系統」>「⚙️ 安裝試算表即時編輯觸發器」）反向更新 Supabase：

- ✅ **支援即時反向同步的分頁與欄位**：
  - **Payments (繳費分頁)**：修改狀態為「已確認無誤」或「已核銷 Confirmed」，會觸發核銷程序並回寫 Supabase。
  - **Loans (租借分頁)**：修改狀態為「已歸還 Returned」，會更新 Supabase 並自動回補裝備庫存。
  - **Event_Signups (報名名冊) / 各活動專屬名冊**：修改「審核結果」、「狀態」、「繳費狀態」、「備註」，會即時反向 PATCH 回 Supabase。
- ❌ **尚未支援試算表反向同步的分頁**：
  - `members`（社員個資、幹部職稱）、`events`（活動資訊、費用、日期）、`equipments`（器材品項與規格）目前未設置試算表反向同步。
  - **請勿在試算表中直接修改這些分頁**，請統一由 LIFF 後台或 Supabase Dashboard 修改，否則下一次執行全量同步時試算表的手動修改將被覆蓋。

### (3) Supabase 新增欄位與試算表自適應
- **背景佇列同步 (`_ensureColumnsExist`)**：當 Supabase 異動時，若試算表缺少該欄位，系統會自動在第 1 列最右側追加新欄位。
- **全量覆蓋更新 (`overwriteMainSpreadsheetFromSupabase`)**：幹部可隨時於試算表點選「🏔️ 社團系統」>「🔄 全量從 Supabase 覆蓋更新主試算表」，系統將向 Supabase OpenAPI 自動動態探索所有資料表與新欄位，一鍵完整同步。

---

## 5. 開發與交付規範 (Development Guidelines & Agent Rules)

根據 [AGENTS.md](file:///Users/brianhung/Documents/OfficialLINEAccount/AGENTS.md) 與專案核心規範：

1. **錯誤訊息一律直接印出**：
   - 無論前端 UI、後端 API 或資料庫 RPC，發生錯誤時必須直接顯示完整具體的錯誤原因（如 `error.message`、PostgreSQL 錯誤代碼），嚴禁遮蔽或包裝為空泛的「請聯絡管理員」。
2. **檔案變更需經使用者同意**：
   - 在修改現有程式碼檔案前，必須先提出具體的 Implementation Plan 並徵得使用者同意後方可執行。
3. **版本號自動遞增**：
   - 每次修改程式碼或架構後，必須在 `package.json` 與相關說明中遞增版本號 tag（如 `v0.1.124`）。
4. **依賴套件管理**：
   - 專案統一使用 `pnpm` 管理套件，嚴禁使用 npm 或 yarn。
5. **文件持續維護**：
   - 每次程式碼變更後，必須以繁體中文更新 `README.md`。

---

## 6. 本地開發與部署流程 (Quick Start & Deployment)

### 環境需求
- Node.js >= 20.x
- pnpm >= 9.x

### 指令清單
```bash
# 安裝相依套件
pnpm install

# 啟動本地 Vite 開發伺服器
pnpm dev

# 執行 TypeScript 型別檢查與生產打包建置
pnpm build

# 執行全套單元測試 (含時區、同步、鑑權等 155+ 測試)
pnpm test
```

### GAS 後端部署
1. 開啟專案對應之 Google Apps Script 專案。
2. 將 `gas_modules/` 下各模組（或打包後的 `src/gas.js`）內容貼入對應之 GAS 指令碼檔案中。
3. 確保 Script Properties 配置必要變數：`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SPREADSHEET_ID`, `MEMBER_BOT_TOKEN`, `ADMIN_BOT_TOKEN`。
4. 部署為 Web 應用程式 (Execute as: Me, Who has access: Anyone)。

---

## 7. 最新版本異動紀錄 (Changelog v0.1.137)

### v0.1.137 (2026-09-17)
- **活動獨立試算表自動建立解耦與手動一鍵生成 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**:
  - **取消新活動建立時自動建立試算表**: 修改 `_handleSaveEvent`，建立新活動時不再自動生成 Google Drive 資料夾與試算表，避免活動尚未發布前產生幽靈試算表，並大幅加快新活動建立速度。
  - **全新實作 `create_event_sheet` API**: 幹部可由活動管理頁面一鍵觸發建立。後端自動進行幹部身分校驗，在 Google Drive 建立專屬活動資料夾與 22 欄「報名名冊」工作表（包含隱藏 `_CONFIG` 系統設定頁）。
  - **自動全量匯入既有名冊資料**: 建立試算表時，自動自 Supabase `event_signups` 撈取該活動目前既有的所有報名者資料，並連動 `members` 取得完整姓名、身分證字號、電話、生日、性別、緊急聯絡人、體能與審核繳費狀態，全量批次寫入試算表。
  - **自動回寫 Supabase 單一信任源**: 建立完成後自動將 `spreadsheet_url`、`spreadsheet_id`、`drive_folder_url` 寫入 Supabase `events` 表，後續新報名即可無縫自動追加同步。
- **前端活動管理卡片按鈕自適應狀態切換 ([AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx), [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**:
  - **建立按鈕與載入防呆**: 若活動尚未建立試算表（`!evt.spreadsheetUrl`），顯示「建立獨立試算表」按鈕；點擊後呈現 Loading 狀態並防重複提交。
  - **即時狀態切換**: 建立成功後，按鈕即時轉為「報名試算表」與「活動資料夾」超連結按鈕，供幹部隨時點擊開啟。
  - **免使用者授權機制**: 全程透過 GAS 後端 Web App 以社團伺服器身分執行，幹部端無需個人 Google 帳號授權或彈出視窗。
- **單元測試全數覆蓋**:
  - 新增 [test/63_manual_create_event_sheet_and_import.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/63_manual_create_event_sheet_and_import.test.mjs)，包含新活動解耦、幹部身分校驗、名冊全量欄位格式匯入與冪等性測試，全專案 180 項單元測試全數通過。

### v0.1.136 (2026-09-17)
- 🏔️ **小岳 AI 客服活動瀏覽範圍擴充與智能過濾 ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **支援瀏覽近期報名截止但尚未開始出隊之活動**：
    - 全新實作 `_filterEventsForAiContext`：小岳 AI 知識庫上下文除包含「開放報名中」活動外，現在亦能主動讀取「報名已截止/已關閉，但活動尚未開始出隊（`start_date >= 今日` 或 `end_date >= 今日`）」的近期活動。
    - 方便已報名社員或有興趣之社員向小岳詢問出隊行程安排、注意事項與登山裝備準備。
  - **嚴格排除已結束之歷史關閉活動**：
    - 活動結束日或開始日小於今日（`end_date < 今日` 且 `start_date < 今日`）的已過期關閉活動一律嚴格過濾排除，不載入上下文，杜絕歷史陳年舊活動干擾 AI 判斷。
  - **System Instruction 新增狀態應答指引**：
    - 明確規範小岳：當社員詢問「報名已截止/已關閉但尚未開始」的活動內容時，可熱情介紹行程與裝備；但若社員詢問「是否還能報名」，小岳必須明確禮貌告知「該活動目前報名已截止/關閉，無法再報名」，若有特殊個案需求請直接在聊天室留言洽詢社團幹部。
- 🌐 **落實透明錯誤處理與中英雙語 Fallback 提示 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **中英雙語對照**：當 AI 客服發生連線異常或伺服器超載時，提示訊息全面升級為中英雙語對照版本，體貼國際生與英語使用者。
  - **杜絕空泛錯誤遮蔽**：徹底落實專案核心規範第一條，將原先空泛的「小岳目前連線稍微忙碌」升級為直接帶出具體錯誤狀態代碼與原因（例如 `HTTP 503: No capacity available` 或 `GEMINI_API_KEY 未設定`），便於使用者與維護團隊快速排查。
- ⚡ **Gemini 模型端點升級**：
  - 後端端點統一採用 Google AI Studio 高配額、低延遲主力模型 **`gemini-3.5-flash-lite`**（每日 500 次 RPD、250K TPM），徹底解決過去旗艦版 20 RPD 配額過低及伺服器 503 超載問題。
- 🧪 **單元測試全數覆蓋**：
  - 新增 [test/62_ai_closed_upcoming_events_and_bilingual_fallback.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/62_ai_closed_upcoming_events_and_bilingual_fallback.test.mjs)，覆蓋開放中活動、截止但未開始活動、歷史過期活動排除、上下文標籤以及雙語錯誤透明輸出測試，全專案 175 項單元測試全數通過。

### v0.1.135 (2026-09-16)
- 🔗 **幹部活動管理 RPC 完整整合 `line_group_url` ([supabase/add_line_group_url_to_events.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_line_group_url_to_events.sql), [supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql))**：
  - **解決活動編輯表單無法反向帶出群組連結問題**：
    - 更新 `get_admin_events_rpc` 查詢，將 `e.line_group_url` 納入 `GROUP BY` 與 `jsonb_build_object`，使幹部後台活動清單與編輯表單能精確取得已儲存的群組連結。
    - 更新 `save_admin_event_rpc`，確保活動 UPSERT 時 `line_group_url` 欄位更新維持一致。
    - 全面賦予 `service_role` 執行權限，保證跨環境 RPC 調用順暢。
  - **全鏈路遷移腳本合一**：
    - 將 `events.line_group_url` 欄位新增、`get_my_dashboard`、`get_admin_events_rpc` 與 `save_admin_event_rpc` 整合至單一遷移腳本 [supabase/add_line_group_url_to_events.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_line_group_url_to_events.sql)，幹部僅需在 Supabase 執行單次即可完成所有權限與功能配置。

### v0.1.134 (2026-09-16)
- 🛠️ **修復 `get_my_dashboard` RPC 裝備資料表欄位錯誤 ([supabase/add_line_group_url_to_events.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_line_group_url_to_events.sql), [supabase/get_my_dashboard.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/get_my_dashboard.sql))**：
  - **解決 PostgreSQL `column l.pickup_date does not exist` 致命錯誤**：
    - 修復遷移腳本中 `get_my_dashboard` RPC 錯誤引用 `l.pickup_date` 與 `l.return_date` 的問題，校正為資料庫實際欄位 **`l.start_date`** 與 **`l.end_date`**。
    - 聚合回傳之 JSON 結構完全對齊前端 TypeScript `DashboardEquipmentData` 介面（`orderId`, `itemName`, `pickupDate`, `returnDate`, `status`, `payStatus`）。
  - **補齊幹部身分資訊回傳**：
    - 於個人資料回傳結構 `v_profile` 中加入 `isOfficer`（是否具幹部身分）與 `officerRole`（幹部職銜角色），確保主頁面與管理端介面狀態一致。
  - **測試與建置驗證**：
    - 167 項單元測試全數通過，TypeScript 型別檢查與 Vite build 正常。

### v0.1.133 (2026-09-16)
- 🌐 **報名資料未完整防呆推播中英對稱健全化 ([gas_modules/03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **英文版缺漏清單完整輸出**：修復原先英文段落僅有 `update the required information above` 而未列出具體缺漏欄位的缺陷。全新定義 `missingFormattedEn`，將各缺漏項目精確對應至完整英文欄位名稱（如 `👉 Fitness Proof`、`👉 Hiking Experience`），中英文雙語內容達到 100% 鏡像對齊。
  - **移除原始 URL 網址暴露**：依據使用者要求，徹底移除文末生硬的原始 LIFF 連結字串（`👉 https://liff.line.me/...`），統一引導社員直接點選 LINE 底部圖文選單的「填寫資料 / Register」開啟設定，介面更加簡潔專業。
  - **單元測試全數覆蓋**：更新 [test/61_event_group_url_and_accepted_notification.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/61_event_group_url_and_accepted_notification.test.mjs)，驗證中英欄位映射與無原始連結規則，167 項測試全數 Pass。

### v0.1.132 (2026-09-16)
- 🔗 **一鍵加入活動專屬群組全鏈路功能實施 (One-Click Event LINE Group Join Feature)**：
  - **資料庫與 RPC 隱私架構升級 ([supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql), [supabase/get_my_dashboard.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/get_my_dashboard.sql), [supabase/add_line_group_url_to_events.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_line_group_url_to_events.sql))**：
    - `events` 資料表擴充 `line_group_url TEXT` 欄位，支援自動自我修復結構遷移。
    - `save_admin_event_rpc` 與 `get_admin_events_rpc` 支援 `line_group_url` 讀寫與同步。
    - `get_my_dashboard` RPC 落實**嚴格隱私權限控制**：僅當報名狀態包含「正取」且非「取消」時（`s.status::text LIKE '%正取%' AND s.status::text NOT LIKE '%取消%'`）才向前端回傳 `lineGroupUrl`，杜絕未錄取或訪客透過網路 API 窺探群組連結。
  - **幹部後台活動編輯與格式嚴格防呆 ([AdminEventForm.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventForm.tsx), [AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx))**：
    - **新增活動強制必填**：幹部發布新活動時，群組連結設定為必填項目；編輯舊活動若為空則顯示溫馨補填提示。
    - **格式驗證並排除 OpenChat**：僅限一般 LINE 群組邀請連結（`https://line.me/R/ti/g/...` 或 `https://line.me/ti/g/...`），前端正規表達式嚴格阻擋並排除 LINE 社群（`ti/g2/`），避免入群審核與密碼混亂。
    - **推播前防呆阻擋機制**：一鍵發送審核通知前，若該活動尚有正取人員待通知但未填寫群組連結，系統強制阻擋並彈出警示，杜絕發出失效或空白通知。
    - **幹部卡片直達捷徑**：[AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx) 新增「活動群組」快捷連結，方便幹部快速進群管理。
  - **正取 Flex Message 推播卡片升級 ([src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
    - 改造正取通知 Bubble 卡片，採用清爽垂直雙按鈕設計，**全無 emoji**：
      1. 上方主要按鈕（綠色 `#1DB446`）：`加入活動群組 Join Group`（點擊直接喚起 LINE 加入出隊專屬群組）
      2. 下方次要按鈕（深灰 `#475569`）：`前往繳費系統 Pay`（導向 LIFF 繳費）
    - 同步更新通知內文引導，提醒社員錄取後點擊按鈕直接加入出隊專屬群組。
  - **個人主頁 Dashboard 備援按鈕 ([Dashboard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Dashboard.tsx))**：
    - 正取社員登入「我的活動」卡片時，亦提供綠色「加入活動群組 Join Group」按鈕（無 emoji），避免社員誤刪 LINE 推播訊息而無法入群。
  - **Google Sheets 雙向同步對齊**：
    - 試算表 `events` 分頁新增同名欄位 `line_group_url`，幹部亦可直接在試算表中查閱群組連結。
  - **全套單元測試覆蓋**：
    - 新增 [test/61_event_group_url_and_accepted_notification.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/61_event_group_url_and_accepted_notification.test.mjs)，驗證正則檢驗、OpenChat 排除、RPC 結構與推播防呆，全套 166 項測試 100% 通過，打包建置無錯誤。

### v0.1.131 (2026-09-16)
- 🤖 **小岳 AI 客服回覆末尾自動附加中英對照免責警示語 ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **自動附加雙語警語**：每次小岳 AI 生成回覆時，於訊息最末端統一加入明確且友善的中英對照聲明：
    ```text
    ─────────────
    小岳是 AI，小岳可以出錯
    Yue is AI. Yue can make mistake.
    ```
  - **確保登山安全認知**：明確提醒使用者 AI 生成之戶外資訊與建議僅供參考，若遇特定路況或行程細節仍應與幹部確認。
- 🧪 **單元測試全數覆蓋**：
  - [test/60_ai_mention_and_chat_keyword_cleanup.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/60_ai_mention_and_chat_keyword_cleanup.test.mjs) 擴充免責聲明結尾格式驗證，162 項單元測試全數 Pass。

### v0.1.130 (2026-09-16)
- 📋 **活動報名表 `event_signups` 新增 `line_id` 欄位並直接綁定 `members.line_id` ([supabase/add_line_id_to_event_signups.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_line_id_to_event_signups.sql), [supabase/schema.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql))**：
  - **欄位擴充與歷史回填**：於 `event_signups` 資料表新增 `line_id TEXT` 欄位，並提供一次性更新將既有報名資料中對應 `line_user_id` 之 `line_id` 完整回填。
  - **雙向自動連動觸發器 (Triggers with Recursion Guard)**：
    - `trg_signup_sync_member_info`：新增報名時，若未傳入 `line_id` 或姓名，Trigger 自動自 `members` 資料表查詢填入。
    - `trg_member_sync_to_signups`：當社員於個人主頁修改自訂 LINE ID 或姓名時，Trigger 自動串聯更新該社員在 `event_signups` 的所有報名紀錄。
    - 嚴格守衛：所有觸發器開頭均包含 `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;` 防遞迴守衛。
- 🔄 **GAS 試算表與報名同步對齊 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - `schemaMap.event_signups` 與 `_syncSignupToSheet` 的 `allowedCols` 正式納入 `line_id`，若報名同步至試算表時缺少 `line_id`，系統將自動向 `members` 查詢補齊，確保主試算表名冊包含隊員自訂 LINE ID。
  - `_getGlobalColumnAliases` 擴充支援 `自訂Line`、`自訂LINE ID`。
- 🧪 **單元測試全數覆蓋**：
  - [test/59_event_deadline_timezone_and_sheet_sync.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/59_event_deadline_timezone_and_sheet_sync.test.mjs) 擴充 `line_id` 欄位白名單驗證，161 項單元測試全數 Pass。

### v0.1.129 (2026-09-16)
- 🧠 **小岳 AI 客服語言鏡像與嚴格純文字 (No Markdown) 規範 ([gas_modules/04_Ai_Gemini.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/04_Ai_Gemini.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **提問語言鏡像一致性 (Language Mirroring)**：嚴格規範小岳 AI 依據提問語言對齊回答（以英文提問則一律以自然英文回答、以繁體中文提問則以繁體中文回答、日文問日文答），杜絕擅自切換語言或混雜。
  - **嚴格純文字輸出 (Strictly Plain Text Only)**：全面嚴禁 Markdown 語法格式標記（禁止使用 `**粗體**`、`*斜體*`、`# 標題`、反引號代碼區塊與 Markdown 連結語法），排版一律以自然換行、條列符號（•）、數字列表（1. 2. 3.）與 emoji 呈現。
  - **新增防禦性過濾函式 `_stripMarkdown`**：即使 LLM 模型產生殘留 Markdown 標記，於送出至 LINE 前端時一律自動轉為純文字與原生 URL 連結，杜絕星號與井號殘留在聊天室中。
- 🧪 **單元測試全數覆蓋**：
  - [test/60_ai_mention_and_chat_keyword_cleanup.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/60_ai_mention_and_chat_keyword_cleanup.test.mjs) 擴充 `_stripMarkdown` 粗體、斜體、標題、程式碼、超連結、刪除線過濾之單元測試，161 項單元測試全數 Pass。

### v0.1.128 (2026-09-16)
- 🎯 **恢復「最新活動 Activities」指令支援 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **圖文選單與聊天指令無縫支援**：完整加回最新活動輪播卡片調用邏輯，支援「最新活動 Activities」、「最新活動」、「Activities」、「Activiies」（容錯包含常見拼寫）、「報名活動」與「Events」。
  - **對外客服 @Yue 查詢連動**：支援在群組或私聊中輸入 `@Yue 最新活動` 或 `Yue activities` 立即觸發 `sendEventList`，直連 Supabase 回傳最新活動輪播。
- 🤖 **選單文字同步對齊**：
  - 更多服務次級選單卡片與 Webhook 指令同步更新為「🤖 小岳說明 AI Guide」，提升對外客服品牌認知一致性。
- 🧪 **單元測試全數覆蓋**：
  - [test/60_ai_mention_and_chat_keyword_cleanup.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/60_ai_mention_and_chat_keyword_cleanup.test.mjs) 擴充最新活動指令與容錯測試，160 項單元測試全數 Pass。

### v0.1.138 (2026-09-17)
- **活動獨立試算表與雲端資料夾手動生成健全化 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js), [src/components/admin/AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx))**：
  - **解耦自動建立流程**：活動新增與儲存時不再強制自動生成 Google 試算表與資料夾，避免活動建立時產生無謂試算表及等待時間。
  - **幹部手動一鍵生成**：於幹部後台活動卡片新增「建立資料夾與試算表」按鈕，幹部點擊後透過 GAS 免個人 Google 帳號授權建立該活動專屬 Google Drive 資料夾與試算表。
  - **名冊與個資自動拉取**：建立時自動從 Supabase `event_signups` 與 `members` 拉取該活動既有之報名資料與個人資訊，完整填入 22 個欄位至「報名名冊」工作表，並將試算表與資料夾連結自動回寫至 Supabase `events` 資料表。
  - **修復卡片操作列顯示門檻**：修復 `AdminEventCard.tsx` 外層條件守衛，確保新建立且尚未具有任何外部雲端連結的活動卡片，亦能穩定顯示「建立資料夾與試算表」按鈕，建立完成後立即無縫切換為「活動資料夾」與「報名試算表」連結。

### v0.1.127 (2026-09-16)
- 🛠️ **Supabase `admin_events_rpc.sql` 參數名稱一致性與防禦修復 ([supabase/admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql))**：
  - **解決 PostgreSQL 42P13 參數重命名錯誤**：修復 `sync_officer_cache_rpc` 函式第一個參數名稱為 `p_officer_line_user_id`，確保與現有資料庫結構及前端呼叫端 (`src/utils/supabaseClient.ts`) 完全對齊。
  - **加入防禦性 DROP FUNCTION**：於函式建立前加上 `DROP FUNCTION IF EXISTS sync_officer_cache_rpc(TEXT, TEXT, TEXT);`，徹底避免資料庫更新時發生簽名與參數衝突，提供 100% 冪等性與安全執行體驗。

### v0.1.126 (2026-09-16)
- 🏔️ **對外客服「小岳 (Yue)」與幹部管理「小岳助理」嚴格隔離解耦 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **英文名字「Yue」正式支援**：對外 AI 客服完整支援英文名「Yue」（大小寫不拘、詞邊界精準匹配，如 `Yue 玉山有多高`、`yue, how high is Yushan?`、`@Yue 裝備怎麼借`），杜絕單字（如 rescue, continue）誤觸發。
  - **前綴標點自動清理**：自動清除「小岳」、「Yue」、「@Yue」及接續的逗號、冒號等標點符號，將乾淨問題交付 Gemini API。
  - **雙語友善引導**：社員若單獨輸入 `Yue`、`@Yue` 或 `小岳`，自動回傳繁中與英文雙語提問範例與操作指引。
  - **「小岳助理」幹部專用與完全靜默守衛**：
    - 「小岳助理」嚴格僅於已綁定之幹部管理群組內響應（或於群組執行綁定指令）。
    - 於 1 對 1 私聊或一般非幹部群組中若呼叫「小岳助理」，系統採**完全靜默模式**，不予回應、不調用對外 AI、亦不假冒幹部小幫手，徹底杜絕權限混淆。
    - 於登山出隊活動群組中，社員可透過 `@小岳` 或 `@Yue` 呼叫對外 Bot 進行活動與山岳諮詢。
- 📖 **社員使用指南 ([MEMBER_GUIDE.md](file:///Users/brianhung/Documents/OfficialLINEAccount/MEMBER_GUIDE.md)) 中英文同步更新**：
  - 第 9 節「智慧 AI 客服」中英文版同步載明社員可使用中文名「小岳」或英文名「Yue」進行 1 對 1 或群組諮詢。
- 🧪 **單元測試全數覆蓋**：
  - 更新 [test/60_ai_mention_and_chat_keyword_cleanup.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/60_ai_mention_and_chat_keyword_cleanup.test.mjs)，驗證「Yue」觸發、邊界過濾、標點清除、小岳助理私聊/非幹部群組靜默及幹部群組響應，159 項單元測試全數 Pass，前端 build 順利。

### v0.1.125 (2026-09-16)
- 🤖 **小岳 AI 客服顯式觸發機制健全化 ([gas_modules/02_LineBot_Webhook.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/02_LineBot_Webhook.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - **強制「小岳」開頭/包含觸發**：修改 1 對 1 私聊與群組文字事件處理邏輯，只有訊息中包含「小岳」（如：「小岳 玉山有多高」、「@小岳 裝備怎麼借」）時，才會啟動 Gemini AI 進行知識庫應答，並自動去除「小岳」前綴將乾淨問題送給模型。
  - **杜絕普通訊息攔截**：若訊息未包含「小岳」（例如純輸入「玉山有多高」或向社團詢問行政庶務），系統一律保持靜默，不啟動 AI 亦不發送招呼語洗版，訊息完整保留於 LINE 官方後台供真人幹部查看並親切回覆。
  - **單純叫名引導**：若僅輸入「小岳」或「@小岳」，自動回傳友善提問範例引導，而非丟空字串給模型。
- 🧹 **聊天室純文字指令與過時關鍵字全面清理**：
  - 徹底移除過往文字指令攔截（「最新活動」、「Activities」、「嗨」、「哈囉」、「選單」等），避免普通對話遭無效機器人字串打斷。
  - 保留圖文選單按鈕必要之「更多服務 More Services」、次級選單按鈕（「使用指南」、「幹部是誰」、「意見與回饋」）及幹部核銷指令（「核銷 PAY_xxx」）。
- 📖 **社員使用手冊 ([MEMBER_GUIDE.md](file:///Users/brianhung/Documents/OfficialLINEAccount/MEMBER_GUIDE.md)) 中英文版同步對齊更新**：
  - **導航途徑更新**：由舊有的「四大途徑」精簡為「兩大導航途徑」（LINE 官方底部圖文選單、系統頂部個人頭像下拉選單），全篇移除「途徑四：聊天室輸入文字指令」。
  - **裝備租借狀態同步**：依據資料庫與個人主頁實際邏輯，更新為「待領取 To Be Collected」、「使用中 In Use」、「已歸還 Returned」、「已取消 Cancelled」，並載明幹部聯繫取裝與社辦點交流程。
  - **移除不存在之個人成就勳章牆**：刪除「個人成就勳章牆 (Badges)」段落，將該章節聚焦於「出隊心得填寫 (Footprints & Reflections)」與活動評分、照片上傳。
  - **小岳 AI 調用說明更新**：明確標註私聊提問必須以「小岳」開頭方會答覆，一般提問將由幹部回覆。
  - **中英文 Part I / Part II 100% 鏡像對齊**：同步修正英文版對應章節、狀態清單、導航方式與 FAQ。
- 🧪 **單元測試擴充**：
  - 新增 `test/60_ai_mention_and_chat_keyword_cleanup.test.mjs`，測試全數 158 項通過，前端打包建置無錯誤。

### v0.1.124 (2026-09-16)
- 🕒 **活動截止時間時區偏移與跨日 Bug 徹底修復**：
  - 修正 [admin_events_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/admin_events_rpc.sql)：儲存截止日強制帶入 `+08` 台灣時區，讀取時強制以 `AT TIME ZONE 'Asia/Taipei'` 格式化，徹底解決 9/22 截止變成 9/23 的跨日問題。
  - 修正 [06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js) 與 [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js)：`deadlineIso` 改用 `+08:00` 偏移量，杜絕誤當 UTC `Z`。
  - 修正 [03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js)：`_formatEventDate` 加入歷史資料 `23:59:59Z` 容錯還原機制，既有卡片與新卡片均能精確呈現正確年月日。
- 🚫 **過期活動狀態連動與前端防呆優化**：
  - 修正 [AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx)：當活動已過期且資料庫狀態仍為「開放」時，狀態標籤改為顯示「已截止 (過期)」紅/橘警示樣式，不再誤導顯示綠色「開放報名」。
  - 修正 [03_Flex_Templates.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/03_Flex_Templates.js)：LINE Bot 詳細活動卡片與輪播在活動到期後，一律切換為「報名已截止 Closed」並將按鈕轉為灰色訊息按鈕。
- 🔄 **每日巡檢排程修復與試算表佇列欄位補齊**：
  - 修正 [05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js)：修正定時排程 PostgREST API 查詢中的欄位名稱錯誤（`select=id,name,deadline` 修正為 `select=id,title,deadline`；社員到期查詢修正為 `payment_status` 與 `membership_expires_at`），使自動關閉過期活動排程能順暢每日執行。
  - 補齊 `_syncSignupToSheet` 之 `allowedCols`：正式納入 `name`、`is_official_member_snapshot`、`cancel_reason`，並支援社員姓名自動自 members 表補齊，解決試算表報名者姓名空白問題。
  - 擴充 [01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js)：在 `_findHeaderCol` 加入通用中英欄位對照字典 `_getGlobalColumnAliases`，純中文或純英文表頭皆能自適應寫入。
- 📚 **文件結構優化**：
  - 將前版 411KB `README.md` 完整封存至 `README_ARCHIVE.md`。
  - 重新建立精簡清晰、現代架構的繁體中文新版 `README.md`。
  - 新增單元測試 `test/59_event_deadline_timezone_and_sheet_sync.test.mjs`，測試全數 155 項通過。

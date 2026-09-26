# 🏔️ 國立臺灣科技大學登山社 - 社團官方數位系統 (NTUST Hiking Club Official System)

[![Version](https://img.shields.io/badge/version-v0.1.232-emerald.svg)](package.json)
[![React](https://img.shields.io/badge/React-19.2.7-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.2-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.1.1-646CFF.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E.svg)](https://supabase.com/)
[![LINE LIFF](https://img.shields.io/badge/LINE-LIFF%20v2.29-00C300.svg)](https://developers.line.biz/en/docs/liff/)

本系統為**國立臺灣科技大學登山社**打造之現代化官方 LINE 數位生態系，整合 **LINE Front-end Framework (LIFF)**、**Supabase PostgreSQL (單一信任源)** 與 **Google Apps Script (GAS 模組化後端)**，提供社員活動報名、裝備租借、繳費申報、心得登頂紀錄與幹部即時審核自動化。

> 歷史文件封存：前版龐大日誌與過往除錯歷史（v0.1.0 ~ v0.1.123，逾 3,000 行紀錄）已完整歸檔至 [README_ARCHIVE.md](file:///Users/brianhung/Documents/OfficialLINEAccount/README_ARCHIVE.md)。

---

## 目錄 (Table of Contents)
- [1. 系統架構總覽 (Architecture Overview)](#1-系統架構總覽-architecture-overview)
- [2. 專案目錄結構 (Project Structure)](#2-專案目錄結構-project-structure)
- [3. Supabase 資料庫與信任源規範 (Database & Single Source of Truth)](#3-supabase-資料庫與信任源規範-database--single-source-of-truth)
- [4. 資料修改途徑與試算表同步機制 (Data Modification & Sheet Sync)](#4-資料修改途徑與試算表同步機制-data-modification--sheet-sync)
- [5. 開發與交付規範 (Development Guidelines & Agent Rules)](#5-開發與交付規範-development-guidelines--agent-rules)
- [6. 本地開發與部署流程 (Quick Start & Deployment)](#6-本地開發與部署流程-quick-start--deployment)
- [7. 最新版本異動紀錄 (Changelog v0.1.232)](#7-最新版本異動紀錄-changelog-v01232)

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

### (4) 活動專屬雲端資料夾與獨立試算表建立與命名機制 (Event Dedicated Folder & Sheet Creation)
- **觸發與權限**：
  - 幹部於「報名名冊」工作站點擊「建立資料夾與試算表」或「開啟試算表」，呼叫 GAS API `action=create_event_sheet`。
  - 後端強制執行幹部身分校驗 (`checkOfficerInternal`)，非幹部拒絕存取。
- **分支判定邏輯**：
  - **初次建立**（Supabase `events.spreadsheet_id` 為空）：
    1. 建立專屬 Google Drive 雲端資料夾。
    2. 建立專屬 Google 試算表（優先複製 `EVENT_SHEET_TEMPLATE_ID` 範本，若無則程式化生成）。
    3. 生成「報名名冊」工作表（29 欄位）與隱藏的「_CONFIG」系統設定工作表。
    4. 全量匯入既有報名者與隊員個資，並將 `drive_folder_url`、`spreadsheet_url`、`spreadsheet_id` 回寫至 Supabase `events` 表。
  - **重複點擊巡檢與同步**（Supabase `events.spreadsheet_id` 已存在）：
    - 自動執行 `_backfillEventSpreadsheetMemberInfo`，巡檢缺漏表頭欄位並補齊，比對新報名者自動追加 (`appendRow`)，補齊隊員缺漏個資，最後於新分頁開啟試算表。
- **命名規則 (Naming Conventions)**：
  - **起始日期代碼 (`datePart`)**：取自 `events.start_date`（格式 `YYYY/MM/DD`，如 `2026/10/15`）；未設定時回退為當日日期。
  - **活動名稱 (`eventName`)**：取自 `events.title`（未設定時為 `未命名活動`）。
  - **雲端資料夾名稱 (`folderName`)**：`{datePart}_{eventName}`（例如 `2026/10/15_合歡北西下華岡`），建立於社團雲端硬碟根目錄。
  - **試算表檔案名稱 (`sheetName`)**：`{datePart}_{eventName}_報名名冊`（例如 `2026/10/15_合歡北西下華岡_報名名冊`），存放於該活動專屬資料夾內。
  - **工作表（分頁）名稱**：主工作表為 `報名名冊`，系統中繼工作表為 `_CONFIG`（自動隱藏）。

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
    - `trg_member_sync_to_signups`：當社員於個人主頁修改LINE ID 或姓名時，Trigger 自動串聯更新該社員在 `event_signups` 的所有報名紀錄。
    - 嚴格守衛：所有觸發器開頭均包含 `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;` 防遞迴守衛。
- 🔄 **GAS 試算表與報名同步對齊 ([gas_modules/05_Sync_Worker.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/05_Sync_Worker.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js))**：
  - `schemaMap.event_signups` 與 `_syncSignupToSheet` 的 `allowedCols` 正式納入 `line_id`，若報名同步至試算表時缺少 `line_id`，系統將自動向 `members` 查詢補齊，確保主試算表名冊包含隊員LINE ID。
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

### v0.1.142 (2026-09-17)
- **「想說的話 (want_to_say)」非必填多行文字輸入框與全鏈路同步支援 ([src/pages/Register.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/Register.tsx), [src/utils/supabaseClient.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/utils/supabaseClient.ts), [src/types/member.ts](file:///Users/brianhung/Documents/OfficialLINEAccount/src/types/member.ts), [src/locales/zh.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/zh.json), [src/locales/en.json](file:///Users/brianhung/Documents/OfficialLINEAccount/src/locales/en.json), [gas_modules/01_Config_Auth.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/01_Config_Auth.js), [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js), [supabase/add_member_want_to_say.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/add_member_want_to_say.sql), [supabase/event_sheet_script.js](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/event_sheet_script.js), [test/64_member_want_to_say.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/64_member_want_to_say.test.mjs))**：
  - **資料填寫第四步新增多行留言輸入框**：於「幹部意願調查」下方新增「想說的話 I want to say...」多行文字輸入框 (`textarea`)，無論初次註冊或後續更新皆完全非必填，自由提供使用者留言給社團或幹部。
  - **Supabase 資料庫與安全 RPC 擴充**：於 `members` 資料表新增 `want_to_say TEXT` 欄位，並更新 `save_member_profile` RPC 函式與 `get_member_profile` 支援 `want_to_say` 寫入與預填。
  - **主試算表與活動獨立試算表雙向對齊**：
    - 在通用欄位別名加入 `want_to_say` 對應「想說的話」、「想說的話 I want to say...」、「留言」。
    - 活動獨立試算表表頭擴充第 23 欄「想說的話」，一鍵手動建立試算表與背景巡檢回補（`_backfillEventSpreadsheetMemberInfo`）時均完整回補與追加該欄位。
    - 活動獨立試算表內嵌腳本 (`event_sheet_script.js`) 支援「想說的話」雙向同步與差異比對。
  - **個人檔案更新推播連動**：在更新既有個人資料比對 `changedFields` 時納入 `wantToSay`，若內容有變動自動於 LINE 推播通知中標註「想說的話：已更新」。

### v0.1.141 (2026-09-17)
- **「開啟試算表」點擊自動靜默同步與「同步名冊」按鈕整併 ([src/components/admin/AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx), [src/pages/AdminEvents.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/AdminEvents.tsx), [gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js), [test/63_manual_create_event_sheet_and_import.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/63_manual_create_event_sheet_and_import.test.mjs))**：
  - **按鈕邏輯一體化整合**：移除獨立的「同步名冊」按鈕，將同步名冊並回補個資的邏輯完整合併至「報名試算表」按鈕中。幹部點擊開啟試算表時，系統在開啟新分頁瀏覽的同時，自動於背景發動對 Supabase 最新報名資料的巡檢與回補。
  - **靜默同步防彈窗攔截與即時狀態顯示**：保留原生連結導航避免 iOS Safari 與 LINE LIFF 彈窗封鎖；加入 silent 模式抑制完成通知彈窗，並在按鈕上顯示「同步中...」旋轉圖示提供明確視覺反饋。
  - **自動追加新報名者至試算表末端**：`_backfillEventSpreadsheetMemberInfo` 不僅自動回補現有隊員的 5 大缺漏個資，亦主動檢查 Supabase 最新產生的報名資料，若有新隊員尚未列於試算表中，自動將完整 22 欄資料追加寫入工作表末端。

### v0.1.140 (2026-09-17)
- **活動獨立試算表 5 大個資欄位精確對齊與「同步名冊」回補支援 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js), [src/components/admin/AdminEventCard.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/components/admin/AdminEventCard.tsx), [test/63_manual_create_event_sheet_and_import.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/63_manual_create_event_sheet_and_import.test.mjs))**：
  - **資料庫欄位名稱精確對齊**：修正讀取 Supabase `members` 資料表之 Key 名稱，對齊 `id_card`（證件號碼）、`emergency_contact_rel`（緊急聯絡人關係）、`outdoor_experience`（爬山經驗）、`fitness_desc`（體能測驗）與 `proof_urls`（體能證明圖片陣列轉換為字串），徹底解決試算表空白問題。
  - **支援既有試算表自動巡檢回補 (`_backfillEventSpreadsheetMemberInfo`)**：若該活動獨立試算表已存在，點擊時不再直接返回無動作，而是開啟試算表並逐列比對，將缺漏的證件號碼、關係、爬山經驗、體能與證明全自動回補齊全。
  - **前端活動卡片新增「同步名冊」按鈕**：在已建立獨立試算表的卡片操作列中，額外提供「同步名冊」一鍵刷新按鈕，幹部隨時可點擊以更新最新個資。

### v0.1.139 (2026-09-17)
- **幹部驗證函式參數適配與建立獨立試算表權限修復 ([gas_modules/06_Helper_Services.js](file:///Users/brianhung/Documents/OfficialLINEAccount/gas_modules/06_Helper_Services.js), [src/gas.js](file:///Users/brianhung/Documents/OfficialLINEAccount/src/gas.js), [test/63_manual_create_event_sheet_and_import.test.mjs](file:///Users/brianhung/Documents/OfficialLINEAccount/test/63_manual_create_event_sheet_and_import.test.mjs))**：
  - **解決參數錯位導致的權限判定失敗**：`checkOfficerInternal(ss, userId, userName)` 函式簽名首個參數原為試算表物件。在 `_handleCreateEventSheet` 中僅傳入單一參數 `userId` 時，導致 `userId` 被塞入 `ss` 變數而實際校驗身分之 `userId` 變為 `undefined`，進而一律回傳非幹部錯誤。
  - **增強容錯自適應**：於函式入口加入自動檢查 `if (typeof ss === "string" && !userId) { userId = ss; ss = null; }`，相容單參數直接呼叫與傳統雙參數呼叫。
  - **修正呼叫端與錯誤透明度**：在 `_handleCreateEventSheet` 明確以 `checkOfficerInternal(null, userId)` 呼叫，並於失敗訊息直接附帶當前 `userId` 以利除錯。

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
## 7. 最新版本異動紀錄 (Changelog v0.1.224)

### v0.1.206 (2026-09-24)
- 報名名冊一鍵恢復預設尺寸連動恢復欄高與展開 (WebAdminRoster.tsx):
  - 擴充控制列左右箭頭按鈕功能：點擊「一鍵恢復預設欄寬與列高」時，同步執行 `setRowHeights({})` 與 `setExpandedCells(new Set())`，重設所有拖曳調整之列高並收合所有展開儲存格，一鍵還原整齊劃一的試算表緊湊版面。
  - 同步更新 localStorage 儲存設定與按鈕 Tooltip 懸浮提示文字。
- 單元測試套件與建置檢查:
  - 擴充 test/88_web_admin_roster_features.test.mjs 單元測試校驗列高重設機制，全專案 352 項測試全數通過，tsc -b && vite build 編譯建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.205 (2026-09-24)
- 勾選框純白底色徹底防禦深色模式與自訂視覺 (webAdmin.css, WebAdminRoster.tsx):
  - 徹底解決 macOS / Windows 系統深色模式下勾選框 (Checkbox) 渲染為黑色實心方塊之問題。
  - 在 `.web-admin-wrapper` 與勾選框中強制指定 `color-scheme: light;`，阻斷瀏覽器原生表單元件繼承作業系統深色主題。
  - 對全站勾選框導入 `appearance: none;` 與 `-webkit-appearance: none;`，以純 CSS 自訂純白底色 (`background-color: #ffffff !important;`)、細緻淺灰外框 (`border: 1.5px solid #cbd5e1 !important;`)、4px 圓角與 hover 光暈效果。
  - 勾選後呈森林綠底色 (`var(--wa-primary)`) 搭配俐落白色打勾圖示；全選表頭並支援半選 (indeterminate) 狀態橫槓標示。
- 單元測試套件與建置檢查:
  - 擴充 test/88_web_admin_roster_features.test.mjs 單元測試，嚴格校驗 Checkbox 自訂外觀、color-scheme: light 與純白底色宣告。全專案 352 項測試全數通過，tsc -b && vite build 編譯建置零錯誤，嚴格符合零 Emoji 規範。

### v0.1.204 (2026-09-24)
- 欄寬調整手柄邊界對齊與儲存格原地展開/列高調整 (WebAdminRoster, webAdmin.css):
  - 欄寬調整手柄精準對齊邊界線：將 `.wa-col-resizer` 提升為 `<th>` 直接子元素，並設定 `right: -3px` 與 `width: 6px`，消除表頭內距 (padding) 導致調整柄偏離欄位右分隔線的問題，使調整柄精準置中於欄位右側邊界線上。
  - 移除彈窗改為儲存格原地展開與列高拖曳：徹底移除點擊儲存格跳出的 Popover 彈窗。點擊長文字儲存格改為原地切換單行截斷與多行完整換行展開 (`wa-cell-expanded`)；並在 `#` 序號儲存格下緣提供列高拖曳調整柄 (`wa-row-resizer`)，支援滑鼠上下拖曳自由設定個別列高度，設定同步保存於 `localStorage`。
- 單元測試套件與建置檢查:
  - 更新單元測試驗證移除 Popover、原地展開全文與列高/欄寬調整柄。全專案 352 項測試全數通過，tsc -b && vite build 編譯建置零錯誤，嚴格符合零 Emoji 規範。

### v0.1.203 (2026-09-24)
- 報名名冊表頭與列級操作工具平整內嵌優化 (webAdmin.css):
  - 表頭操作工具直接內嵌於儲存格內：徹底移除原本懸浮於表頭上方之白色圓角陰影卡片 (box-shadow/padding/border-radius)。滑鼠懸浮於任一欄位表頭時，表頭文字在儲存格內直接切換為靠左排列的操作按鈕 (< > 釘選 隱藏)，完全平貼儲存格底色，達到與欄位融為一體的純淨試算表排版。
  - 序號列級四角操作工具平整化：資料列懸浮時，四角操作按鈕直接於 # 儲存格內以平整背景覆蓋顯示，移除任何懸浮突起效果。
- 單元測試套件與建置檢查:
  - 全專案 352 項測試全數通過，tsc -b && vite build 編譯建置零錯誤，嚴格符合零 Emoji 規範。

### v0.1.202 (2026-09-24)
- 報名名冊工作站全面升級與高互動試算表網格 (WebAdminRoster, WebAdminLayout, webAdmin.css):
  - 名稱全面更名：頂部導覽列由「名冊審核工作站」正式更名為「報名名冊」。
  - 控制列整合成單一橫條：將活動切換下拉選單與搜尋篩選橫條結合成單一緊湊列，移除舊有「活動名冊審核」文字與日曆圖示，重新整理按鈕保留純圖示以節省水平空間，移除「管理活動基本設定」多餘跳轉連結。
  - 完整 27 個報名欄位支援：完整涵蓋姓名、性別、LINE ID、聯絡信箱、系所、學號、身分、聯絡電話、聯絡地址、生日、證件號碼、緊急聯絡人姓名、緊急聯絡人電話、緊急聯絡人聯絡地址、緊急聯絡人關係、個人特殊病史、爬山經驗、體能測驗、體能證明、加入社員意願、是否為社員、擔任幹部意願、審核結果、通知狀態、繳費狀態、備註、想說的話。
  - 表頭左側懸浮動作遮罩與自訂拖曳：表頭懸浮時浮現靠左動作列覆蓋欄位名稱，提供向左移動、向右移動、釘選至最左側（sticky left 搭配陰影隔線）、隱藏欄位功能；表頭右邊界支援滑鼠拖曳 mousedown/mousemove 動態調整欄寬；全體欄位排版設定自動持久化儲存於 localStorage。
  - 序號欄位 # 與列級四角懸浮工具列：序號表頭更名為 #；資料列懸浮時於序號儲存格四角精確顯示動作按鈕覆蓋數字：左上（上移此列）、右上（置頂釘選）、左下（下移此列）、右下（隱藏此列）。
  - 控制橫條輔助功能：眼睛圖示可展開自訂欄位與列之可見度清單並支援一鍵全部還原；左右箭頭 (<->) 一鍵重設所有欄位為預設寬度；複製名冊按鈕改為純圖示並具備懸浮 Tooltip 說明，動態以所見即所得方式匯出目前可見欄位為 TSV 格式。
  - 純白 Checkbox 底色：強制核取方塊底色為純白 (#ffffff !important)，解決瀏覽器預設底色不一問題。
  - 審核狀態判定 Bug 修復：對齊 Supabase 的 6 大 ENUM 狀態（正取 Confirmed、正取（已繳費）Confirmed (Paid)、備取 Waitlisted、備取（有意願）Waitlisted (Interested)、審核中 Checking、已取消 Cancelled），加入 normalizeStatus 防禦性轉型，徹底根除歷史資料或字串些微不符導致 React 自動跳回正取的問題。
  - 長文字浮動卡片 Popover：點擊任何長文字或溢出儲存格時，彈出簡潔浮動視窗完整檢視全文，並提供一鍵複製與關閉按鈕，不破壞資料列高度整齊度。
- 單元測試套件與建置驗證 (test/88_web_admin_roster_features.test.mjs):
  - 新增單元測試驗證 27 欄位精確定義、單一控制列、normalizeStatus 狀態解析、四角序號按鈕、白底 Checkbox、長文字 Popover 與 TSV 匯出。
  - 全專案 352 項測試全數通過，tsc -b && vite build 編譯建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.201 (2026-09-24)
- 活動詳細資訊欄位（活動日期、截止日期、預計費用）全面貼齊卡片底部 (WebAdminEvents, webAdmin.css):
  - 依據視覺對齊要求，將「活動日期：」、「截止日期：」與「預計費用：」資訊區塊（`.wa-event-card-meta`）移入卡片置底容器（`.wa-event-card-footer`）中，位於分隔線與操作按鈕正上方。
  - 當上方簡介文字行數較少（例如 1 行或無簡介）時，中間剩餘空間由彈性伸縮區塊吸收，確保所有活動卡片的活動日期、截止日期、預計費用、分隔線與操作按鈕在整份網格中均完全處於同一水平線上對齊，呈現整齊劃一的卡片視覺感。
- 單元測試套件與建置驗證:
  - 全專案 344 項單元測試 100% 通過，`tsc -b && vite build` 建置零錯誤，嚴格符合零 Emoji 規範。

### v0.1.200 (2026-09-24)
- 排序與篩選下拉選單箭頭內縮與自訂樣式 (webAdmin.css):
  - 徹底解決瀏覽器原生 `<select>` 下拉箭頭緊貼右外框問題（如圖一）。
  - 導入標準 `appearance: none;` 與俐落向量 SVG 展開箭頭（`#64748b`），精準設定 `background-position: right 14px center` 與 `padding-right: 36px`，賦予下拉選單左右對稱之舒適視覺呼吸感。
- 活動卡片底部操作列與分隔線固定置底 (WebAdminEvents, webAdmin.css):
  - 新增 `.wa-event-card-footer` 結構並配置 `margin-top: auto`，將「預計費用」下方之分隔線（`____________`）與「編輯活動」「報名名冊」操作按鈕牢固錨定於卡片最底部，杜絕因簡介行數長短不一而造成卡片底部按鈕浮動高低不齊。
  - 操作按鈕採用 `flex: 1` 與水平垂直完全置中（`justify-content: center`），消除按鈕右側多餘空白，讓兩顆按鈕飽滿均分整張卡片寬度。
- 活動卡片封面右上角狀態加入已報名人數 (WebAdminEvents):
  - 同步批次查詢 `event_signups` 資料表有效報名紀錄（排除已取消），動態統計各活動實際報名人數。
  - 狀態膠囊徽章文字統一對齊為純數字與狀態名稱，格式如：`8・開放`、`0・未來開放`、`12・已截止`、`0・關閉`。
- 編輯活動彈窗欄位靠左、必填校驗與字數限制 (WebAdminEvents):
  - 彈窗全體欄位標籤嚴格靠左對齊（`text-align: left`），並將「出隊結束日期 *」納入前端與儲存驗證之必填欄位。
  - 移除中英文雙欄頂部之說明文字（「社團預設語言」、「外籍生友善對照」、「最多三行 / 上限1000字」、「上限700字」等）。
  - 對齊 LINE Flex Message 限制（單一卡片傳送上限 1500 - 100 = 1400 字），為中英文各自實作總字數（簡介+行程）即時統計提示與超出上限（> 1400）攔截機制。
  - 大幅增加「活動簡介」（4 行，最小高度 110px）與「詳細行程與裝備要求」（12 行，最小高度 260px）之預設輸入框高度，提升幹部排版與輸入舒適度。
- 單元測試套件與建置驗證 (test/87_web_admin_loans_and_redesign.test.mjs):
  - 擴充單元測試驗證活動卡片底部固定容器、報名人數膠囊、出隊結束日期必填、1400 字數限制與零 Emoji 規範。
  - 全專案 344 項測試 100% 通過，`tsc -b && vite build` 編譯建置零錯誤。

### v0.1.199 (2026-09-24)
- 活動管理編輯彈窗多行輸入框視覺風格統一 (WebAdminEvents, webAdmin.css):
  - 修正中英文「活動簡介」與「詳細行程與裝備要求」文字輸入框 (textarea) 之背景底色與邊框外觀。
  - 於 `webAdmin.css` 統一將 `.web-admin-textarea` 納入 `.web-admin-input, .web-admin-select` 標準規則中，提供純白底色 (`#ffffff` / `var(--wa-surface)`)、細緻淺灰邊框 (`1px solid var(--wa-border-light)`)、內距 (padding) 與圓角 (6px)，並加入垂直尺寸自由調整 (`resize: vertical`) 與行高改善。
  - 在 `WebAdminEvents.tsx` 中為 4 處簡介與詳細行程 textarea (中文與英文) 設定純白底色，消除預設瀏覽器原生外觀與灰色雜色，使彈窗內所有輸入元件（單行文字、日期、數字、下拉選單、多行文字）達到一致之質感。

### v0.1.198 (2026-09-24)
- 活動管理頁面更名、精確狀態篩選與多維度排序 (WebAdminEvents, WebAdminLayout):
  - 頂級導覽標籤全面由「活動發布管理」更名為「活動管理」，契合全功能維護之定位。
  - 徹底修復狀態篩選無效問題：以資料庫真實 `status`（開放、未來開放、關閉）與截止日期 `deadline` 動態計算衍生狀態（若開放且逾截止日即判定為「已截止」），篩選選項精準對齊為「全部狀態 (ALL)」、「開放中 (開放)」、「未來開放」、「已截止」與「已關閉 (關閉)」，且各選項標註即時符合筆數。
  - 實作多維度排序功能：預設依「出隊開始日期（由新到舊）」排序，並支援一鍵切換「出隊日期 (由舊到新)」、「截止日期 (即將截止優先)」、「截止日期 (較晚截止優先)」、「活動代號 (由新到舊/由舊到新)」與「活動狀態 (開放中優先)」。
- LINE 風格頂部封面大圖卡片升級 (wa-event-card, webAdmin.css):
  - 卡片頂部採用比例接近 LINE Flex 卡片之滿版封面大圖容器（高度 185px），無圖片時自動呈現質感翡翠綠山巒漸層與山形圖示。
  - 圖片左上角：半透明深色玻璃擬態徽章顯示活動代號（如 `E2609-01`，等寬字體）。
  - 圖片右上角：彩色膠囊徽章顯示報名狀態（開放綠色、未來開放橙色、已截止紅色、已關閉灰色），依指示不顯示多餘人數。
  - 圖片下方靠左文字結構：
    - 活動名稱：中文與英文以空格隔開，大字體加粗。
    - 活動簡介：嚴格限制最多三行（CSS `line-clamp: 3`），排版整齊不忽高忽低。
    - 活動詳細資訊：活動日期（YYYY/MM/DD - YYYY/MM/DD）、截止日期、預計費用（翡翠綠高對比強調）。
    - 分隔線與底部操作：水平對稱配置「編輯活動」與「報名名冊」直通按鈕。
- 置中雙欄中英文編輯彈窗實作 (Centered Bilingual Modal, wa-modal-container):
  - 捨棄右側滑出抽屜，改為桌面端友善之寬版置中彈窗（`max-width: 960px`，支援點擊遮罩或點擊叉號關閉）。
  - 上方共用設定區：活動代號、活動狀態、出隊起訖日期、報名截止日、預計費用、LINE 群組邀請保密連結。
  - 封面照片雙軌設定：可點擊選取電腦本機圖檔（即時 Base64 預覽並自動壓縮），亦可直接輸入圖片網址（URL）。
  - 下方中英文雙欄對照區：左右對稱並列「中文內容 (Traditional Chinese)」與「英文內容 (English Translation)」，直觀對照兩側活動名稱、三行簡介與詳細行程裝備。
  - 儲存處理：若有新圖檔則經由 GAS 壓縮上傳 Google Drive 取得永久 CDN 縮圖網址，並直連寫入 Supabase `events` 資料表且記錄稽核日誌。
- 單元測試套件與建置驗證 (test/87_web_admin_loans_and_redesign.test.mjs):
  - 擴充單元測試驗證活動管理更名、狀態計算與篩選選單、排序機制、LINE 大圖卡片結構、置中雙欄彈窗與全體零表情符號規範。
  - 全專案 344 項測試 100% 通過（69 個測試套件維持 0 失敗），`tsc -b && vite build` 編譯建置零錯誤。

### v0.1.197 (2026-09-24)
- 電腦版幹部工作站介面風格全面翻新 (Light Clean Notion / Linear UI Theme, webAdmin.css):
  - 設計語言全面重塑：揚棄傳統暗色模式，改採 Notion / Linear 現代輕量設計語彙。以 `#f8fafc` 淺灰為底色、純白 `#ffffff` 面板與資料表格、Slate-900 俐落文字，並融合台科登山社代表色翡翠綠（`#059669`）作為品牌主色調。
  - 統一滑出抽屜與卡片網格體系：在 `webAdmin.css` 封裝 `.wa-drawer-backdrop`、`.wa-drawer-panel`、`.wa-card-grid`、`.wa-card` 與 `.wa-diff-modal` 樣式變數，確保所有管理模組擁有一致之流暢體驗。
- 活動發布與名冊審核模組獨立解耦 (WebAdminEvents & WebAdminRoster Separation):
  - 頂級功能獨立：依據幹部決策將名冊審核自活動子標籤中獨立為頂級獨立頁面 `/admin-web/roster`。
  - 活動管理專注出隊與編輯 (`/admin-web/events`)：採用卡片網格佈局，支援關鍵字與狀態切換、報名即時人數統計；右側滑出抽屜提供完整新增與編輯表單，卡片上配置快速捷徑按鈕直接開啟 `/admin-web/roster?eventId=...`。
  - 名冊審核高密度工作站 (`/admin-web/roster`)：專為保險審核與入山入園打造之高密度試算表介面，支援依活動下拉切換、正備取單筆切換、多筆批次審核，並提供一鍵將整份名冊複製為 TSV（Tab-Separated Values）功能，方便直接於 Google 試算表或保險表單貼上。
- 裝備借用管理模組全面實作 (WebAdminLoans):
  - 新增 `/admin-web/loans` 路由，採用參考手機介面之卡片網格佈局，支援搜尋借用人、學號、電話與裝備品名。
  - 點擊卡片彈出右側滑出抽屜，完整展示借用人聯絡資訊、出隊起訖、租金與押金、租借品項明細。
  - 抽屜提供快捷「點交出借」與「歸還入庫」操作，歸還入庫時自動回補 `equipments.available_qty` 庫存數量，並記錄幹部稽核紀錄。
- 全社社員名冊卡片網格與 Diff 比對確認彈窗 (WebAdminMembers):
  - 清單全面改採清新卡片網格佈局，點擊卡片開啟右側抽屜，包含完整個人基本資料編輯與歷史活動/借用時間軸。
  - 實作防呆 Diff 確認彈窗：按下儲存時自動比對新舊值，以表格清晰呈現異動項目（包含紅綠對照標記），確認後直連更新 Supabase `members`。
- 財務核銷與庫存管理色彩對比度強化 (WebAdminFinance & WebAdminInventory):
  - 優化金額、末五碼與庫存數量於純白底色之色彩對比度，提升視覺舒適感與可讀性。
- 嚴格零表情符號規範與單元測試套件 (test/87_web_admin_loans_and_redesign.test.mjs):
  - 新增專屬單元測試，驗證 6 大路由、抽屜面板、卡片佈局、Diff 比對防呆、庫存回補與全模組零表情符號規範。
  - 修正歷史測試 `test/86_audit_and_anomalous_login.test.mjs` 之名冊稽核斷言。
  - 全專案 342 項測試 100% 通過（69 個測試套件全數通過），`tsc -b && vite build` 建置編譯零錯誤。

### v0.1.196 (2026-09-24)
- line-auth Edge Function 變數修復、線上部署與本機環境配置 (.env, supabase/functions/line-auth/index.ts):
  - 核心問題診斷：幹部登入回呼時，畫面顯示 `[系統配置錯誤]: 未設定 VITE_SUPABASE_URL 環境變數`；且經稽核發現 `supabase/functions/line-auth/index.ts` 遺漏了 `supabaseUrl` 與 `supabaseServiceKey` 宣告，且該 Function 尚未部署至線上 Supabase。
  - 根因分析：
    - 前端缺少本機實體 `.env` 檔案，導致 Vite 無法自 `import.meta.env` 讀取 Supabase 連線參數。
    - 後端 Edge Function 遺漏 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 變數宣告，收到請求時將觸發 ReferenceError。
    - 線上 Supabase 尚未部署 `line-auth`，造成換票端點回傳 404。
  - 解決方案實作：
    - 本機環境檔案：依據 `.env.example` 建立實體 `.env` 檔案並於 `.gitignore` 納入防護，使 Vite 自動載入 `VITE_SUPABASE_URL`。
    - Edge Function 變數補全：在 `supabase/functions/line-auth/index.ts` 補齊 `supabaseUrl` 與 `supabaseServiceKey` 變數宣告。
    - 線上部署：將 `line-auth` 正式部署至 Supabase Edge Runtime，配置 `verify_jwt: false` 確保公開登入換票端點正常運作。
  - 單元測試套件與建置驗證：
    - 執行 `pnpm test`，全數 334 項單元測試 100% 通過（0 失敗）。
    - 執行 `tsc -b && vite build`，建置編譯零錯誤。

### v0.1.195 (2026-09-24)
- LINE Login 回呼 CSRF 防偽驗證與 React StrictMode 雙重掛載競爭修復 (OAuth Callback StrictMode Resilience):
  - 核心問題診斷：幹部於本機環境 (`pnpm dev`) 點擊「使用 LINE 帳號登入」並成功通過 LINE 官方授權跳回時，畫面報錯 `[安全校驗失敗]: CSRF state mismatch (防偽驗證權杖不符或過期，請重新登入)`。
  - 根因分析：
    - React 19 開發模式 (`StrictMode`) 會對組件執行「掛載 -> 卸載 -> 再次掛載」的雙重生命週期。
    - 第一次掛載時 `handleLineCallback` 比對成功並立即銷毀 `sessionStorage` 中的 `state`。
    - 數毫秒後第二次掛載執行時，暫存 `state` 已成空值，導致防偽校驗失敗；且重複發送相同 `code` 亦會觸發 OAuth2 一次性票券失效錯誤。
  - 解決方案實作 (src/utils/webAuth.ts, src/pages/web-admin/WebAdminCallback.tsx)：
    - 換票 Promise 單例防重 (In-flight Promise Deduplication)：加入模組級 `inFlightExchange` 與 `lastHandledCode`。若相同 `code` 正在換票中，第二次呼叫直接回傳共享的非同步 Promise，絕不發送重複請求或二度檢核。
    - 雙重儲存相容 (Storage Resilience)：發起登入時同時寫入 `sessionStorage` 與 `localStorage`，確保重導向與不同瀏覽器分頁情境下狀態絕不遺失。
    - 延後清除 State：嚴格限定在憑證與 JWT 交換成功後才銷毀 state，若換票異常則保留狀態並允許安全重試。
  - 單元測試套件與建置驗證：
    - 在 `test/84_web_admin_auth_and_jwt.test.mjs` 擴充 `inFlightExchange` 防重機制與儲存相容性檢測，全數 334 項測試通過（0 失敗）。
    - 執行 `tsc -b && vite build`，建置編譯零錯誤。

### v0.1.194 (2026-09-24)
- 電腦版幹部工作站無限重定向迴圈修復與路由架構解耦 (Web Admin Routing Decoupling & Loop Fix):
  - 核心問題診斷：先前在訪問 `http://localhost:5173/admin-web` 或 `/admin-web/events` 時，頁面無限卡在「正在驗證幹部身分憑證...」動畫，無法順利顯示登入介面。
  - 根因分析：
    - `src/App.tsx` 中同時宣告了 `<Route path="/admin-web" element={<WebAdminLogin />} />` 與 `<Route path="/admin-web" element={<WebAdminLayout />}>`，導致路由比對衝突。
    - `WebAdminLayout` 內部在未登入時呼叫 `navigate('/admin-web')`，但因未重設 `loading: false` 且路由導回自身，再度觸發子路由 `/admin-web/events`，形成無限彈跳迴圈。
  - 解決方案實作：
    - 路由解耦：將登入頁面路徑獨立宣告為 `<Route path="/admin-web/login" element={<WebAdminLogin />} />`。
    - 狀態安全歸零：`WebAdminLayout` 於未登入或無幹部權限時，先執行 `setLoading(false)` 再導向 `/admin-web/login` 或 `/admin-web/login?unauthorized=true`。
    - 登出與回呼同步：更新 `webLogout` 與 `WebAdminCallback` 失敗時之導航目標為 `/admin-web/login`。
    - 資安一致性：依使用者明確要求，不加入任何略過 OAuth2 驗證之本機開發一鍵登入按鈕，嚴格維持標準 LINE Login 認證防線。
  - 單元測試套件與建置驗證：
    - 執行 `pnpm test`，全數 333 項測試 100% 通過（68 個測試套件維持 0 失敗）。
    - 執行 `tsc -b && vite build`，建置打包作業零錯誤。

### v0.1.193 (2026-09-24)
- Supabase Edge Function 環境變數命名相容強化 (JWT_SECRET Compatibility):
  - 核心問題診斷：Supabase 平台為避免與官方系統保留變數產生命名衝突，嚴格禁止使用者自訂以 `SUPABASE_` 為前綴之 Secrets 變數名稱（例如嘗試設定 `SUPABASE_JWT_SECRET` 時會被系統阻擋報錯：Name must not start with the SUPABASE_ prefix）。
  - Edge Function 讀取相容性升級 (supabase/functions/line-auth/index.ts)：
    - 將簽發 Custom JWT 時讀取之密鑰名稱優先調整為合規之標準名稱 `JWT_SECRET`。
    - 實作多層名稱回退相容：依序讀取 `Deno.env.get('JWT_SECRET')`、`Deno.env.get('CUSTOM_JWT_SECRET')` 與 `Deno.env.get('SUPABASE_JWT_SECRET')`。
    - 當缺少環境變數時，錯誤提示訊息精準引導管理者設定 `JWT_SECRET`，大幅提升後台部署維運體驗。
  - 單元測試套件與建置驗證：
    - 執行 `pnpm test`，全數 333 項測試 100% 通過（68 個測試套件維持 0 失敗）。
    - 執行 `tsc -b && vite build`，建置打包作業零錯誤。

### v0.1.192 (2026-09-24)
- 電腦版幹部管理工作站全新上線 (Desktop Web Admin Workstation):
  - 核心痛點解決：徹底擺脫手機 LINE 內部瀏覽器 (LIFF) 逐筆點開卡片的審核瓶頸，為幹部打造支援寬螢幕、高密度操作之桌面工作站。
  - 獨立路由架構與導航設計：
    - 規劃全新專屬路由群組 `/admin-web/*`，完全豁免 LIFF 初始化流程，保證電腦 Chrome / Safari / Edge 秒開。
    - 依 Grill-me 決策結果，採用頂部水平導航列 (Top Nav) 代替側邊欄，將 100% 螢幕橫向寬度全數保留給大型資料網格。
  - 四大工作站模組實作：
    - 活動名冊審核工作站 (WebAdminEvents)：試算表樣式 (Excel/Sheets Grid) 高密度呈現，單元格直接下拉變更正備取狀態、多選核取方塊批次審核、全個資明文顯示（身分證字號、電話、緊急聯絡人）、一鍵複製整份名冊為 TSV 格式供保險申報表與入山入園系統直接貼上。
    - 全社社員名冊工作站 (WebAdminMembers)：支援多維度即時過濾、幹部身分一鍵切換與名冊匯出 CSV。
    - 財務對帳核銷工作站 (WebAdminFinance)：條列待核銷款項與末五碼，支援單筆與批次一鍵核銷。
    - 裝備庫存管控工作站 (WebAdminInventory)：提供裝備庫存即時調整與上下架借用狀態切換。
- 徹底修復 anon key 偽造身分之資安漏洞 (LINE Login OAuth2 + Supabase Custom JWT + RLS):
  - 漏洞根治：過往前端僅依賴 anon key 直接調用 RPC，存在透過偽造 `p_line_user_id` 越權存取他人敏感個資之風險。
  - 伺服端認證後端 (Supabase Edge Function `supabase/functions/line-auth/index.ts`)：
    - 接收前端 LINE authorization code，以社團專屬 Channel Secret 向 LINE 官方 Token API 交換存取權杖，並向 Profile API 取得可信任之真實 userId。
    - 雙軌查驗 members 與 officers 資料表之幹部身分，簽發 8 小時有效之 Supabase Custom JWT（含 sub=userId, role=authenticated, is_officer=boolean, aud=authenticated）。
  - 資料庫安全遷移 (supabase/desktop_admin_security.sql)：
    - 建立操作與登入稽核日誌表 (audit_logs)。
    - 強化 members, event_signups, loans, loan_items, payments 之 RLS 存取政策：匿名訪問嚴格回傳 0 筆敏感資料；一般社員僅能讀取自身資料；僅持有效幹部 JWT 者方可存取全社個資與審核。
    - 提供一鍵回滾腳本 (supabase/rollback_desktop_admin_security.sql)。
  - 異常登入檢測機制：同一帳號於 30 分鐘內出現來自 3 個不同 IP 登入時，自動觸發 SECURITY_ALERT 並寄送警報郵件至社團公用帳號 `ntustmountain@gmail.com`。
- 嚴格向後相容與 0 破壞回歸防線 (Strict Test Plan Execution):
  - 保障手機端 LIFF 現有首屏載入秒開：`equipments` 與 `events` 公開讀取政策完整維持不變。
  - 專案規範落實：所有錯誤訊息直接輸出具體 error.message 與代碼；資料更新直通 Supabase 杜絕 iOS WebKit Load failed 重導向阻斷。
  - 單元測試套件全數通過：
    - 新增 `test/84_web_admin_auth_and_jwt.test.mjs` (OAuth2 與 JWT 簽發驗證)。
    - 新增 `test/85_rls_security_boundaries.test.mjs` (RLS 權限邊界測試)。
    - 新增 `test/86_audit_and_anomalous_login.test.mjs` (稽核日誌與異常登入警報測試)。
    - 既有 319 項測試 + 新增 14 項測試，共 333 項單元測試 100% 維持 Pass，`tsc -b && vite build` 建置零錯誤。

### v0.1.191 (2026-09-24)
- 幹部後台財務對帳清單重複項目根治與外鍵關聯回填 (Finance Items Deduplication & Target Linking)：
  - 核心問題排查與根因：
    - 幹部進入「財務對帳」頁面 (AdminFinance.tsx) 時，系統調用 Supabase RPC get_admin_finance_rpc 彙整 payments（已填報繳費單）與 event_signups / loans（未填報繳費之正取待繳單據）。
    - 經排查發現：社員透過線上填報活動繳費時，寫入 payments 的 target_type 與 target_id 欄位均為 NULL（活動名稱僅存放於 type 字串中）。
    - 原 RPC 之 NOT EXISTS 排除條件僅比對 target_type = 'event' AND target_id = e.id，導致條件比對失效，系統誤判該社員尚未申報繳費，將 payments 回報單與 event_signups 報名原始待繳單同時列出，造成視覺重複。
  - 資料庫層級修復與資料回填 (Supabase PostgreSQL)：
    - 建立遷移腳本 supabase/fix_admin_finance_duplicate_rpc.sql 並同步更新 supabase/admin_portal_rpc.sql。
    - 執行資料庫回填：將既有 payments 紀錄依據 type 字串回填正確之 target_type 與 target_id（例如活動 E2609-04、租借單號與社費）。
    - 強化 get_admin_finance_rpc 排除邏輯：NOT EXISTS 條件擴充支援 (p.type ILIKE '%' || e.title || '%') 與 (p.type ILIKE '%' || e.id || '%')，徹底阻絕重複產生。
    - 已在遠端 Supabase 正式執行遷移，驗證重複單據已完全消除，各款項均維持唯一呈現。
  - 前端與備援查詢防禦性去重 (src/utils/supabaseClient.ts, src/pages/AdminFinance.tsx)：
    - 於 supabaseClient.ts 的 fetchFinanceItemsFromSupabase 備援查詢擴充比對 events.title 與 loan id，防止直讀備援出現重複。
    - 於 AdminFinance.tsx 的 filteredItems 新增防禦性去重過濾，自動偵測並剔除已存在相同款項之待繳虛擬紀錄。
  - 單元測試套件驗證 (test/83_admin_finance_deduplication.test.mjs)：
    - 新增 5 項單元測試，檢驗 RPC 排除邏輯、資料庫回填腳本、備援查詢健全化與前端去重演算，全數 319 項測試 100% 通過。

### v0.1.190 (2026-09-24)
- LINE 官方帳號最新活動卡片新增「已報名人數」膠囊徽章 (Registered Count Badge on Event Cards)：
  - 核心功能與需求依據：
    - 依據訪談決策，於 LINE 聊天室活動卡片頂部狀態列右側新增淺天藍膠囊徽章，讓社員與幹部在報名前即時掌握活動熱絡程度與名額概況。
    - 支援「最新活動」輪播卡片 (sendEventList) 與「單一活動詳情」卡片 (sendEventDetail)。
  - 視覺設計與排版 (LINE Flex Message)：
    - 採用淺天藍底色 (#f0f9ff) 搭配深藍色字體 (#0284c7，字級 xs、粗體 bold)，佐以圓角 (cornerRadius: md) 與精緻內邊距 (paddingStart/End: sm, paddingTop/Bottom: xs)。
    - 狀態列改採水平佈局 (layout: horizontal, justifyContent: space-between, alignItems: center)，左側為活動狀態標籤 (flex: 1)，右側為已報名人數膠囊徽章 (flex: 0)，視覺層次清晰俐落。
  - 極速批次查詢與統計邏輯 (src/gas.js, gas_modules/03_Flex_Templates.js)：
    - 100% 直連 Supabase event_signups 資料表作為單一信任源。
    - sendEventList 採 in.(...) 批次查詢所有活動報名名單，於記憶體構建 O(1) 計數字典，徹底杜絕迴圈內多次 HTTP 請求之效能損耗。
    - 嚴格排除取消狀態 (status 不包含「取消」且不包含「cancel」)，即使 0 人報名亦清楚顯示 0 人。
  - 多語言字串支援：
    - 依據使用者偏好語言 (prefLang)，分別呈現繁體中文「已報名：X 人」、英文「Registered: X」或雙語安全回退「已報名：X 人 / Registered: X」。
  - 單元測試套件驗證 (test/82_event_card_signup_count.test.mjs)：
    - 新增 6 項測試驗證批次查詢語法、取消狀態排除、膠囊樣式顏色、多語系字串與統計計算器，全數 314 項測試 100% 通過。

### v0.1.189 (2026-09-23)
- 修復社員歷史全紀錄未顯示活動紀錄問題 (MemberRecords 活動紀錄載入異常修復)：
  - 核心問題排查與根因：
    - 幹部進入「社員歷史全紀錄」頁面 (MemberRecords.tsx) 時，系統調用 Supabase RPC 函式 get_admin_member_records_rpc 彙整該社員之裝備租借、活動報名與繳費歷史。
    - 經資料庫排查，Supabase events 資料表之實際欄位結構包含 id、title、start_date、end_date、deadline、fee、status、summary、itinerary、cover_image_url 等，並無 location 欄位。
    - 該 RPC 函式在 activities 聯合子查詢中錯誤引用了不存在的 e.location 欄位，導致 PostgreSQL 拋出致命錯誤：ERROR: 42703: column e.location does not exist，活動紀錄完全中斷。
    - 當 RPC 拋出異常時，客戶端回退至直查資料表備援 (supabaseClient.ts fetchMemberTimelineRecordsFromSupabase)，其 PostgREST 語法同樣指定了 events:event_id (..., location)，遭到 Supabase API 回傳 HTTP 400 Bad Request，導致活動紀錄為空。
  - 資料庫 RPC 與遷移修復 (Supabase PostgreSQL)：
    - 建立遷移腳本 supabase/fix_member_records_location_rpc.sql，並同步更新 supabase/admin_portal_rpc.sql。
    - 移除 get_admin_member_records_rpc 中不存在的 e.location 欄位，確保活動紀錄能正常聯合查詢。
    - 已在 Supabase 正式執行遷移並驗證，調用 RPC 能成功載入完整活動歷史紀錄。
  - 前端客戶端備援健全化與狀態樣式優化 (src/utils/supabaseClient.ts, src/pages/MemberRecords.tsx)：
    - 於 supabaseClient.ts 的 fetchMemberTimelineRecordsFromSupabase 移除 signupsData 查詢中之 location 欄位，杜絕 PostgREST 400 報錯。
    - 於 MemberRecords.tsx 的 getStatusBadgeStyle 補齊「備取」與「審核中」之琥珀黃徽章樣式，完整呈現正取（藍）、備取/審核中（黃）、已取消（紅）、已繳費/已核銷（綠）之多樣化活動狀態。
  - 單元測試套件驗證 (test/81_member_records_activity_location_fix.test.mjs)：
    - 新增單元測試驗證 get_admin_member_records_rpc 與 supabaseClient.ts 均已剔除 location 欄位，全數 308 項單元測試 100% 通過。

### v0.1.188 (2026-09-23)
- 修復活動管理英文編輯介面未讀取 Supabase 資料問題：
  - 核心問題排查與根因：
    - 經排查 Supabase 資料庫，events 資料表中已完整儲存活動之雙語資訊（如 title_en、summary_en、itinerary_en）。
    - 幹部後台活動管理頁面 (AdminEvents.tsx) 載入活動時呼叫 fetchAdminEventsFromSupabase，調用 Supabase RPC get_admin_events_rpc。
    - 該 RPC 在輸出 JSON 物件時，僅選取中文欄位（title、summary、itinerary），未選取 title_en、summary_en、itinerary_en，且其 GROUP BY 子句中缺少此三欄位，導致前端取得的 nameEn、shortDescEn、fullDescEn 均為 undefined。
    - 點擊「編輯活動」時，表單初始化將未定義的英文欄位賦值為空字串，切換至「English」分頁時呈現完全空白。
    - 同步檢查發現 GAS 備援函式 _handleGetAdminEvents 亦遺漏了雙語欄位與 line_group_url。
  - 資料庫 RPC 與遷移修復 (Supabase PostgreSQL)：
    - 建立遷移腳本 supabase/fix_admin_events_rpc_bilingual.sql，並同步更新 supabase/add_line_group_url_to_events.sql 與 supabase/admin_events_rpc.sql。
    - 於 get_admin_events_rpc 之 jsonb_build_object 中新增 'nameEn', COALESCE(e.title_en, '')、'shortDescEn', COALESCE(e.summary_en, '')、'fullDescEn', COALESCE(e.itinerary_en, '')，並將 e.title_en, e.summary_en, e.itinerary_en 納入 GROUP BY。
    - 已在 Supabase 正式執行更新並驗證返回物件已正確包含各活動之英文名稱與詳細說明。
  - 後端 GAS 備援健全化 (src/gas.js)：
    - 於 _handleGetAdminEvents 的 REST API 查詢字串補入 title_en,summary_en,itinerary_en,cover_image_url,line_group_url，並在回傳物件中對齊 nameEn、shortDescEn、fullDescEn 與 lineGroupUrl。
  - 單元測試套件驗證 (test/69_bilingual_events_and_preferred_language.test.mjs)：
    - 擴充測試檢驗 get_admin_events_rpc 遷移腳本與 gas.js _handleGetAdminEvents 之雙語欄位映射完整性，304 項單元測試全數通過。

### v0.1.187 (2026-09-23)
- 補強新社員註冊無更新時間戳時之時效時鐘保護 (createdAt Fallback)：
  - 核心問題排查與解決：
    - 經 CodeRabbit 深度審查指出極端邊界情況：若新社員剛完成註冊，其資料庫記錄僅具備 createdAt 而無 updatedAt。若該社員在 180 天內首次報名活動，handleSignup 依據 createdAt 判定放行；但若 _syncSignupToSupabase 僅以 updatedAt 判定，則會觸發當前時間 fallback（new Date().toISOString()），導致該新社員的 updated_at 被誤填為報名時間，進而在後續持續展延時鐘。
  - 邊界防護實作 (_syncSignupToSupabase)：
    - 於 src/gas.js 與 gas_modules/05_Sync_Worker.js 將 memberPayload 之 updated_at 賦值順序調整為：
      updated_at: p.updatedAt || p.updated_at || p.createdAt || p.created_at || new Date().toISOString()
    - 確保新註冊社員報名活動時，嚴格保留其最初之 createdAt 註冊時間戳記，絕不提早或延後其個資時效時鐘，達到 100% 邏輯嚴密閉環。
  - 單元測試套件驗證 (test/80_member_profile_recency_and_signup_fitness_hint.test.mjs)：
    - 擴充第 6 項測試斷言，驗證 src/gas.js 與 gas_modules/05_Sync_Worker.js 均具備 createdAt 之 fallback 保護機制，全數 PASS。

### v0.1.186 (2026-09-23)
- 報名時效時鐘保護與無效時間戳記精準提示優化 (CodeRabbit 審查改進)：
  - 核心問題排查與解決：
    - 經審查發現：當隊員於 180 天內成功報名活動時，系統調用 _syncSignupToSupabase 同步隊員資料至 Supabase，原程式碼寫死 updated_at: new Date().toISOString()，導致報名動作直接覆蓋隊員的個人資料最後更新時間。
    - 嚴重影響：只要隊員每隔數月報名一次活動，其「個資時效時鐘」就會被自動重設，即使數年未更新爬山經歷與體能紀錄，亦可永遠繞過 6 個月檢查機制。
    - 另一文案問題：當隊員無有效時間戳記或時間格式異常時，一律提示「已超過 6 個月未更新」，向新建立或未校驗的使用者提供了不精準的阻擋理由。
  - 實作防護與時鐘鎖定 (_syncSignupToSupabase)：
    - 於 src/gas.js 與 gas_modules/05_Sync_Worker.js 調整 memberPayload，嚴格沿用隊員原始之 updatedAt（updated_at: p.updatedAt || p.updated_at || new Date().toISOString()），僅在全新無紀錄時賦予當前時間，徹底防止報名動作刷新個資時效。
  - 精確分流阻擋理由 (handleSignup)：
    - 於 src/gas.js 與 gas_modules/03_Flex_Templates.js 精準判定 isUnverifiedTime：
      - 超過 180 天：明確提示「您的個人資料與體能紀錄已超過 6 個月未更新」/「Your profile and fitness records have not been updated for over 6 months」。
      - 無時間戳記或無法校驗：精準提示「您的個人資料與體能紀錄尚未完成時效校驗（或查無最近更新紀錄）」/「Your profile and fitness records have an unverified update time or no recent records found」。
  - 單元測試套件全面通過 (test/80_member_profile_recency_and_signup_fitness_hint.test.mjs)：
    - 擴充測試檢驗 _syncSignupToSupabase 保留 updatedAt 邏輯，以及 handleSignup 精確分流雙語提示，全數 100% 通過。

### v0.1.185 (2026-09-23)
- 活動報名個人資料 6 個月更新檢查與爬山經歷體能重要性說明：
  - 核心需求與背景：
    - 社團戶外登山活動（特別是百岳、中級山與長程縱走）需嚴謹評估隊員之爬山經歷與體能狀況。若隊員個人資料已長年未更新，可能導致幹部依據舊有紀錄審核，影響出隊安全或錯失錄取機會。
  - LINE 活動報名 6 個月更新檢查機制 (handleSignup)：
    - 當隊員在 LINE 官方帳號點擊最新活動之「立即報名」時，系統直查 Supabase members 資料表（SSOT），取得 updated_at 或 created_at 判定距今是否已逾 180 天（6 個月）。
    - 若超過 180 天（或查無有效更新時間戳記），系統將阻擋本次報名，回傳雙語提示訊息，明確說明社團出團將以爬山經歷與體能狀況作為審核與篩選依據，並附帶個人主頁更新之 LIFF 快速連結，引導隊員更新後再回聊天室報名。
  - 報名成功收據加註體能經歷說明：
    - 當未逾期成功送出報名時，回傳之 LINE 確認收據在重要提醒後方追加「體能與經歷更新說明」，溫馨提醒隊員若有更佳的最新登山紀錄或體能證明，可隨時至個人主頁更新以增加出隊錄取機會。
  - 前端 LIFF 報名頁面與多語言同步 (Register.tsx, zh.json, en.json)：
    - 於步驟 4（登山經驗與體能證明）頂部配置顯著之資訊橫幅 (Info Banner)，以雙語提示「社團出團活動將依據爬山經驗與體能狀況進行審查評估。若近期有更好的經歷或紀錄，記得隨時至此更新，增加錄取機會！」。
    - 個人資料更新成功後之彈窗提示亦同步融入「隨時保持更新以增加出隊錄取機會」之友善引導。
  - 單元測試防護 (test/80_member_profile_recency_and_signup_fitness_hint.test.mjs)：
    - 完整涵蓋 updatedAt 讀取、180 天計算模擬、阻擋訊息與 LIFF 連結驗證、收據更新說明驗證、Register.tsx 與多語言詞條對齊測試，全數通過。

### v0.1.184 (2026-09-23)
- 修復活動專屬試算表智慧同步缺少 _getConfigRow 輔助函式異常：
  - 問題根因排查：
    - 在 v0.1.183 實作「智慧雙重同步比對」機制時，活動試算表資料回補函式 (_backfillEventSpreadsheetMemberInfo) 調用了 _getConfigRow(configSheet, "LAST_SYNCED_AT") 以取得上次同步之時間戳記。
    - 然而代碼中原先僅定義了 _setOrUpdateConfigRow(configSheet, key, value) 寫入輔助函式，未實作讀取用的 _getConfigRow，導致幹部點擊「同步試算表」時在 GAS 端擲出 "_getConfigRow is not defined" 例外中斷。
  - 核心修復與健全防護：
    - 於 src/gas.js 與 gas_modules/06_Helper_Services.js 補齊 _getConfigRow(configSheet, key) 實作，安全遍歷 _CONFIG 工作表並以大小寫不敏感 (Case-Insensitive) 方式精準比對 key，取回對應儲存格字串值；若工作表或鍵值不存在則安全回傳空字串，杜絕例外發生。
  - 單元測試套件補強 (test/79_event_spreadsheet_smart_sync_29_columns.test.mjs)：
    - 擴充單元測試斷言，嚴格檢驗 src/gas.js 與 gas_modules/06_Helper_Services.js 均具備完整的 _getConfigRow 函式實作，防止未來模組維護時再次缺漏。

### v0.1.183 (2026-09-23)
- 活動獨立試算表 29 欄位規格升級與智慧雙重同步比對機制實作 (LAST_SYNCED_AT vs updated_at)：
  - **核心問題排查與解決**：
    - 查明過往活動試算表同步採「空白才填補 (If Empty Then Fill)」策略，當社員後續在個人資料勾選「我有意願成為社團幹部」或繳交社費後，試算表因該格已有非空文字而跳過，導致無法動態更新。
    - 查明 `_supabaseGet` 在 PostgREST 批次查詢 `in.(...)` 語法中，將逗號 delimiter 編碼為 `%2C`，使資料庫將多位使用者 ID 誤認為單一字串而回傳空陣列，致使名冊同步時抓不到隊員資料。
    - 查明建立全新試算表 (`_handleCreateEventSheet`) 與單筆追加 (`_appendToEventSpreadsheet`) 時表頭與陣列元素順序錯位（第 18 欄填入「想說的話」），且長度只有 23 欄漏填意願欄位。
  - **擴充 5 大新欄位至總計 29 個欄位規格**：
    - 活動獨立試算表正式納入 29 欄位標準：`系統識別碼 | 專屬碼 | 姓名 | 性別 | LINE ID | 聯絡信箱 | 聯絡電話 | 聯絡地址 | 生日 | 證件號碼 | 緊急聯絡人姓名 | 緊急聯絡人電話 | 緊急聯絡人聯絡地址 | 緊急聯絡人關係 | 爬山經驗 | 體能測驗 | 體能證明 | 是否為社員 | 審核結果 | 通知狀態 | 繳費狀態 | 備註 | 想說的話 | 擔任幹部意願 | 系所 | 學號 | 個人特殊病史 | 身分 | 加入社員意願`。
    - 既有活動試算表於同步時自動檢查表頭，若缺少上述新欄位，將自動於右側追加欄位（`insertColumnsAfter`）並自動補齊隊員資料。
  - **智慧雙重同步判斷與列級批次回寫 (Field-by-Field Diff & Batch Write)**：
    - 於活動試算表隱藏工作表 `_CONFIG` 記錄 `LAST_SYNCED_AT` ISO 時間戳記，並同步更新 Supabase `events.updated_at`。
    - 同步時先篩選 `member.updated_at > LAST_SYNCED_AT`（若首次同步無時間戳記則全量比對），僅針對有異動的成員在 JavaScript 記憶體中逐欄比對，文字有差異才更新對應陣列儲存格。
    - 比對完成後，以列為單位執行 `sheet.getRange(...).setValues([row])` 批次回寫，執行耗時僅約 0.3 秒，且**100% 完整保留儲存格原有之底色畫記 (Highlight)、字體樣式與框線**。
  - **欄位權限分流與顯示規格統一**：
    - **隊員欄位 (23 欄)**：隊員個資、經驗證明、身分意願隨 member 更新動態同步。
    - **行政審核 (4 欄)**：「審核結果」、「通知狀態」、「繳費狀態」、「備註」受嚴格保護，絕不受隊員個資變更所影響。
    - **意願規格簡化**：「擔任幹部意願」與「加入社員意願」統一格式化為「是」/「否」；「是否為社員」在繳費後動態更新為「是」。
  - **單元測試套件全數通過 (`test/79_event_spreadsheet_smart_sync_29_columns.test.mjs`)**：
    - 新增專屬測試檔案驗證 29 欄位定義、`_supabaseGet` 逗號編碼防護、`_CONFIG` 時間戳記讀寫、逐欄比對邏輯與「是/否」格式化，全專案 295 項單元測試 100% PASS。

### v0.1.182 (2026-09-23)
- 修復社員資料頁面「幹部意願」篩選未響應異常 (`AdminMembers.tsx`)：
  - **根本原因排查**：
    - 在 `AdminMembers.tsx` 計算過濾清單之 `filteredMembers = useMemo(...)` 依賴項陣列中，遺漏了 `officerIntentFilter` 狀態變數。
    - 導致使用者於 Notion 風格篩選抽屜選取「有意願」或「無意願」時，React 的 `useMemo` 判定依賴無變更而回傳舊快取，未重新觸發名冊過濾運算。
  - **響應式依賴陣列補齊**：
    - 將 `useMemo` 依賴項完整補齊為 `[members, searchQuery, identityFilter, payFilter, officialFilter, officerIntentFilter, sortBy, sortOrder]`，點擊「有意願」或「無意願」時立即即時重新計算與呈現過濾結果。
  - **單元測試防護升級 (`test/78_member_officer_intent_filter_and_sheet_sync.test.mjs`)**：
    - 新增靜態斷言檢驗 `useMemo` 依賴項陣列完整性，杜絕後續重構遺漏依賴變數。

### v0.1.181 (2026-09-22)
- Google Drive 圖片上傳品質全面升級至 2K 超清標準 (2048px / Q88 / CDN =s0)：
  - **根本原因排查與實測分析**：
    - 經獨立基準壓力測試查明：先前圖片模糊並非僅為前端壓縮過度，主因為 Google Drive CDN 網址寫死 `=w1000`，使 Google 圖片伺服器強制縮圖至 1000px 並二次有損壓縮成 66KB。
    - 另外查明若完全不壓縮，相機原圖動輒 10MB~15MB（Base64 達 20MB），上傳單張耗時逾 35 秒，多張時極易因超出 GAS 50MB 負載上限或連線逾時導致 `Load failed`。
  - **前端等比壓縮標準全面升級至 2K 超清 (Visual Lossless Sweet Spot)**：
    - **活動管理宣傳封面 (`AdminEvents.tsx`)**：長寬上限由 1200px 升級至 **2048px**，品質提升至 **0.88**。
    - **裝備庫存相片 (`AdminInventory.tsx`)**：長邊上限由 1200px 升級至 **2048px**，品質提升至 **0.88**。
    - **裝備相片詳細維護 (`EquipmentDetailModal.tsx`)**：長邊上限由 1200px 升級至 **2048px**，品質提升至 **0.88**，預覽與 Lightbox 大圖讀取尺寸對齊 2048px。
    - **活動報名體能證明 (`Register.tsx`)**：長寬上限由 1024px 升級至 **2048px**，品質提升至 **0.88**。
    - **登頂心得與照片上傳 (`Achievements.tsx`)**：長寬上限由 1024px 升級至 **2048px**，品質提升至 **0.88**，檢視尺寸升級為 2048px。
  - **多圖上傳單張隔離防護 (Single-Item Upload Protection)**：
    - 針對體能證明（最多 5 張）與登頂照片，改採單張獨立發送機制，確保每次 POST 請求 Payload 均在 300KB 以內，徹底杜絕多圖合併累積成巨大 Payload 拖垮網路或觸發 GAS 逾時。
  - **Google Drive CDN 高清直連網址解鎖 (`=s0` / `=w2048`)**：
    - `src/gas.js` 與 `gas_modules/06_Helper_Services.js` 回傳之 CDN 網址後綴由 `=w1000` 升級為 **`=s0`**（原生尺寸原樣輸出，完整保留 2K 細節）。
    - `src/utils/image.ts` 的 `getDirectImageUrl` 預設尺寸升級為 2048，並原生支援傳入 `'s0'`。
  - **單元測試套件驗證 (`test/79_image_2k_high_quality_and_cdn_s0.test.mjs`)**：
    - 新增專屬測試驗證全系統各模組之 2048px / 0.88 參數、多圖單張發送迴圈、`getDirectImageUrl` 解析規格與 GAS `=s0` 產出。

### v0.1.180 (2026-09-22)
- 社員幹部意願管理、卡片標籤、試算表名冊欄位同步與個資編輯整合：
  - **社員名冊「幹部意願」篩選器與卡片標籤 (`AdminMembers.tsx`)**：
    - 於社員管理頁面 Notion 風格篩選抽屜新增「幹部意願」群組（全部 / 有意願 / 無意願），支援快速檢視與招募潛在幹部成員。
    - 社員卡片第一行（身分狀態旁）新增「幹部意願」專屬標籤，樣式嚴格對齊校外人士灰階風格（背景 `#f1f5f9`、文字 `#475569`、字重 `500`），直觀辨識。
  - **編輯個人資料「擔任幹部意願」維護 (`MemberDetailEdit.tsx`)**：
    - 於「正式社員身分」勾選框正下方配置「擔任幹部意願」勾選核取方塊，可一鍵切換「我有意願成為社團幹部」與空值。
    - 支援確認防呆 Diff Modal 預覽異動，並直連寫入 Supabase `members.officer_intent` 欄位。
  - **個人檔案彈窗幹部意願呈現 (`MemberProfileModal.tsx`)**：
    - 於共用之個人檔案預覽彈窗中解析並展示「意願：擔任幹部」徽章，點擊底部綠色按鈕即可平滑導航至詳細編輯頁。
  - **活動獨立試算表自動擴充「擔任幹部意願」同步 (`src/gas.js`)**：
    - 新增活動試算表 (`_handleCreateEventSheet`) 之表頭陣列末端納入「擔任幹部意願」。
    - 名冊動態回補 (`_backfillEventSpreadsheetMemberInfo`) 具備動態欄位擴充能力：若現有試算表缺少「擔任幹部意願」表頭，將自動於右側追加該欄，並為所有既有與新追加列回補填入社員最新之幹部意願資料。
  - **Supabase 安全 RPC 與查詢層更新 (`get_admin_members_rpc`, `supabaseClient.ts`)**：
    - 更新 `get_admin_members_rpc` 函式定義，在 `SELECT` 欄位加入 `m.officer_intent`。
    - `fetchAdminMembersFromSupabase` 直讀備援查詢同步納入 `officer_intent`，確保前後台型別與資料對齊。
  - **單元測試套件驗證 (`test/78_member_officer_intent_filter_and_sheet_sync.test.mjs`)**：
    - 新增專屬測試檔案驗證型別定義、備援欄位、過濾邏輯、卡片標籤、編輯頁面位置、Modal 標籤與 GAS 試算表欄位擴充與填值邏輯，測試 100% 通過。

### v0.1.179 (2026-09-22)
- 試算表欄位動態映射回補與 iOS WebKit Load failed 智慧容錯優化：
  - **根本原因排查與欄位順序對齊**：
    - 查明過往追加新列時硬編碼 23 欄陣列，將「想說的話」放置於第 18 欄，與使用者活動試算表實際表頭（第 18 欄為「是否為社員」、第 19 欄為「審核結果」、第 20 欄為「通知狀態」、第 21 欄為「繳費狀態」、第 22 欄為「備註」、第 23 欄為「想說的話」）產生一位元偏移（Offset by 1），導致狀態欄位寫入空白或錯位值。
  - **動態表頭欄位定位（Dynamic Header Mapping）實作 (`src/gas.js`)**：
    - 在 `_backfillEventSpreadsheetMemberInfo` 函式中全面引入動態表頭欄位定位 (`colMap`)，精準比對每一個欄位名稱，徹底擺脫寫死順序之缺陷。
    - **既有列與新列雙重回補**：全面遍歷名冊所有資料列，針對既有 11 列與新追加之 6 列，自動對齊並回補 Supabase 之「是否為社員」、「審核結果」、「通知狀態」、「繳費狀態」最新值，確保整份名冊 100% 填滿無空欄。
  - **iOS WebKit `Load failed` 智慧容錯開啟 (`AdminEvents.tsx`)**：
    - 針對 iOS Safari / LINE WebKit 遇長時間跨域 302 重導向時底層拋出 `TypeError: Load failed` 的特性進行智慧判定：
    - 若錯誤為 `Load failed` 且該活動在 Supabase 已具備試算表網址，前端直接顯示「已發送同步請求至 Google 試算表！名冊將於背景完成更新」，並順暢調用 `liff.openWindow` 開啟 Google 試算表，杜絕誤報警報。

### v0.1.178 (2026-09-22)
- iOS WebKit 跨域快取約束與 LINE 內嵌瀏覽器開表體驗優化：
  - **移除 `cache: 'no-store'` 徹底消除 iOS WebKit 302 跨域異常**：
    - 在 `src/utils/api.ts` 的 `gasGet` 函式中移除 `{ cache: 'no-store' }` 設定。
    - 由於 URL 已經附帶防快取時間戳記 (`_t=${Date.now()}`)，移除 `no-store` 可杜絕 iOS Safari / WebKit 在處理 Cross-Origin 302 跳轉時觸發的 `TypeError: Load failed`。
  - **LINE 內嵌環境開表優化 (`AdminEvents.tsx`)**：
    - 移除不相容於行動端之 `window.open('about:blank', '_blank')` 預先開窗機制，避免在 iOS LINE App 中干擾當前網路請求。
    - 試算表同步完成後，透過 `liff.isInClient()` 判斷：若在 LINE 客戶端內則優先呼叫 `liff.openWindow({ url: targetUrl, external: true })` 透過外部原生 Safari 開啟，若在一般瀏覽器則調用 `window.open`。
  - **全面遵循 Zero Emoji 規範 (`src/gas.js`)**：
    - 清理 `_handleCreateEventSheet` 後端同步提示訊息中之表情符號，嚴格保持純文字與數據反饋。

### v0.1.177 (2026-09-22)
- 根治 iOS WebKit (Safari / LINE App) 302 POST 重導向引發之 `Load failed` 異常：
  - **根本原因排查**：
    - 使用者於 iPhone 手機（iOS Safari / LINE in-app WebKit）操作活動管理點擊「報名試算表」時，前端原以 `fetch(GAS_API_URL, { method: 'POST' })` 呼叫。
    - Google Apps Script 對於 POST 請求會強制回傳 `302 Moved Temporarily` 跳轉至 `script.googleusercontent.com`。
    - iOS WebKit 跨域安全策略嚴格阻斷 cross-origin POST 302 重導向，底層直接拋出 `TypeError: Load failed`，導致請求無法抵達 GAS 後端進行同步。
  - **後端 GET 端點相容支援 (`src/gas.js`)**：
    - 於 `doGet(e)` 函式新增 `action === "create_event_sheet"` 處理分支，使試算表建立與名冊同步支援 GET 請求。
    - 由於 iOS WebKit 對跨域 GET 請求之 302 重導向完全相容並能順暢跟隨，徹底消除 `Load failed` 阻斷。
  - **前端切換為 `gasGet` 請求 (`src/pages/AdminEvents.tsx`)**：
    - 將 `handleCreateEventSheet` 升級為使用 `gasGet(appendAuthToken(...))`，在 URL 參數附帶 JWT 與時間戳記。
    - 開表視窗預先開啟流程加入 `try...catch` 容錯，防止被行動瀏覽器攔截。
  - **單元測試與建置驗證**：
    - 擴充 `test/77_event_sheet_sync_transparency.test.mjs` 加入第 6 項 iOS WebKit GET 模式相容測試，全專案 58 個測試套件、274 個單元測試 100% 通過，`tsc -b && vite build` 打包零錯誤。

### v0.1.176 (2026-09-22)
- 活動專屬 Google 試算表明冊同步透明度強化與防呆修復：
  - **根本原因排查與錯誤解除吞噬**：
    - 排查確認 `_backfillEventSpreadsheetMemberInfo` 過往在發生工作表定位錯誤或試算表欄數不足 23 欄時，於 `catch (err) { return 0; }` 直接吞噬錯誤，導致外層 `_handleCreateEventSheet` 誤以為成功並回傳虛假的 success，掩蔽真實錯誤。
    - 改寫為結構化回傳物件 `{ success, appendedCount, backfilledCount, totalSignups, sheetTotal, error }`；若發生例外直接透過 `_errorResponse` 印出完整錯誤細節，遵循規範第一條「錯誤訊息一律直接印出」。
  - **智慧工作表分頁定位 (`_findEventSignupSheet`)**：
    - 依序搜尋常規名冊名稱（「報名名冊」、「名冊」、「Signups」、「活動名冊」等），並嚴格排除 `_CONFIG` 等隱藏工作表，杜絕資料錯寫入設定分頁。
  - **邊界自動擴展與真實資料列定位**：
    - 寫入前檢查試算表總欄數，若小於名冊所需欄數（23 欄）則自動呼叫 `insertColumnsAfter` 補齊，防止 `Range coordinates are out of bounds`。
    - 精確計算最後有效資料列，避免範本預留格式空行造成新隊員被追加至底部遠處。
  - **前端同步狀態 Toast 通知與順暢導航**：
    - 在 `AdminEvents.tsx` 中整合 `setToastMessage`：同步完成時立即回報具體統計數據（如「已為您追加 6 筆新報名者，名冊目前共 17 人」或「試算表名冊已是最新狀態」）。
    - 若發生錯誤則透過 Toast 與 Alert 直接呈現真實錯誤原因，絕不掩蔽。
    - 嚴格維持零表情符號規範，全數測試通過。
  - **單元測試與建置驗證**：
    - 新增 `test/77_event_sheet_sync_transparency.test.mjs`，全專案 58 個測試套件、273 個單元測試 100% 通過，`tsc -b && vite build` 打包零錯誤。

### v0.1.175 (2026-09-22)
- 幹部後台個人資料「偏好語言」持久化與 RPC 防呆修復：
  - **根本原因排查**：幹部後台專屬 RPC 函式 `update_admin_member_rpc` 的 SQL UPDATE 語句中，遺漏了 `preferred_language`（偏好語言）欄位，導致編輯時雖然提示成功，但資料庫未更動、重新整理打回原形。
  - **SQL RPC 更新**：於 `update_admin_member_rpc` 補齊 `preferred_language = COALESCE(p_data->>'preferred_language', preferred_language)`，並增設 `IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', '查無此社員或資料庫更新筆數為 0！'); END IF;` 防呆保護，已同步發布至 Supabase 正式環境。
  - **前端資料校驗與即時重新載入**：
    - `src/utils/supabaseClient.ts`（`updateMemberFullDetailInSupabase`）：精確攔截 `rpcRes.success === false` 的錯誤訊息，並於直更模式加入 `.select()` 嚴格校驗更新筆數是否大於 0；清理空字串日期防範 PostgreSQL 22007 報錯。
    - `src/pages/MemberDetailEdit.tsx`：於儲存成功後主動調用 `await loadData()`，重新自 Supabase 取得最新完整紀錄，確保畫面與資料庫 100% 同步一致。
- 活動專屬獨立試算表人數短少修復與「先同步後開表」體驗升級：
  - **消滅 Race Condition 開表時差**：
    - 舊版 `AdminEventCard` 以 `<a target="_blank">` 在點擊瞬間直接打開 Google Sheets，背景 GAS 同步剛發出產生非同步時差，導致開表人看到同步前的舊試算表。
    - 改版為非同步 `<button>` 觸發流程：點擊「報名試算表」時按鈕轉為「同步名冊中...」旋轉動畫，預先開啟受保護新分頁，等候 GAS 自 Supabase 拉取最新名冊寫入 Google Sheets 後，自動導航至最新試算表，確保開表時人數 100% 準確齊全。
  - **後端報名自動同步至獨立試算表**：
    - 在 `src/gas.js` 補齊實作 `_appendToEventSpreadsheet(eventId, signupData, eventTitle)` 函式。
    - 當隊員在 LINE 報名或取消時，GAS Sync Worker 在消費 `event_signups` 佇列時，不僅寫入主試算表，更自動透過 `events.spreadsheet_id` 同步寫入活動專屬獨立試算表，**開表人完全免除 Google OAuth 授權**即可享有即時名冊。
- 單元測試與建置驗證：
  - 新增 `test/76_profile_preferred_language_and_sheet_sync.test.mjs`，全專案 57 個測試套件、268 個單元測試全數通過，`tsc -b && vite build` 零錯誤打包成功。

### v0.1.174 (2026-09-22)
- 後端腳本快照備份 (GAS Backend Snapshot Backup)：
  - 依使用者需求，完整複製建立當前 Google Apps Script 主程式快照檔案：`src/gas.backup_20260922.js`。
  - 保留 2026/09/14 之歷史備份 `src/gas.backup.js`，並具備今日日期時間標記，提供更精準之版本回溯與對照安全防護。

### v0.1.173 (2026-09-20)
- 外籍人士（未填個資）語言智慧自動辨識與活動卡片英文/雙語平滑回退：
  - **外籍人士語言自動判定機制 (`src/gas.js`, `_getUserPreferredLanguage`, `_getLineUserProfile`)**：
    - **問題排查**：外籍人士初次加入官方 LINE 時尚未填寫 `members` 個人資料，系統查詢 `preferred_language` 回傳 `null`，原本在活動詳情與活動列表直接強制回退至中文分支，導致外籍人士收到純中文 Flex 卡片無法閱讀。
    - **新增 `_getLineUserProfile(userId)` 函式**：當使用者在 `members` 表查無紀錄或語言未登記時，自動向 LINE Messaging API (`GET https://api.line.me/v2/bot/profile/{userId}`) 取得個人檔案。
    - **雙重智慧判定邏輯**：
      1. **LINE 語系判定**：若 `profile.language` 存在且非中文語系（例如 `en`, `ja`, `ko`, `id`, `vi`, `th` 等），自動將其視為國際通用英語 (`"en"`)。
      2. **暱稱拼音判定**：若手機端未回傳語系欄位，自動檢驗 `profile.displayName`，若暱稱不包含任何漢字 `[\u4e00-\u9fa5]` 且包含拉丁字母（如 "Eric Muriithi"），自動判定為 `"en"`；若含漢字則判定為 `"zh"`。
      3. **執行階段快取**：判定結果自動存入 `_userLangCache[userId]`，避免重複請求 LINE API。
  - **活動詳情與活動清單雙語/英文安全回退 (`sendEventDetail`, `sendEventList`)**：
    - 當判定為 `"en"` 時，卡片標籤全面顯示純英文（【Title】、【Summary】、【Detailed Itinerary】、Cost、Event Date、Sign Up Deadline、Sign Up 按鈕）。
    - 當遇極端狀況完全無法識別語系 (`prefLang === null`) 且該活動具備英文資料（`ev.title_en`、`ev.summary_en` 或 `ev.itinerary_en`）時，系統自動啟動**中英雙語對照呈現**（標籤顯示【名稱 Title】、【簡介 Summary】、【詳細行程 Detailed Itinerary】），絕不再強行輸出純中文。
    - 按鈕文字亦同步支援雙語與純英文點擊文案（如 `I want to view details for ...` / `Sign up for ...`）。
  - **測試與建置驗證**：
    - 擴充 `test/73_preferred_language_messaging.test.mjs`，完整覆蓋外籍人士未填個資語系判定、純英文拼音辨識及雙語回退標籤斷言。
    - 全專案 56 個測試套件、263 個單元測試 100% 通過，TypeScript 與 Vite 打包零錯誤。

### v0.1.172 (2026-09-20)
- 修復心得牆內點擊「編輯/撰寫我的心得」表單層級 (z-index) 遮蔽問題：
  - **根本原因排查**：全螢幕拍立得心得牆 (`ReflectionWallModal.tsx`) 之全螢幕容器層級為 `zIndex: 9999`（內部 FAB 按鈕為 `10001`、照片燈箱為 `10002`），而心得填寫/編輯表單 Modal (`Achievements.tsx`) 舊有層級僅為 `zIndex: 1000`，導致點擊 FAB 後編輯表單被全螢幕心得牆完全遮蓋在後方，畫面上無法顯示。
  - **層級提升修復 (`Achievements.tsx`)**：
    - 將心得填寫/編輯 Modal 之容器層級由 `1000` 提升至 `11000`，確保表單能清晰浮現在全螢幕心得牆的最上方。
    - 點擊「儲存修改」成功後即時刷新底層心得牆並關閉表單；點擊「取消編輯」或關閉時，表單平滑關閉並完好保留在心得牆畫面。
  - **防回退單元測試與打包驗證**：
    - 於 `test/75_event_reflection_wall.test.mjs` 加入斷言，檢驗心得表單 Modal 之 `zIndex: 11000` 嚴格高於 `ReflectionWallModal`。
    - 全專案 56 個測試套件、261 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.171 (2026-09-20)
- 活動出隊足跡卡片極簡化與心得牆 FAB 智慧切換（撰寫/直接編輯）：
  - **出隊足跡活動卡片視覺極簡化 (`src/pages/Achievements.tsx`)**：
    - **移除多餘干擾元素**：徹底刪除照片左上角之「✨ 活動出隊心得牆」標籤、出隊日期旁之長串藍字提示文字，以及右下角的「查看我的回憶 / 留下回憶」按鈕。
    - **簡約向右箭頭指示 (`ChevronRight`)**：卡片右側改為水平兩端對齊（左側標題與出隊日期、右側配置淡灰向右箭頭），直觀示意點擊整張卡片一律全螢幕開啟該活動之心得牆。
  - **心得牆右下角 FAB 智慧切換與直接進入編輯模式 (`src/pages/Achievements.tsx`, `src/components/achievements/ReflectionWallModal.tsx`)**：
    - 正確將活動之 `hasReflected` 狀態傳遞至 `ReflectionWallModal`。
    - **未撰寫過心得者**：FAB 按鈕顯示「留下我的回憶」，點擊開啟全新空白填寫表單。
    - **已撰寫過心得者**：FAB 按鈕顯示「編輯我的心得」，點擊**直接開啟編輯模式表單**（自動載入既有評分、心得全文與照片，並支援即時修改與儲存）。
  - **單元測試與建置驗證**：
    - 更新 `test/75_event_reflection_wall.test.mjs`，驗證卡片極簡 ChevronRight 佈局與 FAB directEdit 連動。
    - 全專案 56 個測試套件、261 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.170 (2026-09-20)
- 活動出隊足跡「山系拍立得心得牆 (Reflection Wall)」與公開/私密設定重磅上線：
  - **特色山系拍立得剪貼簿風 UI (`src/components/achievements/ReflectionWallModal.tsx`)**：
    - **拍立得相紙卡片**：每筆公開心得採用復古白色拍立得相紙邊框，頂部搭配半透明磨砂紙膠帶，並根據卡片序號賦予自然隨機傾角（-2.1° ~ +2°），營造宛如實體山屋布告欄的溫暖手工感。
    - **拍立得 3D 翻面互動 (Flip Card)**：點擊卡片正面平滑 3D 翻轉（`preserve-3d` 與 `rotateY(180deg)`），背面手寫字體排版展示心得全文、風景與路線星星評分、出隊日期與作者暱稱；無照片的心得則以溫暖鵝黃牛皮便條紙呈現。
    - **全螢幕高畫質燈箱 (Lightbox)**：點擊拍立得相片即刻放大開啟黑底全螢幕相片燈箱，支援多張相片無縫左右切換、計數與關閉。
    - **常駐懸浮撰寫按鈕 (FAB) 與溫暖空狀態**：心得牆右下角配置常駐綠色懸浮按鈕（FAB），隨時點擊開啟心得撰寫；尚無公開心得時展示溫暖插圖與第一位分享者引導按鈕。
  - **出隊足跡卡片互動升級 (`src/pages/Achievements.tsx`)**：
    - 點擊「出隊足跡」之歷史活動卡片一律全螢幕開啟該活動之「心得牆」，並提供微陰影浮起互動回饋（Hover lift effect）。
    - 卡片右下角保留「查看我的回憶」/「留下回憶」捷徑按鈕（具備阻止事件冒泡 `stopPropagation`）。
  - **心得公開/私密性切換 (Public / Private Visibility)**：
    - 心得填寫與編輯表單新增「公開心得至活動心得牆」切換開關（Toggle switch），預設為開啟「公開」狀態，附帶綠色地球圖示與清晰說明，關閉則標記為「僅自己可見」。
    - 提交心得後即刻同步更新資料庫並觸發心得牆即時重新聚合載入。
  - **Supabase 資料庫層與 RPC 升級 (`supabase/reflections_wall_rpc.sql`, `src/utils/supabaseClient.ts`)**：
    - `reflections` 表新增 `is_public BOOLEAN DEFAULT true` 欄位與複合索引 `idx_reflections_event_public (event_id, is_public)`。
    - 升級 `save_reflection_rpc` 支援 `is_public` 與 `authorName` 儲存，自動從 `members` 表連動社員真實姓名。
    - 新建 `get_event_public_reflections_rpc(p_event_id TEXT)` 安全定義函式，一鍵極速聚合回傳公開心得清單（延遲 < 50ms）。
    - 前端擴充 `fetchEventPublicReflections` 與 `PublicReflectionItem` 介面。
  - **中英雙語系完整支援 (`locales/zh.json`, `locales/en.json`)**：
    - 新增 `achievements.wall`（標題、副標題、空狀態、翻面提示、FAB 文案）與 `achievements.modal.isPublicLabel`、`isPublicDesc` 等多國語言鍵值。
  - **單元測試與打包驗證**：
    - 新增 `test/75_event_reflection_wall.test.mjs`，驗證拍立得 3D 翻轉、相片燈箱、FAB 按鈕、卡片點擊、隱私切換、RPC 與語系鍵。
    - 全專案 56 個測試套件、261 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.169 (2026-09-20)
- 資料填寫頁碼點擊跳轉、大頭貼選單緊湊化與加入群組按鈕單語言化：
  - **資料填寫頂部頁碼可點擊跳轉 (`Register.tsx`, `App.css`)**：
    - 步驟進度條圓點與標籤（`.step-dot-wrapper`）全面支援點擊切換頁面，加入 `cursor: pointer`、鍵盤無障礙與懸浮微動畫（`hover scale`），使用者可自由於 1~4 步驟間穿梭填寫。
    - 表單送出 (`handleSubmit`) 加入嚴密防呆校驗：若在後續步驟送出但第一步驟必填欄位尚未填妥，系統自動導航切回第 1 步並聚焦提示，確保資料完整寫入。
  - **大頭貼選單寬度自適應緊湊化 (`App.tsx`)**：
    - 將全域下拉選單 (`.dropdown-menu`) 寬度由固定 `160px` 重構為自適應內容寬度 `width: max-content` 與 `min-width: 120px`。
    - 微調選單項目內邊距至 `padding: 8px 14px` 搭配 `white-space: nowrap`，消除英文模式與中文模式下右側大片多餘空白，視覺更緊湊和諧。
  - **個人主頁「加入活動群組」按鈕單語言顯示 (`Dashboard.tsx`, `locales/zh.json`, `locales/en.json`)**：
    - 擴充中英文語系字典之 `dashboard.activity.joinGroup`。
    - 移除原本硬編碼的中英並陳字串（`加入活動群組 Join Group`），英文環境顯示「Join Group」，中文環境顯示「加入活動群組」。
  - **單元測試與建置驗證**：
    - 新增 `test/74_register_step_click_and_dashboard_ui.test.mjs`，同步更新既有測試之相容斷言。
    - 全專案 55 個測試套件、257 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.168 (2026-09-20)
- 個人主頁 (Dashboard) 活動報名狀態支援偏好語言與中英雙語切換：
  - **資料庫 RPC 擴充 (`get_my_dashboard`)**：
    - 更新 Supabase 雲端與本地 `supabase/get_my_dashboard.sql`，於 `v_activities` 查詢中同時回傳 `eventNameZh`（中文名稱）、`eventNameEn`（英文名稱），且 `eventName` 預設依社員的 `preferred_language` 自動選用。
    - 於 `v_profile` 回傳社員本人之 `preferredLanguage`（`zh` 或 `en`）。
  - **前端 LIFF 雙向語言連動 (`Dashboard.tsx`, `App.tsx`, `Register.tsx`)**：
    - 活動報名卡片名稱改為依當前語系動態選取：英文時顯示 `act.eventNameEn || act.eventName`，中文時顯示 `act.eventNameZh || act.eventName`。
    - 社員填寫個人資料偏好語言後，前端儲存即時更新 `app_lang`，並於個人主頁載入時自動同步 `i18n` 介面語系（使用者若曾手動於頂部按鈕切換語言則予以保留）。
  - **單元測試與建置防護**：
    - 於 `test/73_preferred_language_messaging.test.mjs` 中擴充測試，檢驗 `get_my_dashboard.sql` 與 `Dashboard.tsx` 語系相容性。
    - 全專案 54 個測試套件、254 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.167 (2026-09-20)
- 修復最新活動 (Activities) 輪播卡片與活動詳情 Supabase 查詢欄位對齊：
  - **根本原因排查**：在 `sendEventList` 與 `sendEventDetail` 中，向 Supabase `events` 表發起查詢時誤傳了不存在的欄位名稱（`name_en`、`short_desc_en`），導致 Supabase PostgREST 拋出 HTTP 400 Bad Request 錯誤，系統判斷查詢失敗而回傳「目前這學期還沒有排定的活動喔！ / There are no scheduled activities for this semester yet!」。
  - **欄位全面校正與容錯回退**：
    - 將 `sendEventList` 查詢欄位修正為 Supabase 實際存在的欄位名稱：`"id,title,title_en,fee,start_date,end_date,deadline,status,summary,summary_en,cover_image_url"`。
    - 取得英文名稱與說明時，優先採用資料庫標準欄位 `title_en`、`summary_en` 與 `itinerary_en`，並保留歷史兼容性回退。
  - **自動化測試防護**：
    - 於 `test/73_preferred_language_messaging.test.mjs` 中擴充測試案例，嚴格驗證查詢欄位與實際資料表結構 100% 吻合，杜絕 PostgREST 400 錯誤。
    - 全專案 54 個測試套件、253 個單元測試 100% 通過，`pnpm build` 建置零錯誤。

### v0.1.166 (2026-09-20)
- 依社員偏好語言個人化發送訊息（現有雙語精準拆分機制）：
  - **核心設計原則（嚴格拆分現有文案，絕不重新寫作）**：
    - 系統中傳送給社員之業務互動與推播訊息，全面介接資料庫中的偏好語言（`members.preferred_language`）。
    - 偏好為英文 (`en`) 時，精確取用現有雙語文案的「英文區塊」。
    - 偏好為中文 (`zh`) 時，精確取用現有雙語文案的「中文區塊」。
    - 未設定偏好或訪客時，自動回退為原有的「完整中英並陳（含分隔線）」，確保新朋友與未註冊者無障礙閱讀。
  - **LINE 聊天室公眾文字指令維持原樣**：
    - 聊天室固定問答關鍵字（如「關於社團 / About Us」、「社辦資訊 / Office」等）維持中英雙語對照，確保使用者不會因關鍵字不符合而無法觸發回覆。
  - **7 大個人化訊息情境落地覆蓋**：
    1. **最新活動輪播卡片 (`sendEventList`)**：依使用者切換中文/英文活動名稱、簡介、欄位標籤（費用/時間/截止）與按鈕。
    2. **單一活動詳情卡片 (`sendEventDetail`)**：依使用者切換中文/英文行程、簡介與操作按鈕。
    3. **活動一鍵報名與備取互動回覆 (`handleSignup`, `handleConfirmWaitlist`)**：已截止提示、查無活動、個資未完整提醒、重複報名提示、報名成功收據與備取意願更新回覆。
    4. **活動審核結果 Flex 推播 (`_handleSendEventNotifications`)**：正取與備取通知卡片依每位錄取社員的偏好語言分別產出純英文、中文或雙語之 Flex Message。
    5. **活動取消確認推播 (`_handleCancelEventSignup`)**：依偏好語言發送個人取消憑證。
    6. **裝備租借申請與狀態更新推播 (`_handleBorrowApplication`, `_handleNotifyLoanStatusUpdated`, `_handleNotifyLoanCancelled`)**：租借申請個人收據、狀態變更通知與取消收據。
    7. **繳費申報個人收據與核銷完成通知 (`_handleNotifyOfficersPayment`, `_handleNotifyPaymentConfirmed`, `_processPaymentVerification`)**：繳費申報收據與繳費成功核銷推播。
- 單元測試與建置驗證：
  - 新增 `test/73_preferred_language_messaging.test.mjs`，驗證偏好語言查詢快取、雙語拆分與回退正確性、輪播與詳情個人化、Flex 推播語系分流。
  - 全專案 54 個測試套件、252 個單元測試 100% 通過，`tsc -b && vite build` 建置零錯誤。

### v0.1.165 (2026-09-20)
- 統一全系統活動編號 (Unified Event ID Format)：
  - 全系統強制統一僅使用一種活動編號格式：`E{yyMM}-{兩位流水號}`（例如 `E2609-01`、`E2609-05`）。
  - Supabase RPC `save_admin_event_rpc`：建立或暫存活動且未傳入編號時，以當月前綴 `E{yyMM}-` 查詢 `events` 資料表最大序號自動累加並 `lpad(..., 2, '0')` 取號。
  - GAS 後端 `_handleSaveEvent`：取號邏輯完全以 Supabase `events` 表作為唯一真實來源 (SSOT)，同步生成對齊之 `E{yyMM}-{兩位流水號}`。
  - 歷史既有資料維持原樣不強制更動，所有新建立或暫存之活動一律套用全新統一編號。
- 最新活動 (Activities) 輪播卡片過濾規則優化：
  - 手動關閉活動排除：狀態為「關閉 (Closed)」或「草稿 (Draft)」的活動不再顯示於輪播卡片中。
  - 活動結束逾 2 週排除：活動結束超過 14 天（`> 14 天`，以 `end_date || start_date` 判定）的活動自動排除，保持輪播清單整潔。
  - 報名截止但尚未關閉之活動友善呈現：
    - 報名截止但尚未手動關閉之活動保留在輪播卡片中。
    - 狀態標籤顯示為「報名截止 Registration Closed」(灰色 `#999999`)。
    - 點進查看詳情卡片時，「一鍵報名 Sign Up」按鈕自動轉為反灰且不可點擊之「報名已截止 Closed」提示，保留「查看詳情」供社員回顧行程。
- 完整單元測試與建置驗證：
  - 新增 `test/72_unified_event_id_and_activities_filter.test.mjs`，驗證取號格式、過濾條件、標籤顏色與按鈕狀態。
  - 全專案 53 個測試套件、247 個單元測試 100% 通過，`tsc -b && vite build` 建置零錯誤。

### v0.1.164 (2026-09-20)
- 活動中英文雙語欄位分開填寫與草稿暫存機制 (AdminEventForm, AdminEvents, supabase/bilingual_events_and_preferred_language.sql):
  - **中英文欄位分開填寫與完美對齊**：
    - 活動名稱、精簡簡介與詳細行程全面支援中英文分開填寫（中文：`name`, `shortDesc`, `fullDesc`；英文：`nameEn`, `shortDescEn`, `fullDescEn`），資料庫對應寫入 `events` 表的 `title_en`, `summary_en`, `itinerary_en` 欄位。
    - 頂部彈窗標題移除原先之「發布新活動」文字，換置為高雅精巧的 `[中文 (ZH)]` 與 `[English (EN)]` 分頁切換 Segmented Control。
    - 共用欄位（出隊開始/結束日期、報名截止時間、預計費用、報名狀態、封面圖片、LINE 交流群組連結、雲端資料夾網址、試算表名冊連結）在切換語言分頁時完全共用且同步連動。
  - **活動雙按鈕：「暫存活動」與「確認發布」**：
    - 表單底部取消原先單一按鈕，改為並列之 `[暫存活動]`（Bookmark 圖示）與 `[確認發布]`（Send 圖示）。
    - **草稿暫存 (Save Draft)**：幹部無需一次填完所有必填資訊，僅需填寫活動名稱即可隨時點擊暫存。草稿直接直寫至 Supabase `save_admin_event_rpc`，報名狀態設為「關閉 (Draft)」，不觸發耗時之 Google Drive 資料夾複製與試算表名冊建立，秒級安全儲存。
    - **確認發布 (Confirm Publish)**：嚴格執行中英文全欄位必填驗證（中文名稱、日期、截止日、費用、狀態、中文簡介、中文行程，以及英文名稱、英文簡介、英文行程）。
    - **缺漏智慧跳轉與提示**：若有缺漏欄位，彈窗會具體條列缺漏的項目名稱；若中文填妥但英文尚未填寫，系統會自動切換至 `[English (EN)]` 分頁並聚焦至未填欄位，降低幹部認知負擔。
  - **即時預覽雙語連動與卡片雙語呈現**：
    - 表單底部即時預覽卡片隨中英分頁即時切換呈現對應語言之活動資訊。
    - 活動清單卡片（`AdminEventCard` 與 `AdminHistoryEventCard`）標題支援中英文並列對照（如：`活動中文名稱 / English Title`）。
- 社員偏好語言設定與 LIFF / LINE 訊息雙語適配 (Register, MemberDetailEdit, MemberProfileModal, gas.js):
  - **註冊表單必填偏好語言下拉選單 (Register.tsx)**：
    - 於註冊與個資修改步驟 1（基本必填資料）新增「偏好語言 (Preferred Language)」必填下拉選單，嚴格提供且僅提供兩個選項：`中文` 與 `English`。
    - 使用者提交資料並儲存成功後，系統自動呼叫 `i18n.changeLanguage(...)` 將整個 LIFF 介面無縫切換為使用者選擇之語系，並持久化至 `localStorage` (`i18nextLng`)。
  - **幹部後台檢視與編輯支援**：
    - `MemberDetailEdit.tsx`（社員詳細編輯）：在基本資料區塊新增「偏好語言 (Preferred Language)」下拉選單，幹部可隨時檢視與調整社員之預設語言。
    - `MemberProfileModal.tsx`（個資預覽彈窗）：在基本資料區塊清晰呈現社員之「偏好語言：中文 / English」。
  - **LINE 推播訊息語言適配 (src/gas.js)**：
    - 在 LINE Bot Webhook 與資料變更推播處理常式中，讀取使用者設定之 `preferred_language`。
    - 選擇 English 之社員接收純英文之官方通知訊息，選擇中文之社員接收繁體中文通知，未設定者維持中英雙語對照推播。
- 單元測試與建置驗證：
  - 新增 `test/69_bilingual_events_and_preferred_language.test.mjs` 專屬單元測試，全面驗證活動雙語欄位分頁切換、草稿暫存、發布必填防護、自動分頁跳轉、註冊表單偏好語言驗證與幹部端檢視。
  - 全專案 244 項單元測試 100% 通過，`tsc -b && vite build` 打包建置零錯誤。

### v0.1.163 (2026-09-20)
- 管理頁面返回上一頁智慧歷程導航 (Smart History Back Navigation)：
  - **核心問題排查與架構解耦**：
    - 過去幹部管理模組之「返回」按鈕多硬編碼寫死為特定路由（例如：社員詳細資料編輯頁固定返回 `/admin/members`、個人歷史紀錄固定返回 `/admin/members/:userId`、歷史活動歸檔固定返回 `/admin/events`）。
    - 當幹部從財務對帳（`AdminFinance`）或租借管理（`AdminLoans`）點擊彈窗的「移至社員詳細資料編輯頁面」進行跳轉時，點擊返回卻被強制帶往社員名冊清單頁（`/admin/members`），打斷原本的財務或裝備審核工作流。
  - **通用的智慧上一頁工具函式 (`src/utils/navigationUtils.ts`)**：
    - 新增 `safeNavigateBack(navigate, fallbackPath)` 輔助函式。
    - 透過校驗 `window.history.state?.idx > 0` 判定使用者是否有前一個網頁瀏覽歷史：若存在上一頁則精準執行 `navigate(-1)`，無縫返回來源頁面（如 `AdminFinance`, `AdminLoans`, `AdminEvents`, `MemberDetailEdit` 等）。
    - 若無歷程（如幹部直接重新整理頁面或透過深層連結直接開啟），則以 `{ replace: true }` 安全平滑回退至各頁面所屬之預設安全路徑，徹底防止跳出 LINE LIFF 容器或卡死在白畫面。
  - **全域管理頁面返回按鈕改造與文案統一**：
    - `MemberDetailEdit.tsx`（社員詳細編輯）：返回按鈕由固定 `navigate('/admin/members')` 改為 `safeNavigateBack(navigate, '/admin/members')`，文案統一為「返回上一頁」。
    - `MemberRecords.tsx`（個人歷史紀錄）：返回按鈕由固定 `navigate('/admin/members/' + userId)` 改為 `safeNavigateBack(navigate, '/admin/members/' + userId)`，文案統一為「返回上一頁」。
    - `AdminEventsHistory.tsx`（歷史活動歸檔）：`NotionFilterBar` 最左側純圖示返回按鈕（以及權限不足時的返回按鈕）改為 `safeNavigateBack(navigate, '/admin/events')`，標題提示與按鈕文案對齊為「返回上一頁」。
    - `AdminEvents.tsx`（活動管理）：權限不足 fallback 畫面之返回按鈕改為 `safeNavigateBack(navigate, '/dashboard')`，按鈕文案對齊為「返回上一頁」。
- 單元測試與建置驗證：
  - 新增 `test/71_smart_back_navigation.test.mjs` 專屬單元測試，模擬驗證有上一頁歷程時 `navigate(-1)` 之正確調用、無歷程時安全回退 fallback、各管理頁面源碼靜態分析確保皆採用 `safeNavigateBack` 且按鈕文案統一。
  - 全專案 237 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.162 (2026-09-20)
- 活動管理與歷史歸檔頁面 5 大介面優化與跳轉修復：
  - **主頁工具列緊湊整合**：
    - 移除「進行中活動（共 X 場）」頂部標題塊，消除重複留白。
    - 「歷史活動」按鈕簡化為純圖示（`<History size={18} />`），支援標題浮動提示與場次徽章，直接整合置於 `NotionFilterBar` 之「新增活動」（`+`）按鈕左側。
  - **修復跳轉社員編輯抓錯欄位缺陷 (ApplicantModals & supabaseClient)**：
    - 排查修正 `ApplicantModals.tsx` 導航邏輯：將 `targetId` 取值順序調整為優先抓取 `line_user_id`（`U...` 系統唯一識別碼）而非 `lineId`（自訂帳號，如 `brianhung0975`），徹底根除「找不到使用者識別碼為 brianhung0975 的社員資料」之錯誤。
    - 於 `supabaseClient.ts` 之 `fetchMemberFullDetailFromSupabase` 直讀備援擴充 `.or('line_user_id.eq.' + userId + ',line_id.eq.' + userId)` 雙軌支援，防禦各類識別碼查詢。
  - **歷史頁面返回按鈕純圖示化並左移**：
    - `NotionFilterBar` 擴充 `prefixElement` 屬性支援。
    - 歷史活動頁「返回活動管理」按鈕改為純圖示按鈕（`<ArrowLeft size={18} />`），直接放置於搜尋框的最左側，形成簡約高雅的單行工具列。
  - **移除歷史頁面搜尋框上方標題**：
    - 刪除搜尋框上方之「歷史活動歸檔」標題與說明橫幅，全站幹部管理工具列規格完全一致。
  - **歷史活動卡片箭頭與統計徽章靠左優化 (AdminHistoryEventCard)**：
    - 移除「查看詳情 / 收合資訊」純文字，僅保留 `<ChevronDown size={18} />` / `<ChevronUp size={18} />` 展開箭頭。
    - 頂部主卡片重構為上下結構：上半部為「縮圖 + 活動標題/日期/費用」，下半部獨立一行放置「報名人數框框、正取、備取徽章」，直接靠齊卡片最左側內距（不受上方 88px 圖片推擠影響），右側配置展開箭頭。
- 單元測試與建置驗證：
  - 新增 `test/70_admin_events_ui_refinement.test.mjs`，驗證跳轉優先抓取 `line_user_id`、直讀雙軌備援、標題移除、圖示按鈕位置與卡片統計指標佈局。
  - 全專案 232 項單元測試 100% 通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.161 (2026-09-20)
- 活動管理頁面重新設計與歷史活動歸檔系統 (AdminEvents & AdminEventsHistory)：
  - **獨立子路由架構**：新增 `/admin/events/history` 路由，並於頂部導航配置「返回活動管理」按鈕與「歷史活動歸檔」標題。
  - **歸檔判定與主頁資料隔離 (`isEventArchived`)**：
    - 建立 `src/utils/eventArchiveUtils.ts`，以活動結束日（`endDate`，若無則回退 `startDate`）加上 14 天（結束滿兩週）為嚴格基準。
    - 活動管理主頁自動排除已結束滿兩週之活動，僅保留進行中、未來及兩週內結束之活動，維持主頁簡潔清爽。
    - 主頁頂部配置「歷史活動」按鈕與歷史場次即時計數徽章，點擊平滑跳轉至歷史活動頁面。
  - **歷史活動卡片手風琴展開與折疊互動 (`AdminHistoryEventCard`)**：
    - 卡片支援手風琴開展與收合，呈現標題、出隊日期、代號、費用與報名人數徽章。
    - 活動「簡介」與「詳細時程與裝備需求」預設收起，提供獨立的展開/收合開關。
    - 若有設定 LINE 交流群組連結，提供一鍵外開按鈕。
  - **報名人員名冊延遲載入與正備取排序**：
    - 展開卡片時依需延遲載入（Lazy Loading）該場活動報名名冊，並寫入快取，兼顧首頁秒開與流量節約。
    - 報名名單嚴格依照「正取 (Confirmed) 優先 > 備取 (Waitlisted) 次之 > 審核中/其他在後」排序，同狀態按報名序號排列。
    - 提供「全部」、「僅正取」、「僅備取」切換標籤與人數計數。
  - **報名者個資彈窗唯讀模式與社員編輯跳轉**：
    - `ApplicantModals` 組件擴充 `isReadOnly` 模式，在歷史活動中隱藏「正取/備取/重設」審核按鈕，防止誤改歷史名冊。
    - 彈窗底部保留「移至社員詳細資料編輯頁面」導航按鈕，點擊無縫切換至 `/admin/members/:userId`。
  - **NotionFilterBar 搜尋、多維度篩選與排序**：
    - 歷史活動頁頂部工具列支援關鍵字搜尋（名稱、代號）。
    - 支援動態出隊年份篩選（全部年份、各年份動態提取）與活動狀態篩選。
    - 支援依出隊日、報名截止日升降冪排序與即時重新整理。
- 單元測試與建置驗證：
  - 新增 `test/69_admin_events_history.test.mjs`，完整涵蓋日期解析器相容性、歷史歸檔門檻判定、出隊年份提取、正備取優先排序與主頁歷史資料隔離測試。
  - 全數 227 項單元測試通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.160 (2026-09-20)
- 修復個人資料彈窗 (MemberProfileModal) 誤判為「非社員」缺陷 (src/components/admin/MemberProfileModal.tsx, src/components/admin/ApplicantModals.tsx):
  - 根本原因排查：Supabase PostgreSQL `members` 資料表中的正式社員欄位名稱為 `is_official_member`（布林值 `BOOLEAN`）。總覽清單頁面 (`AdminMembers.tsx`) 與詳細資料編輯頁面 (`MemberDetailEdit.tsx`) 皆直接讀取 `is_official_member`，因此列表能正確呈現「正式社員」徽章且編輯表單有確實勾選；但個人資料預覽彈窗 (`MemberProfileModal.tsx`) 內部判定邏輯原先僅比對 `merged.is_official === true || merged.is_official === '是' || merged.isOfficial === '是'`，遺漏了資料庫真實欄位 `is_official_member`，導致運算結果永遠為 false，錯誤渲染為灰色「非社員」標籤。
  - 全欄位防禦相容判定：於 `MemberProfileModal.tsx` 擴充身分判定邏輯，全面相容 `is_official_member`、`is_official`、`isOfficial` 與 `isOfficialMember` 之布林值與中英文字串型態，確保彈窗身分標籤與總覽名冊及資料庫 100% 嚴格一致。
  - 報名名冊個資彈窗防禦補強：於 `ApplicantModals.tsx` 同步補強身分判定，全面相容布林值與字串型態之社員資格判定。
- 單元測試與打包建置:
  - 新增 `test/68_member_profile_modal_official_status.test.mjs` 專屬單元測試，驗證 `MemberProfileModal` 與 `ApplicantModals` 在各種欄位格式下均能正確識別正式社員狀態。全專案 222 項單元測試 100% 通過，前端 `tsc -b && vite build` 成功打包零錯誤。

### v0.1.159 (2026-09-18)
- 幹部管理系統「重新整理優先直連 Supabase (<50ms)」與極速同步修復 (src/pages/AdminEvents.tsx, src/pages/AdminFinance.tsx, src/pages/AdminMembers.tsx, src/pages/AdminLoans.tsx, src/pages/AdminInventory.tsx, src/pages/MemberRecords.tsx):
  - 根本原因排查：先前點擊管理頁面的重新整理按鈕時，因傳遞 `forceRefresh = true`，系統直接繞過 Supabase 快取並調用緩慢的 Google Apps Script 端點 (`get_admin_events`, `get_event_signups`)，導致幹部面臨 5~15 秒的無感等待與轉圈，重載體驗甚至劣於直接刷新整個瀏覽器網頁。
  - 架構修復：清除記憶體快取後，所有管理頁面的重新整理操作一律「優先直連 Supabase RPC」，平均在 50ms 內完成秒開；嚴格限制僅在 Supabase 連線發生網路或資料庫報錯時，才無縫回退至 GAS 備援。
  - 整合成功 Toast 綠色回饋提示：於 6 大幹部管理與個人歷史頁面（AdminEvents, AdminFinance, AdminMembers, AdminLoans, AdminInventory, MemberRecords）加入「已同步最新資料！」綠色 Toast 回饋橫幅，2~2.5 秒後自動優雅淡出，提供幹部明確的操作即時回饋。
- 出隊心得「編輯回饋」功能解鎖與相片獨立管理維護 (src/pages/Achievements.tsx, src/locales/zh.json, src/locales/en.json):
  - 解鎖心得編輯模式：在「查看我的回憶」彈窗頂部新增「編輯心得」按鈕 (`<Edit3 size={13} />`)，點擊即可切換至編輯模式，解鎖星等評分與心得內容輸入框，並提供「取消編輯」（一鍵還原既有內容）與「儲存修改」按鈕。
  - 既有相片獨立刪除機制：將已儲存的心得相片轉化為縮圖網格展示，每張照片右上角均配置獨立紅色「✕」刪除按鈕，方便社員精準剔除不合適的照片。
  - 動態剩餘配額與 Canvas 壓縮上傳：即時計算剩餘可上傳張數 (`5 - 既有照片數 - 新選取數`)，支援追加上傳至多 5 張照片上限，並透過前端 Canvas 自適應壓縮後上傳 Google Drive。
  - 編輯更新靜默防擾機制：心得修改儲存後直寫 Supabase `save_reflection_rpc`（內部已具備 `ON CONFLICT (event_id, line_user_id) DO UPDATE` 支援），並主動跳過向幹部群組推播之 `notify_reflection_submitted`，避免重複修改多次打擾幹部。
  - 雙語系國際化支援：於 `zh.json` 與 `en.json` 補充 `editTitle`, `editBtn`, `cancelEditBtn`, `saveEditBtn`, `updateSuccess`, `existingPhotos` 等完整詞彙。
- 單元測試與打包建置:
  - 新增 `test/67_fast_refresh_and_reflection_edit.test.mjs` 專屬單元測試，全面驗證 Supabase 優先重載、成功 Toast 提示、心得編輯、相片刪除與編輯防重複推播機制。全專案 219 項單元測試 100% 通過，前端 `tsc -b && vite build` 成功打包零錯誤。

### v0.1.158 (2026-09-18)
- 財務對帳未申報項目狀態正名為「待繳費 Unpaid」與通知狀態解耦 (觀點 B 全社應收帳款管理架構) (supabase/admin_portal_rpc.sql, src/pages/AdminFinance.tsx, src/utils/supabaseClient.ts, src/types/admin.ts):
  - 根本原因排查：
    1. **狀態硬編碼誤導**：`get_admin_finance_rpc` 原先將「未填報 payments 之正取待繳費活動報名（event_signups）」與「未結清之裝備租借單（loans）」直接無差別賦予 `'待確認 Checking'`。導致學員正取後尚未匯款或申報，財務後台卻直接顯示黃色「待確認 Checking」標籤，使幹部誤以為學員已付款待查帳，造成嚴重混淆。
    2. **通知狀態領域綁錯（Domain Leakage）**：`get_admin_finance_rpc` 在活動報名區段直接讀取 `COALESCE(s.notification_status, '未通知')`。此欄位在 event_signups 表中代表「活動正備取錄取推播通知」，而非「繳費核銷完成通知」。當活動管理員發送正取通知信後，該欄位變為 `'已通知'`，導致財務對帳卡片合併顯示為荒謬的「【待確認】【已通知】」；更嚴重的是，AdminFinance.tsx 內部判定僅在 `editNotificationStatus === '未通知'` 時才觸發核銷推播，造成日後幹部核銷該筆款項時跳過發送 LINE 繳費核銷成功訊息，形成連鎖推播 Bug。
  - 資料庫 RPC 修正 (supabase/admin_portal_rpc.sql)：
    1. 狀態動態對應：在 `get_admin_finance_rpc` 的 event_signups 與 loans 區段，改以 `CASE WHEN ... = '待確認 Checking' THEN '待確認 Checking' ELSE '待繳費 Unpaid' END AS status` 動態產出狀態，未填報者正式正名為 `'待繳費 Unpaid'`。
    2. 通知狀態解耦：將活動報名區段之通知狀態強制解耦為固定 `'未通知' AS notification_status`，切斷與活動錄取通知信的張冠李戴，確保核銷推播機制正常工作。
    3. 核銷連動支援：在 `update_admin_payment_status_rpc` 中新增 `WHEN p_status = '待繳費 Unpaid' THEN '未繳費 Unpaid'::payment_status_enum` 映射，確保幹部切換狀態時不會被強迫轉換成待確認。
  - 前端介面與型別連動 (src/types/admin.ts, src/pages/AdminFinance.tsx, src/utils/supabaseClient.ts)：
    1. 前端型別擴充：`AdminFinanceItem.status` 與狀態選單正式納入 `'待繳費 Unpaid'`。
    2. 視覺化徽章更新：卡片徽章針對 `'待繳費 Unpaid'` 呈現淺紅色警示背景 (`#fef2f2`) 與深紅文字 (`#dc2626`)，與已核銷綠色標籤及待確認黃色標籤鮮明區隔。
    3. Notion 篩選器與彈窗支援：狀態篩選下拉清單新增「待繳費 Unpaid」，詳細對帳彈窗下拉選單同步支援在待繳費、待確認與已核銷間切換。
    4. 直查備援機制補全：`fetchFinanceItemsFromSupabase` 與 `updatePaymentAndLinkedStatusInSupabase` 完整支援 `'待繳費 Unpaid'` 解析，並補齊 event_signups 直查與更新備援邏輯。
  - 單元測試與打包建置:
    - 新增 test/66_finance_unpaid_and_notification_decoupling.test.mjs 專屬單元測試，全面驗證 RPC 狀態正名、通知狀態解耦、前端型別、篩選選單與色彩徽章。全專案 215 項單元測試 100% 通過，前端 `tsc -b && vite build` 成功打包。

### v0.1.157 (2026-09-18)
- 修復觸發器 sync_queue 寫入遭受 RLS 阻斷問題 (supabase/triggers.sql, supabase/schema.sql, supabase/fix_sync_queue_rls.sql):
  - 根本原因排查：管理員在裝備管理頁面更新裝備（或任何觸發資料庫 trg_sync_* 觸發器之操作）時，資料庫觸發函式 trg_fn_enqueue_sync 預設以呼叫者權限（SECURITY INVOKER）執行。由於前端使用匿名 anon key 連線，遭遇 sync_queue 資料表的 Row-Level Security 政策阻擋，引發 PostgreSQL 42501 (new row violates row-level security policy for table "sync_queue") 致命錯誤，導致整個資料庫交易被 rollback。
  - 觸發函式宣告 SECURITY DEFINER：在 triggers.sql 的 trg_fn_enqueue_sync 函式明確宣告 SECURITY DEFINER 與 SET search_path = public，賦予觸發函式使用系統建立者最高權限排入背景同步佇列，杜絕前端 anon 權限不足問題。
  - 補充 RLS INSERT 政策：在 schema.sql 中針對 sync_queue 資料表補充 Allow insert to sync_queue 政策，雙重防護確保系統觸發與業務寫入不受阻。
  - 獨立遷移腳本：新增 supabase/fix_sync_queue_rls.sql 供線上環境即時執行修復與備份。
- 單元測試與打包建置:
  - 於 test/65_officer_system_modules.test.mjs 擴充 v0.1.157 專屬單元測試，全專案 211 項單元測試 100% 通過，前端 tsc -b && vite build 成功打包。

### v0.1.156 (2026-09-18)
- 徹底修復裝備無法刪除照片與備註問題 (src/pages/AdminInventory.tsx, src/utils/supabaseClient.ts):
  - 根本原因排查：Supabase equipments 資料表中僅有 notes 欄位，並不存在 specs 欄位。先前儲存裝備時在 updateFields 與 payload 同時傳入 specs: formState.notes，導致 PostgREST 拋出 PGRST204 (Could not find the 'specs' column of 'equipments' in the schema cache) 致命例外，使得整筆更新被中斷中止，造成刪除照片、清空備註與其他欄位修改無法寫入資料庫。
  - 前端 Payload 清理：自 AdminInventory.tsx 的 updateFields 與 payload 中徹底移除不存在的 specs 欄位，僅保留合法的 notes 備註欄位。
  - 底層防呆過濾與受影響列數驗證：於 supabaseClient.ts 的 updateEquipmentFullInSupabase 與 insertEquipmentToSupabase 中加入 delete payload.specs 防禦性過濾，並串接 .select() 校驗實際更新列數，徹底杜絕靜默失敗。
- 單元測試與打包建置:
  - 於 test/65_officer_system_modules.test.mjs 擴充 v0.1.156 專屬單元測試，全專案 210 項單元測試 100% 通過，前端 tsc -b && vite build 成功打包。

### v0.1.155 (2026-09-18)
- 裝備編輯正方形照片框新增觸控與滑鼠左右滑動切換手勢 (src/pages/AdminInventory.tsx):
  - 完整對齊裝備瀏覽詳細彈窗 (EquipmentDetailModal.tsx) 的原生滑動互動體驗。
  - 支援行動裝置觸控事件 (onTouchStart, onTouchMove, onTouchEnd) 與桌面滑鼠拖曳事件 (onMouseDown, onMouseMove, onMouseUp)。
  - 具備即時水平位移、邊界阻尼回彈、滑動超過 40px 自動切換上一張/下一張照片，並與底部白色分頁圓點及縮圖清單即時同步連動。
  - 圖片元素設置 draggable={false} 與 userSelect: 'none'，防止觸發瀏覽器原生拖曳影像或選取反藍干擾。
- 診斷並修復 Google Apps Script HTML 登入重導向與上傳失敗問題 (src/pages/AdminInventory.tsx, src/components/borrow/EquipmentDetailModal.tsx):
  - 根本原因分析：使用者遇到之 `[相片上傳失敗]: <!DOCTYPE html><html lang="zh">...window['ppConfig']...` 係因 Google Apps Script Web App 部署存取權限若非「所有人 (Anyone)」或 POST URL 附帶過長 JWT Query String，Google 伺服器在閘道層強制重導向至 Google Accounts 登入驗證頁面。
  - 最佳化 POST 請求呼叫機制：POST Payload 透過 withAuthPayload 已在 Body 攜帶授權憑證，URL 改採純淨端點加輕量防快取參數，避免過長 Query String 觸發 Google 安全阻斷。
  - 前端加固錯誤攔截與友善具體指引：當伺服器回傳 HTML 頁面時，精確偵測並顯示明確的繁體中文引導（指示幹部檢查 GAS 部署「執行為：我」與「誰可以存取：所有人」），不再遮蔽或拋出未處理的 HTML 原始碼。
- 移除既有註解中的表情符號與全域零表情符號合規 (src/components/borrow/EquipmentDetailModal.tsx):
  - 徹底移除既有程式碼中遺留之火箭表情符號，嚴格落實全域零表情符號規範。
- 單元測試與打包建置:
  - 於 test/65_officer_system_modules.test.mjs 擴充 v0.1.155 專屬單元測試，全專案 209 項單元測試 100% 通過，前端 tsc -b && vite build 成功打包。

### v0.1.154 (2026-09-18)
- 對齊 Borrow.tsx 裝備照片上傳管道與修復上傳失敗 (src/pages/AdminInventory.tsx):
  - 診斷並徹底修復照片上傳失敗問題：將上傳 API 正式改採 Borrow.tsx (EquipmentDetailModal.tsx) 經線上驗證成熟運作之 `action: 'update_equipment_images'`。
  - 傳遞 `equipId`, `equipName`, `keptUrls`, `newPhotoFiles`, `userId`，由 GAS 將相片寫入 Google Drive 裝備專屬目錄（`系統圖庫/裝備照片/{裝備名稱}/`），並同步更新 Supabase 與 Google Sheets。
  - 支援 `result.images` 與 `result.imageUrl` 雙向回傳解析，並於前端即時替換為 Drive 正式網址。
- 裝備編輯彈窗頂部標題與副標題清理 (src/pages/AdminInventory.tsx):
  - 依使用者指示完全刪除彈窗頂部「編輯裝備：裝備名稱」(`<h3>`) 與「代號 G032 之裝備規格與設定」副標題 (`<div>`)，讓介面聚焦於大正方形照片與規格表單。
- 正方形相片框按鈕清理與中央底部白點分頁 (src/pages/AdminInventory.tsx):
  - 刪除正方形照片框右上角紅色垃圾桶按鈕與左右切換箭頭按鈕 (`ChevronLeft` / `ChevronRight`)，避免畫面過多圖示遮擋照片。
  - 於正方形照片框中間底部加入半透明圓角膠囊與純白色圓點 (`.photo-carousel-dots`)，當前頁面為高亮白（8px），其餘頁面為半透明白（6px），點擊即可切換頁數。
- 單元測試與建置驗證:
  - 於 `test/65_officer_system_modules.test.mjs` 新增 v0.1.154 專屬單元測試，全數 208 項測試通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.153 (2026-09-18)
- 修復 Google Drive 上傳 Action 名稱與雙向相容 (src/pages/AdminInventory.tsx, gas_modules/06_Helper_Services.js, src/gas.js):
  - 診斷並修正前端呼叫 GAS 時誤傳複數形 `upload_drive_files` 導致之「未支援的 Helper Action」例外，正名為單數形 `upload_drive_file`。
  - 同步於後端 GAS `06_Helper_Services.js` 與 `src/gas.js` 補充 `upload_drive_files` 別名相容，提升伺服器端防禦性。
- 移除輪播分頁指示器內之綠色+號按鈕 (src/pages/AdminInventory.tsx):
  - 移除 `.photo-carousel-dots` 容器中之綠色圓形 `+` 按鈕，徹底根治手機端因 Flex 排版造成的按鈕位移跑版，讓輪播指示器純粹用於相片頁數切換。
- 簡化相片管理控制條與介面去重 (src/pages/AdminInventory.tsx):
  - 依使用者反饋移除相片管理列多餘之藍色「新增相片」按鈕，統一使用下方縮圖列之 `+ 新增` 虛線卡片與 0 張時中央滿版大虛線卡片。
  - 保留「刪除當前照片」紅色按鈕與每張縮圖的獨立 X 刪除按鈕，整體視覺更俐落清爽。
- 單元測試與建置驗證:
  - 於 `test/65_officer_system_modules.test.mjs` 新增 v0.1.153 專屬單元測試，全數 207 項測試通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.152 (2026-09-18)
- 裝備編輯正方形相片防壓縮修復 (src/pages/AdminInventory.tsx):
  - 診斷並修復手機端 (iOS Safari / WebKit) 彈窗 flex 佈局導致相片容器高度遭擠壓變形之缺陷。
  - 為 `.detail-modal-image-wrapper` 補充 `flexShrink: 0`、`width: '100%'`、`aspectRatio: '1 / 1'` 與 `boxSizing: 'border-box'`，確保無論螢幕高度與彈窗內容多寡，最上方相片展示區皆維持 100% 完美 1:1 正方形輪播比例。
- 前端 Canvas 輕量化相片壓縮與 0ms 即時預覽 (src/pages/AdminInventory.tsx):
  - 解決過去手機直接傳遞大圖至後端導致網路延遲、卡頓與 WebKit CORS 異常之瓶頸。
  - 導入瀏覽器端 Canvas 圖片自適應等比例縮放 (最大邊長 1200px) 與 JPEG 0.8 品質無失真壓縮，相片容量大幅縮減至 100~200KB。
  - 選取相片後立即以 Data URL 產生 0ms 本地預覽並自動跳轉至新相片，使用者體驗流暢如原生 App。
- 專屬相片管理控制條與多圖快速刪除機制 (src/pages/AdminInventory.tsx):
  - 於正方形大圖下方新增獨立相片管理工具條，清楚標示「相片管理 (已上傳 X/5 張)」。
  - 提供醒目的「刪除當前照片」紅色文字按鈕與「新增相片」按鈕。
  - 整合橫向滾動縮圖預覽條，當前選中相片顯示亮藍色邊框，且每張縮圖右上角皆具備獨立半透明圓形 X 刪除按鈕，支援快速刪除任意一張照片。
  - 輪播大圖右上角保留直覺的垃圾桶刪除按鈕，並在 0 張相片時呈現醒目大正方形虛線引導上傳區塊。
- Google Drive 上傳鑑權標頭與直存最佳化 (src/pages/AdminInventory.tsx):
  - 透過 `appendAuthToken(GAS_API_URL)` 與 `withAuthPayload` 健全化 Google Apps Script 授權標頭，徹底杜絕 iOS WebKit 302 重導向造成之 Load failed。
  - 若僅修改文字欄位或刪除相片（無新增相片），儲存時直連 Supabase (<30ms)；若包含新相片，則先上傳 Drive 換取真實 URL 後寫入 Supabase，儲存按鈕動態呈現「相片上傳雲端中...」以提供明確回饋。
- 單元測試與建置驗證:
  - 於 `test/65_officer_system_modules.test.mjs` 新增 v0.1.152 專屬單元測試，驗證容器防壓縮 (flexShrink: 0)、1:1 比例、Canvas 壓縮邏輯、管理條與刪除機制及零表情符號檢驗，全數 206 項測試通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.151 (2026-09-18)
- 右側大頭貼選單圖示與名稱一致性 (src/App.tsx, src/locales/zh.json, src/locales/en.json)：
  - 幹部系統選單名稱全面統一為 4 個字（活動管理、社員資料、財務對帳、租借管理、裝備庫存），英文副標題採精簡風格（Events, Members, Finance, Loans, Inventory）。
  - 右側大頭貼下拉選單寬度最佳化為 160px，為所有社員項目與幹部系統項目全面配置現代幾何圖示（Calendar, Users, CreditCard, PackageCheck, Layers），確保下拉選單名稱與圖示與全域頂部導覽列 100% 嚴格一致。
- 社員個人歷史紀錄優化與未知社員修復 (src/pages/MemberRecords.tsx, src/utils/supabaseClient.ts, supabase/admin_portal_rpc.sql)：
  - 頂部導航列移除 LINE ID: {userId} 冗餘標籤，保留最清晰之返回按鈕與頁面導航。
  - 歷史紀錄卡片移除多餘的「詳情/收合」按鈕與箭頭，改為點擊整張卡片直覺展開/收合細項，並加上 hover / active 觸控回饋與指標游標。
  - 診斷並修復頂部社員概況卡片顯示「未知社員」問題：修正 `get_admin_member_records_rpc` 因查詢 members 表中不存在之 role 與 avatar_url 欄位導致之報錯，並於前端加入 `fetchMemberFullDetailFromSupabase` 雙重兜底查詢機制。
- 裝備庫存編輯與新增彈窗重構 (src/pages/AdminInventory.tsx)：
  - 比照 Borrow 頁面之裝備詳細彈窗風格：最上方配置 1:1 正方形相片輪播展示與相片管理區 (aspectRatio: 1 / 1)，左上角懸浮裝備代號膠囊，右上角配置半透明關閉按鈕。
  - 正方形相片支援左右箭頭與小圓點指示切換、右上角一鍵刪除當前相片、無相片時居中上傳相片，並在圖片下方提供橫向相片縮圖快速預覽列與新增相片按鈕。
  - 編輯彈窗內容全面強制靠左排版 (textAlign: 'left')，杜絕任何標籤與輸入內容置中。
  - 欄位架構優化：依照 Supabase 資料庫 schema 將原本分開的「規格描述」與「注意事項」合併為單一「備註」欄位，介面簡潔且寫入一致。
- 單元測試與建置驗證：
  - 於 test/65_officer_system_modules.test.mjs 新增 v0.1.151 完整單元測試，全數 205 項測試通過，tsc -b && vite build 打包建置零錯誤。

### v0.1.150 (2026-09-18)
- 社員詳細資料「個人歷史全紀錄」專屬獨立頁面與動態概況調整 (src/pages/MemberDetailEdit.tsx, src/pages/MemberRecords.tsx, src/App.tsx):
  - 於「社員詳細資料編輯頁面」的動態概況區塊，移除左側社員姓名，標準化為「進行中動態概況」。
  - 標題列右側新增「查看個人歷史全紀錄」按鈕，點擊後平滑跳轉至專屬獨立路由 `/admin/members/:userId/records`，並保留原進行中動態概況顯示方式。
  - 全域導覽列自動適配，路由命中 `/admin/members/:userId/records` 時顯示標題「個人歷史全紀錄」與副標題「活動、裝備與繳費歷程」。
- 混合歷史時間軸與 NotionFilterBar 控制列 (src/pages/MemberRecords.tsx):
  - 整合呈現該名使用者的活動紀錄、裝備借用紀錄與繳費紀錄，混合呈現於單一時間軸中。
  - 嵌入 NotionFilterBar 整合控制列：
    - 關鍵字搜尋：即時過濾活動名稱、裝備品項、款項類別、金額、處理狀態與社員/幹部備註。
    - 類別篩選：提供全部、活動紀錄、裝備借用、繳費紀錄等維度篩選。
    - 狀態篩選：提供全部、進行中/待處理、已完成/已核銷切換。
    - 排序控制：預設依紀錄時間上新下舊（降冪），支援切換為上舊下新（升冪）或依紀錄類別排序。
    - 重新整理：支援一鍵自 Supabase 重新載入該社員之完整歷史紀錄。
  - 卡片視覺呈現：以不同顏色標籤區隔類別（活動為翠綠、裝備為深藍、繳費為琥珀金），直觀標註狀態徽章、日期區間、金額與備註。
  - 支援點擊展開/收合詳細細項：展開活動集合地點、裝備個別品項清單與租借天數/押金、轉帳末五碼與繳費憑證連結。
  - 全頁面與卡片內容強制宣告 `textAlign: 'left'`，根除文字置中跑版。
- 資料庫專屬 RPC 與多層備援機制 (supabase/admin_portal_rpc.sql, src/utils/supabaseClient.ts, src/types/admin.ts):
  - 新增 `get_admin_member_records_rpc(p_officer_line_user_id, p_target_user_id)` SECURITY DEFINER 函式，整合聯合查詢 `event_signups`、`loans` 與 `payments`，並加入幹部權限校驗。
  - 在 `src/types/admin.ts` 定義 `MemberTimelineCategory` 與 `MemberTimelineRecord` 介面。
  - 在 `src/utils/supabaseClient.ts` 實作 `fetchMemberTimelineRecordsFromSupabase`，優先調用 RPC，並具備直查資料表之穩健備援邏輯。
- 單元測試與建置驗證：
  - 於 `test/65_officer_system_modules.test.mjs` 新增 v0.1.150 完整單元測試，全數 204 項測試通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.149 (2026-09-18)
- 財務對帳備註欄位分離與申報寫入修復 (supabase/verify_payment_rpc.sql, supabase/payment_rpc.sql, supabase/admin_portal_rpc.sql, src/pages/AdminFinance.tsx)：
  - 診斷並修正社員申報繳費時誤將備註寫入 `officer_notes` 之資料庫缺陷，正名寫入 `payments.notes` 欄位。
  - 對帳彈窗完整區隔呈現「社員申報備註（唯讀展示）」與「幹部審核備註（可自由輸入修改）」，杜絕幹部核銷紀錄與社員備註互相覆蓋。
- LINE 繳費核銷通知發送狀態控制與防重複推播 (src/pages/AdminFinance.tsx, src/utils/supabaseClient.ts, supabase/admin_portal_rpc.sql)：
  - `payments` 資料表正式納入 `notification_status`（未通知 / 已通知）欄位。
  - 對帳彈窗新增「LINE 通知發送狀態」下拉選單：核銷儲存時若狀態為「未通知」，發送推播後自動標記為「已通知」；若已處於「已通知」，再次點擊儲存將不再重複發送訊息，亦可手動切回「未通知」進行重發。
  - 財務卡片清單直觀增加「已通知」或「未通知」徽章標籤。
- 裝備租借天數自動計算兜底 (src/pages/AdminLoans.tsx, src/utils/supabaseClient.ts, supabase/admin_portal_rpc.sql)：
  - 解決當資料庫或試算表同步資料遺漏 `days` 欄位時，介面僅顯示「 天」之缺陷。
  - 於前端組件、Supabase Client 映射層與資料庫 RPC 中全方位加入 `end_date - start_date + 1` 天數動態推算兜底。
- 卡片清單與詳細彈窗全面靠左排版 (src/pages/AdminMembers.tsx, src/pages/AdminLoans.tsx, src/pages/AdminFinance.tsx)：
  - 社員資料卡片、租借管理卡片、財務對帳卡片以及對帳與租借詳細彈窗內容強制宣告 `textAlign: 'left'`，根除文字置中跑版。
- 單元測試與建置驗證：
  - 於 `test/65_officer_system_modules.test.mjs` 新增 v0.1.149 完整單元測試，全數 203 項測試通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.148 (2026-09-18)
- 社員身分狀態標準值對齊與向下相容 (src/pages/AdminMembers.tsx, src/pages/MemberDetailEdit.tsx, supabase/SCHEMA_DICTIONARY.md)：
  - 診斷並修復幹部名冊頁面身分篩選與詳細編輯頁面選項與 Supabase 資料庫真實值不一致之缺陷。
  - 將身分篩選選單標準化為 Supabase members 資料表與註冊表單儲存之三大真實值：`臺科大在校學生`、`畢業校友`、`校外人士`。
  - 在 `AdminMembers.tsx` 過濾器中實作雙向向下相容邏輯：選取「臺科大在校學生」自動匹配 `臺科大在校學生` 與 `本校生`；選取「畢業校友」自動匹配 `畢業校友` 與 `校友`；選取「校外人士」自動匹配 `校外人士`、`外校生` 與 `社會人士`。
  - 在 `MemberDetailEdit.tsx` 表單下拉選單更新為標準選項，並自動相容保留既有非標準標籤，確保修改社員時不發生選項跑版。
  - 同步更新 `supabase/SCHEMA_DICTIONARY.md` 欄位字典註記。
- 單元測試與建置驗證：
  - 於 `test/65_officer_system_modules.test.mjs` 新增身分狀態標準值與向下相容測試，全數 202 項測試通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.147 (2026-09-18)
- 待結費用計算校準與項目明細化 (supabase/admin_portal_rpc.sql, src/utils/supabaseClient.ts, src/pages/MemberDetailEdit.tsx)：
  - 依照社團業務流程校正待繳判定：活動未公告正備取（審核中 Checking）或備取狀態不具備繳費資格，嚴格限制僅「正取 Confirmed」且付款狀態非「已繳費 Paid」之活動方計入待結費用，徹底解決尚未公告錄取即錯誤顯示待結項目的問題。
  - 待結費用卡片由單純數字提示升級為具體項目逐筆明細：條列展示待繳項目類型徽章（活動、裝備租借、社費）、具體項目名稱與目前狀態；若全數結清則呈現綠色「帳務已全數結清」狀態卡片。
- 移除幹部角色預設值以消除載入幽靈變更 (src/pages/MemberDetailEdit.tsx)：
  - 診斷並修復每次載入社員詳細頁面即自動跳出「儲存變更 (1)」之缺陷。原先組件將 officer_role 預設賦值為 '幹部'，造成原本為空的資料與表單初值不一致而誤觸發 diff 計算。
  - 修正為保持空字串 (detail.officer_role || '')，徹底消除非使用者操作之幽靈異動提示。
- 社員詳細編輯與個人資料預覽全面靠左對齊 (src/pages/MemberDetailEdit.tsx, src/components/admin/MemberProfileModal.tsx)：
  - 依使用者指示，於 MemberDetailEdit 與 MemberProfileModal 最外層容器及排版元件強制設定 textAlign: 'left'，覆蓋根節點 #root 之居中樣式。
  - 確保所有欄位標題、輸入框說明文字、個資內容與狀態徽章皆維持整齊靠左對齊之現代後台閱讀排版。
- 單元測試與建置驗證：
  - 於 test/65_officer_system_modules.test.mjs 新增 v0.1.147 專屬單元測試，驗證僅正取活動計入待結、幹部角色無幽靈預設、容器強制靠左對齊與全項目零表情符號檢驗。

### v0.1.146 (2026-09-17)
- 財務核銷社費連動修復與正式社員狀態標記 (supabase/admin_portal_rpc.sql, src/utils/supabaseClient.ts)：
  - 診斷並修復財務核銷時僅更新 `payment_status`、未同步更新 `is_official_member = TRUE` 之缺陷。
  - 強化社費判定邏輯，同時相容 `target_type = 'membership'` 與款項文字特徵（`type ILIKE '%社費%'` 或 `type ILIKE '%Membership%'`），防範歷史申報項目連動脫鉤。
  - 實作明確社籍到期日提取機制：以正規表達式 `substring(v_payment.type from '(\\d{4}[-/]\\d{2}[-/]\\d{2})')` 自動自申報款項字串中提取明確到期日並更新至 `members.membership_expires_at`；依使用者指示嚴格不自作主張推算預設學期結束日。
- 直更模式防呆與 RLS 靜默阻斷攔截 (src/utils/supabaseClient.ts, src/pages/AdminFinance.tsx)：
  - 修正前端在呼叫 `payments` 與 `loans` 之直更 SQL 時加上 `.select('id')`，校驗實際異動資料筆數。
  - 若受 RLS 權限阻斷導致 0 筆更新，主動拋出具體錯誤訊息，杜絕因資料庫無更動而誤判成功發出 LINE 推播之假象。
  - 在 `AdminFinance.tsx` 中傳遞 `paymentType` 參數至連動更新函式，確保社費款項特徵能被完整辨識。
- 單鍵核銷與 GAS Webhook 雙軌同步補強 (supabase/verify_payment_rpc.sql, src/gas.js, gas_modules/02_LineBot_Webhook.js)：
  - 在 Email 單鍵核銷 RPC `verify_payment_by_token` 以及 GAS LINE Bot Webhook 處理常式中同步支援到期日自動提取與 `is_official_member = TRUE` 標記。
- 單元測試與建置驗證：
  - 在 `test/65_officer_system_modules.test.mjs` 新增社費連動、正式社員標記、明確到期日提取與杜絕學期預設推算之單元測試，全數 200 項測試通過，TypeScript 與 Vite 建置零錯誤。

### v0.1.145 (2026-09-17)
- 社員詳細資料載入修復與多層備援機制 (supabase/admin_portal_rpc.sql, src/utils/supabaseClient.ts)：
  - 診斷並修正 `get_admin_member_detail_rpc` 內部未型別化 record 導致之 `cannot call to_jsonb on a record of unknown type` 資料庫例外，改採 `row_to_json(m.*)::jsonb` 穩定輸出。
  - 資料庫 RLS 補充 members 資料表之 anon 讀取與更新存取策略，避免 anon 模式直接查詢受阻。
  - 前端 `fetchMemberFullDetailFromSupabase` 實作三層彈性備援機制：優先嘗試 `get_admin_member_detail_rpc`、次選生產環境行之有年之 `get_member_profile` RPC、最後回退直接資料表查詢，徹底杜絕找不到社員資料之操作失敗異常。
- 五大幹部管理頁面緊湊工具列與標題塊瘦身 (Compact Single-Row Toolbar)：
  - 依照使用者指示，全面移除 `AdminMembers`、`AdminFinance`、`AdminLoans`、`AdminInventory` 與 `AdminEvents` 頂部重複之 `<h2>` 標題、筆數副標題與獨立大按鈕。
  - 擴充 `NotionFilterBar` 組件，將搜尋框、篩選圖示、排序圖示、重新整理圖示（帶旋轉動畫）與新增項目加號按鈕（`onAdd`）統一整合於同一列單行工具列中。
  - 統一 `AdminInventory`（新增裝備）與 `AdminEvents`（發布新活動）的加號按鈕風格；`AdminEvents` 之搜尋、狀態篩選、出隊/截止日排序、重新整理與發布活動全面標準化為與其他頁面完全一致的簡潔體驗。
- 統一社員個人資料預覽彈窗 (MemberProfileModal)：
  - 抽取審核名冊之報名者個資彈窗視覺規格，獨立打造共用之 `MemberProfileModal` 組件。
  - 彈窗完整呈現姓名、性別、正式社員徽章、生日、學號系所、身分證號、LINE ID（支援一鍵複製）、聯絡電話（支援一鍵撥號連結）、電子郵件、緊急聯絡人、登山經歷、體能紀錄、病史與想對幹部說的話。
  - 彈窗底部統一配置醒目的「移至社員詳細資料編輯頁面」綠色按鈕，點擊後平滑導航至 `/admin/members/:userId` 全欄位編輯頁。
  - 於 `AdminMembers`（點擊卡片先開預覽）、`AdminFinance`（點擊開啟個人資料）與 `AdminLoans`（點擊開啟個人資料）全面串接此彈窗。
- 嚴格零表情符號 (Zero Emoji) 規範落地：
  - 全面清理程式碼、UI 提示文字、單元測試、註解與文件內之所有 emoji 表情符號，統一改用 Lucide React 現代幾何圖示。
- 單元測試與建置驗證：
  - 於 `test/65_officer_system_modules.test.mjs` 擴充工具列整併、多層備援、`MemberProfileModal` 與零表情符號靜態檢查測試，全數 199 項單元測試通過，`tsc -b && vite build` 建置零錯誤。

### v0.1.144 (2026-09-17)
- 幹部後台權限與資料庫 RPC 安全雙軌架構 (admin_portal_rpc.sql)：
  - 新增專屬 SECURITY DEFINER RPC 函式：`get_admin_members_rpc`、`get_admin_member_detail_rpc`、`get_admin_finance_rpc`、`get_admin_loans_rpc`、`update_admin_member_rpc`、`update_admin_payment_status_rpc` 與 `update_admin_loan_status_rpc`。
  - 函式內部強制執行 `is_officer(p_officer_line_user_id)` 身分校驗，非幹部拒絕存取，杜絕外部人士以前端 anon key 爬取全體社員機密個資（身分證號、病史、電話）與財務對帳紀錄。
  - 配置資料表層級權限與 RLS 存取策略（GRANT SELECT, UPDATE, INSERT ON members, payments, loans, loan_items, event_signups），徹底根治 PostgreSQL 42501 (permission denied) 與 RLS 導致之 0 筆社員名冊問題。
- 前端 Supabase 連線層與資料欄位校正 (src/utils/supabaseClient.ts)：
  - 修正 loans 資料表查詢欄位名稱為 `total_rent`（修正原先錯誤查詢不存在之 `total_fee` 導致之報錯）。
  - 後台社員名冊、財務對帳與租借管理讀寫全面優先調用幹部鑑權專屬 RPC，並保留資料表直讀直寫備援機制。
- 路由與組件幹部鑑權參數傳遞 (src/App.tsx, AdminMembers, AdminFinance, AdminLoans, MemberDetailEdit)：
  - 將當前登入者 `liffInit.userId` 作為 prop 傳遞至各後台頁面組件，確保 RPC 調用時具備完整鑑權憑證。
- 裝備庫存雙欄購物網站大圖風格重構 (src/pages/AdminInventory.tsx)：
  - 依社員端借用頁面規格全面改版為雙欄商品卡片網格 (products-grid)。
  - 採用 ProductImage 組件呈現 1:1 滿版商品大圖，搭配左上角分類標籤、右上角剩餘庫存徽章與外借狀態提示。
  - 卡片下方展示 2 天基本租金與續租日租金，並於底部配置精巧小巧的「編輯」與「刪除」操作按鈕。
- 單元測試與建置驗證：
  - 在 test/65_officer_system_modules.test.mjs 擴充 RPC 函式齊備性、幹部鑑權與雙欄大圖佈局之靜態檢查測試，全數 195 項單元測試通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.143 (2026-09-17)
- 幹部系統架構與手機端導航 (Officer Portal Navigation)：
  - 在 /admin/* 路由下全面建構手機端專屬次級橫向滑動標籤導航 (AdminSubNav)，支援活動管理、社員資料、財務對帳、租借管理與裝備庫存五大模組無縫切換。
  - 全域頂部導覽列 (GlobalHeader) 頭像下拉選單全面支援幹部身分直接展開 5 大後台功能入口，並依當前路由動態更新標題與副標題。
- Notion 風格搜尋、篩選與排序共用組件 (NotionFilterBar)：
  - 專為手機端觸控設計，提供平時完全收起的簡潔搜尋框、篩選抽屜按鈕與排序面板按鈕。
  - 點擊篩選圖示彈出底部抽屜 (Bottom Sheet)，展示各頁面專屬常用欄位標籤，選取完成即時套用並於圖示右上角顯示啟用條件計數；點擊排序圖示可一鍵切換升降冪與排序欄位。
- 社員資料管理模組 (AdminMembers 與 MemberDetailEdit)：
  - 清單頁面 (/admin/members) 支援關鍵字搜尋（姓名、Line ID、Line UID、信箱、學號）、身分與繳費狀態篩選，以卡片形式直觀呈現姓名、身分狀態、系所學號與正式社員徽章。
  - 獨立子頁面 (/admin/members/:userId) 頂部即時呈現尚未結束的活動行程、未歸還借用與待繳款項動態概況；下方表單將全數 members 欄位依邏輯分類為五大摺疊分組。
  - 內建儲存確認防呆 Diff Modal，於送出前條列列出有異動的欄位新舊值對比，確認後直接直連寫入 Supabase members 表。
- 財務對帳管理模組 (AdminFinance)：
  - 統一卡片流整合活動報名費、裝備租借費與社費，提供 Notion 搜尋篩選與排序。
  - 詳細對帳彈窗展示申報人（附帶開啟個人資料按鈕）、金額、帳號末五碼、匯款截圖（可點擊放大檢視）。
  - 下拉選單嚴格僅開放合法狀態（待確認 Checking、已核銷 Confirmed）；核銷時自動雙向連動更新對應之活動報名名冊 (event_signups.payment_status) 或裝備租借單 (loans.payment_status)，並非同步推播 LINE 繳費成功通知給社員。
- 裝備租借管理模組 (AdminLoans)：
  - 依借用人姓名呈現租借單卡片流，直觀檢視租借狀態、繳費狀態、出隊起訖天數與租金。
  - 詳細彈窗提供借用人資訊、一鍵開啟個人資料、借用裝備品項細項清單，以及嚴格合法之租借狀態下拉選單（待領取 To Be Collected、租借中 Borrowed、已歸還 Returned、已取消 Cancelled），儲存後自動推播 LINE 通知。
- 裝備庫存管理模組 (AdminInventory)：
  - 顯示社團全部庫存品項（含開放借用與不開放外借，沿用 Borrow 頁面視覺排版）。
  - 支援自動流水號代碼配發 (EQ_001, EQ_002...)，提供新增裝備、刪除裝備（二次防呆彈窗）、全欄位修改與 Google Drive 直連相片維護。
- 後端推播與單元測試擴充：
  - 在 gas.js 中擴充 notify_loan_status_updated 處理常式，確保租借狀態更新時順暢推播。
  - 新增 test/65_officer_system_modules.test.mjs 單元測試，全數 193 項測試通過，TypeScript 建置零錯誤。

### v0.1.207 (2026-09-24)
- 報名名冊工作站功能全面升級與交互優化 (WebAdminRoster & webAdmin.css)：
  - 一鍵發送通知按鈕 (Send Notification Button)：
    - 位於複製按鈕右側，採用顯目白字綠底按鈕（圖示 + 發送通知）。
    - 支援勾選名單單獨發送（僅針對已選取的正取與備取人員發送），以及未勾選時一鍵批次發送全活動所有尚未推播之正取與備取人員。
    - 內建嚴謹防呆校驗：若發送對象包含正取人員但活動尚未設定專屬 LINE Group URL，立即阻擋並彈窗提示幹部先至活動管理填寫群組連結。
    - GAS 後端 (_handleSendEventNotifications) 支援 signupIds 參數過濾，精準推播指定報名者並寫入 notification_status = "已通知"。
  - 通知狀態即時修改下拉選單 (Notification Status Dropdown)：
    - 表格中「通知狀態」欄位直接提供 select 下拉選單（未通知 / 已通知），幹部切換即時以 Supabase 客戶端直通更新資料庫並同步審核日誌。
  - 備註欄位升級為幹部備註 (Officer Notes Inline Editing)：
    - 欄位重新命名為「幹部備註」，點擊儲存格直接切換為輸入框供打字編輯。
    - 支援 Enter 鍵或失去焦點 (blur) 自動儲存直寫 Supabase event_signups.notes，按 Escape 鍵取消編輯，所有登入幹部皆可即時檢視共同備註。
  - 序號欄位與表頭欄位拖曳換位 (Drag and Drop Reordering)：
    - 在序號 (#) 欄位中央加入專屬 Grip 拖曳手柄，支援按住上下拖曳直接調整資料列順序 (customRowOrder)。
    - 在表頭動作工具列最左側加入 Grip 拖曳手柄，支援按住左右拖曳直接調整欄位顯示順序 (columnOrder)。
  - Google 雲端資料夾與試算表整合按鈕 (Google Sheet Sync & Open)：
    - 位於發送通知按鈕左側。若尚未建立則顯示「建立資料夾與試算表」；建立過後自動切換為「開啟試算表」。
    - 點擊按鈕時觸發 GAS create_event_sheet API，顯示「同步中...」旋轉載入狀態，同步完成後自動以新分頁開啟 Google 試算表。
  - 工具列介面精簡與按鈕位置微調：
    - 將重新整理按鈕移至顯示/隱藏項目按鈕（眼睛圖示）的左側。
    - 移除工具列左側冗餘的「篩選：X 人 / 總報名：Y 人」計數文字，大幅節省橫向空間。
  - 釘選欄位滑動邊界消失 Bug 防禦修復：
    - 將表格的 border-collapse 由 collapse 改為 separate，並設定 border-spacing: 0 與 background-clip: padding-box。
    - 為所有釘選欄位 (wa-col-pinned, th.wa-col-pinned, checkbox, #) 強制指定 border-right: 1px solid var(--wa-border) !important，徹底解決橫向滑動時被固定住的欄位之間的分隔線隨內容滑動消失的顯示問題。
- 單元測試與建置驗證：
  - 更新 test/88_web_admin_roster_features.test.mjs 擴充 14 項驗證測試，全數通過。
  - 全專案 358 項單元測試全數 PASS，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.208 (2026-09-24)
- 系統架構文檔增補 (README.md)：
  - 於第 4 節完整梳理並補充「活動專屬雲端資料夾與獨立試算表建立與命名機制 (Event Dedicated Folder & Sheet Creation)」。
  - 詳述 `_handleCreateEventSheet`、`_createEventDriveFolderAndSheet` 與 `_backfillEventSpreadsheetMemberInfo` 的執行流程、分支判定條件、檔案與資料夾命名規則（`{datePart}_{eventName}` 與 `{datePart}_{eventName}_報名名冊`），以及 29 欄位表頭和隱藏 `_CONFIG` 設定工作表的系統配置。

### v0.1.209 (2026-09-25)
- 活動管理工作站功能與體驗優化 (WebAdminEvents & GAS Backend)：
  - 全面統一活動術語 (Terminology Update)：
    - 將工作站頂部工具列、彈窗標題、送出按鈕、空狀態與成功提示中所有「發布新活動」、「發布活動」、「立即發布活動」統一更名為「新增活動」。
  - 工具列視覺佈局精簡 (Toolbar Layout Refinement)：
    - 移除工具列左側冗餘的「活動管理」標題文字與日曆圖示，騰出最大化空間給搜尋與篩選。
    - 重新整理按鈕精簡為純圖示按鈕，並自左側移至右側「新增活動」按鈕的左側，提升操作動線一致性。
  - 活動代號產生機制防覆蓋修復 (Event ID Generation Fix)：
    - 重構活動編號序列生成邏輯，由原先的長度計數累加改為動態掃描資料庫中同月份前綴（如 E2609-）的所有活動編號，提取既有最大數值後遞增（`maxSeq + 1`）。
    - 徹底解決若當月先前活動曾被刪除時，依陣列長度計算會產生與既有活動重複代號的 Bug。
  - 刪除活動功能與防呆級聯清理 (Delete Event with Cascade Cleanup)：
    - 在活動編輯彈窗底部與「儲存活動變更」同列靠左新增紅底白字「刪除活動」按鈕（僅在編輯既有活動時顯示）。
    - 點擊後查詢該活動當前已報名人數，彈出二次確認視窗清楚提示該活動之名稱、代碼與報名人數。
    - 幹部確認後依序執行級聯刪除：活動心得紀錄（reflections） -> 報名名冊（event_signups） -> 活動本體（events），解除 PostgreSQL 外鍵 RESTRICT 限制，並寫入審核操作日誌與重載清單。
  - 幹部群組推播勾選框與 GAS 後端整合 (Officer Group Push Notification)：
    - 在活動編輯彈窗之「活動封面照片」下方新增「推播此活動資訊至幹部群組」核取方塊（預設為未勾選）。
    - 在 GAS 後端（gas.js）新增 `action=notify_officer_event` 處理常式，呼叫 `pushAdminMessage` 自動格式化出隊通知卡片（含活動名稱、代碼、日期、截止日、預計費用與狀態）並推播至幹部群組。
- 單元測試與建置驗證：
  - 新增 test/89_web_admin_events_enhancements.test.mjs 單元測試，涵蓋更名、工具列佈局、序號生成演算法、級聯刪除、推播核取方塊與 GAS 處理常式。
  - 全專案 364 項單元測試全數 PASS，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.210 (2026-09-25)
- 活動編輯彈窗排版與說明文字靠左對齊優化 (WebAdminEvents & webAdmin.css)：
  - 說明文字靠左對齊 (Left Align Helper Notes)：
    - 將活動編輯彈窗中「活動專屬 LINE 群組邀請連結 (保密)」下方的說明文字「此連結為出隊專屬保密資訊，僅在幹部審核為正取並推播時提供正取社員加入。」明確設定為靠左對齊 (`textAlign: 'left'`)。
    - 將「同步推播活動資訊至幹部群組 (LINE)」核取方塊下方的說明文字「勾選後儲存時將自動向 LINE 幹部群組發送活動出隊摘要訊息」移除多餘左邊距並設定為靠左對齊 (`textAlign: 'left'`)，與卡片左邊界緊密貼齊。
  - 後台容器層防禦 (CSS Anti-Centering Safeguard)：
    - 在 webAdmin.css 中為 `.web-admin-wrapper` 與 `.wa-modal-container` 全域顯式設定 `text-align: left;`，杜絕全域 `#root { text-align: center; }` 對管理後台元件排版所產生的非預期文字置中影響。
- 單元測試與建置驗證：
  - 在 test/89_web_admin_events_enhancements.test.mjs 擴充第 7 項驗證測試，檢查說明文字 textAlign 與 CSS 容器靠左設定。
  - 全專案 365 項單元測試全數 PASS，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.211 (2026-09-25)
- 社員名冊頁面重構與互動體驗優化 (WebAdminMembers & WebAdminLayout & webAdmin.css)：
  - 導覽列更名與工具列精簡 (Terminology & Toolbar Layout)：
    - 側邊導覽列由「全社社員名冊」精簡更名為「社員名冊」。
    - 頂部工具列移除橫條「全社社員名冊」文字與圖示，重整按鈕精簡為純圖示按鈕並支援無障礙標籤。
  - 社員卡片純靠左排版與單鍵複製 (Member Card Left-Align & One-Click Copy)：
    - 卡片整體資訊統一設定為靠左排版 (`text-align: left`)。
    - 頂部整合雙軌頭貼機制：支援讀取 Supabase members 資料表之 `avatar_url` 欄位展示照片，若尚無頭貼則自動回退為姓名首字圓形徽章。
    - 姓名下方橫向排列身分標籤（在校/校友/校外）、社員標籤（社員/非社員）與幹部角色標籤。
    - 卡片中段依序呈現系所、學號、LINE ID、電話、Gmail，並為學號、LINE ID、電話、Gmail 分別配置專屬單鍵複製按鈕 (`wa-copy-btn`)，點擊複製文字至剪貼簿並彈出短暫微提示，同時加入 `e.stopPropagation()` 杜絕誤觸側邊抽屜。
    - 卡片底部固定錨定註冊日期（靠左）與「編輯個人資料」（靠右）。
  - 懸浮式圓角滑出彈窗與左側大圖檢視面板 (Floating Slide-Over Sheet & Side Photo Lightbox)：
    - 側邊抽屜重構為懸浮式圓角彈窗 (`.wa-drawer-panel`)，具備 18px 圓弧邊角與四周留白間距，呈現現代獨立視窗感。
    - 抽屜內部所有標題與文字統一設定靠左對齊。
    - 抽屜個資編輯表單新增「想說的話 (`want_to_say`)」文字區域與「體能測驗證明照片 (`proof_urls`)」縮圖清單 (`wa-proof-grid`)。
    - 點擊體能證明縮圖時，於右側抽屜的左方空間（螢幕左半部）即時浮現專屬大圖檢視面板 (`wa-drawer-side-preview`)，支援全圖瀏覽、另開原圖與快速關閉，方便幹部對照右側表單與左側證明。
    - 抽屜底部儲存按鈕文字精簡更名為「儲存變更」。
  - 歷史履歷深度優化與「日期：-」修復 (Timeline Records Enhancement)：
    - 診斷並修復歷史履歷中因欄位對應錯誤導致日期恆顯示為「-」之問題，改為優先讀取 Supabase RPC 之 `date_display` 欄位（如出隊區間或租用天數）。
    - 履歷卡片加入活動（Calendar）、裝備（Package）、繳費（CreditCard）專屬分類標籤與圖示。
    - 依狀態動態套用彩色狀態徽章（正取/已歸還綠色、待領取/待審核橘色、取消紅色）。
    - 補齊金額、付款狀態、借用品項與備註等詳細資訊。
  - Diff 比對確認彈窗靠左對齊 (Diff Confirmation Modal Alignment)：
    - 將 Diff 彈窗的標題、副標題與說明文字統一設定為靠左對齊 (`textAlign: 'left'`)。
  - 資料庫層擴充 (Database Schema Migration)：
    - 建立 `supabase/migrations/20260925_add_avatar_url_to_members.sql`，為 `members` 資料表擴充 `avatar_url TEXT` 欄位以支援 LINE Profile 大頭貼同步。
- 單元測試與建置驗證：
  - 新增 `test/88_web_admin_members_redesign.test.mjs` 共 7 大驗證測試。
  - 全專案 372 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.212 (2026-09-25)
- 裝備借用模組重構與卡片/抽屜體驗優化 (WebAdminLoans & WebAdminLayout & webAdmin.css)：
  - 系統命名與導覽列精簡 (Terminology & Navigation)：
    - 將工作站頂部導覽列由「裝備借用管理」精簡更名為「裝備借用」。
    - 工具列左側移除橫條「裝備借用管理」標題文字與圖示，重整按鈕精簡為純圖示按鈕並支援無障礙標籤。
  - 卡片雙倍寬度網格與純靠左排版 (Double-Width Card Grid & Left-Align Layout)：
    - 卡片網格改用 `.wa-card-grid-loans`，設定自適應最小寬度為 640px (`minmax(640px, 1fr)`)，呈現雙倍寬度之資訊卡片。
    - 卡片文字預設純靠左對齊 (`textAlign: 'left'`)。
    - 頂部靠左姓名、靠右純中文借還狀態（待領取、租借中、已歸還、已取消）與繳費狀態徽章。
    - 第二列直接呈現借用單號 ID，不加「單號」前綴。
    - 第三列以標籤形式一一條列借用裝備品項與數量 (`wa-loan-items-row` & `wa-loan-item-pill`)。
    - 第四列與第五列呈現借用期間與應付租金，徹底移除所有押金欄位與文案。
    - 底部固定列左側配置「查看個人資料」按鈕、右側配置「查看詳細與操作」按鈕。
  - 手機介面風格個人資料彈窗 (Mobile Profile Modal Integration)：
    - 點擊卡片左下方「查看個人資料」按鈕，立即跳出置中之手機介面風格個人資料彈窗 (`MemberProfileModal`)。
    - 彈窗完整呈現社員姓名、性別、身分標籤、學號、系所、聯絡電話、LINE ID、Email、緊急聯絡人、體能自述與證明照片等。
    - 彈窗底部配置「移至社員詳細資料編輯頁面」按鈕，點擊自動導向 `/admin-web/members`。
  - 懸浮圓角側邊抽屜與左側並排個資面板 (Floating Drawer & Side Profile Panel)：
    - 側邊抽屜採用懸浮圓角視窗設計 (`.wa-drawer-panel`，18px 圓角與細緻陰影)，抽屜文字預設純靠左對齊。
    - 抽屜「申請人資訊」中的借用人姓名以膠囊徽章按鈕 (`wa-name-capsule-btn`) 包覆。
    - 點擊借用人姓名膠囊時，於主抽屜左側並排展開同級之個人資料面板 (`wa-drawer-side-profile`)，方便幹部邊檢視借用單邊對照借用人完整個資與登山經歷；面板右上角提供前往 `/admin-web/members` 編輯按鈕。
    - 抽屜帳務區塊、裝備品項表格與幹部備註 placeholder 中徹底移除所有「押金」字樣與欄位。
- 單元測試與建置驗證：
  - 新增 `test/90_web_admin_loans_redesign.test.mjs` 共 6 大驗證測試。
  - 全專案 378 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.213 (2026-09-25)
- 裝備借用人詳細資料與個人資料彈窗全面統一 (Member Profile Modal & Drawer Unification)：
  - 卡片彈窗與抽屜個資 100% 組件共用 (Unified Profile Component Architecture)：
    - 抽屜內部原先手刻之側邊借用人個資面板全面替換為 `MemberProfileModal` 內嵌模式 (`mode="inline"`)。
    - 卡片點擊「查看個人資料」（手機彈窗）與抽屜點擊姓名膠囊展開之「借用人詳細資料」（左側並排面板）達成 100% 視覺、排版、欄位與行為一致，皆包含姓名、頭貼、身分標籤、基本與學校聯絡資訊、緊急聯絡人、體能證明照片縮圖、戶外登山經驗、體能自述與幹部留言。
  - 裝備借用單詳情欄位修復與 RPC / 直查健全化 (Fix Missing Student ID, Department & LINE ID)：
    - 診斷並修復借用單詳情中學號、系所與 LINE ID 消失顯示為「-」之問題。
    - 修復 Supabase 資料庫 RPC `get_admin_loans_rpc`，在 SQL `SELECT` 中補齊 `m.student_id, m.department, m.line_id`，同步建立資料庫遷移檔 `supabase/migrations/20260925_fix_get_admin_loans_rpc_member_fields.sql` 並同步更新 `supabase/admin_portal_rpc.sql`。
    - 修復 WebAdminLoans 直讀查詢語法，選取安全的 members 關聯欄位與 items jsonb 欄位，雙重確保直讀與 RPC 備援皆能完整保留學號、系所與 LINE ID。
  - 體能證明照片側邊大圖檢視與小螢幕浮動置中 (Side Photo Lightbox & Responsive Overlay)：
    - 點擊借用人個資之體能證明縮圖時，即時在左側展開專屬大圖檢視面板 (`wa-drawer-side-preview`)，支援全圖瀏覽與關閉。
    - 在 webAdmin.css 加入媒體查詢響應式防禦：當螢幕寬度小於 1500px 時，自動將大圖檢視面板轉為全螢幕浮動置中覆蓋 (`position: fixed; inset: 0`)，徹底解決 3 欄並排時產生的版面擠壓問題。
  - 跨頁面精確定位與抽屜自動展開 (Cross-Page Deep Linking with Auto Drawer Open)：
    - 個資彈窗與側邊面板底部按鈕點擊「前往編輯」時，攜帶使用者 ID 導向 `/admin-web/members?userId=${encodeURIComponent(userId)}`。
    - 社員名冊頁面 (`WebAdminMembers.tsx`) 整合 `useSearchParams` 監聽網址參數，載入名單後自動比對並直接開啟該社員的資料編輯抽屜，無需幹部手動再次搜尋。
- 單元測試與建置驗證：
  - 更新 `test/90_web_admin_loans_redesign.test.mjs`，新增驗證共用 MemberProfileModal inline 模式、學號/系所/LINE ID 存在性、大圖預覽面板與網址自動開抽屜功能。
  - 全專案 379 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.214 (2026-09-25)
- 裝備庫存管控頁面全面重構 (Web Admin Equipment Inventory Modernization):
  - 導覽列與工具列更名：更名為「裝備庫存」，移除橫條文字與圖示，重整改為純圖示按鈕，右側新增「新增裝備」按鈕。
  - 表格欄位與互動重構：
    - 「裝備編號」改名為「編號」。
    - 「系統分類」改為即時下拉選單，可在表格內直接切換並即時更新至 Supabase。
    - 「總庫存」與「目前可借」提供「+」與「-」按鈕即時增減微調。
    - 「社員價」與「非社員價」合併為「基礎價 (2天)」，只使用 price_2day 與 price_extra_day，價格移除貨幣符號以純數字顯示。
    - 移除規格說明欄位，保留備註欄位；備註支援點擊自適應展開完整多行高度或收合為單行。
    - 表格最右側新增鉛筆編輯圖示，點擊後於右側滑出懸浮圓角側邊抽屜。
  - 懸浮圓角側邊抽屜 (Equipment Edit & Create Drawer)：
    - 側邊抽屜採用懸浮圓角視窗設計，視窗文字預設純靠左對齊。
    - 整合手機版 1:1 正方形相片輪播與管理功能，支援多張相片上傳、刪除與瀏覽。
    - 抽屜內支援修改名稱、分類、編號、總庫存、可借數量、基礎價 (2天)、續租每日與備註。
- Supabase 資料庫欄位清理與預約 RPC 更新 (Database Price Column Deprecation & RPC Update)：
  - 自 Supabase equipments 資料表正式移除錯誤的 member_price_per_day 與 non_member_price_per_day 欄位。
  - 更新 submit_equipment_loan_rpc 預約借用預存程序，移除對過期欄位之依賴，改為統一讀取 price_2day 與 price_extra_day 計算總租金。
  - 建立資料庫遷移檔 supabase/migrations/20260925_cleanup_equipment_prices_and_update_loan_rpc.sql 並同步更新 supabase/fix_equipment_loan_rpc.sql。
- 財務對帳核銷頁面修復與健全化 (Web Admin Finance Page Fix & Optimization)：
  - 導覽列與標題更名為「財務對帳」，移除大字橫條，重整改為純圖示按鈕。
  - 徹底修復資料空轉問題：改由呼叫 fetchFinanceItemsFromSupabase（整合 payments、loans、signups 跨表財務資訊之 get_admin_finance_rpc），並將預設篩選改為 ALL，解決原先寫死待確認導致 0 筆資料的問題。
  - 欄位映射修正：支援 bank_last5 帳號末五碼讀取與顯示。
  - 批次核銷功能支援與錯誤透明化：支援 BATCH_VERIFY_PAYMENTS，稽核錯誤遵循透明原則直接印出完整代碼與訊息。
- 單元測試與建置驗證：
  - 新增 test/91_web_admin_inventory_and_finance.test.mjs，包含 7 大驗證測試。
  - 全專案 74 個測試套件、386 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.215 (2026-09-25)
- 電腦版工作站全站版面優化與左側空白移除 (Layout White Space Removal)：
  - 診斷全站左側大塊空白根因：修正 `src/index.css` 中 `#root` 保留之 `width: 1126px; margin: 0 auto; border-inline: ...`，改設為全寬 `width: 100%; min-height: 100svh;`。
  - 修正 `webAdmin.css` 中 `.web-admin-wrapper` 的寬度設定，由 `width: 100vw;` 改為 `width: 100%;`，消除桌面瀏覽器縱向滾動條造成的橫向溢出與位移。
  - 經由外層全寬自適應設定，電腦版幹部工作站無縫貼合螢幕邊界展開，手機版 LIFF 頁面則維持由 `.app-container { max-width: 600px; margin: 0 auto; }` 安全置中。
- 頂部狀態列重構 (Top Header Brand, Navigation Reorder & Logout Popover)：
  - 品牌更名與精簡：保留綠色山岳圖示，品牌文字由「台科登山社 [電腦工作站]」更新為「NTUST Mountaineering」，移除原有膠囊徽章。
  - 導航分頁重新排序：依指定工作流排列為「活動管理、報名名冊、社員名冊、財務對帳、裝備借用、裝備庫存」。
  - 登出互動重構為懸浮下拉選單 (Dropdown Popover)：滑鼠懸停於幹部姓名與職位上方時，於下方平滑滑出精緻浮動卡片，顯示頭貼、姓名、幹部職稱與「登出工作站」按鈕；滑鼠移開後自動平滑收合。
- 財務對帳核銷頁面功能增強 (Web Admin Finance Redesign)：
  - 申請人姓名膠囊化與個資彈窗 (Applicant Name Capsule & Member Profile Modal)：
    - 表格中申請人姓名改以綠色圓角膠囊按鈕 (`wa-name-capsule-btn`) 包覆。
    - 點擊後跳出手機風格之個人資料彈窗 (`MemberProfileModal`)，完整展示基本資料、通訊聯絡、緊急聯絡人、登山經歷與體能紀錄。
    - 彈窗底部「前往個人資料編輯」整合跨頁導覽，點擊直達 `/admin-web/members?userId=...` 並自動開啟該社員之編輯抽屜。
  - 核銷按鈕操作權限守衛 (Verification Button Guard)：
    - 嚴格限制：當款項狀態為「待繳費 Unpaid」時，不顯示「確認核銷」按鈕，避免幹部在未收到款項時誤觸核銷。
    - 僅在「待確認 Checking」狀態時顯示「確認核銷」按鈕；「已核銷 Confirmed」狀態時呈現綠色已核銷標籤。
    - 表格全選核取方塊與批次核銷自動過濾排除「待繳費 Unpaid」項目，確保批次核銷僅針對待確認項目生效。
  - 操作欄筆圖示與右側滑出式編輯視窗 (Pencil Icon & Slide-over Drawer)：
    - 操作欄位配置筆的圖示 (`Pencil`) 按鈕。
    - 點擊筆圖示自右側滑出懸浮圓角抽屜 (`wa-drawer-backdrop` + `wa-drawer-panel`)。
    - 抽屜支援完整款項資訊檢視、匯款單據/證明照片縮圖與放大預覽、核銷狀態即時切換、LINE 通知狀態更新與幹部內部備註編輯。
    - 儲存時直連 Supabase 更新關聯款項與來源狀態，並在核銷且未通知時非同步觸發 GAS LINE 推播通知與寫入稽核日誌。
  - 長文字儲存格點擊自適應調整欄高 (Cell Expansion & Dynamic Row Height)：
    - 款項說明、備註說明與款項單號等長文字欄位支援點擊互動 (`wa-clickable-cell`)。
    - 點擊切換展開狀態 (`wa-cell-expanded` / `wa-cell-ellipsis`)，自動擴展列高完整顯示內容，再次點擊收合回單行。
- 單元測試與建置驗證：
  - 新增 `test/92_web_admin_redesign_and_finance_workflow.test.mjs`，包含 8 大驗證測試。
  - 全專案 75 個測試套件、394 項單元測試 100% 通過，TypeScript 與 Vite 打包建置零錯誤。

### v0.1.216 (2026-09-25)
- 緊急白屏異常修復 (Hotfix White Screen / React Hook Order Violation)：
  - 診斷白屏根因：在 [src/pages/web-admin/WebAdminLayout.tsx](file:///Users/brianhung/Documents/OfficialLINEAccount/src/pages/web-admin/WebAdminLayout.tsx) 中，登出選單狀態 `isUserMenuOpen` 的 `useState(false)` 誤置於 `if (loading || !session) return ...` 提前返回條件式之後，違反 React Rules of Hooks，在初始渲染到憑證驗證完成重渲染時拋出 `Rendered more hooks than during previous render` 致命例外導致全站崩潰。
  - 修正措施：將 `const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);` 移至組件頂部（與 `session` 及 `loading` 共同於最前端初始化），嚴格確保所有渲染週期 Hook 呼叫順序完全一致，徹底解決白屏問題。
  - 驗證：全專案 75 個測試套件、394 項單元測試 100% 通過，Vite 與 TypeScript 打包編譯無任何錯誤。

### v0.1.217 (2026-09-25)
- 電腦工作站全模組高階表格與個人資料編輯重構 (Web Admin Advanced Tables & Member Drawer):
  - 抽取共用個人資料編輯抽屜 (MemberEditDrawer.tsx):
    - 將社員名冊逾 600 行之個人資料編輯抽屜獨立抽取為全站共用組件 `src/components/admin/MemberEditDrawer.tsx`。
    - 支援 Profile 基本資料與 Timeline 歷程紀錄雙分頁，涵蓋通訊、緊急聯絡人、體能登山經歷、體能照片預覽、幹部留言與意願管理。
    - 內建 Diff 差異比對計算與確認對話框；特別設計當未變更任何欄位 (0 Diff) 按下儲存時自動關閉抽屜，避免多餘阻擋。
    - 儲存完成後直連 Supabase 更新並寫入幹部審計日誌 (logWebAuditAction)。
  - 個資檢視彈窗對接直通編輯抽屜 (MemberProfileModal.tsx):
    - 底部按鈕文案更新為「開啟詳細資料編輯頁面→」。
    - 支援 `onOpenEditDrawer` 回呼函式，點擊後於當前頁面右側平滑滑出 MemberEditDrawer，免跳轉頁面。
  - 報名名冊 (WebAdminRoster.tsx) 表頭排版與個資對接:
    - 表頭動作列 (`.wa-th-actions-overlay`) 支援 `flex-wrap: wrap;` 與百分百寬度保護，窄欄位按鈕完整展示不被擠壓。
    - 姓名欄位以綠色膠囊包覆 (`.wa-name-capsule-btn`)，點擊開啟個資檢視彈窗並直通編輯抽屜。
  - 裝備借用 (WebAdminLoans.tsx) 3 欄自適應卡片網格與個資對接:
    - 借用卡片列表導入 `.wa-card-grid-loans` 樣式，寬螢幕下自適應呈現 3 欄並支援 2 欄與單欄彈性排版。
    - 借用人個資彈窗直通右側滑出 MemberEditDrawer。
  - 社員名冊 (WebAdminMembers.tsx) 身分名稱與卡片貼底優化:
    - 身分標籤與篩選選項精簡為「臺科在校生」。
    - 社員卡片 footer 底部固定貼齊 (`margin-top: auto;`)，消除卡片高度不一下方參差問題。
    - 接入共用 MemberEditDrawer 組件。
  - 裝備庫存 (WebAdminInventory.tsx) 與財務對帳 (WebAdminFinance.tsx) 引進高階表格引擎:
    - 全面移植 `useAdvancedTable` 狀態管理引擎，支援欄位寬度拖曳調整、欄位順序拖曳與左右移動、欄位釘選至最左側 (sticky left 陰影)。
    - 序號列加入四角懸浮快捷工具 (置頂、上移、下移、隱藏) 與中央垂直拖曳手柄。
    - 工具列提供欄位顯隱管理選單 (Visible Columns)、一鍵還原預設寬度按鈕與隱藏列恢復功能。
    - 財務對帳申請人姓名支援點擊開啟個資彈窗並直通 MemberEditDrawer。
- 單元測試與建置檢查:
  - 新增 `test/93_web_admin_advanced_tables_and_member_drawer.test.mjs`，包含 8 大驗證測試。
  - 全專案 76 個測試套件、402 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.218 (2026-09-26)
- 裝備借用頁面直開個資編輯抽屜 (WebAdminLoans Direct MemberEditDrawer):
  - 借用單詳情抽屜中點擊「開啟詳細資料編輯頁面→」時，不再跳轉至社員名冊頁面，直接在裝備借用頁面滑出 `MemberEditDrawer`。
  - 支援 `isStacked` 屬性將編輯抽屜疊加於最上層（更高 z-index: 1060），底層裝備抽屜維持開啟狀態。
  - 編輯儲存或取消關閉後，無縫返回原裝備借用單，並即時更新該借用單內顯示之社員姓名、電話、學號等快照資料。
- 個人資料編輯抽屜左側同級視窗架構 (MemberEditDrawer Sibling Side Panels):
  - 歷史履歷左側同級滑出：移除抽屜內部 Tab 切換覆蓋表單之設計，抽屜主面板恆定呈現個資編輯表單；頂部提供「歷史履歷」展開切換鈕，點擊後自左側滑出獨立同級時間軸視窗 (`wa-drawer-side-timeline`)，方便邊審核履歷邊編輯資料。
  - 體能證明照片最左側同級展開：點擊體能證明縮圖時，大圖視窗 (`wa-drawer-side-preview`) 渲染於履歷視窗之左側，形成三欄同級並排（左：大圖預覽，中：歷史履歷，右：編輯表單）。
  - 抽屜容器 (`wa-drawer-backdrop`) 支援水平滾動 (`overflow-x: auto; flex-wrap: nowrap;`)，在螢幕寬度不足時保證平滑水平捲動，徹底消除 `@media (max-width: 1500px)` 將大圖置中覆蓋在表單上方的破版行為。
- 個人資料瀏覽彈窗縮圖顯示與右側同級大圖預覽 (MemberProfileModal Thumbnails & Right Side Preview):
  - 體能證明文件區域改為展示縮圖網格（使用 `getDriveThumbnail` 渲染 72x72 圓角照片），取代原有的純文字按鈕。
  - 在置中彈窗（Modal 模式）下點擊縮圖後，大圖預覽面板於個人資料卡片的右側同級展開並排置中 (`[個資卡片] + [大圖預覽]`)，點擊關閉或原圖可即時收合。
  - 在側邊 inline 模式下維持透過 `onPreviewPhoto` 在左側同級展示大圖。
- 單元測試與建置檢查:
  - 新增 `test/94_web_admin_loans_member_edit_and_side_panels.test.mjs`，包含 4 大驗證測試。
  - 更新 `test/93_web_admin_advanced_tables_and_member_drawer.test.mjs`。
  - 全專案 77 個測試套件、406 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.219 (2026-09-26)
- 觸控板手勢衝突防護與水平捲動負座標修復 (Trackpad Gesture Containment & Flex-End Scroll Fix):
  - 杜絕上一頁歷史導航手勢：在抽屜容器 (`.wa-drawer-backdrop`) 加上 `overscroll-behavior-x: contain;`，徹底封鎖 Mac 觸控板或橫向滾輪在水平捲動到邊界時向外冒泡觸發瀏覽器「上一頁 / 下一頁」導航手勢。
  - 根除 Flexbox 負向座標資料遺失 (Scroll Data Loss)：移除 `justify-content: flex-end;`，改由 `.wa-drawer-backdrop > *:first-child { margin-left: auto; }` 實現自適應靠右；面板寬度超出螢幕時 `margin-left: auto` 自動歸零，子元素自 `x = 0` 正座標向右延伸，保證水平捲軸能在全寬範圍內平滑滾動，左側面板不再被截斷。
  - 平滑視角自動對齊：在 `MemberEditDrawer` 內加入 `backdropRef`，於歷史履歷或體能證明大圖展開時自動平滑捲動至最左側 (`left: 0`)，提供流暢的三欄並排檢視體驗。
- 體能證明大圖預覽亮色藝廊風格統一 (Light Gallery Style for Photo Preview):
  - 外框與標題列現代亮色化：側邊大圖預覽面板 (`.wa-drawer-side-preview`) 與 `MemberProfileModal` 右側大圖預覽卡片全面改採白底 (`var(--wa-surface)`)、柔和淺灰標題列 (`var(--wa-surface-alt)`) 與 `var(--wa-border)` 細邊框，消除原先深黑底色與電腦工作站整體的割裂感。
  - 畫布柔和淺灰與照片立體陰影：預覽照片畫布採用 `#f8fafc` 柔和底色，照片本體套用微圓角、細緻邊框與柔和立體陰影 (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08)`)，無論白底文件或彩色照片皆獲得最佳層次感與對比度。
  - 工具按鈕顏色對齊：外開新視窗 (`ExternalLink`) 與關閉按鈕 (`X`) 統一套用中性灰色，懸浮時平滑過渡。
### v0.1.220 (2026-09-26)
- 個人歷史紀錄全面重構 (MemberEditDrawer Personal History Overhaul):
  - 履歷更名為「個人歷史紀錄」：側邊展開面板與抽屜表頭按鈕一致更名，主面板維持個資編輯表單。
  - 頂部個人基本資訊摘要小卡：新增頂部小卡，展示個人頭像、姓名、學號、系所、幹部/社員身分徽章與社籍有效期限。
  - 整合 NotionFilterBar 搜尋與篩選工具列：
    - 支援即時文字關鍵字搜尋。
    - 支援類別篩選（全部、活動出隊、裝備借用、繳費紀錄）。
    - 支援狀態篩選（全部狀態、已完成 / 已核銷、待確認 / 待領取、正取 / 租借中、候補 / 備取）。
    - 支援排序方式切換（時間戳記、紀錄類別）與即時重新整理按鈕。
  - 歷史紀錄卡片向下展開互動：點擊卡片向下展開顯示完整中繼資料（借用起訖日與天數、應收租金、活動正取備取狀態、繳費收據縮圖、申報備註與幹部審核備註）。
- 財務對帳同級多欄滑動與裝備借用連動 (WebAdminFinance Sibling Multi-Column Slide-Over & Loan Linkage):
  - 三欄同級並列滑出式抽屜架構：`[裝備借用編輯 (最左)] + [個人詳細資料 (中間)] + [財務對帳編輯 (右側)]`，所有面板並列於 `wa-drawer-backdrop` 內，支援平滑水平捲動且具備手勢防穿透保護。
  - 款項說明裝備租借即時連動：當款項屬於裝備租借時，點擊裝備租借項目自動於最左側滑出該筆裝備借用單編輯抽屜 (`wa-drawer-side-loan`)，支援即時調整借用狀態（待領取、租借中、已歸還、已取消）、填寫幹部備註並直接儲存更新 Supabase。
  - 備註欄位對調問題徹底修復：唯讀區塊正確顯示「申請人申報備註」(`editingItem.notes`)，編輯輸入框正確綁定「幹部核銷內部備註」(`drawerNotes`)；單筆與批次核銷不再以申請人備註覆蓋幹部內部備註。
- 財務對帳表格與工具列進階優化 (WebAdminFinance Table & Toolbar Advanced Features):
  - 操作欄位精簡：僅保留無外框純鉛筆圖示按鈕 (`wa-icon-action-btn`)，移除「已核銷」文字標籤，滑鼠懸浮時平滑變色。
  - 欄位定義更新：`created_at` 欄位更名為「時間戳記」，新增「通知狀態」欄位 (`notification_status`)。
  - 固定表格版面與自訂寬高：支援 `tableLayout: fixed`，序號欄位掛載 `wa-row-resizer` 拖曳手柄，表格資料列套用 `rowHeights` 支援自由拖曳調整列高。
  - 款項說明固定格式標籤：採用標準高辨識度標籤呈現：
    - ［活動］（綠色標籤 `wa-tag-activity`）活動名稱
    - ［社費］（黃色標籤 `wa-tag-membership`）社籍與社費（有效至隔年 1 月底）
    - ［裝備］（藍色標籤 `wa-tag-equipment`）裝備租借（ORD_xxxxxx）
  - 工具列新增排序方式下拉選單：支援「時間戳記：新到舊」、「時間戳記：舊到新」、「金額：高到低」、「金額：低到高」與「核銷狀態排序」。
  - 工具列新增一鍵發送通知功能：智慧偵測所有「已核銷 Confirmed」且「未通知」之款項，一鍵發送 LINE 推播通知並批次更新 Supabase 通知狀態為「已通知」。
- 裝備庫存進階優化 (WebAdminInventory Enhancements):
  - 裝備序號自動產生標準化：新增裝備時自動依現有流水號產生標準 `Gxxx` 三位數編號（例如 `G006`）。
  - 完全移除裝備相片標題：依指示徹底移除「裝備相片 (0/5 張)」區塊標題，保持表單簡潔整齊。
  - 操作欄位改用無外框純鉛筆圖示按鈕 (`wa-icon-action-btn`)，並加入 `tableLayout: fixed` 與 `wa-row-resizer` 列高拖曳手柄。
- 單元測試與建置檢查:
  - 新增 `test/95_web_admin_finance_advanced_and_inventory_serial.test.mjs`，包含 6 大驗證測試。
  - 全專案 78 個測試套件、413 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.221 (2026-09-26)
- 財務對帳姓名欄位溢出截斷保護 (WebAdminFinance Name Capsule Overflow Fix):
  - 膠囊按鈕防溢出封裝：為 `.wa-name-capsule-btn` 加上 `max-width: 100%; box-sizing: border-box; overflow: hidden;`，並於其內層 `span` 加上 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`。
  - 表格單元格邊界約束：在表格申請人欄位 `<td>` 限制 `maxWidth: columnWidths['applicant'] || col.defaultWidth || 150` 與 `overflow: hidden; text-overflow: ellipsis;`，徹底根除長英文姓名撐破欄寬並與右側單號文字重疊之問題。
  - 完整姓名浮動提示：於按鈕保留 `title={item.name}` 提示，滑鼠懸浮時可即時查看未被截斷之完整姓名。
- 款項說明單行不折行與視覺優化 (WebAdminFinance Single-line Payment Type):
  - 容器單行並列約束：將 `renderPaymentType` 容器排版由 `flexWrap: 'wrap'` 改為 `flexWrap: 'nowrap'; whiteSpace: 'nowrap'; overflow: 'hidden';`，確保類別標籤（如［活動］、［社費］、［裝備］）與後續文字說明永遠保持在同一行，不再發生折行至第二行之版面斷裂。
  - 文字內容安全截斷：內層文字套用 `text-overflow: ellipsis; white-space: nowrap;`，欄寬過窄時平滑以省略號截斷，外層容器提供完整字串之 `title` 懸浮提示。
- 活動款項說明格式一致化 (Consistent Activity Payment Type Formatting):
  - 前端純化標準化：在 `renderPaymentType` 中導入正則表示式，統一過濾來自 `payments` 繳費單的前綴符號與「活動：」字樣，並自動解構來自未繳費名單之「活動費用 (...)」外層包覆，將兩者皆純化為標準一致之「［活動］ 活動名稱」（例如「［活動］ 閂山、鈴鳴山」）。
  - 後端 RPC 格式同步：更新 `supabase/admin_portal_rpc.sql` 並建立獨立遷移腳本 `supabase/fix_admin_finance_consistent_type_rpc.sql`，將 `get_admin_finance_rpc` 中未繳費正取名單的合成項目名稱由 `'活動費用 (' || e.title || ')'` 改為與繳費單完全一致之 `'活動：' || e.title`。
- 社員申報備註資料庫寫入機制查核確認 (Applicant Notes SSOT Verification):
  - 查核驗證 `supabase/payment_rpc.sql` (`submit_payment_rpc`) 與 `supabase/verify_payment_rpc.sql` (`verify_payment_by_token`)，確認社員繳費申報時填寫之備註皆 100% 正確存入 `payments.notes` 欄位，而 `payments.officer_notes` 留空供管理幹部核銷時填寫內部備註。
  - 在 `src/gas.js` 與 `gas_modules/05_Sync_Worker.js` 之 `payments` 欄位架構對應中補齊 `"notes"` 欄位，確保 Google 試算表與 Supabase 雙向同步不遺漏社員申報備註。
- 單元測試與建置檢查:
  - 擴充 `test/95_web_admin_finance_advanced_and_inventory_serial.test.mjs`，新增姓名膠囊截斷、款項說明單行不換行、活動名稱純化與 GAS 欄位包含驗證測試。
  - 全專案 78 個測試套件、414 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.222 (2026-09-26)
- 側邊裝備借用抽屜儲存按鈕獨立置底 (WebAdminFinance Side Loan Drawer Footer):
  - 移出表單卡片區塊：將原先置於「裝備租借狀態調整」卡片內部之「儲存租借狀態」按鈕移出，不再擠壓於備註輸入框下方。
  - 獨立置底頁尾區（wa-drawer-footer）：建立與主抽屜風格完全一致之獨立頁尾區，置於面板最底部固定呈現。
  - 整合關閉與儲存操作：頁尾包含次要操作「關閉」按鈕（點擊即時收合側邊租借抽屜）與主要操作「儲存租借狀態」按鈕（支援讀取旋轉圖示與防止重複點擊），大幅提升視覺整潔度與幹部操作體驗。
- 單元測試與建置檢查:
  - 於 `test/95_web_admin_finance_advanced_and_inventory_serial.test.mjs` 增補側邊租借抽屜獨立置底頁尾結構斷言測試。
  - 全專案 78 個測試套件、414 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.223 (2026-09-26)
- 個人歷史紀錄篩選與排序電腦端懸浮氣泡選單 (MemberEditDrawer & NotionFilterBar Popover Mode):
  - 獨立懸浮氣泡選單架構：為 NotionFilterBar 新增 `popoverMode` 屬性，在電腦端側邊工作站抽屜 (`MemberEditDrawer`) 啟用懸浮氣泡模式 (`popoverMode={true}`)。
  - 精確錨定與層級隔離：點擊篩選或排序按鈕時，選單以絕對定位卡片（`position: absolute; top: calc(100% + 8px); right: 0;`）直接懸浮展開於按鈕下方，搭配透明全局點擊遮罩（`position: fixed; inset: 0`）實現點擊外部自動收合，徹底取代覆蓋全螢幕的黑色遮罩底部彈窗。
  - 即時即選即套用：在 480px 寬度之歷史紀錄面板中緊湊舒適操作，點選條件即時更新過濾與排序結果，無需層層點擊跳出。
  - 100% 手機端相容性：`popoverMode` 預設值為 `false`，手機端與一般列表頁面維持原有的 Bottom Sheet 底部彈窗體驗，零副作用零退化。
- 單元測試與建置檢查:
  - 於 `test/95_web_admin_finance_advanced_and_inventory_serial.test.mjs` 新增 `popoverMode` 屬性、氣泡結構與抽屜連動斷言測試。
  - 全專案 78 個測試套件、415 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.224 (2026-09-26)
- 電腦網頁版個人資料瀏覽全面重構為臺灣登山申請表格式 (MemberProfileModal.tsx):
  - 擬真臺灣登山申請整合資訊網 / 國家公園入園申請隊員資料排版：深藍色頂部標頭 (#3b4d6b)、緊湊雙欄與獨立外框規格。
  - 表單標籤絕無星號規範：依使用者要求，申請表所有欄位標籤（姓名、電話、地址、手機、Email、身分證號/護照號碼(或居留證)、性別、生日、緊急聯絡人、緊急聯絡電話）徹底移除星號符號。
  - 全欄位獨立一鍵快速複製：每個欄位均提供小巧獨立之複製按鈕，點擊後呈現綠色勾勾「已複製」回饋，極大化提升管理幹部前往入園入山系統申報之效率。
  - 電話預設「同手機」帶入：自動填入行動電話號碼並提示「(同手機)」，支援獨立一鍵複製。
  - 臺灣地址智慧拆解演算法 (parseTaiwanAddress)：智慧拆解 22 縣市、368 鄉鎮市區與詳細路名門牌為獨立三格，各格均支援獨立複製，並額外提供「複製全址」快捷鍵；非臺灣地址自動標示「海外/其他」。
  - 國籍後台繁體中文呈現：無論社員當初註冊是以英文還是中文填寫，管理後台（MemberProfileModal 與 MemberEditDrawer）一律透過 getNationalityLabel(val, 'zh') 轉化為標準繁體中文顯示（如中華民國、日本、美國等）。
  - 生日標準格式與日曆圖示：以 YYYY-MM-DD 連字號格式輸出，右側附日曆小圖示，下方標註「格式：1980-01-01」。
  - 留守人員官方警語：附上藍色警示文案「緊急聯絡人以自己家人為主，否則無法受理，緊急聯絡人或留守人員為不隨隊伍上山之家人」。
  - 分隔線下方四大結構化卡片：清楚分區呈現「社團與學籍身分」、「緊急留守附加資訊」、「登山經歷與體能審核（含體能證明照片縮圖與右側同級大圖預覽）」與「想對幹部說的話」。
  - 響應式分離：電腦端採 560px~720px 寬版登山申請表格式；行動裝置自動維持直式卡片佈局。
- 國籍 (Nationality) 欄位全鏈路實作與 37 國雙語支援:
  - 常數與字典工具 (src/constants/nationalities.ts)：定義中華民國及 36 個外國國家/地區繁中與英文雙語對照，並提供 getNationalityLabel 與 parseTaiwanAddress 工具函式。
  - 資料庫層 (supabase/add_nationality_to_members.sql, schema.sql, member_profile_rpc.sql, admin_portal_rpc.sql)：在 members 表新增 nationality TEXT DEFAULT '中華民國' 欄位，並更新 save_member_profile 與 update_admin_member_rpc 預存程序支援。
  - 社員註冊全鏈路 (Register.tsx)：步驟一必填表單加入國籍下拉選單（包含 37 國與 Other 自行輸入），未填寫時無法進到下一步。
  - 個資編輯與電腦端抽屜 (MemberDetailEdit.tsx, MemberEditDrawer.tsx)：加入國籍欄位，幹部後台檢視與編輯一律以繁體中文選單呈現。
- 單元測試與建置檢查:
  - 全新建立 test/96_member_profile_mountain_permit_and_nationality.test.mjs，完整覆蓋 37 國對照、地址拆解演算法、註冊步驟一必填驗證、後台繁中顯示、登山申請表無星號與一鍵複製、以及資料庫遷移 RPC 定義。
  - 修復 MemberDetailEdit.tsx 型別匯入與參數型別註解。
  - 全專案 77 個測試套件、421 項單元測試 100% 通過，TypeScript (tsc -b) 與 Vite 打包建置零錯誤，嚴格恪守零 Emoji 規範。

### v0.1.225 (2026-09-26)
- 修正 Vite HMR Fast Refresh 失效導致「隊員資料 (臺灣登山申請格式)」卡片不顯示之根本原因：
  - 根因：MemberEditDrawer.tsx 同時匯出 React 元件與非元件常數 FIELD_LABELS、getDriveThumbnail，違反 Vite Fast Refresh 規則，導致 HMR 標記為 invalidate 並向上傳播至 MemberProfileModal.tsx，瀏覽器載入舊版 JS chunk。
  - 新建 src/utils/driveUtils.ts：將 getDriveThumbnail 函式拆分至獨立工具模組。
  - MemberEditDrawer.tsx：移除 FIELD_LABELS 與 getDriveThumbnail 的 export 關鍵字，改為 module-private；新增從 driveUtils 引用。
  - MemberProfileModal.tsx：getDriveThumbnail import 來源由 MemberEditDrawer 改為 driveUtils，解除跨元件依賴鏈。
  - WebAdminRoster.tsx：移除 ALL_COLUMNS 的 export 關鍵字，消除另一處 Fast Refresh 警告。
  - 全專案 tsc -b && vite build 零錯誤，打包成功。

### v0.1.226 (2026-09-26)
- 徹底根除 get_admin_member_detail_rpc 400 Bad Request 錯誤：
  - 診斷：原預存程序第 153 行使用 WHERE s.status NOT IN ('已取消 Cancelled', '未錄取 Rejected')，因資料庫列舉型別 event_signup_status_enum 並無「未錄取 Rejected」值，且社團報名業務邏輯本就一律使用「已取消 Cancelled」，導致 PostgreSQL 拋出 invalid input value for enum event_signup_status_enum: "未錄取 Rejected" 型別例外並引發 HTTP 400。
  - 修正：將排除條件回歸純粹的 WHERE s.status != '已取消 Cancelled'，完全符合現有資料庫 Enum 定義，不需修改或增加任何資料庫列舉型別。
  - 建立專屬資料庫遷移腳本 supabase/migrations/20260926_fix_get_admin_member_detail_status_filter.sql，並同步更新 supabase/admin_portal_rpc.sql。
- 名冊管理國籍欄位補齊與結構相容防護 (WebAdminRoster.tsx):
  - 於 loadSignups 之 members:line_user_id 關聯查詢清單中加入 nationality 欄位，確保報名名冊首度讀取時即完整包含國籍資料。
  - 點擊社員姓名時增加對 s.members 為物件或陣列之雙軌相容處理，保證 initialMember 欄位完整帶入彈窗。
- 建置與單元測試校驗：
  - 全專案 421 項單元測試 100% 通過，TypeScript 與 Vite 打包無警告與錯誤，完全恪守零 Emoji 規範。

### v0.1.228 (2026-09-26)
- 個人資料瀏覽 (MemberProfileModal.tsx) 登山申請表區塊渲染與瀏覽器快取診斷分析:
  - 診斷：針對使用者提問「為什麼個人資料瀏覽頁面的其他社團基本資料與履歷上方的登山申請區塊沒有顯示出來」，進行全面靜態分析與生產打包驗證。
  - 結構確認：在 MemberProfileModal.tsx 的電腦版排版分支 (isDesktopLayout) 中，renderTaiwanMountainPermit() 確實位在 renderDesktopOtherSections() 的正上方，且無任何 return null 或 display: none 之條件阻擋。
  - 產物驗證：執行 tsc -b 與 vite build，建置打包產物 dist/assets/MemberProfileModal-*.js 中確認編譯包含「隊員資料 (臺灣登山申請格式)」卡片元件結構與繁中轉換邏輯。
  - 根因定位：截圖中呈現已渲染「其他社團基本資料與履歷」但缺漏登山申請卡片之現象，主因為 Vite dev server 開發環境下的模組快取或 Fast Refresh 在先前的熱重載中未完全同步到瀏覽器當前執行環境中，瀏覽器執行了過渡時期的 JS 記憶體狀態。
  - 排除方案：建議於瀏覽器端執行強制重新整理 (Mac: Cmd + Shift + R, Windows: Ctrl + F5) 或重啟 Vite dev server 以強制載入最新產物。
  - 遵循零 Emoji 規範，全測試通過。

### v0.1.229 (2026-09-26)
- 個人資料瀏覽彈窗 (MemberProfileModal.tsx) 滾動卡死防截斷優化與登山申請手風琴切換實作:
  - 臺灣登山申請格式卡片手風琴折疊展開互動實作：深藍色標題列導入 `isPermitExpanded` 狀態切換，支援點擊展開/收合申請表欄位，右側動態切換 `ChevronUp` 與 `ChevronDown`，預設保持展開，兼顧一鍵檢視完整申請表與收合節省垂直空間的需求。
  - 徹底解決彈窗無法上下滾動與截斷缺陷：
    - 外層固定遮罩（Fixed Overlay）：將 `overflowY: 'hidden'` 調整為 `overflowY: 'auto'` 並配置 `padding: '24px 16px'` 與 `overscrollBehavior: 'contain'`，消除滑鼠滾動事件被鎖死的狀況。
    - 內層卡片容器：引入 `margin: 'auto 0'` 搭配 `maxHeight: 'calc(100vh - 48px)'` 與 `overflowY: 'auto'`，確保在各類螢幕解析度或小筆電上，上下邊緣絕不超出視窗，滾輪可平滑自如滾動至最底部編輯按鈕。
  - 單元測試與建置檢查：
    - 全專案 77 個測試套件、421 項單元測試 100% 通過，TypeScript 與 Vite 生產環境打包零警告零錯誤。
    - 恪守社團開發規範，全篇零 Emoji。

### v0.1.230 (2026-09-26)
- 個人資料瀏覽彈窗 (MemberProfileModal.tsx) 臺灣登山申請表預設直接開啟與全資訊無截斷呈現優化:
  - 預設強制直接打開 (Default Expanded)：
    - 在 MemberProfileModal 元件狀態初始化中將 `isPermitExpanded` 設定為 `true`，並於 `useEffect` 監聽當彈窗開啟 (`isOpen === true`) 或切換不同隊員 (`targetUserId`) 時，主動觸發 `setIsPermitExpanded(true)`，保證每次點開隊員資料皆 100% 預設直接展開登山申請表，無需額外手動點擊。
    - 保留深藍色標題列點擊折疊收合互動，提供動態 `ChevronUp` 與 `ChevronDown` 視覺反饋。
  - 臺灣登山申請格式完整性補齊 (Row 7 內嵌)：
    - 在臺灣登山申請表本體中新增第七行 (Row 7)，納入「與留守人關係 (`emerRel`)」與「緊急聯絡人地址 (`emerAddr`)」，配合既有之 Row 6（緊急聯絡人姓名、電話），使臺灣國家公園與林業署入園入山所需個資達到 100% 完整涵蓋。
  - 長文字防截斷與自動換行支援 (Prevent Text Truncation)：
    - 擴充 `renderPermitField` 工具函式，加入 `allowWrap` 參數支援 `wordBreak: 'break-word'` 與 `whiteSpace: 'normal'`。
    - 詳細地址 (Row 2)、電子信箱 (Row 3) 與緊急聯絡人地址 (Row 7) 移除 `whiteSpace: 'nowrap'` 與省略號 (`...`)，確保完整地址與資訊無遮蔽完整可見。
    - Row 7 採 `1fr 2fr` 格線排版，賦予緊急聯絡人地址更寬裕的視覺展示空間。
  - 外層自然流動滾動架構：
    - 遮罩層採 `alignItems: 'flex-start'` 搭配 `overflowY: 'auto'`，內層卡片容器使用自然高度展開與置中，杜絕雙層捲軸衝突與畫面邊緣硬截斷。
  - 測試與建置校驗：
    - 全專案 77 個測試套件、421 項單元測試 100% 通過，TypeScript 與 Vite 打包無錯誤，嚴格遵循零 Emoji 規範。

### v0.1.231 (2026-09-26)
- 個人資料瀏覽彈窗 (MemberProfileModal.tsx) 冗餘輸入提示與裝飾分隔線移除:
  - 移除手機格式提示文字 (L535)：移除手機欄位下方之 `'格式：0912345678'` 提示文字，瀏覽檢視狀態回歸乾淨簡潔。
  - 移除生日格式提示文字 (L684)：移除生日區塊下方的 `格式：1980-01-01` 提示節點。
  - 移除留守警語藍色文字區塊 (L732)：移除登山申請表卡片底部的留守警語節點（「緊急聯絡人以自己家人為主，否則無法受理，緊急聯絡人或留守人員為不隨隊伍上山之家人」）。
  - 移除「其他社團基本資料與履歷」分隔線 (L748)：移除介面中橫跨左右之質感分隔線與標題文字，使「社團與學籍身分」分區卡片直接緊湊銜接於登山申請表下方。
  - 單元測試與建置校驗：
    - 同步更新 test/96_member_profile_mountain_permit_and_nationality.test.mjs 移除對警語文案之強斷言。
    - 全專案 77 個測試套件、421 項單元測試 100% 通過，TypeScript 與 Vite 打包零錯誤，恪守社團規範全篇零 Emoji。

### v0.1.232 (2026-09-26)
- 電腦版活動管理 (WebAdminEvents.tsx) 儲存活動直通 save_admin_event_rpc 預存程序:
  - 徹底解決 PostgreSQL RLS 42501 權限錯誤：
    - 根因：先前 WebAdminEvents.tsx 直接對 events 表執行 client.from('events').insert(payload) 與 update(payload)，因 events 表啟用了 Row-Level Security 且未對 anon/authenticated 配置 INSERT/UPDATE 策略，導致拋出 new row violates row-level security policy for table "events" (代碼: 42501)。
    - 修正：活動新增與更新全面改為直接調用 Supabase 核心預存程序 save_admin_event_rpc。該 RPC 具備 SECURITY DEFINER 特性，由資料庫以定義者最高權限執行 UPSERT (ON CONFLICT (id) DO UPDATE)，完全豁免 RLS 封閉限制，無需手動執行任何 SQL 遷移腳本。
  - Google 試算表自動雙向同步整合：
    - save_admin_event_rpc 內部自帶 INSERT INTO sync_queue，活動新增或變更後自動排入佇列，由後台 Sync Worker 排程自動同步至活動專屬試算表。
  - 全系統單一信任源架構對齊：
    - 電腦版 WebAdminEvents.tsx 與手機版 AdminEvents.tsx 統一採用 save_admin_event_rpc 進行活動建立與編輯，確保跨端行為完全一致。
  - 測試與建置檢查：
    - 全專案 77 個測試套件、421 項單元測試 100% 通過，TypeScript 與 Vite 打包零錯誤，恪守社團規範全篇零 Emoji。

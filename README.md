# 🏔️ 國立臺灣科技大學登山社 - 社團官方數位系統 (NTUST Hiking Club Official System)

[![Version](https://img.shields.io/badge/version-v0.1.177-emerald.svg)](package.json)
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
- [7. 最新版本異動紀錄 (Changelog v0.1.177)](#7-最新版本異動紀錄-changelog-v01177)

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
## 7. 最新版本異動紀錄 (Changelog v0.1.177)

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


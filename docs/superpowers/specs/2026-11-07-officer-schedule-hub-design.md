# 幹部後台社務日程 (Calendar & Activity Hub) 功能設計文件

## 1. 意圖與緣由 (Intent & Why)
目前台科登山社電腦版幹部工作站（Web Admin）具備「活動管理」、「報名名冊」、「社員名冊」、「財務對帳」、「裝備借用」與「裝備庫存」六大功能模組。然而，這些模組各自獨立，幹部在日常營運與活動籌備上面臨以下挑戰：
1. **社團排程與學校節點缺乏全局視野**：幹部在規劃出隊、召開行前會或社課時，無法直觀掌握學校校曆（如期中考週、期末考週、選課停修截止、寒暑假起訖），常需手動跨視窗對照，容易造成活動撞期或報名流標。
2. **多業務時間戳記分散無法即時追蹤**：活動報名截止、隊員繳費申報、裝備預約與借還期限散落在各個獨立頁面。幹部若想了解「這兩天社團發生了哪些事、誰繳費了、今天有哪些裝備待點收」，必須逐一切換多個分頁查詢。
3. **缺乏統一的跨業務全域檢索入口**：目前無法透過單一搜尋框直接搜尋某位社員或關鍵字在社團中的完整時間歷程（如出隊、繳費、裝備借用歷史）。

本專案旨在於幹部工作站新增頂層同級頁面「**社務日程**」（WebAdminSchedule），結合日曆與時間軸雙視圖，整合 Google Calendar 社團行事曆、學校訂閱校曆，以及 Supabase 系統內所有業務時間資料，提供幹部統一的營運中樞。

---

## 2. 目標、非目標與反目標 (Goals, Non-goals, Anti-goals)

### 目標 (Goals)
- **頂層功能整合**：
  - 於幹部工作站導覽列新增與活動管理同級之「社務日程」分頁（路由：`/admin-web/schedule`）。
  - 僅限已通過驗證之幹部存取（遵循現有 `isOfficer` 權限）。
- **日曆檢視 (預設)**：
  - 格子大小固定（高度 110px），不因當日事項數量撐開破壞版面。
  - **多日行程橫跨長條**：跨多天的活動（如 3 天高山出隊、為期一週的學校考試週）以橫跨格子的連續彩色長條直觀呈現。
  - **巨觀行程色彩優先**：出隊活動、報名截止、學校重大校曆以醒目高對比標籤置頂。
  - **細部業務灰底填入**：隊員繳費、裝備借還在剩餘空間以灰底白字微型標籤填補。
  - **超額省略與向下滑動展開**：超出格子高度時以「⋮ 另有 N 筆」省略。點擊任意日期格子或省略符號時，畫面平滑向下滑動至日曆正下方之「當日業務明細清單」，以條列方式呈現該日的所有活動、繳費與借還紀錄，並附帶對應功能跳轉按鈕。
- **時間軸檢視 (可切換)**：
  - 提供日曆與時間軸一鍵切換。
  - 依時間倒序（今天、昨天、未來）垂直串流呈現。
  - **智能聚合折疊**：當同一天發生大量同類業務（如單日多筆繳費或多人借裝備）時，預設自動折疊為「今日共收到 N 筆繳費」概要卡片，點擊後展開明細。
- **控制工具列 (Toolbar)**：
  - 全域即時搜尋框：支援跨年度/跨月份即時搜尋活動名稱、隊員姓名、款項金額、裝備名稱。
  - 分類篩選器：可切換「全部」、「活動與截止日」、「學校行事曆」、「財務入帳」、「裝備借還」。
  - 月份導覽切換器（上個月、下個月、回到今日）。
- **Google 日曆與學校校曆串聯**：
  - 由社團 Google 官方帳號直接訂閱學校公開行事曆。
  - 透過現有 GAS Worker 定期將 Google Calendar 主日曆與訂閱校曆同步至 Supabase 快取表。

### 非目標 (Non-goals)
- 不在前台 LIFF（一般社員端）直接暴露此全域日曆（該頁面專屬幹部內部使用，涉及敏感個資與財務）。
- 不取代各業務專屬頁面的深度編輯能力（社務日程以檢視、追蹤與跳轉引導為主，詳細對帳或名冊編輯引導至專屬分頁）。
- 不自建複雜的學校教務處網頁爬蟲（直接採用 Google Calendar 官方訂閱學校 iCal 機制）。

### 反目標 (Anti-goals)
- 嚴禁在未登入或非幹部狀態下暴露任何社員繳費、帳號後五碼或借用器材等隱私資料。
- 嚴禁因大量業務紀錄而導致月曆格子無限增高或版面跳動。
- 嚴禁每次換月皆向 Google API 發送即時同步請求而引發介面卡頓或超時。

---

## 3. 系統限制與邊界條件 (Constraints)
- **效能考量**：後台必須在數十毫秒內完成換月與關鍵字檢索，不得依賴 GAS 的即時冷啟動回應。
- **套件規範**：前端維持專案既有之 React 18 + TypeScript + Vite + Lucide-react 架構，依賴套件管理嚴格遵守 `pnpm`。
- **資料庫規範**：所有 Schema 變更必須透過標準 Supabase SQL Migration 追蹤。
- **錯誤防護**：遵循專案核心規範，所有 API 查詢失敗必須直接顯示完整錯誤訊息，不得靜默吞沒。

---

## 4. 架構方案評估 (Approaches)

### 方案 A：前端即時聚合（零資料庫結構改動）
- **做法**：前端切換月份時，同時向 Supabase 抓取當月的 `events`、`accounting_transactions`、`gear_loans`，並透過 GAS 呼叫 Google Calendar API，在前端 JavaScript 進行合併、過濾與排序。
- **缺點**：跨年份全局搜尋受限於瀏覽器快取；且每次換月皆受限於 GAS 冷啟動（1.5 至 3 秒），使用者體驗不佳。

### 方案 B（使用者已確認採用）：Supabase 視圖/RPC 端點 + 外部日曆快取表
- **做法**：
  1. 於 Supabase 建立 `external_calendar_events` 資料表（快取 Google 日曆與學校訂閱日曆，年增容量僅約 0.03 MB）。
  2. 建立資料庫 RPC 函式 `get_schedule_feed(start_time, end_time, query_text, category)`，以 `UNION ALL` 在資料庫底層整合活動、截止日、交易、借還與外部日曆。
  3. 由 GAS Worker 背景定時同步 Google 日曆至快取表。
- **優點**：效能極高（查詢回傳 < 100ms），支援資料庫層級的秒級跨年度全文檢索，前端架構簡潔乾淨。

---

## 5. 詳細設計與決策 (Detailed Design)

### 5.1 資料庫結構與 RPC 設計 (Supabase Migration)

#### 1. 外部日曆快取表 `external_calendar_events`
```sql
CREATE TABLE IF NOT EXISTS public.external_calendar_events (
    id TEXT PRIMARY KEY, -- Google Event ID
    calendar_type TEXT NOT NULL, -- 'club' (社團主日曆) 或 'school' (學校訂閱校曆)
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_all_day BOOLEAN DEFAULT FALSE,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ext_cal_start ON public.external_calendar_events(start_time);
CREATE INDEX idx_ext_cal_type ON public.external_calendar_events(calendar_type);
```

#### 2. 統一聚合排程 RPC 函式 `get_schedule_feed`
回傳結構包含統一欄位：
- `item_id`: 原始資料 ID
- `source_type`: `'event'` | `'deadline'` | `'school'` | `'club_calendar'` | `'finance'` | `'loan'`
- `title`: 顯示標題
- `sub_text`: 次要描述（如隊員姓名、金額、借用器材數量）
- `start_time`: 起始時間戳
- `end_time`: 結束時間戳
- `is_macro`: 布林值（是否為醒目巨觀項目）
- `status_badge`: 狀態文字或標籤
- `link_path`: 點擊跳轉之後台路徑（如 `/admin-web/roster?eventId=...`）

### 5.2 前端介面與互動設計 (`WebAdminSchedule.tsx`)

#### 1. 頂層工具列 (Toolbar)
- **搜尋框**：`debounce` 300ms 觸發 RPC 關鍵字檢索。
  - **自動切換機制**：當幹部在預設的月曆檢視輸入關鍵字搜尋時，系統自動切換為「時間軸檢視」，打破單月網格限制，直接以倒序時間串流完整呈現跨月份、跨年度的搜尋結果；清除搜尋框時自動切回月曆檢視。
- **分類下拉**：
  - 全部 (All)
  - 僅活動與截止日 (Events & Deadlines)
  - 僅學校校曆 (School Calendar)
  - 僅財務入帳 (Finance)
  - 僅裝備借還 (Gear Loans)
- **視圖切換**：`[ 月曆檢視 (預設) ]` 與 `[ 時間軸檢視 ]` 切換鈕。
- **月份切換**：`◀ 上個月`、`YYYY年 MM月`、`下個月 ▶`、`回到今日`。

#### 2. 月曆檢視 (Calendar View)
- 7 欄網格結構（日、一、二、三、四、五、六）。
- 單元格（Cell）高度固定為 `110px`，內部使用 `overflow: hidden`。
- **多日行程長條**：計算行程起訖日在週網格中的跨欄位置（`col-span`），以連續彩色長條渲染（出隊為綠色、學校重大節日為紫色）。
- **單日巨觀標籤**：截止日為黃底黑字、單日活動為藍底白字。
- **細部業務標籤**：繳費與借還以灰底白字（`#475569`）顯示隊員姓名與摘要。
- **超額省略**：格內空間不足時顯示「`⋮ 另有 N 筆`」。

#### 3. 下方展開明細區塊 (Date Detail Section)
- 幹部點擊月曆中任一天或「`⋮`」時，頁面自動平滑捲動至月曆正下方之「**選定日期詳細清單**」。
- 標題顯示：「**2026 年 11 月 6 日 (星期五) 業務明細**」，並附帶「關閉展開」按鈕。
- 明細清單以卡片條列顯示：
  - 巨觀活動卡片：顯示完整活動介紹、出隊時間、目前正取/候補人數，右側附帶「前往活動管理」與「查看報名名冊」按鈕。
  - 財務紀錄卡片：顯示社員姓名、申報金額、轉帳末五碼，右側附帶「前往財務對帳」按鈕。
  - 裝備借還卡片：顯示借用人、裝備清單、應還日期，右側附帶「開啟裝備點收」按鈕。

#### 4. 時間軸檢視 (Timeline View)
- 垂直時間軸，依日期倒序分組（今日、昨日、歷史與未來）。
- **智能聚合卡片**：若同日繳費或借還筆數 ≥ 3 筆，自動折疊顯示為「本日共計 8 筆繳費申報 ($9,600)」，點擊卡片本體即可原地垂直向下展開各筆明細。

### 5.3 外部日曆同步排程 (GAS Worker)
- 在 `gas_worker.js` 擴充 `syncCalendarEvents` 動作：
  1. 呼叫 `CalendarApp.getCalendarById(CLUB_CALENDAR_ID)` 讀取社團行程。
  2. 讀取社團帳號訂閱的學校校曆行程。
  3. 將行程轉換為 JSON 格式，批次 `UPSERT` 寫入 Supabase 的 `external_calendar_events` 表。
  4. 可由後台工具列之「立即重新同步日曆」按鈕手動觸發，亦可設定 GAS 時間觸發器每日定時同步。

---

## 6. 留給實作者之細節 (What's left to the builder)
- **多日跨格長條演算法**：由實作者實作週網格排版邏輯（計算事件在週列的跨欄位起訖，避免上下行重疊撞色）。
- **色票細節調和**：延續現有 `webAdmin.css` 之設計變數（`--wa-primary`, `--wa-bg`, `--wa-card`），確保深淺色與對比度舒適。
- **分頁載入效能優化**：月曆切換時僅查詢當月加減前後一週之緩衝區間，確保跨月多日事件正常顯示。

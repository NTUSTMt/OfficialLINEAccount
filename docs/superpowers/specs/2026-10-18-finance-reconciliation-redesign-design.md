# 電腦版財務對帳頁面重構與詳細報表設計規格書 (Design Specification)

## 1. 意圖與背景 (Intent & Why)
目前社團管理後台之財務對帳頁面 (`src/pages/web-admin/WebAdminFinance.tsx`) 雖具備基本之申報、借用與活動應收款項檢視，但在社團實務運作上面臨以下痛點：
1. **活動專題對帳不易**：幹部無法快速針對單一登山活動收支進行聚焦與核對，難以即時掌握特定活動之收款進度與未繳名單。
2. **缺乏多維度視覺報表**：缺乏應收 vs 實收對比、繳費達成率、款項結構佔比及金流趨勢等直觀數據圖表，不利於財務長向幹部群與社員大會報告。
3. **活動超支或額外費用補收無門**：登山活動常因實際包車、保險、嚮導或食材費用超過原預估金額，需向正取或特定社員追加補收款項；目前缺乏彈性新增應繳款項並推播通知社員之機制。
4. **催繳風險與誤發問題**：批次發送通知容易對已確認或爭議款項產生誤擾，需嚴格規範為「單筆審核、預覽確認後才發送」。

本重構旨在打造一個兼具「活動級專題對帳」、「全社財務宏觀看板」、「單筆精確催繳」與「彈性追加收款」的高效能桌面端財務管理系統，並提供完整的端到端閉環機制（從幹部後台建立款項推播、社員端 LINE 收件、點擊深層連結直通 LIFF 繳費申報、到幹部即時核銷）。

---

## 2. 目標、非目標與反目標 (Goals, Non-Goals, Anti-Goals)

### 目標 (Goals)
- **活動專屬聯動篩選**：頂部工具列提供活動選擇器，支援關鍵字即時搜尋與活動進行狀態分組；選定活動後，主款項表格、頂部統計概覽與右側報表面板全域即時聯動。
- **雙模式滑出式詳細報表 (Slide-over Analytics Drawer)**：
  - 模式一（活動專題明細）：應收 vs 實收柱狀/進度條、狀態分布環形圖、收款達成率 KPI 卡片、異常帳款/未繳人員名冊。
  - 模式二（全社財務宏觀）：全社各款項類別佔比圖、月度/週次收入趨勢折線圖。
- **報表核心管理工具**：
  - 學年度/學期（如 113-1, 113-2）與自訂起訖日期快速篩選。
  - 對帳明細與統計 CSV/Excel 匯出，以及格式化列印/另存 PDF 友善視圖。
- **嚴格單筆繳費催繳確認**：移除無差別批次推播，針對每筆未繳/待確認項目提供「發送提醒」按鈕，觸發「二次預覽確認視窗」審核卡片內容後才單筆發送。
- **新增繳費 / 追加款項抽屜（端到端閉環）**：
  - 支援「活動成員快速全選」與「全社名冊搜尋勾選」雙模式。
  - 支援統一設定每人應繳金額，並允許對特定名單微調金額。
  - 後端推播：在 `supabase/functions/notify-dispatcher/index.ts` 實作 `notify_payment_reminder` 之專屬 LINE Flex 卡片模板（包含款項說明、金額、社團匯款帳號與「前往回報匯款」按鈕）。
  - 社員端閉環：擴充 `src/pages/Payment.tsx` 支援讀取 URL query 參數（`targetId`, `type`, `amount`），開啟 LIFF 時自動帶入追加款項名稱與金額，讓社員無縫回報末五碼與上傳收據。
- **輕量零依賴圖表**：使用自研 SVG/CSS 向量圖表，不引入大型第三方圖表庫，確保極速載入且無版本衝擊。

### 非目標 (Non-Goals)
- 不實作自動化定期扣款或第三方金流閘道（如綠界/藍新），維持銀行轉帳回報末五碼之既有機制。
- 不取代 Google Sheets 既有之 Sync Worker 同步邏輯。

### 反目標 (Anti-Goals)
- 嚴禁未經確認的自動化批次推播或群發騷擾訊息。
- 嚴禁遮蔽任何資料庫或 API 錯誤訊息（遵守專案透明度原則，直接呈現完整錯誤代碼與原因）。
- 嚴禁在 UI、程式碼、提交訊息或文件中引入 Emoji。
- 嚴禁修改或破壞 `event_signups.notification_status`（嚴格遵守 Test 66 之解耦原則）。

---

## 3. 技術邊界與規範限制 (Technical Constraints)
1. **套件依賴**：專案基於 React 19、TypeScript 5/6、Vite 與 Lucide-react。新增圖表一律採用語義化 SVG/CSS 實作，不新增圖表庫依賴。
2. **樣式規範**：所有 UI 元素樣式必須遵循 `src/pages/web-admin/webAdmin.css` 既有之 CSS 變數系統（如 `--wa-primary`, `--wa-border`, `--wa-bg`, `--wa-success`, `--wa-warning` 等），嚴禁跑版或使用未定義之顏色值。
3. **資料流與權限**：
   - 幹部身分鑑權基於 `session.userId` 與 `session.jwt`。
   - 財務資料讀取沿用 `fetchFinanceItemsFromSupabase` 與 `get_admin_finance_rpc`。
   - 款項新增直接調用 Supabase client 寫入 `payments` 表格（初始狀態為 `'待繳費 Unpaid'`）。
   - 推播通知統一調用 `src/utils/api.ts` 之 `notifyDispatcher`。
4. **錯誤處理透明度**：所有 API、RPC 或 Supabase 操作例外，必須直接顯示於錯誤橫幅中，包含 HTTP 狀態碼與 Postgres 錯誤碼。

---

## 4. 模組架構與功能規格細節 (Functional Specifications)

### 4.1 頂部工具列與活動篩選器 (Activity Filter)
- **元件位置**：`WebAdminFinance` 頂部工具列 (`.web-admin-toolbar`)。
- **下拉選單設計**：
  - 預設選項：「全部活動款項 (All Events)」。
  - 分組呈現：
    - `進行中 / 報名中活動`（依活動日期由近至遠）
    - `籌備中 / 未來活動`
    - `已結束歷史活動`
- **聯動範圍**：
  - 主款項清單表格 (`useAdvancedTable`) 即刻依所選活動之 `target_id` / 活動名稱過濾。
  - 頂部統計指標卡（待核銷金額、已核銷金額、總筆數）同步即時重算。
  - 右側滑出式報表若開啟，自動切換至該活動之專題報表模式。

### 4.2 詳細財務報表抽屜 (Slide-over Analytics Drawer)
- **啟動方式**：頂部工具列新增「財務分析報表」按鈕，點擊後自螢幕右側滑出 560px 寬度之 Drawer（附半透明 Backdrop）。
- **頂部控制區**：
  - 模式切換 Tabs：「活動 / 專題明細」 vs 「全社綜合走勢」。
  - 時間快速過濾：提供學年度/學期下拉選單（如 113-2, 113-1, 112-2）以及「自訂起訖日」。
  - 工具按鈕：
    - 「匯出 CSV」：以 UTF-8 with BOM 匯出當前分析明細與摘要。
    - 「友善列印 / PDF」：開啟專用 CSS print 預覽視窗。
- **模式 A（活動專題分析）內容**：
  1. **活動財務總覽 KPI**：
     - 應收總額 (Expected Total)、已入帳實收 (Confirmed Received)、待繳/待查帳 (Pending)。
     - 繳費達成率 (Completion Rate, %)。
  2. **應收 vs 實收對比圖 (SVG 柱狀進度條)**：
     - 雙色進度對比，直觀顯示入帳缺口。
  3. **繳費核銷狀態分布 (SVG 環形圖 Donut Chart)**：
     - 已核銷 (綠色)、待確認 (黃色)、待繳費 (紅色)。
  4. **未繳名冊與異常稽核專區**：
     - 列出正取但未繳費、逾期繳費、或申報但無末五碼者。
     - 每一列提供人員姓名、應繳金額、逾期天數。
     - 每列右側具備獨立「提醒繳費」按鈕（導向單筆預覽流程）。
- **模式 B（全社綜合看板）內容**：
  1. **款項結構佔比 (SVG 多段環形圖)**：
     - 活動費用、裝備租借、社籍社費、其他雜項之金額與百分比。
  2. **金流收支趨勢圖 (SVG 折線/面積圖)**：
     - 近 6 個月或近 12 週之每月已核銷入帳曲線與總收款金額。

### 4.3 繳費提醒與單筆預覽確認流程 (Reminder Modal)
- **限制條款**：杜絕批次一鍵發送，一律要求單筆確認。
- **互動流程**：
  1. 幹部在未繳清單中點擊特定社員的「發送提醒」。
  2. 彈出「發送繳費提醒確認視窗 (Payment Reminder Modal)」：
     - 呈現收件人姓名、LINE 綁定狀態（若無綁定提示不可發送）。
     - 待繳款項名稱與應繳金額。
     - 即將推播之 LINE Flex 卡片即時視覺預覽。
     - 「自訂提醒備註」（例如「請於本週三前完成匯款」）。
  3. 幹部點擊「確認發送」後：
     - 呼叫 `notifyDispatcher('notify_payment_reminder', payload)`。
     - 成功後更新該筆資料之通知狀態為「已通知」，並顯示綠色成功橫幅。
     - 狀態持久化：在 `payments` 建立/更新對應之追蹤記錄，嚴禁直接寫入 `event_signups.notification_status`（維護 Test 66 解耦標準）。

### 4.4 新增繳費 / 追加款項抽屜 (Add Payment Request Drawer)
- **啟動方式**：頂部工具列提供「+ 新增繳費項目」按鈕。
- **抽屜介面結構**：
  1. **基本款項設定**：
     - 款項名稱（例如：合歡北西下華岡 追加車資、高山嚮導費分攤）。
     - 關聯活動（下拉選單，可選特定活動或「無/一般款項」）。
     - 款項類別（活動費用 / 裝備相關 / 社費 / 其他）。
     - 統一金額（填入數值後自動套用至所有已選社員）。
     - 備註說明（說明超支原因或繳費截止時間）。
  2. **選擇繳費對象（多選名冊）**：
     - 模式選擇切換：「從活動成員選取」 vs 「從全社社員搜尋」。
     - 若選擇「從活動成員選取」，自動載入該活動之正取名冊，提供「全選 / 全消」快捷鍵。
     - 若選擇「從全社社員搜尋」，提供姓名、學號與系所即時過濾清單。
     - 已選名單列表：表格形式呈現，包含姓名、學號、個別金額輸入框（預設帶入統一金額，允許幹部手動調高或調低）。
  3. **通知設定**：
     - 核取方塊：「建立後立即向已選社員發送 LINE 繳費通知卡片」。
     - 卡片包含：款項標題、應繳金額、備註、社團郵局/銀行帳號，以及「前往回報匯款」按鈕（點擊直接喚起 LIFF `/payment` 並帶入 `targetId`、`type` 與 `amount`）。
  4. **送出與寫入**：
     - 由前端注入唯一 ID（`PAY_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`）。
     - 剔除不存在之 `payment_status` 欄位，僅寫入 `payments` 表格必要且受支援的欄位。
     - 若勾選通知，逐一呼叫 `notifyDispatcher('notify_payment_reminder', ...)` 發送 Flex 卡片。
     - 成功後自動重新整理主表格資料並關閉抽屜。

### 4.5 社員繳費端 (`Payment.tsx`) 閉環支援
- 擴充 `src/pages/Payment.tsx`：
  - 於 `useEffect` 中讀取 URL Query 參數：`targetId`、`type`、`amount`。
  - 若偵測到網址參數，動態注入待回報項目清單，並預先填入應繳金額。
  - 社員輸入末五碼與上傳匯款收據圖片後，提交時將其連結至該筆追加款項，使幹部可在後台一鍵核銷。

---

## 5. 資料規格與介面定義 (Data & Interface Definitions)

### 5.1 款項資料對應
新增款項寫入 `payments` 表格：
```typescript
interface NewPaymentPayload {
  id: string; // 前端生成之唯一識別碼
  line_user_id: string;
  name: string;
  type: string; // 款項說明
  amount: number;
  status: '待繳費 Unpaid';
  target_type: 'event' | 'loan' | 'membership' | 'general';
  target_id: string | null;
  notes: string;
  notification_status: '未通知' | '已通知';
  created_at: string;
}
```

### 5.2 LINE Flex 催繳與繳費通知 Payload (`notify_payment_reminder`)
透過 `notifyDispatcher` 發送之結構：
```typescript
interface PaymentReminderPayload {
  lineUserId: string;
  userName: string;
  title: string; // 如 "【雪山主東】費用追加通知"
  amount: number;
  dueDate?: string;
  notes?: string;
  bankInfo: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
  };
  actionUrl: string; // "https://liff.line.me/.../payment?targetId=...&type=...&amount=..."
}
```

---

## 6. 實作者決策清單 (Decisions Made by Builder)
1. **主鍵生成與欄位清理**：寫入 `payments` 時由前端函式生成 `PAY_` 前綴之唯一時間戳碼，並自動過濾非資料表定義之欄位，確保資料庫寫入 100% 成功。
2. **狀態映射校正**：修改 `src/utils/supabaseClient.ts` 中 `fetchFinanceItemsFromSupabase` 的狀態映射邏輯，正確保留 `payments` 的 `'待繳費 Unpaid'`，不再強行轉為 `'待確認 Checking'`。
3. **通知解耦維護**：嚴格遵循 Test 66 解耦標準，活動報名之提醒狀態絕不污染 `event_signups.notification_status`，以 `payments` 記帳單或本機狀態追蹤。
4. **SVG 圖表動畫與尺寸微調**：環形圖與柱狀圖的圓角、漸層比例與 SVG viewBox 佈局細節由實作者依螢幕適配調整。
5. **列印 CSS 樣式微調**：`@media print` 下隱藏側邊欄、工具列與按鈕，僅呈現潔淨統計報表表格之樣式實作。

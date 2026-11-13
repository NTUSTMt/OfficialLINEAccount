# 活動報名名冊：跨活動與社員名冊人員導入功能設計文件

## 1. 意圖與緣由 (Intent & Why)
- **行程備案轉移痛點**：登山活動常因抽籤（如天池山莊未中籤改雪山單攻）或氣候因素改行備案。幹部會另外建立新活動以維持活動紀錄獨立性，但原名冊停留在舊活動且報名已截止，導致新活動名冊為空。
- **幹部隨隊口頭報名痛點**：幹部隨隊常僅口頭協調或工作分配，不會透過前台官方帳號重複填寫報名表，幹部需有直覺管道手動將幹部快速加入活動名冊。
- **目標**：在電腦版幹部工作站報名名冊（`WebAdminRoster`）新增「+ 新增/導入人員」彈窗，支援從其他活動批次複製名冊，以及從全體社員名冊（含幹部快速篩選）補登人員。

---

## 2. 目標、非目標與反目標 (Goals, Non-goals, Anti-goals)

### 目標 (Goals)
1. **工具列新增入口**：在 `WebAdminRoster` 表格頂部控制列（AI 評分與匯出 TSV 旁）新增「+ 新增/導入人員」按鈕。
2. **分頁 1：從其他活動複製 (Copy from Event)**：
   - 下拉選單選擇來源活動（列出所有活動名稱與日期）。
   - 即時載入該活動報名名單，顯示姓名、原錄取狀態、繳費狀態與身分。
   - 提供快速勾選按鈕：「全選正取」、「全選備取」、「清空選取」。
   - 提供匯入設定選項：
     - 入隊狀態：維持原狀態 / 統一設為正取 / 統一設為備取。
     - 繳費狀態：維持原繳費狀態（名冊標記已繳費並自動在備註加上 `【自原活動名轉入】`） / 統一設為未繳費。
     - 是否複製原幹部備註（選填）。
3. **分頁 2：從社員名冊新增 (Add from Member Directory)**：
   - 即時搜尋框：支援姓名、學號、系所或電話模糊搜尋。
   - 「僅顯示幹部」切換按鈕：快速篩選 `is_officer = true` 之幹部。
   - 個資狀態提示：若該社員缺少身分證字號或緊急聯絡人，顯示橘色「個資待補齊」徽章，但不強制阻擋幹部手動加入。
   - 勾選人員清單並設定統一初始狀態（預設「正取 Confirmed」）與繳費狀態。
4. **資料防重與重啟機制 (Deduplication & Reactivation)**：
   - 比對目標活動已有名冊：
     - 若人員已在目標活動中且為**有效狀態**（非已取消），清單中自動反灰停用並標註「已在此名冊中」，防止觸發資料庫 `idx_event_signups_active_unique` 衝突。
     - 若人員在目標活動中為**已取消狀態（Cancelled）**，採重啟更新（UPDATE / Reactivate）策略：重設為新指定狀態、清空 `cancel_reason` 並更新時間，避免同一人在名冊出現重複紀錄。
5. **資料寫入與稽核日誌**：
   - 產生唯一報名序號（格式相容 `S` + 隨機代碼），正確帶入社員快照（姓名、LINE ID、正式社員身分）。
   - 批次寫入 Supabase `event_signups` 資料表。
   - 寫入管理員操作稽核日誌（`logWebAuditAction`：`BATCH_IMPORT_SIGNUPS`）。
   - 寫入完成後即時重新整理目前活動名冊，無需重整整個頁面。

### 非目標 (Non-goals)
- 不主動刪除或變更來源活動的既有名冊（來源活動歷史紀錄保持不變）。
- 導入時不自動觸發 LINE 推播通知（由幹部後續手動於名冊勾選並點擊「發送通知」發出）。
- 不強制轉移 `payments` 底層原始金流紀錄，以保持原始匯款收據歷史真實性。
- 本階段不額外建立獨立的幹部名冊實體工作表，統一自 `members` 資料表篩選幹部。

### 反目標 (Anti-goals)
- 嚴禁靜默略過寫入錯誤，所有資料庫或網路錯誤必須直接顯示完整錯誤原因。
- 嚴禁在未比對防重的情況下產生重複寫入衝突導致整批中斷。

---

## 3. 系統架構與資料流 (Architecture & Data Flow)
1. **前端元件**：
   - 新增 `src/components/admin/RosterImportModal.tsx` 彈窗元件。
   - 於 `src/pages/web-admin/WebAdminRoster.tsx` 引入並串接 `selectedEventId` 與 `onRefresh`。
2. **資料庫操作**：
   - 讀取來源活動：`supabase.from('events').select('id, title, start_date').order('start_date', { ascending: false })`
   - 讀取來源名冊：`supabase.from('event_signups').select('*, members(*)').eq('event_id', sourceEventId)`
   - 讀取社員名冊：`supabase.from('members').select('line_user_id, name, student_id, department, phone, id_card, emergency_contact_name, is_officer, officer_role, is_official_member')`
   - 批次新增/更新：依既有取消狀態分流為 `insert` 與 `update`。

---

## 4. 方案評估回顧 (Approaches)
- **方案 A（已選定）**：雙分頁整合式導入彈窗，將「跨活動備案複製」與「社員/幹部手動新增」分開，操作情境明確且支援狀態批次設定。
- **方案 B（捨棄）**：單一搜尋清單混合活動載入，操作上下文容易混淆，不符合批次備案轉隊的使用場景。

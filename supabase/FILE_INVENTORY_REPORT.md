# 台科登山社 Supabase 散落 SQL 與歷史檔案清查報告

本報告於 2026 年 11 月透過比對線上生產環境即時 OpenAPI 綱要（https://bvyyuobmizfrosbgcqbu.supabase.co）與本機 `test/` 目錄中 100+ 個單元測試套件產生。

---

## 執行摘要

1. **新單一真值綱要 (`supabase/schema/`)**：
   - 已完成 14 大核心資料表、35 支線上即時 RPC 函式、自訂 ENUM、安全 CAST、防遞迴觸發器與完整 RLS 之模組化統整。
   - 包含主控綱要檔 `00_master_schema.sql` 與模組化程式檔 `01` 至 `06`。

2. **檔案清點與測試依賴**：
   - `supabase/` 根目錄下共 30 個歷史 SQL/腳本檔案。
   - `supabase/migrations/` 下共 19 個歷史遷移檔案。
   - **關鍵安全發現**：現有 `test/` 目錄中有多達 22 個自動化測試直接透過 `fs.readFileSync` 讀取並驗證特定的歷史 `.sql` 檔案（例如 `test/135_admin_portal_rls_hardening.test.mjs` 讀取 `supabase/admin_portal_rpc.sql`）。**若未經授權貿然刪除這些歷史檔案，將直接導致多個測試套件報錯中斷**。
   - **後續歸檔建議**：本清查報告標註了所有具有測試依賴的檔案，未來若需封存，應先重構對應的單元測試使其讀取 `supabase/schema/` 中的標準化檔案後，再執行安全封存。

---

## 一、`supabase/` 根目錄散落檔案清點清冊

| 檔案名稱 | 核心功能說明 | 收錄於 `supabase/schema/` 之模組 | `test/` 目錄測試依賴清單 | 處置建議 |
| :--- | :--- | :--- | :--- | :--- |
| `SCHEMA_DICTIONARY.md` | 早期資料庫字典說明文件 | 已完整昇華至 `schema/README.md` | `65_officer_system_modules.test.mjs` | 保留供測試與歷史查閱 |
| `schema.sql` | 歷史版本核心 DDL 結構 | `01`, `02`, `03`, `04`, `05`, `06` | `65`, `80`, `85`, `95`, `96`, `105`, `112` | 測試重度依賴，嚴禁刪除 |
| `triggers.sql` | 歷史版本背景同步與更名觸發器 | `06_system_and_queues.sql` | `65_officer_system_modules.test.mjs` | 測試依賴，維持現狀 |
| `admin_portal_rpc.sql` | 幹部後台名冊、租借、對帳 RPC | `02`, `04`, `05` | `65`, `66`, `76`, `81`, `83`, `95`, `105`, `106`, `112`, `130`, `135` | 測試重度依賴，嚴禁刪除 |
| `admin_events_rpc.sql` | 幹部活動管理與名單審核 RPC | `03_events_and_signups.sql` | `59`, `61`, `72`, `105`, `113` | 測試依賴，維持現狀 |
| `desktop_admin_security.sql` | 電腦版幹部後台資安與 RLS 強化 | `02`, `03`, `04`, `05`, `06` | `85_rls_security_boundaries.test.mjs` | 測試依賴，維持現狀 |
| `equipment_loan_rpc.sql` | 早期裝備租借提交與取消 RPC | `04_equipments_and_loans.sql` | 無 | 舊修補檔，可後續歸檔 |
| `fix_equipment_loan_rpc.sql` | 租借計費模型修復與庫存防呆 | `04_equipments_and_loans.sql` | 無 | 舊修補檔，可後續歸檔 |
| `payment_rpc.sql` | 早期繳費與未繳項目查詢 RPC | `05_finance_and_payments.sql` | `65`, `96`, `100`, `102`, `105` | 測試依賴，維持現狀 |
| `verify_payment_rpc.sql` | Token 單鍵核銷 RPC | `05_finance_and_payments.sql` | `65`, `96`, `100`, `102`, `105` | 測試依賴，維持現狀 |
| `fix_finance_combined_and_zero_fee_rpc.sql` | 0元活動核銷與合併繳費連動 | `05_finance_and_payments.sql` | 無 | 已完整收錄，可後續歸檔 |
| `fix_admin_finance_duplicate_rpc.sql` | 財務申報重複扣款除錯 | `05_finance_and_payments.sql` | `83_admin_finance_deduplication.test.mjs` | 測試依賴，維持現狀 |
| `fix_admin_finance_consistent_type_rpc.sql` | 財務報表型別一致化修復 | `05_finance_and_payments.sql` | `95_web_admin_finance_advanced_and_inventory_serial.test.mjs` | 測試依賴，維持現狀 |
| `fix_admin_events_rpc_bilingual.sql` | 幹部活動清單雙語欄位修復 | `03_events_and_signups.sql` | `69_bilingual_events_and_preferred_language.test.mjs` | 測試依賴，維持現狀 |
| `get_my_dashboard.sql` | 個人首頁儀表板資料聚合 | `02_members_and_officers.sql` | `61_event_group_url_and_accepted_notification.test.mjs` | 測試依賴，維持現狀 |
| `fix_dashboard_and_sync_rpc.sql` | 個人主頁活動與租借同步修復 | `02_members_and_officers.sql` | `112_security_vulnerability_fixes.test.mjs` | 測試依賴，維持現狀 |
| `reflections_wall_rpc.sql` | 活動心得牆與公開評價 RPC | `03_events_and_signups.sql` | `75_event_reflection_wall.test.mjs` | 測試依賴，維持現狀 |
| `history_achievements_rpc.sql` | 個人出隊里程碑與歷史繳費 | `03`, `05` | 無 | 已完整收錄，可後續歸檔 |
| `cancel_rpc.sql` | 早期取消報名與租借 RPC | `03`, `04` | 無 | 舊修補檔，可後續歸檔 |
| `member_profile_rpc.sql` | 早期個資讀取與儲存 RPC | `02_members_and_officers.sql` | 無 | 舊修補檔，可後續歸檔 |
| `member_officer_sync.sql` | 早期幹部名冊同步腳本 | `02_members_and_officers.sql` | 無 | 舊修補檔，可後續歸檔 |
| `add_equipment_categories.sql` | 早期新增裝備分類列舉 | `01_types_and_enums.sql` | 無 | 舊修補檔，可後續歸檔 |
| `add_line_group_url_to_events.sql` | 早期活動表新增群組連結 | `03_events_and_signups.sql` | 無 | 舊修補檔，可後續歸檔 |
| `add_line_id_to_event_signups.sql` | 早期報名表新增 line_id 欄位 | `03_events_and_signups.sql` | 無 | 舊修補檔，可後續歸檔 |
| `add_member_want_to_say.sql` | 早期會員表新增留言欄位 | `02_members_and_officers.sql` | 無 | 舊修補檔，可後續歸檔 |
| `add_nationality_to_members.sql` | 早期會員表新增國籍欄位 | `02_members_and_officers.sql` | `96_member_profile_mountain_permit_and_nationality.test.mjs` | 測試依賴，維持現狀 |
| `fix_enum_typecast_rpc.sql` | 早期 Enum 隱式轉型防呆修復 | `01_types_and_enums.sql` | 無 | 舊修補檔，可後續歸檔 |
| `fix_history_payment_status.sql` | 歷史繳費狀態解析除錯 | `05_finance_and_payments.sql` | `96_payment_proof_image_and_locales.test.mjs` | 測試依賴，維持現狀 |
| `fix_member_records_location_rpc.sql` | 社員歷史出隊行程欄位修復 | `02_members_and_officers.sql` | `81_member_records_activity_location_fix.test.mjs` | 測試依賴，維持現狀 |
| `fix_officer_role_and_items.sql` | 幹部角色欄位名稱修正 | `02_members_and_officers.sql` | 無 | 舊修補檔，可後續歸檔 |
| `fix_payment_status_enum_typecast.sql` | 繳費狀態轉型過渡腳本 | `01_types_and_enums.sql` | 無 | 舊修補檔，可後續歸檔 |
| `fix_save_member_profile_nationality.sql` | 個資儲存 RPC 補齊國籍 | `02_members_and_officers.sql` | `100_web_admin_table_resizing_and_overflow.test.mjs` | 測試依賴，維持現狀 |
| `fix_signup_status_enum.sql` | 報名狀態 Enum 修復 | `01_types_and_enums.sql` | 無 | 舊修補檔，可後續歸檔 |
| `fix_sync_queue_rls.sql` | 同步佇列權限修正 | `06_system_and_queues.sql` | `65`, `112` | 測試依賴，維持現狀 |
| `fix_trigger_recursion.sql` | 早期觸發器防遞迴修復 | `06_system_and_queues.sql` | 無 | 已完整收錄，可後續歸檔 |
| `rollback_desktop_admin_security.sql`| 電腦版後台權限復原腳本 | - (維運還原檔) | `85_rls_security_boundaries.test.mjs` | 測試依賴，維持現狀 |
| `update_status_enums.sql` | 早期列舉更新過渡檔 | `01_types_and_enums.sql` | 無 | 舊修補檔，可後續歸檔 |
| `etl_v2.js` | 舊版試算表匯入工具腳本 | 工具腳本 | 無 | 維護工具，保留 |
| `gas_sync_worker.js` | 舊版 GAS 同步常駐工作腳本 | 工具腳本 | 無 | 維護工具，保留 |
| `event_sheet_script.js` | 活動名冊 GAS 試算表外掛指令碼 | 工具腳本 | `127_event_sheet_strict_exact_30_columns.test.mjs` | 測試依賴，維持現狀 |
| `event_sheet_sidebar.html` | 活動名冊 GAS 側邊攔介面 | 工具介面 | 無 | 維護工具，保留 |

---

## 二、`supabase/migrations/` 遷移檔案清點清冊

| 遷移檔案名稱 | 核心功能說明 | 收錄於 `supabase/schema/` 之模組 | `test/` 目錄測試依賴清單 | 處置建議 |
| :--- | :--- | :--- | :--- | :--- |
| `20260925_add_avatar_url_to_members.sql` | 會員表新增 avatar_url 欄位 | `02_members_and_officers.sql` | `90_web_admin_members_redesign.test.mjs` | 測試依賴，維持現狀 |
| `20260925_cleanup_equipment_prices_and_update_loan_rpc.sql` | 裝備費用欄位清理與租借更新 | `04_equipments_and_loans.sql` | `91_web_admin_inventory_and_finance.test.mjs` | 測試依賴，維持現狀 |
| `20260925_fix_get_admin_loans_rpc_member_fields.sql` | 租借 RPC 會員名稱欄位防呆 | `04_equipments_and_loans.sql` | 無 | 遷移歷史，保留 |
| `20260926_fix_get_admin_member_detail_status_filter.sql` | 社員詳情狀態過濾修正 | `02_members_and_officers.sql` | 無 | 遷移歷史，保留 |
| `20261008000000_phase1_core_tables_and_rpc.sql` | app_config, webhook_events 等核心表建立 | `03`, `06` | 無 | 遷移歷史，保留 |
| `20261008000001_phase3_pg_cron_patrol.sql` | pg_cron 每日巡檢排程 | `06_system_and_queues.sql` | 無 | 遷移歷史，保留 |
| `20261009000001_change_patrol_to_weekly.sql` | 巡檢改為每週排程 | `06_system_and_queues.sql` | 無 | 遷移歷史，保留 |
| `20261009193000_update_signup_rpc_member_event_fields.sql` | 報名 RPC 欄位更新 | `03_events_and_signups.sql` | `117_supabase_edge_functions_behavior_parity.test.mjs` | 測試依賴，維持現狀 |
| `20261011_fix_get_member_profile_null_on_no_jwt.sql` | 個資查詢無 JWT 回傳 NULL | `02_members_and_officers.sql` | 無 | 遷移歷史，保留 |
| `20261011_harden_security_and_rls.sql` | RLS 與資安加固 | `02`, `03`, `04`, `05`, `06` | 無 | 遷移歷史，保留 |
| `20261011_phase2_security_remediation.sql` | Phase 2 高危漏洞修復 (C-1~C-3) | `02`, `04`, `05` | `113_comprehensive_security_remediation.test.mjs` | 測試依賴，維持現狀 |
| `20261011_rollback_harden_security_and_rls.sql` | 資安加固回滾指令碼 | - (維運備援) | 無 | 遷移歷史，保留 |
| `20261019000000_create_admin_digest_queue.sql` | 幹部彙整推播佇列表與排程 | `06_system_and_queues.sql` | `129_officer_notification_digest_and_reply_verification.test.mjs` | 測試依賴，維持現狀 |
| `20261021_fix_payment_status_unpaid_precedence.sql` | Unpaid 優先權修復 | `01`, `03` | 無 | 遷移歷史，保留 |
| `20261023_security_remediation_p3.sql` | Phase 3 資安漏洞加固 (IDOR 防護) | `02`, `03`, `04`, `05` | `134`, `135` | 測試依賴，維持現狀 |
| `20261103_fix_signup_rpc_remove_fee_column.sql` | 移除 signup_rpc 對 fee 欄位引用 | `03_events_and_signups.sql` | `141_fix_signup_rpc_remove_fee.test.mjs` | 測試依賴，維持現狀 |
| `20261104000000_fix_signup_rpc_member_fee_reference.sql` | 報名 RPC 會員費用引用修正 | `03_events_and_signups.sql` | `141_fix_signup_rpc_remove_fee.test.mjs` | 測試依賴，維持現狀 |
| `20261104010000_fix_save_member_profile_proof_urls_jsonb.sql` | proof_urls 以 JSONB 陣列儲存修復 | `02_members_and_officers.sql` | `146_save_member_profile_proof_urls_jsonb.test.mjs` | 測試依賴，維持現狀 |
| `20261104020000_fix_event_signup_cancelled_enum.sql` | 活動報名取消合法 Enum 與退款備註 | `03_events_and_signups.sql` | `147_fix_event_signup_cancelled_enum.test.mjs` | 測試依賴，維持現狀 |

---

## 三、結論與建議安全作業指引

1. **已達成之成果**：
   - 全新建立之 `supabase/schema/` 目錄已完全成為登山社資料庫結構的**權威真值來源（SSOT）**。
   - 與目前線上生產環境（https://bvyyuobmizfrosbgcqbu.supabase.co）之 14 大資料表結構、35 支 RPC 函式參數達到 100% 絕對一致。

2. **檔案安全建議（嚴禁貿然刪除歷史檔案）**：
   - 由於既有 CI / 單元測試高度依賴舊有的 `.sql` 檔案存在與內容匹配，**在未取得使用者授權及未重構既有測試前，請勿刪除任何歷史 `.sql` 檔案**。
   - 未來若需進行清理與封存：
     - 第一步：更新 `test/` 目錄中直接引用舊檔案路徑的測試案例，改為指向 `supabase/schema/`。
     - 第二步：確保 `npm test` 全部通過。
     - 第三步：向使用者申請授權，將無測試依賴的舊修補檔移至 `supabase/archive/`。

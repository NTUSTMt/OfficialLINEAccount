---
name: supabase-architecture
description: >-
  Use this skill when designing or modifying Supabase database schemas, writing or debugging PostgreSQL RPC stored procedures, creating or fixing database triggers, handling Enum typecasting, ensuring transaction atomicity, or working with data migrations in the NTUST Hiking Club project.
---

# Supabase 資料庫與 RPC 架構規範 (Supabase Architecture Guide)

本指南規範台科登山社專案之 PostgreSQL 資料庫設計、RPC (Stored Procedure) 撰寫、觸發器守衛與存取模式。所有結構與 Enum 皆以 [supabase/SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md) 為唯一真實來源 (SSOT)。

---

## 1. 存取通道決策樹：RPC vs 直接存取

```mermaid
graph TD
    Op[資料庫作業請求] --> CheckMulti{是否涉及多表連動或原子交易？<br/>如：裝備庫存悲觀鎖扣減、款項核銷連動、報名取消}
    CheckMulti -->|是| UseRPC[強制使用 Supabase RPC<br/>確保 PostgreSQL 交易原子性與 FOR UPDATE 行鎖定]
    CheckMulti -->|否| CheckDirect{純單表查詢或欄位更新？<br/>如：更新個資、裝備文字規格更動}
    CheckDirect -->|是| DirectWrite[直接透過 supabaseClient.from().update()<br/>耗時 < 30ms，零轉址無跨域延遲]
```

---

## 2. 三大核心防禦與強制規範

### (1) 雙向觸發器必備防遞迴守衛 (Anti-Recursion Guard)
所有在關聯資料表之間進行雙向同步或連動的 PostgreSQL 觸發器函式（例如 `members` 與 `officers` 互相同步，或 `members` 與 `loans` 姓名同步），**必須在函式第一行加上防遞迴檢查**：

```sql
CREATE OR REPLACE FUNCTION public.sync_member_to_officer()
RETURNS TRIGGER AS $$
BEGIN
    -- 強制防護：防止相互觸發引發無窮遞迴
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- 同步邏輯 ...
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
> [!CAUTION]
> 遺漏 `IF pg_trigger_depth() > 1` 會直接引發 PostgreSQL `ERROR 54001: stack depth limit exceeded`，導致整個前端交易中斷卡死。

### (2) Enum 嚴格型別轉換 (Explicit Enum Casting)
PostgreSQL 在處理自訂 Enum 類型時，嚴禁傳入不符合列舉定義之純字串。若由 RPC 或純 SQL 更新，**必須明確轉型或依賴專案既有之隱式轉型函式**：

專案主要之自訂 Enum 包含：
- **`event_signup_status_enum`**：
  - `'正取 Confirmed'`
  - `'正取（已繳費）Confirmed (Paid)'`
  - `'備取 Waitlisted'`
  - `'備取（有意願）Waitlisted (Interested)'`
  - `'審核中 Checking'`
  - `'已取消 Cancelled'`
- **`payment_status_enum`**：
  - `'已繳費 Paid'`
  - `'待確認 Checking'`
  - `'未繳費 Unpaid'`
- **`equipment_category`**：
  - `'睡眠系統'`, `'背負系統'`, `'炊事系統'`, `'照明通訊'`, `'攀登技術'`, `'行進安全'`, `'其他裝備'`

> [!TIP]
> 專案在資料庫層設有隱式型別轉換函式 `text_to_payment_status_enum` 與 `text_to_event_signup_status_enum`，在更新時仍建議明確使用 `::payment_status_enum` 或 `::event_signup_status_enum` 以維護最高可讀性與穩定性。

### (3) 透明報錯與錯誤處理 (No Hidden Errors)
在 PL/pgSQL 函式中發生條件不符時，一律拋出具體、有意義的錯誤訊息，不可靜默略過：

```sql
IF NOT FOUND THEN
    RAISE EXCEPTION '找不到指定之品項代碼 (equipment_id: %)', v_equip_id;
END IF;
```

---

## 3. 核心 RPC 清單與參考對照

專案現有之核心 RPC 檔案均位於 `supabase/` 目錄：

| RPC 函式名稱 | 對應 SQL 檔案 | 核心職責 |
| :--- | :--- | :--- |
| `submit_equipment_loan_rpc` | [fix_equipment_loan_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_equipment_loan_rpc.sql) | 悲觀鎖扣減裝備庫存、計算天數租金折扣、建立主單與細項 |
| `cancel_equipment_loan_rpc` | [fix_equipment_loan_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/fix_equipment_loan_rpc.sql) | 取消租借訂單、原子釋放歸還庫存、設定退款旗標 |
| `cancel_event_signup_rpc` | [cancel_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/cancel_rpc.sql) | 活動取消報名、退款標註處理 |
| `verify_payment_by_token` | [verify_payment_rpc.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/verify_payment_rpc.sql) | 免登入單鍵核銷：校驗 md5 密鑰並原子更新繳費狀態 |
| `sync_member_officer` | [member_officer_sync.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/member_officer_sync.sql) | 確保幹部表與成員基本資料即時連動 (具備防遞迴守衛) |

---

## 4. 資料庫欄位結構與字典查閱

詳細之資料表關聯、欄位說明與索引請直接查閱：
- [SCHEMA_DICTIONARY.md](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/SCHEMA_DICTIONARY.md)
- [schema.sql](file:///Users/brianhung/Documents/OfficialLINEAccount/supabase/schema.sql)

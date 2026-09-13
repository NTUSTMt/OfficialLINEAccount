-- ==============================================================================
-- 🏔️ 台科登山社社團系統：Supabase 狀態與繳費狀態 ENUM 下拉選單遷移腳本
-- 檔案：supabase/update_status_enums.sql
-- 目的：將 event_signups.status 與各表 payment_status 升級為 PostgreSQL ENUM 型別，
--       使 Supabase Table Editor 自動渲染為標準下拉選單。
-- ==============================================================================

-- 1. 建立 event_signups 專屬的審核狀態 ENUM 型別
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_signup_status_enum') THEN
        CREATE TYPE event_signup_status_enum AS ENUM (
            '正取 Confirmed',
            '正取（已繳費）Confirmed (Paid)',
            '備取 Waitlisted',
            '備取（有意願）Waitlisted (Interested)',
            '審核中 Checking',
            '已取消 Cancelled'
        );
    END IF;
END $$;

-- 2. 建立全域通用的繳費狀態 ENUM 型別
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
            '已繳費 Paid',
            '待確認 Checking',
            '未繳費 Unpaid'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. 欄位資料正規化與相容性清洗 (避免型別轉換失敗)
-- ------------------------------------------------------------------------------

-- (A) 清洗 event_signups.status 既有資料
UPDATE event_signups
SET status = CASE
    WHEN status LIKE '%正取%已繳費%' OR status LIKE '%Confirmed%Paid%' THEN '正取（已繳費）Confirmed (Paid)'
    WHEN status LIKE '%正取%' OR status LIKE '%Confirmed%' THEN '正取 Confirmed'
    WHEN status LIKE '%備取%有意願%' OR status LIKE '%Waitlisted%Interested%' THEN '備取（有意願）Waitlisted (Interested)'
    WHEN status LIKE '%備取%' OR status LIKE '%Waitlisted%' THEN '備取 Waitlisted'
    WHEN status LIKE '%取消%' OR status LIKE '%Cancelled%' THEN '已取消 Cancelled'
    ELSE '審核中 Checking'
END
WHERE status IS NOT NULL;

-- 確保預設值先卸除，以便更改型別
ALTER TABLE event_signups ALTER COLUMN status DROP DEFAULT;

-- 轉型 event_signups.status 為 ENUM 型別
ALTER TABLE event_signups 
    ALTER COLUMN status TYPE event_signup_status_enum 
    USING status::event_signup_status_enum;

-- 重新賦予 ENUM 預設值
ALTER TABLE event_signups ALTER COLUMN status SET DEFAULT '審核中 Checking'::event_signup_status_enum;


-- (B) 確保 event_signups 具備 payment_status 欄位，並轉型為 ENUM
ALTER TABLE event_signups ADD COLUMN IF NOT EXISTS payment_status TEXT;

UPDATE event_signups
SET payment_status = CASE
    WHEN payment_status LIKE '%已繳費%' OR payment_status LIKE '%Paid%' THEN '已繳費 Paid'
    WHEN payment_status LIKE '%待確認%' OR payment_status LIKE '%Checking%' THEN '待確認 Checking'
    ELSE '未繳費 Unpaid'
END;

ALTER TABLE event_signups ALTER COLUMN payment_status DROP DEFAULT;

ALTER TABLE event_signups 
    ALTER COLUMN payment_status TYPE payment_status_enum 
    USING payment_status::payment_status_enum;

ALTER TABLE event_signups ALTER COLUMN payment_status SET DEFAULT '未繳費 Unpaid'::payment_status_enum;


-- (C) 清洗並轉型 loans.payment_status 為 ENUM
UPDATE loans
SET payment_status = CASE
    WHEN payment_status LIKE '%已繳費%' OR payment_status LIKE '%Paid%' THEN '已繳費 Paid'
    WHEN payment_status LIKE '%待確認%' OR payment_status LIKE '%Checking%' THEN '待確認 Checking'
    ELSE '未繳費 Unpaid'
END;

ALTER TABLE loans ALTER COLUMN payment_status DROP DEFAULT;

ALTER TABLE loans 
    ALTER COLUMN payment_status TYPE payment_status_enum 
    USING payment_status::payment_status_enum;

ALTER TABLE loans ALTER COLUMN payment_status SET DEFAULT '未繳費 Unpaid'::payment_status_enum;


-- (D) 清洗並轉型 members.payment_status 為 ENUM
UPDATE members
SET payment_status = CASE
    WHEN payment_status LIKE '%已繳費%' OR payment_status LIKE '%Paid%' THEN '已繳費 Paid'
    WHEN payment_status LIKE '%待確認%' OR payment_status LIKE '%Checking%' THEN '待確認 Checking'
    ELSE '未繳費 Unpaid'
END;

ALTER TABLE members ALTER COLUMN payment_status DROP DEFAULT;

ALTER TABLE members 
    ALTER COLUMN payment_status TYPE payment_status_enum 
    USING payment_status::payment_status_enum;

ALTER TABLE members ALTER COLUMN payment_status SET DEFAULT '未繳費 Unpaid'::payment_status_enum;

-- 4. 驗證檢視
SELECT 'event_signups.status ENUM 套用成功' AS verification, count(*) FROM event_signups;
SELECT 'event_signups.payment_status ENUM 套用成功' AS verification, count(*) FROM event_signups;
SELECT 'loans.payment_status ENUM 套用成功' AS verification, count(*) FROM loans;
SELECT 'members.payment_status ENUM 套用成功' AS verification, count(*) FROM members;

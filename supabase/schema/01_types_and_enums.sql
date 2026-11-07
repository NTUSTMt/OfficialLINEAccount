-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 01 - 型別、列舉與通用觸發防護 (01_types_and_enums.sql)
-- ==============================================================================

-- 1. 啟用 PostgreSQL 核心擴充套件
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. 通用時間戳記自動更新函式 (updated_at)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. 自訂列舉型別 (PostgreSQL Custom ENUM Types)
-- ------------------------------------------------------------------------------

-- 3.1 活動報名狀態列舉 (event_signup_status_enum)
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

-- 3.2 繳費狀態列舉 (payment_status_enum)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE TYPE payment_status_enum AS ENUM (
            '已繳費 Paid',
            '待確認 Checking',
            '未繳費 Unpaid'
        );
    END IF;
END $$;

-- 3.3 裝備分類列舉 (equipment_category)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_category') THEN
        CREATE TYPE equipment_category AS ENUM (
            '睡眠系統',
            '背負系統',
            '炊事系統',
            '照明通訊',
            '攀登技術',
            '行進安全',
            '其他裝備'
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. 型別隱式安全轉換器 (Safe CAST Functions)
-- ------------------------------------------------------------------------------

-- 4.1 TEXT 轉 payment_status_enum 隱式轉換器
-- 注意：必須優先判定「未繳費 Unpaid」，避免 Unpaid 因包含 "paid" 子字串而被誤判為「已繳費 Paid」
CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val TEXT)
RETURNS payment_status_enum
LANGUAGE plpgsql
IMMUTABLE
AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' OR val LIKE '%未繳費%' OR val LIKE '%Unpaid%' THEN
        RETURN '未繳費 Unpaid'::payment_status_enum;
    ELSIF val LIKE '%已繳費%' OR val = 'Paid' OR val LIKE '%已繳費 Paid%' THEN
        RETURN '已繳費 Paid'::payment_status_enum;
    ELSIF val LIKE '%待確認%' OR val LIKE '%Checking%' THEN
        RETURN '待確認 Checking'::payment_status_enum;
    ELSE
        RETURN '未繳費 Unpaid'::payment_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '未繳費 Unpaid'::payment_status_enum;
END;
$cast$;

DROP CAST IF EXISTS (TEXT AS payment_status_enum);
CREATE CAST (TEXT AS payment_status_enum)
WITH FUNCTION text_to_payment_status_enum(TEXT) AS IMPLICIT;

-- 4.2 TEXT 轉 event_signup_status_enum 隱式轉換器
CREATE OR REPLACE FUNCTION text_to_event_signup_status_enum(val TEXT)
RETURNS event_signup_status_enum
LANGUAGE plpgsql
IMMUTABLE
AS $cast$
BEGIN
    IF val IS NULL OR trim(val) = '' OR val LIKE '%審核中%' OR val LIKE '%Checking%' THEN
        RETURN '審核中 Checking'::event_signup_status_enum;
    ELSIF val LIKE '%正取（已繳費）%' OR val LIKE '%Confirmed (Paid)%' THEN
        RETURN '正取（已繳費）Confirmed (Paid)'::event_signup_status_enum;
    ELSIF val LIKE '%正取%' OR val LIKE '%Confirmed%' THEN
        RETURN '正取 Confirmed'::event_signup_status_enum;
    ELSIF val LIKE '%備取（有意願）%' OR val LIKE '%Waitlisted (Interested)%' THEN
        RETURN '備取（有意願）Waitlisted (Interested)'::event_signup_status_enum;
    ELSIF val LIKE '%備取%' OR val LIKE '%Waitlisted%' THEN
        RETURN '備取 Waitlisted'::event_signup_status_enum;
    ELSIF val LIKE '%取消%' OR val LIKE '%Cancelled%' THEN
        RETURN '已取消 Cancelled'::event_signup_status_enum;
    ELSE
        RETURN '審核中 Checking'::event_signup_status_enum;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN '審核中 Checking'::event_signup_status_enum;
END;
$cast$;

DROP CAST IF EXISTS (TEXT AS event_signup_status_enum);
CREATE CAST (TEXT AS event_signup_status_enum)
WITH FUNCTION text_to_event_signup_status_enum(TEXT) AS IMPLICIT;

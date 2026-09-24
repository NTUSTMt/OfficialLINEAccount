-- ==============================================================================
-- 國立臺灣科技大學登山社：電腦版幹部後台資安 RLS 回滾腳本
-- 檔案：supabase/rollback_desktop_admin_security.sql
-- 目的：若電腦版上線遭遇突發問題，可一鍵回復資料庫政策至原狀
-- ==============================================================================

-- 1. 回滾 payments 表 RLS
DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
DROP POLICY IF EXISTS "Members can read own payments" ON payments;

-- 2. 回滾 loan_items 表 RLS
DROP POLICY IF EXISTS "Officers can manage all loan items" ON loan_items;
DROP POLICY IF EXISTS "Members can read own loan items" ON loan_items;

-- 3. 回滾 loans 表 RLS
DROP POLICY IF EXISTS "Officers can manage all loans" ON loans;
DROP POLICY IF EXISTS "Members can read own loans" ON loans;

-- 4. 回滾 event_signups 表 RLS
DROP POLICY IF EXISTS "Officers can manage all signups" ON event_signups;
DROP POLICY IF EXISTS "Members can read own signups" ON event_signups;
DROP POLICY IF EXISTS "Members can insert own signups" ON event_signups;
DROP POLICY IF EXISTS "Members can cancel own signups" ON event_signups;

-- 5. 回滾 members 表 RLS
DROP POLICY IF EXISTS "Officers can read all members" ON members;
DROP POLICY IF EXISTS "Members can read own data" ON members;
DROP POLICY IF EXISTS "Officers can update all members" ON members;
DROP POLICY IF EXISTS "Members can update own profile" ON members;

-- 6. 移除 audit_logs 表
DROP TABLE IF EXISTS audit_logs CASCADE;

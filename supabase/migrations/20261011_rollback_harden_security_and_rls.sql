-- ==============================================================================
-- Rollback Migration: 20261011_rollback_harden_security_and_rls.sql
-- 目的：若需回滾 20261011_harden_security_and_rls.sql 之異動，可執行此腳本
-- ==============================================================================

-- 1. 恢復 RPC 執行權限予 anon
GRANT EXECUTE ON FUNCTION is_officer(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_members_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_member_records_rpc(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_member_rpc(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) TO anon, authenticated, service_role;

-- 2. 恢復 sync_queue 寫入政策
DROP POLICY IF EXISTS "Allow insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow insert to sync_queue" ON sync_queue
    FOR INSERT WITH CHECK (true);

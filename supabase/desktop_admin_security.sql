-- ==============================================================================
-- 國立臺灣科技大學登山社：電腦版幹部後台資安強化與 RLS 權限遷移腳本
-- 檔案：supabase/desktop_admin_security.sql
-- 目的：
-- 1. 建立操作與登入稽核日誌表 (audit_logs)
-- 2. 強化 members, event_signups, loans, loan_items, payments 之 RLS 政策
-- 3. 確保幹部 (is_officer claim) 具備完整存取權，一般社員僅可存取自身資料
-- 4. 嚴格維持 equipments 與 events 公開讀取政策，保障手機 LIFF 首屏秒開
-- ==============================================================================

-- 1. 建立稽核日誌表 (audit_logs)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access audit" ON audit_logs;
CREATE POLICY "Service role full access audit" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated insert audit" ON audit_logs;
CREATE POLICY "Authenticated insert audit" ON audit_logs
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Officers read audit" ON audit_logs;
CREATE POLICY "Officers read audit" ON audit_logs
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

-- 2. members 表 RLS 政策強化
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access members" ON members;
CREATE POLICY "Service role full access members" ON members
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can read all members" ON members;
CREATE POLICY "Officers can read all members" ON members
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own data" ON members;
CREATE POLICY "Members can read own data" ON members
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Officers can update all members" ON members;
CREATE POLICY "Officers can update all members" ON members
    FOR UPDATE TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can update own profile" ON members;
CREATE POLICY "Members can update own profile" ON members
    FOR UPDATE TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

-- 3. event_signups 表 RLS 政策強化
ALTER TABLE event_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access signups" ON event_signups;
CREATE POLICY "Service role full access signups" ON event_signups
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all signups" ON event_signups;
CREATE POLICY "Officers can manage all signups" ON event_signups
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own signups" ON event_signups;
CREATE POLICY "Members can read own signups" ON event_signups
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can insert own signups" ON event_signups;
CREATE POLICY "Members can insert own signups" ON event_signups
    FOR INSERT TO authenticated
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "Members can cancel own signups" ON event_signups;
CREATE POLICY "Members can cancel own signups" ON event_signups
    FOR UPDATE TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub')
    WITH CHECK (line_user_id = auth.jwt() ->> 'sub');

-- 4. loans 表 RLS 政策強化
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access loans" ON loans;
CREATE POLICY "Service role full access loans" ON loans
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all loans" ON loans;
CREATE POLICY "Officers can manage all loans" ON loans
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own loans" ON loans;
CREATE POLICY "Members can read own loans" ON loans
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

-- 5. loan_items 表 RLS 政策強化
ALTER TABLE loan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access loan_items" ON loan_items;
CREATE POLICY "Service role full access loan_items" ON loan_items
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all loan items" ON loan_items;
CREATE POLICY "Officers can manage all loan items" ON loan_items
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own loan items" ON loan_items;
CREATE POLICY "Members can read own loan items" ON loan_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM loans
            WHERE loans.id = loan_items.loan_id
              AND loans.line_user_id = auth.jwt() ->> 'sub'
        )
    );

-- 6. payments 表 RLS 政策強化
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access payments" ON payments;
CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers can manage all payments" ON payments;
CREATE POLICY "Officers can manage all payments" ON payments
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

DROP POLICY IF EXISTS "Members can read own payments" ON payments;
CREATE POLICY "Members can read own payments" ON payments
    FOR SELECT TO authenticated
    USING (line_user_id = auth.jwt() ->> 'sub');

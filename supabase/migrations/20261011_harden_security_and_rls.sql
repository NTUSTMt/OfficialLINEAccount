-- ==============================================================================
-- Migration: 20261011_harden_security_and_rls.sql
-- 目的：修復資安稽核漏洞 (C-4, H-5, H-7, H-9, L-8)
-- 包含：
-- 1. 加固 is_officer 函式，防範未經身分驗證之匿名身分偽冒 (Anti-Spoofing Guard)
-- 2. 撤銷所有幹部管理與敏感 RPC 函式對 anon 角色的 EXECUTE 授權，僅限 authenticated 與 service_role
-- 3. 加固 update_equipment_images RPC：固定 search_path = public 並配置 is_officer 守衛
-- 4. 收緊 sync_queue RLS INSERT 政策至 authenticated，阻斷匿名垃圾注入
-- ==============================================================================

-- 1. 加固 is_officer 函式
CREATE OR REPLACE FUNCTION is_officer(p_line_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    -- 1. 服務端角色 (service_role) 具備完整管理權限
    IF auth.role() = 'service_role' THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' THEN
            RETURN EXISTS (
                SELECT 1 FROM officers WHERE line_user_id = trim(p_line_user_id)
                UNION
                SELECT 1 FROM members WHERE line_user_id = trim(p_line_user_id) AND (is_officer = TRUE OR officer_role IS NOT NULL)
            );
        END IF;
        RETURN TRUE;
    END IF;

    -- 2. 提取 JWT 宣告 (若呼叫者持有 Supabase Auth JWT)
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 3. 嚴格阻絕匿名呼叫與偽冒 (Anti-Spoofing & Unauthenticated Rejection)
    -- 若呼叫者缺少有效 JWT 宣告，禁止存取幹部權限，防範匿名傳入幹部 ID 進行偽冒
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN FALSE;
    END IF;

    -- 若持有合法幹部 JWT 且未指定 ID 或 ID 為本人，直接核准
    IF v_jwt_officer IS TRUE THEN
        IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' OR trim(p_line_user_id) = v_jwt_sub THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- 若持有非幹部 JWT 但意圖傳入他人幹部 ID 進行偽冒，直接拒絕 (Anti-Spoofing)
    IF v_jwt_officer IS NOT TRUE OR (p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub) THEN
        RETURN FALSE;
    END IF;

    v_target_id := trim(v_jwt_sub);
    IF v_target_id = '' OR v_target_id = 'TEST_USER_ID' THEN
        RETURN FALSE;
    END IF;

    -- 4. 雙軌資料表查核
    RETURN EXISTS (
        SELECT 1 FROM officers WHERE line_user_id = v_target_id
        UNION
        SELECT 1 FROM members WHERE line_user_id = v_target_id AND (is_officer = TRUE OR officer_role IS NOT NULL)
    );
END;
$$;

-- 2. 撤銷所有幹部 RPC 之 anon 權限，授予 authenticated 與 service_role
REVOKE EXECUTE ON FUNCTION is_officer(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION is_officer(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_members_rpc(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_members_rpc(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_member_records_rpc(TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_member_records_rpc(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_admin_member_rpc(TEXT, TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_admin_member_rpc(TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_signup_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 3. 加固 update_equipment_images RPC
CREATE OR REPLACE FUNCTION update_equipment_images(
    p_equip_id TEXT,
    p_images JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_officer(auth.jwt() ->> 'sub') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied: 權限不足，非幹部無法變更裝備圖片');
    END IF;

    UPDATE equipments
    SET images = p_images,
        updated_at = NOW()
    WHERE id = p_equip_id;

    RETURN jsonb_build_object('success', true, 'id', p_equip_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) TO authenticated, service_role;

-- 4. 收緊 sync_queue RLS
DROP POLICY IF EXISTS "Allow insert to sync_queue" ON sync_queue;
CREATE POLICY "Allow insert to sync_queue" ON sync_queue
    FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated');

-- ==============================================================================
-- Migration: 20261011_fix_get_member_profile_null_on_no_jwt.sql
-- 目的：修復「資料填寫」頁空白問題 (JWT Race Condition Fix)
--
-- 根本原因：
--   phase2 安全加固後，get_member_profile 在無 JWT 時回傳 error object 而非 NULL，
--   導致前端 fetchMemberProfileFromSupabase 拿到 null 且不重試，
--   使得資料填寫頁載入時（JWT 尚未從 line-auth 回來）看不到任何已填資料。
--
-- 修復策略：
--   1. 無 JWT 時回傳 NULL（而非 error），讓前端等 JWT 就緒後重試
--   2. IDOR/BOLA 守衛保留：有 JWT 但試圖讀取他人資料仍回傳 Forbidden error
--   3. 匿名安全由 REVOKE anon 在 RPC 層把關，函式本身無需額外 error 訊號
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_member_profile(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member members%ROWTYPE;
    v_jwt_sub TEXT;
    v_jwt_officer BOOLEAN;
    v_target_id TEXT;
BEGIN
    BEGIN
        v_jwt_sub := auth.jwt() ->> 'sub';
        v_jwt_officer := (auth.jwt() ->> 'is_officer')::boolean;
    EXCEPTION WHEN OTHERS THEN
        v_jwt_sub := NULL;
        v_jwt_officer := NULL;
    END;

    -- 無 JWT：回傳 NULL（而非 error），前端等 JWT 就緒後重試
    -- 匿名安全守衛由 REVOKE anon EXECUTE 在呼叫層把關
    IF v_jwt_sub IS NULL OR trim(v_jwt_sub) = '' THEN
        RETURN NULL;
    END IF;

    -- IDOR/BOLA 守衛：非幹部禁止讀取他人資料
    IF v_jwt_officer IS NOT TRUE THEN
        IF p_line_user_id IS NOT NULL AND trim(p_line_user_id) != '' AND trim(p_line_user_id) != v_jwt_sub THEN
            RETURN jsonb_build_object('error', 'Forbidden: Identity mismatch (禁止越權讀取他人個資)');
        END IF;
        v_target_id := v_jwt_sub;
    ELSE
        v_target_id := COALESCE(NULLIF(trim(p_line_user_id), ''), v_jwt_sub);
    END IF;

    IF v_target_id IS NULL OR v_target_id = '' OR v_target_id = 'TEST_USER_ID' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = v_target_id;
    IF FOUND THEN
        RETURN to_jsonb(v_member);
    ELSE
        RETURN NULL;
    END IF;
END;
$$;

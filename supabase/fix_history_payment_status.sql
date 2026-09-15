-- ==============================================================================
-- 台科登山社社團系統 (NTUST Mountaineering Club System)
-- 繳費狀態標準化為「已核銷 Confirmed」與歷史對帳 RPC 修正 (fix_history_payment_status.sql)
-- 說明：請至 Supabase 控制台 > SQL Editor 執行此腳本
-- ==============================================================================

-- 1. 統一清洗歷史舊稱：將「已確認無誤 / 已確認 / 已核對」全數統一為標準值「已核銷 Confirmed」
UPDATE payments
SET status = '已核銷 Confirmed',
    updated_at = NOW()
WHERE status IN ('已確認無誤', '已確認', '已核對', '已繳費');

-- 2. 重新定義個人歷史繳費紀錄 RPC (get_my_payment_history)
-- 確保「已核銷 Confirmed」紀錄被 100% 正確計入個人累計支出 (totalSpent)
CREATE OR REPLACE FUNCTION get_my_payment_history(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_history JSONB := '[]'::jsonb;
    v_total_spent INTEGER := 0;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'totalSpent', 0,
            'history', '[]'::jsonb
        );
    END IF;

    -- 查詢該用戶之所有繳費紀錄並按時間降冪排序
    SELECT 
        COALESCE(jsonb_agg(h), '[]'::jsonb),
        COALESCE(SUM(
            CASE 
                WHEN (status::text LIKE '%已核銷%' OR status::text LIKE '%Confirmed%' OR status::text LIKE '%已確認%' OR status::text LIKE '%已核對%' OR status::text LIKE '%已繳%' OR status::text = 'Paid')
                     AND status::text NOT LIKE '%待確認%' AND status::text NOT LIKE '%待核對%' AND status::text NOT LIKE '%Checking%'
                THEN display_amount 
                ELSE 0 
            END
        ), 0)
    INTO v_history, v_total_spent
    FROM (
        SELECT jsonb_build_object(
            'id', id,
            'date', to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'),
            'type', CASE 
                WHEN type ILIKE '%社籍%' OR type ILIKE '%社費%' OR type ILIKE '%Membership%' THEN '社費'
                WHEN type ILIKE '%活動%' OR type ILIKE '%登山%' OR type ILIKE '%act_%' THEN '活動'
                WHEN type ILIKE '%裝備%' OR type ILIKE '%租用%' OR type ILIKE '%eq_%' THEN '裝備'
                ELSE '全部'
            END,
            'title', COALESCE(type, '未命名項目'),
            'amount', display_amount,
            'name', COALESCE(name, ''),
            'last5Digits', COALESCE(bank_last5, ''),
            'note', COALESCE(officer_notes, ''),
            'status', COALESCE(status, '待確認 Checking')
        ) AS h,
        display_amount,
        status
        FROM (
            SELECT 
                id,
                created_at,
                type,
                name,
                bank_last5,
                officer_notes,
                status,
                COALESCE(amount, 0) AS display_amount
            FROM payments
            WHERE line_user_id = p_line_user_id
        ) sub
        ORDER BY created_at DESC
    ) t;

    RETURN jsonb_build_object(
        'totalSpent', v_total_spent,
        'history', v_history
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_payment_history(TEXT) TO anon, authenticated, service_role;

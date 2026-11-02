-- ==============================================================================
-- 專案：台科登山社社團系統 (NTUST Mountaineering Club System)
-- 檔案：supabase/migrations/20261021_fix_payment_status_unpaid_precedence.sql
-- 說明：修復繳費狀態「未繳費 Unpaid」因包含 "paid" 子字串而被誤判為「已繳費 Paid」之優先權問題
-- ==============================================================================

-- 1. 確保 text_to_payment_status_enum 轉型時優先判定 Unpaid
CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val text)
RETURNS payment_status_enum AS $cast$
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
END;
$cast$ LANGUAGE plpgsql IMMUTABLE;

-- 2. 重建 get_admin_event_signups_rpc，確保 payStatus 正確將 Unpaid 歸類為未繳費
CREATE OR REPLACE FUNCTION get_admin_event_signups_rpc(
    p_officer_line_user_id TEXT,
    p_event_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_signups JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'message', '權限不足，僅限登山社幹部查閱報名名單！',
            'signups', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_signups
    FROM (
        SELECT jsonb_build_object(
            'rowNumber', ROW_NUMBER() OVER (ORDER BY s.created_at ASC),
            'signupCode', s.id,
            'id', s.id,
            'userId', s.line_user_id,
            'lineUserId', s.line_user_id,
            'name', COALESCE(s.name, m.name, '未知報名者'),
            'gender', COALESCE(m.gender, ''),
            'phone', COALESCE(m.phone, ''),
            'lineId', COALESCE(m.line_id, ''),
            'realLineId', COALESCE(m.line_id, ''),
            'email', COALESCE(m.email, ''),
            'address', COALESCE(m.address, ''),
            'birthday', COALESCE(m.birthday, ''),
            'idNumber', COALESCE(m.id_card, ''),
            'idCard', COALESCE(m.id_card, ''),
            'emerName', COALESCE(m.emergency_contact_name, ''),
            'emerRel', COALESCE(m.emergency_contact_rel, ''),
            'emerPhone', COALESCE(m.emergency_contact_phone, ''),
            'emerAddr', COALESCE(m.emergency_contact_address, ''),
            'emergencyContact', CASE 
                WHEN m.emergency_contact_name IS NOT NULL AND m.emergency_contact_name != '' THEN
                    m.emergency_contact_name || ' (' || COALESCE(m.emergency_contact_rel, '未填關係') || ') ' || COALESCE(m.emergency_contact_phone, '')
                ELSE '未填寫'
            END,
            'experience', COALESCE(m.outdoor_experience, ''),
            'climbingExp', COALESCE(m.outdoor_experience, ''),
            'fitnessTest', COALESCE(m.fitness_desc, ''),
            'fitnessDesc', COALESCE(m.fitness_desc, ''),
            'strengthProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'fitnessProof', CASE 
                WHEN jsonb_typeof(m.proof_urls) = 'array' THEN 
                    (SELECT string_agg(elem::text, E'\n') FROM jsonb_array_elements_text(m.proof_urls) AS elem)
                ELSE COALESCE(m.proof_urls#>>'{}', '')
            END,
            'department', COALESCE(m.department, ''),
            'studentId', COALESCE(m.student_id, ''),
            'medicalHistory', COALESCE(m.medical_history, ''),
            'isOfficial', CASE WHEN COALESCE(m.is_official_member, FALSE) THEN '是' ELSE '否' END,
            'reviewResult', s.status,
            'notifyStatus', COALESCE(s.notification_status, ''),
            'payStatus', CASE 
                WHEN COALESCE(s.payment_status::text, '') LIKE '%未繳費%' OR COALESCE(s.payment_status::text, '') LIKE '%Unpaid%' THEN '未繳費'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%已繳費%' OR COALESCE(s.payment_status::text, '') = 'Paid' OR COALESCE(s.payment_status::text, '') LIKE '%已繳費 Paid%' THEN '已繳費 Paid'
                WHEN COALESCE(s.payment_status::text, '') LIKE '%待確認%' OR COALESCE(s.payment_status::text, '') LIKE '%Checking%' THEN '待確認 Checking'
                WHEN s.status::text LIKE '%已繳費%' OR s.status::text LIKE '%Paid%' THEN '已繳費 Paid'
                ELSE '未繳費'
            END,
            'remark', COALESCE(s.notes, '')
        ) AS item
        FROM event_signups s
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE s.event_id = trim(p_event_id)
        ORDER BY s.created_at ASC
    ) sub;

    RETURN jsonb_build_object(
        'status', 'success',
        'signups', v_signups
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_event_signups_rpc(TEXT, TEXT) TO authenticated, service_role;

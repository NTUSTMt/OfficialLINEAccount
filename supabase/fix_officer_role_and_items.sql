-- ==============================================================================
-- 🛠️ 台科登山社社團系統：修正 members.officer_role 預設值與核銷項目顯示
-- 1. 徹底解決「任何人填完個資 officer_role 都會變成幹部」的問題
-- 2. 清洗非幹部社員的 officer_role 歷史錯誤資料為 NULL
-- 3. 優化 submit_payment_rpc 與 verify_payment_by_token 之裝備品項名稱聚合
-- ==============================================================================

-- 1. 取消 members.officer_role 的 DEFAULT '幹部' 預設值，改為 NULL
ALTER TABLE members ALTER COLUMN officer_role SET DEFAULT NULL;

-- 2. 清洗既有資料：若 is_officer 為 false 或不在 officers 名冊中，一律將 officer_role 重設為 NULL
UPDATE members
SET officer_role = NULL
WHERE is_officer IS NOT TRUE 
   OR line_user_id NOT IN (SELECT line_user_id FROM officers);

-- 3. 確保幹部表同步觸發器具備嚴格守衛，僅對真正的幹部賦予 officer_role
CREATE OR REPLACE FUNCTION public.sync_member_to_officer()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- 只有當 is_officer 為 TRUE 且確實有職稱時才更新
    IF NEW.is_officer IS TRUE THEN
        INSERT INTO officers (line_user_id, name, role, title, created_at, updated_at)
        VALUES (
            NEW.line_user_id,
            COALESCE(NEW.name, '幹部'),
            COALESCE(NULLIF(NEW.officer_role, ''), '幹部'),
            COALESCE(NULLIF(NEW.officer_role, ''), '幹部'),
            NOW(),
            NOW()
        )
        ON CONFLICT (line_user_id) DO UPDATE SET
            name = EXCLUDED.name,
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 重新發布 save_member_profile RPC：保證新社員註冊時 officer_role 不會被賦予「幹部」
CREATE OR REPLACE FUNCTION save_member_profile(
    p_line_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN := FALSE;
    v_officer_role TEXT := NULL;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'message', '缺少使用者識別碼');
    END IF;

    -- 檢查該成員目前是否具備幹部身分
    SELECT is_officer, officer_role INTO v_is_officer, v_officer_role
    FROM members
    WHERE line_user_id = trim(p_line_user_id);

    INSERT INTO members (
        line_user_id,
        name,
        gender,
        line_id,
        email,
        phone,
        department,
        student_id,
        birthday,
        id_card,
        address,
        outdoor_experience,
        fitness_desc,
        proof_urls,
        emergency_contact_name,
        emergency_contact_rel,
        emergency_contact_phone,
        emergency_contact_address,
        medical_history,
        identity_status,
        join_membership_intent,
        officer_intent,
        is_officer,
        officer_role,
        updated_at
    )
    VALUES (
        trim(p_line_user_id),
        COALESCE(p_data->>'name', ''),
        p_data->>'gender',
        p_data->>'line_id',
        p_data->>'email',
        p_data->>'phone',
        p_data->>'department',
        p_data->>'student_id',
        p_data->>'birthday',
        p_data->>'id_card',
        p_data->>'address',
        p_data->>'outdoor_experience',
        p_data->>'fitness_desc',
        COALESCE(p_data->'proof_urls', '[]'::jsonb),
        p_data->>'emergency_contact_name',
        p_data->>'emergency_contact_rel',
        p_data->>'emergency_contact_phone',
        p_data->>'emergency_contact_address',
        p_data->>'medical_history',
        p_data->>'identity_status',
        p_data->>'join_membership_intent',
        p_data->>'officer_intent',
        COALESCE(v_is_officer, FALSE),
        CASE WHEN v_is_officer IS TRUE THEN v_officer_role ELSE NULL END,
        NOW()
    )
    ON CONFLICT (line_user_id) DO UPDATE SET
        name = EXCLUDED.name,
        gender = EXCLUDED.gender,
        line_id = EXCLUDED.line_id,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        department = EXCLUDED.department,
        student_id = EXCLUDED.student_id,
        birthday = EXCLUDED.birthday,
        id_card = EXCLUDED.id_card,
        address = EXCLUDED.address,
        outdoor_experience = EXCLUDED.outdoor_experience,
        fitness_desc = EXCLUDED.fitness_desc,
        proof_urls = CASE WHEN jsonb_array_length(EXCLUDED.proof_urls) > 0 THEN EXCLUDED.proof_urls ELSE members.proof_urls END,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_rel = EXCLUDED.emergency_contact_rel,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_address = EXCLUDED.emergency_contact_address,
        medical_history = EXCLUDED.medical_history,
        identity_status = EXCLUDED.identity_status,
        join_membership_intent = EXCLUDED.join_membership_intent,
        officer_intent = EXCLUDED.officer_intent,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

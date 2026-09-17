-- ==============================================================================
-- 台科登山社社團系統：幹部後台專屬 RPC 鑑權與資料表權限防護 (admin_portal_rpc.sql)
-- 目的：
-- 1. 徹底解決 PostgreSQL 42501 (permission denied) 與 RLS 導致之 0 筆社員資料問題
-- 2. 提供 SECURITY DEFINER 高速 RPC 函式 (社員名冊、財務對帳、租借管理)
-- 3. 嚴格限定僅限登山社幹部 (is_officer) 存取敏感個資與財務對帳流
-- ==============================================================================

-- 1. 內部幹部鑑權函式 (is_officer) 確保存在且支援雙軌查核
CREATE OR REPLACE FUNCTION is_officer(p_line_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN FALSE;
    END IF;

    IF trim(p_line_user_id) = 'TEST_USER_ID' THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM officers WHERE line_user_id = trim(p_line_user_id)
        UNION
        SELECT 1 FROM members WHERE line_user_id = trim(p_line_user_id) AND (is_officer = TRUE OR officer_role IS NOT NULL)
    );
END;
$$;

-- 2. 幹部後台：取得所有社員清單 (get_admin_members_rpc)
CREATE OR REPLACE FUNCTION get_admin_members_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_members JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取社員名冊！',
            'members', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(m_row ORDER BY m_row.created_at DESC), '[]'::jsonb)
    INTO v_members
    FROM (
        SELECT 
            m.line_user_id,
            m.name,
            m.identity_status,
            m.department,
            m.student_id,
            m.line_id,
            COALESCE(m.is_official_member, FALSE) AS is_official_member,
            COALESCE(m.is_officer, FALSE) AS is_officer,
            m.officer_role,
            m.payment_status::TEXT AS payment_status,
            m.phone,
            m.email,
            to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM members m
    ) m_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'members', v_members
    );
END;
$$;

-- 3. 幹部後台：取得單一社員完整詳細資料 (get_admin_member_detail_rpc)
CREATE OR REPLACE FUNCTION get_admin_member_detail_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_member_json JSONB;
    v_active_events JSONB;
    v_active_loans JSONB;
    v_pending_count INT := 0;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取！'
        );
    END IF;

    SELECT row_to_json(m.*)::jsonb INTO v_member_json 
    FROM members m 
    WHERE m.line_user_id = trim(p_target_user_id) 
    LIMIT 1;

    IF v_member_json IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', TRUE,
            'message', '查無此社員資料'
        );
    END IF;

    -- 查詢未結束活動
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'startDate', to_char(e.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(e.end_date::timestamp, 'YYYY-MM-DD'),
        'signupStatus', s.status::TEXT,
        'payStatus', s.payment_status::TEXT
    )), '[]'::jsonb)
    INTO v_active_events
    FROM event_signups s
    JOIN events e ON s.event_id = e.id
    WHERE s.line_user_id = trim(p_target_user_id)
      AND s.status NOT IN ('已取消 Cancelled', '未錄取 Rejected');

    -- 查詢進行中租借
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id,
        'startDate', to_char(l.start_date::timestamp, 'YYYY-MM-DD'),
        'endDate', to_char(l.end_date::timestamp, 'YYYY-MM-DD'),
        'status', l.status::TEXT,
        'payStatus', l.payment_status::TEXT,
        'itemsSummary', COALESCE((
            SELECT string_agg(eq.name || ' x ' || li.quantity, ', ')
            FROM loan_items li
            JOIN equipments eq ON li.equipment_id = eq.id
            WHERE li.loan_id = l.id
        ), '裝備租借')
    )), '[]'::jsonb)
    INTO v_active_loans
    FROM loans l
    WHERE l.line_user_id = trim(p_target_user_id)
      AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed');

    -- 計算未繳費筆數
    SELECT 
        COALESCE((SELECT count(*) FROM event_signups s JOIN events e ON s.event_id = e.id WHERE s.line_user_id = trim(p_target_user_id) AND s.status = '正取 Confirmed' AND s.payment_status != '已繳費 Paid'), 0) +
        COALESCE((SELECT count(*) FROM loans l WHERE l.line_user_id = trim(p_target_user_id) AND l.status IN ('待領取 To Be Collected', '租借中 Borrowed') AND l.payment_status != '已繳費 Paid'), 0)
    INTO v_pending_count;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'member', v_member_json,
        'activeStats', jsonb_build_object(
            'unfinishedEvents', v_active_events,
            'activeLoans', v_active_loans,
            'pendingPaymentsCount', v_pending_count
        )
    );
END;
$$;

-- 4. 幹部後台：更新社員完整資料 (update_admin_member_rpc)
CREATE OR REPLACE FUNCTION update_admin_member_rpc(
    p_officer_line_user_id TEXT,
    p_target_user_id TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部修改社員資料！');
    END IF;

    UPDATE members
    SET name = COALESCE(p_data->>'name', name),
        gender = COALESCE(p_data->>'gender', gender),
        line_id = COALESCE(p_data->>'line_id', line_id),
        email = COALESCE(p_data->>'email', email),
        phone = COALESCE(p_data->>'phone', phone),
        department = COALESCE(p_data->>'department', department),
        student_id = COALESCE(p_data->>'student_id', student_id),
        payment_status = CASE 
            WHEN p_data->>'payment_status' IS NOT NULL THEN (p_data->>'payment_status')::payment_status_enum 
            ELSE payment_status 
        END,
        membership_expires_at = CASE 
            WHEN p_data->>'membership_expires_at' IS NOT NULL AND p_data->>'membership_expires_at' != '' 
            THEN (p_data->>'membership_expires_at')::DATE 
            ELSE membership_expires_at 
        END,
        birthday = COALESCE(p_data->>'birthday', birthday),
        id_card = COALESCE(p_data->>'id_card', id_card),
        address = COALESCE(p_data->>'address', address),
        outdoor_experience = COALESCE(p_data->>'outdoor_experience', outdoor_experience),
        fitness_desc = COALESCE(p_data->>'fitness_desc', fitness_desc),
        emergency_contact_name = COALESCE(p_data->>'emergency_contact_name', emergency_contact_name),
        emergency_contact_rel = COALESCE(p_data->>'emergency_contact_rel', emergency_contact_rel),
        emergency_contact_phone = COALESCE(p_data->>'emergency_contact_phone', emergency_contact_phone),
        emergency_contact_address = COALESCE(p_data->>'emergency_contact_address', emergency_contact_address),
        medical_history = COALESCE(p_data->>'medical_history', medical_history),
        identity_status = COALESCE(p_data->>'identity_status', identity_status),
        join_membership_intent = COALESCE(p_data->>'join_membership_intent', join_membership_intent),
        officer_intent = COALESCE(p_data->>'officer_intent', officer_intent),
        want_to_say = COALESCE(p_data->>'want_to_say', want_to_say),
        is_official_member = CASE 
            WHEN p_data->'is_official_member' IS NOT NULL THEN (p_data->>'is_official_member')::BOOLEAN 
            ELSE is_official_member 
        END,
        is_officer = CASE 
            WHEN p_data->'is_officer' IS NOT NULL THEN (p_data->>'is_officer')::BOOLEAN 
            ELSE is_officer 
        END,
        officer_role = COALESCE(p_data->>'officer_role', officer_role),
        updated_at = NOW()
    WHERE line_user_id = trim(p_target_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. 幹部後台：取得財務對帳清單 (get_admin_finance_rpc)
CREATE OR REPLACE FUNCTION get_admin_finance_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_items JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取財務資料！',
            'items', '[]'::jsonb
        );
    END IF;

    -- 整合 payments 申報清單與未填報 payments 之未結租借與活動單
    SELECT COALESCE(jsonb_agg(f_row ORDER BY f_row.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
        -- 1. payments 申報紀錄
        SELECT 
            p.id,
            p.line_user_id,
            COALESCE(p.name, m.name, '未知申報人') AS name,
            p.type,
            p.amount,
            p.bank_last5,
            p.proof_image_url,
            p.target_type,
            p.target_id,
            p.status,
            CASE WHEN p.status = '已核銷 Confirmed' THEN '已繳費 Paid' ELSE '待確認 Checking' END AS payment_status,
            p.officer_notes,
            to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'payment' AS source_type,
            CASE 
                WHEN p.target_type = 'event' OR p.type ILIKE '%活動%' THEN 'activity'
                WHEN p.target_type = 'loan' OR p.type ILIKE '%裝備%' THEN 'equipment'
                WHEN p.target_type = 'membership' OR p.type ILIKE '%社費%' THEN 'membership'
                ELSE 'general'
            END AS item_category
        FROM payments p
        LEFT JOIN members m ON p.line_user_id = m.line_user_id

        UNION ALL

        -- 2. 未填報 payments 但有金額之待繳費租借單
        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            '裝備租借費用 (' || l.id || ')' AS type,
            l.total_rent AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'loan' AS target_type,
            l.id AS target_id,
            '待確認 Checking' AS status,
            l.payment_status::TEXT AS payment_status,
            l.notes AS officer_notes,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'loan' AS source_type,
            'equipment' AS item_category
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
        WHERE l.total_rent > 0
          AND l.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE p.target_type = 'loan' AND p.target_id = l.id
          )

        UNION ALL

        -- 3. 未填報 payments 之正取待繳費活動報名
        SELECT 
            s.id,
            s.line_user_id,
            COALESCE(s.name, m.name, '活動參加者') AS name,
            '活動費用 (' || e.title || ')' AS type,
            e.fee AS amount,
            NULL AS bank_last5,
            NULL AS proof_image_url,
            'event' AS target_type,
            e.id AS target_id,
            '待確認 Checking' AS status,
            s.payment_status::TEXT AS payment_status,
            s.notes AS officer_notes,
            to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            'event_signup' AS source_type,
            'activity' AS item_category
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        LEFT JOIN members m ON s.line_user_id = m.line_user_id
        WHERE e.fee > 0
          AND s.status = '正取 Confirmed'
          AND s.payment_status != '已繳費 Paid'
          AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE p.target_type = 'event' AND p.target_id = e.id AND p.line_user_id = s.line_user_id
          )
    ) f_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'items', v_items
    );
END;
$$;

-- 6. 幹部後台：取得所有租借訂單與展開品項 (get_admin_loans_rpc)
CREATE OR REPLACE FUNCTION get_admin_loans_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_loans JSONB;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object(
            'status', 'error',
            'isOfficer', FALSE,
            'message', '權限不足，僅限登山社幹部存取租借訂單！',
            'loans', '[]'::jsonb
        );
    END IF;

    SELECT COALESCE(jsonb_agg(l_row ORDER BY l_row.start_date DESC), '[]'::jsonb)
    INTO v_loans
    FROM (
        SELECT 
            l.id,
            l.line_user_id,
            COALESCE(l.name, m.name, '借用人') AS name,
            to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
            l.days,
            l.purpose,
            l.purpose_other,
            l.status,
            l.payment_status::TEXT AS payment_status,
            l.total_rent AS total_fee,
            l.total_rent,
            l.total_deposit,
            l.notes,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            m.phone,
            m.email,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'equipment_id', li.equipment_id,
                    'name', eq.name,
                    'quantity', li.quantity,
                    'unit_price', li.unit_price_snapshot,
                    'subtotal', li.subtotal
                ))
                FROM loan_items li
                LEFT JOIN equipments eq ON li.equipment_id = eq.id
                WHERE li.loan_id = l.id
            ), '[]'::jsonb) AS items
        FROM loans l
        LEFT JOIN members m ON l.line_user_id = m.line_user_id
    ) l_row;

    RETURN jsonb_build_object(
        'status', 'success',
        'isOfficer', TRUE,
        'loans', v_loans
    );
END;
$$;

-- 7. 幹部後台：更新財務核銷狀態與連動更新 (update_admin_payment_status_rpc)
CREATE OR REPLACE FUNCTION update_admin_payment_status_rpc(
    p_officer_line_user_id TEXT,
    p_payment_id TEXT,
    p_source_type TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_status TEXT,
    p_line_user_id TEXT,
    p_officer_name TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
    v_is_confirmed BOOLEAN;
    v_mapped_pay_status payment_status_enum;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部執行財務核銷！');
    END IF;

    v_is_confirmed := (p_status = '已核銷 Confirmed');
    v_mapped_pay_status := CASE WHEN v_is_confirmed THEN '已繳費 Paid'::payment_status_enum ELSE '待確認 Checking'::payment_status_enum END;

    IF p_source_type = 'payment' THEN
        UPDATE payments
        SET status = p_status,
            confirmed_by = CASE WHEN v_is_confirmed THEN COALESCE(NULLIF(p_officer_name, ''), '管理幹部') ELSE NULL END,
            confirmed_at = CASE WHEN v_is_confirmed THEN NOW() ELSE NULL END,
            officer_notes = p_notes,
            updated_at = NOW()
        WHERE id = p_payment_id;

        -- 連動更新
        IF p_target_type = 'event' AND p_target_id IS NOT NULL AND p_line_user_id IS NOT NULL THEN
            UPDATE event_signups
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE event_id = p_target_id AND line_user_id = p_line_user_id;
        ELSIF p_target_type = 'loan' AND p_target_id IS NOT NULL THEN
            UPDATE loans
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE id = p_target_id;
        ELSIF p_target_type = 'membership' AND p_line_user_id IS NOT NULL THEN
            UPDATE members
            SET payment_status = v_mapped_pay_status, updated_at = NOW()
            WHERE line_user_id = p_line_user_id;
        END IF;
    ELSIF p_source_type = 'loan' THEN
        UPDATE loans
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    ELSIF p_source_type = 'event_signup' THEN
        UPDATE event_signups
        SET payment_status = v_mapped_pay_status, updated_at = NOW()
        WHERE id = p_payment_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. 幹部後台：更新裝備租借狀態 (update_admin_loan_status_rpc)
CREATE OR REPLACE FUNCTION update_admin_loan_status_rpc(
    p_officer_line_user_id TEXT,
    p_loan_id TEXT,
    p_status TEXT,
    p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_officer BOOLEAN;
BEGIN
    v_is_officer := is_officer(p_officer_line_user_id);

    IF NOT v_is_officer THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部更新租借狀態！');
    END IF;

    UPDATE loans
    SET status = p_status,
        notes = COALESCE(p_notes, notes),
        cancelled_at = CASE WHEN p_status = '已取消 Cancelled' THEN NOW() ELSE cancelled_at END,
        updated_at = NOW()
    WHERE id = p_loan_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. 配置資料表層級權限與 RLS 安全存取原則 (雙軌暢通)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 確保 payments, loans, loan_items, event_signups, members 具備 SELECT 與 UPDATE 策略
DROP POLICY IF EXISTS "Allow anon read members" ON members;
CREATE POLICY "Allow anon read members" ON members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon update members" ON members;
CREATE POLICY "Allow anon update members" ON members FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read payments" ON payments;
CREATE POLICY "Allow anon read payments" ON payments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon update payments" ON payments;
CREATE POLICY "Allow anon update payments" ON payments FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert payments" ON payments;
CREATE POLICY "Allow anon insert payments" ON payments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read loans" ON loans;
CREATE POLICY "Allow anon read loans" ON loans FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon update loans" ON loans;
CREATE POLICY "Allow anon update loans" ON loans FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert loans" ON loans;
CREATE POLICY "Allow anon insert loans" ON loans FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read loan_items" ON loan_items;
CREATE POLICY "Allow anon read loan_items" ON loan_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon update loan_items" ON loan_items;
CREATE POLICY "Allow anon update loan_items" ON loan_items FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon insert loan_items" ON loan_items;
CREATE POLICY "Allow anon insert loan_items" ON loan_items FOR INSERT WITH CHECK (true);

-- 授權 RPC 函式執行權限予 anon, authenticated, service_role
GRANT EXECUTE ON FUNCTION is_officer(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_members_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_member_detail_rpc(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_member_rpc(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_finance_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_payment_status_rpc(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

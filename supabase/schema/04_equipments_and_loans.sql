-- ==============================================================================
-- 國立臺灣科技大學登山社 (NTUST Mountaineering Club)
-- Supabase 資料庫核心架構：模組 04 - 裝備庫存與租借管理 (04_equipments_and_loans.sql)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. 裝備品項資料表 (equipments) -> Google Sheets: Equipments
-- 遵循「2天基本租金 + 每日加成、社團出隊免租、社員個人5折」真實計費模型
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipments (
    id TEXT PRIMARY KEY,                                 -- 裝備代號 (如 EQ_TENT_01)
    name TEXT NOT NULL,                                  -- 裝備名稱 (如：MSR 雙人帳篷)
    category equipment_category NOT NULL DEFAULT '其他裝備', -- 裝備分類列舉
    total_qty INTEGER NOT NULL DEFAULT 0,                -- 總庫存數量
    available_qty INTEGER NOT NULL DEFAULT 0,            -- 目前剩餘可借數量
    is_borrowable BOOLEAN NOT NULL DEFAULT TRUE,         -- 是否開放借用
    price_2day INTEGER NOT NULL DEFAULT 0,               -- 2天基本租金
    price_extra_day INTEGER NOT NULL DEFAULT 0,          -- 續租每日租金 (+1天)
    status TEXT,                                         -- 裝備品況備註
    notes TEXT,                                          -- 使用注意事項與保養備註
    images JSONB DEFAULT '[]'::jsonb,                    -- 相片網址陣列 (Google Drive 直連)
    sort_order INTEGER DEFAULT 0,                        -- 顯示排序權重
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipments_category ON equipments(category);
CREATE INDEX IF NOT EXISTS idx_equipments_borrowable ON equipments(is_borrowable);

DROP TRIGGER IF EXISTS trg_equipments_updated_at ON equipments;
CREATE TRIGGER trg_equipments_updated_at
BEFORE UPDATE ON equipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 2. 裝備租借主訂單 (loans) -> Google Sheets: Loans
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,                                 -- 租借單號 (如 ORD_YYYYMMDD_XXXX)
    line_user_id TEXT NOT NULL REFERENCES members(line_user_id) ON DELETE RESTRICT,
    purpose TEXT DEFAULT '社團出隊',                     -- 租借用途 (社團出隊 / 個人使用 / 其他)
    start_date DATE NOT NULL,                            -- 預計領取日期 (YYYY-MM-DD)
    end_date DATE NOT NULL,                              -- 預計歸還日期 (YYYY-MM-DD)
    total_fee INTEGER NOT NULL DEFAULT 0,                -- 訂單總費用快照
    status TEXT NOT NULL DEFAULT '待領取 To Be Collected', -- 訂單狀態 (待領取 To Be Collected / 租借中 Borrowed / 已歸還 Returned / 已取消 Cancelled / 已取消 (待退款))
    payment_status payment_status_enum NOT NULL DEFAULT '未繳費 Unpaid', -- 租金繳納狀態
    is_official_member_snapshot BOOLEAN NOT NULL DEFAULT FALSE, -- 下單當下社員身分快照 (享5折資格快照)
    notes TEXT,                                          -- 訂單備註
    items JSONB DEFAULT '[]'::jsonb,                     -- 訂單品項與數量 JSON 快照
    name TEXT,                                           -- 借用人真實姓名
    days INTEGER NOT NULL DEFAULT 1,                     -- 租借天數
    purpose_other TEXT,                                  -- 其他用途備註
    total_deposit INTEGER DEFAULT 0,                     -- 押金總計
    total_rent INTEGER DEFAULT 0,                        -- 租金小計
    refund_needed BOOLEAN DEFAULT FALSE,                 -- 取消時是否需退款
    cancelled_at TIMESTAMPTZ,                            -- 取消時間戳記
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(line_user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_payment_status ON loans(payment_status);

DROP TRIGGER IF EXISTS trg_loans_updated_at ON loans;
CREATE TRIGGER trg_loans_updated_at
BEFORE UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. 裝備租借品項明細 (loan_items) -> Google Sheets: Loan_Records
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loan_items (
    id BIGSERIAL PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    equipment_id TEXT NOT NULL REFERENCES equipments(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_snapshot INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_items_loan_id ON loan_items(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_items_equipment_id ON loan_items(equipment_id);

-- ------------------------------------------------------------------------------
-- 4. 裝備照片安全直更 RPC (update_equipment_images)
-- 免除 GAS 跨域 302 重導向之 Load failed 阻斷
-- ------------------------------------------------------------------------------
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
    -- 幹部身分守衛
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

DROP POLICY IF EXISTS "Public read events" ON events;

-- ------------------------------------------------------------------------------
-- 5. 原子性裝備租借下單 RPC (submit_equipment_loan_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member RECORD;
    v_is_official BOOLEAN := FALSE;
    v_user_name TEXT := '未知社員';
    v_pickup_date DATE;
    v_return_date DATE;
    v_days INTEGER := 1;
    v_extra_days INTEGER := 0;
    v_purpose TEXT;
    v_other_purpose TEXT;
    v_cart JSONB;
    v_equip_id TEXT;
    v_qty INTEGER;
    v_equip RECORD;
    v_item_base INTEGER := 0;
    v_unit_price INTEGER := 0;
    v_subtotal INTEGER := 0;
    v_total_rent INTEGER := 0;
    v_total_deposit INTEGER := 0;
    v_loan_id TEXT;
    v_item_count INTEGER := 0;
    v_loan_status TEXT := '待領取 To Be Collected';
    v_loan_payment_status payment_status_enum;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    SELECT * INTO v_member FROM members WHERE line_user_id = trim(p_line_user_id);
    IF FOUND THEN
        v_user_name := COALESCE(v_member.name, '未知社員');
        IF v_member.is_official_member IS TRUE 
           OR (v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        INSERT INTO members (line_user_id, name, is_official_member, created_at, updated_at)
        VALUES (trim(p_line_user_id), '新借用人', FALSE, NOW(), NOW())
        ON CONFLICT (line_user_id) DO NOTHING;
    END IF;

    v_pickup_date := (p_details->>'pickupDate')::DATE;
    v_return_date := (p_details->>'returnDate')::DATE;
    IF v_pickup_date IS NULL OR v_return_date IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '領取與歸還日期不得為空');
    END IF;

    IF v_return_date < v_pickup_date THEN
        RETURN jsonb_build_object('status', 'error', 'message', '歸還日期不可早於領取日期');
    END IF;

    v_days := (v_return_date - v_pickup_date) + 1;
    IF v_days < 1 THEN v_days := 1; END IF;
    IF v_days > 2 THEN
        v_extra_days := v_days - 2;
    ELSE
        v_extra_days := 0;
    END IF;

    v_purpose := COALESCE(NULLIF(trim(p_details->>'purpose'), ''), '社團出隊');
    v_other_purpose := NULLIF(trim(p_details->>'otherPurpose'), '');
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) != 'object' OR v_cart = '{}'::jsonb THEN
        RETURN jsonb_build_object('status', 'error', 'message', '租借購物車清單不得為空');
    END IF;

    v_loan_id := 'ORD_' || to_char(NOW(), 'YYYYMMDD') || '_' || lpad(floor(random() * 9000 + 1000)::TEXT, 4, '0');

    FOR v_equip_id, v_qty IN SELECT key, value::INTEGER FROM jsonb_each_text(v_cart) LOOP
        IF v_qty > 0 THEN
            SELECT * INTO v_equip FROM equipments WHERE id = v_equip_id FOR UPDATE;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('status', 'error', 'message', '找不到裝備代號：' || v_equip_id);
            END IF;

            IF v_equip.available_qty < v_qty THEN
                RETURN jsonb_build_object(
                    'status', 'error',
                    'message', '裝備「' || v_equip.name || '」剩餘庫存不足 (現有: ' || v_equip.available_qty || '，欲借: ' || v_qty || ')'
                );
            END IF;

            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSE
                v_item_base := COALESCE(v_equip.price_2day, 0) + (v_extra_days * COALESCE(v_equip.price_extra_day, 0));
                IF v_is_official THEN
                    v_unit_price := ROUND(v_item_base * 0.5);
                ELSE
                    v_unit_price := v_item_base;
                END IF;
            END IF;

            v_subtotal := v_unit_price * v_qty;
            v_total_rent := v_total_rent + v_subtotal;
            v_item_count := v_item_count + 1;

            UPDATE equipments 
            SET available_qty = available_qty - v_qty,
                updated_at = NOW()
            WHERE id = v_equip_id;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內各品項數量皆為 0');
    END IF;

    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid'::payment_status_enum;
    ELSE
        v_loan_payment_status := '未繳費 Unpaid'::payment_status_enum;
    END IF;

    INSERT INTO loans (
        id,
        line_user_id,
        name,
        start_date,
        end_date,
        days,
        purpose,
        purpose_other,
        status,
        payment_status,
        total_fee,
        total_rent,
        total_deposit,
        is_official_member_snapshot,
        items,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_loan_id,
        trim(p_line_user_id),
        v_user_name,
        v_pickup_date,
        v_return_date,
        v_days,
        v_purpose,
        v_other_purpose,
        v_loan_status,
        v_loan_payment_status,
        v_total_rent,
        v_total_rent,
        v_total_deposit,
        v_is_official,
        v_cart,
        p_details->>'notes',
        NOW(),
        NOW()
    );

    FOR v_equip_id, v_qty IN SELECT key, value::INTEGER FROM jsonb_each_text(v_cart) LOOP
        IF v_qty > 0 THEN
            SELECT * INTO v_equip FROM equipments WHERE id = v_equip_id;
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSE
                v_item_base := COALESCE(v_equip.price_2day, 0) + (v_extra_days * COALESCE(v_equip.price_extra_day, 0));
                IF v_is_official THEN
                    v_unit_price := ROUND(v_item_base * 0.5);
                ELSE
                    v_unit_price := v_item_base;
                END IF;
            END IF;
            v_subtotal := v_unit_price * v_qty;

            INSERT INTO loan_items (
                loan_id,
                equipment_id,
                quantity,
                unit_price_snapshot,
                subtotal,
                created_at
            ) VALUES (
                v_loan_id,
                v_equip_id,
                v_qty,
                v_unit_price,
                v_subtotal,
                NOW()
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'message', '租借申請已成功送出！'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', '建立租借訂單失敗: ' || SQLERRM
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. 原子性取消租借訂單 RPC (cancel_equipment_loan_rpc)
-- 參數簽名與線上 100% 精準對齊：(p_line_user_id TEXT, p_loan_id TEXT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_loan_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loan loans%ROWTYPE;
    v_item RECORD;
    v_jwt_sub TEXT;
    v_is_officer BOOLEAN := FALSE;
    v_refund_needed BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR p_loan_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少必要參數');
    END IF;

    -- JWT 身分校驗
    v_jwt_sub := auth.jwt() ->> 'sub';
    v_is_officer := COALESCE((auth.jwt() ->> 'is_officer')::boolean, FALSE);

    IF auth.role() != 'service_role' THEN
        IF v_jwt_sub IS NOT NULL AND trim(v_jwt_sub) != '' THEN
            IF NOT v_is_officer AND v_jwt_sub != trim(p_line_user_id) THEN
                RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人租借單');
            END IF;
        END IF;
    END IF;

    SELECT * INTO v_loan FROM loans WHERE id = trim(p_loan_id) FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', '找不到此租借訂單 (Loan Not Found)');
    END IF;

    IF auth.role() != 'service_role' AND NOT v_is_officer AND v_loan.line_user_id != trim(p_line_user_id) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Forbidden: 禁止越權取消他人租借單');
    END IF;

    IF v_loan.status = '已取消 Cancelled' OR v_loan.status = '已取消 (待退款)' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '此訂單先前已取消，請勿重複操作');
    END IF;

    -- 釋放已扣減之裝備庫存
    FOR v_item IN SELECT equipment_id, quantity FROM loan_items WHERE loan_id = trim(p_loan_id) LOOP
        UPDATE equipments 
        SET available_qty = available_qty + v_item.quantity,
            updated_at = NOW()
        WHERE id = v_item.equipment_id;
    END LOOP;

    -- 判斷是否需退款
    IF v_loan.payment_status = '已繳費 Paid'::payment_status_enum THEN
        v_refund_needed := TRUE;
    END IF;

    UPDATE loans 
    SET status = CASE WHEN v_refund_needed THEN '已取消 (待退款)' ELSE '已取消 Cancelled' END,
        refund_needed = v_refund_needed,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = trim(p_loan_id);

    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', p_loan_id,
        'refundNeeded', v_refund_needed,
        'message', '租借訂單已成功取消，裝備庫存已歸還釋出'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', '取消作業失敗: ' || SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. 幹部端 RPC：取得全體裝備租借清單 (get_admin_loans_rpc)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_loans_rpc(p_officer_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loans JSONB;
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
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
            COALESCE(l.days, CASE WHEN l.end_date IS NOT NULL AND l.start_date IS NOT NULL THEN (l.end_date - l.start_date + 1) ELSE 1 END) AS days,
            l.purpose,
            l.purpose_other,
            l.status,
            l.payment_status::TEXT AS payment_status,
            l.total_rent AS total_fee,
            l.total_rent,
            l.total_deposit,
            l.notes,
            l.is_official_member_snapshot,
            l.refund_needed,
            to_char(l.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cancelled_at,
            to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(l.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'equipmentId', li.equipment_id,
                    'equipmentName', eq.name,
                    'quantity', li.quantity,
                    'unitPrice', li.unit_price_snapshot,
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

-- ------------------------------------------------------------------------------
-- 8. 幹部端 RPC：更新租借狀態與繳費註記 (update_admin_loan_status_rpc)
-- 參數簽名與線上 100% 精準對齊：(p_loan_id, p_notes, p_officer_line_user_id, p_status)
-- ------------------------------------------------------------------------------
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
BEGIN
    IF NOT is_officer(p_officer_line_user_id) THEN
        RETURN jsonb_build_object('success', false, 'message', '權限不足，僅限登山社幹部更新租借狀態！');
    END IF;

    UPDATE loans
    SET status = trim(p_status),
        notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
        cancelled_at = CASE WHEN trim(p_status) LIKE '%取消%' OR trim(p_status) LIKE '%Cancelled%' THEN NOW() ELSE cancelled_at END,
        updated_at = NOW()
    WHERE id = trim(p_loan_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. RLS 安全存取策略 (Row Level Security Policies)
-- ------------------------------------------------------------------------------
ALTER TABLE equipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_items ENABLE ROW LEVEL SECURITY;

-- equipments
DROP POLICY IF EXISTS "Public read equipments" ON equipments;
CREATE POLICY "Public read equipments" ON equipments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access equipments" ON equipments;
CREATE POLICY "Service role full access equipments" ON equipments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Officers update equipments" ON equipments;
CREATE POLICY "Officers update equipments" ON equipments
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'is_officer')::boolean = true)
    WITH CHECK ((auth.jwt() ->> 'is_officer')::boolean = true);

-- loans
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

-- loan_items
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

-- 權限指派
GRANT EXECUTE ON FUNCTION update_equipment_images(TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_equipment_loan_rpc(TEXT, JSONB) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION cancel_equipment_loan_rpc(TEXT, TEXT) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION get_admin_loans_rpc(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_admin_loan_status_rpc(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

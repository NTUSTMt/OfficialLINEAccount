-- ==============================================================================
-- 🎒 台科登山社社團系統：修復裝備租借 payment_status_enum 型別轉型錯誤 (一鍵修復檔)
-- 目的：徹底解決 column "payment_status" is of type payment_status_enum but expression is of type text
-- 執行方式：將本檔案內容整段複製，至 Supabase Dashboard -> SQL Editor 貼上執行 (Run) 即可秒級修復！
-- ==============================================================================

-- 1. 建立 text 自動隱式轉換為 payment_status_enum 的轉型規則 (IMPLICIT CAST)
-- 如此一來，無論外部傳入字串、CASE WHEN 表達式或 API 寫入，PostgreSQL 均自動完成轉型，杜絕型別衝突
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_enum') THEN
        CREATE OR REPLACE FUNCTION text_to_payment_status_enum(val text)
        RETURNS payment_status_enum AS $cast$
        BEGIN
            IF val IS NULL THEN
                RETURN NULL;
            ELSIF val LIKE '%未繳費%' OR val LIKE '%Unpaid%' THEN
                RETURN '未繳費 Unpaid'::payment_status_enum;
            ELSIF val LIKE '%待確認%' OR val LIKE '%Checking%' THEN
                RETURN '待確認 Checking'::payment_status_enum;
            ELSIF val LIKE '%已繳費%' OR val = 'Paid' OR val LIKE '%已繳費 Paid%' THEN
                RETURN '已繳費 Paid'::payment_status_enum;
            ELSE
                RETURN '未繳費 Unpaid'::payment_status_enum;
            END IF;
        END;
        $cast$ LANGUAGE plpgsql IMMUTABLE;

        DROP CAST IF EXISTS (text AS payment_status_enum);
        CREATE CAST (text AS payment_status_enum)
        WITH FUNCTION text_to_payment_status_enum(text) AS IMPLICIT;
    END IF;
END $$;

-- 2. 確保 loans 表結構完備
ALTER TABLE loans ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT '社團出隊';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS purpose_other TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '待領取 To Be Collected';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_deposit INTEGER DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_rent INTEGER DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS refund_needed BOOLEAN DEFAULT FALSE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE loans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE loan_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 3. 重建原子性租借提交 RPC (submit_equipment_loan_rpc)
-- 採用動態欄位型別 (loans.status%TYPE 與 loans.payment_status%TYPE)，達到 100% 型別相容
CREATE OR REPLACE FUNCTION submit_equipment_loan_rpc(
    p_line_user_id TEXT,
    p_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    v_loan_status loans.status%TYPE := '待領取 To Be Collected';
    v_loan_payment_status loans.payment_status%TYPE;
BEGIN
    -- 1. 身分安全性防呆校驗
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '缺少使用者身分識別碼 (Missing User ID)');
    END IF;

    -- 2. 取得社員基本資料與社籍狀態 (若無此成員先補佔位紀錄以符合外鍵約束)
    SELECT name, is_official_member, membership_expires_at
    INTO v_member
    FROM members
    WHERE line_user_id = p_line_user_id;

    IF FOUND THEN
        v_user_name := COALESCE(v_member.name, '未知社員');
        IF v_member.is_official_member IS TRUE AND 
           (v_member.membership_expires_at IS NULL OR v_member.membership_expires_at >= CURRENT_DATE) THEN
            v_is_official := TRUE;
        END IF;
    ELSE
        INSERT INTO members (line_user_id, name, created_at, updated_at)
        VALUES (p_line_user_id, COALESCE(p_details->>'borrowerName', '未註冊成員'), NOW(), NOW())
        ON CONFLICT (line_user_id) DO NOTHING;
        v_user_name := COALESCE(p_details->>'borrowerName', '未註冊成員');
    END IF;

    -- 3. 解析表單基本參數
    BEGIN
        v_pickup_date := (p_details->>'pickupDate')::DATE;
        v_return_date := (p_details->>'returnDate')::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('status', 'error', 'message', '日期格式無效 (Invalid Date Range)');
    END;

    IF v_return_date < v_pickup_date THEN
        RETURN jsonb_build_object('status', 'error', 'message', '歸還日期不能早於領取日期');
    END IF;

    v_days := (v_return_date - v_pickup_date) + 1;
    IF v_days <= 0 THEN
        v_days := 1;
    END IF;

    -- 社團計費規則：基本天數 2 天，超過 2 天每日按續租加成計費
    v_extra_days := GREATEST(0, v_days - 2);

    v_purpose := COALESCE(p_details->>'purpose', '社團出隊');
    v_other_purpose := p_details->>'otherPurpose';
    v_cart := p_details->'cart';

    IF v_cart IS NULL OR jsonb_typeof(v_cart) <> 'object' THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車清單為空');
    END IF;

    -- 4. 產生唯一租借訂單單號：ORD_YYYYMMDD_XXXX
    v_loan_id := 'ORD_' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '_' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');

    -- 5. 逐一檢查裝備庫存並扣減 (悲觀鎖定 FOR UPDATE 防超賣)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            v_item_count := v_item_count + 1;

            SELECT id, name, available_qty, is_borrowable,
                   COALESCE(price_2day, member_price_per_day, 0) AS p2,
                   COALESCE(price_extra_day, non_member_price_per_day, 0) AS p_extra
            INTO v_equip
            FROM equipments
            WHERE id = v_equip_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION '裝備代號 [%] 不存在', v_equip_id;
            END IF;

            IF v_equip.is_borrowable IS NOT TRUE THEN
                RAISE EXCEPTION '裝備 [%] 目前設定為不開放借用', v_equip.name;
            END IF;

            IF v_equip.available_qty < v_qty THEN
                RAISE EXCEPTION '裝備 [%] 庫存不足！剩餘可用 %，欲借用 %', v_equip.name, v_equip.available_qty, v_qty;
            END IF;

            -- 扣減庫存
            UPDATE equipments
            SET available_qty = available_qty - v_qty,
                updated_at = NOW()
            WHERE id = v_equip_id;

            -- 計算該品項費用 (對齊前端計費公式：2天基本 + 續租加成，社團出隊免租，社員個人5折)
            v_item_base := COALESCE(v_equip.p2, 0) + (v_extra_days * COALESCE(v_equip.p_extra, 0));
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0; -- 社團出隊免租
            ELSIF v_is_official THEN
                v_unit_price := ROUND(v_item_base * 0.5); -- 社員個人使用 5 折
            ELSE
                v_unit_price := v_item_base; -- 非社員原價
            END IF;

            v_subtotal := v_unit_price * v_qty;
            v_total_rent := v_total_rent + v_subtotal;
        END IF;
    END LOOP;

    IF v_item_count = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', '購物車內無有效數量之品項');
    END IF;

    -- 決定付款狀態 (對齊 payment_status_enum 值：已繳費 Paid / 未繳費 Unpaid)
    IF v_total_rent = 0 THEN
        v_loan_payment_status := '已繳費 Paid';
    ELSE
        v_loan_payment_status := '未繳費 Unpaid';
    END IF;

    -- 6. 建立主租借紀錄 (loans)
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
        total_deposit,
        total_rent,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_loan_id,
        p_line_user_id,
        v_user_name,
        v_pickup_date,
        v_return_date,
        v_days,
        v_purpose,
        v_other_purpose,
        v_loan_status,
        v_loan_payment_status,
        v_total_deposit,
        v_total_rent,
        CASE 
            WHEN v_purpose = '社團出隊' THEN '【社團出隊免租金】'
            WHEN v_is_official THEN '【社員個人 5 折適用】'
            ELSE '【非社員原價】'
        END,
        NOW(),
        NOW()
    );

    -- 7. 建立細項明細 (loan_items)
    FOR v_equip_id, v_qty IN
        SELECT key, value::INTEGER FROM jsonb_each_text(v_cart)
    LOOP
        IF v_qty > 0 THEN
            SELECT id, name,
                   COALESCE(price_2day, member_price_per_day, 0) AS p2,
                   COALESCE(price_extra_day, non_member_price_per_day, 0) AS p_extra
            INTO v_equip
            FROM equipments
            WHERE id = v_equip_id;

            v_item_base := COALESCE(v_equip.p2, 0) + (v_extra_days * COALESCE(v_equip.p_extra, 0));
            IF v_purpose = '社團出隊' THEN
                v_unit_price := 0;
            ELSIF v_is_official THEN
                v_unit_price := ROUND(v_item_base * 0.5);
            ELSE
                v_unit_price := v_item_base;
            END IF;

            v_subtotal := v_unit_price * v_qty;

            INSERT INTO loan_items (
                loan_id,
                equipment_id,
                quantity,
                unit_price_snapshot,
                subtotal
            ) VALUES (
                v_loan_id,
                v_equip_id,
                v_qty,
                v_unit_price,
                v_subtotal
            );
        END IF;
    END LOOP;

    -- 8. 成功回傳租借單號與總租金
    RETURN jsonb_build_object(
        'status', 'success',
        'loanId', v_loan_id,
        'totalRent', v_total_rent,
        'days', v_days,
        'message', '裝備租借申請已成功送出！'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'message', SQLERRM
    );
END;
$$;

-- 4. 同步更新查詢未繳費款項 RPC (get_unpaid_payments)
-- 修復子字串碰撞問題 (NOT LIKE '%Paid%' 誤排除 '未繳費 Unpaid')
-- 放寬社費選項：只要非有效正式社員且非待審核，一律提供繳社交費選項；過濾 0 元免租出隊單
CREATE OR REPLACE FUNCTION get_unpaid_payments(p_line_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_membership JSONB := '[]'::jsonb;
    v_activities JSONB := '[]'::jsonb;
    v_equipments JSONB := '[]'::jsonb;
    v_member members%ROWTYPE;
    v_is_official BOOLEAN := FALSE;
    v_is_expired BOOLEAN := FALSE;
BEGIN
    IF p_line_user_id IS NULL OR trim(p_line_user_id) = '' THEN
        RETURN jsonb_build_object(
            'membership', '[]'::jsonb,
            'activities', '[]'::jsonb,
            'equipments', '[]'::jsonb
        );
    END IF;

    -- 1. 查詢社員基本資料與社籍狀態
    SELECT * INTO v_member FROM members WHERE line_user_id = p_line_user_id;
    IF FOUND THEN
        IF v_member.membership_expires_at IS NOT NULL AND v_member.membership_expires_at < CURRENT_DATE THEN
            v_is_expired := TRUE;
        END IF;

        v_is_official := COALESCE(v_member.is_official_member, FALSE) AND NOT v_is_expired;

        -- 只要不是有效正式社員（尚未入社或社籍已過期），且目前無待審核社費，即提供繳社交費選項
        IF NOT v_is_official THEN
            IF (v_member.payment_status IS NULL OR (
                v_member.payment_status::text NOT LIKE '%待確認%' 
                AND v_member.payment_status::text NOT LIKE '%Checking%'
            )) THEN
                v_membership := jsonb_build_array(
                    jsonb_build_object(
                        'id', 'fee_membership',
                        'name', '社籍與社費 (Membership Fee)',
                        'amount', 200
                    )
                );
            END IF;
        END IF;
    ELSE
        -- members 表中尚無該使用者，肯定非社員，提供繳社交費選項
        v_membership := jsonb_build_array(
            jsonb_build_object(
                'id', 'fee_membership',
                'name', '社籍與社費 (Membership Fee)',
                'amount', 200
            )
        );
    END IF;

    -- 2. 查詢正取活動欠款 (從 event_signups 與 events 關聯)
    SELECT COALESCE(jsonb_agg(act), '[]'::jsonb)
    INTO v_activities
    FROM (
        SELECT jsonb_build_object(
            'id', 'act_' || e.id,
            'name', '活動：' || e.title,
            'amount', COALESCE(e.fee, 0)
        ) AS act
        FROM event_signups s
        JOIN events e ON s.event_id = e.id
        WHERE s.line_user_id = p_line_user_id
          AND (s.status::text LIKE '%正取%' OR s.status::text LIKE '%Confirmed%')
          AND s.status::text NOT LIKE '%取消%'
          AND COALESCE(e.fee, 0) > 0
          AND (
              s.payment_status IS NULL 
              OR s.payment_status::text LIKE '%未繳費%'
              OR s.payment_status::text LIKE '%Unpaid%'
              OR (
                  s.payment_status::text NOT LIKE '%已繳費%' 
                  AND s.payment_status::text NOT LIKE '%待確認%' 
                  AND s.payment_status::text NOT LIKE '%Checking%'
                  AND s.payment_status::text != '已繳費 Paid'
                  AND s.payment_status::text != 'Paid'
              )
          )
        ORDER BY e.start_date ASC
    ) t;

    -- 3. 查詢裝備租借欠款 (從 loans 與 loan_items、equipments 關聯)
    SELECT COALESCE(jsonb_agg(eq), '[]'::jsonb)
    INTO v_equipments
    FROM (
        SELECT jsonb_build_object(
            'id', 'eq_' || l.id,
            'name', COALESCE(eq_sub.name, '裝備租借'),
            'amount', CASE 
                WHEN li.subtotal IS NOT NULL AND li.subtotal > 0 THEN li.subtotal
                ELSE COALESCE(l.total_rent, 0)
            END,
            'orderId', l.id,
            'qty', COALESCE(li.quantity, 1),
            'pickupDate', to_char(l.start_date, 'YYYY-MM-DD'),
            'returnDate', to_char(l.end_date, 'YYYY-MM-DD'),
            'purpose', COALESCE(l.purpose, '個人使用'),
            'isOfficial', CASE WHEN v_is_official THEN '是' ELSE '否' END
        ) AS eq
        FROM loans l
        LEFT JOIN loan_items li ON l.id = li.loan_id
        LEFT JOIN equipments eq_sub ON li.equipment_id = eq_sub.id
        WHERE l.line_user_id = p_line_user_id
          AND l.status::text NOT LIKE '%取消%'
          AND l.status::text NOT LIKE '%歸還%'
          AND COALESCE(l.total_rent, 0) > 0
          AND (
              l.payment_status IS NULL 
              OR l.payment_status::text LIKE '%未繳費%'
              OR l.payment_status::text LIKE '%Unpaid%'
              OR (
                  l.payment_status::text NOT LIKE '%已繳費%' 
                  AND l.payment_status::text NOT LIKE '%待確認%' 
                  AND l.payment_status::text NOT LIKE '%Checking%'
                  AND l.payment_status::text != '已繳費 Paid'
                  AND l.payment_status::text != 'Paid'
              )
          )
        ORDER BY l.start_date ASC
    ) t;

    RETURN jsonb_build_object(
        'membership', v_membership,
        'activities', v_activities,
        'equipments', v_equipments
    );
END;
$$;


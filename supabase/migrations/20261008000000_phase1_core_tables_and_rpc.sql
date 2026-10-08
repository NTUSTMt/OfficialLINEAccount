-- ==============================================================================
-- 台科登山社系統 Phase 1 核心遷移腳本
-- 包含：app_config, webhook_events, worker_failures, event_signups partial unique index, signup_rpc
-- ==============================================================================

-- 1. 系統動態組態設定表 (儲存 ADMIN_GROUP_ID 等執行期狀態)
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'app_config' AND policyname = 'Allow service role full access on app_config'
    ) THEN
        CREATE POLICY "Allow service role full access on app_config"
            ON public.app_config
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 2. LINE Webhook 冪等去重表
CREATE TABLE IF NOT EXISTS public.webhook_events (
    webhook_event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'webhook_events' AND policyname = 'Allow service role full access on webhook_events'
    ) THEN
        CREATE POLICY "Allow service role full access on webhook_events"
            ON public.webhook_events
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 3. GAS Worker 非同步失敗重試記錄表
CREATE TABLE IF NOT EXISTS public.worker_failures (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.worker_failures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'worker_failures' AND policyname = 'Allow service role full access on worker_failures'
    ) THEN
        CREATE POLICY "Allow service role full access on worker_failures"
            ON public.worker_failures
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 4. 建立 event_signups 防止重複有效報名之 Partial Unique Index
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_signups_active_unique
    ON public.event_signups (line_user_id, event_id)
    WHERE status != '已取消 Cancelled'::event_signup_status_enum;

-- 5. 活動原子報名 RPC Stored Procedure (防重複、防竄改、防時效過期、不重置 180 天個資更新時間)
CREATE OR REPLACE FUNCTION public.signup_rpc(
    p_event_id TEXT,
    p_line_user_id TEXT,
    p_signup_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event RECORD;
    v_member RECORD;
    v_missing_fields TEXT[] := ARRAY[]::TEXT[];
    v_days_since_update NUMERIC;
    v_existing_signup RECORD;
    v_is_official BOOLEAN := FALSE;
    v_fee INTEGER := 0;
    v_actual_signup_id TEXT := p_signup_id;
    v_retry_count INT := 0;
BEGIN
    -- 1. 檢查活動是否存在
    SELECT * INTO v_event FROM public.events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found',
            'message', 'Event not found'
        );
    END IF;

    -- 2. 檢查活動是否截止或關閉
    IF (v_event.status ILIKE '%關閉%' OR v_event.status ILIKE '%closed%' OR v_event.status ILIKE '%已截止%' OR v_event.status ILIKE '%已結束%')
       OR (v_event.deadline IS NOT NULL AND NOW() > v_event.deadline) THEN
        RETURN jsonb_build_object(
            'status', 'closed',
            'message', 'Event is closed or deadline has passed'
        );
    END IF;

    -- 3. 檢查社員個資是否存在
    SELECT * INTO v_member FROM public.members WHERE line_user_id = p_line_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_found_member',
            'message', 'Member profile not found'
        );
    END IF;

    -- 4. 檢查必填欄位完整性
    IF v_member.name IS NULL OR TRIM(v_member.name) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '姓名 Name');
    END IF;
    IF v_member.gender IS NULL OR TRIM(v_member.gender::text) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '性別 Gender');
    END IF;
    IF v_member.id_card IS NULL OR TRIM(v_member.id_card) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '身分證字號/居留證號 ID Card');
    END IF;
    IF v_member.birthday IS NULL OR TRIM(v_member.birthday) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '生日 Birthday');
    END IF;
    IF v_member.phone IS NULL OR TRIM(v_member.phone) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '聯絡電話 Phone');
    END IF;
    IF v_member.department IS NULL OR TRIM(v_member.department) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '系所 Department');
    END IF;
    IF v_member.student_id IS NULL OR TRIM(v_member.student_id) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '學號 Student ID');
    END IF;
    IF v_member.address IS NULL OR TRIM(v_member.address) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '現居地址 Address');
    END IF;
    IF v_member.email IS NULL OR TRIM(v_member.email) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '電子郵件 Email');
    END IF;
    IF v_member.line_id IS NULL OR TRIM(v_member.line_id) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '真實 LINE ID');
    END IF;
    IF v_member.emergency_contact_name IS NULL OR TRIM(v_member.emergency_contact_name) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人姓名 Emergency Contact Name');
    END IF;
    IF v_member.emergency_contact_rel IS NULL OR TRIM(v_member.emergency_contact_rel) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '與緊急聯絡人關係 Relationship');
    END IF;
    IF v_member.emergency_contact_phone IS NULL OR TRIM(v_member.emergency_contact_phone) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人電話 Emergency Phone');
    END IF;
    IF v_member.emergency_contact_address IS NULL OR TRIM(v_member.emergency_contact_address) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '緊急聯絡人地址 Emergency Address');
    END IF;
    IF v_member.outdoor_experience IS NULL OR TRIM(v_member.outdoor_experience) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '爬山經歷 Outdoor Experience');
    END IF;
    IF v_member.fitness_desc IS NULL OR TRIM(v_member.fitness_desc) = '' THEN
        v_missing_fields := array_append(v_missing_fields, '體能自評 Fitness Description');
    END IF;
    IF v_member.proof_urls IS NULL OR jsonb_array_length(v_member.proof_urls) = 0 THEN
        v_missing_fields := array_append(v_missing_fields, '體能證明照片 Proof Photos');
    END IF;

    IF array_length(v_missing_fields, 1) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'profile_incomplete',
            'missing_fields', v_missing_fields,
            'message', 'Profile incomplete'
        );
    END IF;

    -- 5. 檢查個資更新時效 (180天)
    IF v_member.updated_at IS NULL AND v_member.created_at IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'profile_expired',
            'reason', '尚未完成時效校驗',
            'message', 'Profile timestamp missing'
        );
    END IF;

    v_days_since_update := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_member.updated_at, v_member.created_at))) / 86400.0;
    IF v_days_since_update > 180.0 THEN
        RETURN jsonb_build_object(
            'status', 'profile_expired',
            'reason', '已超過 6 個月未更新',
            'message', 'Profile expired'
        );
    END IF;

    -- 6. 檢查是否重複報名（非取消狀態）
    SELECT * INTO v_existing_signup
    FROM public.event_signups
    WHERE line_user_id = p_line_user_id
      AND event_id = p_event_id
      AND status::text NOT LIKE '%已取消%'
      AND status::text NOT LIKE '%Cancelled%'
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'event_title', v_event.title,
            'message', 'Already registered'
        );
    END IF;

    -- 7. 寫入報名資料（若 ID 碰撞則重試尾碼遞增）
    v_is_official := COALESCE(v_member.is_official_member, false);
    v_fee := COALESCE(v_event.fee, 0);

    LOOP
        BEGIN
            INSERT INTO public.event_signups (
                id,
                event_id,
                line_user_id,
                name,
                line_id,
                status,
                payment_status,
                notification_status,
                is_official_member_snapshot,
                notes,
                created_at,
                updated_at
            ) VALUES (
                v_actual_signup_id,
                p_event_id,
                p_line_user_id,
                v_member.name,
                v_member.line_id,
                '審核中 Checking'::event_signup_status_enum,
                '未繳費 Unpaid'::payment_status_enum,
                '未發送',
                v_is_official,
                '',
                NOW(),
                NOW()
            );
            EXIT; -- 插入成功則跳出迴圈
        EXCEPTION WHEN unique_violation THEN
            v_retry_count := v_retry_count + 1;
            IF v_retry_count > 10 THEN
                RETURN jsonb_build_object(
                    'status', 'error',
                    'message', 'Failed to generate unique signup code after retries'
                );
            END IF;
            v_actual_signup_id := p_signup_id || '_' || v_retry_count;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'ok',
        'signup_id', v_actual_signup_id,
        'event_title', v_event.title,
        'fee', v_fee,
        'is_official_member', v_is_official,
        'spreadsheet_id', v_event.spreadsheet_id,
        'message', 'Signup successfully registered'
    );
END;
$$;

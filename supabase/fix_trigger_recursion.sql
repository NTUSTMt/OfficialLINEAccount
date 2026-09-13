-- ==============================================================================
-- 🛡️ 快速修復 Supabase 觸發器雙向無窮遞迴 (消除 stack depth limit exceeded)
-- 說明：在 members 與 officers 互相同步的觸發器中加入原生 pg_trigger_depth() > 1 守衛
-- 請在 Supabase Dashboard -> SQL Editor 執行本腳本即可立即解決！
-- ==============================================================================

-- 1. 修復 members -> officers 觸發函式
CREATE OR REPLACE FUNCTION trg_fn_sync_officer_from_member()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ 關鍵防遞迴守衛：避免與 trg_fn_sync_member_from_officer 形成雙向互相更新的無窮遞迴
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- 當 is_officer 被設為 TRUE 且有有效 line_user_id
    IF NEW.is_officer IS TRUE AND NEW.line_user_id IS NOT NULL AND trim(NEW.line_user_id) != '' THEN
        INSERT INTO officers (line_user_id, name, role, title, updated_at)
        VALUES (
            trim(NEW.line_user_id),
            COALESCE(NULLIF(NEW.name, ''), '幹部'),
            COALESCE(NULLIF(NEW.officer_role, ''), '幹部'),
            COALESCE(NULLIF(NEW.officer_role, ''), '幹部'),
            NOW()
        )
        ON CONFLICT (line_user_id) DO UPDATE
        SET name = EXCLUDED.name,
            role = EXCLUDED.role,
            title = EXCLUDED.title,
            updated_at = NOW();

    -- 當原本是幹部，被改為 FALSE 時，自 officers 表移除
    ELSIF (NEW.is_officer IS FALSE OR NEW.is_officer IS NULL) AND (OLD.is_officer IS TRUE) THEN
        DELETE FROM officers WHERE line_user_id = trim(NEW.line_user_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 修復 officers -> members 觸發函式
CREATE OR REPLACE FUNCTION trg_fn_sync_member_from_officer()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ 關鍵防遞迴守衛：避免與 trg_fn_sync_officer_from_member 形成雙向互相更新的無窮遞迴
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.line_user_id IS NOT NULL AND trim(NEW.line_user_id) != '' THEN
            UPDATE members
            SET is_officer = TRUE,
                officer_role = COALESCE(NULLIF(NEW.title, ''), NULLIF(NEW.role, ''), '幹部'),
                name = COALESCE(NULLIF(NEW.name, ''), name),
                updated_at = NOW()
            WHERE trim(line_user_id) = trim(NEW.line_user_id);
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.line_user_id IS NOT NULL AND trim(OLD.line_user_id) != '' THEN
            UPDATE members
            SET is_officer = FALSE,
                updated_at = NOW()
            WHERE trim(line_user_id) = trim(OLD.line_user_id);
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 裝備照片安全直更 RPC (前端直更 Supabase，免除 GAS 跨域 302 重導向之 Load failed 阻斷)
CREATE OR REPLACE FUNCTION update_equipment_images(
    p_equip_id TEXT,
    p_images JSONB
)
RETURNS JSONB AS $$
BEGIN
    UPDATE equipments
    SET images = p_images,
        updated_at = NOW()
    WHERE id = p_equip_id;

    RETURN jsonb_build_object('success', true, 'id', p_equip_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 允許更新裝備政策
DROP POLICY IF EXISTS "Allow update equipments" ON equipments;
CREATE POLICY "Allow update equipments" ON equipments
    FOR UPDATE USING (true) WITH CHECK (true);


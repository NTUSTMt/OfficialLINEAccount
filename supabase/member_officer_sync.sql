-- ==============================================================================
-- 🛡️ 台科登山社社團系統：members 與 officers 幹部身分自動雙向同步 (相容自癒加強版)
-- 目的：
-- 1. members 表擴充 is_officer (BOOLEAN) 與 officer_role (TEXT) 欄位
-- 2. officers 表自動解鎖 NOT NULL 約束 (支援既有 title, role 等歷史欄位)
-- 3. 建立觸發器：members.is_officer 變動時，自動同步維護 officers 表
-- 4. 既有 officers 資料一鍵回填至 members.is_officer
-- ==============================================================================

-- 1. 欄位擴充 (members 表)
ALTER TABLE members ADD COLUMN IF NOT EXISTS is_officer BOOLEAN DEFAULT FALSE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS officer_role TEXT DEFAULT '幹部';

-- 2. officers 資料表結構自癒與相容補齊
CREATE TABLE IF NOT EXISTS officers (
    id BIGSERIAL PRIMARY KEY,
    line_user_id TEXT,
    name TEXT NOT NULL DEFAULT '幹部',
    role TEXT NOT NULL DEFAULT '幹部',
    title TEXT DEFAULT '幹部',
    contact TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 若 officers 表早已存在但缺少欄位，動態補齊
ALTER TABLE officers ADD COLUMN IF NOT EXISTS line_user_id TEXT;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS role TEXT DEFAULT '幹部';
ALTER TABLE officers ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '幹部';

-- 關鍵自癒：自動解除 officers 表中所有欄位 (除 id / line_user_id 外) 的 NOT NULL 約束
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'officers'
          AND is_nullable = 'NO'
          AND column_name NOT IN ('id', 'line_user_id')
    ) LOOP
        EXECUTE format('ALTER TABLE officers ALTER COLUMN %I DROP NOT NULL;', r.column_name);
    END LOOP;
END $$;

-- 確保 title 與 role 預設值皆為 '幹部'
ALTER TABLE officers ALTER COLUMN role SET DEFAULT '幹部';
ALTER TABLE officers ALTER COLUMN title SET DEFAULT '幹部';

-- 若先前 officers 表無 UNIQUE 約束，補齊以支援 ON CONFLICT (line_user_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_officers_line_user_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'officers'::regclass AND a.attname = 'line_user_id' AND i.indisunique
    ) THEN
        ALTER TABLE officers ADD CONSTRAINT uq_officers_line_user_id UNIQUE (line_user_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 將既有 officers 表中 role 與 title 雙向填補，確保皆有值
UPDATE officers
SET role = COALESCE(NULLIF(role, ''), NULLIF(title, ''), '幹部'),
    title = COALESCE(NULLIF(title, ''), NULLIF(role, ''), '幹部');

-- 3. 自動連動觸發函式
CREATE OR REPLACE FUNCTION trg_fn_sync_officer_from_member()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ 關鍵防遞迴守衛：避免與 trg_fn_sync_member_from_officer 形成雙向互相更新的無窮遞迴 (stack depth limit exceeded)
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

-- 重新掛載 Trigger
DROP TRIGGER IF EXISTS trg_member_officer_sync ON members;
CREATE TRIGGER trg_member_officer_sync
AFTER INSERT OR UPDATE OF is_officer, officer_role, name ON members
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_officer_from_member();

-- 4. 歷史既有幹部資料回填 members.is_officer = TRUE
UPDATE members m
SET is_officer = TRUE,
    officer_role = COALESCE(NULLIF(o.title, ''), NULLIF(o.role, ''), NULLIF(m.officer_role, ''), '幹部')
FROM officers o
WHERE trim(m.line_user_id) = trim(o.line_user_id);

-- 5. 雙向同步觸發器：當 officers 表更新 title, role, name 時，自動同步回 members 表
CREATE OR REPLACE FUNCTION trg_fn_sync_member_from_officer()
RETURNS TRIGGER AS $$
BEGIN
    -- 🛡️ 關鍵防遞迴守衛：避免與 trg_fn_sync_officer_from_member 形成雙向互相更新的無窮遞迴 (stack depth limit exceeded)
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

DROP TRIGGER IF EXISTS trg_officer_to_member_sync ON officers;
CREATE TRIGGER trg_officer_to_member_sync
AFTER INSERT OR UPDATE OF title, role, name, line_user_id OR DELETE ON officers
FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_member_from_officer();

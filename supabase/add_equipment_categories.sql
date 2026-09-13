-- ==============================================================================
-- 🎒 台科登山社社團系統：裝備分類 ENUM 與下拉選單升級腳本
-- 執行後，Supabase Studio 的 Table Editor 中 category 欄位會自動呈現為下拉選單！
-- ==============================================================================

-- 1. 建立裝備分類 ENUM 型別
DO $$ BEGIN
    CREATE TYPE equipment_category AS ENUM (
        '睡眠系統',
        '背負系統',
        '炊事系統',
        '照明通訊',
        '攀登技術',
        '行進安全',
        '其他裝備'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. 確保 equipments 資料表具備 category 欄位，並將其平滑轉型為 equipment_category ENUM
DO $$ BEGIN
    -- 若欄位尚未存在，直接以 ENUM 建立
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'equipments' AND column_name = 'category'
    ) THEN
        ALTER TABLE equipments ADD COLUMN category equipment_category DEFAULT '其他裝備';
    ELSE
        -- 若原為 TEXT 或 VARCHAR，將現有值容錯轉型為 ENUM
        ALTER TABLE equipments 
        ALTER COLUMN category DROP DEFAULT;

        ALTER TABLE equipments 
        ALTER COLUMN category TYPE equipment_category 
        USING (
            CASE 
                WHEN category::text IN ('睡眠系統', '背負系統', '炊事系統', '照明通訊', '攀登技術', '行進安全', '其他裝備') 
                    THEN category::text::equipment_category
                WHEN category::text LIKE '%睡%' OR category::text LIKE '%帳%' OR category::text LIKE '%墊%'
                    THEN '睡眠系統'::equipment_category
                WHEN category::text LIKE '%包%' 
                    THEN '背負系統'::equipment_category
                WHEN category::text LIKE '%爐%' OR category::text LIKE '%鍋%' OR category::text LIKE '%水%'
                    THEN '炊事系統'::equipment_category
                WHEN category::text LIKE '%燈%' OR category::text LIKE '%通訊%' OR category::text LIKE '%機%'
                    THEN '照明通訊'::equipment_category
                WHEN category::text LIKE '%繩%' OR category::text LIKE '%盔%' OR category::text LIKE '%帶%' OR category::text LIKE '%鉤%' OR category::text LIKE '%爪%' OR category::text LIKE '%斧%'
                    THEN '攀登技術'::equipment_category
                WHEN category::text LIKE '%杖%' OR category::text LIKE '%急救%' OR category::text LIKE '%雪套%' OR category::text LIKE '%綁腿%'
                    THEN '行進安全'::equipment_category
                ELSE '其他裝備'::equipment_category
            END
        );

        ALTER TABLE equipments 
        ALTER COLUMN category SET DEFAULT '其他裝備'::equipment_category;
    END IF;
END $$;

-- 3. 建立分類查詢索引以加速篩選
CREATE INDEX IF NOT EXISTS idx_equipments_category ON equipments(category);

-- 4. 註解說明
COMMENT ON COLUMN equipments.category IS '裝備所屬系統分類 (Supabase Studio Table Editor 自動下拉選單)';

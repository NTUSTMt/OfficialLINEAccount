-- ==============================================================================
-- Migration: 新增社員頭貼欄位 (avatar_url) 至 members 資料表
-- ==============================================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN members.avatar_url IS 'LINE Profile 個人大頭貼公開圖片網址';

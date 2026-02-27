-- 為 cart 表新增 is_submitted 欄位（軟刪除功能）
ALTER TABLE cart ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN DEFAULT false;
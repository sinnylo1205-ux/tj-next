-- 刪除重複欄位
ALTER TABLE orders DROP COLUMN IF EXISTS recipient_name;

-- 新增電話欄位
ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone text;

-- 新增 LINE User ID 欄位（手動訂單用）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_user_id text;

-- 為新欄位加上註解
COMMENT ON COLUMN orders.phone IS '訂購人電話號碼';
COMMENT ON COLUMN orders.line_user_id IS '手動訂單專用的 LINE User ID，用於發送 LINE 通知';
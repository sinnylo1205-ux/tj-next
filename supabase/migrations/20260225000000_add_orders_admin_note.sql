-- 新增管理員備注欄位到 orders 表
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS admin_note text;

COMMENT ON COLUMN orders.admin_note IS '管理員備注，供後台訂單管理使用';

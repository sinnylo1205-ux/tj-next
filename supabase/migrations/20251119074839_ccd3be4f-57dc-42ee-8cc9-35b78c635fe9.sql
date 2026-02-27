-- Add total_price column to cart table
ALTER TABLE cart
ADD COLUMN total_price integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN cart.total_price IS '小計金額 = 設計後單價 × 數量';
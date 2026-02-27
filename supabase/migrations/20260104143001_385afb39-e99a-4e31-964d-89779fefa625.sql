-- 強制刪除仍存在的不安全政策
DROP POLICY IF EXISTS "Anyone can delete cart item" ON cart;
DROP POLICY IF EXISTS "Anyone can insert into cart" ON cart;
DROP POLICY IF EXISTS "Anyone can read cart" ON cart;
DROP POLICY IF EXISTS "Anyone can update cart" ON cart;
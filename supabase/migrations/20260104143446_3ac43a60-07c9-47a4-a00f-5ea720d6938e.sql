-- ==========================================
-- 1. user_log_in 表 - 阻止匿名存取
-- ==========================================
CREATE POLICY "Require authentication for all access"
ON user_log_in
AS RESTRICTIVE
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- ==========================================
-- 2. orders 表 - 阻止匿名存取
-- ==========================================
CREATE POLICY "Require authentication for all access"
ON orders
AS RESTRICTIVE
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
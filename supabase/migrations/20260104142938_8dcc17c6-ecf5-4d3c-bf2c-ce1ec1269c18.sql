-- Step 1: 刪除不安全的「Anyone can...」RLS 政策
DROP POLICY IF EXISTS "Anyone can read cart" ON cart;
DROP POLICY IF EXISTS "Anyone can insert into cart" ON cart;
DROP POLICY IF EXISTS "Anyone can update cart" ON cart;
DROP POLICY IF EXISTS "Anyone can delete cart item" ON cart;

-- Step 2: 確保安全的使用者專屬 RLS 政策存在
-- SELECT（只能看自己的）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cart' AND policyname = 'Users can view their own cart'
  ) THEN
    CREATE POLICY "Users can view their own cart"
    ON cart FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- INSERT（只能幫自己加）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cart' AND policyname = 'Users can insert into their own cart'
  ) THEN
    CREATE POLICY "Users can insert into their own cart"
    ON cart FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- UPDATE（只能改自己的）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cart' AND policyname = 'Users can update their own cart'
  ) THEN
    CREATE POLICY "Users can update their own cart"
    ON cart FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- DELETE（只能刪自己的）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'cart' AND policyname = 'Users can delete from their own cart'
  ) THEN
    CREATE POLICY "Users can delete from their own cart"
    ON cart FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;
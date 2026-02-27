-- Drop the overly permissive policy that allows any authenticated user to access all data
DROP POLICY IF EXISTS "Require authentication for all access" ON public.user_log_in;

-- The remaining policies are already correct:
-- 1. "Users can view their own profile" - SELECT with auth.uid() = id
-- 2. "Admins can view all user profiles" - SELECT for admins
-- 3. "Users can insert their own profile" - INSERT with auth.uid() = id
-- 4. "Users can update their own profile" - UPDATE with auth.uid() = id
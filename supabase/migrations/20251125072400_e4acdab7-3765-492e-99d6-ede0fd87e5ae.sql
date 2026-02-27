-- Fix remaining infinite recursion in user_roles RLS policies
-- The "Admins can manage all roles" policy still causes recursion
-- Drop it and keep only the basic policies

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Keep only these two non-recursive policies:
-- 1. Users can view their own roles (already exists, no recursion)
-- 2. Service role can manage all roles (already exists, no recursion)

-- For admin operations, they should use the has_role() function in application code
-- or use service_role credentials, not rely on RLS policies
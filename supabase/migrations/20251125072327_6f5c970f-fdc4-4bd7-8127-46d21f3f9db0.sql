-- Fix infinite recursion in user_roles RLS policies
-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON public.user_roles;

-- Create new policies that don't cause recursion
-- Allow users to view their own roles (no recursive check)
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow service role to manage all roles
CREATE POLICY "Service role can manage all roles"
ON public.user_roles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow admins to insert/update/delete roles (using the function, which is SECURITY DEFINER and won't recurse)
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
  )
);
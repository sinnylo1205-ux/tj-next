-- 允许admin查看所有用户的基本资料
CREATE POLICY "Admins can view all user profiles"
ON public.user_log_in
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'::public.app_role
  )
);
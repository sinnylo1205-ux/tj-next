-- Add RESTRICTIVE policy to require authentication for all access to user_log_in table
-- This provides an explicit deny for anonymous users, matching the security pattern used in the orders table

CREATE POLICY "Require authentication for all access"
ON public.user_log_in
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
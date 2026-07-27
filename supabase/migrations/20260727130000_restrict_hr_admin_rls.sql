-- HR tables hold staff schedules, leave, notes, and expense claims.
-- Frontend /admin route checks are not a security boundary: any authenticated
-- customer could previously CRUD these rows via the Supabase anon client.
-- Restrict direct table access to admins and service_role.

DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule"
  ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves"
  ON public.hr_leaves;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes"
  ON public.hr_notes;
DROP POLICY IF EXISTS "Authenticated users full access on hr_expense_claims"
  ON public.hr_expense_claims;

DROP POLICY IF EXISTS "Admins and service_role can manage hr_schedule"
  ON public.hr_schedule;
DROP POLICY IF EXISTS "Admins and service_role can manage hr_leaves"
  ON public.hr_leaves;
DROP POLICY IF EXISTS "Admins and service_role can manage hr_notes"
  ON public.hr_notes;
DROP POLICY IF EXISTS "Admins and service_role can manage hr_expense_claims"
  ON public.hr_expense_claims;

CREATE POLICY "Admins and service_role can manage hr_schedule"
  ON public.hr_schedule FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and service_role can manage hr_leaves"
  ON public.hr_leaves FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and service_role can manage hr_notes"
  ON public.hr_notes FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and service_role can manage hr_expense_claims"
  ON public.hr_expense_claims FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

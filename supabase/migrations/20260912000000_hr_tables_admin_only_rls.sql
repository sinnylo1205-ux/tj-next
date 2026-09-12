-- 人事相關表改為僅 admin 可讀寫（先前任何已登入會員皆可全權限）
DROP POLICY IF EXISTS "Authenticated users full access on hr_expense_claims" ON public.hr_expense_claims;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes" ON public.hr_notes;
DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves" ON public.hr_leaves;

DROP POLICY IF EXISTS "Admins can manage hr_expense_claims" ON public.hr_expense_claims;
CREATE POLICY "Admins can manage hr_expense_claims"
  ON public.hr_expense_claims FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage hr_notes" ON public.hr_notes;
CREATE POLICY "Admins can manage hr_notes"
  ON public.hr_notes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage hr_schedule" ON public.hr_schedule;
CREATE POLICY "Admins can manage hr_schedule"
  ON public.hr_schedule FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage hr_leaves" ON public.hr_leaves;
CREATE POLICY "Admins can manage hr_leaves"
  ON public.hr_leaves FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

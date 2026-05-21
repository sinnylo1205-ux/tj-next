-- HR data contains staff schedule and leave details. The /admin UI check is not a
-- security boundary, so restrict direct table access to admins and service role.

DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves" ON public.hr_leaves;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes" ON public.hr_notes;

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

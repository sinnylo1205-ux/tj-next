-- HR data contains internal schedules, leave records, and private notes.
-- Frontend route guards are not a database security boundary.
ALTER TABLE public.hr_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves" ON public.hr_leaves;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes" ON public.hr_notes;

DROP POLICY IF EXISTS "Admins and service_role full access on hr_schedule" ON public.hr_schedule;
CREATE POLICY "Admins and service_role full access on hr_schedule"
  ON public.hr_schedule FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins and service_role full access on hr_leaves" ON public.hr_leaves;
CREATE POLICY "Admins and service_role full access on hr_leaves"
  ON public.hr_leaves FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins and service_role full access on hr_notes" ON public.hr_notes;
CREATE POLICY "Admins and service_role full access on hr_notes"
  ON public.hr_notes FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role));

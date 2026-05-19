-- HR schedule data is admin-only. Frontend route checks are not a security
-- boundary because any authenticated user can call Supabase APIs directly.
ALTER TABLE public.hr_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access on hr_schedule" ON public.hr_schedule;
DROP POLICY IF EXISTS "Authenticated users full access on hr_leaves" ON public.hr_leaves;
DROP POLICY IF EXISTS "Authenticated users full access on hr_notes" ON public.hr_notes;

DROP POLICY IF EXISTS "Admins can manage hr_schedule" ON public.hr_schedule;
CREATE POLICY "Admins can manage hr_schedule"
  ON public.hr_schedule FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage hr_leaves" ON public.hr_leaves;
CREATE POLICY "Admins can manage hr_leaves"
  ON public.hr_leaves FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage hr_notes" ON public.hr_notes;
CREATE POLICY "Admins can manage hr_notes"
  ON public.hr_notes FOR ALL
  USING (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'));

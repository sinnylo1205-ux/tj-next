
-- Admin can insert into user_log_in
CREATE POLICY "Admins can insert user_log_in"
ON public.user_log_in FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admin can read eat_reservation
CREATE POLICY "Admins can read eat_reservation"
ON public.eat_reservation FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admin can update eat_reservation
CREATE POLICY "Admins can update eat_reservation"
ON public.eat_reservation FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Ensure customer_360 respects the caller's RLS policies instead of the view owner.
ALTER VIEW public.customer_360 SET (security_invoker = on);

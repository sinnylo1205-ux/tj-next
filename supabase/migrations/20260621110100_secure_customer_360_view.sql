-- CRM customer_360 exposes aggregate customer PII; enforce caller RLS on
-- chat_state/orders/user_log_in instead of bypassing policies as the view owner.
ALTER VIEW public.customer_360 SET (security_invoker = on);

GRANT SELECT ON public.customer_360 TO authenticated;

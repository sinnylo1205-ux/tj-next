-- Ensure the CRM aggregate view is evaluated as the querying user so RLS on
-- chat_state, orders, and user_log_in is enforced for non-admin customers.
ALTER VIEW public.customer_360 SET (security_invoker = true);

-- CRM: customer_360 視圖（以 line_user_id 為主鍵）
-- 來源：chat_state（對話主檔） + orders / user_log_in（訂單事實）

DROP VIEW IF EXISTS public.customer_360;

CREATE VIEW public.customer_360
WITH (security_invoker = true) AS
WITH order_base AS (
  SELECT
    COALESCE(o.line_user_id, u.line_user_id) AS line_user_id,
    o.id,
    o.total_amount,
    o.expected_pickup_date,
    o.order_status,
    o.payment_step,
    o."Email" AS order_email,
    u.email AS member_email,
    o.who_receive,
    o.created_at
  FROM public.orders o
  LEFT JOIN public.user_log_in u ON u.id = o.user_id
),
valid_orders AS (
  SELECT *
  FROM order_base
  WHERE line_user_id IS NOT NULL
    AND order_status IN ('processing', 'shipped', 'delivered')
    AND payment_step = 'verified'
),
order_agg AS (
  SELECT
    line_user_id,
    COUNT(*)::int AS order_count,
    COALESCE(SUM(total_amount), 0)::bigint AS lifetime_value,
    MAX(expected_pickup_date) AS last_pickup_date,
    (COUNT(*) >= 2) AS is_repeat_customer,
    COALESCE(
      MAX(NULLIF(order_email, '')),
      MAX(NULLIF(member_email, ''))
    ) AS primary_email,
    STRING_AGG(DISTINCT NULLIF(who_receive, ''), '、') AS who_receive_names,
    MAX(created_at) AS last_order_at
  FROM valid_orders
  GROUP BY line_user_id
)
SELECT
  cs.line_user_id,
  cs.display_name,
  cs.tag,
  cs.reply_mode,
  cs.updated AS last_message_at,
  COALESCE(oa.order_count, 0) AS order_count,
  COALESCE(oa.lifetime_value, 0) AS lifetime_value,
  oa.last_pickup_date,
  COALESCE(oa.is_repeat_customer, false) AS is_repeat_customer,
  oa.primary_email,
  oa.who_receive_names,
  (COALESCE(oa.order_count, 0) > 0) AS has_orders,
  true AS has_line,
  oa.last_order_at
FROM public.chat_state cs
LEFT JOIN order_agg oa ON oa.line_user_id = cs.line_user_id;

GRANT SELECT ON public.customer_360 TO authenticated;

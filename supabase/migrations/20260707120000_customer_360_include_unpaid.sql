-- customer_360：納入未付款訂單（與 order_customer_rollup 一致）

DROP VIEW IF EXISTS public.customer_360;

CREATE VIEW public.customer_360 AS
WITH name_to_line AS (
  SELECT DISTINCT ON (TRIM(cs.display_name))
    TRIM(cs.display_name) AS display_name,
    cs.line_user_id
  FROM public.chat_state cs
  WHERE NULLIF(TRIM(cs.display_name), '') IS NOT NULL
    AND cs.line_user_id NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
  ORDER BY TRIM(cs.display_name), cs.updated DESC NULLS LAST
),
order_base AS (
  SELECT
    CASE
      WHEN o.is_manual_order IS TRUE OR o.is_from_quotation IS TRUE THEN
        COALESCE(
          CASE
            WHEN NULLIF(TRIM(o.line_user_id), '') IS NOT NULL
              AND TRIM(o.line_user_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
            THEN TRIM(o.line_user_id)
            ELSE NULL
          END,
          ntr.line_user_id,
          nto.line_user_id
        )
      ELSE COALESCE(NULLIF(TRIM(o.line_user_id), ''), u.line_user_id)
    END AS line_user_id,
    o.id,
    o.total_amount,
    o.expected_pickup_date,
    o.order_status,
    o.payment_step,
    o.is_hide,
    o."Email" AS order_email,
    u.email AS member_email,
    o.who_receive,
    o.created_at
  FROM public.orders o
  LEFT JOIN public.user_log_in u ON u.id = o.user_id
  LEFT JOIN name_to_line ntr
    ON (o.is_manual_order IS TRUE OR o.is_from_quotation IS TRUE)
    AND NULLIF(TRIM(o.who_receive), '') IS NOT NULL
    AND ntr.display_name = TRIM(o.who_receive)
  LEFT JOIN name_to_line nto
    ON (o.is_manual_order IS TRUE OR o.is_from_quotation IS TRUE)
    AND ntr.line_user_id IS NULL
    AND NULLIF(TRIM(o.orderer_name), '') IS NOT NULL
    AND nto.display_name = TRIM(o.orderer_name)
),
valid_orders AS (
  SELECT *
  FROM order_base
  WHERE line_user_id IS NOT NULL
    AND line_user_id NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
    AND order_status NOT IN ('canceled', 'returned')
    AND (is_hide IS NULL OR is_hide IS FALSE)
),
order_agg AS (
  SELECT
    line_user_id,
    COUNT(*)::int AS order_count,
    COUNT(*) FILTER (WHERE payment_step = 'verified')::int AS verified_order_count,
    COUNT(*) FILTER (WHERE payment_step IN ('pending', 'submitted'))::int AS unpaid_order_count,
    BOOL_OR(payment_step IN ('pending', 'submitted')) AS has_unpaid_orders,
    COALESCE(SUM(total_amount) FILTER (WHERE payment_step = 'verified'), 0)::bigint AS lifetime_value,
    MAX(expected_pickup_date) FILTER (WHERE payment_step = 'verified') AS last_pickup_date,
    (COUNT(*) FILTER (WHERE payment_step = 'verified') >= 2) AS is_repeat_customer,
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
  COALESCE(oa.verified_order_count, 0) AS verified_order_count,
  COALESCE(oa.unpaid_order_count, 0) AS unpaid_order_count,
  COALESCE(oa.has_unpaid_orders, false) AS has_unpaid_orders,
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

ALTER VIEW public.customer_360 SET (security_invoker = on);
GRANT SELECT ON public.customer_360 TO authenticated;

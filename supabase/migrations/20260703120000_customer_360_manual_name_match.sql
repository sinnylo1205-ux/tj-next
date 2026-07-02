-- CRM：手動單除 line_user_id 外，依 who_receive / orderer_name 對應 chat_state.display_name 歸屬客戶
-- 並排除歸到管理員 LINE 帳號

DROP VIEW IF EXISTS public.customer_360;

CREATE VIEW public.customer_360 AS
WITH admin_line_ids AS (
  SELECT DISTINCT TRIM(ul.line_user_id) AS line_user_id
  FROM public.user_roles ur
  JOIN public.user_log_in ul ON ul.id = ur.user_id
  WHERE ur.role = 'admin'
    AND ul.line_user_id IS NOT NULL
    AND TRIM(ul.line_user_id) <> ''
),
-- 同名 display_name 只取最近互動的 LINE 帳號，避免手動單重複歸屬
name_to_line AS (
  SELECT DISTINCT ON (TRIM(cs.display_name))
    TRIM(cs.display_name) AS display_name,
    cs.line_user_id
  FROM public.chat_state cs
  WHERE NULLIF(TRIM(cs.display_name), '') IS NOT NULL
    AND cs.line_user_id NOT IN (SELECT line_user_id FROM admin_line_ids)
  ORDER BY TRIM(cs.display_name), cs.updated DESC NULLS LAST
),
order_base AS (
  SELECT
    CASE
      WHEN o.is_manual_order IS TRUE THEN
        COALESCE(
          CASE
            WHEN NULLIF(TRIM(o.line_user_id), '') IS NOT NULL
              AND TRIM(o.line_user_id) NOT IN (SELECT line_user_id FROM admin_line_ids)
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
    o."Email" AS order_email,
    u.email AS member_email,
    o.who_receive,
    o.created_at
  FROM public.orders o
  LEFT JOIN public.user_log_in u ON u.id = o.user_id
  LEFT JOIN name_to_line ntr
    ON o.is_manual_order IS TRUE
    AND NULLIF(TRIM(o.who_receive), '') IS NOT NULL
    AND ntr.display_name = TRIM(o.who_receive)
  LEFT JOIN name_to_line nto
    ON o.is_manual_order IS TRUE
    AND ntr.line_user_id IS NULL
    AND NULLIF(TRIM(o.orderer_name), '') IS NOT NULL
    AND nto.display_name = TRIM(o.orderer_name)
),
valid_orders AS (
  SELECT *
  FROM order_base
  WHERE line_user_id IS NOT NULL
    AND line_user_id NOT IN (SELECT line_user_id FROM admin_line_ids)
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

ALTER VIEW public.customer_360 SET (security_invoker = on);

GRANT SELECT ON public.customer_360 TO authenticated;

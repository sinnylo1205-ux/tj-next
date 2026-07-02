-- 管理員 LINE user id（含固定清單；手動／報價單誤填時視同無 LINE）

CREATE OR REPLACE VIEW public.admin_line_user_ids AS
SELECT DISTINCT TRIM(line_user_id) AS line_user_id
FROM (
  SELECT ul.line_user_id
  FROM public.user_roles ur
  JOIN public.user_log_in ul ON ul.id = ur.user_id
  WHERE ur.role = 'admin'
    AND ul.line_user_id IS NOT NULL
    AND TRIM(ul.line_user_id) <> ''
  UNION ALL
  SELECT unnest(
    ARRAY[
      'Ue6499ae132e994266ea500b976a3277c'::text,
      'U7fb743a941f0e5574a21b4c5686585e8'::text
    ]
  ) AS line_user_id
) src
WHERE line_user_id IS NOT NULL
  AND TRIM(line_user_id) <> '';

ALTER VIEW public.admin_line_user_ids SET (security_invoker = on);
GRANT SELECT ON public.admin_line_user_ids TO authenticated;

-- order_customer_rollup：手動／報價單排除管理員 LINE
DROP VIEW IF EXISTS public.order_customer_rollup;

CREATE VIEW public.order_customer_rollup AS
WITH admin_user_ids AS (
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
),
valid_orders AS (
  SELECT
    o.id,
    o.is_manual_order,
    o.is_from_quotation,
    o.user_id,
    o.who_receive,
    o.orderer_name,
    o."Email" AS order_email,
    o.phone AS order_phone,
    o.line_user_id AS order_line_id,
    o.payment_step,
    o.order_status,
    o.created_at,
    u.name AS member_name,
    u.email AS member_email,
    u.phone AS member_phone,
    u.line_user_id AS member_line_id
  FROM public.orders o
  LEFT JOIN public.user_log_in u ON u.id = o.user_id
  WHERE o.order_status NOT IN ('canceled', 'returned')
    AND (o.is_hide IS NULL OR o.is_hide IS FALSE)
),
keyed AS (
  SELECT
    v.*,
    (v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE) AS is_special_order,
    CASE
      WHEN v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE THEN
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
      WHEN v.user_id IS NOT NULL AND v.user_id NOT IN (SELECT user_id FROM admin_user_ids) THEN
        'user:' || v.user_id::text
      ELSE
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
    END AS customer_key,
    CASE
      WHEN (v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE)
        AND NULLIF(TRIM(v.order_line_id), '') IS NOT NULL
        AND TRIM(v.order_line_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
      THEN TRIM(v.order_line_id)
      WHEN v.is_manual_order IS FALSE
        AND COALESCE(v.is_from_quotation, false) IS FALSE
        AND NULLIF(TRIM(v.member_line_id), '') IS NOT NULL
        AND TRIM(v.member_line_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
      THEN TRIM(v.member_line_id)
      ELSE NULL
    END AS effective_line_id,
    COALESCE(
      NULLIF(v.order_email, ''),
      NULLIF(v.member_email, '')
    ) AS row_email,
    COALESCE(
      NULLIF(v.order_phone, ''),
      NULLIF(v.member_phone, '')
    ) AS row_phone
  FROM valid_orders v
  WHERE CASE
    WHEN v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE THEN
      COALESCE(v.who_receive, v.orderer_name, '') <> ''
    ELSE TRUE
  END
)
SELECT
  k.customer_key,
  CASE
    WHEN k.customer_key LIKE 'user:%' THEN
      COALESCE(
        MAX(NULLIF(k.member_name, '')),
        MAX(NULLIF(k.who_receive, '')),
        MAX(NULLIF(k.orderer_name, ''))
      )
    ELSE
      COALESCE(
        MAX(NULLIF(k.who_receive, '')),
        MAX(NULLIF(k.orderer_name, ''))
      )
  END AS customer_name,
  COUNT(*)::int AS order_count,
  COUNT(*) FILTER (WHERE k.payment_step = 'verified')::int AS verified_order_count,
  COUNT(*) FILTER (WHERE k.payment_step IN ('pending', 'submitted'))::int AS unpaid_order_count,
  BOOL_OR(k.payment_step IN ('pending', 'submitted')) AS has_unpaid_orders,
  MAX(k.created_at) AS last_purchase_at,
  MAX(k.row_email) AS primary_email,
  MAX(k.row_phone) AS primary_phone,
  MAX(k.effective_line_id) AS line_user_id,
  BOOL_OR(k.effective_line_id IS NOT NULL) AS has_line,
  BOOL_OR(k.row_email IS NOT NULL) AS has_email,
  BOOL_OR(k.row_phone IS NOT NULL) AS has_phone,
  (COUNT(*) >= 2) AS is_repeat_customer
FROM keyed k
GROUP BY k.customer_key;

ALTER VIEW public.order_customer_rollup SET (security_invoker = on);
GRANT SELECT ON public.order_customer_rollup TO authenticated;

-- customer_360：同步管理員 LINE 清單；報價單與手動單同等處理
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

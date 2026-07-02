-- 訂單客戶總覽：以有效訂單彙整客戶（與 LINE customer_360 互補）
-- 手動單：僅依 who_receive / orderer_name（原樣，不合併相似姓名），不使用 user_id
-- 網站會員單：依 user_id（排除管理員）

DROP VIEW IF EXISTS public.order_customer_rollup;

CREATE VIEW public.order_customer_rollup AS
WITH admin_user_ids AS (
  SELECT ur.user_id
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
),
admin_line_ids AS (
  SELECT DISTINCT TRIM(ul.line_user_id) AS line_user_id
  FROM public.user_roles ur
  JOIN public.user_log_in ul ON ul.id = ur.user_id
  WHERE ur.role = 'admin'
    AND ul.line_user_id IS NOT NULL
    AND TRIM(ul.line_user_id) <> ''
),
valid_orders AS (
  SELECT
    o.id,
    o.is_manual_order,
    o.user_id,
    o.who_receive,
    o.orderer_name,
    o."Email" AS order_email,
    o.phone AS order_phone,
    o.line_user_id AS order_line_id,
    o.created_at,
    u.name AS member_name,
    u.email AS member_email,
    u.phone AS member_phone,
    u.line_user_id AS member_line_id
  FROM public.orders o
  LEFT JOIN public.user_log_in u ON u.id = o.user_id
  WHERE o.order_status IN ('processing', 'shipped', 'delivered')
    AND o.payment_step = 'verified'
),
keyed AS (
  SELECT
    v.*,
    CASE
      WHEN v.is_manual_order IS TRUE THEN
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
      WHEN v.user_id IS NOT NULL AND v.user_id NOT IN (SELECT user_id FROM admin_user_ids) THEN
        'user:' || v.user_id::text
      ELSE
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
    END AS customer_key,
    CASE
      WHEN NULLIF(TRIM(v.order_line_id), '') IS NOT NULL
        AND TRIM(v.order_line_id) NOT IN (SELECT line_user_id FROM admin_line_ids)
      THEN TRIM(v.order_line_id)
      WHEN v.is_manual_order IS FALSE
        AND NULLIF(TRIM(v.member_line_id), '') IS NOT NULL
        AND TRIM(v.member_line_id) NOT IN (SELECT line_user_id FROM admin_line_ids)
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
    WHEN v.is_manual_order IS TRUE THEN
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

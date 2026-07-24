-- 訂單客戶 CRM：管理員手寫公司名稱（不寫入 orders.TAX_title）
-- 並更新 rollup：稅籍抬頭 + 手寫覆蓋合併顯示

CREATE TABLE IF NOT EXISTS public.order_customer_crm (
  customer_key text PRIMARY KEY,
  company_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.order_customer_crm IS
  '訂單客戶總覽專用 CRM 欄位；不影響 orders 管理／發票抬頭';
COMMENT ON COLUMN public.order_customer_crm.company_name IS
  '管理員手寫公司名稱；有值時優於發票抬頭顯示';

ALTER TABLE public.order_customer_crm ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order_customer_crm" ON public.order_customer_crm;
CREATE POLICY "Admins can manage order_customer_crm"
  ON public.order_customer_crm FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_customer_crm TO authenticated;

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
    o.admin_note,
    o.customer_type,
    NULLIF(TRIM(o."TAX_title"), '') AS tax_title,
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
    CASE
      WHEN v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE THEN
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
      WHEN v.user_id IS NOT NULL AND v.user_id NOT IN (SELECT user_id FROM admin_user_ids) THEN
        'user:' || v.user_id::text
      ELSE
        'name:' || COALESCE(v.who_receive, v.orderer_name, '')
    END AS customer_key,
    CASE
      WHEN v.is_manual_order IS TRUE OR v.is_from_quotation IS TRUE THEN
        CASE
          WHEN NULLIF(TRIM(v.order_line_id), '') IS NOT NULL
            AND TRIM(v.order_line_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
          THEN TRIM(v.order_line_id)
          ELSE NULL
        END
      ELSE
        COALESCE(
          CASE
            WHEN NULLIF(TRIM(v.order_line_id), '') IS NOT NULL
              AND TRIM(v.order_line_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
            THEN TRIM(v.order_line_id)
            ELSE NULL
          END,
          CASE
            WHEN NULLIF(TRIM(v.member_line_id), '') IS NOT NULL
              AND TRIM(v.member_line_id) NOT IN (SELECT line_user_id FROM public.admin_line_user_ids)
            THEN TRIM(v.member_line_id)
            ELSE NULL
          END
        )
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
),
aggregated AS (
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
    (COUNT(*) >= 2) AS is_repeat_customer,
    (ARRAY_AGG(k.admin_note ORDER BY k.created_at DESC NULLS LAST))[1] AS admin_note,
    (ARRAY_AGG(k.customer_type ORDER BY k.created_at DESC NULLS LAST))[1] AS customer_type,
    (ARRAY_AGG(k.tax_title ORDER BY k.created_at DESC NULLS LAST)
      FILTER (WHERE k.tax_title IS NOT NULL))[1] AS tax_title
  FROM keyed k
  GROUP BY k.customer_key
)
SELECT
  a.*,
  NULLIF(TRIM(crm.company_name), '') AS company_name_override,
  COALESCE(
    NULLIF(TRIM(crm.company_name), ''),
    a.tax_title
  ) AS company_name
FROM aggregated a
LEFT JOIN public.order_customer_crm crm ON crm.customer_key = a.customer_key;

ALTER VIEW public.order_customer_rollup SET (security_invoker = on);
GRANT SELECT ON public.order_customer_rollup TO authenticated;

COMMENT ON VIEW public.order_customer_rollup IS
  '訂單客戶總覽：含 admin_note、customer_type、tax_title；company_name = 手寫覆蓋優先，否則發票抬頭';

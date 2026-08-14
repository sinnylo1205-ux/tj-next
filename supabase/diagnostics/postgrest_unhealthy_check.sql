-- =============================================================================
-- PostgREST Unhealthy 排查（在 Supabase Dashboard → SQL Editor 執行）
-- 專案：tj-dessert-hub
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) 先強制請 PostgREST 重載 schema（你列的安全牌）
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- 1) 壞掉的 View / 無法解析的 relation（最常見會讓 schema cache 爆炸）
--    有列 = 有問題；空結果 = 這項 OK
-- ---------------------------------------------------------------------------
SELECT
  n.nspname AS schema,
  c.relname AS view_name,
  pg_get_viewdef(c.oid, true) IS NULL AS def_missing
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
ORDER BY 1, 2;

-- 逐一「編譯」公開 view：哪個失敗就會直接報錯（看 Messages）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS fq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v' AND n.nspname = 'public'
  LOOP
    BEGIN
      EXECUTE format('SELECT * FROM %s LIMIT 0', r.fq);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'BROKEN VIEW: % → %', r.fq, SQLERRM;
    END;
  END LOOP;
END $$;

-- 重點 view 手動再查一次（有錯會直接紅字）
SELECT 'customer_360' AS v, COUNT(*) AS n FROM public.customer_360;
SELECT 'order_customer_rollup' AS v, COUNT(*) AS n FROM public.order_customer_rollup;
SELECT 'admin_line_user_ids' AS v, COUNT(*) AS n FROM public.admin_line_user_ids;

-- ---------------------------------------------------------------------------
-- 2) Roles / Grants：PostgREST 連線角色是否還在、能不能用 DB
-- ---------------------------------------------------------------------------
SELECT rolname, rolcanlogin, rolsuper, rolreplication
FROM pg_roles
WHERE rolname IN (
  'anon', 'authenticated', 'service_role',
  'authenticator', 'supabase_admin', 'postgres'
)
ORDER BY rolname;

-- authenticator 是否能切換到 anon / authenticated（PostgREST 必要）
SELECT r.rolname AS role, m.rolname AS member_of
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.member
JOIN pg_roles m ON m.oid = am.roleid
WHERE r.rolname = 'authenticator'
   OR m.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY 1, 2;

-- 最近兩張表的權限（對照近期 migration；權限錯通常不會讓整顆 PostgREST Unhealthy，
-- 但可排除「被誤 REVOKE」）
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('cart', 'ai_render_usage', 'Website_photo_material')
ORDER BY table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 3) 最近 schema 變更跡象（輔助判斷，非直接證明）
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS relation,
  n.nspname AS schema,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
    WHEN 'f' THEN 'foreign'
    ELSE c.relkind::text
  END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'cart', 'ai_render_usage',
    'customer_360', 'order_customer_rollup', 'admin_line_user_ids',
    'Website_photo_material'
  )
ORDER BY 2, 1;

-- cart.unit_price 是否已套用（近期 migration；缺欄不會弄掛 PostgREST）
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'cart'
  AND column_name IN ('unit_price', 'total_price', 'user_id')
ORDER BY column_name;

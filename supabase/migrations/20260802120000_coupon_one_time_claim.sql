-- Enforce one-time checkout coupons server-side.
--
-- Before: calculate-checkout only *read* user_log_in.used_coupons, and the
-- browser appended the code after order insert. Members can UPDATE their own
-- user_log_in row (including clearing used_coupons), or skip the write entirely,
-- so deep discount codes (e.g. TJ88888888 20% off) were reusable forever.
--
-- After:
--   1) Atomic claim RPCs append a code only if absent.
--   2) Members/anon cannot shrink or clear used_coupons (append-only).
--   3) Admins / service_role retain full control for support.

CREATE OR REPLACE FUNCTION public.claim_user_coupon_for_user(
  p_user_id uuid,
  p_coupon_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_coupon_code, '')));
  v_updated uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon code required';
  END IF;

  UPDATE public.user_log_in
  SET used_coupons = array_append(COALESCE(used_coupons, '{}'::text[]), v_code)
  WHERE id = p_user_id
    AND NOT (v_code = ANY (COALESCE(used_coupons, '{}'::text[])))
  RETURNING id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.claim_user_coupon_for_user(uuid, text) IS
  'Atomically mark a checkout coupon used for a user. Returns true if newly claimed, false if already present.';

CREATE OR REPLACE FUNCTION public.claim_user_coupon(p_coupon_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.claim_user_coupon_for_user(v_uid, p_coupon_code);
END;
$$;

COMMENT ON FUNCTION public.claim_user_coupon(text) IS
  'Atomically mark a checkout coupon used for auth.uid(). Returns true if newly claimed.';

REVOKE ALL ON FUNCTION public.claim_user_coupon_for_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_user_coupon_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_user_coupon_for_user(uuid, text) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.claim_user_coupon(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_user_coupon(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_user_coupon(text) TO authenticated, postgres, service_role;

CREATE OR REPLACE FUNCTION public.enforce_used_coupons_monotonic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.used_coupons IS NOT DISTINCT FROM NEW.used_coupons THEN
    RETURN NEW;
  END IF;

  -- service_role / postgres / admin may fully edit (support / migrations).
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  -- Members: used_coupons is append-only (no clear / remove / replace-shrink).
  IF NOT (COALESCE(OLD.used_coupons, '{}'::text[]) <@ COALESCE(NEW.used_coupons, '{}'::text[])) THEN
    RAISE EXCEPTION 'used_coupons cannot be cleared or reduced';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_used_coupons_monotonic ON public.user_log_in;
CREATE TRIGGER trg_enforce_used_coupons_monotonic
  BEFORE UPDATE ON public.user_log_in
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_used_coupons_monotonic();

-- SECURITY DEFINER storage cleanup RPCs must not be callable by anon/authenticated.
-- PostgreSQL grants EXECUTE to PUBLIC by default; PostgREST exposes public RPCs.
-- Cleanup is intended for privileged/cron paths only (customizer cleanup already
-- moved to an Edge Function with x-cron-secret).

REVOKE ALL ON FUNCTION public.cleanup_line_images() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_line_images() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_line_images() FROM authenticated;

REVOKE ALL ON FUNCTION public.cleanup_customizer_uploads() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_customizer_uploads() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_customizer_uploads() FROM authenticated;

-- Keep available to privileged DB roles if an operator needs to invoke manually.
GRANT EXECUTE ON FUNCTION public.cleanup_line_images() TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_line_images() TO service_role;

GRANT EXECUTE ON FUNCTION public.cleanup_customizer_uploads() TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_customizer_uploads() TO service_role;

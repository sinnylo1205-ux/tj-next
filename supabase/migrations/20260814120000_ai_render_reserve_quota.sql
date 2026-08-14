-- 原子鎖定 AI 擬真渲染每日額度，避免並行 POST 在 count→insert 之間突破上限。
-- 僅 service_role（Next.js /api/customizer/ai-render）可呼叫。

CREATE OR REPLACE FUNCTION public.try_reserve_ai_render(
  p_user_id uuid,
  p_source_image_url text,
  p_daily_limit integer,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  used integer;
  new_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_daily_limit IS NULL OR p_daily_limit < 1 THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ai_render:' || p_user_id::text));

  SELECT count(*)::integer INTO used
  FROM public.ai_render_usage
  WHERE user_id = p_user_id
    AND created_at >= p_start
    AND created_at <= p_end;

  IF used >= p_daily_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ai_render_usage (user_id, source_image_url, result_image_url)
  VALUES (p_user_id, p_source_image_url, NULL)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION public.try_reserve_ai_render(uuid, text, integer, timestamptz, timestamptz) IS
  '交易內 advisory lock 後計次並插入 ai_render_usage；已達上限回傳 NULL';

REVOKE ALL ON FUNCTION public.try_reserve_ai_render(uuid, text, integer, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_reserve_ai_render(uuid, text, integer, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_reserve_ai_render(uuid, text, integer, timestamptz, timestamptz) TO service_role;

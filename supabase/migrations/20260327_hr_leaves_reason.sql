-- =============================================
-- 為 hr_leaves 新增 reason 欄位
-- 請在 Supabase SQL Editor 執行
-- =============================================

ALTER TABLE public.hr_leaves
  ADD COLUMN IF NOT EXISTS reason text DEFAULT '';

COMMENT ON COLUMN public.hr_leaves.reason IS '請假事由';

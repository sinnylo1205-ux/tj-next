-- 報價單：管理員可隱藏（不影響既有資料；預設顯示）
ALTER TABLE public.quotation_orders
  ADD COLUMN IF NOT EXISTS is_hide boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotation_orders.is_hide IS '管理員隱藏後，預設列表不顯示（仍可於後台勾選顯示）';

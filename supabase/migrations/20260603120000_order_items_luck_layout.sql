-- 幸運籤餅：自動排版 Excel 產物欄位

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS luck_layout_xlsx_url text,
  ADD COLUMN IF NOT EXISTS luck_layout_status text,
  ADD COLUMN IF NOT EXISTS luck_layout_error text;

COMMENT ON COLUMN public.order_items.luck_layout_xlsx_url IS '幸運籤餅純文字 CSV 排版後的 xlsx 公開 URL';
COMMENT ON COLUMN public.order_items.luck_layout_status IS 'pending | ready | failed | skipped';
COMMENT ON COLUMN public.order_items.luck_layout_error IS '排版失敗原因（僅後台參考）';

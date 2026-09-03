-- 統一編號為 8 碼字串，不可存成數字（會丟失開頭的 0）
ALTER TABLE public.orders
  ALTER COLUMN "TAX_id" TYPE text
  USING (
    CASE
      WHEN "TAX_id" IS NULL THEN NULL
      WHEN TRIM(("TAX_id")::text) = '' THEN NULL
      ELSE LPAD(REGEXP_REPLACE(("TAX_id")::text, '[^0-9]', '', 'g'), 8, '0')
    END
  );

COMMENT ON COLUMN public.orders."TAX_id" IS '統一編號（8 碼字串，可含開頭 0）';

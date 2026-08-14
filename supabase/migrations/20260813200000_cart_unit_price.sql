-- 購物車設計後單價（甜點加價後單價，不含包裝／條件費等）
ALTER TABLE public.cart
  ADD COLUMN IF NOT EXISTS unit_price numeric;

COMMENT ON COLUMN public.cart.unit_price IS
  '設計後單價：甜點客製後單價（對應 calculate-price.unit_price），不含包裝費用；總價仍存於 total_price';

COMMENT ON COLUMN public.cart.total_price IS
  '品項總價（grand_total）：含甜點小計、包裝、條件費等';


-- Enable RLS on quotation tables
ALTER TABLE public.quotation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_order_items ENABLE ROW LEVEL SECURITY;

-- Admin full access to quotation_orders
CREATE POLICY "Admins can manage quotation_orders"
  ON public.quotation_orders FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role full access to quotation_orders
CREATE POLICY "Service role can manage quotation_orders"
  ON public.quotation_orders FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Admin full access to quotation_order_items
CREATE POLICY "Admins can manage quotation_order_items"
  ON public.quotation_order_items FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role full access to quotation_order_items
CREATE POLICY "Service role can manage quotation_order_items"
  ON public.quotation_order_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

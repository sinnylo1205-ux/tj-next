-- products: admin 可更新
CREATE POLICY "Admins can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Website_photo_material: admin 可更新
CREATE POLICY "Admins can update website photo material"
  ON "Website_photo_material" FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
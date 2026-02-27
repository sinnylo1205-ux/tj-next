
DROP POLICY IF EXISTS "Admins or service_role can delete orders" ON orders;
DROP POLICY IF EXISTS "Admins or service_role can delete order_items" ON order_items;
DROP POLICY IF EXISTS "Admins or service_role can delete order_item_options" ON order_item_options;

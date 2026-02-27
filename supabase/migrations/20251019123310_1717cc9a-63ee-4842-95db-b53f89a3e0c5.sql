-- 清理 products 表中的重複禮盒商品記錄
-- 保留較早創建的記錄，刪除重複的
DELETE FROM products 
WHERE id IN (
  'adb86cfd-ce3c-44a8-91b1-cffcad1792bd',
  '318fc622-2b5b-47bf-8b2d-0ddd2cbd3bd8', 
  '709de8f6-32b9-4e0c-838b-26ac75fc58dc'
);
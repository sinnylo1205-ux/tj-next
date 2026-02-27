-- 更新三款瑪德蓮禮盒價格為 999 元
UPDATE products 
SET price = 999
WHERE name IN ('星空瑪德蓮禮盒', '花朵瑪德蓮禮盒', '客製化禮盒');
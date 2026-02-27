-- 新增手機版圖片欄位到 Website_photo_material 表
ALTER TABLE "Website_photo_material" 
ADD COLUMN IF NOT EXISTS photo_url_mobile TEXT,
ADD COLUMN IF NOT EXISTS ui_width_mobile INTEGER,
ADD COLUMN IF NOT EXISTS ui_height_mobile INTEGER;

-- 更新 gift_box 頁面的手機版圖片
UPDATE "Website_photo_material" 
SET 
  photo_url_mobile = 'https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/gift_box/phone/phone1.webp',
  ui_width_mobile = 1170,
  ui_height_mobile = 2532
WHERE category = 'gift_box' AND sort_order = 1;

UPDATE "Website_photo_material" 
SET 
  photo_url_mobile = 'https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/gift_box/phone/phone2.webp',
  ui_width_mobile = 1170,
  ui_height_mobile = 2532
WHERE category = 'gift_box' AND sort_order = 2;

UPDATE "Website_photo_material" 
SET 
  photo_url_mobile = 'https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/gift_box/phone/pho3.webp',
  ui_width_mobile = 1170,
  ui_height_mobile = 2532
WHERE category = 'gift_box' AND sort_order = 3;
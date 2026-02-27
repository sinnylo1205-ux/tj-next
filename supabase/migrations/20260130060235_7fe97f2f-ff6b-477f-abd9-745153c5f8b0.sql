-- 刪除 orders_public 視圖
-- 該視圖原本是為了對外隱藏部分敏感欄位（如 transfer_last5）而建立
-- 但實際上仍暴露太多 PII（收件地址、Email 等），且沒有設定 RLS
-- 改用 orders 表的現有 RLS 政策即可確保資料安全

DROP VIEW IF EXISTS public.orders_public;
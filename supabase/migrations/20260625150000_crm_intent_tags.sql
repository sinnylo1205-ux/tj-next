-- CRM 標籤改版：從「處理狀態」(緊急/待處理/已下單) 改為「下單意願」三級(高/中/低)。
-- 「已成交」「沉睡」改由系統依訂單事實/互動時間自動計算，不再當作可儲存標籤。
-- 另新增 tag_source 區分標籤來源：ai=批次自動標、manual=人工確認；批次不可覆蓋人工標籤。

-- 1) chat_state.tag：舊值語意不同無法對應，先清空再更換 CHECK 值域
ALTER TABLE public.chat_state DROP CONSTRAINT IF EXISTS chat_state_tag_check;

UPDATE public.chat_state
  SET tag = NULL
  WHERE tag IS NOT NULL AND tag NOT IN ('高意願', '中意願', '低意願');

ALTER TABLE public.chat_state
  ADD CONSTRAINT chat_state_tag_check
  CHECK (tag IS NULL OR tag IN ('高意願', '中意願', '低意願'));

COMMENT ON COLUMN public.chat_state.tag IS '下單意願標籤：高意願、中意願、低意願';

-- 2) 新增 tag_source：標籤來源（ai 自動 / manual 人工確認）
ALTER TABLE public.chat_state
  ADD COLUMN IF NOT EXISTS tag_source text;

ALTER TABLE public.chat_state DROP CONSTRAINT IF EXISTS chat_state_tag_source_check;
ALTER TABLE public.chat_state
  ADD CONSTRAINT chat_state_tag_source_check
  CHECK (tag_source IS NULL OR tag_source IN ('ai', 'manual'));

COMMENT ON COLUMN public.chat_state.tag_source IS '標籤來源：ai=批次自動標、manual=人工確認（人工優先，批次不覆蓋）';

-- 3) customer_ai_insights.suggested_tag：同步改值域
--    原 CHECK 為建表時的匿名 table constraint，名稱不確定，動態找出後移除。
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.customer_ai_insights'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%suggested_tag%'
  LIMIT 1;
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customer_ai_insights DROP CONSTRAINT %I', c);
  END IF;
END $$;

UPDATE public.customer_ai_insights
  SET suggested_tag = NULL
  WHERE suggested_tag IS NOT NULL AND suggested_tag NOT IN ('高意願', '中意願', '低意願');

ALTER TABLE public.customer_ai_insights
  ADD CONSTRAINT customer_ai_insights_suggested_tag_check
  CHECK (suggested_tag IS NULL OR suggested_tag IN ('高意願', '中意願', '低意願'));

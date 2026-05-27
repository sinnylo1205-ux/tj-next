-- chat_state：管理員客戶標籤（取代自由文字 note 的用途）
ALTER TABLE public.chat_state
  ADD COLUMN IF NOT EXISTS tag text;

ALTER TABLE public.chat_state DROP CONSTRAINT IF EXISTS chat_state_tag_check;
ALTER TABLE public.chat_state
  ADD CONSTRAINT chat_state_tag_check
  CHECK (tag IS NULL OR tag IN ('緊急', '待處理', '已下單'));

COMMENT ON COLUMN public.chat_state.tag IS '後台標籤：緊急、待處理、已下單';

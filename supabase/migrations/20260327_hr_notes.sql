-- =============================================
-- 人事管理：刪除 block 備註
-- 請在 Supabase SQL Editor 執行
-- =============================================

CREATE TABLE IF NOT EXISTS public.hr_notes (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text NOT NULL,
  note_date   date NOT NULL,
  slot        numeric(3,1) NOT NULL,   -- 被刪除的時段
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (employee_id, note_date, slot)
);

COMMENT ON TABLE  public.hr_notes IS '員工排班刪除備註（記錄刪除 block 的理由）';

CREATE INDEX IF NOT EXISTS idx_hr_notes_date ON public.hr_notes (note_date);

ALTER TABLE public.hr_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access on hr_notes"
  ON public.hr_notes FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

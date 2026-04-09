-- =============================================
-- 人事管理：員工排班 + 請假記錄
-- 請在 Supabase SQL Editor 執行
-- =============================================

-- 1. 員工排班表（每筆 = 一個半小時 block）
CREATE TABLE IF NOT EXISTS public.hr_schedule (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text        NOT NULL,              -- e.g. 'betty', 'xinyi'
  scheduled_date date     NOT NULL,              -- 排班日期
  slot        numeric(3,1) NOT NULL,             -- 8.0, 8.5, 9.0 … 17.5（半小時為單位）
  created_at  timestamptz  DEFAULT now(),
  UNIQUE (employee_id, scheduled_date, slot)
);

COMMENT ON TABLE  public.hr_schedule IS '員工排班表（半小時粒度）';
COMMENT ON COLUMN public.hr_schedule.slot IS '時段，8.0 表示 08:00–08:30，8.5 表示 08:30–09:00，以此類推';

-- 2. 請假記錄表
CREATE TABLE IF NOT EXISTS public.hr_leaves (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id text   NOT NULL,
  leave_date  date   NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (employee_id, leave_date)
);

COMMENT ON TABLE public.hr_leaves IS '員工請假記錄';

-- 3. 索引（加速按月查詢）
CREATE INDEX IF NOT EXISTS idx_hr_schedule_date ON public.hr_schedule (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_hr_leaves_date   ON public.hr_leaves (leave_date);

-- 4. RLS（僅允許已登入用戶操作，搭配前端 admin 檢查）
ALTER TABLE public.hr_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_leaves   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access on hr_schedule"
  ON public.hr_schedule FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access on hr_leaves"
  ON public.hr_leaves FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 人事請款報帳（依月份／員工）

CREATE TABLE IF NOT EXISTS public.hr_expense_claims (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id  text           NOT NULL,              -- e.g. 'betty', 'xinyi'
  year_month   text           NOT NULL,              -- 'yyyy-MM'
  title        text           NOT NULL,              -- 報帳名目
  amount       numeric(12, 2) NOT NULL CHECK (amount >= 0),
  proof_url    text,                                 -- 證明文件公開網址
  proof_path   text,                                 -- storage path（便於刪除）
  created_at   timestamptz    DEFAULT now()
);

COMMENT ON TABLE public.hr_expense_claims IS '人事請款報帳：依員工與月份；不影響排班／請假';
COMMENT ON COLUMN public.hr_expense_claims.year_month IS '歸屬月份，格式 yyyy-MM';

CREATE INDEX IF NOT EXISTS idx_hr_expense_claims_month
  ON public.hr_expense_claims (year_month);
CREATE INDEX IF NOT EXISTS idx_hr_expense_claims_emp_month
  ON public.hr_expense_claims (employee_id, year_month);

ALTER TABLE public.hr_expense_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access on hr_expense_claims"
  ON public.hr_expense_claims;
CREATE POLICY "Authenticated users full access on hr_expense_claims"
  ON public.hr_expense_claims FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

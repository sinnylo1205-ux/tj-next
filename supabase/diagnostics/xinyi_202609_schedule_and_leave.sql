-- 心怡：2026-09 起改週一至週五 14:00–18:00，並標記 9/14～月底工作日請假
-- 請在 Supabase SQL Editor 執行（可整段一次跑）
--
-- 薪資公式不變：日薪=26000/20、時薪=日薪/4、全日請假=4 小時、應發=月薪−請假扣薪+勞健保993
-- 9/14～9/30 工作日請假（略過週六日、中秋 9/25）：13 天
-- 扣薪 = 13 × 4 × (26000/20/4) = 13 × 1300 = 16,900
-- 應發 ≈ 26000 − 16900 + 993 = 10,093

BEGIN;

-- 1) 請假：9/14～9/30 的週一至週五，排除國定假日
INSERT INTO public.hr_leaves (employee_id, leave_date, reason)
SELECT
  'xinyi',
  d::date,
  '9/14 至月底請假'
FROM generate_series('2026-09-14'::date, '2026-09-30'::date, interval '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
  AND d::date NOT IN ('2026-09-25') -- 中秋節
ON CONFLICT (employee_id, leave_date) DO UPDATE
SET reason = EXCLUDED.reason;

-- 2) 清掉心怡 2026-09-01 起舊排班（原本週三～週五 09:00–18:00）
DELETE FROM public.hr_schedule
WHERE employee_id = 'xinyi'
  AND scheduled_date >= '2026-09-01';

-- 3) 新排班：週一～週五 14:00–18:00（slot 14.0～17.5）
--    跳過國定假日、已請假日
INSERT INTO public.hr_schedule (employee_id, scheduled_date, slot)
SELECT
  'xinyi',
  d::date,
  s
FROM generate_series('2026-09-01'::date, '2026-12-31'::date, interval '1 day') AS d
CROSS JOIN unnest(ARRAY[14.0, 14.5, 15.0, 15.5, 16.0, 16.5, 17.0, 17.5]::numeric[]) AS s
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
  AND d::date NOT IN ('2026-09-25', '2026-10-10') -- 中秋、國慶
  AND NOT EXISTS (
    SELECT 1
    FROM public.hr_leaves l
    WHERE l.employee_id = 'xinyi'
      AND l.leave_date = d::date
  )
ON CONFLICT (employee_id, scheduled_date, slot) DO NOTHING;

COMMIT;

-- 核對：九月請假天數應為 13
-- SELECT leave_date FROM public.hr_leaves
-- WHERE employee_id = 'xinyi' AND leave_date BETWEEN '2026-09-14' AND '2026-09-30'
-- ORDER BY 1;

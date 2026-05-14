import Holidays from "date-holidays";
import { format, startOfMonth, endOfMonth } from "date-fns";

const yearCache = new Map<number, Map<string, string>>();

function buildYearHolidayMap(year: number): Map<string, string> {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const hd = new Holidays("TW");
  const rows = hd.getHolidays(year) as { date: string | Date; name: string; type: string }[];
  const map = new Map<string, string>();

  for (const row of rows) {
    if (row.type !== "public") continue;
    const d =
      typeof row.date === "string" ? new Date(row.date.replace(/ /, "T")) : new Date(row.date);
    const key = format(d, "yyyy-MM-dd");
    const prev = map.get(key);
    map.set(key, prev ? `${prev}、${row.name}` : row.name);
  }

  yearCache.set(year, map);
  return map;
}

/**
 * 台灣國定假日（date-holidays `TW` + `public`），僅含該曆月內日期。
 * 同日多筆假日名稱以「、」合併。
 */
export function getTaiwanPublicHolidaysInCalendarMonth(month: Date): Map<string, string> {
  const y = month.getFullYear();
  const yearMap = buildYearHolidayMap(y);
  const startStr = format(startOfMonth(month), "yyyy-MM-dd");
  const endStr = format(endOfMonth(month), "yyyy-MM-dd");
  const out = new Map<string, string>();
  yearMap.forEach((name, dateStr) => {
    if (dateStr >= startStr && dateStr <= endStr) out.set(dateStr, name);
  });
  return out;
}

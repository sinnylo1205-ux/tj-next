"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Download, Trash2, Plus } from "lucide-react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  getDaysInMonth,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getTaiwanPublicHolidaysInCalendarMonth } from "@/lib/taiwan-public-holidays";
import * as XLSX from "xlsx";
import type { CellObject } from "xlsx";

// ── 型別 ──

interface Employee {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

interface ScheduleBlock {
  id: string;
  employeeId: string;
  date: string;
  slot: number; // 8, 8.5, 9, 9.5, … 17.5
}

// ── 常數 ──

const EMPLOYEES: Employee[] = [
  { id: "betty", name: "Betty", color: "#DDD6FE", textColor: "#5B21B6" },
  { id: "xinyi", name: "心怡", color: "#FED7AA", textColor: "#C2410C" },
];

// 23 half-hour slots: 8, 8.5, 9, 9.5, … 18, 18.5, 19 (08:00–19:00)
const SLOTS = Array.from({ length: 23 }, (_, i) => 8 + i * 0.5);

function slotLabel(s: number): string {
  const h = Math.floor(s);
  const m = s % 1 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

function isFullHour(s: number): boolean {
  return s % 1 === 0;
}

const DEFAULT_WORK_DAYS = [3, 4, 5]; // Wed, Thu, Fri
const DEFAULT_START = 9;
const DEFAULT_END = 18; // 9:00–18:00 → slots 9, 9.5, 10, … 17.5

/** Excel 匯出：日薪（元／天）；月薪 = 日薪 × 工作天數（有上班日數，不含請假與無打卡日） */
const HR_EXPORT_DAILY_WAGE_YUAN = 1262;
/** 附於「日薪」儲存格之 Excel 備註 */
const HR_EXPORT_DAILY_WAGE_COMMENT = "1262元=15144/12個工作天=1262元/天";

function isWeekday(date: Date): boolean {
  const d = getDay(date);
  return d >= 1 && d <= 5;
}

function generateDefaultBlocks(month: Date): ScheduleBlock[] {
  const twHolidays = getTaiwanPublicHolidaysInCalendarMonth(month);
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const blocks: ScheduleBlock[] = [];

  days.forEach((day) => {
    if (!DEFAULT_WORK_DAYS.includes(getDay(day))) return;
    const dateStr = format(day, "yyyy-MM-dd");
    if (twHolidays.has(dateStr)) return;
    EMPLOYEES.forEach((emp) => {
      SLOTS.forEach((slot) => {
        if (slot >= DEFAULT_START && slot < DEFAULT_END) {
          blocks.push({ id: `${emp.id}-${dateStr}-${slot}`, employeeId: emp.id, date: dateStr, slot });
        }
      });
    });
  });
  return blocks;
}

function getWeekdaysInMonth(month: Date): Date[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  return eachDayOfInterval({ start, end }).filter(isWeekday);
}

// ── 元件 ──

const AdminHRPanel = () => {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [leaveRecords, setLeaveRecords] = useState<Set<string>>(new Set());
  const [dragData, setDragData] = useState<{ blockId: string } | null>(null);
  const [leaveDialogDate, setLeaveDialogDate] = useState<string | null>(null);
  const [leaveSelectedEmp, setLeaveSelectedEmp] = useState<string | null>(null);
  const [leaveReason, setLeaveReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 刪除備註：key = "employeeId-date-slot", value = reason
  const [deleteNotes, setDeleteNotes] = useState<Map<string, string>>(new Map());
  // 請假備註：key = "employeeId-date", value = reason
  const [leaveReasons, setLeaveReasons] = useState<Map<string, string>>(new Map());
  // 待刪除 block（顯示理由 dialog）
  const [pendingDelete, setPendingDelete] = useState<{ blockId: string; employeeId: string; date: string; slot: number } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const weekdays = useMemo(() => getWeekdaysInMonth(currentMonth), [currentMonth]);

  const taiwanHolidays = useMemo(
    () => getTaiwanPublicHolidaysInCalendarMonth(currentMonth),
    [currentMonth],
  );

  const blockMap = useMemo(() => {
    const m = new Map<string, ScheduleBlock>();
    blocks.forEach((b) => m.set(`${b.employeeId}-${b.date}-${b.slot}`, b));
    return m;
  }, [blocks]);

  // ── Supabase 載入 ──
  const loadMonth = useCallback(async (month: Date) => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    const [schedRes, leaveRes, notesRes] = await Promise.all([
      supabase.from("hr_schedule").select("*").gte("scheduled_date", start).lte("scheduled_date", end),
      supabase.from("hr_leaves").select("*").gte("leave_date", start).lte("leave_date", end),
      supabase.from("hr_notes").select("*").gte("note_date", start).lte("note_date", end),
    ]);

    if (schedRes.error) {
      toast({ title: "載入排班失敗", description: schedRes.error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const dbBlocks: ScheduleBlock[] = (schedRes.data || []).map((r: any) => ({
      id: `${r.employee_id}-${r.scheduled_date}-${Number(r.slot)}`,
      employeeId: r.employee_id,
      date: r.scheduled_date,
      slot: Number(r.slot),
    }));

    const holidayMap = getTaiwanPublicHolidaysInCalendarMonth(month);
    const cleanedBlocks = dbBlocks.filter((b) => !holidayMap.has(b.date));

    // If no schedule data for this month, generate defaults and save
    if (dbBlocks.length === 0) {
      const defaults = generateDefaultBlocks(month);
      setBlocks(defaults);
      await saveBlocksToDB(defaults, month);
    } else {
      setBlocks(cleanedBlocks);
      if (cleanedBlocks.length !== dbBlocks.length) {
        await saveBlocksToDB(cleanedBlocks, month);
      }
    }

    const leaves = new Set<string>();
    const lReasons = new Map<string, string>();
    (leaveRes.data || []).forEach((r: any) => {
      const key = `${r.employee_id}-${r.leave_date}`;
      leaves.add(key);
      if (r.reason) lReasons.set(key, r.reason);
    });
    setLeaveRecords(leaves);
    setLeaveReasons(lReasons);

    const notes = new Map<string, string>();
    (notesRes.data || []).forEach((r: any) => {
      notes.set(`${r.employee_id}-${r.note_date}-${Number(r.slot)}`, r.reason);
    });
    setDeleteNotes(notes);

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadMonth(currentMonth);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Supabase 儲存 ──
  const saveBlocksToDB = async (blocksToSave: ScheduleBlock[], month: Date) => {
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    // 1. 先刪除該月所有排班
    const { error: delErr } = await supabase.from("hr_schedule").delete().gte("scheduled_date", start).lte("scheduled_date", end);
    if (delErr) {
      console.error("Delete schedule error:", delErr);
    }

    if (blocksToSave.length === 0) return;

    const rows = blocksToSave.map((b) => ({
      employee_id: b.employeeId,
      scheduled_date: b.date,
      slot: b.slot,
    }));

    // 2. 用 upsert 寫入（避免殘留 row 導致 duplicate key）
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("hr_schedule")
        .upsert(batch, { onConflict: "employee_id,scheduled_date,slot" });
      if (error) {
        console.error("Save schedule error:", error);
        toast({ title: "儲存排班失敗", description: error.message, variant: "destructive" });
        return;
      }
    }
  };

  const persistBlocks = useCallback(async (nextBlocks: ScheduleBlock[]) => {
    setSaving(true);
    await saveBlocksToDB(nextBlocks, currentMonth);
    setSaving(false);
  }, [currentMonth]);

  // Helper: update blocks + persist
  const updateBlocks = useCallback((updater: (prev: ScheduleBlock[]) => ScheduleBlock[]) => {
    setBlocks((prev) => {
      const next = updater(prev);
      persistBlocks(next);
      return next;
    });
  }, [persistBlocks]);

  const switchMonth = useCallback(async (dir: 1 | -1) => {
    const next = dir === 1 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1);
    setCurrentMonth(next);
    await loadMonth(next);
  }, [currentMonth, loadMonth]);

  // ── Drag & Drop ──
  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    setDragData({ blockId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetDate: string, targetSlot: number) => {
    e.preventDefault();
    if (!dragData) return;
    if (taiwanHolidays.has(targetDate)) {
      setDragData(null);
      return;
    }
    const block = blocks.find((b) => b.id === dragData.blockId);
    if (!block) return;

    if (blockMap.has(`${block.employeeId}-${targetDate}-${targetSlot}`)) {
      setDragData(null);
      return;
    }

    updateBlocks((prev) =>
      prev.map((b) =>
        b.id === dragData.blockId
          ? { ...b, date: targetDate, slot: targetSlot, id: `${b.employeeId}-${targetDate}-${targetSlot}` }
          : b,
      ),
    );
    setDragData(null);
  };

  const handleDelete = (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    setPendingDelete({ blockId, employeeId: block.employeeId, date: block.date, slot: block.slot });
    setDeleteReason("");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { blockId, employeeId, date, slot } = pendingDelete;
    const reason = deleteReason.trim();

    updateBlocks((prev) => prev.filter((b) => b.id !== blockId));

    if (reason) {
      const noteKey = `${employeeId}-${date}-${slot}`;
      setDeleteNotes((prev) => new Map(prev).set(noteKey, reason));
      await supabase.from("hr_notes").upsert(
        { employee_id: employeeId, note_date: date, slot, reason },
        { onConflict: "employee_id,note_date,slot" },
      );
    }

    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    toast({ title: `✅ 已刪除 ${emp?.name ?? employeeId} ${slotLabel(slot)} 的排班` });
    setPendingDelete(null);
  };

  const handleAddBlock = (employeeId: string, date: string, slot: number) => {
    if (taiwanHolidays.has(date)) return;
    const key = `${employeeId}-${date}-${slot}`;
    if (blockMap.has(key)) return;
    updateBlocks((prev) => [...prev, { id: key, employeeId, date, slot }]);
  };

  // ── 請假 ──
  const handleLeave = async (employeeId: string, date: string, reason: string) => {
    if (taiwanHolidays.has(date)) {
      toast({ title: "此日為國定假日", description: "無需標記請假。", variant: "destructive" });
      return;
    }
    updateBlocks((prev) => prev.filter((b) => !(b.employeeId === employeeId && b.date === date)));
    const key = `${employeeId}-${date}`;
    setLeaveRecords((prev) => new Set(prev).add(key));
    if (reason) setLeaveReasons((prev) => new Map(prev).set(key, reason));
    await supabase.from("hr_leaves").upsert(
      { employee_id: employeeId, leave_date: date, reason: reason || "" },
      { onConflict: "employee_id,leave_date" },
    );
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    toast({ title: `✅ 已標記 ${emp?.name ?? employeeId} 於 ${date} 請假` });
    setLeaveSelectedEmp(null);
    setLeaveReason("");
  };

  const handleCancelLeave = async (employeeId: string, date: string) => {
    setLeaveRecords((prev) => {
      const next = new Set(prev);
      next.delete(`${employeeId}-${date}`);
      return next;
    });
    await supabase.from("hr_leaves").delete().eq("employee_id", employeeId).eq("leave_date", date);

    // Restore default blocks if it's a default work day
    const d = new Date(date);
    if (DEFAULT_WORK_DAYS.includes(getDay(d)) && !taiwanHolidays.has(date)) {
      const restored: ScheduleBlock[] = [];
      SLOTS.forEach((slot) => {
        if (slot >= DEFAULT_START && slot < DEFAULT_END) {
          const key = `${employeeId}-${date}-${slot}`;
          if (!blockMap.has(key)) {
            restored.push({ id: key, employeeId, date, slot });
          }
        }
      });
      if (restored.length > 0) {
        updateBlocks((prev) => [...prev, ...restored]);
      }
    }
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    toast({ title: `✅ 已取消 ${emp?.name ?? employeeId} 於 ${date} 的請假` });
  };

  // ── Excel 匯出 ──
  const exportExcel = () => {
    const monthStr = format(currentMonth, "yyyyMM");
    const monthNum = format(currentMonth, "M");
    const daysInMonth = getDaysInMonth(currentMonth);
    const holidayMap = getTaiwanPublicHolidaysInCalendarMonth(currentMonth);
    const wb = XLSX.utils.book_new();

    EMPLOYEES.forEach((emp) => {
      const empBlocks = blocks.filter((b) => b.employeeId === emp.id);
      const dateSlots = new Map<string, number[]>();
      empBlocks.forEach((b) => {
        const arr = dateSlots.get(b.date) || [];
        arr.push(b.slot);
        dateSlots.set(b.date, arr);
      });

      const rows: (string | number | null | CellObject)[][] = [];
      rows.push([`${emp.name}${monthNum}月薪資`, null, null, null, null, null, null, null]);
      rows.push(["日期", "上班", "下班", "加班開始", "遲到分鐘", "加班時數", "加班費", "備註"]);

      let totalWorkHours = 0;
      let workingDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d), "yyyy-MM-dd");
        const slots = (dateSlots.get(dateStr) || []).sort((a, b) => a - b);
        const isLeave = leaveRecords.has(`${emp.id}-${dateStr}`);
        const twHolidayName = holidayMap.get(dateStr);

        if (twHolidayName) {
          rows.push([dateStr, null, null, null, null, null, null, `國定假日：${twHolidayName}`]);
          continue;
        }

        // 收集該天的刪除備註
        const dayNotes: string[] = [];
        deleteNotes.forEach((reason, key) => {
          if (key.startsWith(`${emp.id}-${dateStr}-`) && reason) {
            const s = Number(key.split("-").pop());
            dayNotes.push(`${slotLabel(s)}: ${reason}`);
          }
        });
        const leaveKey = `${emp.id}-${dateStr}`;
        const leaveReasonStr = leaveReasons.get(leaveKey);
        const leaveLabel = isLeave ? (leaveReasonStr ? `請假：${leaveReasonStr}` : "請假") : null;
        const noteStr = leaveLabel ?? (dayNotes.length > 0 ? dayNotes.join("；") : null);

        if (isLeave) {
          rows.push([dateStr, null, null, null, null, null, null, noteStr]);
        } else if (slots.length === 0) {
          rows.push([dateStr, null, null, null, null, null, null, noteStr]);
        } else {
          const clockIn = slotLabel(slots[0]);
          const lastSlot = slots[slots.length - 1];
          const clockOut = slotLabel(lastSlot + 0.5);
          totalWorkHours += slots.length * 0.5;
          workingDays += 1;
          rows.push([dateStr, clockIn, clockOut, null, null, null, null, noteStr]);
        }
      }

      rows.push([null, null, null, null, null, null, null, null]);
      rows.push([`總工時: ${totalWorkHours} 小時`, null, null, null, null, null, null, null]);
      rows.push(["工作天數", workingDays, null, null, null, null, null, null]);
      rows.push(["日薪（元／天）", HR_EXPORT_DAILY_WAGE_YUAN, null, null, null, null, null, null]);
      // 列索引：0 標題、1 表頭、2..1+daysInMonth 每日列、空白、總工時、工作天數、日薪、月薪
      const workDaysRow0 = 4 + daysInMonth;
      const dailyWageRow0 = workDaysRow0 + 1;
      const refWorkDaysB = XLSX.utils.encode_cell({ r: workDaysRow0, c: 1 });
      const refDailyB = XLSX.utils.encode_cell({ r: dailyWageRow0, c: 1 });
      const monthlySalary = workingDays * HR_EXPORT_DAILY_WAGE_YUAN;
      const monthlyFormula = `${refWorkDaysB}*${refDailyB}`;
      rows.push([
        "月薪（元）",
        { t: "n", v: monthlySalary, f: monthlyFormula },
        null,
        null,
        null,
        null,
        null,
        null,
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const dailyCell = ws[refDailyB];
      if (dailyCell) {
        if (!dailyCell.c) dailyCell.c = [];
        dailyCell.c.push({ a: "薪資說明", t: HR_EXPORT_DAILY_WAGE_COMMENT });
      }
      ws["!cols"] = [
        { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, emp.name);
    });

    const fileName = `${monthStr}員工打卡.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: `✅ 已匯出 ${fileName}` });
  };

  // ── 週分組 ──
  const weekGroups = useMemo(() => {
    const groups: Date[][] = [];
    let currentWeek: Date[] = [];
    weekdays.forEach((day) => {
      if (getDay(day) === 1 && currentWeek.length > 0) {
        groups.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });
    if (currentWeek.length > 0) groups.push(currentWeek);
    return groups;
  }, [weekdays]);

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">載入排班資料...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>人事管理 — 員工排班</CardTitle>
              {saving && <span className="text-xs text-muted-foreground animate-pulse">儲存中...</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => switchMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold min-w-[120px] text-center">
                {format(currentMonth, "yyyy年 M月", { locale: zhTW })}
              </span>
              <Button variant="outline" size="icon" onClick={() => switchMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button onClick={exportExcel} className="ml-4">
                <Download className="h-4 w-4 mr-2" />
                匯出 Excel
              </Button>
            </div>
          </div>
          <div className="flex gap-4 mt-2">
            {EMPLOYEES.map((emp) => (
              <div key={emp.id} className="flex items-center gap-1.5 text-sm">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: emp.color, border: `1px solid ${emp.textColor}` }} />
                <span>{emp.name}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          {weekGroups.map((week, wi) => (
            <div key={wi} className="mb-6">
              <div className="text-xs text-muted-foreground mb-1 font-medium">第 {wi + 1} 週</div>
              <div className="border rounded-lg overflow-hidden">
                {/* 表頭 */}
                <div
                  className="grid border-b bg-muted/40"
                  style={{ gridTemplateColumns: `72px repeat(${week.length}, 1fr)` }}
                >
                  <div className="p-2 text-xs font-medium text-muted-foreground border-r">時段</div>
                  {week.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const holidayName = taiwanHolidays.get(dateStr);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "p-2 text-center text-xs font-medium border-r last:border-r-0 transition-colors group",
                          holidayName
                            ? "cursor-default bg-sky-50/80"
                            : "cursor-pointer hover:bg-red-50",
                        )}
                        onClick={() => setLeaveDialogDate(dateStr)}
                        title={holidayName ? `國定假日：${holidayName}` : "點擊設定請假"}
                      >
                        <div>{format(day, "EEE", { locale: zhTW })}</div>
                        <div className="text-sm font-semibold">{format(day, "M/d")}</div>
                        {holidayName ? (
                          <div className="text-[10px] text-sky-800 font-semibold leading-tight mt-0.5 px-0.5 line-clamp-3">
                            {holidayName}
                          </div>
                        ) : (
                          <div className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">請假</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 半小時列 */}
                {SLOTS.map((slot) => {
                  const full = isFullHour(slot);
                  return (
                    <div
                      key={slot}
                      className={cn(
                        "grid",
                        full ? "border-t border-border" : "border-t border-dashed border-border/50",
                      )}
                      style={{ gridTemplateColumns: `72px repeat(${week.length}, 1fr)` }}
                    >
                      <div
                        className={cn(
                          "px-1.5 text-[11px] text-muted-foreground border-r flex items-center justify-center bg-muted/20",
                          full ? "font-medium" : "text-muted-foreground/60",
                        )}
                        style={{ height: full ? 32 : 24 }}
                      >
                        {slotLabel(slot)}
                      </div>
                      {week.map((day) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const cellBlocks = EMPLOYEES.map((emp) => ({
                          emp,
                          block: blockMap.get(`${emp.id}-${dateStr}-${slot}`),
                          isLeave: leaveRecords.has(`${emp.id}-${dateStr}`),
                        }));

                        const holidayName = taiwanHolidays.get(dateStr);
                        return (
                          <div
                            key={dateStr}
                            className="border-r last:border-r-0 flex relative"
                            style={{ height: full ? 32 : 24 }}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, dateStr, slot)}
                          >
                            {cellBlocks.map(({ emp, block, isLeave }) => {
                              const noteKey = `${emp.id}-${dateStr}-${slot}`;
                              const note = deleteNotes.get(noteKey);

                              const leaveKey = `${emp.id}-${dateStr}`;
                              const leaveNote = leaveReasons.get(leaveKey);

                              return holidayName ? (
                                <div
                                  key={emp.id}
                                  className="flex-1 flex items-center justify-center bg-sky-50/90 text-sky-900/80 text-[10px] font-medium select-none px-0.5 text-center leading-tight"
                                  title={`國定假日：${holidayName}`}
                                >
                                  {full && slot === SLOTS[0] ? (
                                    <span className="line-clamp-3">{holidayName}</span>
                                  ) : null}
                                </div>
                              ) : isLeave && !block ? (
                                <div
                                  key={emp.id}
                                  className="flex-1 flex items-center justify-center bg-red-50 text-red-400 text-sm font-semibold select-none relative group"
                                  title={leaveNote ? `請假：${leaveNote}` : "請假"}
                                >
                                  {full ? "假" : ""}
                                  {full && leaveNote && (
                                    <div className="absolute hidden group-hover:block z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-foreground text-background text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
                                      {emp.name} 請假：{leaveNote}
                                    </div>
                                  )}
                                </div>
                              ) : block ? (
                                <div
                                  key={block.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, block.id)}
                                  className="flex-1 flex items-center justify-center text-xs font-semibold cursor-move group relative select-none"
                                  style={{ backgroundColor: emp.color, color: emp.textColor }}
                                  title={`${emp.name} ${slotLabel(slot)}–${slotLabel(slot + 0.5)}`}
                                >
                                  {full ? emp.name : ""}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(block.id); }}
                                    className="absolute top-0 right-0 p-0.5 bg-black/20 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" style={{ color: emp.textColor }} />
                                  </button>
                                </div>
                              ) : note ? (
                                <div
                                  key={emp.id}
                                  className="flex-1 flex items-center justify-center bg-amber-50 cursor-default relative group"
                                  title={`已刪除：${note}`}
                                  onClick={() => handleAddBlock(emp.id, dateStr, slot)}
                                >
                                  <div className="w-full h-[1px] bg-amber-300" />
                                  <div className="absolute hidden group-hover:block z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-foreground text-background text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
                                    {emp.name}：{note}
                                  </div>
                                </div>
                              ) : (
                                <div
                                  key={emp.id}
                                  className="flex-1 flex items-center justify-center hover:bg-muted/40 transition-colors cursor-pointer"
                                  onClick={() => handleAddBlock(emp.id, dateStr, slot)}
                                  title={`新增 ${emp.name}`}
                                >
                                  <Plus className="h-2.5 w-2.5 text-muted-foreground/20 hover:text-muted-foreground/50" />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 刪除理由 Dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>刪除排班</DialogTitle>
          </DialogHeader>
          {pendingDelete && (() => {
            const emp = EMPLOYEES.find((e) => e.id === pendingDelete.employeeId);
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm">
                  確定刪除 <span className="font-semibold">{emp?.name}</span> 在{" "}
                  <span className="font-semibold">{pendingDelete.date}</span>{" "}
                  <span className="font-semibold">{slotLabel(pendingDelete.slot)}</span> 的排班？
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">刪除理由（選填，將寫入備註）</label>
                  <Textarea
                    placeholder="例如：臨時請假、調班…"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>確定刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 請假 Dialog */}
      <Dialog open={!!leaveDialogDate} onOpenChange={(open) => {
        if (!open) { setLeaveDialogDate(null); setLeaveSelectedEmp(null); setLeaveReason(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>設定請假 — {leaveDialogDate}</DialogTitle>
          </DialogHeader>

          {leaveDialogDate && taiwanHolidays.has(leaveDialogDate) ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                此日為國定假日，無需排班與請假紀錄。
              </p>
              <p className="text-sm font-medium text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
                {taiwanHolidays.get(leaveDialogDate)}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLeaveDialogDate(null)}>關閉</Button>
              </DialogFooter>
            </div>
          ) : !leaveSelectedEmp ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">選擇該日請假的員工：</p>
              {EMPLOYEES.map((emp) => {
                const key = `${emp.id}-${leaveDialogDate}`;
                const alreadyOnLeave = leaveRecords.has(key);
                const existingReason = leaveReasons.get(key);
                return (
                  <div key={emp.id} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 justify-start gap-3 h-12"
                      style={{ borderColor: alreadyOnLeave ? "#FCA5A5" : emp.color }}
                      disabled={alreadyOnLeave}
                      onClick={() => { setLeaveSelectedEmp(emp.id); setLeaveReason(""); }}
                    >
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: emp.color, border: `1px solid ${emp.textColor}` }} />
                      <span className="font-medium">{emp.name}</span>
                      {alreadyOnLeave && (
                        <span className="text-xs text-red-500 ml-auto">
                          已請假{existingReason ? `（${existingReason}）` : ""}
                        </span>
                      )}
                    </Button>
                    {alreadyOnLeave && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="shrink-0"
                        onClick={() => leaveDialogDate && handleCancelLeave(emp.id, leaveDialogDate)}
                      >
                        取消請假
                      </Button>
                    )}
                  </div>
                );
              })}
              <DialogFooter>
                <Button variant="outline" onClick={() => setLeaveDialogDate(null)}>關閉</Button>
              </DialogFooter>
            </div>
          ) : (() => {
            const emp = EMPLOYEES.find((e) => e.id === leaveSelectedEmp);
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm">
                  <span className="font-semibold">{emp?.name}</span> 於{" "}
                  <span className="font-semibold">{leaveDialogDate}</span> 請假
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">請假事由</label>
                  <Textarea
                    placeholder="例如：家中有事、身體不適…"
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    rows={2}
                    autoFocus
                  />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setLeaveSelectedEmp(null)}>返回</Button>
                  <Button
                    variant="destructive"
                    onClick={() => leaveDialogDate && leaveSelectedEmp && handleLeave(leaveSelectedEmp, leaveDialogDate, leaveReason.trim())}
                  >
                    確定請假
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHRPanel;

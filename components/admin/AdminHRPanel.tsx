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
import HrExpenseClaimsCard, {
  fetchHrExpenseClaims,
  type HrExpenseClaim,
} from "@/components/admin/HrExpenseClaimsCard";
import { hrExpenseProofExportLabel } from "@/lib/hr-expense-proof-storage";

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

interface EmployeeWageConfig {
  mode: "per_workday" | "fixed_monthly_leave_deduct";
  /** Betty：日薪（元／天）；月薪 = 日薪 × 工作天數 */
  dailyWageYuan?: number;
  /** Betty：日薪列標籤 */
  dailyWageLabel?: string;
  dailyWageComment?: string;
  /** 心怡：固定月薪 */
  fixedMonthlyYuan?: number;
  /** 扣薪：月薪 ÷ 此工作天數 = 日薪 */
  workDaysDivisor?: number;
  /** 扣薪：日薪 ÷ 此時數 = 時薪；全日請假以此時數計 */
  hoursPerDay?: number;
  leaveDeductComment?: string;
  /** 心怡：勞健保加計 */
  laborHealthInsuranceYuan?: number;
  laborHealthInsuranceComment?: string;
}

// ── 常數 ──

const EMPLOYEES: Employee[] = [
  { id: "betty", name: "Betty", color: "#DDD6FE", textColor: "#5B21B6" },
  { id: "xinyi", name: "心怡", color: "#FED7AA", textColor: "#C2410C" },
];

const EMPLOYEE_WAGE: Record<string, EmployeeWageConfig> = {
  betty: {
    mode: "per_workday",
    dailyWageYuan: 1262,
    dailyWageLabel: "日薪（包含勞健保）",
    dailyWageComment:
      "應領薪資：16,000 元\n勞保扣款：398 元（以部分工時級距計算自付額）\n健保扣款：458 元（以法定最低基本工資投保自付額）\n實領15144元/月，日薪1262元",
  },
  xinyi: {
    mode: "fixed_monthly_leave_deduct",
    fixedMonthlyYuan: 22000,
    workDaysDivisor: 20,
    hoursPerDay: 4,
    laborHealthInsuranceYuan: 993,
    laborHealthInsuranceComment:
      "勞保：$22,000 × 費率 12.5% × 員工自付 20% = $550 元\n健保：$28,590 × 費率 5.17% × 員工自付 30% = $443",
    leaveDeductComment:
      "固定月薪22000。日薪=22000/20個工作天；時薪=日薪/4小時；全日請假以4小時計。應發=固定月薪−請假扣薪+勞健保993。",
  },
};

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
  const [expenseClaims, setExpenseClaims] = useState<HrExpenseClaim[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState<string[]>(() => EMPLOYEES.map((e) => e.id));

  const yearMonth = format(currentMonth, "yyyy-MM");

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

    const [schedRes, leaveRes, notesRes, claimsRes] = await Promise.all([
      supabase.from("hr_schedule").select("*").gte("scheduled_date", start).lte("scheduled_date", end),
      supabase.from("hr_leaves").select("*").gte("leave_date", start).lte("leave_date", end),
      supabase.from("hr_notes").select("*").gte("note_date", start).lte("note_date", end),
      fetchHrExpenseClaims(format(month, "yyyy-MM")).catch((err) => {
        console.error("Load expense claims error:", err);
        return [] as HrExpenseClaim[];
      }),
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

    setExpenseClaims(Array.isArray(claimsRes) ? claimsRes : []);

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

  // ── Excel 匯出：可選員工，每位各一份檔案 ──
  const openExportDialog = () => {
    setExportSelectedIds(EMPLOYEES.map((e) => e.id));
    setExportDialogOpen(true);
  };

  const toggleExportEmployee = (id: string) => {
    setExportSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exportExcel = (employeeIds: string[]) => {
    const targets = EMPLOYEES.filter((e) => employeeIds.includes(e.id));
    if (targets.length === 0) {
      toast({ title: "請至少選擇一位員工", variant: "destructive" });
      return;
    }

    const monthStr = format(currentMonth, "yyyyMM");
    const monthNum = format(currentMonth, "M");
    const daysInMonth = getDaysInMonth(currentMonth);
    const holidayMap = getTaiwanPublicHolidaysInCalendarMonth(currentMonth);

    const buildSheetForEmployee = (emp: Employee) => {
      const wage = EMPLOYEE_WAGE[emp.id] ?? EMPLOYEE_WAGE.betty;
      const empBlocks = blocks.filter((b) => b.employeeId === emp.id);
      const dateSlots = new Map<string, number[]>();
      empBlocks.forEach((b) => {
        const arr = dateSlots.get(b.date) || [];
        arr.push(b.slot);
        dateSlots.set(b.date, arr);
      });
      const empClaims = expenseClaims.filter((c) => c.employeeId === emp.id);
      const claimsTotal = empClaims.reduce((sum, c) => sum + c.amount, 0);

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

      // 請假時數：僅計正式請假紀錄；全日請假 = hoursPerDay（心怡 4 小時）
      let leaveDays = 0;
      let leaveHours = 0;
      if (wage.mode === "fixed_monthly_leave_deduct") {
        const hoursPerDay = wage.hoursPerDay ?? 4;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d), "yyyy-MM-dd");
          if (holidayMap.has(dateStr)) continue;
          if (leaveRecords.has(`${emp.id}-${dateStr}`)) {
            leaveDays += 1;
            leaveHours += hoursPerDay;
          }
        }
      }

      let salarySubtotal = 0;
      let refSalarySubtotalB = "B1";
      const cellComments: { addr: string; author: string; text: string }[] = [];

      if (wage.mode === "fixed_monthly_leave_deduct") {
        const fixedMonthly = wage.fixedMonthlyYuan ?? 22000;
        const dayDiv = wage.workDaysDivisor ?? 20;
        const hoursPerDay = wage.hoursPerDay ?? 4;
        const insurance = wage.laborHealthInsuranceYuan ?? 0;
        const dailyRate = fixedMonthly / dayDiv;
        const hourlyRate = dailyRate / hoursPerDay;
        const leaveDeduction = leaveHours * hourlyRate;
        const afterLeave = fixedMonthly - leaveDeduction;
        salarySubtotal = afterLeave + insurance;

        rows.push(["請假天數", leaveDays, null, null, null, null, null, null]);
        rows.push(["請假時數", leaveHours, null, null, null, null, null, null]);
        rows.push(["固定月薪（元）", fixedMonthly, null, null, null, null, null, null]);

        // 列：空白、總工時、請假天數、請假時數、固定月薪、日薪、時薪、請假扣薪、勞健保、應發
        const blankAfterDays = 2 + daysInMonth;
        const totalHoursRow0 = blankAfterDays + 1;
        const leaveDaysRow0 = totalHoursRow0 + 1;
        const leaveHoursRow0 = leaveDaysRow0 + 1;
        const fixedRow0 = leaveHoursRow0 + 1;
        const dailyRow0 = fixedRow0 + 1;
        const hourlyRow0 = dailyRow0 + 1;
        const deductRow0 = hourlyRow0 + 1;
        const insuranceRow0 = deductRow0 + 1;
        const netRow0 = insuranceRow0 + 1;

        const refFixed = XLSX.utils.encode_cell({ r: fixedRow0, c: 1 });
        const refLeaveH = XLSX.utils.encode_cell({ r: leaveHoursRow0, c: 1 });
        const refDaily = XLSX.utils.encode_cell({ r: dailyRow0, c: 1 });
        const refHourly = XLSX.utils.encode_cell({ r: hourlyRow0, c: 1 });
        const refDeduct = XLSX.utils.encode_cell({ r: deductRow0, c: 1 });
        const refInsurance = XLSX.utils.encode_cell({ r: insuranceRow0, c: 1 });
        const refNet = XLSX.utils.encode_cell({ r: netRow0, c: 1 });

        rows.push([
          `日薪（月薪/${dayDiv}個工作天）`,
          { t: "n", v: dailyRate, f: `${refFixed}/${dayDiv}` },
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        rows.push([
          `時薪（日薪/${hoursPerDay}小時）`,
          { t: "n", v: hourlyRate, f: `${refDaily}/${hoursPerDay}` },
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        rows.push([
          "請假扣薪（元）",
          { t: "n", v: leaveDeduction, f: `${refLeaveH}*${refHourly}` },
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        rows.push(["勞健保（元）", insurance, null, null, null, null, null, null]);
        rows.push([
          "應發薪資（元）",
          {
            t: "n",
            v: salarySubtotal,
            f: `${refFixed}-${refDeduct}+${refInsurance}`,
          },
          null,
          null,
          null,
          null,
          null,
          null,
        ]);

        refSalarySubtotalB = refNet;
        if (wage.leaveDeductComment) {
          cellComments.push({ addr: refFixed, author: "薪資說明", text: wage.leaveDeductComment });
        }
        if (wage.laborHealthInsuranceComment) {
          cellComments.push({
            addr: refInsurance,
            author: "勞健保說明",
            text: wage.laborHealthInsuranceComment,
          });
        }
      } else {
        // Betty：工作天數 × 日薪
        const dailyWage = wage.dailyWageYuan ?? 1262;
        const dailyLabel = wage.dailyWageLabel ?? "日薪（元／天）";
        rows.push(["工作天數", workingDays, null, null, null, null, null, null]);
        rows.push([dailyLabel, dailyWage, null, null, null, null, null, null]);
        const attendanceSalary = workingDays * dailyWage;
        salarySubtotal = attendanceSalary;

        const workDaysRow0 = 4 + daysInMonth;
        const dailyWageRow0 = workDaysRow0 + 1;
        const salaryRow0 = dailyWageRow0 + 1;
        const refWorkDaysB = XLSX.utils.encode_cell({ r: workDaysRow0, c: 1 });
        const refDailyB = XLSX.utils.encode_cell({ r: dailyWageRow0, c: 1 });
        rows.push([
          "月薪（元）",
          { t: "n", v: attendanceSalary, f: `${refWorkDaysB}*${refDailyB}` },
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        refSalarySubtotalB = XLSX.utils.encode_cell({ r: salaryRow0, c: 1 });
        if (wage.dailyWageComment) {
          cellComments.push({ addr: refDailyB, author: "薪資說明", text: wage.dailyWageComment });
        }
      }

      rows.push([null, null, null, null, null, null, null, null]);
      rows.push(["請款報帳", null, null, null, null, null, null, null]);
      rows.push(["報帳名目", "請款金額", "證明文件", null, null, null, null, null]);

      if (empClaims.length === 0) {
        rows.push(["（無）", 0, null, null, null, null, null, null]);
      } else {
        empClaims.forEach((c) => {
          rows.push([
            c.title,
            c.amount,
            hrExpenseProofExportLabel({ proofPath: c.proofPath, proofUrl: c.proofUrl }),
            null,
            null,
            null,
            null,
            null,
          ]);
        });
      }

      const claimsTotalRow0 = rows.length;
      rows.push(["請款合計（元）", claimsTotal, null, null, null, null, null, null]);
      const refClaimsB = XLSX.utils.encode_cell({ r: claimsTotalRow0, c: 1 });
      const finalAmount = salarySubtotal + claimsTotal;
      rows.push([
        "最終金額（薪水＋請款）",
        {
          t: "n",
          v: finalAmount,
          f: `${refSalarySubtotalB}+${refClaimsB}`,
        },
        null,
        null,
        null,
        null,
        null,
        null,
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      cellComments.forEach(({ addr, author, text }) => {
        const cell = ws[addr];
        if (!cell) return;
        if (!cell.c) cell.c = [];
        cell.c.push({ a: author, t: text });
      });
      ws["!cols"] = [
        { wch: 26 }, { wch: 12 }, { wch: 28 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
      ];
      return ws;
    };

    targets.forEach((emp, index) => {
      const wb = XLSX.utils.book_new();
      const ws = buildSheetForEmployee(emp);
      XLSX.utils.book_append_sheet(wb, ws, emp.name);
      const fileName = `${monthStr}${emp.name}薪資.xlsx`;
      window.setTimeout(() => {
        XLSX.writeFile(wb, fileName);
      }, index * 350);
    });

    setExportDialogOpen(false);
    toast({
      title: `✅ 已匯出 ${targets.length} 份檔案`,
      description: targets.map((e) => `${monthStr}${e.name}薪資.xlsx`).join("、"),
    });
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
              <Button onClick={openExportDialog} className="ml-4">
                <Download className="h-4 w-4 mr-2" />
                匯出
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

      <HrExpenseClaimsCard
        yearMonth={yearMonth}
        monthLabel={format(currentMonth, "yyyy年 M月", { locale: zhTW })}
        employees={EMPLOYEES}
        claims={expenseClaims}
        onClaimsChange={setExpenseClaims}
      />

      {/* 匯出人選 Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>選擇匯出人員</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              每位勾選的員工會各下載一份薪資檔（含請款報帳）。
            </p>
            <div className="space-y-2">
              {EMPLOYEES.map((emp) => {
                const checked = exportSelectedIds.includes(emp.id);
                return (
                  <label
                    key={emp.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
                      checked ? "border-foreground/30 bg-muted/40" : "hover:bg-muted/20",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-foreground"
                      checked={checked}
                      onChange={() => toggleExportEmployee(emp.id)}
                    />
                    <span
                      className="inline-block h-3 w-3 rounded"
                      style={{ backgroundColor: emp.color, border: `1px solid ${emp.textColor}` }}
                    />
                    <span className="text-sm font-medium">{emp.name}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportSelectedIds(EMPLOYEES.map((e) => e.id))}
              >
                全選
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExportSelectedIds([])}
              >
                清除
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={exportSelectedIds.length === 0}
              onClick={() => exportExcel(exportSelectedIds)}
            >
              <Download className="h-4 w-4 mr-1.5" />
              匯出 {exportSelectedIds.length > 0 ? `(${exportSelectedIds.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

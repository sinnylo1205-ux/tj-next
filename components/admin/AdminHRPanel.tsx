"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import * as XLSX from "xlsx";

// ── 型別 ──

interface Employee {
  id: string;
  name: string;
  color: string;     // block 背景（淡色）
  textColor: string;  // block 文字
}

interface ScheduleBlock {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  hour: number; // 8–17
}

// ── 常數 ──

const EMPLOYEES: Employee[] = [
  { id: "betty", name: "Betty", color: "#DDD6FE", textColor: "#5B21B6" },
  { id: "xinyi", name: "心怡", color: "#FED7AA", textColor: "#C2410C" },
];

const HOURS = Array.from({ length: 10 }, (_, i) => 8 + i);
const HOUR_LABELS = HOURS.map((h) => `${String(h).padStart(2, "0")}:00`);

const DEFAULT_WORK_DAYS = [3, 4, 5]; // Wed, Thu, Fri
const DEFAULT_START = 9;
const DEFAULT_END = 18;

function isWeekday(date: Date): boolean {
  const d = getDay(date);
  return d >= 1 && d <= 5;
}

function generateDefaultBlocks(month: Date): ScheduleBlock[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const blocks: ScheduleBlock[] = [];

  days.forEach((day) => {
    const dow = getDay(day);
    if (!DEFAULT_WORK_DAYS.includes(dow)) return;
    const dateStr = format(day, "yyyy-MM-dd");
    EMPLOYEES.forEach((emp) => {
      for (let h = DEFAULT_START; h < DEFAULT_END; h++) {
        blocks.push({
          id: `${emp.id}-${dateStr}-${h}`,
          employeeId: emp.id,
          date: dateStr,
          hour: h,
        });
      }
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
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(() => generateDefaultBlocks(new Date()));
  const [dragData, setDragData] = useState<{ blockId: string } | null>(null);

  // 請假記錄：Set of "employeeId-date"
  const [leaveRecords, setLeaveRecords] = useState<Set<string>>(new Set());

  // 請假 Dialog
  const [leaveDialogDate, setLeaveDialogDate] = useState<string | null>(null);

  const weekdays = useMemo(() => getWeekdaysInMonth(currentMonth), [currentMonth]);

  const blockMap = useMemo(() => {
    const m = new Map<string, ScheduleBlock>();
    blocks.forEach((b) => m.set(`${b.employeeId}-${b.date}-${b.hour}`, b));
    return m;
  }, [blocks]);

  const switchMonth = useCallback(
    (dir: 1 | -1) => {
      const next = dir === 1 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1);
      setCurrentMonth(next);
      setBlocks(generateDefaultBlocks(next));
      setLeaveRecords(new Set());
    },
    [currentMonth],
  );

  // ── Drag & Drop ──
  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    setDragData({ blockId });
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetDate: string, targetHour: number) => {
    e.preventDefault();
    if (!dragData) return;
    const block = blocks.find((b) => b.id === dragData.blockId);
    if (!block) return;

    const existingKey = `${block.employeeId}-${targetDate}-${targetHour}`;
    if (blockMap.has(existingKey)) {
      setDragData(null);
      return;
    }

    setBlocks((prev) =>
      prev.map((b) =>
        b.id === dragData.blockId
          ? { ...b, date: targetDate, hour: targetHour, id: `${b.employeeId}-${targetDate}-${targetHour}` }
          : b,
      ),
    );
    setDragData(null);
  };

  const handleDelete = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleAddBlock = (employeeId: string, date: string, hour: number) => {
    const key = `${employeeId}-${date}-${hour}`;
    if (blockMap.has(key)) return;
    setBlocks((prev) => [...prev, { id: key, employeeId, date, hour }]);
  };

  // ── 請假：批量刪除該員工當天所有 block ──
  const handleLeave = (employeeId: string, date: string) => {
    setBlocks((prev) => prev.filter((b) => !(b.employeeId === employeeId && b.date === date)));
    setLeaveRecords((prev) => new Set(prev).add(`${employeeId}-${date}`));
    const emp = EMPLOYEES.find((e) => e.id === employeeId);
    toast({ title: `✅ 已標記 ${emp?.name ?? employeeId} 於 ${date} 請假` });
  };

  // ── 取消請假：移除請假記錄並恢復預設班表 ──
  const handleCancelLeave = (employeeId: string, date: string) => {
    setLeaveRecords((prev) => {
      const next = new Set(prev);
      next.delete(`${employeeId}-${date}`);
      return next;
    });
    const d = new Date(date);
    const dow = getDay(d);
    if (DEFAULT_WORK_DAYS.includes(dow)) {
      const restored: ScheduleBlock[] = [];
      for (let h = DEFAULT_START; h < DEFAULT_END; h++) {
        const key = `${employeeId}-${date}-${h}`;
        if (!blockMap.has(key)) {
          restored.push({ id: key, employeeId, date, hour: h });
        }
      }
      if (restored.length > 0) {
        setBlocks((prev) => [...prev, ...restored]);
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

    const wb = XLSX.utils.book_new();

    EMPLOYEES.forEach((emp) => {
      const empBlocks = blocks.filter((b) => b.employeeId === emp.id);

      const dateHours = new Map<string, number[]>();
      empBlocks.forEach((b) => {
        const arr = dateHours.get(b.date) || [];
        arr.push(b.hour);
        dateHours.set(b.date, arr);
      });

      const rows: (string | number | null)[][] = [];
      rows.push([`${emp.name}${monthNum}月薪資`, null, null, null, null, null, null, null]);
      rows.push(["日期", "上班", "下班", "加班開始", "遲到分鐘", "加班時數", "加班費", "備註"]);

      let totalWorkHours = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d), "yyyy-MM-dd");
        const hours = (dateHours.get(dateStr) || []).sort((a, b) => a - b);
        const isLeave = leaveRecords.has(`${emp.id}-${dateStr}`);

        if (isLeave) {
          rows.push([dateStr, null, null, null, null, null, null, "請假"]);
        } else if (hours.length === 0) {
          rows.push([dateStr, null, null, null, null, null, null, null]);
        } else {
          const clockIn = `${String(hours[0]).padStart(2, "0")}:00`;
          const clockOut = `${String(hours[hours.length - 1] + 1).padStart(2, "0")}:00`;
          totalWorkHours += hours.length;
          rows.push([dateStr, clockIn, clockOut, null, null, null, null, null]);
        }
      }

      rows.push([null, null, null, null, null, null, null, null]);
      rows.push([`總工時: ${totalWorkHours} 小時`, null, null, null, null, null, null, null]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
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

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>人事管理 — 員工排班</CardTitle>
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
              <div className="text-xs text-muted-foreground mb-1 font-medium">
                第 {wi + 1} 週
              </div>
              <div className="border rounded-lg overflow-hidden">
                {/* 表頭：日期（可點擊請假） */}
                <div
                  className="grid border-b bg-muted/40"
                  style={{ gridTemplateColumns: `80px repeat(${week.length}, 1fr)` }}
                >
                  <div className="p-2 text-xs font-medium text-muted-foreground border-r">時段</div>
                  {week.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (
                      <div
                        key={day.toISOString()}
                        className="p-2 text-center text-xs font-medium border-r last:border-r-0 cursor-pointer hover:bg-red-50 transition-colors group"
                        onClick={() => setLeaveDialogDate(dateStr)}
                        title="點擊設定請假"
                      >
                        <div>{format(day, "EEE", { locale: zhTW })}</div>
                        <div className="text-sm font-semibold">{format(day, "M/d")}</div>
                        <div className="text-[10px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">請假</div>
                      </div>
                    );
                  })}
                </div>

                {/* 每小時一列 */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="grid border-b last:border-b-0"
                    style={{ gridTemplateColumns: `80px repeat(${week.length}, 1fr)` }}
                  >
                    <div className="p-1.5 text-xs text-muted-foreground border-r flex items-center justify-center bg-muted/20">
                      {HOUR_LABELS[hour - 8]}
                    </div>
                    {week.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const cellBlocks = EMPLOYEES.map((emp) => ({
                        emp,
                        block: blockMap.get(`${emp.id}-${dateStr}-${hour}`),
                        isLeave: leaveRecords.has(`${emp.id}-${dateStr}`),
                      }));

                      return (
                        <div
                          key={dateStr}
                          className="border-r last:border-r-0 flex min-h-[38px] relative"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, dateStr, hour)}
                        >
                          {cellBlocks.map(({ emp, block, isLeave }) =>
                            isLeave && !block ? (
                              <div
                                key={emp.id}
                                className="flex-1 flex items-center justify-center bg-red-50 text-red-300 text-xs select-none"
                              >
                                假
                              </div>
                            ) : block ? (
                              <div
                                key={block.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, block.id)}
                                className="flex-1 flex items-center justify-center text-xs font-semibold cursor-move group relative select-none"
                                style={{ backgroundColor: emp.color, color: emp.textColor }}
                                title={`${emp.name} ${HOUR_LABELS[hour - 8]}–${HOUR_LABELS[hour - 7] || "19:00"}`}
                              >
                                {emp.name}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(block.id);
                                  }}
                                  className="absolute top-0 right-0 p-0.5 bg-black/20 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="h-2.5 w-2.5" style={{ color: emp.textColor }} />
                                </button>
                              </div>
                            ) : (
                              <div
                                key={emp.id}
                                className="flex-1 flex items-center justify-center hover:bg-muted/40 transition-colors cursor-pointer"
                                onClick={() => handleAddBlock(emp.id, dateStr, hour)}
                                title={`新增 ${emp.name}`}
                              >
                                <Plus className="h-3 w-3 text-muted-foreground/30 hover:text-muted-foreground/60" />
                              </div>
                            ),
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 請假 Dialog */}
      <Dialog open={!!leaveDialogDate} onOpenChange={(open) => !open && setLeaveDialogDate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>設定請假 — {leaveDialogDate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">選擇該日請假的員工，將批量移除當天所有排班：</p>
            {EMPLOYEES.map((emp) => {
              const key = `${emp.id}-${leaveDialogDate}`;
              const alreadyOnLeave = leaveRecords.has(key);

              return (
                <div key={emp.id} className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 justify-start gap-3 h-12"
                    style={{ borderColor: alreadyOnLeave ? "#FCA5A5" : emp.color }}
                    disabled={alreadyOnLeave}
                    onClick={() => leaveDialogDate && handleLeave(emp.id, leaveDialogDate)}
                  >
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: emp.color, border: `1px solid ${emp.textColor}` }} />
                    <span className="font-medium">{emp.name}</span>
                    {alreadyOnLeave && <span className="text-xs text-red-500 ml-auto">已請假</span>}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogDate(null)}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminHRPanel;

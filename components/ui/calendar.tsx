import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { zhTW } from "date-fns/locale";
import { addMonths, format } from "date-fns";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, month, onMonthChange, ...props }: CalendarProps) {
  const today = new Date();
  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(today.getDate() + 14);

  const displayMonth = month instanceof Date ? month : new Date();

  const handlePrevMonth = () => {
    if (onMonthChange) {
      onMonthChange(addMonths(displayMonth, -1));
    }
  };

  const handleNextMonth = () => {
    if (onMonthChange) {
      onMonthChange(addMonths(displayMonth, 1));
    }
  };

  return (
    <div
      style={{
        fontFamily: "'Microsoft JhengHei', 'PingFang TC', sans-serif",
      }}
    >
      <div className="relative flex items-center justify-between mb-4 px-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrevMonth}
          className="h-8 w-8 z-10"
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold whitespace-nowrap text-foreground">
          {format(displayMonth, "yyyy年 M月")}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNextMonth}
          className="h-8 w-8 z-10"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <DayPicker
        locale={zhTW}
        showOutsideDays={showOutsideDays}
        month={month}
        onMonthChange={onMonthChange}
        className={cn("p-3", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "hidden",
          caption_label: "hidden",
          nav: "hidden",
          nav_button: "hidden",
          nav_button_previous: "hidden",
          nav_button_next: "hidden",
          // v9 使用 <table>，用 table-fixed 固定 7 欄對齊、數字不跑版
          month_grid: "w-full table-fixed border-collapse",
          weekdays: "",
          weekday: "text-muted-foreground text-center font-normal text-[0.8rem] align-middle py-2 w-[14.28%]",
          weeks: "",
          week: "",
          day: "align-middle text-center text-sm p-0 relative w-[14.28%]",
          day_button: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 font-bold aria-selected:opacity-100 rounded-md mx-auto"
          ),
          // 已過期／disabled：灰化
          disabled: "!opacity-50 !text-muted-foreground pointer-events-none",
          hidden: "invisible",
          outside: "text-muted-foreground/50",
          today: "bg-accent text-accent-foreground rounded-full",
          // 選中：綠色，! 提高優先級覆蓋 twoWeekGray
          selected: "!bg-green-500 !text-white rounded-md font-bold !border-0",
          ...classNames,
        }}
        modifiers={{
          twoWeekGray: { from: today, to: twoWeeksLater },
        }}
        modifiersClassNames={{
          twoWeekGray: "!text-red-600 font-bold",
        }}
        {...props}
      />
    </div>
  );
}

Calendar.displayName = "Calendar";

export { Calendar };

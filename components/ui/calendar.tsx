import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { zhTW } from "date-fns/locale";
import { addMonths, format } from "date-fns";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  month,
  onMonthChange,
  ...props
}: CalendarProps) {
  const displayMonth = month ?? props.defaultMonth ?? new Date();

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
      <div className="flex items-center justify-between mb-2 px-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handlePrevMonth}
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          {format(displayMonth, "yyyy年M月", { locale: zhTW })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleNextMonth}
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <DayPicker
        locale={zhTW}
        showOutsideDays={showOutsideDays}
        month={displayMonth}
        onMonthChange={onMonthChange}
        className={cn("p-2", className)}
        classNames={{
          caption: "hidden",
          caption_label: "hidden",
          month_caption: "hidden",
          nav: "hidden",
          nav_button_previous: "hidden",
          nav_button_next: "hidden",
          weekday: "text-muted-foreground text-center font-normal text-[0.75rem] py-1",
          day: "text-center text-base font-bold",
          day_button: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 rounded-md mx-auto font-bold text-base aria-selected:opacity-100"
          ),
          selected: "!bg-green-500 !text-white rounded-md font-bold",
          ...classNames,
        }}
        {...props}
      />
    </div>
  );
}

Calendar.displayName = "Calendar";

export { Calendar };

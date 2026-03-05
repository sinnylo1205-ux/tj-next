import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarDays, List } from "lucide-react";
import OrderStatusManager from "@/components/admin/OrderStatusManager";
import OrderWorkCalendar from "@/components/admin/OrderWorkCalendar";

type OrderView = "status" | "calendar";

const AdminOrdersPanel = () => {
  const [activeView, setActiveView] = useState<OrderView>("status");

  return (
    <div className="p-4 md:p-8">
      {/* Header with toggle button */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-xl md:text-3xl font-bold">訂單管理</h1>
        <Button
          variant="outline"
          onClick={() => setActiveView(activeView === "status" ? "calendar" : "status")}
          className="flex items-center gap-2"
        >
          {activeView === "status" ? (
            <>
              <CalendarDays className="h-4 w-4" />
              切換為訂單工作日曆排程
            </>
          ) : (
            <>
              <List className="h-4 w-4" />
              切換為訂單狀態管理
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      {activeView === "status" ? (
        <OrderStatusManager />
      ) : (
        <OrderWorkCalendar />
      )}
    </div>
  );
};

export default AdminOrdersPanel;

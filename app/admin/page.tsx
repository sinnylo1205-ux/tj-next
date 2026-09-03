"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Settings,
  FileText,
  UtensilsCrossed,
  MessageSquareText,
  CalendarClock,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminOrdersPanel from "@/components/admin/AdminOrdersPanel";
import AdminMediaPanel from "@/components/admin/AdminMediaPanel";
import AdminCrmPanel from "@/components/admin/AdminCrmPanel";
import AdminSettingsPanel from "@/components/admin/AdminSettingsPanel";
import AdminQuotationsPanel from "@/components/admin/AdminQuotationsPanel";
import AdminEatReservationPanel from "@/components/admin/AdminEatReservationPanel";
import AdminHRPanel from "@/components/admin/AdminHRPanel";
import { AdminReplyModeFab } from "@/components/admin/AdminReplyModeFab";

type AdminModule =
  | "dashboard"
  | "orders"
  | "media"
  | "customers"
  | "settings"
  | "quotations"
  | "eat_reservation"
  | "hr";

const ADMIN_MODULES: { id: AdminModule; title: string; shortTitle: string; icon: React.ComponentType<any> }[] = [
  { id: "dashboard", title: "儀表板", shortTitle: "儀表板", icon: LayoutDashboard },
  { id: "orders", title: "訂單管理", shortTitle: "訂單", icon: ShoppingCart },
  { id: "customers", title: "客戶管理", shortTitle: "客戶", icon: Users },
  { id: "quotations", title: "報價單管理", shortTitle: "報價", icon: FileText },
  { id: "eat_reservation", title: "預約試吃", shortTitle: "試吃", icon: UtensilsCrossed },
  { id: "media", title: "內容管理", shortTitle: "內容", icon: Package },
  { id: "hr", title: "人事管理", shortTitle: "人事", icon: CalendarClock },
  { id: "settings", title: "權限管理", shortTitle: "權限", icon: Settings },
];

function isAdminModule(value: string | null): value is AdminModule {
  if (!value) return false;
  return ADMIN_MODULES.some((m) => m.id === value);
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<AdminModule>("dashboard");
  const [quotationBadgeCount, setQuotationBadgeCount] = useState(0);
  const [eatBadgeCount, setEatBadgeCount] = useState(0);

  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const refreshAdminBadges = useCallback(async () => {
    const [qRes, eRes] = await Promise.all([
      supabase
        .from("quotation_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "price_asked")
        .or("is_hide.is.null,is_hide.eq.false"),
      supabase
        .from("eat_reservation")
        .select("id", { count: "exact", head: true })
        .or("status.is.null,status.eq.asked"),
    ]);
    setQuotationBadgeCount(qRes.count ?? 0);
    setEatBadgeCount(eRes.count ?? 0);
  }, []);

  // 依據 URL 的 module 參數初始化 / 同步目前的 active module
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const moduleFromQuery = params.get("module");
    if (isAdminModule(moduleFromQuery)) {
      setActiveModule(moduleFromQuery);
    }
  }, []);

  // 檢查登入與 user_roles 是否為 admin
  useEffect(() => {
    const checkAuthAndRole = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // 直接查詢 user_roles，僅允許 role = 'admin' 進入
      const { data: roleRow, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (error || !roleRow) {
        toast({
          title: "權限不足",
          description: "您沒有管理員權限",
          variant: "destructive",
        });
        router.push("/");
        return;
      }

      setUser(user);
      setLoading(false);
      void refreshAdminBadges();
    };

    void checkAuthAndRole();
  }, [router, toast, refreshAdminBadges]);

  useEffect(() => {
    if (!user) return;
    void refreshAdminBadges();
  }, [activeModule, user, refreshAdminBadges]);

  useEffect(() => {
    const onRefreshBadges = () => {
      void refreshAdminBadges();
    };
    window.addEventListener("admin-refresh-badges", onRefreshBadges);
    return () => window.removeEventListener("admin-refresh-badges", onRefreshBadges);
  }, [refreshAdminBadges]);

  const navBadgeCount = (id: AdminModule) => {
    if (id === "quotations") return quotationBadgeCount;
    if (id === "eat_reservation") return eatBadgeCount;
    return 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  if (!user) return null;

  const renderActivePanel = () => {
    switch (activeModule) {
      case "dashboard":
        return <AdminDashboard />;
      case "orders":
        return <AdminOrdersPanel />;
      case "media":
        return <AdminMediaPanel />;
      case "customers":
        return <AdminCrmPanel />;
      case "quotations":
        return <AdminQuotationsPanel />;
      case "eat_reservation":
        return <AdminEatReservationPanel />;
      case "hr":
        return <AdminHRPanel />;
      case "settings":
        return <AdminSettingsPanel />;
      default:
        return <AdminDashboard />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background admin-font admin-theme">
      {/* 桌機版側邊選單 */}
      {!isMobile && (
        <aside className="w-64 bg-white border-r border-border flex flex-col">
          <div className="p-6 border-b border-border">
            <h1 className="text-xl font-bold text-foreground">T&J 後台</h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {user.user_metadata?.name || user.email}
            </p>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            {ADMIN_MODULES.map((module) => {
              const n = navBadgeCount(module.id);
              return (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors relative",
                  activeModule === module.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <module.icon className="h-5 w-5 shrink-0" />
                <span className="font-medium flex-1 min-w-0">{module.title}</span>
                {n > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center",
                      activeModule === module.id
                        ? "bg-primary-foreground text-primary"
                        : "bg-red-600 text-white",
                    )}
                  >
                    {n > 99 ? "99+" : n}
                  </span>
                ) : null}
              </button>
            );
            })}
            <div className="pt-2 mt-2 border-t border-border">
              <Link
                href="/admin-text"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MessageSquareText className="h-5 w-5" />
                <span className="font-medium">訂單文字 AI</span>
              </Link>
            </div>
          </nav>
        </aside>
      )}

      {/* 主內容區 */}
      <main className={cn("flex-1 overflow-auto", isMobile && "pb-28")}>{renderActivePanel()}</main>

      {/* 手機版底部 Tab Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50">
          <div className="grid grid-cols-8">
            {ADMIN_MODULES.map((module) => {
              const n = navBadgeCount(module.id);
              return (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                  activeModule === module.id ? "text-primary" : "text-muted-foreground",
                )}
              >
                <module.icon className="h-5 w-5" />
                {n > 0 ? (
                  <span className="absolute top-1 right-1/2 translate-x-3 min-w-[0.875rem] h-3.5 px-0.5 rounded-full bg-red-600 text-white text-[9px] font-bold leading-none flex items-center justify-center">
                    {n > 9 ? "9+" : n}
                  </span>
                ) : null}
                <span className="text-[10px] leading-tight">{module.shortTitle}</span>
              </button>
            );
            })}
          </div>
          <Link
            href="/admin-text"
            className="flex items-center justify-center gap-2 py-2.5 text-xs font-medium border-t border-border text-muted-foreground active:bg-muted"
          >
            <MessageSquareText className="h-4 w-4" />
            訂單文字 AI
          </Link>
        </nav>
      )}
      <AdminReplyModeFab />
    </div>
  );
}


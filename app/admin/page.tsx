"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminOrdersPanel from "@/components/admin/AdminOrdersPanel";
import AdminMediaPanel from "@/components/admin/AdminMediaPanel";
import AdminCustomersPanel from "@/components/admin/AdminCustomersPanel";
import AdminSettingsPanel from "@/components/admin/AdminSettingsPanel";
import AdminQuotationsPanel from "@/components/admin/AdminQuotationsPanel";
import AdminEatReservationPanel from "@/components/admin/AdminEatReservationPanel";

type AdminModule =
  | "dashboard"
  | "orders"
  | "media"
  | "customers"
  | "settings"
  | "quotations"
  | "eat_reservation";

const ADMIN_MODULES: { id: AdminModule; title: string; shortTitle: string; icon: React.ComponentType<any> }[] = [
  { id: "dashboard", title: "儀表板", shortTitle: "儀表板", icon: LayoutDashboard },
  { id: "orders", title: "訂單管理", shortTitle: "訂單", icon: ShoppingCart },
  { id: "media", title: "內容管理", shortTitle: "內容", icon: Package },
  { id: "customers", title: "客戶管理", shortTitle: "客戶", icon: Users },
  { id: "quotations", title: "報價單管理", shortTitle: "報價", icon: FileText },
  { id: "eat_reservation", title: "預約試吃", shortTitle: "試吃", icon: UtensilsCrossed },
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

  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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
    };

    void checkAuthAndRole();
  }, [router, toast]);

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
        return <AdminCustomersPanel />;
      case "quotations":
        return <AdminQuotationsPanel />;
      case "eat_reservation":
        return <AdminEatReservationPanel />;
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
            {ADMIN_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors",
                  activeModule === module.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <module.icon className="h-5 w-5" />
                <span className="font-medium">{module.title}</span>
              </button>
            ))}
          </nav>
        </aside>
      )}

      {/* 主內容區 */}
      <main className={cn("flex-1 overflow-auto", isMobile && "pb-20")}>{renderActivePanel()}</main>

      {/* 手機版底部 Tab Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50">
          <div className="grid grid-cols-7">
            {ADMIN_MODULES.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={cn(
                  "flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                  activeModule === module.id ? "text-primary" : "text-muted-foreground",
                )}
              >
                <module.icon className="h-5 w-5" />
                <span className="text-[10px] leading-tight">{module.shortTitle}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}


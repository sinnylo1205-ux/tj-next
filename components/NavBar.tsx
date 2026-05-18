"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, User, ShoppingCart, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/SafeImage";
import { SITE_CONFIG } from "@/lib/site";

const productMenuItems = [
  { label: "客製甜點單品", path: "/order" },
  { label: "企業/活動禮盒", path: "/gift-boxes" },
  { label: "甜點茶會佈置", path: "/gallery" },
  { label: "選購經典款式", path: "/classic-styles" },
  { label: "企業合作／IP 授權", path: "/collaboration/enterprise" },
];

const brandMenuItems = [
  { label: "甜點部落格", path: "/blog" },
  { label: "關於我們", path: "/about" },
  { label: "客戶服務", path: "/contact" },
  { label: "合作洽談", path: "/contact" },
  { label: "常見問題 FAQ", path: "/faq" },
];

const NavBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>("");

  const isActive = (path: string) => {
    if (path === "/collaboration/enterprise") {
      return pathname.startsWith("/collaboration");
    }
    return pathname === path;
  };

  useEffect(() => {
    if (user) {
      const name =
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "";
      setUserName(name);
    } else {
      setUserName("");
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
      if (typeof window !== "undefined") {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("sb-") || key.includes("supabase")) {
            localStorage.removeItem(key);
          }
        });
      }
      setUserName("");
      router.replace("/");
    } catch (error) {
      console.error("Logout error:", error);
      router.replace("/");
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="主選單"
      className="sticky top-0 z-[1000] bg-brand-500 h-14 md:h-16"
      style={{ boxShadow: "var(--elev-navbar)" }}
    >
      <div className="container flex h-full items-center justify-between gap-2 md:gap-3">
        {/* Logo：z-10 避免導覽列橫向溢出時內容畫在 Logo 底下；勿加實心白底（圖載不到會變方塊） */}
        <Link
          href="/"
          className="relative z-10 flex shrink-0 items-center hover:opacity-90 focus-visible:outline-2 focus-visible:outline-white/60 focus-visible:outline-offset-2 rounded-md"
        >
          <SafeImage
            src={SITE_CONFIG.LOGO_URL}
            alt="T&J 客製化甜點"
            className="block h-9 w-auto max-h-9 min-h-[2.25rem] min-w-[4.5rem] object-contain object-left md:h-11 md:max-h-11 md:min-h-[2.75rem] [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.12))]"
            width={160}
            height={80}
            sizes="(min-width: 768px) 160px, 120px"
            priority
          />
        </Link>

        {/* Desktop Navigation：橫向溢出時可捲動，避免 nowrap 連結疊到 Logo */}
        <div className="relative z-0 hidden min-h-0 min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain py-1 [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden">
          {productMenuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "shrink-0 text-ink-inverse hover:opacity-85 transition-opacity rounded py-1.5 px-2 text-[15px] whitespace-nowrap md:text-base",
                isActive(item.path) && "font-medium bg-white/10",
              )}
            >
              {item.label}
            </Link>
          ))}

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="shrink-0 bg-transparent text-ink-inverse hover:bg-white/10 data-[state=open]:bg-white/10 focus:bg-white/10 h-auto rounded py-1.5 px-2 text-[15px] md:text-base">
                  品牌與聯絡資訊
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[220px] gap-1 p-2 bg-background">
                    {brandMenuItems.map((item, index) => (
                      <li key={`${item.path}-${index}`}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={item.path}
                            className={cn(
                              "block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                              isActive(item.path) && "bg-accent/50 font-medium",
                            )}
                          >
                            {item.label}
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Link
            href="/cart"
            className={cn(
              "shrink-0 text-ink-inverse hover:opacity-85 transition-opacity rounded py-1.5 px-2",
              isActive("/cart") && "font-medium",
            )}
            aria-label="購物車"
          >
            <ShoppingCart size={20} />
          </Link>

          {user && (
            <Link
              href="/member"
              className={cn(
                "shrink-0 text-ink-inverse hover:opacity-85 transition-opacity rounded py-1.5 px-2",
                isActive("/member") && "font-medium",
              )}
              aria-label="會員中心"
            >
              <User size={20} />
            </Link>
          )}

          {user ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="max-w-[8.5rem] truncate text-ink-inverse py-1.5 px-1 text-[15px] md:max-w-[12rem] md:text-base">
                Hi {userName || "使用者"}
              </span>
              <button
                onClick={handleLogout}
                className="text-ink-inverse hover:opacity-85 transition-opacity rounded py-1.5 px-2 flex shrink-0 items-center gap-1"
                aria-label="登出"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                "shrink-0 text-ink-inverse hover:opacity-85 transition-opacity rounded py-1.5 px-2 text-[15px] whitespace-nowrap md:text-base",
                isActive("/login") && "font-medium",
              )}
            >
              登入或註冊
            </Link>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-ink-inverse p-2 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-white/60 focus-visible:outline-offset-2 rounded"
          aria-label="切換選單"
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden bg-brand-500 border-t border-white/20">
          <ul className="container py-4 space-y-2">
            <li className="text-ink-inverse text-sm font-semibold px-4 py-2">商品與服務</li>
            {productMenuItems.map((item) => (
              <li key={item.path}>
                <Link
                  href={item.path}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block py-2 px-8 text-ink-inverse hover:bg-white/10 rounded transition-colors",
                    isActive(item.path) && "bg-white/15 font-medium",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}

            <li className="text-ink-inverse text-sm font-semibold px-4 py-2 mt-4">
              品牌與聯絡資訊
            </li>
            {brandMenuItems.map((item, index) => (
              <li key={`${item.path}-${index}`}>
                <Link
                  href={item.path}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block py-2 px-8 text-ink-inverse hover:bg-white/10 rounded transition-colors",
                    isActive(item.path) && "bg-white/15 font-medium",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}

            <li className="pt-4 border-t border-white/20 mt-4">
              <Link
                href="/cart"
                onClick={() => setIsOpen(false)}
                className={cn(
                  "block py-2 px-4 text-ink-inverse hover:bg-white/10 rounded transition-colors flex items-center gap-2",
                  isActive("/cart") && "bg-white/15 font-medium",
                )}
              >
                <ShoppingCart size={18} />
                購物車
              </Link>
            </li>

            {user && (
              <li>
                <Link
                  href="/member"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block py-2 px-4 text-ink-inverse hover:bg-white/10 rounded transition-colors flex items-center gap-2",
                    isActive("/member") && "bg-white/15 font-medium",
                  )}
                >
                  <User size={18} />
                  會員中心
                </Link>
              </li>
            )}

            <li>
              {user ? (
                <div className="space-y-2">
                  <div className="py-2 px-4 text-ink-inverse">Hi {userName || "使用者"}</div>
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsOpen(false);
                    }}
                    className="w-full text-left py-2 px-4 text-ink-inverse hover:bg-white/10 rounded transition-colors flex items-center gap-2"
                  >
                    <LogOut size={18} />
                    登出
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block py-2 px-4 text-ink-inverse hover:bg-white/10 rounded transition-colors",
                    isActive("/login") && "bg-white/15 font-medium",
                  )}
                >
                  登入或註冊
                </Link>
              )}
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
};

export default NavBar;

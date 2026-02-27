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

const LOGO_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/brand_logo1.png";

const productMenuItems = [
  { label: "客製甜點單品", path: "/order" },
  { label: "企業/活動禮盒", path: "/gift-boxes" },
  { label: "甜點茶會佈置", path: "/gallery" },
  { label: "選購經典款式", path: "/classic-styles" },
];

const brandMenuItems = [
  { label: "甜點部落格", path: "/blog" },
  { label: "關於我們", path: "/about" },
  { label: "客戶服務", path: "/contact" },
  { label: "合作洽談", path: "/contact" },
];

const NavBar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [userName, setUserName] = useState<string>("");

  const isActive = (path: string) => pathname === path;

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
      <div className="container h-full flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="hover:opacity-85 transition-opacity focus-visible:outline-2 focus-visible:outline-white/60 focus-visible:outline-offset-2 rounded"
        >
          <img
            src={LOGO_URL}
            alt="T&J 客製化甜點"
            className="h-12 md:h-20 w-auto"
            width={58}
            height={50}
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          {productMenuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "text-ink-inverse hover:opacity-85 transition-opacity py-2 px-3 rounded whitespace-nowrap",
                isActive(item.path) && "font-medium bg-white/10",
              )}
            >
              {item.label}
            </Link>
          ))}

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-ink-inverse hover:bg-white/10 data-[state=open]:bg-white/10 focus:bg-white/10 h-auto py-2 text-base">
                  品牌與聯絡資訊
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[200px] gap-1 p-2 bg-background">
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
              "text-ink-inverse hover:opacity-85 transition-opacity py-2 px-3 rounded",
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
                "text-ink-inverse hover:opacity-85 transition-opacity py-2 px-3 rounded",
                isActive("/member") && "font-medium",
              )}
              aria-label="會員中心"
            >
              <User size={20} />
            </Link>
          )}

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-ink-inverse py-2 px-3 whitespace-nowrap">
                Hi {userName || "使用者"}
              </span>
              <button
                onClick={handleLogout}
                className="text-ink-inverse hover:opacity-85 transition-opacity py-2 px-3 rounded flex items-center gap-1"
                aria-label="登出"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                "text-ink-inverse hover:opacity-85 transition-opacity py-2 px-3 rounded whitespace-nowrap",
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

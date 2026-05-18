"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/collaboration/enterprise", label: "企業合作" },
  { href: "/collaboration/ip", label: "IP 授權" },
] as const;

export function CollaborationTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-brand-300/40 bg-brand-50/90 backdrop-blur-sm">
      <div className="container flex flex-wrap items-center gap-2 py-3 md:py-3.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground md:mr-2">
          提案與授權
        </span>
        <nav className="flex gap-2" aria-label="企業合作與 IP 授權切換">
          {tabs.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  active
                    ? "bg-brand-500 text-ink-inverse shadow-sm"
                    : "bg-white/80 text-ink hover:bg-brand-100",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

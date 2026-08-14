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
    <div className="border-b border-brand-300/50 bg-brand-50">
      <div className="container flex flex-col items-center gap-2.5 py-4 md:gap-3 md:py-5">
        <span className="text-sm font-semibold tracking-wide text-ink">
          提案與授權
        </span>
        <nav className="flex w-full max-w-md gap-2.5 md:gap-3" aria-label="企業合作與 IP 授權切換">
          {tabs.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:px-6 md:py-3 md:text-base",
                  active
                    ? "bg-brand-500 text-ink-inverse shadow-md ring-2 ring-brand-500/30"
                    : "border border-brand-300/70 bg-white text-ink shadow-sm hover:border-brand-500 hover:bg-brand-100",
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

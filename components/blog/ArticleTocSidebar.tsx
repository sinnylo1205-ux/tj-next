"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { scrollToArticleHeading } from "@/lib/article-heading-scroll";
import { articleTocSlugId } from "@/lib/article-toc-slug";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; label: string };

export function ArticleTocSidebar({
  rootRef,
  onItemsChange,
  rebuildKey,
}: {
  rootRef: RefObject<HTMLElement | null>;
  onItemsChange?: (items: TocItem[]) => void;
  rebuildKey?: string | number;
}) {
  const onItemsRef = useRef(onItemsChange);
  onItemsRef.current = onItemsChange;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      onItemsRef.current?.([]);
      return;
    }

    const h2s = Array.from(root.querySelectorAll("h2"));
    const items: TocItem[] = [];

    h2s.forEach((el, i) => {
      let id = el.id;
      if (!id || /^[^a-zA-Z_]/.test(id)) {
        id = articleTocSlugId(i, el.textContent || `section-${i}`);
        el.id = id;
      }
      items.push({
        id,
        label: (el.textContent || "").trim() || `段落 ${i + 1}`,
      });
    });

    onItemsRef.current?.(items);
  }, [rootRef, rebuildKey]);

  return null;
}

/** 左欄：與 .article-rich-body 同-serif、字級略小於内文（見 globals 1.25rem→行動 1rem） */
export function ArticleTocNav({
  items,
  className,
}: {
  items: TocItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="文章目錄" className={cn("font-serif", className)}>
      <p className="mb-3 text-[0.9375rem] font-medium leading-[1.75] text-muted-foreground md:text-[1.125rem]">
        目錄
      </p>
      <ul className="space-y-2.5 border-l border-border/70 pl-4">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="w-full text-left text-[0.9375rem] leading-[1.75] text-muted-foreground transition-colors hover:text-foreground md:text-[1.125rem]"
              onClick={() => scrollToArticleHeading(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

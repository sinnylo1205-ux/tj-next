import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "選購經典款式｜T&J 客製化甜點",
  description: "探索 T&J 經典款式甜點，多種主題與造型任您選擇。",
  alternates: { canonical: getFullUrl("/classic-styles") },
};

export default function ClassicStylesLayout({ children }: { children: React.ReactNode }) {
  return children;
}

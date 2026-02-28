import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "線上訂購｜T&J 客製化甜點",
  description:
    "從五大類甜點中選擇您喜愛的品項，客製化棉花糖、馬卡龍、杯子蛋糕、手工餅乾等，填寫訂購表單後我們將於 24 小時內回覆報價。",
  alternates: { canonical: getFullUrl("/order") },
  openGraph: {
    title: "線上訂購｜T&J 客製化甜點",
    description: "選擇客製化甜點品項，填寫訂購需求，我們將盡快回覆報價與製作時程。",
    url: getFullUrl("/order"),
    type: "website",
  },
};

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return children;
}

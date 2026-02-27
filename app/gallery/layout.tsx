import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "甜點茶會佈置｜T&J 客製化甜點",
  description:
    "探索 T&J 甜點茶會佈置服務，提供多種風格主題設計，為您的派對、婚禮、企業活動打造夢幻甜點桌佈置。",
  alternates: { canonical: getFullUrl("/gallery") },
  openGraph: {
    title: "甜點茶會佈置｜T&J 客製化甜點",
    description: "探索 T&J 甜點茶會佈置服務，為您的派對、婚禮、企業活動打造夢幻甜點桌佈置。",
    url: getFullUrl("/gallery"),
    images: [
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/og.png",
    ],
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return children;
}

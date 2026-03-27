import type { Metadata } from "next";
import { getFullUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "常見問題 Q&A｜T&J 客製化甜點",
  description:
    "T&J 客製化甜點常見問題解答，包含下單流程、付款方式、宅配費用、客製化需求等資訊，幫助您快速了解訂購流程。",
  alternates: { canonical: getFullUrl("/faq") },
  openGraph: {
    title: "常見問題 Q&A｜T&J 客製化甜點",
    description: "T&J 客製化甜點常見問題解答，幫助您快速了解訂購流程。",
    url: getFullUrl("/faq"),
    images: [
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/og.png",
    ],
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}

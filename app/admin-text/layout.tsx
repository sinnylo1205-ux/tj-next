import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "文字轉訂單｜管理後台｜T&J 客製化甜點",
  robots: { index: false, follow: false },
};

export default function AdminTextLayout({ children }: { children: React.ReactNode }) {
  return children;
}

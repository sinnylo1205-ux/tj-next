import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理後台｜T&J 客製化甜點",
  robots: { index: false, follow: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}

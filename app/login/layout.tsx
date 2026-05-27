import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "會員登入｜T&J 客製化甜點",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

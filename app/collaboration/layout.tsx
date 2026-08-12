import { CollaborationTabs } from "@/components/collaboration/CollaborationTabs";

/**
 * 簡報字體改以 CSS 載入，避開 Turbopack 對 next/font/google 的
 * `@vercel/turbopack-next/internal/font/google/font` 解析錯誤。
 */
export default function CollaborationLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Italiana&display=swap"
        rel="stylesheet"
      />
      <div
        className="min-h-[calc(100vh-8rem)] bg-background"
        style={
          {
            "--font-proposal-cormorant": '"Cormorant Garamond", Georgia, "Times New Roman", serif',
            "--font-proposal-italiana": '"Italiana", "Times New Roman", serif',
          } as React.CSSProperties
        }
      >
        <CollaborationTabs />
        <div className="container pb-28 pt-4 md:pb-32 md:pt-6">{children}</div>
      </div>
    </>
  );
}

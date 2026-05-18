import { Cormorant_Garamond, Italiana } from "next/font/google";
import { CollaborationTabs } from "@/components/collaboration/CollaborationTabs";
import { cn } from "@/lib/utils";

const proposalCormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-proposal-cormorant",
  display: "swap",
  style: ["italic", "normal"],
  weight: ["400", "500", "600"],
});

const proposalItaliana = Italiana({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-proposal-italiana",
  display: "swap",
  adjustFontFallback: true,
});

export default function CollaborationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        proposalCormorant.variable,
        proposalItaliana.variable,
        "min-h-[calc(100vh-8rem)] bg-background",
      )}
    >
      <CollaborationTabs />
      <div className="container pb-28 pt-4 md:pb-32 md:pt-6">{children}</div>
    </div>
  );
}

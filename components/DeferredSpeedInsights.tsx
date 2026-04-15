"use client";

import dynamic from "next/dynamic";

const SpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights),
  { ssr: false },
);

/** 僅正式環境載入，避免開發／Preview 多一筆請求與 hydration */
export function DeferredSpeedInsights() {
  if (process.env.NODE_ENV !== "production") return null;
  return <SpeedInsights />;
}

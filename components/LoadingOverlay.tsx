"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  /** 是否顯示 */
  isVisible: boolean;
  /** 載入訊息 */
  message?: string;
  /** 次要提醒（例如請勿關閉視窗） */
  subtitle?: string;
  /** 倒數秒數（例如 AI 渲染約 30 秒）；結束後顯示「即將完成…」 */
  countdownSeconds?: number;
  /** 自訂 className */
  className?: string;
}

/**
 * Loading Overlay 元件
 * 用於操作型載入（如加入購物車）
 * 半透明背景 + Loading 插圖
 */
export const LoadingOverlay = ({
  isVisible,
  message = "處理中...",
  subtitle,
  countdownSeconds,
  className,
}: LoadingOverlayProps) => {
  const [remain, setRemain] = useState<number | null>(null);

  useEffect(() => {
    if (!isVisible || !countdownSeconds || countdownSeconds <= 0) {
      setRemain(null);
      return;
    }
    setRemain(countdownSeconds);
    const id = window.setInterval(() => {
      setRemain((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isVisible, countdownSeconds]);

  if (!isVisible) return null;

  const total = countdownSeconds && countdownSeconds > 0 ? countdownSeconds : 0;
  const showCountdown = total > 0 && remain != null;
  const progress = showCountdown ? Math.min(1, (total - remain) / total) : 0;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md transition-opacity duration-300",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-xl max-w-sm mx-4 text-center">
        {showCountdown ? (
          <div className="relative h-24 w-24">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88" aria-hidden>
              <circle cx="44" cy="44" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
              <circle
                cx="44"
                cy="44"
                r={radius}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {remain > 0 ? (
                <>
                  <span className="text-2xl font-semibold tabular-nums text-foreground leading-none">{remain}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">秒</span>
                </>
              ) : (
                <span className="text-xs font-medium text-muted-foreground px-2 leading-tight">即將完成…</span>
              )}
            </div>
          </div>
        ) : (
          <img
            src="/images/loading.webp"
            alt="處理中"
            width={160}
            height={160}
            className="h-28 w-28 md:h-36 md:w-36 object-contain animate-bounce-gentle"
            decoding="async"
          />
        )}
        <p className="text-base md:text-lg font-medium text-foreground/80 animate-pulse">{message}</p>
        {subtitle ? <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p> : null}
      </div>
    </div>
  );
};

export default LoadingOverlay;

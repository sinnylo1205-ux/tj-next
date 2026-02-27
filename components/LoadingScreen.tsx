import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  /** 全螢幕模式用於頁面載入 */
  fullScreen?: boolean;
  /** 載入訊息 */
  message?: string;
  /** 自訂 className */
  className?: string;
}

/**
 * 統一的 Loading 畫面元件
 * 使用可愛的插圖作為載入動畫
 */
export const LoadingScreen = ({ fullScreen = false, message = "載入中...", className }: LoadingScreenProps) => {
  if (fullScreen) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-4">
          {/* ✅ 預留固定尺寸避免 CLS */}
          <div className="w-32 h-32 md:w-48 md:h-48">
            <img
              src="/images/loading.webp"
              alt="載入中"
              width={192}
              height={192}
              className="w-full h-full object-contain animate-bounce-gentle"
            />
          </div>
          <p className="text-base md:text-lg text-foreground/70 animate-pulse">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      {/* ✅ 預留固定尺寸避免 CLS */}
      <div className="w-24 h-24 md:w-32 md:h-32">
        <img
          src="/images/loading.webp"
          alt="載入中"
          width={128}
          height={128}
          className="w-full h-full object-contain animate-bounce-gentle"
        />
      </div>
      <p className="text-sm md:text-base text-foreground/70 mt-3 animate-pulse">{message}</p>
    </div>
  );
};

export default LoadingScreen;

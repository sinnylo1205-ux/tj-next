import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  /** 是否顯示 */
  isVisible: boolean;
  /** 載入訊息 */
  message?: string;
  /** 自訂 className */
  className?: string;
}

/**
 * Loading Overlay 元件
 * 用於操作型載入（如加入購物車）
 * 半透明背景 + Loading 插圖
 */
export const LoadingOverlay = ({ isVisible, message = "處理中...", className }: LoadingOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-md transition-opacity duration-300",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-xl">
        <img
          src="/images/loading.webp"
          alt="處理中"
          className="w-28 h-28 md:w-36 md:h-36 object-contain animate-bounce-gentle"
        />
        <p className="text-base md:text-lg font-medium text-foreground/80 animate-pulse">{message}</p>
      </div>
    </div>
  );
};

export default LoadingOverlay;

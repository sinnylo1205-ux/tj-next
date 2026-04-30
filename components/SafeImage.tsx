import { cn } from "@/lib/utils";
import type React from "react";

/** 不使用 next/image／`/_next/image`，一律直連 `src`（Supabase、同站 `/public` 等）。 */
export type SafeImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src: string | null | undefined;
  /** 等同 next/image fill：填滿父層（父層須 `position: relative`） */
  fill?: boolean;
  /** 等同 priority：首屏／重要圖，`loading="eager"` + `fetchPriority="high"` */
  priority?: boolean;
};

/** Next/Image 遺留 props（若有套件誤傳則忽略） */
type LegacyNoise = {
  unoptimized?: boolean;
  blurDataURL?: string;
  placeholder?: string;
  quality?: number;
  loader?: unknown;
};

export function SafeImage({
  src,
  alt,
  fill,
  priority,
  className,
  loading: loadingProp,
  fetchPriority: fetchPriorityProp,
  decoding,
  unoptimized: _u,
  blurDataURL: _b,
  placeholder: _p,
  quality: _q,
  loader: _l,
  ...rest
}: SafeImageProps & LegacyNoise) {
  if (src == null) return null;
  const s = String(src).trim();
  if (!s) return null;

  const loading = loadingProp ?? (priority ? "eager" : "lazy");
  const fetchPriority = fetchPriorityProp ?? (priority ? ("high" as const) : undefined);

  return (
    <img
      src={s}
      alt={alt ?? ""}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding={decoding ?? "async"}
      className={cn(fill && "absolute inset-0 h-full w-full", className)}
      {...rest}
    />
  );
}

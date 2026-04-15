/** 可走 Next 預設圖片最佳化（對應 next.config images.remotePatterns） */
export function hostUsesDefaultImageOptimizer(hostname: string): boolean {
  return hostname.endsWith(".supabase.co") || hostname === "placehold.co";
}

/** 外部網址是否應使用 next/image 的 unoptimized（略過遠端最佳化） */
export function remoteSrcShouldBeUnoptimized(src: string): boolean {
  const s = src.trim();
  if (s.startsWith("/")) return false;
  try {
    return !hostUsesDefaultImageOptimizer(new URL(s).hostname);
  } catch {
    return true;
  }
}

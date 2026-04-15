import Image, { type ImageProps } from "next/image";
import { remoteSrcShouldBeUnoptimized } from "@/lib/remote-image-policy";

export type SafeImageProps = Omit<ImageProps, "src"> & {
  src: string | null | undefined;
};

/**
 * 包一層 `next/image`：Supabase／placehold 走最佳化；其餘外部網址（如 OG 貼的外部圖）用 `unoptimized` 避免設定爆掉。
 * 同站 `/public` 路徑（以 `/` 開頭）走 Next 最佳化。
 */
export function SafeImage({ src, unoptimized, alt, ...rest }: SafeImageProps) {
  if (src == null) return null;
  const s = String(src).trim();
  if (!s) return null;

  const resolvedUnoptimized =
    unoptimized !== undefined ? unoptimized : remoteSrcShouldBeUnoptimized(s);

  return <Image src={s} alt={alt ?? ""} {...rest} unoptimized={resolvedUnoptimized} />;
}

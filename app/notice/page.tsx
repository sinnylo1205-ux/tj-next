import { redirect, permanentRedirect } from "next/navigation";

interface NoticePageProps {
  searchParams: Promise<{ item?: string }>;
}

/**
 * 舊網址 /notice?item=xxx 永久重定向至 SEO 友善的 /product/xxx。
 * 無 item 時導向選購頁。
 */
export default async function NoticePage({ searchParams }: NoticePageProps) {
  const { item } = await searchParams;
  if (item && item.trim()) {
    permanentRedirect(`/product/${item.trim()}`);
  }
  redirect("/order");
}

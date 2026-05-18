import type { MetadataRoute } from "next";
import { getFullUrl } from "@/lib/site";
import { PRODUCT_IDS_WITH_NOTICE } from "@/lib/product-notice-url";

/** 靜態頁面路徑與其 changefreq / priority（與原 public/sitemap.xml 一致） */
const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/classic-styles", changeFrequency: "weekly", priority: 0.9 },
  { path: "/gift-boxes", changeFrequency: "weekly", priority: 0.9 },
  { path: "/order", changeFrequency: "weekly", priority: 0.8 },
  { path: "/gallery", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.5 },
  { path: "/how-to-order", changeFrequency: "monthly", priority: 0.6 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.8 },
  { path: "/collaboration/enterprise", changeFrequency: "monthly", priority: 0.65 },
  { path: "/collaboration/ip", changeFrequency: "monthly", priority: 0.55 },
];

/** 部落格文章 slug（與原 sitemap 一致） */
const BLOG_SLUGS = [
  "marshmallow",
  "fortune_cookie",
  "cookies",
  "cupcake_cream",
  "cupcake_choco",
  "macaron",
  "popcake",
  "pushcake",
  "rock_candy",
  "popcorn",
  "donut",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // 靜態頁
  for (const { path, changeFrequency, priority } of STATIC_ROUTES) {
    entries.push({
      url: getFullUrl(path),
      changeFrequency,
      priority,
    });
  }

  // 商品頁 /product/{product_id}（有訂購須知的商品）
  for (const productId of PRODUCT_IDS_WITH_NOTICE) {
    entries.push({
      url: getFullUrl(`/product/${productId}`),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  // 部落格文章 /blog/{slug}
  for (const slug of BLOG_SLUGS) {
    entries.push({
      url: getFullUrl(`/blog/${slug}`),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }

  return entries;
}

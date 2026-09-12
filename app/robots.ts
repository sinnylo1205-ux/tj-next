import type { MetadataRoute } from "next";
import { getFullUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "Googlebot", allow: "/", disallow: ["/admin", "/admin-text"] },
      { userAgent: "Bingbot", allow: "/", disallow: ["/admin", "/admin-text"] },
      { userAgent: "Twitterbot", allow: "/", disallow: ["/admin", "/admin-text"] },
      { userAgent: "facebookexternalhit", allow: "/", disallow: ["/admin", "/admin-text"] },
      { userAgent: "*", allow: "/", disallow: ["/admin", "/admin-text"] },
    ],
    sitemap: getFullUrl("/sitemap.xml"),
  };
}

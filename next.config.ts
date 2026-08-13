import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 避免本機多層 package-lock 時 Turbopack 誤判 workspace root
  turbopack: {
    root: __dirname,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [
      { source: "/giftbox", destination: "/gift-boxes", permanent: true },
      { source: "/giftbox/", destination: "/gift-boxes", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;

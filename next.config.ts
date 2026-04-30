import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [
      { source: "/giftbox", destination: "/gift-boxes", permanent: true },
      { source: "/giftbox/", destination: "/gift-boxes", permanent: true },
    ];
  },
};

export default nextConfig;

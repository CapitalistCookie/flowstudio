import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SSR mode required for Clerk auth middleware
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

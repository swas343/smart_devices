import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable strict mode to prevent double mounting
  experimental: {
    serverComponentsExternalPackages: ['mqtt', 'bcryptjs'],
  },
};

export default nextConfig;

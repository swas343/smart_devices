import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable strict mode to prevent double mounting
  serverExternalPackages: ["mqtt", "bcryptjs"],
};

export default nextConfig;

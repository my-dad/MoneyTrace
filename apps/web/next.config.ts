import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moneytrace/contracts"],
};

export default nextConfig;

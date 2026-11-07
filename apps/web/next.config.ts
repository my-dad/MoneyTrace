import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@moneytrace/contracts", "@moneytrace/ui-kit"],
};

export default nextConfig;

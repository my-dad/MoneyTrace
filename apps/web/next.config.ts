import type { NextConfig } from "next";
import { assertFixtureModeAllowed } from "./src/shared/fixture-guard";

assertFixtureModeAllowed(process.env);

const nextConfig: NextConfig = {
  transpilePackages: ["@moneytrace/contracts", "@moneytrace/ui-kit"],
};

export default nextConfig;

import type { NextConfig } from "next";
import { assertFixtureModeAllowed } from "./src/shared/fixture-guard";

assertFixtureModeAllowed(process.env);

/**
 * A static export served by Firebase Hosting (release blocker B1). The old screens' redirects to the
 * one dashboard (PRD CR-007) live in `firebase.json`, since a static export has no server.
 */
const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@moneytrace/contracts", "@moneytrace/ui-kit"],
};

export default nextConfig;

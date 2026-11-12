import type { NextConfig } from "next";
import { assertFixtureModeAllowed } from "./src/shared/fixture-guard";

assertFixtureModeAllowed(process.env);

/** The app is one dashboard with a pop-up chat (PRD CR-007); every older screen leads back to it. */
const OLD_ROUTES = ["/chat", "/activity", "/accounts", "/accounts/new", "/reports", "/reminders", "/settings", "/onboarding"];

const nextConfig: NextConfig = {
  transpilePackages: ["@moneytrace/contracts", "@moneytrace/ui-kit"],
  redirects: () => Promise.resolve(OLD_ROUTES.map((source) => ({ source, destination: "/", permanent: false }))),
};

export default nextConfig;

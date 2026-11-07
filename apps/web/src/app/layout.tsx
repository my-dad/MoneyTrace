import "@moneytrace/ui-kit/tokens.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../features/shell/AppShell";

export const metadata: Metadata = {
  title: "MoneyTrace",
  description: "Evidence-driven personal finance tracking",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}

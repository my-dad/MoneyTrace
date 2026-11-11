import { EmptyState } from "@moneytrace/ui-kit";
import { COPY } from "../../shared/copy";

/** Shown where a screen has no data source yet. Never shows figures. */
export function NotAvailableYet() {
  return (
    <main style={{ padding: "24px 16px" }}>
      <EmptyState title={COPY.notAvailableYet} description="This part of MoneyTrace isn't built yet." />
    </main>
  );
}

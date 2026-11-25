import { INCOME_LABELS, INCOME_SOURCES, type IncomeSource } from "@moneytrace/contracts";
import type { LedgerEntryRow, SourceEventRow, TransactionRow } from "../../shared/read-model-gateway";
import type { Editable } from "./RecentList";

/** Marks evidence the user entered in a form (`recordCashIncome`), mirrored from the backend. */
const MANUAL_ENTRY = "manualEntry";
const isSource = (value: string | undefined): value is IncomeSource => (INCOME_SOURCES as readonly (string | undefined)[]).includes(value);

/**
 * Cash income the user added, at what the ledger holds now: each edit replaces the record
 * (`txn-<id>` → `:repl` → …), so the live one is followed and its amount read from its entries.
 * An income whose live record isn't loaded yet is left out rather than shown at a stale amount.
 */
export function manualIncomes(events: SourceEventRow[], transactions: TransactionRow[], income: LedgerEntryRow[]): Map<string, Editable> {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const result = new Map<string, Editable>();
  for (const event of events) {
    if (event.status !== "posted" || event.extraction?.parser?.name !== MANUAL_ENTRY) continue;
    let id = `txn-${event.id}`;
    let tx = byId.get(id);
    while (tx?.state === "reversed") {
      id = `${id}:repl`;
      tx = byId.get(id);
    }
    if (tx === undefined || !isSource(tx.category)) continue;
    const amountMinor = income
      .filter((e) => e.transactionId === id && e.side === "credit")
      .reduce((sum, e) => sum + e.amountMinor, 0);
    if (amountMinor <= 0) continue;
    result.set(event.id, { sourceEventId: event.id, amountMinor, from: tx.category, label: INCOME_LABELS[tx.category] });
  }
  return result;
}

import { DemoUnavailableError } from "../../shared/demo-unavailable";
import { FIXTURE_ACCOUNTS, FIXTURE_SOURCE_EVENTS } from "../../shared/fixtures/household";
import { toActivityItems } from "../activity/activity-view-model";
import type { CardDue, CashSource, HistoryItem, InstrumentView } from "./cash-source";

const INSTRUMENTS: Record<string, InstrumentView[]> = {
  "bank-dbbl": [{ id: "inst-dbbl-debit", kind: "debitCard", label: "Debit card", masked: "4821" }],
  "bank-city": [{ id: "inst-city-account", kind: "bankAccount", label: "Account", masked: "3307" }],
  "bank-bkash": [{ id: "inst-bkash", kind: "mobileWallet", label: "Mobile wallet", masked: "" }],
  "card-amex": [{ id: "inst-amex", kind: "creditCard", label: "Credit card", masked: "7702" }],
  "card-ebl": [{ id: "inst-ebl", kind: "creditCard", label: "Credit card", masked: "2290" }],
};

const DUES: Record<string, CardDue> = {
  "card-amex": { dueDate: "2026-11-15", statementOwedMinor: 1_845_000 },
  "card-ebl": { dueDate: "2026-11-22", statementOwedMinor: 612_000 },
};

const STATUS = { verified: "Verified", pending: "Pending", needsAnswer: "Needs answer" } as const;

/** Posted and waiting household activity that touched the account, from either side. */
function historyOf(accountId: string): HistoryItem[] {
  const touched = new Set(
    FIXTURE_SOURCE_EVENTS.filter(
      (event) => event.resolvedAccountId === accountId || event.resolvedDestinationAccountId === accountId,
    ).map((event) => event.id),
  );
  return toActivityItems(FIXTURE_SOURCE_EVENTS, FIXTURE_ACCOUNTS).flatMap((item): HistoryItem[] => {
    if (!touched.has(item.id) || item.amountMinor === null || item.duplicate) return [];
    if (item.tone !== "verified" && item.tone !== "pending" && item.tone !== "needsAnswer") return [];
    return [{ id: item.id, occurredAtMs: item.occurredAtMs, title: item.title, amountMinor: item.amountMinor, direction: item.direction, status: STATUS[item.tone] }];
  });
}

const unavailable = () => Promise.reject(new DemoUnavailableError());

export function createFixtureCashSource(): CashSource {
  return {
    instruments: (accountId) => Promise.resolve(INSTRUMENTS[accountId] ?? []),
    history: (accountId) => Promise.resolve(historyOf(accountId)),
    cardDue: (accountId) => Promise.resolve(DUES[accountId] ?? null),
    recordCashCount: unavailable,
    recordAdjustment: unavailable,
    allocateCash: unavailable,
  };
}

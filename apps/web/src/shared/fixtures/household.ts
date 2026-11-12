import type {
  AccountRow,
  AiUsageRow,
  BalanceRow,
  ExpenseEntryRow,
  FollowUpRow,
  LedgerEntryRow,
  SourceEventRow,
} from "../read-model-gateway";

/**
 * One made-up household for fixture (demo) mode. Figures match design/MoneyTrace.html screen 01.
 * All money is integer poisha. No real financial text appears here.
 */

const at = (iso: string): number => Date.parse(`${iso}+06:00`);
const taka = (amount: number): number => amount * 100;

export const FIXTURE_NOW_MS = at("2026-11-06T20:00:00");
const CREATED_MS = at("2026-10-01T09:00:00");

type AccountSeed = { id: string; kind: AccountRow["kind"]; name: string; balanceTaka: number };

const ACCOUNT_SEEDS: AccountSeed[] = [
  { id: "bank-dbbl", kind: "bank", name: "DBBL Savings", balanceTaka: 82_000 },
  { id: "bank-city", kind: "bank", name: "City Bank Current", balanceTaka: 31_500 },
  { id: "bank-bkash", kind: "bank", name: "bKash", balanceTaka: 12_000 },
  { id: "cash-wallet", kind: "cash", name: "Wallet", balanceTaka: 7_200 },
  { id: "cash-home", kind: "cash", name: "Home", balanceTaka: 8_000 },
  { id: "family-ammu", kind: "familyCash", name: "Ammu", balanceTaka: 4_500 },
  { id: "cash-unassigned", kind: "cash", name: "Cash · place not set", balanceTaka: 5_000 },
  // A liability's raw balance is negative; the amount owed is its negation.
  { id: "card-amex", kind: "creditLiability", name: "City Bank Amex", balanceTaka: -18_450 },
  { id: "card-ebl", kind: "creditLiability", name: "EBL Visa", balanceTaka: -6_120 },
];

export const FIXTURE_ACCOUNTS: AccountRow[] = ACCOUNT_SEEDS.map(({ id, kind, name }) => ({
  id,
  kind,
  name,
  currency: "BDT",
  status: "active",
  createdAtMs: CREATED_MS,
}));

export const FIXTURE_BALANCES: BalanceRow[] = ACCOUNT_SEEDS.map(({ id, kind, balanceTaka }) => ({
  accountId: id,
  accountKind: kind,
  currency: "BDT",
  debitMinusCreditMinor: taka(balanceTaka),
  version: 1,
  updatedAtMs: FIXTURE_NOW_MS,
}));

/** 1–6 Nov spending: groceries 6,820 + transport 3,150 + eating out 2,940 + other 5,730 = 18,640. */
const EXPENSES: [string, string, number][] = [
  ["groceries", "2026-11-01T11:20:00", 2_150],
  ["groceries", "2026-11-03T18:05:00", 1_870],
  ["groceries", "2026-11-04T19:40:00", 1_600],
  ["groceries", "2026-11-06T10:15:00", 1_200],
  ["transport", "2026-11-01T08:30:00", 950],
  ["transport", "2026-11-02T09:10:00", 800],
  ["transport", "2026-11-04T08:45:00", 750],
  ["transport", "2026-11-05T18:20:00", 650],
  ["eating-out", "2026-11-02T13:30:00", 1_100],
  ["eating-out", "2026-11-03T21:00:00", 720],
  ["eating-out", "2026-11-05T13:15:00", 620],
  ["eating-out", "2026-11-06T16:40:00", 500],
  ["other", "2026-11-02T20:10:00", 2_500],
  ["other", "2026-11-03T12:00:00", 1_480],
  ["other", "2026-11-04T15:30:00", 1_000],
  ["other", "2026-11-06T12:25:00", 750],
  // October, for the dashboard's month-to-month comparison: 16,900 by 6 Oct, 52,300 in all.
  ["groceries", "2026-10-03T10:00:00", 6_100],
  ["other", "2026-10-04T10:00:00", 5_200],
  ["transport", "2026-10-05T10:00:00", 2_950],
  ["eating-out", "2026-10-06T10:00:00", 2_650],
  ["groceries", "2026-10-20T10:00:00", 12_800],
  ["other", "2026-10-21T10:00:00", 10_400],
  ["transport", "2026-10-22T10:00:00", 6_750],
  ["eating-out", "2026-10-23T10:00:00", 5_450],
];

export const FIXTURE_EXPENSE_ENTRIES: ExpenseEntryRow[] = EXPENSES.map(([category, iso, amount], index) => ({
  id: `tx-exp-${String(index + 1)}:1`,
  transactionId: `tx-exp-${String(index + 1)}`,
  accountId: `expense-${category}`,
  accountKind: "expense",
  side: "debit",
  amountMinor: taka(amount),
  currency: "BDT",
  occurredAtMs: at(iso),
}));

export const FIXTURE_INCOME_ENTRIES: LedgerEntryRow[] = [
  {
    id: "tx-salary-nov:2",
    transactionId: "tx-salary-nov",
    accountId: "income-salary",
    accountKind: "income",
    side: "credit",
    amountMinor: taka(85_000),
    currency: "BDT",
    occurredAtMs: at("2026-11-01T10:00:00"),
  },
];

/** AI usage this month: $1.43 of the $5.00 monthly budget. */
export const FIXTURE_AI_USAGE: AiUsageRow[] = [
  ["usage-1", "2026-11-02T13:31:00", 600_000],
  ["usage-2", "2026-11-04T15:31:00", 500_000],
  ["usage-3", "2026-11-06T16:41:00", 330_000],
].map(([id, iso, micro]) => ({
  id: String(id),
  providerId: "deepseek",
  model: "deepseek-flash",
  estimatedMicroUsd: Number(micro),
  actualMicroUsd: Number(micro),
  outcome: "success" as const,
  userApprovedRetry: false,
  sourceEventId: "se-salary",
  stage: "interpret" as const,
  attempt: 1,
  createdAtMs: at(String(iso)),
}));

type Candidate = NonNullable<SourceEventRow["candidate"]>;

type EventSeed = {
  id: string;
  sourceType: SourceEventRow["sourceType"];
  status: SourceEventRow["status"];
  receivedIso: string;
  text: string;
  candidate: Candidate | null;
  pendingReason?: SourceEventRow["pendingReason"];
  deadLetterReason?: SourceEventRow["deadLetterReason"];
  account?: string;
  destination?: string;
  matchedTransactionId?: string;
  matchKind?: SourceEventRow["matchKind"];
  ai?: boolean;
};

const candidate = (
  kind: Candidate["kind"],
  amountTaka: number,
  iso: string,
  extra: Partial<Candidate> = {},
): Candidate => ({ kind, amountMinor: taka(amountTaka), currency: "BDT", occurredAtMs: at(iso), ...extra });

const EVENT_SEEDS: EventSeed[] = [
  {
    id: "se-salary",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-01T10:02:00",
    text: "A/C **4821 credited BDT 85,000.00 on 01-Nov-26 SALARY NOV. Avl Bal BDT 97,000.00",
    candidate: candidate("income", 85_000, "2026-11-01T10:00:00", { provider: "dbbl", instrumentMask: "4821", category: "salary", balanceAfterMinor: taka(97_000) }),
    account: "bank-dbbl",
  },
  {
    id: "se-amex-shwapno",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-01T11:21:00",
    text: "Card **7702 used for BDT 2,150.00 at SHWAPNO GULSHAN on 01-Nov-26 11:20",
    candidate: candidate("cardPurchase", 2_150, "2026-11-01T11:20:00", { provider: "city", instrumentMask: "7702", counterparty: "Shwapno Gulshan", category: "groceries" }),
    account: "card-amex",
  },
  {
    id: "se-bkash-pathao",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-01T08:31:00",
    text: "Payment Tk 950.00 to PATHAO successful. Balance Tk 12,950.00. TrxID 9KX2M4QZ",
    candidate: candidate("purchase", 950, "2026-11-01T08:30:00", { provider: "bkash", counterparty: "Pathao", category: "transport", reference: "9KX2M4QZ", balanceAfterMinor: taka(12_950) }),
    account: "bank-bkash",
  },
  {
    id: "se-ebl-lunch",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-02T13:31:00",
    text: "EBL Card **2290 txn BDT 1,100.00 at TAKEOUT BANANI 02-Nov-26",
    candidate: candidate("cardPurchase", 1_100, "2026-11-02T13:30:00", { provider: "ebl", instrumentMask: "2290", counterparty: "Takeout Banani", category: "eating-out" }),
    account: "card-ebl",
  },
  {
    id: "se-city-daraz",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-02T20:11:00",
    text: "A/C **3307 debited BDT 2,500.00 for DARAZ on 02-Nov-26. Bal BDT 31,500.00",
    candidate: candidate("purchase", 2_500, "2026-11-02T20:10:00", { provider: "city", instrumentMask: "3307", counterparty: "Daraz", category: "other", balanceAfterMinor: taka(31_500) }),
    account: "bank-city",
  },
  {
    id: "se-chat-rickshaw",
    sourceType: "chat",
    status: "posted",
    receivedIso: "2026-11-05T18:22:00",
    text: "Paid 650 cash for rickshaw and CNG today",
    candidate: candidate("purchase", 650, "2026-11-05T18:20:00", { counterparty: "Rickshaw and CNG", category: "transport" }),
    account: "cash-wallet",
    ai: true,
  },
  {
    id: "se-atm",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-05T19:03:00",
    text: "BDT 5,000.00 withdrawn from A/C **4821 at ATM GULSHAN-2 on 05-Nov-26 19:02. Bal BDT 82,000.00",
    candidate: candidate("withdrawal", 5_000, "2026-11-05T19:02:00", { provider: "dbbl", instrumentMask: "4821", balanceAfterMinor: taka(82_000) }),
    account: "bank-dbbl",
    destination: "cash-unassigned",
  },
  {
    id: "se-pending-agora",
    sourceType: "sms",
    status: "pending",
    pendingReason: "awaitingClarification",
    receivedIso: "2026-11-03T18:06:00",
    text: "Card **9134 used for BDT 1,870.00 at AGORA DHANMONDI on 03-Nov-26 18:05",
    candidate: candidate("cardTransaction", 1_870, "2026-11-03T18:05:00", { instrumentMask: "9134", counterparty: "Agora Dhanmondi", category: "groceries" }),
  },
  {
    id: "se-pending-ammu",
    sourceType: "chat",
    status: "pending",
    pendingReason: "awaitingClarification",
    receivedIso: "2026-11-06T09:00:00",
    text: "Gave some cash to Ammu for the bazar",
    candidate: null,
    ai: true,
  },
  {
    id: "se-dup-shwapno",
    sourceType: "chat",
    status: "linkedAsDuplicate",
    receivedIso: "2026-11-01T12:00:00",
    text: "Bought groceries at Shwapno for 2150 with the Amex",
    candidate: candidate("cardPurchase", 2_150, "2026-11-01T11:20:00", { counterparty: "Shwapno", category: "groceries" }),
    account: "card-amex",
    matchedTransactionId: "txn-se-amex-shwapno",
    matchKind: "duplicate",
    ai: true,
  },
  {
    id: "se-rejected",
    sourceType: "sms",
    status: "rejected",
    receivedIso: "2026-11-04T15:31:00",
    text: "Card **7702 txn BDT 1,200.00 at FOODPANDA 04-Nov-26 (declined)",
    candidate: candidate("cardPurchase", 1_200, "2026-11-04T15:30:00", { provider: "city", instrumentMask: "7702", counterparty: "Foodpanda" }),
  },
  {
    id: "se-dead",
    sourceType: "sms",
    status: "deadLetter",
    deadLetterReason: "stageFailed",
    receivedIso: "2026-11-06T12:26:00",
    text: "Txn of BDT 750.00 processed on 06-Nov-26 ref 55210",
    candidate: null,
  },
];

const TERMINAL = new Set<SourceEventRow["status"]>(["posted", "linkedAsDuplicate", "rejected", "cancelled", "deadLetter"]);

export const FIXTURE_SOURCE_EVENTS: SourceEventRow[] = EVENT_SEEDS.map((seed) => {
  const receivedAtMs = at(seed.receivedIso);
  return {
    id: seed.id,
    sourceType: seed.sourceType,
    sourceHash: `hash-${seed.id}`,
    idempotencyKey: `key-${seed.id}`,
    status: seed.status,
    ...(seed.pendingReason === undefined ? {} : { pendingReason: seed.pendingReason }),
    ...(seed.deadLetterReason === undefined ? {} : { deadLetterReason: seed.deadLetterReason }),
    stageAttempt: 1,
    claim: null,
    parkedStage: seed.status === "pending" ? "decide" : null,
    version: 1,
    receivedAtMs,
    terminalAtMs: TERMINAL.has(seed.status) ? receivedAtMs + 2_000 : null,
    providerResultsPurged: false,
    retainedText: seed.text,
    candidate: seed.candidate,
    extraction:
      seed.candidate === null
        ? null
        : seed.ai === true
          ? { source: "ai", ai: { model: "deepseek-flash", promptVersion: "interpret-v1" }, confidenceBp: 7_800 }
          : { source: "deterministicParser", parser: { name: `${seed.candidate.provider ?? "generic"}-sms`, version: "1" }, confidenceBp: 9_800 },
    matchedTransactionId: seed.matchedTransactionId ?? null,
    matchKind: seed.matchKind ?? (seed.candidate === null ? null : "none"),
    resolvedAccountId: seed.account ?? null,
    resolvedDestinationAccountId: seed.destination ?? null,
    userConfirmed: seed.sourceType === "chat",
    clarifications: [],
  };
});

export const FIXTURE_FOLLOW_UPS: FollowUpRow[] = [
  {
    id: "fu-atm",
    trigger: "withdrawalDestination",
    targetTransactionId: "tx-atm",
    question: "Where did the ৳5,000 from yesterday's ATM withdrawal go?",
    dueAtMs: at("2026-11-06T21:00:00"),
    snoozedUntilMs: null,
    state: "open",
    createdAtMs: at("2026-11-05T19:03:00"),
    resolvedAtMs: null,
  },
  {
    id: "fu-wallet",
    trigger: "unreviewedCashActivity",
    targetAccountId: "cash-wallet",
    question: "Your wallet has had no activity recorded for 3 days. Is ৳7,200 still right?",
    dueAtMs: at("2026-11-07T21:00:00"),
    snoozedUntilMs: null,
    state: "open",
    createdAtMs: at("2026-11-06T09:00:00"),
    resolvedAtMs: null,
  },
  {
    id: "fu-home-count",
    trigger: "reconciliationDifference",
    targetAccountId: "cash-home",
    question: "Home cash counted ৳300 less than expected. What explains the difference?",
    dueAtMs: at("2026-11-08T21:00:00"),
    snoozedUntilMs: at("2026-12-01T09:00:00"),
    state: "snoozed",
    createdAtMs: at("2026-11-04T21:00:00"),
    resolvedAtMs: null,
  },
];

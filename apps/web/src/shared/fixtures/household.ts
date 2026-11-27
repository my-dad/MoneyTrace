import type {
  AccountRow,
  AiUsageRow,
  BalanceRow,
  ExpenseEntryRow,
  FollowUpRow,
  LedgerEntryRow,
  SourceEventRow,
  TransactionRow,
  ProfileRow,
  TipsRow,
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

/**
 * 1–6 Nov spending: groceries 6,820 + other 3,230 + transport 3,150 + eating out 2,940 + not
 * sorted yet 2,500 (Daraz) = 18,640. Each spend names its shop, as its SMS would.
 */
const EXPENSES: [category: string, iso: string, amountTaka: number, merchant: string | null][] = [
  ["groceries", "2026-11-01T11:20:00", 2_150, "Shwapno Gulshan"],
  ["groceries", "2026-11-03T18:05:00", 1_870, "Agora Dhanmondi"],
  ["groceries", "2026-11-04T19:40:00", 1_600, "Meena Bazar"],
  ["groceries", "2026-11-06T10:15:00", 1_200, "Shwapno Gulshan"],
  ["transport", "2026-11-01T08:30:00", 950, "Pathao"],
  ["transport", "2026-11-02T09:10:00", 800, "Pathao"],
  ["transport", "2026-11-04T08:45:00", 750, "Uber"],
  ["transport", "2026-11-05T18:20:00", 650, "Rickshaw and CNG"],
  ["eating-out", "2026-11-02T13:30:00", 1_100, "Takeout Banani"],
  ["eating-out", "2026-11-03T21:00:00", 720, "Foodpanda"],
  ["eating-out", "2026-11-05T13:15:00", 620, "Foodpanda"],
  ["eating-out", "2026-11-06T16:40:00", 500, "Takeout Banani"],
  ["uncategorized", "2026-11-02T20:10:00", 2_500, "Daraz"],
  ["other", "2026-11-03T12:00:00", 1_480, null],
  ["other", "2026-11-04T15:30:00", 1_000, "Aarong"],
  ["other", "2026-11-06T12:25:00", 750, null],
  // October, for the dashboard's month-to-month comparison: 16,900 by 6 Oct, 52,300 in all.
  ["groceries", "2026-10-03T10:00:00", 6_100, "Shwapno Gulshan"],
  ["other", "2026-10-04T10:00:00", 5_200, "Aarong"],
  ["transport", "2026-10-05T10:00:00", 2_950, "Pathao"],
  ["eating-out", "2026-10-06T10:00:00", 2_650, "Foodpanda"],
  ["groceries", "2026-10-20T10:00:00", 12_800, "Meena Bazar"],
  ["other", "2026-10-21T10:00:00", 10_400, null],
  ["transport", "2026-10-22T10:00:00", 6_750, "Uber"],
  ["eating-out", "2026-10-23T10:00:00", 5_450, "Takeout Banani"],
  // June to September, for the six-month chart.
  ["groceries", "2026-06-08T10:00:00", 17_200, "Shwapno Gulshan"],
  ["transport", "2026-06-12T10:00:00", 8_400, "Pathao"],
  ["eating-out", "2026-06-15T10:00:00", 6_900, "Foodpanda"],
  ["other", "2026-06-20T10:00:00", 9_800, null],
  ["groceries", "2026-07-08T10:00:00", 18_100, "Meena Bazar"],
  ["transport", "2026-07-12T10:00:00", 9_100, "Uber"],
  ["eating-out", "2026-07-15T10:00:00", 8_200, "Takeout Banani"],
  ["other", "2026-07-20T10:00:00", 21_500, "Aarong"],
  ["groceries", "2026-08-08T10:00:00", 16_400, "Shwapno Gulshan"],
  ["transport", "2026-08-12T10:00:00", 7_800, "Pathao"],
  ["eating-out", "2026-08-15T10:00:00", 7_300, "Foodpanda"],
  ["other", "2026-08-20T10:00:00", 11_200, null],
  ["groceries", "2026-09-08T10:00:00", 19_600, "Agora Dhanmondi"],
  ["transport", "2026-09-12T10:00:00", 8_900, "Pathao"],
  ["eating-out", "2026-09-15T10:00:00", 9_400, "Takeout Banani"],
  ["other", "2026-09-20T10:00:00", 14_700, "Daraz"],
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

/** The demo's merchant key: what `normalizeMerchant` makes of these simple names. */
const keyOf = (merchant: string): string => merchant.toLowerCase().replace(/[^a-z0-9]/g, "");

const spendTx = (id: string, category: string, atMs: number, merchant: string | null): TransactionRow => ({
  id,
  state: "posted",
  intentType: "purchase",
  occurredAtMs: atMs,
  currency: "BDT",
  sourceEventIds: [],
  actor: "pipeline",
  category,
  ...(merchant === null ? {} : { merchant, merchantKey: keyOf(merchant) }),
  committedAtMs: atMs,
});

/** Salary in earlier months, for the six-month chart; November's is below. */
const EARLIER_INCOME: [iso: string, amountTaka: number][] = [
  ["2026-06-01T10:00:00", 82_000],
  ["2026-07-01T10:00:00", 82_000],
  ["2026-08-01T10:00:00", 85_000],
  ["2026-09-01T10:00:00", 85_000],
  ["2026-10-01T10:00:00", 85_000],
];

export const FIXTURE_INCOME_ENTRIES: LedgerEntryRow[] = [
  ...EARLIER_INCOME.map(([iso, amount], index): LedgerEntryRow => ({
    id: `tx-salary-${String(index)}:2`,
    transactionId: `tx-salary-${String(index)}`,
    accountId: "income-salary",
    accountKind: "income",
    side: "credit",
    amountMinor: taka(amount),
    currency: "BDT",
    occurredAtMs: at(iso),
  })),
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
    // An own transfer, paired with DBBL's debit (CR-008): counted in neither Spent nor Came in.
    id: "se-transfer-bkash",
    sourceType: "sms",
    status: "posted",
    receivedIso: "2026-11-06T15:01:00",
    text: "You have received Tk 10,000.00 from DBBL. Fee Tk 0.00. Balance Tk 12,000.00. TrxID BK00000009 at 06/11/2026 15:00",
    candidate: candidate("unclassifiedCredit", 10_000, "2026-11-06T15:00:00", { provider: "bkash" }),
    account: "bank-bkash",
    destination: "bank-dbbl",
    matchKind: "transferCounterpart",
    matchedTransactionId: "txn-se-dbbl-out:repl",
  },
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
    candidate: candidate("purchase", 2_500, "2026-11-02T20:10:00", { provider: "city", instrumentMask: "3307", counterparty: "Daraz", balanceAfterMinor: taka(31_500) }),
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

/** November's money in and out on each source, for the dashboard's Sources list (CR-008). */
export const FIXTURE_SOURCE_ENTRIES: LedgerEntryRow[] = (
  [
    ["salary", "bank-dbbl", "bank", "debit", 85_000, "2026-11-01T10:00:00"],
    ["shwapno", "card-amex", "creditLiability", "credit", 2_150, "2026-11-01T11:20:00"],
    ["pathao", "bank-bkash", "bank", "credit", 950, "2026-11-02T09:10:00"],
    ["atm", "bank-dbbl", "bank", "credit", 5_000, "2026-11-05T19:02:00"],
    ["atm", "cash-unassigned", "cash", "debit", 5_000, "2026-11-05T19:02:00"],
    ["rickshaw", "cash-wallet", "cash", "credit", 650, "2026-11-05T18:20:00"],
    ["transfer", "bank-dbbl", "bank", "credit", 10_000, "2026-11-06T15:00:00"],
    ["transfer", "bank-bkash", "bank", "debit", 10_000, "2026-11-06T15:00:00"],
  ] as const
).map(([tx, accountId, accountKind, side, amount, iso], index) => ({
  id: `tx-src-${tx}:${String(index)}`,
  transactionId: `tx-src-${tx}`,
  accountId,
  accountKind,
  side,
  amountMinor: taka(amount),
  currency: "BDT",
  occurredAtMs: at(iso),
}));

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
    targetReconciliationId: "recon-home-1",
    question: "Home cash counted ৳300 less than expected. What explains the difference?",
    dueAtMs: at("2026-11-08T21:00:00"),
    snoozedUntilMs: at("2026-12-01T09:00:00"),
    state: "snoozed",
    createdAtMs: at("2026-11-04T21:00:00"),
    resolvedAtMs: null,
  },
];

const SPENDING_KINDS = new Set(["purchase", "cardPurchase", "cardTransaction", "unclassifiedDebit"]);

/**
 * Each spend's sector and shop: the demo's spending, plus the record of each posted spending
 * message (`txn-<event id>`), as the pipeline would write them.
 */
export const FIXTURE_TRANSACTIONS: TransactionRow[] = [
  ...EXPENSES.map(([category, iso, , merchant], index) => spendTx(`tx-exp-${String(index + 1)}`, category, at(iso), merchant)),
  ...EVENT_SEEDS.filter((seed) => seed.status === "posted" && seed.candidate !== null && SPENDING_KINDS.has(seed.candidate.kind)).map((seed) => {
    const c = seed.candidate as Candidate;
    return spendTx(`txn-${seed.id}`, c.category ?? "uncategorized", c.occurredAtMs ?? at(seed.receivedIso), c.counterparty ?? null);
  }),
];

/** The demo's profile: set up already, initials on teal (the demo has no Google photo). */
export const FIXTURE_PROFILE: ProfileRow = {
  displayName: "Demo",
  baseCurrency: "BDT",
  timezone: "Asia/Dhaka",
  reportingCycle: { kind: "calendarMonth" },
  notifications: { digestLocalTime: "20:00", frequency: "daily", minThresholdMinor: 0 },
  retentionPolicyVersion: 1,
  createdAtMs: at("2026-10-01T09:00:00"),
  avatar: { kind: "initials", color: "teal" },
  profileCompletedAtMs: at("2026-10-01T09:05:00"),
  lastSeenAtMs: at("2026-11-03T21:00:00"),
};

/** The demo's tips: the three facts its figures give, with advice on two (the third shows figures only). */
export const FIXTURE_TIPS: TipsRow = {
  id: "current",
  month: "2026-11",
  status: "ready",
  facts: [
    { id: "unsorted", kind: "unsorted", amountMinor: 250_000, headline: "৳2,500 isn't sorted yet", detail: "Sorting it shows where it went" },
    { id: "unexplainedCash", kind: "unexplainedCash", amountMinor: 500_000, headline: "৳5,000 cash isn't explained yet", detail: "Counting your cash keeps the picture right" },
    { id: "topSector:groceries", kind: "topSector", sector: "groceries", amountMinor: 682_000, compareMinor: 1_864_000, headline: "Groceries took 37% of spending", detail: "৳6,820 of ৳18,640 this month" },
  ],
  advice: {
    unsorted: "Sorting a shop once sorts its later spending too.",
    "topSector:groceries": "A weekly list and one big shop can trim the extra trips.",
  },
  factsHash: "demo",
  generatedAtMs: at("2026-11-06T19:00:00"),
  aiDay: "2026-11-06",
  aiFactsHash: "demo",
  adviceAtMs: at("2026-11-06T09:00:00"),
  model: "demo",
  promptVersion: "tips-v1",
  forcedDay: null,
  forcedToday: 0,
};

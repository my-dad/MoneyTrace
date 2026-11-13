import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Money } from "../money";
import { asAccountId } from "../ids";
import { LedgerDate } from "../ledger-date";
import { nominal, type AccountKind, type AccountRef } from "../ledger/account-ref";
import { reverseEntries, assertBalanced, type EntryDraft } from "../ledger/entry";
import type { PostingIntent } from "./intents";
import { createPostingPolicy, defaultPostingPolicy as policy } from "./posting-policy";

const bdt = (n: number): Money => Money.ofMinor(n, "BDT");
const t = (ms: number): LedgerDate => LedgerDate.fromEpochMs(ms);
const code = (c: string): unknown => expect.objectContaining({ code: c });
const acct = (id: string, kind: AccountKind): AccountRef => ({
  id: asAccountId(id),
  kind,
  currency: "BDT",
});
const bank = acct("bank1", "bank");
const bank2 = acct("bank2", "bank");
const cash = acct("cash1", "cash");
const cash2 = acct("cash2", "cash");
const fam = acct("fam1", "familyCash");
const card = acct("card1", "creditLiability");
const raw = (es: readonly EntryDraft[]): unknown[] =>
  es.map((x) => ({ accountId: x.account.id, side: x.side, minor: x.amount.minor }));
const signedFor = (a: AccountRef, es: readonly EntryDraft[]): number =>
  es
    .filter((x) => x.account.id === a.id)
    .reduce((s, x) => s + (x.side === "debit" ? x.amount.minor : -x.amount.minor), 0);
const D = (id: string, minor: number): unknown => ({ accountId: id, side: "debit", minor });
const C = (id: string, minor: number): unknown => ({ accountId: id, side: "credit", minor });
const exp = (cat: string): string => `nominal:expense:${cat}:BDT`;
const A = bdt(1000);

const valid: [string, PostingIntent, unknown[]][] = [
  [
    "withdrawal",
    { type: "withdrawal", bank, cash, amount: A },
    [D("cash1", 1000), C("bank1", 1000)],
  ],
  [
    "transfer bank->bank",
    { type: "transfer", from: bank, to: bank2, amount: A },
    [D("bank2", 1000), C("bank1", 1000)],
  ],
  [
    "transfer cash->bank",
    { type: "transfer", from: cash, to: bank, amount: A },
    [D("bank1", 1000), C("cash1", 1000)],
  ],
  [
    "transfer cash->cash",
    { type: "transfer", from: cash, to: cash2, amount: A },
    [D("cash2", 1000), C("cash1", 1000)],
  ],
  [
    "purchase bank",
    { type: "purchase", funding: bank, category: "food", amount: A },
    [D(exp("food"), 1000), C("bank1", 1000)],
  ],
  [
    "purchase cash",
    { type: "purchase", funding: cash, category: "food", amount: A },
    [D(exp("food"), 1000), C("cash1", 1000)],
  ],
  [
    "purchase familyCash",
    { type: "purchase", funding: fam, category: "food", amount: A },
    [D(exp("food"), 1000), C("fam1", 1000)],
  ],
  [
    "cardPurchase",
    { type: "cardPurchase", card, category: "food", amount: A },
    [D(exp("food"), 1000), C("card1", 1000)],
  ],
  [
    "cardRepayment",
    { type: "cardRepayment", bank, card, amount: A },
    [D("card1", 1000), C("bank1", 1000)],
  ],
  [
    "income bank",
    { type: "income", destination: bank, category: "salary", amount: A },
    [D("bank1", 1000), C("nominal:income:salary:BDT", 1000)],
  ],
  [
    "income cash",
    { type: "income", destination: cash, category: "salary", amount: A },
    [D("cash1", 1000), C("nominal:income:salary:BDT", 1000)],
  ],
  ["fee bank", { type: "fee", charged: bank, amount: A }, [D(exp("fees"), 1000), C("bank1", 1000)]],
  ["fee card", { type: "fee", charged: card, amount: A }, [D(exp("fees"), 1000), C("card1", 1000)]],
  [
    "refund to bank",
    { type: "refund", target: bank, category: "food", amount: A },
    [D("bank1", 1000), C(exp("food"), 1000)],
  ],
  [
    "refund to card",
    { type: "refund", target: card, category: "food", amount: A },
    [D("card1", 1000), C(exp("food"), 1000)],
  ],
  [
    "adjustment asset up",
    {
      type: "adjustment",
      account: cash,
      direction: "increase",
      amount: A,
      cause: "found",
      authorizedBy: "me",
    },
    [D("cash1", 1000), C("nominal:equity:adjustment:BDT", 1000)],
  ],
  [
    "adjustment asset down",
    {
      type: "adjustment",
      account: cash,
      direction: "decrease",
      amount: A,
      cause: "lost",
      authorizedBy: "me",
    },
    [D("nominal:equity:adjustment:BDT", 1000), C("cash1", 1000)],
  ],
  [
    "adjustment down across two cash accounts",
    {
      type: "adjustment",
      account: cash,
      direction: "decrease",
      amount: bdt(400),
      also: { account: cash2, amount: bdt(600) },
      cause: "count",
      authorizedBy: "me",
    },
    [D("nominal:equity:adjustment:BDT", 1000), C("cash1", 400), C("cash2", 600)],
  ],
  [
    "adjustment liability up",
    {
      type: "adjustment",
      account: card,
      direction: "increase",
      amount: A,
      cause: "x",
      authorizedBy: "me",
    },
    [D("nominal:equity:adjustment:BDT", 1000), C("card1", 1000)],
  ],
  [
    "adjustment liability down",
    {
      type: "adjustment",
      account: card,
      direction: "decrease",
      amount: A,
      cause: "x",
      authorizedBy: "me",
    },
    [D("card1", 1000), C("nominal:equity:adjustment:BDT", 1000)],
  ],
  [
    "opening asset +",
    { type: "openingBalance", account: bank, amount: A, effectiveAt: t(1) },
    [D("bank1", 1000), C("nominal:equity:opening:BDT", 1000)],
  ],
  [
    "opening asset -",
    { type: "openingBalance", account: bank, amount: bdt(-1000), effectiveAt: t(1) },
    [D("nominal:equity:opening:BDT", 1000), C("bank1", 1000)],
  ],
  [
    "opening liability +",
    { type: "openingBalance", account: card, amount: A, effectiveAt: t(1) },
    [D("nominal:equity:opening:BDT", 1000), C("card1", 1000)],
  ],
  [
    "opening liability -",
    { type: "openingBalance", account: card, amount: bdt(-1000), effectiveAt: t(1) },
    [D("card1", 1000), C("nominal:equity:opening:BDT", 1000)],
  ],
  [
    "opening zero",
    { type: "openingBalance", account: bank, amount: bdt(0), effectiveAt: t(1) },
    [],
  ],
  [
    "custody to family",
    { type: "cashCustodyTransfer", from: cash, to: fam, amount: A, holderName: "Mom" },
    [D("fam1", 1000), C("cash1", 1000)],
  ],
  [
    "custody from family",
    { type: "cashCustodyTransfer", from: fam, to: cash, amount: A, holderName: "Mom" },
    [D("cash1", 1000), C("fam1", 1000)],
  ],
  [
    "historicalImport",
    {
      type: "historicalImport",
      inner: { type: "withdrawal", bank, cash, amount: A },
      occurredAt: t(10),
      cutovers: [
        { accountId: bank.id, effectiveAt: t(5) },
        { accountId: cash.id, effectiveAt: t(5) },
      ],
    },
    [D("cash1", 1000), C("bank1", 1000)],
  ],
];

const base = { amount: A };
const opening = { type: "openingBalance", account: bank, amount: A, effectiveAt: t(1) } as const;
const cut = [{ accountId: bank.id, effectiveAt: t(5) }];
const invalid: [string, PostingIntent, string][] = [
  ["withdrawal bank not bank", { type: "withdrawal", bank: cash, cash, ...base }, "invalidIntent"],
  ["withdrawal cash not cash", { type: "withdrawal", bank, cash: fam, ...base }, "invalidIntent"],
  ["withdrawal zero", { type: "withdrawal", bank, cash, amount: bdt(0) }, "invalidIntent"],
  ["withdrawal negative", { type: "withdrawal", bank, cash, amount: bdt(-1) }, "invalidIntent"],
  ["transfer same", { type: "transfer", from: bank, to: bank, ...base }, "invalidIntent"],
  ["transfer bank->cash", { type: "transfer", from: bank, to: cash, ...base }, "invalidIntent"],
  ["transfer to card", { type: "transfer", from: bank, to: card, ...base }, "invalidIntent"],
  ["transfer family", { type: "transfer", from: cash, to: fam, ...base }, "invalidIntent"],
  [
    "purchase card funding",
    { type: "purchase", funding: card, category: "food", ...base },
    "invalidIntent",
  ],
  [
    "purchase nominal funding",
    { type: "purchase", funding: nominal.expense("a", "BDT"), category: "food", ...base },
    "invalidIntent",
  ],
  [
    "cardPurchase bank",
    { type: "cardPurchase", card: bank, category: "food", ...base },
    "invalidIntent",
  ],
  ["repayment wrong bank", { type: "cardRepayment", bank: cash, card, ...base }, "invalidIntent"],
  ["repayment wrong card", { type: "cardRepayment", bank, card: bank2, ...base }, "invalidIntent"],
  [
    "income to card",
    { type: "income", destination: card, category: "salary", ...base },
    "invalidIntent",
  ],
  [
    "income to family",
    { type: "income", destination: fam, category: "salary", ...base },
    "invalidIntent",
  ],
  ["fee on cash", { type: "fee", charged: cash, ...base }, "invalidIntent"],
  [
    "refund nominal",
    { type: "refund", target: nominal.income("x", "BDT"), category: "food", ...base },
    "invalidIntent",
  ],
  [
    "adjustment also on the same account",
    { type: "adjustment", account: cash, direction: "decrease", amount: A, also: { account: cash, amount: A }, cause: "x", authorizedBy: "me" },
    "invalidIntent",
  ],
  [
    "adjustment also zero",
    { type: "adjustment", account: cash, direction: "decrease", amount: A, also: { account: cash2, amount: bdt(0) }, cause: "x", authorizedBy: "me" },
    "invalidIntent",
  ],
  [
    "adjustment also nominal",
    {
      type: "adjustment",
      account: cash,
      direction: "decrease",
      amount: A,
      also: { account: nominal.expense("food", "BDT"), amount: A },
      cause: "x",
      authorizedBy: "me",
    },
    "invalidIntent",
  ],
  [
    "adjustment blank cause",
    {
      type: "adjustment",
      account: cash,
      direction: "increase",
      cause: " ",
      authorizedBy: "me",
      ...base,
    },
    "invalidIntent",
  ],
  [
    "adjustment blank auth",
    {
      type: "adjustment",
      account: cash,
      direction: "increase",
      cause: "x",
      authorizedBy: "",
      ...base,
    },
    "invalidIntent",
  ],
  [
    "adjustment nominal",
    {
      type: "adjustment",
      account: nominal.expense("a", "BDT"),
      direction: "increase",
      cause: "x",
      authorizedBy: "me",
      ...base,
    },
    "invalidIntent",
  ],
  [
    "opening nominal",
    { type: "openingBalance", account: nominal.openingEquity("BDT"), amount: A, effectiveAt: t(1) },
    "invalidIntent",
  ],
  [
    "custody same",
    { type: "cashCustodyTransfer", from: fam, to: fam, holderName: "Mom", ...base },
    "invalidIntent",
  ],
  [
    "custody bank",
    { type: "cashCustodyTransfer", from: bank, to: fam, holderName: "Mom", ...base },
    "invalidIntent",
  ],
  [
    "custody no family",
    { type: "cashCustodyTransfer", from: cash, to: cash2, holderName: "Mom", ...base },
    "invalidIntent",
  ],
  [
    "custody blank holder",
    { type: "cashCustodyTransfer", from: cash, to: fam, holderName: "  ", ...base },
    "invalidIntent",
  ],
  [
    "import of opening",
    { type: "historicalImport", inner: opening, occurredAt: t(10), cutovers: cut },
    "invalidIntent",
  ],
  [
    "import of import",
    {
      type: "historicalImport",
      inner: {
        type: "historicalImport",
        inner: { type: "purchase", funding: bank, category: "a", ...base },
        occurredAt: t(10),
        cutovers: cut,
      } as never,
      occurredAt: t(10),
      cutovers: cut,
    },
    "invalidIntent",
  ],
  [
    "import no marker",
    {
      type: "historicalImport",
      inner: { type: "withdrawal", bank, cash, ...base },
      occurredAt: t(10),
      cutovers: cut,
    },
    "beforeCutover",
  ],
  [
    "import at cutover",
    {
      type: "historicalImport",
      inner: { type: "purchase", funding: bank, category: "a", ...base },
      occurredAt: t(5),
      cutovers: cut,
    },
    "beforeCutover",
  ],
  [
    "import before cutover",
    {
      type: "historicalImport",
      inner: { type: "purchase", funding: bank, category: "a", ...base },
      occurredAt: t(4),
      cutovers: cut,
    },
    "beforeCutover",
  ],
];

const positiveRule: [string, (amount: Money) => PostingIntent][] = [
  ["transfer", (amount) => ({ type: "transfer", from: bank, to: bank2, amount })],
  ["purchase", (amount) => ({ type: "purchase", funding: bank, category: "food", amount })],
  ["cardPurchase", (amount) => ({ type: "cardPurchase", card, category: "food", amount })],
  ["cardRepayment", (amount) => ({ type: "cardRepayment", bank, card, amount })],
  ["income", (amount) => ({ type: "income", destination: bank, category: "salary", amount })],
  ["fee", (amount) => ({ type: "fee", charged: bank, amount })],
  ["refund", (amount) => ({ type: "refund", target: bank, category: "food", amount })],
  [
    "adjustment",
    (amount) => ({
      type: "adjustment",
      account: cash,
      direction: "increase",
      amount,
      cause: "c",
      authorizedBy: "me",
    }),
  ],
  [
    "cashCustodyTransfer",
    (amount) => ({ type: "cashCustodyTransfer", from: cash, to: fam, amount, holderName: "Mom" }),
  ],
];

describe("positive amount rule", () => {
  it.each(positiveRule.flatMap(([n, build]) => [0, -1].map((v) => [n, v, build] as const)))(
    "%s rejects amount %d with invalidIntent",
    (_n, v, build) => {
      expect(() => policy.toEntries(build(bdt(v)))).toThrow(code("invalidIntent"));
    },
  );
});

describe("posting strategies", () => {
  it.each(valid)("%s", (_n, intent, expected) => {
    expect(raw(policy.toEntries(intent))).toEqual(expected);
  });

  it.each(invalid)("rejects: %s", (_n, intent, c) => {
    expect(() => policy.toEntries(intent)).toThrow(code(c));
  });

  it("rejects an unknown intent type", () => {
    expect(() => policy.toEntries({ type: "nope" } as unknown as PostingIntent)).toThrow(
      code("invalidIntent"),
    );
  });
});

describe("accounting invariants", () => {
  it("gate 25: a withdrawal moves bank to cash and recognizes no expense", () => {
    const entries = policy.toEntries({ type: "withdrawal", bank, cash, amount: bdt(500_000) });
    expect(raw(entries)).toEqual([
      { accountId: cash.id, side: "debit", minor: 500_000 },
      { accountId: bank.id, side: "credit", minor: 500_000 },
    ]);
    expect(entries.some((x) => x.account.kind === "expense")).toBe(false);
  });

  it("gate 26: a purchase is one expense and a partial repayment reduces the liability by the amount paid", () => {
    const bought = policy.toEntries({
      type: "cardPurchase",
      card,
      category: "groceries",
      amount: bdt(100_000),
    });
    const paid = policy.toEntries({ type: "cardRepayment", bank, card, amount: bdt(40_000) });
    expect(signedFor(card, [...bought, ...paid])).toBe(-60_000);
    expect(paid.some((x) => x.account.kind === "expense")).toBe(false);
    expect(bought.filter((x) => x.account.kind === "expense")).toHaveLength(1);
  });

  it("a repayment above the amount owed is allowed and leaves a credit balance", () => {
    const entries = policy.toEntries({ type: "cardRepayment", bank, card, amount: bdt(999_999) });
    expect(signedFor(card, entries)).toBe(999_999);
  });

  it("custody transfer to family cash recognizes no expense", () => {
    const entries = policy.toEntries({
      type: "cashCustodyTransfer",
      from: cash,
      to: fam,
      amount: A,
      holderName: "Mom",
    });
    expect(entries.some((x) => x.account.kind === "expense")).toBe(false);
    expect(signedFor(cash, entries)).toBe(-1000);
    expect(signedFor(fam, entries)).toBe(1000);
  });

  it("opening balance recognizes neither income nor expense", () => {
    for (const amount of [A, bdt(-1000)]) {
      for (const account of [bank, card]) {
        const entries = policy.toEntries({
          type: "openingBalance",
          account,
          amount,
          effectiveAt: t(1),
        });
        expect(
          entries.some((x) => x.account.kind === "expense" || x.account.kind === "income"),
        ).toBe(false);
      }
    }
  });

  it("adjustment never touches an expense account", () => {
    for (const direction of ["increase", "decrease"] as const) {
      for (const account of [cash, card]) {
        const entries = policy.toEntries({
          type: "adjustment",
          account,
          direction,
          amount: A,
          cause: "c",
          authorizedBy: "me",
        });
        expect(
          entries.some((x) => x.account.kind === "expense" || x.account.kind === "income"),
        ).toBe(false);
      }
    }
  });

  it("gate 36: an import at or before the cutover is rejected", () => {
    const cutovers = [{ accountId: bank.id, effectiveAt: t(1000) }];
    const inner = {
      type: "purchase",
      funding: bank,
      category: "groceries",
      amount: bdt(1),
    } as const;
    expect(() =>
      policy.toEntries({ type: "historicalImport", inner, occurredAt: t(1000), cutovers }),
    ).toThrow(code("beforeCutover"));
    expect(
      policy.toEntries({ type: "historicalImport", inner, occurredAt: t(1001), cutovers }),
    ).toHaveLength(2);
  });
});

const amt = fc.integer({ min: 1, max: 1_000_000_000 }).map(bdt);
const cat = fc.constantFrom("food", "rent", "transport");
const intents: fc.Arbitrary<PostingIntent> = fc.oneof(
  amt.map((amount) => ({ type: "withdrawal", bank, cash, amount }) as const),
  fc
    .tuple(fc.constantFrom([bank, bank2], [cash, bank], [cash, cash2] as const), amt)
    .map(([[from, to], amount]) => ({ type: "transfer", from, to, amount }) as const),
  fc
    .tuple(fc.constantFrom(bank, cash, fam), cat, amt)
    .map(
      ([funding, category, amount]) => ({ type: "purchase", funding, category, amount }) as const,
    ),
  fc
    .tuple(cat, amt)
    .map(([category, amount]) => ({ type: "cardPurchase", card, category, amount }) as const),
  amt.map((amount) => ({ type: "cardRepayment", bank, card, amount }) as const),
  fc
    .tuple(fc.constantFrom(bank, cash), cat, amt)
    .map(
      ([destination, category, amount]) =>
        ({ type: "income", destination, category, amount }) as const,
    ),
  fc
    .tuple(fc.constantFrom(bank, card), amt)
    .map(([charged, amount]) => ({ type: "fee", charged, amount }) as const),
  fc
    .tuple(fc.constantFrom(bank, cash, card), cat, amt)
    .map(([target, category, amount]) => ({ type: "refund", target, category, amount }) as const),
  fc
    .tuple(fc.constantFrom(bank, cash, fam, card), fc.constantFrom("increase", "decrease"), amt)
    .map(
      ([account, direction, amount]) =>
        ({
          type: "adjustment",
          account,
          direction,
          amount,
          cause: "c",
          authorizedBy: "me",
        }) as const,
    ),
  fc
    .tuple(fc.constantFrom(bank, cash, card), fc.integer({ min: -1_000_000, max: 1_000_000 }))
    .map(
      ([account, n]) =>
        ({ type: "openingBalance", account, amount: bdt(n), effectiveAt: t(1) }) as const,
    ),
  fc.tuple(fc.boolean(), amt).map(
    ([toFam, amount]) =>
      ({
        type: "cashCustodyTransfer",
        from: toFam ? cash : fam,
        to: toFam ? fam : cash,
        amount,
        holderName: "Mom",
      }) as const,
  ),
  amt.map(
    (amount) =>
      ({
        type: "historicalImport",
        inner: { type: "purchase", funding: bank, category: "food", amount },
        occurredAt: t(10),
        cutovers: cut,
      }) as const,
  ),
);

describe("properties", () => {
  it("every valid intent balances and nets to zero with its reversal", () => {
    fc.assert(
      fc.property(intents, (intent) => {
        const entries = policy.toEntries(intent);
        if (entries.length > 0) assertBalanced(entries);
        const all = [...entries, ...reverseEntries(entries)];
        for (const a of new Set(all.map((x) => x.account.id))) {
          const net = all
            .filter((x) => x.account.id === a)
            .reduce((n, x) => n + (x.side === "debit" ? x.amount.minor : -x.amount.minor), 0);
          expect(net).toBe(0);
        }
      }),
    );
  });
});

describe("open/closed", () => {
  it("an extra strategy handles a new type without changing existing strategies", () => {
    const extended = createPostingPolicy([
      ...policy.strategies,
      {
        type: "custom",
        toEntries: () => [
          { account: bank, side: "debit", amount: A },
          { account: cash, side: "credit", amount: A },
        ],
      },
    ]);
    expect(extended.toEntries({ type: "custom" } as unknown as PostingIntent)).toHaveLength(2);
    expect(extended.toEntries({ type: "withdrawal", bank, cash, amount: A })).toHaveLength(2);
  });

  it("rejects duplicate strategy types", () => {
    expect(() => createPostingPolicy([...policy.strategies, ...policy.strategies])).toThrow(
      code("invalidConfig"),
    );
  });

  it("rejects a strategy that yields unbalanced entries", () => {
    const bad = createPostingPolicy([
      {
        type: "bad",
        toEntries: () => [
          { account: bank, side: "debit", amount: A },
          { account: cash, side: "credit", amount: bdt(1) },
        ],
      },
    ]);
    expect(() => bad.toEntries({ type: "bad" } as unknown as PostingIntent)).toThrow(
      code("unbalancedEntries"),
    );
  });
});

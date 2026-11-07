import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asTransactionId,
  type AccountRef,
  type CurrencyCode,
  type OwnerId,
  type PostingIntent,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { EntryRecord, LedgerReader, TransactionRecord } from "../ports/ledger-reader";
import type { LedgerWriter } from "../ports/ledger-writer";
import { ReverseAndReplace } from "./reverse-and-replace";

type Deps = {
  reader: LedgerReader;
  writer: LedgerWriter;
  accounts: AccountRepository;
  hasher: Hasher;
  clock: Clock;
};

const refOf = (e: EntryRecord): AccountRef => ({
  id: asAccountId(e.accountId),
  kind: e.accountKind,
  currency: e.currency,
});

/** The same transaction with a different amount, rebuilt from what the ledger holds. */
function withAmount(
  tx: TransactionRecord,
  entries: readonly EntryRecord[],
  amount: Money,
): PostingIntent {
  const debit = entries.find((e) => e.side === "debit");
  const credit = entries.find((e) => e.side === "credit");
  if (debit === undefined || credit === undefined) {
    throw new DomainError("invalidIntent", "this transaction cannot be replaced");
  }
  const [from, to] = [refOf(credit), refOf(debit)];
  const category = tx.category ?? "uncategorized";
  switch (tx.intentType) {
    case "withdrawal":
      return { type: "withdrawal", bank: from, cash: to, amount };
    case "transfer":
      return { type: "transfer", from, to, amount };
    case "purchase":
      return { type: "purchase", funding: from, category, amount };
    case "cardPurchase":
      return { type: "cardPurchase", card: from, category, amount };
    case "cardRepayment":
      return { type: "cardRepayment", bank: from, card: to, amount };
    case "income":
      return { type: "income", destination: to, category, amount };
    case "fee":
      return { type: "fee", charged: from, amount };
    case "refund":
      return { type: "refund", target: to, category, amount };
    case "cashCustodyTransfer":
      return {
        type: "cashCustodyTransfer",
        from,
        to,
        amount,
        holderName: tx.auditDetails?.holderName ?? "unknown",
      };
    default:
      throw new DomainError("invalidIntent", "this kind of transaction cannot be replaced here");
  }
}

export class CorrectTransaction {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    transactionId: string;
    replacement?: { amountMinor: number; currency: CurrencyCode; occurredAtMs?: number };
    rationale: string;
  }): Promise<{
    reversalTransactionId: string;
    replacementTransactionId?: string;
    status: "recorded" | "alreadyRecorded";
  }> {
    const { ownerId, replacement } = input;
    const { reader } = this.deps;
    const id = asTransactionId(input.transactionId);
    const tx = await reader.getTransaction(ownerId, id);
    if (tx === null) throw new DomainError("resourceNotFound", "no such transaction");
    const intent =
      replacement === undefined
        ? null
        : withAmount(
            tx,
            await reader.getEntries(ownerId, id),
            Money.ofMinor(replacement.amountMinor, replacement.currency),
          );
    const result = await new ReverseAndReplace(this.deps).execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`correct-${input.idempotencyKey}`),
      originalTransactionId: id,
      replacement: intent,
      actor: ownerId,
      rationale: input.rationale,
      ...(replacement?.occurredAtMs === undefined
        ? {}
        : { occurredAtMs: replacement.occurredAtMs }),
    });
    if (result.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "that key was used for a different correction");
    }
    return {
      reversalTransactionId: `${id}:rev`,
      ...(intent === null ? {} : { replacementTransactionId: `${id}:repl` }),
      status: result.status === "committed" ? "recorded" : "alreadyRecorded",
    };
  }
}

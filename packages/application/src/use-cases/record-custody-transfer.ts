import {
  DomainError,
  Money,
  asAccountId,
  asIdempotencyKey,
  asTransactionId,
  type CurrencyCode,
  type OwnerId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { PostTransaction } from "./post-transaction";

export class RecordCustodyTransfer {
  private readonly deps: { accounts: AccountRepository; post: PostTransaction };

  constructor(deps: { accounts: AccountRepository; post: PostTransaction }) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    fromAccountId: string;
    toAccountId: string;
    amountMinor: number;
    currency: CurrencyCode;
    holderName: string;
    occurredAtMs: number;
  }): Promise<{ transactionId: string; status: "recorded" | "alreadyRecorded" }> {
    const { ownerId } = input;
    const from = asAccountId(input.fromAccountId);
    const to = asAccountId(input.toAccountId);
    const found = await this.deps.accounts.getMany(ownerId, [from, to]);
    const fromRecord = found.find((a) => a.id === from);
    const toRecord = found.find((a) => a.id === to);
    if (fromRecord === undefined || toRecord === undefined) {
      throw new DomainError("accountInvalid", "account is missing");
    }
    const transactionId = `txn-custody-${input.idempotencyKey}`;
    const result = await this.deps.post.execute({
      ownerId,
      idempotencyKey: asIdempotencyKey(`custody-${input.idempotencyKey}`),
      transactionId: asTransactionId(transactionId),
      intent: {
        type: "cashCustodyTransfer",
        from: { id: from, kind: fromRecord.kind, currency: fromRecord.currency },
        to: { id: to, kind: toRecord.kind, currency: toRecord.currency },
        amount: Money.ofMinor(input.amountMinor, input.currency),
        holderName: input.holderName,
      },
      occurredAtMs: input.occurredAtMs,
      sourceEventIds: [],
      actor: ownerId,
    });
    if (result.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "that key was used for a different transfer");
    }
    return {
      transactionId,
      status: result.status === "committed" ? "recorded" : "alreadyRecorded",
    };
  }
}

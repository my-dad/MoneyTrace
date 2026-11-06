import {
  DomainError,
  LedgerDate,
  asIdempotencyKey,
  asTransactionId,
  defaultPostingPolicy,
  type AccountId,
  type Money,
  type OwnerId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import {
  canonicalPayload,
  type LedgerCommitResult,
  type LedgerWriter,
} from "../ports/ledger-writer";
import { assertAccountsUsable } from "./account-validation";

type Deps = { writer: LedgerWriter; accounts: AccountRepository; hasher: Hasher; clock: Clock };

export class RecordOpeningBalance {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    accountId: AccountId;
    amount: Money;
    effectiveAtMs: number;
    actor: string;
  }): Promise<LedgerCommitResult> {
    const { ownerId, accountId, amount } = input;
    const effectiveAt = LedgerDate.fromEpochMs(input.effectiveAtMs);
    const [record] = await this.deps.accounts.getMany(ownerId, [accountId]);
    if (record === undefined) throw new DomainError("accountInvalid", "account not found");

    const account = { id: accountId, kind: record.kind, currency: amount.currency };
    const entries = defaultPostingPolicy.toEntries({
      type: "openingBalance",
      account,
      amount,
      effectiveAt,
    });
    // A zero opening balance has no entries, so the account check needs the account itself.
    await assertAccountsUsable(
      this.deps.accounts,
      ownerId,
      entries.length > 0 ? entries : [{ account, side: "debit", amount }],
    );

    const payloadHash = this.deps.hasher.sha256(
      canonicalPayload(entries, input.effectiveAtMs, {
        accountId,
        amountMinor: amount.minor,
        currency: amount.currency,
      }),
    );
    return this.deps.writer.commit(ownerId, {
      idempotencyKey: asIdempotencyKey(`opening:${accountId}`),
      payloadHash,
      transaction: {
        id: asTransactionId(`opening-${accountId}`),
        state: "posted",
        intentType: "openingBalance",
        occurredAtMs: input.effectiveAtMs,
        currency: amount.currency,
        sourceEventIds: [],
        actor: input.actor,
        committedAtMs: this.deps.clock.nowMs(),
      },
      entries,
      cutoverMarker: { accountId, effectiveAt },
    });
  }
}

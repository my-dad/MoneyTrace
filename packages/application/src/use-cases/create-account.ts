import {
  DomainError,
  asAccountId,
  type AccountId,
  type CurrencyCode,
  type OwnerId,
  type RealAccountKind,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";

export class CreateAccount {
  private readonly deps: { accounts: AccountRepository; ids: IdGenerator; clock: Clock };

  constructor(deps: { accounts: AccountRepository; ids: IdGenerator; clock: Clock }) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    kind: RealAccountKind;
    name: string;
    currency: CurrencyCode;
  }): Promise<{ accountId: AccountId }> {
    if (input.name.trim() === "") throw new DomainError("invalidIntent", "name must not be blank");
    const id = asAccountId(this.deps.ids.newId());
    await this.deps.accounts.create(input.ownerId, {
      id,
      kind: input.kind,
      name: input.name,
      currency: input.currency,
      status: "active",
      createdAtMs: this.deps.clock.nowMs(),
    });
    return { accountId: id };
  }
}

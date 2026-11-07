import { DomainError, asAccountId, type OwnerId, type RealAccountKind } from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";
import type {
  PaymentInstrumentKind,
  PaymentInstrumentRepository,
} from "../ports/payment-instrument-repository";

const LINKED_KIND: Record<PaymentInstrumentKind, RealAccountKind> = {
  debitCard: "bank",
  bankAccount: "bank",
  mobileWallet: "bank",
  creditCard: "creditLiability",
};

const invalid = (message: string): DomainError => new DomainError("invalidIntent", message);

type Deps = {
  accounts: AccountRepository;
  instruments: PaymentInstrumentRepository;
  ids: IdGenerator;
  clock: Clock;
};

export class CreatePaymentInstrument {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    accountId: string;
    provider: string;
    maskedIdentifier: string;
    type: PaymentInstrumentKind;
  }): Promise<{ instrumentId: string }> {
    const { ownerId, type, maskedIdentifier: mask } = input;
    // A full number must never be stored, so anything but the last digits is refused outright.
    const maskOk = type === "mobileWallet" ? mask === "" : /^\d{3,4}$/.test(mask);
    if (!maskOk) throw invalid("the identifier must be only the last 3 or 4 digits");

    const accountId = asAccountId(input.accountId);
    const [account] = await this.deps.accounts.getMany(ownerId, [accountId]);
    if (account === undefined || account.status !== "active") {
      throw new DomainError("accountInvalid", "account is missing or closed");
    }
    if (account.kind !== LINKED_KIND[type]) {
      throw invalid("this instrument cannot link to that kind of account");
    }
    const instrumentId = this.deps.ids.newId();
    await this.deps.instruments.create(ownerId, {
      id: instrumentId,
      kind: type,
      provider: input.provider,
      maskedIdentifier: mask,
      linkedAccountId: accountId,
      status: "active",
      createdAtMs: this.deps.clock.nowMs(),
    });
    return { instrumentId };
  }
}

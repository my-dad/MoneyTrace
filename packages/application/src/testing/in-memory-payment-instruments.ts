import type { OwnerId } from "@moneytrace/domain";
import { instrumentMatches } from "../ledger-guards";
import type {
  InstrumentQuery,
  PaymentInstrumentRecord,
  PaymentInstrumentRepository,
} from "../ports/payment-instrument-repository";

export class InMemoryPaymentInstruments implements PaymentInstrumentRepository {
  private readonly rows = new Map<string, PaymentInstrumentRecord[]>();

  create(ownerId: OwnerId, record: PaymentInstrumentRecord): Promise<void> {
    this.rows.set(ownerId, [...(this.rows.get(ownerId) ?? []), { ...record }]);
    return Promise.resolve();
  }

  findForCandidate(ownerId: OwnerId, query: InstrumentQuery): Promise<PaymentInstrumentRecord[]> {
    return Promise.resolve(
      (this.rows.get(ownerId) ?? [])
        .filter((r) => instrumentMatches(r, query))
        .map((r) => ({ ...r })),
    );
  }
}

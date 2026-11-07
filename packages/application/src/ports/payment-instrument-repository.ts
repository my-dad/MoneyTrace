import type { AccountId, OwnerId } from "@moneytrace/domain";

export type PaymentInstrumentKind = "debitCard" | "creditCard" | "mobileWallet" | "bankAccount";

/** Mirrors the `paymentInstruments` schema. Only the last digits of a number are ever stored. */
export type PaymentInstrumentRecord = {
  id: string;
  kind: PaymentInstrumentKind;
  /** A parser `provider`, or `other`. It disambiguates the same ending at two banks. */
  provider: string;
  /** The last 3 or 4 digits; empty for a mobile wallet, whose SMS carry none. */
  maskedIdentifier: string;
  linkedAccountId: AccountId;
  status: "active" | "closed";
  createdAtMs: number;
};

export type InstrumentQuery = { provider: string; mask?: string };

export type PaymentInstrumentRepository = {
  create(ownerId: OwnerId, record: PaymentInstrumentRecord): Promise<void>;
  /** Every match, so callers can see that two accounts share an ending and ask. */
  findForCandidate(ownerId: OwnerId, query: InstrumentQuery): Promise<PaymentInstrumentRecord[]>;
};

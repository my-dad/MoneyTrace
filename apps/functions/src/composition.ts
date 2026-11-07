import {
  BootstrapUser,
  CancelSourceEvent,
  ConfirmCandidate,
  IntakeEvidence,
  RetryProviderCall,
  RetrySourceEvent,
  CreateAccount,
  CreatePaymentInstrument,
  RecordOpeningBalance,
  type IdGenerator,
  type Logger,
} from "@moneytrace/application";
import {
  CryptoIdGenerator,
  FirestoreAccountRepository,
  FirestoreLedgerReader,
  FirestoreLedgerWriter,
  FirestoreProviderCallRepository,
  FirestoreSourceEventRepository,
  FirestorePaymentInstrumentRepository,
  FirestoreUserProfileRepository,
  JsonLogger,
  NodeHasher,
  SystemClock,
} from "@moneytrace/infrastructure";
import type { Firestore } from "firebase-admin/firestore";

export type Deps = {
  logger: Logger;
  ids: IdGenerator;
  bootstrapUser: BootstrapUser;
  createAccount: CreateAccount;
  createPaymentInstrument: CreatePaymentInstrument;
  recordOpeningBalance: RecordOpeningBalance;
  intakeEvidence: IntakeEvidence;
  confirmCandidate: ConfirmCandidate;
  retrySourceEvent: RetrySourceEvent;
  cancelSourceEvent: CancelSourceEvent;
};

/** The only place adapters are wired to ports. */
export function composeDeps(db: Firestore): Deps {
  const clock = new SystemClock();
  const ids = new CryptoIdGenerator();
  const hasher = new NodeHasher();
  const accounts = new FirestoreAccountRepository(db, clock);
  const reader = new FirestoreLedgerReader(db, clock);
  const writer = new FirestoreLedgerWriter(db, clock);
  const profiles = new FirestoreUserProfileRepository(db);
  const logger = new JsonLogger((line) => {
    console.log(line);
  });
  const sourceEvents = new FirestoreSourceEventRepository(db, clock, logger);
  const providerCalls = new FirestoreProviderCallRepository(db, clock);
  return {
    logger,
    intakeEvidence: new IntakeEvidence({ sourceEvents, hasher, ids, clock, logger }),
    confirmCandidate: new ConfirmCandidate({ sourceEvents, accounts, clock }),
    retrySourceEvent: new RetrySourceEvent({
      sourceEvents,
      retryProvider: new RetryProviderCall({ sourceEvents, providerCalls, clock }),
      clock,
    }),
    cancelSourceEvent: new CancelSourceEvent({ sourceEvents, clock }),
    ids,
    bootstrapUser: new BootstrapUser({ profiles, accounts, clock }),
    createAccount: new CreateAccount({ accounts, ids, clock }),
    createPaymentInstrument: new CreatePaymentInstrument({
      accounts,
      instruments: new FirestorePaymentInstrumentRepository(db),
      ids,
      clock,
    }),
    recordOpeningBalance: new RecordOpeningBalance({ writer, reader, accounts, hasher, clock }),
  };
}

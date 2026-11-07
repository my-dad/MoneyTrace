import {
  BootstrapUser,
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
  return {
    logger: new JsonLogger((line) => {
      console.log(line);
    }),
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

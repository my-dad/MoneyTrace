import { OWNER_COLLECTIONS } from "@moneytrace/contracts";
import {
  collection,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type FirestoreError,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import type { LedgerEntryRow, ReadModelGateway, Watch } from "./read-model-gateway";

const ownerCollection = (uid: string, name: string) => collection(db, `users/${uid}/${name}`);

function errorOf(error: FirestoreError): Error {
  return new Error(error.message);
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (uid === undefined) throw new Error("a signed-in user is required");
  return uid;
}

function watch<T>(subscribe: (next: (rows: T[]) => void, error: (error: FirestoreError) => void) => () => void, onValue: (rows: T[]) => void, onError?: (error: Error) => void): () => void {
  try {
    return subscribe(onValue, (error) => onError?.(errorOf(error)));
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error("read failed"));
    return () => undefined;
  }
}

export function createFirebaseReadModelGateway(): ReadModelGateway {
  const simple = <T>(name: string, parse: (value: unknown) => T): Watch<T> => (onValue, onError) => {
    return watch(
      (next, error) => {
        return onSnapshot(ownerCollection(requireUid(), name), (snapshot) => { next(snapshot.docs.map((doc) => parse(doc.data()))); }, error);
      },
      onValue,
      onError,
    );
  };

  return {
    watchAccounts: simple("accounts", (value) => OWNER_COLLECTIONS.accounts.parse(value)),
    watchBalances: simple("balances", (value) => OWNER_COLLECTIONS.balances.parse(value)),
    watchFollowUps: simple("followUps", (value) => OWNER_COLLECTIONS.followUps.parse(value)),
    watchSourceEvents(limit, onValue, onError) {
      return watch(
        (next, error) => {
          return onSnapshot(query(ownerCollection(requireUid(), "sourceEvents"), orderBy("receivedAtMs", "desc"), firestoreLimit(limit)), (snapshot) => { next(snapshot.docs.map((doc) => OWNER_COLLECTIONS.sourceEvents.parse(doc.data()))); }, error);
        },
        onValue,
        onError,
      );
    },
    watchExpenseEntries(fromMs, toMs, onValue, onError) {
      return watch((next, error) => ledgerKind("expense", fromMs, toMs, next, error), onValue, onError);
    },
    watchIncomeEntries(fromMs, toMs, onValue, onError) {
      return watch((next, error) => ledgerKind("income", fromMs, toMs, next, error), onValue, onError);
    },
    watchSourceEntries(fromMs, toMs, onValue, onError) {
      return watch(
        (next, error) =>
          onSnapshot(query(ownerCollection(requireUid(), "ledgerEntries"), where("accountKind", "in", ["bank", "cash", "familyCash", "creditLiability"]), where("occurredAtMs", ">=", fromMs), where("occurredAtMs", "<=", toMs), orderBy("occurredAtMs")), (snapshot) => { next(snapshot.docs.map((doc) => OWNER_COLLECTIONS.ledgerEntries.parse(doc.data()))); }, error),
        onValue,
        onError,
      );
    },
    watchAiUsage(fromMs, toMs, onValue, onError) {
      return watch(
        (next, error) =>
          onSnapshot(query(ownerCollection(requireUid(), "aiUsage"), where("createdAtMs", ">=", fromMs), where("createdAtMs", "<=", toMs), orderBy("createdAtMs")), (snapshot) => { next(snapshot.docs.map((doc) => OWNER_COLLECTIONS.aiUsage.parse(doc.data()))); }, error),
        onValue,
        onError,
      );
    },
  };
}

/** Ledger entries of one nominal kind in a time range (the accountKind + occurredAtMs index). */
function ledgerKind(kind: "expense" | "income", fromMs: number, toMs: number, next: (rows: LedgerEntryRow[]) => void, error: (error: FirestoreError) => void): () => void {
  return onSnapshot(query(ownerCollection(requireUid(), "ledgerEntries"), where("accountKind", "==", kind), where("occurredAtMs", ">=", fromMs), where("occurredAtMs", "<=", toMs), orderBy("occurredAtMs")), (snapshot) => { next(snapshot.docs.map((doc) => OWNER_COLLECTIONS.ledgerEntries.parse(doc.data()))); }, error);
}

import { InMemoryAccountRepository, InMemoryLedger } from "./in-memory-ledger";
import { FakeClock, SequentialIdGenerator, TestHasher } from "./fakes";

/** One fully wired in-memory application, for use-case tests. */
export function createWorld(): {
  ledger: InMemoryLedger;
  accounts: InMemoryAccountRepository;
  clock: FakeClock;
  ids: SequentialIdGenerator;
  hasher: TestHasher;
} {
  return {
    ledger: new InMemoryLedger(),
    accounts: new InMemoryAccountRepository(),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
    hasher: new TestHasher(),
  };
}

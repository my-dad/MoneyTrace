import { InMemoryAccountRepository, InMemoryLedger } from "./in-memory-ledger";
import { describeLedgerContract } from "./ledger-contract";

describeLedgerContract("in-memory", () => {
  const ledger = new InMemoryLedger();
  return Promise.resolve({
    writer: ledger,
    reader: ledger,
    accounts: new InMemoryAccountRepository(),
  });
});

import { InMemoryReadModelGateway } from "../in-memory-read-model-gateway";
import {
  FIXTURE_ACCOUNTS,
  FIXTURE_BALANCES,
  FIXTURE_EXPENSE_ENTRIES,
  FIXTURE_FOLLOW_UPS,
  FIXTURE_SOURCE_EVENTS,
} from "./household";

/** The in-memory gateway, seeded with the demo household. */
export function createFixtureReadModels(): InMemoryReadModelGateway {
  const gateway = new InMemoryReadModelGateway();
  gateway.setAccounts(FIXTURE_ACCOUNTS);
  gateway.setBalances(FIXTURE_BALANCES);
  gateway.setFollowUps(FIXTURE_FOLLOW_UPS);
  gateway.setSourceEvents([...FIXTURE_SOURCE_EVENTS].sort((a, b) => b.receivedAtMs - a.receivedAtMs));
  gateway.setExpenseEntries(FIXTURE_EXPENSE_ENTRIES);
  return gateway;
}

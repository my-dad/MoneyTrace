import type {
  AccountRow,
  BalanceRow,
  ExpenseEntryRow,
  FollowUpRow,
  ReadModelGateway,
  SourceEventRow,
} from "./read-model-gateway";

type Listener<T> = (rows: T[]) => void;

export class InMemoryReadModelGateway implements ReadModelGateway {
  private accounts: AccountRow[] = [];
  private balances: BalanceRow[] = [];
  private followUps: FollowUpRow[] = [];
  private sourceEvents: SourceEventRow[] = [];
  private expenseEntries: ExpenseEntryRow[] = [];
  private readonly accountListeners = new Set<Listener<AccountRow>>();
  private readonly balanceListeners = new Set<Listener<BalanceRow>>();
  private readonly followUpListeners = new Set<Listener<FollowUpRow>>();
  private readonly sourceEventListeners = new Set<Listener<SourceEventRow>>();
  private readonly expenseListeners = new Set<Listener<ExpenseEntryRow>>();

  watchAccounts(onValue: Listener<AccountRow>): () => void {
    this.accountListeners.add(onValue);
    onValue([...this.accounts]);
    return () => { this.accountListeners.delete(onValue); };
  }

  watchBalances(onValue: Listener<BalanceRow>): () => void {
    this.balanceListeners.add(onValue);
    onValue([...this.balances]);
    return () => { this.balanceListeners.delete(onValue); };
  }

  watchFollowUps(onValue: Listener<FollowUpRow>): () => void {
    this.followUpListeners.add(onValue);
    onValue([...this.followUps]);
    return () => { this.followUpListeners.delete(onValue); };
  }

  watchSourceEvents(limit: number, onValue: Listener<SourceEventRow>): () => void {
    const listener = (rows: SourceEventRow[]) => { onValue(rows.slice(0, limit)); };
    this.sourceEventListeners.add(listener);
    listener([...this.sourceEvents]);
    return () => { this.sourceEventListeners.delete(listener); };
  }

  watchExpenseEntries(fromMs: number, toMs: number, onValue: Listener<ExpenseEntryRow>): () => void {
    const listener = (rows: ExpenseEntryRow[]) => { onValue(rows.filter((row) => row.occurredAtMs >= fromMs && row.occurredAtMs <= toMs)); };
    this.expenseListeners.add(listener);
    listener([...this.expenseEntries]);
    return () => { this.expenseListeners.delete(listener); };
  }

  setAccounts(rows: AccountRow[]): void {
    this.accounts = [...rows];
    this.accountListeners.forEach((listener) => { listener([...this.accounts]); });
  }

  setBalances(rows: BalanceRow[]): void {
    this.balances = [...rows];
    this.balanceListeners.forEach((listener) => { listener([...this.balances]); });
  }

  setFollowUps(rows: FollowUpRow[]): void {
    this.followUps = [...rows];
    this.followUpListeners.forEach((listener) => { listener([...this.followUps]); });
  }

  setSourceEvents(rows: SourceEventRow[]): void {
    this.sourceEvents = [...rows];
    this.sourceEventListeners.forEach((listener) => { listener([...this.sourceEvents]); });
  }

  setExpenseEntries(rows: ExpenseEntryRow[]): void {
    this.expenseEntries = [...rows];
    this.expenseListeners.forEach((listener) => { listener([...this.expenseEntries]); });
  }
}

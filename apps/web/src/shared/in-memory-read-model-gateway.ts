import type {
  AccountRow,
  AiUsageRow,
  LedgerEntryRow,
  BalanceRow,
  ExpenseEntryRow,
  FollowUpRow,
  ReadModelGateway,
  SourceEventRow,
} from "./read-model-gateway";

type Listener<T> = (rows: T[]) => void;
type ErrorListener = (error: Error) => void;

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
  private readonly errorListeners = new Map<string, Set<ErrorListener>>();
  private readonly income = new RangeStore<LedgerEntryRow>((row) => row.occurredAtMs);
  private readonly aiUsage = new RangeStore<AiUsageRow>((row) => row.createdAtMs);
  private readonly sourceEntries = new RangeStore<LedgerEntryRow>((row) => row.occurredAtMs);

  private watchError(kind: string, onError?: ErrorListener): void {
    if (onError === undefined) return;
    const listeners = this.errorListeners.get(kind) ?? new Set<ErrorListener>();
    listeners.add(onError);
    this.errorListeners.set(kind, listeners);
  }

  watchAccounts(onValue: Listener<AccountRow>, onError?: ErrorListener): () => void {
    this.watchError("accounts", onError);
    this.accountListeners.add(onValue);
    onValue([...this.accounts]);
    return () => {
      this.accountListeners.delete(onValue);
    };
  }

  watchBalances(onValue: Listener<BalanceRow>, onError?: ErrorListener): () => void {
    this.watchError("balances", onError);
    this.balanceListeners.add(onValue);
    onValue([...this.balances]);
    return () => {
      this.balanceListeners.delete(onValue);
    };
  }

  watchFollowUps(onValue: Listener<FollowUpRow>, onError?: ErrorListener): () => void {
    this.watchError("followUps", onError);
    this.followUpListeners.add(onValue);
    onValue([...this.followUps]);
    return () => {
      this.followUpListeners.delete(onValue);
    };
  }

  watchSourceEvents(
    limit: number,
    onValue: Listener<SourceEventRow>,
    onError?: ErrorListener,
  ): () => void {
    this.watchError("sourceEvents", onError);
    const listener = (rows: SourceEventRow[]) => {
      onValue(rows.slice(0, limit));
    };
    this.sourceEventListeners.add(listener);
    listener([...this.sourceEvents]);
    return () => {
      this.sourceEventListeners.delete(listener);
    };
  }

  watchExpenseEntries(
    fromMs: number,
    toMs: number,
    onValue: Listener<ExpenseEntryRow>,
    onError?: ErrorListener,
  ): () => void {
    this.watchError("expenses", onError);
    const listener = (rows: ExpenseEntryRow[]) => {
      onValue(rows.filter((row) => row.occurredAtMs >= fromMs && row.occurredAtMs <= toMs));
    };
    this.expenseListeners.add(listener);
    listener([...this.expenseEntries]);
    return () => {
      this.expenseListeners.delete(listener);
    };
  }

  watchIncomeEntries(fromMs: number, toMs: number, onValue: Listener<LedgerEntryRow>, onError?: ErrorListener): () => void {
    this.watchError("income", onError);
    return this.income.watch(fromMs, toMs, onValue);
  }

  watchAiUsage(fromMs: number, toMs: number, onValue: Listener<AiUsageRow>, onError?: ErrorListener): () => void {
    this.watchError("aiUsage", onError);
    return this.aiUsage.watch(fromMs, toMs, onValue);
  }

  setIncomeEntries(rows: LedgerEntryRow[]): void {
    this.income.set(rows);
  }

  watchSourceEntries(fromMs: number, toMs: number, onValue: Listener<LedgerEntryRow>, onError?: ErrorListener): () => void {
    this.watchError("sourceEntries", onError);
    return this.sourceEntries.watch(fromMs, toMs, onValue);
  }

  setSourceEntries(rows: LedgerEntryRow[]): void {
    this.sourceEntries.set(rows);
  }

  setAiUsage(rows: AiUsageRow[]): void {
    this.aiUsage.set(rows);
  }

  setAccounts(rows: AccountRow[]): void {
    this.accounts = [...rows];
    this.accountListeners.forEach((listener) => {
      listener([...this.accounts]);
    });
  }

  setBalances(rows: BalanceRow[]): void {
    this.balances = [...rows];
    this.balanceListeners.forEach((listener) => {
      listener([...this.balances]);
    });
  }

  setFollowUps(rows: FollowUpRow[]): void {
    this.followUps = [...rows];
    this.followUpListeners.forEach((listener) => {
      listener([...this.followUps]);
    });
  }

  setSourceEvents(rows: SourceEventRow[]): void {
    this.sourceEvents = [...rows];
    this.sourceEventListeners.forEach((listener) => {
      listener([...this.sourceEvents]);
    });
  }

  setExpenseEntries(rows: ExpenseEntryRow[]): void {
    this.expenseEntries = [...rows];
    this.expenseListeners.forEach((listener) => {
      listener([...this.expenseEntries]);
    });
  }

  fail(kind: "accounts" | "balances" | "followUps" | "sourceEvents" | "expenses" | "income" | "aiUsage" | "sourceEntries"): void {
    this.errorListeners.get(kind)?.forEach((listener) => { listener(new Error("read failed")); });
  }
}

/** Rows filtered by a time range, pushed to every live watcher on each change. */
class RangeStore<T> {
  private rows: T[] = [];
  private readonly listeners = new Set<(rows: T[]) => void>();
  constructor(private readonly timeOf: (row: T) => number) {}

  watch(fromMs: number, toMs: number, onValue: Listener<T>): () => void {
    const listener = (rows: T[]) => { onValue(rows.filter((row) => this.timeOf(row) >= fromMs && this.timeOf(row) <= toMs)); };
    this.listeners.add(listener);
    listener([...this.rows]);
    return () => { this.listeners.delete(listener); };
  }

  set(rows: T[]): void {
    this.rows = [...rows];
    this.listeners.forEach((listener) => { listener([...this.rows]); });
  }
}

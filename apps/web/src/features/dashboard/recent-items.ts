import { CHAT_COPY } from "../../shared/copy";
import { dhakaDayLabel } from "../../shared/dhaka-date";
import type { AccountRow, SourceEventRow } from "../../shared/read-model-gateway";

export type RecentStatus = "recorded" | "waiting" | "inProgress" | "failed" | "notCounted";

export type RecentItem = {
  id: string;
  title: string;
  detail: string;
  amountMinor: number | null;
  atMs: number;
  status: RecentStatus;
  statusLabel: string;
};

const LABELS: Record<RecentStatus, string> = {
  recorded: "Recorded",
  waiting: "Waiting for your answer",
  inProgress: "In progress",
  failed: "Couldn't read",
  notCounted: "Not counted",
};

/** Read from the server's status only; "Recorded" means the ledger confirmed it. */
function statusOf(event: SourceEventRow): RecentStatus {
  switch (event.status) {
    case "posted":
      return "recorded";
    case "pending":
      return event.pendingReason === "awaitingClarification" ? "waiting" : "inProgress";
    case "deadLetter":
      return "failed";
    case "rejected":
    case "cancelled":
    case "linkedAsDuplicate":
      return "notCounted";
    default:
      return "inProgress";
  }
}

const preview = (text: string): string => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

export function toRecentItems(events: SourceEventRow[], accounts: AccountRow[], limit: number): RecentItem[] {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return events
    .map((event): RecentItem => {
      const candidate = event.candidate;
      const kind = candidate?.kind;
      const withdrawal = kind === "withdrawal";
      const kindTitle = kind === undefined ? null : CHAT_COPY.kindTitle[kind];
      const isMove = withdrawal || kind === "transfer" || kind === "cardRepayment";
      const title = withdrawal ? "Bank → Cash" : ((isMove ? kindTitle : candidate?.counterparty) ?? kindTitle ?? preview(event.retainedText));
      const account = event.resolvedAccountId === null ? undefined : names.get(event.resolvedAccountId);
      const source = withdrawal ? "ATM withdrawal" : (account ?? (event.sourceType === "sms" ? "SMS" : "Chat"));
      const atMs = candidate?.occurredAtMs ?? event.receivedAtMs;
      const status = statusOf(event);
      return {
        id: event.id,
        title,
        detail: `${source} · ${dhakaDayLabel(atMs)}`,
        amountMinor: candidate?.amountMinor ?? null,
        atMs,
        status,
        statusLabel: LABELS[status],
      };
    })
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, limit);
}

import { CHAT_COPY, COPY } from "../../shared/copy";
import type { AccountRow, SourceEventRow } from "../../shared/read-model-gateway";

export type ActivityFilter = "all" | "posted" | "pending" | "needsAnswer" | "duplicates";
export type ActivityTone = "verified" | "pending" | "needsAnswer" | "failed" | "neutral";

export type ActivityItem = {
  id: string;
  title: string;
  kind: NonNullable<SourceEventRow["candidate"]>["kind"] | null;
  kindTitle: string | null;
  amountMinor: number | null;
  direction: "in" | "out" | "move";
  accountName: string | null;
  destinationName: string | null;
  occurredAtMs: number;
  sourceType: SourceEventRow["sourceType"];
  tone: ActivityTone;
  badge: string;
  statusText: string;
  duplicate: boolean;
  /** The ledger transaction a posted event created; null when nothing was posted. */
  transactionId: string | null;
  matchedTransactionId: string | null;
  retainedText: string;
  provenance: string | null;
};

type Status = Pick<ActivityItem, "tone" | "badge" | "statusText">;

const IN_KINDS = new Set(["income", "refund", "unclassifiedCredit"]);
const MOVE_KINDS = new Set(["withdrawal", "transfer", "cardRepayment"]);

function statusOf(event: SourceEventRow): Status {
  switch (event.status) {
    case "posted":
      return { tone: "verified", badge: "Verified", statusText: COPY.recorded };
    case "linkedAsDuplicate":
      return { tone: "neutral", badge: "Not counted twice", statusText: COPY.linkedAsDuplicate };
    case "rejected":
      return { tone: "neutral", badge: "Rejected", statusText: COPY.rejected };
    case "cancelled":
      return { tone: "neutral", badge: "Cancelled", statusText: COPY.cancelled };
    case "deadLetter":
      return {
        tone: "failed",
        badge: "Failed",
        statusText: event.deadLetterReason === "beforeOpeningBalance" ? COPY.beforeOpeningBalance : COPY.stageFailed,
      };
    case "pending":
      if (event.pendingReason === "awaitingClarification") {
        return { tone: "needsAnswer", badge: "Needs answer", statusText: COPY.awaitingClarification };
      }
      return {
        tone: "pending",
        badge: "Pending",
        statusText: event.pendingReason === "aiQuotaExhausted" ? COPY.aiQuotaExhausted : COPY.providerOutcomeUnknown,
      };
    default:
      return { tone: "pending", badge: "Pending", statusText: CHAT_COPY.received };
  }
}

/** Mirrors the post stage: a finalized authorization reuses its transaction, otherwise `txn-<event id>`. */
function postedTransactionId(event: SourceEventRow): string | null {
  if (event.status !== "posted") return null;
  return event.matchKind === "finalizesAuthorization" && event.matchedTransactionId !== null
    ? event.matchedTransactionId
    : `txn-${event.id}`;
}

function provenanceOf(event: SourceEventRow): string | null {
  const extraction = event.extraction;
  if (extraction === null) return null;
  if (extraction.source === "deterministicParser" && extraction.parser !== undefined) {
    return `Read by the ${extraction.parser.name} parser (v${extraction.parser.version})`;
  }
  if (extraction.source === "ai" && extraction.ai !== undefined) {
    return `Read by AI (${extraction.ai.model}, prompt ${extraction.ai.promptVersion})`;
  }
  return null;
}

const preview = (text: string): string => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

export function toActivityItems(events: SourceEventRow[], accounts: AccountRow[]): ActivityItem[] {
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  const nameOf = (id: string | null) => (id === null ? null : (names.get(id) ?? null));
  return events
    .map((event): ActivityItem => {
      const candidate = event.candidate;
      const kind = candidate?.kind;
      const kindTitle = kind === undefined ? null : CHAT_COPY.kindTitle[kind];
      const isMove = kind !== undefined && MOVE_KINDS.has(kind);
      return {
        id: event.id,
        title: (isMove ? kindTitle : candidate?.counterparty) ?? kindTitle ?? preview(event.retainedText),
        kind: kind ?? null,
        kindTitle,
        amountMinor: candidate?.amountMinor ?? null,
        direction: kind === undefined ? "out" : IN_KINDS.has(kind) ? "in" : isMove ? "move" : "out",
        accountName: nameOf(event.resolvedAccountId),
        destinationName: nameOf(event.resolvedDestinationAccountId),
        occurredAtMs: candidate?.occurredAtMs ?? event.receivedAtMs,
        sourceType: event.sourceType,
        ...statusOf(event),
        duplicate: event.status === "linkedAsDuplicate",
        transactionId: postedTransactionId(event),
        matchedTransactionId: event.matchedTransactionId,
        retainedText: event.retainedText,
        provenance: provenanceOf(event),
      };
    })
    .sort((a, b) => b.occurredAtMs - a.occurredAtMs);
}

export function filterActivity(items: ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  switch (filter) {
    case "all":
      return items;
    case "posted":
      return items.filter((item) => item.tone === "verified");
    case "pending":
      return items.filter((item) => item.tone === "pending");
    case "needsAnswer":
      return items.filter((item) => item.tone === "needsAnswer");
    case "duplicates":
      return items.filter((item) => item.duplicate);
  }
}

/** The posted item a duplicate was linked to, when it is in the list. */
export function findOriginal(items: ActivityItem[], item: ActivityItem): ActivityItem | null {
  if (!item.duplicate || item.matchedTransactionId === null) return null;
  return items.find((other) => other.transactionId === item.matchedTransactionId) ?? null;
}

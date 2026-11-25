import { INCOME_LABELS, type IncomeSource } from "@moneytrace/contracts";
import { DomainError, asSourceEventId, type OwnerId, type SourceEventStatus } from "@moneytrace/domain";
import { CASH_ACCOUNT_ID } from "../pipeline/sources";
import type { Clock } from "../ports/clock";
import type { Hasher } from "../ports/hasher";
import type { IdGenerator } from "../ports/id-generator";
import type { SourceEventRepository } from "../ports/source-event-repository";

type Deps = { sourceEvents: SourceEventRepository; hasher: Hasher; ids: IdGenerator; clock: Clock };

/** Dhaka is UTC+6 all year. */
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const dhakaDay = (ms: number): string => new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

/** The text kept for a manual income, as Recent shows it. */
export const cashIncomeText = (from: IncomeSource, note?: string): string =>
  ["Cash income", INCOME_LABELS[from], ...(note === undefined || note.trim() === "" ? [] : [note.trim()])].join(" · ");

/**
 * Cash income the user types in (house rent paid in cash, say): recorded as their own confirmed
 * entry into cash in hand. No parsing, no AI; the pipeline posts it as income.
 */
export class RecordCashIncome {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    idempotencyKey: string;
    amountMinor: number;
    from: IncomeSource;
    note?: string | undefined;
    occurredOn: string;
  }): Promise<{ sourceEventId: string; status: SourceEventStatus }> {
    const { sourceEvents, hasher, ids, clock } = this.deps;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn) || Number.isNaN(Date.parse(`${input.occurredOn}T12:00:00+06:00`))) {
      throw new DomainError("invalidIntent", "that isn't a date");
    }
    if (input.occurredOn > dhakaDay(clock.nowMs())) throw new DomainError("invalidIntent", "that date is in the future");
    const created = await sourceEvents.create(input.ownerId, {
      sourceEventId: asSourceEventId(ids.newId()),
      sourceType: "chat",
      // Keyed by the request, not the words: two equal incomes on one day are both real.
      sourceHash: hasher.sha256(`manual-income\n${input.idempotencyKey}`),
      idempotencyKey: input.idempotencyKey,
      receivedAtMs: clock.nowMs(),
      retainedText: cashIncomeText(input.from, input.note),
      preset: {
        candidate: {
          kind: "income",
          amountMinor: input.amountMinor,
          currency: "BDT",
          occurredAtMs: Date.parse(`${input.occurredOn}T12:00:00+06:00`),
          dateOnly: true,
          provider: "cash",
          counterparty: INCOME_LABELS[input.from],
          category: input.from,
        },
        resolvedAccountId: CASH_ACCOUNT_ID,
      },
    });
    if (created.status === "idempotencyConflict") {
      throw new DomainError("idempotencyConflict", "that key was used for a different entry");
    }
    const event = await sourceEvents.get(input.ownerId, created.sourceEventId);
    return { sourceEventId: created.sourceEventId, status: event?.status ?? "received" };
  }
}

import {
  DomainError,
  asAccountId,
  type CandidateKind,
  type CandidateTransaction,
  type OwnerId,
  type SourceEventId,
} from "@moneytrace/domain";
import type { AccountRepository } from "../ports/account-repository";
import type { Clock } from "../ports/clock";
import type { SourceEventRecord, SourceEventRepository } from "../ports/source-event-repository";

export type CandidateOverrides = {
  kind?: CandidateKind;
  amountMinor?: number;
  currency?: string;
  accountId?: string;
  destinationAccountId?: string;
  occurredAtMs?: number;
  category?: string;
};

type Deps = { sourceEvents: SourceEventRepository; accounts: AccountRepository; clock: Clock };

export class ConfirmCandidate {
  private readonly deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
    decision: "confirm" | "reject" | "link";
    overrides?: CandidateOverrides;
  }): Promise<{ status: "pending" | "rejected" | "linked" }> {
    const { ownerId, sourceEventId, decision } = input;
    const { sourceEvents, clock } = this.deps;
    const event = await sourceEvents.get(ownerId, sourceEventId);
    if (event === null) throw new DomainError("resourceNotFound", "no such event");
    if (event.status !== "pending" || event.pendingReason !== "awaitingClarification") {
      throw new DomainError("invalidTransition", "this event is not waiting for an answer");
    }
    if (decision !== "confirm") {
      const status = decision === "reject" ? "rejected" : "linkedAsDuplicate";
      const done = await sourceEvents.finishParked(ownerId, sourceEventId, status, clock.nowMs());
      if (done !== "finished") throw new DomainError("invalidTransition", "the event has moved on");
      return { status: decision === "reject" ? "rejected" : "linked" };
    }
    await this.confirm(ownerId, event, input.overrides ?? {});
    return { status: "pending" };
  }

  private async confirm(
    ownerId: OwnerId,
    event: SourceEventRecord,
    overrides: CandidateOverrides,
  ): Promise<void> {
    const { sourceEvents, clock } = this.deps;
    if (event.candidate === null) {
      throw new DomainError("invalidTransition", "nothing was read from this evidence");
    }
    await this.assertOwned(ownerId, [overrides.accountId, overrides.destinationAccountId]);
    const { accountId, destinationAccountId, ...fields } = overrides;
    const candidate: CandidateTransaction = { ...event.candidate, ...fields };
    const applied = await sourceEvents.applyUserDecision(ownerId, event.id, {
      candidate,
      userConfirmed: true,
      ...(accountId === undefined ? {} : { resolvedAccountId: accountId }),
      ...(destinationAccountId === undefined
        ? {}
        : { resolvedDestinationAccountId: destinationAccountId }),
    });
    const fresh = await sourceEvents.get(ownerId, event.id);
    const reopened =
      applied === "applied" && fresh !== null
        ? await sourceEvents.reopen(ownerId, event.id, fresh.version, clock.nowMs())
        : "stale";
    if (reopened !== "reopened") {
      throw new DomainError("invalidTransition", "the event has moved on");
    }
  }

  private async assertOwned(ownerId: OwnerId, ids: readonly (string | undefined)[]): Promise<void> {
    const wanted = ids.filter((id): id is string => id !== undefined).map(asAccountId);
    const found = await this.deps.accounts.getMany(ownerId, wanted);
    if (found.filter((a) => a.status === "active").length !== new Set(wanted).size) {
      throw new DomainError("accountInvalid", "account is missing or closed");
    }
  }
}

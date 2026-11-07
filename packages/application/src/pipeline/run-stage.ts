import {
  DomainError,
  type OwnerId,
  type PipelineStage,
  type SourceEventId,
} from "@moneytrace/domain";
import type { Clock } from "../ports/clock";
import type { Logger } from "../ports/logger";
import type {
  SourceEventRepository,
  StageClaim,
  StageCommit,
} from "../ports/source-event-repository";

export type RunStageDeps = {
  sourceEvents: SourceEventRepository;
  clock: Clock;
  logger: Logger;
};

export type RunStageInput = {
  ownerId: OwnerId;
  sourceEventId: SourceEventId;
  stage: PipelineStage;
  workerId: string;
  work: (claim: StageClaim) => Promise<StageCommit | "retryLater">;
};

export type RunStageResult = {
  status: "completed" | "skipped" | "staleClaim" | "leftForRecovery";
};

/**
 * Claim, do the work, commit. Losing the claim race is a silent skip. If the work throws or asks
 * to retry later, nothing is committed and the claim stays held. A held claim blocks every other
 * worker, even after its lease expires; only the recovery job's `reopen` (which counts the
 * attempt) or `park` releases it, so a redelivered trigger cannot loop a crashing stage. A failing
 * `commitStage` propagates with the claim kept, for the same reason.
 */
export async function runStage(deps: RunStageDeps, input: RunStageInput): Promise<RunStageResult> {
  const { ownerId, sourceEventId, stage, workerId, work } = input;
  const claimed = await deps.sourceEvents.claim(
    ownerId,
    sourceEventId,
    stage,
    workerId,
    deps.clock.nowMs(),
  );
  if (claimed.status === "notClaimable") return { status: "skipped" };

  let outcome: StageCommit | "retryLater";
  try {
    outcome = await work(claimed.claim);
  } catch (error) {
    // Name and code only: messages can carry document text.
    deps.logger.warn("pipeline.stageWorkFailed", {
      stage,
      sourceEventId,
      errorName: error instanceof Error ? error.name : "unknown",
      ...(error instanceof DomainError ? { errorCode: error.code } : {}),
    });
    return { status: "leftForRecovery" };
  }
  if (outcome === "retryLater") return { status: "leftForRecovery" };

  const committed = await deps.sourceEvents.commitStage(ownerId, claimed.claim, outcome);
  return { status: committed === "committed" ? "completed" : "staleClaim" };
}

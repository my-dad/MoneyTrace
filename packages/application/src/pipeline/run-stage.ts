import type { OwnerId, PipelineStage, SourceEventId } from "@moneytrace/domain";
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
  logger?: Logger;
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
 * to retry later, nothing is committed and the claim stays until its lease expires, so recovery
 * (not a tight retry loop) decides what happens next.
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
    deps.logger?.warn("pipeline.stageWorkFailed", {
      stage,
      sourceEventId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { status: "leftForRecovery" };
  }
  if (outcome === "retryLater") return { status: "leftForRecovery" };

  const committed = await deps.sourceEvents.commitStage(ownerId, claimed.claim, outcome);
  return { status: committed === "committed" ? "completed" : "staleClaim" };
}

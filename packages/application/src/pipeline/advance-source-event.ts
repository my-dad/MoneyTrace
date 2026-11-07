import {
  STAGE_INPUT_STATUS,
  type OwnerId,
  type PipelineStage,
  type SourceEventId,
} from "@moneytrace/domain";
import { runStage, type RunStageResult } from "./run-stage";
import { decideStage } from "./stages/decide";
import type { PipelineDeps, Stage } from "./stages/deps";
import { interpretStage } from "./stages/interpret";
import { matchStage } from "./stages/match";
import { normalizeStage } from "./stages/normalize";
import { postStage } from "./stages/post";

export type { PipelineDeps } from "./stages/deps";

const STAGES: Record<PipelineStage, Stage> = {
  normalize: normalizeStage,
  interpret: interpretStage,
  match: matchStage,
  decide: decideStage,
  post: postStage,
};

/** Runs the one stage an event's status calls for. The commit's write triggers the next. */
export class AdvanceSourceEvent {
  private readonly deps: PipelineDeps;

  constructor(deps: PipelineDeps) {
    this.deps = deps;
  }

  async execute(input: {
    ownerId: OwnerId;
    sourceEventId: SourceEventId;
    workerId: string;
  }): Promise<RunStageResult | { status: "nothingToDo" }> {
    const { deps } = this;
    const { ownerId, sourceEventId, workerId } = input;
    const event = await deps.sourceEvents.get(ownerId, sourceEventId);
    const stage = (Object.keys(STAGES) as PipelineStage[]).find(
      (s) => STAGE_INPUT_STATUS[s] === event?.status,
    );
    if (stage === undefined) return { status: "nothingToDo" };
    return runStage(deps, {
      ownerId,
      sourceEventId,
      stage,
      workerId,
      work: async (claim) => {
        const claimed = await deps.sourceEvents.get(ownerId, sourceEventId);
        if (claimed === null) return "retryLater";
        return STAGES[stage](deps, ownerId, claimed, claim);
      },
    });
  }
}

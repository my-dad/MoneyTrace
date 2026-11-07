import type { Stage } from "./deps";

export const normalizeStage: Stage = (_deps, _ownerId, event) =>
  Promise.resolve({
    nextStatus: "normalized",
    outputs: [],
    eventPatch: { retainedText: event.retainedText.replace(/[ \t]+/g, " ").trim() },
  });

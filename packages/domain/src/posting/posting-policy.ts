import { DomainError } from "../errors";
import { assertBalanced, type EntryDraft } from "../ledger/entry";
import type { PostingIntent } from "./intents";
import { defaultStrategies } from "./strategies";

/** Any strategy; the type is a plain string so a new intent type can be registered without editing PostingIntent here. */
export type RegisteredStrategy = {
  type: string;
  toEntries(intent: never, ctx: { delegate(i: PostingIntent): EntryDraft[] }): EntryDraft[];
};

export type PostingPolicy = {
  readonly strategies: readonly RegisteredStrategy[];
  toEntries(intent: PostingIntent): EntryDraft[];
};

export function createPostingPolicy(strategies: readonly RegisteredStrategy[]): PostingPolicy {
  const byType = new Map<string, RegisteredStrategy>();
  for (const s of strategies) {
    if (byType.has(s.type)) {
      throw new DomainError("invalidConfig", `duplicate posting strategy for ${s.type}`);
    }
    byType.set(s.type, s);
  }

  const run = (intent: PostingIntent): EntryDraft[] => {
    const strategy = byType.get(intent.type);
    if (strategy === undefined) {
      throw new DomainError("invalidIntent", "unknown posting intent type");
    }
    return strategy.toEntries(intent as never, { delegate: run });
  };

  return {
    strategies,
    toEntries(intent) {
      const entries = run(intent);
      if (entries.length > 0) assertBalanced(entries);
      return entries;
    },
  };
}

export const defaultPostingPolicy: PostingPolicy = createPostingPolicy(defaultStrategies);

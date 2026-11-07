import { TRIGGERS } from "@moneytrace/contracts";
import { describe, expect, it } from "vitest";
import * as functions from "../index";

type Endpoint = {
  __endpoint: {
    region?: string[];
    scheduleTrigger?: { schedule: string };
    eventTrigger?: { eventFilterPathPatterns?: { document?: string } };
  };
};
const of = (name: string) => (functions as unknown as Record<string, Endpoint>)[name]?.__endpoint;

describe("deployed triggers", () => {
  it.each([
    ["recoverExpiredClaims"],
    ["dispatchFollowUps"],
    ["resumeQuotaBlockedEvents"],
    ["purgeProviderResults"],
  ] as const)("%s runs on the contract's schedule in the right region", (name) => {
    expect(of(name)?.scheduleTrigger?.schedule).toBe(TRIGGERS[name].source);
    expect(of(name)?.region).toEqual(["asia-south2"]);
  });

  it("the pipeline trigger watches source events", () => {
    expect(of("onSourceEventWritten")?.eventTrigger?.eventFilterPathPatterns?.document).toBe(
      TRIGGERS.onSourceEventWritten.source,
    );
  });
});

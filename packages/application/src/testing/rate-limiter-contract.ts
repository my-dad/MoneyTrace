import { beforeEach, describe, expect, it } from "vitest";
import type { RateBucket, RateLimiter } from "../ports/rate-limiter";

const T0 = 1_700_000_040_000;
const MIN = 60_000;

/** Shared behavior every RateLimiter must satisfy. */
export function describeRateLimiterContract(name: string, make: () => Promise<RateLimiter>): void {
  describe(`${name} rate limiter contract`, () => {
    let limiter: RateLimiter;
    let n = 0;
    const bucket = (limit: number, suffix = ""): RateBucket => ({ key: `user-${String(n)}${suffix}`, limit, windowMs: MIN });

    beforeEach(async () => {
      n += 1;
      limiter = await make();
    });

    it("allows up to the limit in one window, then limits", async () => {
      const b = bucket(2);
      expect(await limiter.take([b], T0)).toBe("allowed");
      expect(await limiter.take([b], T0 + 1)).toBe("allowed");
      expect(await limiter.take([b], T0 + 2)).toBe("limited");
    });

    it("a new window starts a new count", async () => {
      const b = bucket(1);
      expect(await limiter.take([b], T0)).toBe("allowed");
      expect(await limiter.take([b], T0 + MIN)).toBe("allowed");
    });

    it("a full bucket limits the call without counting it in the others", async () => {
      const full = bucket(1, "-full");
      const roomy = bucket(1, "-roomy");
      expect(await limiter.take([full], T0)).toBe("allowed");
      expect(await limiter.take([roomy, full], T0)).toBe("limited");
      expect(await limiter.take([roomy], T0)).toBe("allowed");
    });

    it("keys are independent", async () => {
      expect(await limiter.take([bucket(1, "-a")], T0)).toBe("allowed");
      expect(await limiter.take([bucket(1, "-b")], T0)).toBe("allowed");
    });
  });
}

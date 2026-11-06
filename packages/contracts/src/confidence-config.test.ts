import { describe, expect, it } from "vitest";
import { confidenceConfigSchema, DEFAULT_CONFIDENCE_CONFIG } from "./confidence-config";

describe("confidence config", () => {
  it("the default confidence threshold cannot be reached", () => {
    expect(DEFAULT_CONFIDENCE_CONFIG.aiAutoPostThresholdBp).toBeGreaterThan(10000);
    expect(confidenceConfigSchema.safeParse(DEFAULT_CONFIDENCE_CONFIG).success).toBe(true);
  });
  it.each([-1, 10002, 5000.5])("rejects threshold %s", (v) => {
    expect(confidenceConfigSchema.safeParse({ version: 1, aiAutoPostThresholdBp: v }).success).toBe(
      false,
    );
  });
});

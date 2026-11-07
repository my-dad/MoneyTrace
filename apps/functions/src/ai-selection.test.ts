import { describe, expect, it } from "vitest";
import { selectAiProvider } from "./ai-selection";

describe("selectAiProvider", () => {
  it("uses the fake provider only in the emulator, when asked", () => {
    expect(selectAiProvider({ FUNCTIONS_EMULATOR: "true", MONEYTRACE_AI: "fake" }).id).toBe("fake");
  });
  it.each([{ MONEYTRACE_AI: "fake" }, { FUNCTIONS_EMULATOR: "false", MONEYTRACE_AI: "fake" }])(
    "refuses the fake provider outside the emulator: %o",
    (env) => {
      expect(() => selectAiProvider(env)).toThrow(/fake/);
    },
  );
  it("uses DeepSeek otherwise", () => {
    expect(selectAiProvider({ DEEPSEEK_API_KEY: "k" }).id).toBe("deepseek");
  });
  it("refuses to start with no key rather than failing per request", () => {
    expect(() => selectAiProvider({})).toThrow(/DEEPSEEK_API_KEY/);
  });
});

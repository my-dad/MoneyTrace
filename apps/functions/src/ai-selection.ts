import type { AIProvider } from "@moneytrace/application";
import { DeepSeekProvider, FakeAIProvider } from "@moneytrace/infrastructure";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

/**
 * The fake provider exists for local emulators and refuses to start anywhere else, so a deployed
 * function can never answer financial evidence from it.
 */
export function selectAiProvider(env: Record<string, string | undefined>): AIProvider {
  if (env["MONEYTRACE_AI"] === "fake") {
    if (env["FUNCTIONS_EMULATOR"] !== "true") {
      throw new Error("the fake AI provider is only allowed in the emulator");
    }
    return new FakeAIProvider();
  }
  const apiKey = env["DEEPSEEK_API_KEY"];
  if (apiKey === undefined || apiKey === "") {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
  return new DeepSeekProvider({ apiKey, baseUrl: DEEPSEEK_BASE_URL, fetchImpl: fetch });
}

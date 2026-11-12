import type {
  AIProvider,
  AbortSignalLike,
  AiContext,
  AiInterpretation,
  ProviderOutcome,
} from "@moneytrace/application";
import { aiInterpretationSchema } from "@moneytrace/contracts";
import { providerSlug, type CandidateTransaction } from "@moneytrace/domain";
import { z } from "zod";
import { INTERPRET_PROMPT_VERSION, buildInterpretMessages } from "./prompts/interpret-v2";

export type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
  /** Verified prices only. Without them, quota stays charged at the conservative estimate. */
  pricing?: { inputPerMTokMicroUsd: number; outputPerMTokMicroUsd: number };
};

const MODEL = "deepseek-flash";
const MAX_OUTPUT_TOKENS = 800;
/** These responses mean the request was refused rather than processed. */
const REFUSED = new Set([400, 401, 402, 422, 429]);

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

const UNUSABLE = { kind: "unusable" } as const;

type AiCandidate = Extract<z.infer<typeof aiInterpretationSchema>, { kind: "transaction" }>["candidate"];

/** The model's reading as a candidate: its source name becomes the parsers' provider id (CR-008). */
function toCandidate(raw: AiCandidate): CandidateTransaction {
  const { occurredAtIso, sourceName, sourceMask, ...rest } = raw;
  const provider = sourceName === undefined ? null : providerSlug(sourceName);
  const mask = rest.instrumentMask ?? sourceMask;
  return {
    ...rest,
    occurredAtMs: occurredAtIso === null ? null : Date.parse(occurredAtIso),
    ...(provider === null ? {} : { provider }),
    ...(mask === undefined ? {} : { instrumentMask: mask }),
  } as CandidateTransaction;
}

function toInterpretation(content: string): AiInterpretation {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return UNUSABLE;
  }
  const parsed = aiInterpretationSchema.safeParse(raw);
  if (!parsed.success) return UNUSABLE;
  const output = parsed.data;
  if (output.kind === "notFinancial") return output;
  if (output.kind === "question") {
    return {
      kind: "question",
      text: output.text,
      options: output.options ?? [],
      candidate: output.candidate === undefined ? null : toCandidate(output.candidate),
    };
  }
  return { kind: "transaction", confidenceBp: output.confidenceBp, candidate: toCandidate(output.candidate) };
}

function networkOutcome(error: unknown): ProviderOutcome<AiInterpretation> {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { kind: "unknown", code: "timeout" };
  }
  const cause =
    error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  if (cause?.code === "ECONNREFUSED") return { kind: "definiteFailure", code: "connectionRefused" };
  return { kind: "unknown", code: "network" };
}

/**
 * DeepSeek's API documents no idempotency key, so `retrySafety` is `none`. JSON mode guarantees only
 * valid JSON, so output is schema-checked. A 200 means the call happened and may be charged, so bad
 * content is `success` with `unusable` and is never repeated automatically.
 */
export class DeepSeekProvider implements AIProvider {
  readonly id = "deepseek";
  readonly model = MODEL;
  readonly promptVersion = INTERPRET_PROMPT_VERSION;
  readonly retrySafety = "none" as const;
  private readonly config: DeepSeekConfig;

  constructor(config: DeepSeekConfig) {
    this.config = config;
  }

  async interpretEvidence(
    input: { text: string; context: AiContext },
    _requestKey: string,
    signal: AbortSignalLike,
  ): Promise<ProviderOutcome<AiInterpretation>> {
    let response: Response;
    try {
      response = await this.config.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: buildInterpretMessages(input.text, input.context),
          response_format: { type: "json_object" },
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: false,
        }),
        signal: signal as AbortSignal,
      });
    } catch (error) {
      return networkOutcome(error);
    }
    if (!response.ok) {
      const code = `http${String(response.status)}`;
      return REFUSED.has(response.status)
        ? { kind: "definiteFailure", code }
        : { kind: "unknown", code };
    }
    return this.fromBody(response);
  }

  private async fromBody(response: Response): Promise<ProviderOutcome<AiInterpretation>> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: "success", value: UNUSABLE };
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) return { kind: "success", value: UNUSABLE };
    const [choice] = parsed.data.choices;
    const content = choice?.message.content ?? "";
    const value =
      choice?.finish_reason === "stop" && content.trim() !== ""
        ? toInterpretation(content)
        : UNUSABLE;
    const actualMicroUsd = this.costOf(parsed.data.usage);
    return actualMicroUsd === undefined
      ? { kind: "success", value }
      : { kind: "success", value, actualMicroUsd };
  }

  private costOf(usage: z.infer<typeof responseSchema>["usage"]): number | undefined {
    const { pricing } = this.config;
    if (pricing === undefined || usage === undefined) return undefined;
    const total =
      usage.prompt_tokens * pricing.inputPerMTokMicroUsd +
      usage.completion_tokens * pricing.outputPerMTokMicroUsd;
    return Math.ceil(total / 1_000_000);
  }
}

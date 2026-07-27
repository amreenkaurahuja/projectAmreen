/**
 * The single place generation parameters are defined. These three values
 * were deliberate engineering decisions (see docs/AI_PLATFORM.md → "Provider
 * Integration"): low temperature for consistency, a small token cap since
 * responses are capped at 80/160 words, a 10s timeout with zero retries.
 * They are intentionally not environment-configurable — unlike the
 * account/budget settings below, tuning them changes what "grounded,
 * consistent coaching" means, which is a product decision, not a
 * per-deployment one.
 */
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 350;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PROVIDER = "gemini";

export interface AiConfig {
  provider: string;
  /** Undefined until AI_COACH_MODEL is set — never hardcoded, see providers/gemini-provider.ts. */
  model: string | undefined;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

/** The one function that reads generation-parameter env vars — every provider config is built from this, not from ad-hoc `process.env` reads scattered across files. */
export function readAiConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): AiConfig {
  return {
    provider: env.AI_PROVIDER ?? DEFAULT_PROVIDER,
    model: env.AI_COACH_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

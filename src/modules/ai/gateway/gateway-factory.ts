import "server-only";
import { createGeminiProviderFromEnv } from "../providers/gemini-provider";
import { readAiConfigFromEnv } from "../shared/ai-config";
import {
  isAiEnabled,
  isCoachEnabledForAudience,
} from "../shared/feature-flags";
import type { AiGateway } from "./ai-gateway";

// Re-exported so existing call sites (the coach API route, tests) don't
// need to know this moved to shared/feature-flags.ts — this file is still
// "the" place that decides gateway availability, it just delegates the
// flag-reading itself to the shared module now.
export { isCoachEnabledForAudience };

/**
 * Platform-level availability: is AI infrastructure allowed to run at all,
 * regardless of which feature or audience wants to use it. Returns null
 * (never throws) whenever it shouldn't — disabled, an unsupported/missing
 * provider, or missing credentials. A null gateway is exactly what
 * AiCoachService treats as "go straight to the deterministic fallback," so
 * a misconfigured environment degrades gracefully instead of breaking the
 * coach endpoint.
 */
export function createAiGatewayFromEnv(
  env: Record<string, string | undefined> = process.env,
): AiGateway | null {
  if (!isAiEnabled(env)) {
    return null;
  }

  // Only Gemini is implemented today. An explicit, unsupported AI_PROVIDER
  // is treated the same as "disabled" rather than guessed at.
  if (readAiConfigFromEnv(env).provider !== "gemini") {
    return null;
  }

  try {
    return createGeminiProviderFromEnv(env);
  } catch {
    return null;
  }
}

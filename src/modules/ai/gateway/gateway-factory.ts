import "server-only";
import { createGeminiProviderFromEnv } from "../providers/gemini-provider";
import type { Audience } from "../coach/coach.types";
import type { AiGateway } from "./ai-gateway";

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
  if (env.AI_ENABLED !== "true") {
    return null;
  }

  // Only Gemini is implemented today. An explicit, unsupported AI_PROVIDER
  // is treated the same as "disabled" rather than guessed at.
  if ((env.AI_PROVIDER ?? "gemini") !== "gemini") {
    return null;
  }

  try {
    return createGeminiProviderFromEnv(env);
  } catch {
    return null;
  }
}

/**
 * Feature-level availability: is the AI Learning Coach specifically turned
 * on for this audience. Layered on top of (not instead of) AI_ENABLED, so
 * a future second AI feature (e.g. a teacher-report generator) can ship
 * its own AI_TEACHER_ENABLED flag and be rolled out independently, without
 * redeploying or touching this one. A caller should treat `false` here the
 * same as a null gateway — go straight to the fallback — even if
 * createAiGatewayFromEnv would otherwise have returned a working gateway.
 */
export function isCoachEnabledForAudience(
  audience: Audience,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.AI_COACH_ENABLED !== "true") {
    return false;
  }

  const audienceFlag =
    audience === "learner" ? env.AI_LEARNER_ENABLED : env.AI_PARENT_ENABLED;
  return audienceFlag === "true";
}

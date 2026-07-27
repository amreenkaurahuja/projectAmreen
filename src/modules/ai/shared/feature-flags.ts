import type { Audience } from "../coach/coach.types";

/**
 * The AI platform's feature flags, centralised here rather than read
 * ad-hoc from `process.env` at each call site. Two layers, both required:
 *
 * - `isAiEnabled` — the platform-wide master switch (AI_ENABLED). Governs
 *   whether AI infrastructure runs at all, for any current or future
 *   feature.
 * - `isCoachEnabledForAudience` — the coach feature's own switch
 *   (AI_COACH_ENABLED), plus a per-audience switch
 *   (AI_LEARNER_ENABLED/AI_PARENT_ENABLED). A future second AI feature
 *   (e.g. a teacher-report generator) would get its own
 *   `isXEnabled`-style check here, layered on top of `isAiEnabled` the
 *   same way, so features roll out independently without a redeploy.
 */
export function isAiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AI_ENABLED === "true";
}

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

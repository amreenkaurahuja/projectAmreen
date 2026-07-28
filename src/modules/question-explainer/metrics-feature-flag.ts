/**
 * TDS-008 §12 / Stage 6.3C — the switch between the safe no-op publisher
 * and the real HTTP delivery path (see default-learning-event-publisher.ts).
 *
 * Deliberately its own flag, not a client wrapper around
 * modules/ai/shared/feature-flags.ts's isAiEnabled /
 * isQuestionExplainerEnabledForAudience: this flag is evaluated inside
 * question-explainer-flow.tsx, a "use client" component, and Next.js only
 * inlines `NEXT_PUBLIC_`-prefixed variables into the client bundle —
 * every unprefixed var (AI_ENABLED, AI_QUESTION_EXPLAINER_ENABLED, etc.)
 * is `undefined` in the browser. Reusing those flags here wouldn't fail
 * loudly; it would silently and permanently evaluate to "disabled"
 * regardless of actual configuration, which is worse than a new flag.
 *
 * Matches the existing `env.X === "true"` convention exactly (see
 * isAiEnabled) — absent, empty, or any value other than the literal
 * string "true" resolves to disabled. Never throws.
 */
export function isQuestionExplainerMetricsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NEXT_PUBLIC_QUESTION_EXPLAINER_METRICS_ENABLED === "true";
}

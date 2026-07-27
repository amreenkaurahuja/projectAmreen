# AI Constitution

Every AI feature built on Project Amreen's AI Platform (`src/modules/ai/`) — the current AI Learning Coach, and any future AI Tutor, Study Planner, Question Explainer, Teacher Reports, or similar — must obey these twelve rules. They are not aspirational; each one is enforced in code today, and the relevant enforcement point is named so a future feature can be checked against it directly.

## Rule 1 — AI never makes educational decisions

AI does not decide what a learner should study next, how mastered a skill is, or what to recommend. It only puts an already-decided fact into words.

## Rule 2 — The Mastery Engine is the source of truth

`src/modules/learning-profile/` computes mastery/confidence deterministically from attempt history. No AI feature calculates or overrides a mastery score.

## Rule 3 — Recommendations are deterministic

`src/modules/parent-dashboard/recommendation-engine.ts`'s fixed, rule-ordered logic decides what to recommend. AI restates a recommendation's `title`/`description` — it never invents one, and `validation/grounding-validator.ts` rejects a `nextSteps` item that doesn't trace back to an actual recommendation or `upcomingFocusSkills`.

## Rule 4 — Adaptive missions remain deterministic

`src/modules/adaptive-learning/adaptive-selector.ts`'s seeded, explainable selection is unaffected by anything in `src/modules/ai/`. No AI output feeds back into what questions a learner receives.

## Rule 5 — No database rows cross the AI boundary

`coach/context-builder.ts`'s `ContextBuilder` is the only class allowed to call `ParentDashboardService`/`MissionCompletionService` on the AI platform's behalf. Everything above it — prompts, the gateway, providers, validators — only ever sees a `LearnerCoachingContext`, never a `question_attempts`/`missions`/`learner_skill_mastery`/`mission_items` row.

## Rule 6 — Every AI request uses a validated DTO

`validation/dto-validator.ts`'s `LearnerCoachingContextSchema` (Zod, `.strict()`) validates the assembled context before a prompt is ever built. A DTO that fails validation is never sent to a provider — `ContextBuilder.build` throws `ContextBuilderValidationError` instead.

## Rule 7 — Every AI response is validated

`validation/response-validator.ts`'s `CoachResponseSchema` checks the provider's JSON against the expected shape (fields, lengths, no markdown) before anything downstream trusts it.

## Rule 8 — Every AI response is grounded

`validation/grounding-validator.ts` checks the response's _content_ against the DTO it was built from: every strength must name a known strongest skill, every focus area a known focus skill or recommendation, every next step a recommendation or upcoming focus skill, every number in the response a number actually present in the DTO — plus banned diagnostic/comparative/predictive/ranking language and an audience word budget. A response that fails either validation step never reaches a learner or parent; it is treated exactly like a provider failure.

## Rule 9 — Every AI feature has a deterministic fallback

`coach/fallback-coach.ts`'s `buildFallbackCoachResponse` builds a valid, grounded response directly from the DTO, with zero AI involvement. `AiCoachService` uses it whenever AI is disabled, unconfigured, over budget, or fails validation/grounding/the provider call itself. The platform works with AI off; only the wording changes.

## Rule 10 — Business logic never imports AI providers

`providers/gemini-provider.ts` is the only file in the codebase that imports `@google/genai`. Every other module — including `AiCoachService` and every non-AI feature — depends only on the `AiGateway` interface (`gateway/ai-gateway.ts`).

## Rule 11 — Prompt versions are immutable

A `LearnerCoachingContext`'s `promptVersion` (e.g. `coach-v1`) identifies the exact prompt wording used to produce a cached response. A wording change ships as a new version (`coach-v2`) rather than mutating `coach-v1` in place, so previously-cached rows remain correctly attributable to the prompt that actually produced them.

## Rule 12 — Provider implementations are replaceable

Every provider implements the same `AiGateway` interface (`generate(request): Promise<response>`). Adding a second provider (OpenAI, Groq, Claude, Ollama) means adding one `providers/*-provider.ts` file and a branch in `gateway/gateway-factory.ts` — no change to `AiCoachService`, the prompts, or the validators.

---

Any future AI feature's design should be checked against these twelve rules before it is built, not after. If a proposed feature can't satisfy one of them without changing this document, that is a signal to revisit the feature's design, not to quietly make an exception.

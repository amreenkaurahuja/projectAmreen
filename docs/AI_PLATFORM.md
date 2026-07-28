# AI Platform (Phase 5.4)

The AI Learning Coach is the first feature built on Project Amreen's AI Platform (`src/modules/ai/`) — a reusable, provider-agnostic foundation intended to carry every future AI feature (a tutor, a study planner, a question explainer, teacher reports, …) without rebuilding prompt/validation/caching/provider plumbing each time. See `docs/AI_CONSTITUTION.md` for the twelve non-negotiable rules every such feature must follow, and `docs/Architecture.md` → "AI Platform (Phase 5.4)" for how this fits into the rest of the app.

The Question Explainer (Release 0.7, `src/modules/question-explainer/`) was the first capability built _on top of_ this platform rather than _as_ it — see `docs/ARS-001-release-0.7-retrospective.md` for the architectural patterns that release established as the default baseline for every capability after it.

## Architecture

```
Question Attempts
  → Mastery Engine (learning-profile/)
  → Recommendation Engine (parent-dashboard/)
  → Adaptive Mission Selector (adaptive-learning/)
  → ContextBuilder (ai/coach/context-builder.ts)
  → LearnerCoachingContext (validated DTO)
  → AiCoachService (ai/coach/ai-coach.service.ts)
      → context hash + cache lookup (ai/cache/)
      → AiGateway → GeminiProvider (ai/gateway/, ai/providers/)
      → response validation + grounding (ai/validation/)
      → fallback-coach.ts (deterministic, non-AI)
  → GET /api/learners/[learnerId]/coach
  → CoachCard (src/components/ai/coach-card.tsx)
```

Everything left of `ContextBuilder` is the deterministic learning-intelligence stack from Phases 5.1–5.3 and is untouched by this phase. Everything from `ContextBuilder` rightward is new.

## Data Flow

1. **Build**: `ContextBuilder.build({ learnerId, audience })` calls `ParentDashboardService.getDashboardData` (which itself enforces ownership first) and `MissionCompletionService.getSummary` for the most recent completed mission, and maps the result into a `LearnerCoachingContext`.
2. **Validate**: `validation/dto-validator.ts`'s `LearnerCoachingContextSchema` (Zod `.strict()`) checks the assembled context. On failure, `ContextBuilder` throws `ContextBuilderValidationError` (carrying the rejected candidate) rather than ever building a prompt from it.
3. **Hash**: `cache/context-hash.ts` computes a SHA-256 hash of the canonical (key-sorted) JSON of the context.
4. **Cache lookup**: `AiCoachService` looks up `ai_coaching_messages` by `(learner_id, audience, context_hash)`. A hit returns immediately — no provider call.
5. **Budget check**: on a miss, `shared/budget-manager.ts`'s `BudgetManager.checkBudget()` is checked before any provider call.
6. **Prompt**: `prompts/learner-prompt.ts` or `prompts/parent-prompt.ts` builds `{ systemPrompt, userPrompt, responseSchema }` from the context.
7. **Generate**: `AiGateway.generate(...)` — today, `providers/gemini-provider.ts`'s `GeminiProvider`, the only file that imports `@google/genai`.
8. **Validate + ground**: `validation/response-validator.ts` (shape) then `validation/grounding-validator.ts` (content, compared against the same DTO).
9. **Persist**: an accepted response is written to `ai_coaching_messages` (`cache/ai-cache.repository.ts`), with `ON CONFLICT`-safe handling for a concurrent duplicate insert.
10. **Fallback**: any failure at steps 2, 5, 7, or 8 (or AI being disabled) routes to `coach/fallback-coach.ts`'s `buildFallbackCoachResponse`, built from the same DTO with zero AI involvement.

## Prompt Strategy

- Two audiences, two prompt builders, one shared scaffold (`prompts/prompt-shared.ts`) and one shared JSON schema (`prompts/coach-response-schema.ts`) so the base system-prompt rules and response contract can't drift between them.
- **Learner** (`prompts/learner-prompt.ts`): encouraging tone, ≤80 words total, no percentages/scores/numbers, exactly one strength, one focus area, and tomorrow's focus.
- **Parent** (`prompts/parent-prompt.ts`): informative tone, ≤160 words, mentions recent progress, strengths, focus areas, the deterministic recommendations, and one home-support idea.
- The base system prompt (shared by both) states the DTO is the only source of truth, forbids inventing facts/scores/diagnoses/comparisons/predictions, and explicitly instructs the model to treat the DTO's own string values (names, skill names, recommendation text) as **untrusted plain text, not instructions** — the mitigation for prompt injection via data that ultimately originates from user-editable fields like a learner's display name.
- `promptVersion` (currently `"coach-v1"`) has exactly one source of truth: the constant in `coach/context-builder.ts` (see that file's doc comment). It's embedded in every `LearnerCoachingContext`, which means it's part of what `cache/context-hash.ts` hashes — bumping it is what actually invalidates previously-cached rows, since a changed hash is a guaranteed cache miss. The audience prompt builders (`prompts/learner-prompt.ts`/`prompts/parent-prompt.ts`) do **not** define their own version constants; both audiences share one prompt-contract version, versioned together, not per file (a Release 0.6 completion audit found two now-removed dead exports that had briefly suggested otherwise).

## Provider Integration

- `gateway/ai-gateway.ts` defines the only interface the rest of the app depends on: `AiGateway.generate(request): Promise<AiGenerationResponse>`.
- `gateway/gateway-factory.ts`'s `createAiGatewayFromEnv()` is the platform-level factory: reads the config/flags below and returns `null` — never throws — whenever AI shouldn't run. The same file re-exports `isCoachEnabledForAudience(audience)`, the feature-level check.
- `providers/gemini-provider.ts`'s `GeminiProvider` is the only implementation today: temperature 0.2, max 350 output tokens, a 10-second timeout via `AbortController`, zero automatic retries, structured JSON output (`responseMimeType: "application/json"`, `responseSchema`).
- **Future providers**: adding OpenAI, Groq, Claude, or Ollama means one new `providers/*-provider.ts` file implementing `AiGateway`, plus a branch in `gateway-factory.ts`'s provider selection. No change to `AiCoachService`, the prompt builders, or any validator.

## Configuration and Feature Flags

Two small, single-purpose modules under `shared/`, both read once from `process.env` and never scattered as ad-hoc reads elsewhere:

- `shared/ai-config.ts`'s `readAiConfigFromEnv()` returns an `AiConfig` — `provider`, `model` (from `AI_PROVIDER`/`AI_COACH_MODEL`), and the three generation parameters (`temperature`, `maxOutputTokens`, `timeoutMs`). The generation parameters are **fixed, not environment-configurable** — they encode a product decision (consistent, short, grounded coaching text), not a per-deployment tuning knob, so there are deliberately no `AI_TEMPERATURE`-style env vars. `providers/gemini-provider.ts` builds its config from this in one place instead of hardcoding the same three numbers.
- `shared/feature-flags.ts` exports `isAiEnabled()` (the `AI_ENABLED` platform-wide master switch) and `isCoachEnabledForAudience(audience)` (`AI_COACH_ENABLED` + the matching `AI_LEARNER_ENABLED`/`AI_PARENT_ENABLED`). `gateway-factory.ts` composes both rather than re-implementing flag-reading itself. A future second AI feature gets its own `isXEnabled` function here, layered on `isAiEnabled` the same way.

**Deliberately not built**, and why:

- **A barrel `index.ts` for `src/modules/ai/`** — no other domain module in this codebase (`missions`, `learning-profile`, `adaptive-learning`, `parent-dashboard`) uses barrel exports; every import is a direct file path. Adding one only to this module would be inconsistent with the project's own convention rather than following it.
- **A single umbrella `AIError` base class** — the codebase's existing convention (see `MissionRepositoryError`, `AdaptiveDataRepositoryError`, `ParentDashboardRepositoryError`) is one error base **per concern**, not one base spanning a whole subsystem. The AI platform already follows that: `AiProviderError` (→ `AiProviderTimeoutError`, `AiProviderQuotaError`), `AiCacheRepositoryError` (→ `AiCacheDuplicateError`), and `ContextBuilderValidationError` are each scoped to the concern that throws them. A single `AIError` umbrella would be a cosmetic change that breaks with the project's own pattern rather than matching it.
- **Thrown `ValidationError`/`GroundingError` classes** — response and grounding failures are intentionally represented as returned values (`ValidationResult`, `GroundingViolation[]`), not thrown exceptions. That's what makes "every failure falls back, nothing propagates" (`docs/AI_CONSTITUTION.md`, Rules 7–9) straightforward to guarantee — turning them into exceptions would mean re-introducing try/catch around a case that was deliberately designed to never throw.

## Validation

Two independent stages, run in order, both required to pass:

1. **Shape** (`validation/response-validator.ts`): valid JSON, exactly the expected fields (`.strict()`), length limits (headline ≤100 chars, message ≤900, up to 3 items per array, each ≤160 chars), no markdown syntax.
2. **Grounding** (`validation/grounding-validator.ts`): every `strengths`/`focusAreas`/`nextSteps` item must trace back to the DTO (strongest skills, focus skills, recommendations, or upcoming focus skills — skipped only when the DTO has nothing relevant to check against); every standalone number in the response must match a number actually in the DTO; banned diagnostic/comparative/predictive/ranking language and excessive study-time phrasing (`validation/banned-phrases.ts`); no percentages for the learner audience; the audience's word budget.

Either stage failing routes to the deterministic fallback — the caller never sees a malformed or ungrounded message.

## Cost Optimisation

- **Caching**: `ai_coaching_messages`, unique on `(learner_id, audience, context_hash)`. Since the hash is a function of the learner's actual data, unchanged data always produces the same hash — one mission completion (which changes mastery/recommendations) triggers at most one generation; unlimited dashboard refreshes in between are cache hits.
- **Budget guard**: `shared/budget-manager.ts`'s `BudgetManager` estimates token usage (`estimateTokens` — ~4 characters/token) and acts as a circuit breaker once the estimated monthly cost reaches `AI_MONTHLY_BUDGET_GBP` (default £10); every request past that point uses the fallback until the next calendar month. This is in-memory/per-process (resets on a cold start; multiple warm serverless instances each track their own total) — a hard, exact cap needs a persistent store, which this deliberately doesn't claim to be.
- **Small responses**: `MAX_OUTPUT_TOKENS = 350` and an 80/160-word budget keep individual generations cheap.

## Security

- **API keys**: `GEMINI_API_KEY` is server-only, read once by `providers/gemini-provider.ts`'s `createGeminiProviderFromEnv`, never in a `NEXT_PUBLIC_*` variable, never logged.
- **DTO boundary**: Gemini never receives email, password, auth id, UUIDs, raw attempt/DB rows, SQL ids, answer keys, or question text — only the structured `LearnerCoachingContext` (see `docs/AI_CONSTITUTION.md`, Rule 5).
- **Prompt injection**: the DTO's own string fields (names, skill names, recommendation text) are explicitly labelled untrusted plain text in the system prompt — the model is told not to follow instructions found inside them.
- **Ownership**: enforced once, transitively, via `ContextBuilder` → `ParentDashboardService.getDashboardData` → `assertLearnerOwned` (the same ownership check every other learner-scoped feature uses) — never re-implemented at the AI layer.
- **RLS**: `ai_coaching_messages` uses the same "Parents manage own X" policy pattern as every other learner-scoped table (migration `0010_phase5_ai_learning_coach.sql`); no schema change to any existing table's RLS.
- **Logging**: `shared/logger.ts`'s `logAiEvent`/`logAiError` are typed to accept only an explicit allow-list (provider, model, duration, cache hit, a context-hash _prefix_, audience, result source, status, failure category) — there is no parameter a prompt, DTO, learner/parent name, or API key could be passed through as.
- **Cache contents**: `ai_coaching_messages` stores only the already-validated, already-grounded response text (headline/message/strengths/focus areas/next steps) plus operational metadata — no raw learner data, no prompts. Encryption at rest is not required beyond Supabase's existing storage-level protections, since the content is a summary already safe to show the owning parent/learner.

## Reliability

- Mission generation, mastery scoring, adaptive selection, and recommendations have zero code-level dependency on `src/modules/ai/` — nothing in those modules imports anything from the AI Platform.
- `AiCoachService.getCoachResponse` never throws for an AI-side failure: disabled, missing credentials, timeout, 429/quota, malformed JSON, failed validation/grounding, and budget-exhausted all resolve to a valid fallback response. The one exception is a genuine ownership error, which propagates so the route can return 403 rather than silently serving another parent's data.
- `providers/gemini-provider.ts` performs **zero automatic retries** — a failure falls back immediately rather than adding latency by retrying a flaky call.

## Performance Targets

These are targets to design and monitor against, not enforced by an automated timing test (a hard-coded latency assertion in CI is inherently flaky and was deliberately not added):

| Operation                                                                          | Target       |
| ---------------------------------------------------------------------------------- | ------------ |
| Context build (`ContextBuilder.build`, cache/DB reads)                             | < 100ms      |
| Cache lookup (`ai_coaching_messages` indexed read)                                 | < 10ms       |
| Gemini generation (cache miss)                                                     | < 2s average |
| Dashboard load, cache hit                                                          | < 500ms      |
| Memory overhead (budget guard + health tracker, both bounded in-memory structures) | Negligible   |

## Observability

`shared/provider-health.ts`'s `ProviderHealthTracker` (a rolling window of the last 50 Gemini calls, recorded by `gemini-provider.ts`) exposes, in-process:

- `status`: `"healthy"` / `"degraded"` / `"down"`, derived from the recent failure rate
- `averageLatencyMs`, `timeoutRatePercent`, `lastSuccessAt`, `sampleSize`

`shared/budget-manager.ts`'s `BudgetManager.getSnapshot()` exposes daily request count, daily/monthly estimated tokens, and estimated monthly cost. Every individual request is also logged (`shared/logger.ts`) with `resultSource` (`ai`/`fallback`/`cache`), `cacheHit`, `durationMs`, `contextHashPrefix`, `audience`, `status`, and `failureCategory` — an external log aggregator can compute cache-hit rate, fallback rate, average duration, and per-category failure counts (timeout/quota/malformed-JSON/validation/grounding/budget) directly from these fields. **Not built**: a dedicated ops dashboard UI surfacing these metrics — the data points exist in logs and the two in-process trackers, but no page renders them yet.

## Security Checklist

- [x] API keys server-only, never `NEXT_PUBLIC_*`
- [x] DTO validated before any prompt is built
- [x] Response validated (shape)
- [x] Response grounded (content vs. DTO)
- [x] Prompt injection mitigation (untrusted-data instruction in the system prompt)
- [x] Ownership validated (via the existing `ParentDashboardService` ownership check)
- [x] RLS applied to the new table, matching the existing pattern
- [x] No learner/parent identifiers, raw answers, or question text sent to the provider
- [ ] Cache encryption — not required; the cache stores only already-validated summary text (see "Security" above)

## Deployment Checklist

Environment variables (all server-only):

```
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=<real key>
AI_COACH_MODEL=gemini-2.5-flash
AI_COACH_ENABLED=true
AI_LEARNER_ENABLED=true
AI_PARENT_ENABLED=true
AI_MONTHLY_BUDGET_GBP=10
AI_ESTIMATED_GBP_PER_1K_TOKENS=<match your actual provider pricing>
```

Before enabling in an environment:

- [ ] Migration `0010_phase5_ai_learning_coach.sql` applied
- [ ] `GEMINI_API_KEY` set in the deployment's secret store (never committed)
- [ ] `AI_ESTIMATED_GBP_PER_1K_TOKENS` updated from the placeholder default to match real provider pricing
- [ ] Confirm `AI_ENABLED=false` (or unset) still serves the fallback correctly — the "kill switch" path
- [ ] Confirm the fallback path renders correctly end to end (learner + parent audiences)
- [ ] Confirm grounding rejects an intentionally-bad synthetic response in a manual check

## Release Checklist

- [ ] All unit tests passing (`npm test`)
- [ ] Coverage meets thresholds (`npm run test:coverage`)
- [ ] Manual check: learner dashboard shows the coach card correctly
- [ ] Manual check: parent learner-insights page shows the AI Learning Summary card correctly
- [ ] Manual check: `AI_ENABLED=false` shows the deterministic fallback, not an error
- [ ] Manual check: a brand-new learner (no mastery data) sees the empty-state welcome message with no AI call
- [ ] Cache behavior confirmed: a second request for unchanged data is a cache hit
- [ ] `promptVersion` matches what's actually deployed
- [ ] Documentation (this file, `docs/AI_CONSTITUTION.md`, `docs/Architecture.md`, `docs/API.md`) up to date

## Future Providers

Only Gemini is implemented. Adding a second provider is expected to require exactly one new file (`providers/openai-provider.ts`, `providers/claude-provider.ts`, etc.) implementing `AiGateway`, plus one new branch in `gateway/gateway-factory.ts`'s provider selection — see `docs/AI_CONSTITUTION.md`, Rule 12.

# ARS-001 — Architecture Retrospective: Release 0.7, Learning Companion Foundation

**Status**: Accepted
**Date**: 2026-07-28
**Scope**: Release 0.7 (PRS-007 → TDS-007 → PS-007 → Stages 0–4, AI Learning Companion / Question Explainer)

This is not a historical narrative. It is the architectural baseline for Release 0.8 and beyond — every point below is verified against what was actually built and merged in Release 0.7 (PRs #13–#17), not aspirational.

## 1. AI is infrastructure, not the product

Business capabilities own educational behaviour; the AI platform provides reusable infrastructure.

```
Learning Capability → AI Platform → Provider
```

Future capabilities should never depend directly on Gemini (or any provider) — only on the AI platform. Verified throughout the release by grep: `src/modules/ai/` has zero references to `question-explainer` in either direction of the check.

## 2. Deterministic first

Every AI capability begins with deterministic behaviour; AI enhances, it never replaces. Appeared repeatedly: deterministic explanations (Stage 1), deterministic grading (pre-existing, reused unchanged), deterministic fallback (Rule 14, every stage), deterministic follow-up selection (`FollowUpQuestionSelector`).

## 3. AI never becomes the source of truth

The platform owns truth; the model explains it. AI must never determine correctness, calculate mastery, select missions, update learner state, or infer learner ability — enforced by `docs/AI_CONSTITUTION.md`'s rules and, for the Explainer specifically, by `explanation-grounding-validator.ts` rejecting anything that doesn't trace back to the deterministic context.

## 4. AI is a replaceable component

Every provider sits behind `AiGateway`. Capabilities never know Gemini/OpenAI/Anthropic by name — only the interface. `providers/gemini-provider.ts` remains the sole file permitted to import `@google/genai`, unchanged across the whole release.

## 5. Capabilities own their contracts

Every capability defines its own DTO, prompt, response schema, grounding validator, and fallback. The platform owns transport, gateway, logging, budget, and validation _patterns_ — not the schemas themselves.

**One refinement worth recording**: the platform also owns a small number of genuinely shared _primitives_ capability-specific validators draw from directly, not just patterns to imitate — `ai/validation/banned-phrases.ts`'s `BANNED_PHRASES` (diagnostic/comparative/predictive/ranking language) and `ai/shared/canonical-json.ts`'s `canonicalJsonStringify` were both imported and reused as-is by the Explainer's grounding validator and context hash, not reimplemented. A future capability should check for an existing shared primitive before writing a capability-specific equivalent — the boundary is "shared, capability-agnostic building blocks live in the platform; the decisions that combine them are the capability's own," not "nothing is ever shared."

## 6. Validation before persistence

Only responses that pass schema validation and grounding validation may be persisted. Invalid AI output is operational telemetry, not product data — `question_explanations` (migration `0011`) only ever receives a row via `QuestionExplainerService`'s success path, after both checks pass.

## 7. Prompts are versioned assets

Prompt versions participate in cache identity (`QUESTION_EXPLAINER_PROMPT_VERSION`, embedded in `QuestionExplanationContext`, hashed). Prompt changes behave like schema changes — a wording change is a new version, not a mutation in place (Rule 11, extended to the Explainer in Stage 2).

## 8. Thin transport layers

Routes authenticate, authorise, validate, compose, and map responses — never educational behaviour. Verified directly for `POST /api/v1/question-explanations`: no prompt-building, gateway, grounding, hashing, persistence, or follow-up-selection imports anywhere in the route file.

## 9. Cache validated meaning

The cache stores validated educational responses, not raw model output. A cache hit never bypasses educational safeguards — nothing bypasses schema/grounding validation to reach `question_explanations`; a cache hit only ever _returns_ a row that already passed both when it was written.

## 10. Domain before abstraction

Release 0.7 repeatedly declined premature generalisation: no generic explanation framework, no generic grounding engine, no capability pipeline, no policy engine, no abstraction for a single endpoint. Two concrete instances: the Stage 1 review's `ExplanationPolicy` suggestion and the Stage 2 review's "AI Capability Pipeline" suggestion were both explicitly deferred ("do not build this yet... wait until at least a third AI capability justifies the abstraction").

## 11. Version everything that changes behaviour

Prompts, schemas (`question-explanation-context-v2`), and the API (`/api/v1/`) are all versioned. Future releases should continue this wherever a change affects compatibility.

## 12. Test the contract, not just the code

Frozen API/response contracts, strict schema validation, grounding regression tests, prompt-injection tests, cache race-condition tests, and deterministic-fallback tests all proved valuable and should remain the default test shape for a new capability — prioritising externally observable behaviour over implementation detail.

## 13. Honest engineering

Operational gaps were stated explicitly rather than glossed over: migration verification requiring a real Supabase instance (undeliverable in this environment, documented rather than assumed), arithmetic verification remaining out of scope for AI-generated worked examples, deferred abstractions documented (this file, §10) rather than built speculatively. This should continue: state what has been verified, what has not, and why.

## Release 0.7 outcomes

Deterministic explanation generation, AI explanation generation, capability-specific prompting, strict response schemas, grounding validation, deterministic fallback, response caching, a versioned API, observability, and feature-flag composition — the reusable foundation for future educational capabilities.

## Platform standards adopted (defaults unless there is a compelling reason to deviate)

1. Deterministic-first architecture.
2. AI as an enhancement layer, never the source of truth.
3. Thin transport adapters.
4. Capability-specific prompts and grounding, built on shared platform primitives where one already exists (§5).
5. Strict response contracts.
6. Persist only validated AI output.
7. Version prompts, schemas, and public APIs.
8. Delay abstraction until duplication is demonstrated across multiple capabilities.
9. Document operational limitations explicitly.

## Looking forward

Release 0.8 should not revisit these decisions — it should build new educational capabilities (Hint Engine, Misconception Engine, Parent Guidance, Revision Coach, …) on top of them, validating whether the patterns continue to hold under a second and third real capability. If repeated implementations reveal genuine duplication, that is the point to introduce shared abstractions (e.g. an AI Capability Pipeline) — supported by evidence, not anticipation.

Stage 5 (Learner UI) shifts the review focus accordingly: not "was this built correctly" but "does this genuinely improve learning" — readability, cognitive load, accessibility, and learner interaction, not engineering correctness.

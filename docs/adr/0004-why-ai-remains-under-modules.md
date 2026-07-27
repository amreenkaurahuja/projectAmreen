# ADR-004: Why AI remains under `src/modules/`, not `src/platform/`

**Status**: Accepted
**Date**: 2026-07-27

## Context

Phase 5.4 built the AI Learning Coach under `src/modules/ai/`, following this project's existing convention: every domain capability lives under `src/modules/<domain>/`, split into `*.types.ts` / `*.repository.ts` / `*.service.ts` (see `docs/Architecture.md` → "Layered structure").

Before Sprint 1 of Release 0.6 began, a `src/platform/` (or `src/modules/intelligence/`) structure was proposed, on the reasoning that AI is a cross-cutting _platform_ capability (like logging or observability) rather than a business _module_ (like missions or mastery), and that a small number of large companies structure their codebases this way.

## Decision

`src/modules/ai/` stays where it is. No `src/platform/` was created.

Reasons:

1. **The project's own instruction, applied literally.** SDS-001 (Sprint 1) itself said: "If the project already has an established structure, integrate with it rather than forcing a reorganisation." `src/modules/ai/` is that established structure — merged, tested, documented, in production use (PR #9) — before the `platform/` proposal was made.
2. **A `platform/` vs `modules/` split is not an AI-scoped change.** It would also move `learning-profile`, `adaptive-learning`, `missions`, `parent-dashboard`, and `curriculum` — every existing, shipped module — since the same "business vs. cross-cutting" question applies to observability/logging code that already exists in `src/lib/observability/`. That is a whole-codebase restructuring project, not a Sprint 1 deliverable, and it touches import paths across every file in the app for organizational benefit rather than a concrete, present need.
3. **The dependency rule that actually matters is already true regardless of folder name.** See `docs/Architecture.md` → "Dependency rules": nothing in `learning-profile`, `adaptive-learning`, `missions`, `parent-dashboard`, or `curriculum` imports from `src/modules/ai/`. Moving `ai` to a different top-level folder doesn't change that graph — it only changes where on disk the boundary is drawn, which is precisely the kind of change worth deferring until there's a concrete cost to _not_ making it (onboarding confusion, accidental imports, tooling that assumes the split), not a hypothetical future one.

## Consequences

- Every current and near-term AI feature (question explainer, study planner, etc. — see `docs/AI_PLATFORM.md`) continues to live under `src/modules/ai/`, following the same domain-module convention as everything else.
- **This decision is explicitly revisitable, not permanent.** The trigger condition, as discussed with the project's architecture reviewer: once the codebase accumulates roughly 10+ genuinely cross-cutting services (AI, logging, observability, caching, telemetry, config, …), a `src/core/` split (not `platform/` — `core` was the reviewer's later-preferred name) becomes worth the one-time cost of moving them. As of Release 0.6, the count is much lower (AI plus the existing `src/lib/observability/`), so that threshold hasn't been reached.
- Configuration (`shared/ai-config.ts`) is likewise expected to eventually move into a project-wide `config/` grouping once multiple domains (database, logging, observability, cache, security, feature flags) each have their own scattered config — not before. See `docs/AI_PLATFORM.md` → "Configuration and Feature Flags" for the current, AI-scoped version.
- If a future contributor asks "why isn't AI under `platform/`?", this document is the answer — it does not need to be re-litigated from scratch each time the question comes up, only re-evaluated against the trigger condition above.

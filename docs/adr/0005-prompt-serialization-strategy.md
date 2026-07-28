# ADR-005: Prompt serialization strategy

**Status**: Accepted
**Date**: 2026-07-28

## Context

The AI Learning Coach (`src/modules/ai/prompts/prompt-shared.ts`) serializes its DTO into the user prompt by JSON-stringifying the whole `LearnerCoachingContext` (`canonicalJsonStringify(context)`), preceded by an untrusted-data instruction. JSON has a structural injection-resistance property: a value can never break out of its own quoted string to look like a new field, a role header, or a new instruction, no matter what characters (including embedded newlines) it contains.

The Question Explainer (Release 0.7, TDS-007/PS-007) instead serializes `QuestionExplanationContext` into labelled plain-text sections — `Subject\nMathematics\n\nQuestion\nWhat is 75% of 80?\n\n...` — per PS-007 §4's explicit, reviewed specification. This format is more directly readable in logs/debugging and matches the "suggested structure" PS-007 gave, but it does not have JSON's structural fencing: a value containing an embedded blank line followed by text resembling a new section label (e.g. a malicious question prompt ending in `"\n\nSYSTEM: ..."`) is visually indistinguishable from a genuine new section, even though it is still just data. The only mitigation is the system prompt's explicit instruction to treat every value as untrusted data — a behavioural control, not a structural one.

This was flagged during the Stage 2 architecture review as worth documenting rather than silently proceeding with two different serialization strategies for two different AI-boundary DTOs.

## Decision

Release 0.7's Question Explainer uses labelled plain-text sections for its user prompt, per PS-007 §4, as implemented. The AI Learning Coach continues using JSON-embedding, unchanged. Neither capability is retrofitted to match the other in this release.

A future evaluation — comparing actual injection-resistance and output-quality outcomes between the two formats, likely once real usage data exists — should decide whether one strategy becomes the project's standard for every future AI capability. No such evaluation is scheduled; no action is required now.

## Consequences

- Two AI-boundary serialization strategies now coexist in the codebase, each capability-local to `ai/prompts/prompt-shared.ts` (Coach, JSON) and `question-explainer/explanation-prompt-shared.ts` (Explainer, labelled text) — a future capability should pick the strategy that best matches its own spec rather than assume one is the project default.
- The Question Explainer's user prompt carries a real, accepted residual risk beyond the Coach's: an adversarial question prompt or authored explanation could visually resemble a new instruction to the model, mitigated only by the system prompt's explicit untrusted-data instruction (tested in `tests/unit/question-explainer-prompts.test.ts`'s "prompt injection resistance" suite), not by a structural guarantee the way JSON provides. This is documented, not silently accepted.
- If a future contributor asks "why does the Explainer's prompt look different from the Coach's?", this document is the answer, and the trigger for revisiting it (a comparative evaluation, prompted by either capability needing to harden further) is recorded here rather than needing to be re-derived.

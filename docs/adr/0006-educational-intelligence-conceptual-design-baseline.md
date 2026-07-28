# ADR-0006: Educational intelligence — conceptual design baseline (Release 0.8)

**Status**: Accepted
**Date**: 2026-07-28

## Context

Release 0.8 planning began from `docs/ACB-001-adaptive-capability-baseline.md`, an evidence-only audit of the deterministic adaptive-learning, mastery, review-scheduling, and parent-recommendation capabilities as they existed at `v0.7.0-rc.1`. Three feature themes were originally proposed — Adaptive Learning, Parent Intelligence, and Teacher-grade Mission Planning — described in feature-oriented terms.

Applying `docs/DDS-001-documentation-development-standard.md`'s Evidence Ladder to that audit surfaced a recurring architectural gap rather than three unrelated features: ACB-001 §3.3 found the same fusion of "what evidence means" and "what to do about it" independently present in three subsystems (the adaptive selector, the recommendation engine, and `computeNextReviewAt`), and ACB-001 §3.5 found no persisted concept of multi-day planning anywhere in the schema, with the parent dashboard's "tomorrow" preview only ever re-deriving a non-persistent, one-way view of the same daily selector. An architecture review (AR-008, conducted against this baseline) concluded that the originally separate feature themes were manifestations of a smaller number of underlying architectural responsibilities, not three independent capabilities to be built side by side.

## Decision

Adopt three distinct responsibilities within an Educational Intelligence Core, each satisfying the Architectural Admission Rule (Observed, Repeated, Necessary, Ownable) against the evidence in ACB-001:

- **Educational Interpretation** — assigns meaning to evidence, independent of any decision made from that meaning.
- **Educational Policy** — decides what should happen for a given interpretation; may exist as multiple independent policies feeding into Sequencing.
- **Educational Sequencing** — reasons about the order and pacing of educational content across time, consuming Policy's output rather than raw evidence or performing per-question selection itself.

These are separated from **Communication/Representation** — how a decision is phrased for a learner or parent — by an explicit Representation Boundary. Communication is out of scope for the Educational Intelligence Core and is deferred to a future TDS-008C.

The document identifier TDS-008B, used earlier in Release 0.8 discovery for a separately-numbered design document, is retired; its intended content is folded into TDS-008A rather than published as a separate document.

## What Changed

Release 0.8 planning began with separate concepts for adaptive mission selection, learning planning, and educational communication. Architecture review concluded that:

- adaptive mission selection and longer-horizon planning are manifestations of a single capability (Educational Sequencing);
- educational communication lies beyond the Educational Intelligence Core and is separated by an explicit Representation Boundary;
- educational interpretation is an explicit architectural concept, justified by repeated evidence from the existing implementation rather than introduced speculatively.

## Consequences

- `docs/PRS-008`, `docs/AR-008`, and `docs/TDS-008A` (once committed) must reflect Interpretation/Policy/Sequencing as three distinct responsibilities and the Representation Boundary as the edge of the Educational Intelligence Core's scope — not as an internal detail of any single feature theme.
- A future proposal to collapse Interpretation back into Policy, or to let Sequencing perform per-question selection directly, is a change to an architectural invariant recorded here and in DDS-001's worked examples, not a routine implementation choice — it should be evaluated against the evidence in ACB-001 §3.3 and §3.5, not re-derived from scratch.
- This record does not evolve. If the boundaries above change in a later release, that is a new decision and a new ADR, not an edit to this one.

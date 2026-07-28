# PRS-008 — Educational Intelligence Evolution

**Status**: Accepted
**Date**: 2026-07-29
**Scope**: Release 0.8 product specification, grounded in the evidence recorded in `docs/ACB-001-adaptive-capability-baseline.md`, governed by `docs/DDS-001-documentation-development-standard.md`, and aligned with the conceptual baseline in `docs/adr/0006-educational-intelligence-conceptual-design-baseline.md`.

## Purpose

### Mission

Project Amreen shall evolve from a system that records learner performance and generates deterministic daily learning activities into a system capable of making richer, evidence-backed educational decisions while preserving deterministic educational judgement, explainability and clear separation of responsibilities.

Release 0.8 extends the educational capabilities established in Release 0.7. It does not replace them.

## Background

Release 0.7 established deterministic capabilities including:

- adaptive daily mission generation
- mastery tracking
- review scheduling
- learner progress analysis
- parent recommendations
- educational event capture through the learning-events pipeline

The current implementation baseline is documented in ACB-001.

Architecture review concluded that these capabilities expose recurring educational reasoning patterns that justify explicit conceptual responsibilities within the Educational Intelligence Core, recorded in ADR-0006.

## Product Vision

Release 0.8 focuses on improving the quality of educational reasoning rather than increasing the number of educational features.

The objective is to enable the system to answer educational questions more consistently, more transparently and across longer learning horizons while preserving deterministic behaviour.

## Product Principles

**Principle 1 — Evidence before intervention**
Every authoritative educational decision shall be traceable to learner evidence and deterministic educational rules.

**Principle 2 — Educational interpretation is independent of presentation**
Educational meaning shall not depend upon audience-specific wording.

**Principle 3 — Deterministic educational judgement**
Artificial intelligence may support explanation and communication but shall not become the authoritative source of educational interpretation, policy or sequencing.

**Principle 4 — Explainability**
Every authoritative educational decision shall be explainable through the educational evidence and deterministic policy that produced it.

**Principle 5 — Educational Interpretation, Educational Policy and Educational Sequencing are distinct responsibilities**

- Interpretation determines what is educationally true.
- Policy determines which interventions are educationally appropriate.
- Sequencing reconciles competing candidate interventions into one coherent educational decision for the selected planning horizon.

## Product Goals

**Goal A — Educational Understanding**
Improve the system's ability to derive reusable educational interpretations from learner evidence.

**Goal B — Educational Sequencing**
Improve the system's ability to reconcile competing educational interventions into coherent learning experiences across different planning horizons. Adaptive mission generation forms one planning horizon within Educational Sequencing.

**Goal C — Educational Communication**
Improve the system's ability to communicate educational outcomes appropriately to different consumers while preserving the underlying educational meaning. Communication itself lies beyond the Educational Intelligence Core.

## Educational Intelligence Model

```
Evidence
   ↓
Signals
   ↓
Educational Interpretation
   ↓
Candidate Educational Policies
   ↓
Educational Sequencing
(arbitration + planning horizon)
   ↓
Authoritative Educational Decision
```

The Educational Intelligence Core concludes at the production of an authoritative educational decision. Transformation of that decision into audience-specific representations lies beyond the Representation Boundary.

## Scope

### In Scope

- Educational Interpretation
- Educational Policy
- Educational Sequencing
- richer deterministic educational reasoning
- multi-horizon educational sequencing
- explainability

### Out of Scope

- Communication implementation
- presentation
- learner-facing wording
- parent-facing wording
- teacher presentation
- AI prompt construction
- gamification
- social learning
- avatars

## Open Product Questions

Release 0.8 intentionally leaves the following questions to architectural and technical design.

1. Which educational interpretations should become reusable concepts?
2. How should competing candidate interventions be reconciled?
3. Which planning horizons should share sequencing behaviour?
4. Which educational decisions require explicit explainability?
5. What evidence is sufficient to demonstrate richer educational reasoning than Release 0.7?
6. Should behavioural interaction evidence captured through the existing learning-events pipeline become a recognised input to Educational Interpretation, or remain observational-only within Release 0.8?

## Success Criteria

Release 0.8 will be considered successful when:

- educational reasoning incorporates demonstrably richer learner evidence than Release 0.7;
- educational interpretation, policy and sequencing remain behaviourally distinct;
- competing educational interventions are reconciled deterministically;
- educational communication can vary without changing educational meaning;
- adaptive daily mission generation is expressed as one planning horizon of Educational Sequencing;
- the conceptual responsibilities established in ADR-0006 remain intact throughout implementation.

The measurable definition of "demonstrably richer" is intentionally deferred to technical design and verification planning.

## Relationship to Technical Design

This document specifies product capability. It intentionally does not prescribe:

- implementation architecture;
- persistence;
- APIs;
- algorithms;
- domain models;
- software components.

Those responsibilities belong to AR-008 and TDS-008A.

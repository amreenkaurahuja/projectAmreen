# AR-008 — Educational Intelligence Architecture Review

**Status**: Accepted
**Date**: 2026-07-29
**Scope**: Architecture review for Release 0.8 Educational Intelligence, evaluated against:

- `docs/ACB-001-adaptive-capability-baseline.md`
- `docs/DDS-001-documentation-development-standard.md`
- `docs/adr/0006-educational-intelligence-conceptual-design-baseline.md`
- `docs/PRS-008-educational-intelligence-evolution.md`

## 1. Review Purpose

This review evaluates whether the proposed Release 0.8 architecture:

- faithfully realises the product intent defined in PRS-008;
- preserves the conceptual boundaries accepted in ADR-0006;
- remains grounded in the implementation evidence recorded in ACB-001;
- introduces no architectural responsibility that fails DDS-001's Architectural Admission Rule;
- establishes a sufficiently stable foundation for TDS-008A.

This review does not prescribe implementation components, persistence structures, APIs or algorithms.

## 2. Review Method

The architecture is evaluated through five independent review passes:

1. **Traceability** — Is each architectural claim supported by committed evidence or an accepted product requirement?
2. **Boundary integrity** — Does each responsibility own only its intended behaviour?
3. **Consistency** — Are concepts and terms used consistently across the document chain?
4. **Completeness** — Are any material architectural questions unaddressed?
5. **Editorial clarity** — Is the architecture expressed clearly enough to guide technical design?

These passes are a review method, not a new governance standard.

## 3. Evidence Summary

ACB-001 records three independent instances in which educational observation and intervention policy are currently fused:

- adaptive mission selection;
- parent recommendation generation;
- review scheduling.

Across these subsystems, the implementation currently derives educational meaning and immediately decides what action to take.

This repeated pattern supports an explicit separation between:

- Educational Interpretation; and
- Educational Policy.

ACB-001 also records that daily adaptive selection currently reconciles multiple valid educational needs using fixed slot allocation, including:

- weak-skill support;
- scheduled review;
- curriculum coverage;
- challenge.

This supports a distinct responsibility for reconciling competing interventions.

ACB-001 further records no persisted multi-day learning-plan concept. The parent dashboard's "tomorrow" preview re-derives a one-way view of the daily selector rather than operating from a durable learning plan.

This indicates that daily selection and longer-horizon planning are not presently independent architectural capabilities. They are different planning horizons of the same sequencing responsibility.

Finally, ACB-001 records that behavioural interaction data is captured through the learning-events pipeline but currently has no educational consumer. Whether this evidence should inform Educational Interpretation remains unresolved.

## 4. Product Fidelity Review

PRS-008 establishes three product goals:

- Educational Understanding;
- Educational Sequencing;
- Educational Communication.

The proposed architecture maps these goals as follows:

| Product goal              | Architectural treatment                                       |
| ------------------------- | ------------------------------------------------------------- |
| Educational Understanding | Educational Interpretation                                    |
| Educational Sequencing    | Educational Policy plus Educational Sequencing                |
| Educational Communication | Educational Representation beyond the Representation Boundary |

This mapping is complete.

Educational Communication remains a product goal while its implementation stays outside the Educational Intelligence Core. This is not a contradiction: the product requires communicable educational outcomes, while the Core owns only the authoritative educational decision from which those representations are derived.

No additional architectural responsibility is required to realise the product goals.

## 5. Architectural Model

The accepted conceptual flow is:

```
Evidence
    ↓
Signals
    ↓
Educational Interpretation
    ↓
Candidate Educational Interventions
    ↓
Educational Sequencing
    ↓
Authoritative Educational Decision
```

The Educational Intelligence Core ends at the authoritative educational decision.

Beyond that point:

```
Authoritative Educational Decision
    ↓
Representation Boundary
    ↓
Audience-specific Educational Representation
```

Representation is not an internal responsibility of the Educational Intelligence Core.

## 6. Responsibility Evaluation

### 6.1 Educational Interpretation

**Purpose**

Derive reusable educational meaning from learner evidence and educational signals.

**Owns**

- educational meaning;
- classification of educational state;
- interpretation of evidence in educational terms;
- reusable conclusions that may support more than one policy.

**Must not own**

- intervention selection;
- arbitration between interventions;
- mission ordering;
- planning horizons;
- audience-specific wording;
- presentation.

**Admission assessment**

| Criterion | Assessment                                                             |
| --------- | ---------------------------------------------------------------------- |
| Observed  | Existing subsystems repeatedly interpret evidence before acting        |
| Repeated  | Present in adaptive selection, recommendations and review scheduling   |
| Necessary | Meaning must be reusable independently of any one intervention         |
| Ownable   | Educational meaning is behaviourally distinct from intervention choice |

**Verdict**

Accepted.

### 6.2 Educational Policy

**Purpose**

Determine which educational interventions are appropriate for a given Educational Interpretation.

**Produces**

Candidate educational interventions.

A policy proposes an educational response. It does not own the final educational decision and must not assume its candidate will be enacted.

**Owns**

- intervention eligibility;
- educational rationale for an intervention;
- candidate priority or strength where justified;
- policy-specific constraints.

**Must not own**

- deriving educational meaning directly from raw evidence;
- arbitration among competing policies;
- final learning-experience composition;
- audience-specific wording;
- presentation.

**Admission assessment**

| Criterion | Assessment                                                                         |
| --------- | ---------------------------------------------------------------------------------- |
| Observed  | Existing systems directly map interpreted conditions to interventions              |
| Repeated  | Present independently in selector, recommendations and review scheduling           |
| Necessary | Multiple valid interventions can coexist and must remain independently expressible |
| Ownable   | Intervention proposal is distinct from interpretation and arbitration              |

**Verdict**

Accepted.

### 6.3 Educational Sequencing

**Purpose**

Reconcile multiple valid candidate interventions into a coherent educational experience across a selected planning horizon.

**Produces**

Authoritative educational decisions.

**Owns**

- arbitration among competing candidate interventions;
- ordering;
- pacing;
- allocation across a planning horizon;
- balancing support, review, coverage and challenge;
- deciding what will actually occur.

**Must not own**

- deriving educational meaning from raw evidence;
- creating policy rationale that belongs to a candidate intervention;
- audience-specific wording;
- presentation.

**Admission assessment**

| Criterion | Assessment                                                                    |
| --------- | ----------------------------------------------------------------------------- |
| Observed  | Existing daily selector already reconciles multiple educational needs         |
| Repeated  | The same reconciliation problem applies across daily and longer horizons      |
| Necessary | Candidate interventions require authoritative arbitration                     |
| Ownable   | Arbitration, ordering and horizon management form one coherent responsibility |

**Verdict**

Accepted.

## 7. Candidate Intervention versus Authoritative Decision

The distinction between candidate intervention and authoritative decision is an architectural boundary.

Educational Policy answers:

> What interventions are educationally appropriate?

Educational Sequencing answers:

> Given all appropriate candidate interventions, what shall actually happen within the selected planning horizon?

Policy is intentionally non-authoritative.

Sequencing is not a post-decision scheduler. It owns the final reconciliation decision.

This distinction prevents:

- one policy from silently overriding competing educational needs;
- sequencing from becoming a mechanical ordering layer;
- planning logic from being duplicated across policies;
- daily mission selection and longer-horizon planning from diverging into separate architectural capabilities.

## 8. Planning-Horizon Evaluation

The architecture recognises planning horizon as an input to Educational Sequencing, not as a separate responsibility.

Possible horizons may include:

- an individual learning activity;
- a daily mission;
- a review window;
- a multi-day learning sequence;
- a longer curriculum interval.

The exact supported horizons are deferred to TDS-008A.

This review accepts only the architectural principle:

> Changes in planning horizon do not create a new conceptual responsibility where the underlying behaviour remains reconciliation, ordering and pacing of candidate educational interventions.

Accordingly, a separate Learning Planner is not admitted.

The earlier TDS-008B identifier remains retired, consistent with ADR-0006.

## 9. Representation Boundary Evaluation

The Educational Intelligence Core produces authoritative educational decisions.

It does not produce:

- parent wording;
- learner wording;
- teacher wording;
- dashboard copy;
- AI prompts;
- presentation-specific explanations.

These belong beyond the Representation Boundary.

The same authoritative educational decision may support multiple representations without changing its educational meaning.

Representation is therefore recognised as a downstream architectural concern but is not allocated within TDS-008A.

Its design is deferred to TDS-008C.

## 10. Behavioural Interaction Evidence

The learning-events pipeline already captures behavioural interaction evidence, but ACB-001 records no current educational consumer.

PRS-008 correctly leaves open whether such evidence should:

- become a recognised input to Educational Interpretation; or
- remain observational-only within Release 0.8.

**Architectural evaluation**

Behavioural evidence must not become educationally authoritative merely because it is available.

Before it may influence Educational Interpretation, technical design must establish:

- what specific behaviour is being observed;
- whether that behaviour has a defensible educational meaning;
- whether the interpretation is deterministic and explainable;
- whether the evidence is sufficiently reliable;
- whether the signal risks confusing engagement behaviour with learner capability;
- whether the interpretation could unfairly penalise distraction, hesitation, repetition or atypical interaction patterns.

**Review decision**

Release 0.8 may evaluate behavioural interaction evidence as a potential input to Educational Interpretation.

It shall not treat the existence of captured events as sufficient justification for educational use.

Any behavioural signal proposed for implementation must be individually justified and traceable.

Until that justification is completed, learning-events data remains observational-only.

This is a controlled evaluation position, not a permanent architectural exclusion.

## 11. Boundary Verification

### 11.1 Interpretation leakage

A behaviour has leaked from Interpretation into Policy when it moves from:

> what is educationally true

to:

> what should be done.

Interpretation must not emit intervention instructions.

### 11.2 Policy leakage

A behaviour has leaked from Policy into Sequencing when a policy:

- assumes its candidate will be enacted;
- suppresses competing candidates;
- allocates mission slots;
- decides final order;
- owns a planning horizon.

Policies may express constraints and rationale, but they remain proposals.

### 11.3 Sequencing leakage

A behaviour has leaked from Sequencing into Interpretation when Sequencing:

- derives educational meaning from raw evidence;
- reclassifies learner state;
- invents an interpretation to justify its decision.

Sequencing may consume interpretations and candidate interventions. It must not recreate them.

### 11.4 Representation leakage

A behaviour crosses the Representation Boundary when audience wording begins to alter:

- educational meaning;
- candidate intervention eligibility;
- intervention priority;
- authoritative sequencing decisions.

Presentation must follow the educational decision, not determine it.

## 12. Architectural Invariants

The following invariants are accepted for Release 0.8:

1. Educational Interpretation owns educational meaning.
2. Interpretation shall not select or recommend interventions.
3. Educational Policy produces candidate educational interventions.
4. Policy shall not assume that its candidate will be enacted.
5. Multiple independently valid policies may coexist.
6. Educational Sequencing owns arbitration among candidate interventions.
7. Educational Sequencing produces the authoritative educational decision.
8. Planning horizon is part of Sequencing behaviour, not a separate conceptual responsibility.
9. Sequencing shall not derive educational meaning directly from raw evidence.
10. Representation lies outside the Educational Intelligence Core.
11. Audience-specific wording shall not alter educational meaning or educational decisions.
12. Artificial intelligence shall not become the authoritative source of Interpretation, Policy or Sequencing.
13. Every authoritative educational decision must remain explainable and traceable to evidence, interpretation, policy and sequencing rationale.
14. Behavioural interaction evidence remains observational until a specific educational interpretation is justified.

## 13. Completeness Review

The review considered whether further architectural responsibilities were required for:

- planning;
- arbitration;
- communication;
- explanation;
- behavioural evidence;
- AI support;
- outcome evaluation.

**Planning** — Covered by Educational Sequencing.

**Arbitration** — Covered by Educational Sequencing.

**Communication** — Outside the Core; deferred to TDS-008C.

**Explanation** — Explainability is a required property of the decision chain. It does not currently require a separate architectural responsibility.

**Behavioural evidence** — Handled as a possible evidence source subject to explicit justification.

**AI support** — AI may support representation and explanation but does not own educational judgement.

**Outcome evaluation** — Evaluation of intervention effectiveness is not established by the current evidence and remains outside Release 0.8's Educational Intelligence Core.

No additional conceptual responsibility is admitted by this review.

## 14. Risks

**Risk 1 — Policy regains final authority**
A policy implementation may appear simpler if it emits final decisions.
Mitigation: Require all policy outputs to be represented as candidates and routed through Sequencing.

**Risk 2 — Sequencing becomes a mechanical scheduler**
If Policy effectively decides everything, Sequencing may become a rubber stamp.
Mitigation: Sequencing must own arbitration and the authoritative decision.

**Risk 3 — Sequencing reinterprets evidence**
A sequencing implementation may read raw mastery or event data directly for convenience.
Mitigation: Require educational meaning to enter Sequencing through Interpretation and Policy outputs.

**Risk 4 — Presentation affects educational judgement**
Parent or learner wording may begin to influence decision logic.
Mitigation: Maintain the Representation Boundary and test representations against stable authoritative decisions.

**Risk 5 — Behavioural data is over-interpreted**
Interaction events may be treated as evidence of ability, motivation or understanding without sufficient justification.
Mitigation: Keep events observational by default and require individual signal admission.

**Risk 6 — Horizon-specific implementations diverge**
Daily mission selection and longer-horizon planning may develop separate rules and duplicate policy logic.
Mitigation: Require all horizons to use the same Sequencing responsibility and candidate-policy contracts.

## 15. Technical Design Entry Criteria

TDS-008A may proceed when it:

- allocates behaviour only among Interpretation, Policy and Sequencing;
- treats Policy outputs as candidate interventions;
- assigns authoritative decision ownership to Sequencing;
- treats planning horizon as part of Sequencing;
- excludes Representation from its responsibility-allocation table;
- defines explicit inputs, outputs and invariants for each responsibility;
- preserves traceability from evidence to authoritative decision;
- prevents direct raw-evidence access where it would bypass Interpretation;
- defines how competing candidates are presented to Sequencing;
- defines how sequencing rationale is recorded or reconstructed;
- treats behavioural-event-derived signals as unapproved unless separately justified;
- avoids introducing implementation components as new architectural concepts.

## 16. Review Outcome

The proposed Release 0.8 architecture is accepted as:

```
Evidence
    ↓
Signals
    ↓
Educational Interpretation
    ↓
Candidate Educational Interventions
    ↓
Educational Sequencing
    ↓
Authoritative Educational Decision
    ↓
Representation Boundary
    ↓
Educational Representation
```

Within the Educational Intelligence Core, three conceptual responsibilities are accepted:

- Educational Interpretation;
- Educational Policy;
- Educational Sequencing.

No separate Learning Planner is admitted.

Representation remains outside the Core.

Behavioural interaction evidence remains observational unless a specific educational interpretation is separately justified.

The architecture is sufficiently stable for TDS-008A to begin responsibility allocation and detailed technical design.

## 17. Editorial Consistency Finding

PRS-008's Educational Intelligence Model diagram labelled the output of Educational Policy as "Candidate Educational Policies," inconsistent with Principle 5's "candidate interventions" in the same document. This review concludes the correct architectural term is Candidate Educational Interventions, consistent with Principle 5 and the responsibility model accepted in §6.2. This was corrected as a narrowly-scoped follow-up editorial amendment to PRS-008 (no architectural content changed) prior to this review's acceptance.

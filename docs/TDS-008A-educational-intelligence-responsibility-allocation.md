# TDS-008A — Educational Intelligence Responsibility Allocation

**Status**: Accepted
**Date**: 2026-07-29
**Scope**: Technical responsibility allocation for the Release 0.8 Educational Intelligence Core, implementing the conceptual responsibilities accepted in ADR-0006, the product requirements defined in PRS-008, and the architectural boundaries validated in AR-008.

---

## 1. Purpose

This document allocates behavioural ownership among the accepted Educational Intelligence responsibilities.

It specifies:

- which behaviour belongs to each responsibility;
- the permitted inputs and outputs of each responsibility;
- the guarantees each responsibility shall provide;
- the behaviours each responsibility is explicitly forbidden from owning;
- the technical constraints required to preserve the architectural invariants accepted in AR-008.

This document does not introduce new conceptual responsibilities.

Concept admission is governed by DDS-001.

Concept selection is recorded by ADR-0006.

Product capability is defined by PRS-008.

Architectural sufficiency is established by AR-008.

This document allocates technical responsibility within those accepted architectural boundaries.

---

## 2. Scope

### In Scope

This document allocates responsibility for:

- Educational Interpretation;
- Educational Policy;
- Educational Sequencing;
- the contracts between those responsibilities;
- behavioural ownership;
- responsibility boundaries;
- implementation constraints required to preserve those boundaries.

### Out of Scope

This document does not specify:

- Educational Representation;
- audience-specific communication;
- user-interface behaviour;
- persistence models;
- software components;
- service decomposition;
- APIs;
- algorithms;
- artificial intelligence implementation;
- infrastructure.

Educational Representation remains beyond the Representation Boundary established in ADR-0006 and AR-008 and is deferred to TDS-008C.

---

## 3. Responsibility Allocation Principles

The following principles govern all responsibility allocation within the Educational Intelligence Core.

### Principle 1 — Single Behaviour Ownership

Every behavioural responsibility shall have exactly one owner.

If a behaviour cannot be allocated to exactly one responsibility, the allocation is incomplete.

If more than one responsibility owns the same behaviour, the allocation is incorrect.

---

### Principle 2 — Explicit Responsibility Contracts

Every responsibility shall expose:

- explicit inputs;
- explicit outputs;
- owned behaviours;
- guarantees;
- forbidden behaviours.

Responsibilities shall communicate only through those explicit contracts.

No responsibility shall depend upon hidden state owned by another responsibility.

---

### Principle 3 — Upstream Dependency Only

Responsibilities may consume only the outputs explicitly exposed by upstream responsibilities.

Educational Interpretation consumes learner evidence and educational signals.

Educational Policy consumes Educational Interpretation.

Educational Sequencing consumes candidate educational interventions together with the selected planning horizon.

No responsibility may bypass another responsibility by reading data that belongs outside its declared contract.

---

### Principle 4 — Architectural Invariant Preservation

Responsibility allocation shall preserve every architectural invariant accepted by AR-008.

Technical implementation shall not weaken, merge or redistribute conceptual responsibilities accepted by ADR-0006.

---

### Principle 5 — No Conceptual Expansion

Technical design shall not introduce additional conceptual responsibilities.

Where implementation requires software components, services or data structures, those implementations shall realise the accepted conceptual responsibilities rather than replacing or subdividing them.

Any proposal requiring a new conceptual responsibility shall satisfy DDS-001's Architectural Admission Rule before inclusion in the architecture.

---

## 4. Educational Interpretation

### Purpose

Educational Interpretation owns educational meaning.

Its responsibility is to derive reusable educational interpretations from learner evidence independently of any educational intervention.

Interpretation answers:

> What is educationally true?

It does not answer:

> What should happen because of it?

That responsibility belongs to Educational Policy.

### Inputs

Educational Interpretation may consume:

- learner evidence;
- educational signals derived from learner evidence.

Educational Interpretation shall not consume:

- candidate educational interventions;
- sequencing decisions;
- audience-specific representations.

### Outputs

Educational Interpretation produces:

- Educational Interpretation.

The interpretation shall represent educational meaning only.

It shall not encode educational intervention.

It shall not encode sequencing.

It shall not encode presentation.

### Owned Behaviours

Educational Interpretation owns:

- interpretation of learner evidence;
- classification of educational state;
- derivation of reusable educational meaning;
- educational conclusions that may support more than one policy.

### Guarantees

Educational Interpretation shall guarantee that:

- identical educational evidence produces identical educational interpretation;
- interpretation remains independent of educational intervention;
- interpretation is explainable;
- interpretation is reusable across multiple educational policies;
- interpretation may exist without any policy having yet been applied.

### Forbidden Behaviours

Educational Interpretation shall not:

- recommend interventions;
- create candidate educational interventions;
- prioritise interventions;
- reconcile competing interventions;
- allocate planning horizons;
- determine educational sequencing;
- produce authoritative educational decisions;
- generate audience-specific wording;
- perform presentation.

### Acceptance Checklist

Educational Interpretation satisfies this specification only if:

- all educational meaning originates here;
- no intervention recommendation originates here;
- outputs remain reusable by multiple independent policies;
- no downstream behaviour is required for an interpretation to exist;
- implementation remains consistent with the architectural boundaries accepted in AR-008.

---

## 5. Educational Policy

### Purpose

Educational Policy owns educational intervention.

Its responsibility is to determine which educational interventions are appropriate for a given Educational Interpretation.

Educational Policy answers:

> What educational interventions are appropriate?

It does not answer:

> Which intervention shall actually occur?

That responsibility belongs to Educational Sequencing.

Educational Policy is intentionally non-authoritative. It proposes candidate educational interventions that remain subject to reconciliation by Educational Sequencing.

### Inputs

Educational Policy may consume:

- Educational Interpretation.

Educational Policy shall not consume:

- raw learner evidence;
- educational signals;
- authoritative educational decisions;
- audience-specific representations.

### Outputs

Educational Policy produces:

- Candidate Educational Interventions.

Each candidate educational intervention shall represent a complete policy proposal.

A candidate educational intervention may include:

- educational rationale;
- intervention eligibility;
- intervention priority or strength where educationally justified;
- policy-specific constraints.

These properties form part of the candidate intervention contract exposed to Educational Sequencing.

Educational Policy shall not produce:

- authoritative educational decisions;
- educational sequencing;
- audience-specific presentation.

### Owned Behaviours

Educational Policy owns:

- determining intervention eligibility;
- determining educational rationale;
- expressing candidate intervention priority where justified;
- expressing policy-specific constraints;
- producing independently valid candidate educational interventions.

### Guarantees

Educational Policy shall guarantee that:

- identical Educational Interpretations produce identical candidate educational interventions;
- multiple independently valid candidate educational interventions may coexist;
- every candidate educational intervention is independently explainable;
- every candidate educational intervention is independently traceable to Educational Interpretation;
- no candidate educational intervention is authoritative.

### Forbidden Behaviours

Educational Policy shall not:

- interpret raw learner evidence;
- derive educational meaning independently;
- suppress competing candidate educational interventions;
- reconcile competing candidate educational interventions;
- allocate planning horizons;
- determine execution order;
- produce authoritative educational decisions;
- generate audience-specific wording;
- perform presentation.

### Acceptance Checklist

Educational Policy satisfies this specification only if:

- all intervention proposals originate here;
- multiple valid candidate educational interventions may exist simultaneously;
- no authoritative educational decision originates here;
- all outputs remain consumable by Educational Sequencing;
- implementation remains consistent with the architectural boundaries accepted in AR-008.

---

## 6. Educational Sequencing

### Purpose

Educational Sequencing owns authoritative educational decision-making.

Its responsibility is to reconcile multiple valid candidate educational interventions into one coherent educational decision for the selected planning horizon.

Educational Sequencing answers:

> Given all appropriate candidate educational interventions, what shall actually happen within the selected planning horizon?

Educational Sequencing does not determine educational meaning.

Educational Sequencing does not create educational policy.

### Inputs

Educational Sequencing may consume:

- Candidate Educational Interventions;
- Planning Horizon.

Educational Sequencing shall not consume:

- raw learner evidence;
- educational signals;
- Educational Interpretation;
- audience-specific representations.

### Outputs

Educational Sequencing produces:

- Authoritative Educational Decision.

The Authoritative Educational Decision shall represent:

- the selected educational intervention set;
- reconciliation of competing candidate educational interventions;
- execution ordering;
- pacing across the selected planning horizon;
- sequencing rationale sufficient to support explainability.

Educational Sequencing shall not produce:

- audience-specific wording;
- presentation.

### Owned Behaviours

Educational Sequencing owns:

- reconciliation of competing candidate educational interventions;
- authoritative educational decision-making;
- execution ordering;
- educational pacing;
- planning-horizon allocation;
- balancing support, review, curriculum coverage and challenge.

### Guarantees

Educational Sequencing shall guarantee that:

- identical candidate educational interventions and planning horizon produce identical authoritative educational decisions;
- every authoritative educational decision is traceable to its candidate educational interventions;
- every authoritative educational decision is explainable;
- planning horizon influences sequencing behaviour without altering educational meaning;
- authoritative educational decisions remain independent of audience-specific representation.

### Forbidden Behaviours

Educational Sequencing shall not:

- interpret raw learner evidence;
- derive educational meaning;
- create candidate educational interventions;
- modify educational rationale belonging to Educational Policy;
- generate audience-specific wording;
- perform presentation.

### Acceptance Checklist

Educational Sequencing satisfies this specification only if:

- all authoritative educational decisions originate here;
- reconciliation occurs only after candidate educational interventions have been produced;
- planning horizon influences sequencing behaviour only;
- no educational meaning is derived within Sequencing;
- implementation remains consistent with the architectural boundaries accepted in AR-008.

---

## 7. Behaviour Allocation Matrix

The Behaviour Allocation Matrix is the normative allocation of behavioural ownership within the Educational Intelligence Core.

Every educational behaviour shall have exactly one owning responsibility.

No behaviour may be owned by multiple responsibilities.

Supporting another responsibility does not constitute ownership.

Every behaviour explicitly owned by a responsibility contract in Sections 4–6 shall appear exactly once below.

| Behaviour                                                                | Educational Interpretation | Educational Policy | Educational Sequencing |
| ------------------------------------------------------------------------ | :------------------------: | :----------------: | :--------------------: |
| Derive educational meaning                                               |             ✓              |                    |                        |
| Classify educational state                                               |             ✓              |                    |                        |
| Interpret educational signals                                            |             ✓              |                    |                        |
| Produce Educational Interpretation                                       |             ✓              |                    |                        |
| Determine intervention eligibility                                       |                            |         ✓          |                        |
| Determine educational rationale                                          |                            |         ✓          |                        |
| Produce candidate educational interventions                              |                            |         ✓          |                        |
| Express intervention priority                                            |                            |         ✓          |                        |
| Express policy-specific constraints                                      |                            |         ✓          |                        |
| Reconcile competing candidate interventions                              |                            |                    |           ✓            |
| Balance competing educational needs within the selected planning horizon |                            |                    |           ✓            |
| Select authoritative educational intervention set                        |                            |                    |           ✓            |
| Allocate planning horizon                                                |                            |                    |           ✓            |
| Determine execution ordering                                             |                            |                    |           ✓            |
| Determine educational pacing                                             |                            |                    |           ✓            |
| Produce Authoritative Educational Decision                               |                            |                    |           ✓            |

The ownership defined by this matrix is authoritative.

The responsibility contracts defined in Sections 4–6 explain the behavioural ownership established here and shall not redefine it.

---

## 8. Cross-Responsibility Invariants

The Educational Intelligence Core shall preserve the following architectural invariants.

### 8.1 Single Behaviour Ownership

Each educational behaviour shall belong to exactly one responsibility.

Ownership shall not be shared.

### 8.2 Unidirectional Responsibility Flow

Responsibilities shall interact only through published responsibility outputs.

Educational Interpretation produces Educational Interpretation.

Educational Policy consumes Educational Interpretation and produces Candidate Educational Interventions.

Educational Sequencing consumes Candidate Educational Interventions and the selected Planning Horizon, and produces the Authoritative Educational Decision.

Responsibilities shall not bypass intermediate responsibility contracts.

### 8.3 Interpretation Independence

Educational Interpretation shall remain independent of educational intervention.

Interpretation shall not depend upon Educational Policy or Educational Sequencing.

### 8.4 Policy Independence

Educational Policy shall determine appropriate educational interventions without determining which intervention shall become authoritative.

Multiple valid candidate educational interventions may coexist.

### 8.5 Sequencing Authority

Only Educational Sequencing may produce the Authoritative Educational Decision.

No upstream responsibility shall determine educational sequencing behaviour.

### 8.6 Representation Separation

Representation is outside the Educational Intelligence Core.

No responsibility defined within this specification shall generate audience-specific wording or presentation.

### 8.7 Explainability

Every Authoritative Educational Decision shall be traceable through:

- Candidate Educational Interventions;
- Educational Interpretation;
- learner evidence;
- sequencing rationale.

### 8.8 Deterministic Responsibility Contracts

Given identical responsibility inputs, each responsibility shall produce identical outputs.

Responsibility behaviour shall not depend upon presentation concerns or implementation-specific state.

---

## 9. Technical Design Constraints

Implementations conforming to this specification shall preserve the responsibility contracts defined in Sections 4–6.

Implementation details may vary provided they do not alter behavioural ownership.

The following implementation characteristics are intentionally unspecified by this document:

- programming language;
- deployment architecture;
- persistence strategy;
- AI provider selection;
- prompt implementation;
- orchestration technology;
- infrastructure.

Implementation shall not merge responsibilities in a manner that obscures behavioural ownership.

Implementation may optimise execution provided that externally observable responsibility behaviour remains unchanged.

---

## 10. Implementation Entry Criteria

Implementation work may begin only when all of the following conditions are satisfied.

- Responsibility ownership is completely allocated.
- Responsibility inputs and outputs are explicitly defined.
- Responsibility guarantees are testable.
- Forbidden behaviours are explicit.
- Cross-responsibility invariants are preserved.
- No responsibility owns behaviour allocated elsewhere.
- Responsibility contracts remain consistent with DDS-001, ACB-001, ADR-0006, PRS-008 and AR-008.

Completion of this specification establishes the behavioural allocation required for subsequent implementation-oriented technical design documents.

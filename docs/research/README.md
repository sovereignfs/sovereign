# Research index

Status at a glance for all Sovereign research notes. Open the individual file
for full findings, sources, and open questions.

## What a research doc is

A research doc is the stage **before** an RFC: an open-ended technical or
strategic question that doesn't yet have a concrete proposal. It captures
findings, current-state facts (with `file:line` references), options
considered, and a recommendation — but it does not commit to a design the way
an RFC does. Research docs are internal (unpublished — see
[documentation-structure.md](../documentation-structure.md)); they are working
notes, not a public decision record.

**Pipeline:** `docs/research/` (exploration) → `docs/rfcs/` (accepted design)
→ `docs/epics/` (scheduled task). A research doc graduates into one or more
RFCs once its recommendation is concrete enough to design against; it is not
deleted afterward — keep it as the decision trail and have the resulting
RFC(s) reference it back via their "Current state" or "Motivation" section.

Not every research doc produces an RFC. Some conclude "not now" or "rejected"
— that's a valid, useful outcome; record it rather than losing the reasoning.

Proposing one? Copy [`TEMPLATE.md`](TEMPLATE.md) to `NNNN-short-slug.md`, fill
it in, and add a row below.

| Doc                                                   | Title                                                    | Status      | Graduated to                                          |
| ----------------------------------------------------- | -------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| [0001](0001-enterprise-architecture-assessment.md)    | Enterprise-grade architecture feasibility                | Exploratory | Superseded in part by 0002                            |
| [0002](0002-multi-tenancy-vs-federation-direction.md) | Multi-tenancy vs. multi-instance federation              | Decided     | Direction confirmed — no RFC yet                      |
| [0003](0003-horizontal-scaling-strategy.md)           | Horizontal scaling strategy (DB, storage, orchestration) | Exploratory | Pending RFCs for libSQL dialect + shared file storage |

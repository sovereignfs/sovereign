<!--
Workstream template. Copy this file to `NNNN-short-slug.md` (next unused
4-digit number — check the highest in README.md), fill it in, and add a row to
README.md. Delete these comments.

A workstream sequences the adoption paths of already-accepted RFCs across
epics. If the design is not settled enough to sequence, write an RFC (or a
research doc) first.

Keep task detail in `docs/epics/<file>.md` and reference epic task IDs here —
never duplicate a task spec. Prettier governs formatting; run `pnpm format`.
-->

# Workstream NNNN — <Title>

**Status:** 📋 Planned\
**Date:** <Month Year>\
**Author:** <name or handle>\
**Goal owner:** <who decides this is done>\
**RFCs:** <the RFCs this sequences>\
**Epics touched:** <e.g. 2 (Platform Shell), 3 (Plugins Runtime), 20 (Mobile)>\
**Research:** <the research doc behind it, if any>

---

## Goal

One paragraph. What exists at the end that does not exist now — in product
terms, not task terms.

## Definition of done

Checkable conditions. The workstream is over when all of these hold.

- [ ] …
- [ ] …

## Decisions locked

The settled choices, **and the alternatives that were rejected**, so they are
not reopened mid-execution. This section is what makes the workstream
autonomously executable — an agent running it cannot see the conversation that
produced it.

| Decision | Choice | Rejected alternative and why |
| -------- | ------ | ---------------------------- |
|          |        |                              |

## Prerequisites

What must be true before leg 1 starts, including work owned elsewhere (another
workstream, another repo, an external dependency). Say who owns each.

## Legs

| Leg | Name | Epic tasks | Epics | Gate? | Done when |
| --- | ---- | ---------- | ----- | ----- | --------- |
| 1   |      |            |       |       |           |

Each leg is one branch, one draft PR, one review gate. The agent runs
uninterrupted within a leg and stops at its end. See
[README.md](README.md#the-leg-contract).

## Leg detail

### Leg 1 — <name>

**Epic tasks:** <IDs, in execution order>

**Why this leg is first:** …

**Technical notes:** cross-cutting context that is not in any single task spec —
constraints, file references, patterns to reuse, interactions to watch.

**Do not proceed if:** the conditions under which this leg should stop and
escalate rather than push on.

_(Repeat per leg.)_

## Risks

Known sharp edges, including any already discovered during design. Prefer
specifics with `file:line` references over general caution.

## Kill criteria

What outcome stops this workstream, and what survives if it does — a
workstream that dies partway should leave shipped, coherent value behind, not
half a feature.

## Changelog

| Version | Date | Change        |
| ------- | ---- | ------------- |
| 0.1     |      | Initial draft |

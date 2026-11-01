<!--
Workstream template. Copy this file to `NNNN-short-slug.md` (the next unused number in README.md), fill it in, and add a row to
README.md's index. Delete these comments.

Task detail stays in `docs/epics/<file>.md`: refer to epic task IDs here and never restate a task. Prettier governs formatting.
-->

# Workstream NNNN — <Title>

**Status:** 📋 Planned\
**Date:** <Month Year>\
**Author:** <name or handle>\
**Goal owner:** <who decides this is done>\
**Governs:** <the RFCs, specs and epics it sequences>\
**Research:** <the research doc behind it, if any>

---

## Goal

One paragraph: what exists at the end that does not exist now, in product terms.

## Definition of done

- [ ] …

## Decisions locked

The settled choices and the alternatives that were rejected, so they are not reopened mid-run. An agent running the workstream cannot
see the conversation that produced it.

| Decision | Choice | Rejected alternative and why |
| -------- | ------ | ---------------------------- |
|          |        |                              |

## Prerequisites

What must be true before leg 1 starts, and who owns each.

## Legs

| Leg | Name | Epic tasks | Gate? | Done when |
| --- | ---- | ---------- | ----- | --------- |
| 1   |      |            |       |           |

One leg is one branch, one draft PR, one review gate ([README](README.md#legs)).

## Leg detail

### Leg 1 — <name>

**Epic tasks:** <IDs, in order>

**Why here:** …

**Technical notes:** context no single task holds: files, patterns to reuse, interactions to watch.

**Do not proceed if:** when to stop and ask rather than push on.

## Risks

Known sharp edges, with file references where they exist.

## Kill criteria

What stops the workstream, and what shipped value survives if it does.

## Changelog

| Version | Date | Change        |
| ------- | ---- | ------------- |
| 0.1     |      | Initial draft |

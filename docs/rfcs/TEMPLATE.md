<!--
RFC template. Copy this file to `NNNN-short-slug.md` (next unused 4-digit number —
check the highest in README.md; withdrawn numbers are not reused), fill it in, and
add a row to README.md. Keep the section skeleton below; delete sections that
genuinely don't apply (e.g. "UI flows" for a non-UI change) and delete these
comments. Match the prose style of an existing RFC (0008 and 0013 are good
examples). Prettier governs formatting — run `pnpm format` before opening the PR.
-->

# RFC NNNN — <Title>

**Status:** Draft\
**Date:** <Month Year>\
**Author:** <your name or handle>\
**Scope:** <the packages / apps / docs this touches, comma-separated; note any RFCs it builds on or amends>\
**Incorporated into plan:** No — documentation-first. <One line on what this RFC does and does not commit to; e.g. design only, scheduling/SRS IDs deferred.>

---

## Summary

One or two paragraphs: what this proposes and why it matters, in plain terms.
Lead with the change, not the background.

## Motivation

The problem or gap this addresses. What is broken, missing, or awkward today, and
who feels it. Tie it to Sovereign's positioning (self-hosted, privacy-first,
plugin-first) where relevant.

## Current state (what this builds on)

The concrete facts the design rests on — existing code, conventions, prior RFCs —
with `file:line` references so reviewers can verify. Be accurate; don't assume.

## Proposed design

The substance. Use subsections for distinct parts. Reference existing patterns and
utilities to reuse rather than reinventing. Call out any load-bearing constraints
(SDK boundary, dialect-agnostic DB, no-default secrets, route composition, CSP,
etc.). Flag Docker/config/docs impact if there is any.

## UI flows

_(Delete if not a UI change.)_ Step-by-step user-facing flows; a small ASCII
sketch or state diagram helps.

## Alternatives considered

The options you rejected and why. This is where reviewers spend their time — be
honest about tradeoffs.

## Open questions

Unresolved decisions, proposed-but-unassigned requirement IDs, and anything you
want feedback on before implementation.

## Adoption path

How this ships: documentation-first now; what lands when scheduled; phasing if any.
Note semver impact for any published-package (`@sovereignfs/sdk` / `@sovereignfs/ui`)
or manifest change.

## Changelog

| Version | Date         | Change        |
| ------- | ------------ | ------------- |
| 0.1     | <Month Year> | Initial draft |

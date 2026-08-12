# Workstream 0016 — Mobile native capabilities remaining

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0058](../rfcs/0058-native-mobile-app-shell.md) (leg 1 only)\
**Epics touched:** 20 (Mobile App Shell)

> **Scope correction made while drafting this workstream:** the developer
> asked for a workstream covering 20.6 (camera), 20.7 (biometric auth), 20.8
> (haptics), and 20.9 (background capability planning) — all four still
> showed `📋` in this repo's `ROADMAP.md` and `docs/epics/mobile.md`.
> Checking `sovereign-mobile`'s own `ROADMAP.md` and `docs/epics/bridge.md`
> found 20.6 and 20.7 already shipped (commits `5defa1c`, `463bd6c`,
> 2026-08-08/09) and 20.8 already closed as subsumed by Task 20.3 (the
> bridge adapter shipped haptics as part of its own thin slice — see that
> repo's changelog entry for 0.2). This repo's copies were stale, the same
> class of cross-repo status-lag bug found in an earlier session on this
> workspace. Corrected to ✅ in `ROADMAP.md` and `docs/epics/mobile.md` in
> the same change that created this file. **Only 20.9 is actually open** —
> this workstream is scoped to that one task rather than the four
> originally listed.

---

## Goal

Produce the design decision Task 20.9 exists to make: whether and how native
background location or background work belongs in Sovereign, before any
high-risk background permission is ever requested from a user. At the end:
a follow-up RFC or design note exists covering store-review/privacy
analysis, a capability-gating model for plugins that want background
behavior, and a consent/revocation model — or an explicit decision that
background capability is out of scope for the foreseeable roadmap.

## Definition of done

- [ ] A follow-up RFC or design note exists for background location and
      background work.
- [ ] Store-review and privacy analysis is recorded for both iOS and
      Android.
- [ ] A capability-gating model for plugins requesting background behavior
      is defined.
- [ ] An operator/user consent and revocation model is defined.
- [ ] A decision is recorded on whether background work is handled by
      mobile-shell APIs, platform jobs (Task 3.16, if it lands first),
      plugin jobs, or some combination.

## Decisions locked

| Decision                   | Choice                                                                                                                                                                                                                         | Rejected alternative and why                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                      | Only Task 20.9                                                                                                                                                                                                                 | Keeping 20.6/20.7/20.8 as legs of this workstream — rejected; they're already shipped in `sovereign-mobile`, confirmed against that repo's own `ROADMAP.md`/`docs/epics/bridge.md`. Carrying them as legs here would create three phantom "done on creation" legs and misrepresent this workstream's actual size |
| This repo's status records | Corrected 20.6/20.7/20.8 to ✅ in `ROADMAP.md` and `docs/epics/mobile.md`, in the same change                                                                                                                                  | Leaving them `📋` and just noting the discrepancy in prose — rejected; per this session's own established pattern (the RFC-status-sync rule added to `CLAUDE.md` earlier), a known-wrong status marker gets fixed when found, not just annotated                                                                 |
| Relationship to Task 3.16  | 20.9's own "handled by ... platform jobs" question may resolve differently depending on whether [workstream 0015](0015-plugin-extensibility-surface.md)'s Task 3.16 (plugin background jobs) has shipped by the time this runs | Sequencing this workstream strictly after workstream 0015 — rejected as an unnecessary hard gate; 20.9 is a design/research task, not an implementation task, and can reason about "if 3.16 ships" as a decision input without requiring it to have shipped first                                                |
| Workstream vs. single task | Kept as a one-leg workstream rather than folded into an existing one (e.g. 0002 or 0003, which already touch mobile epic tasks)                                                                                                | Folding into workstream 0002/0003 — rejected; those are both further along or already done, and 20.9 is a standalone design question with its own definition of done, not a leg that fits either workstream's existing goal statement                                                                            |

## Prerequisites

None blocking. This is a design/research task; it can start immediately.

## Legs

| Leg | Name                           | Epic tasks | Epics | Gate? | Done when                                                               |
| --- | ------------------------------ | ---------- | ----- | ----- | ----------------------------------------------------------------------- |
| 1   | Background capability planning | 20.9       | 20    | No    | A design record exists covering the five Definition of done items above |

## Leg detail

### Leg 1 — Background capability planning

**Epic tasks:** 20.9

**Technical notes:**

- This is a design/research leg, not an implementation leg — its "Done when"
  is a written record, not shipped code. Follow this repo's
  research-as-design convention (`docs/documentation-structure.md`) if the
  output ends up settled enough to skip a full RFC.
- iOS and Android have materially different background-execution models and
  App/Play Store review postures — the analysis needs to cover both
  natively, not extrapolate one to the other.
- Explicitly weigh whether Task 3.16 (plugin background jobs, workstream 0015) already covers the "background work" half of this question for
  plugin-initiated work, leaving this task to focus on device-level
  background _location_ and OS-level background execution specifically —
  the two are easy to conflate but need different consent models.

**Do not proceed if:** N/A — a leg whose entire output is a decision record
cannot "fail" in the blocking sense; if the honest conclusion is "not now,"
that is a valid, complete answer.

## Risks

- **Background location is one of the highest App/Play Store review-risk
  surfaces available** — an under-researched decision here could commit
  the roadmap to a permission model that fails store review later. Treat
  the store-review analysis as the load-bearing deliverable, not a
  formality.
- **Low risk otherwise** — this leg produces no shipped code.

## Kill criteria

If the research concludes background capability isn't worth the store-review
and privacy cost for the foreseeable roadmap, that is a complete, successful
outcome — record the decision and its reasoning so the question doesn't get
silently re-opened without new information.

## Changelog

| Version | Date        | Change                                                                                                                                                                                 |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — scoped to Task 20.9 only after finding 20.6/20.7/20.8 already shipped in `sovereign-mobile`; those three corrected to ✅ in this repo's own records in the same change |

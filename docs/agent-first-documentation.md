# Agent-First Documentation: A Case Study in Structuring a Codebase for AI-Assisted Development

Most software projects accumulate documentation for humans. It is written in long-form prose, organised chronologically, and navigated with Cmd+F. When AI coding agents arrived, we handed them those same documents — and wondered why they kept losing context, re-reading irrelevant history, and drifting off course mid-task.

This is a case study of restructuring the documentation for [Sovereign](https://github.com/sovereignfs/sovereign) — a modular, self-hostable workspace runtime — to work agent-first. The goal was not to make documentation worse for humans, but to make it measurably better for agents without sacrificing human readability. We measured the results at each stage.

---

## The problem: documentation shaped for humans, used by agents

Sovereign's working state was captured in two files:

- **`CLAUDE.md`** (~400 lines) — conventions, architectural rules, active task pointer
- **`docs/roadmap.md`** (~2,400 lines) — every task in the project, in chronological phase order, each with a full prose entry: Goal, Deliverables, SRS reference, Review checklist

The roadmap was the single source of truth. To start a task, an agent read it cover to cover. To check the review checklist mid-task, it read it again. To find related work in a domain, it scanned the full 2,400 lines looking for scattered mentions. The document was well-structured for a human reading it once — it was expensive for an agent reading it ten times a session.

Measuring the cost is straightforward. At roughly 15 tokens per line:

| Operation                                         | Lines read | Approximate tokens |
| ------------------------------------------------- | ---------- | ------------------ |
| Session start — orient and find next task         | ~2,800     | ~42,000            |
| Mid-task context refresh ("what's my checklist?") | ~2,400     | ~36,000            |
| Domain overview ("what are all the auth tasks?")  | ~2,400     | ~36,000            |

Every agent session started with a ~42,000-token orientation pass. At Claude Sonnet input pricing that is roughly $0.13 per session start. More importantly, those 42,000 tokens filled the context window with phases, tasks, and domains that had nothing to do with the current work.

---

## Refactor 1: domain-first epics + a compact roadmap

The first structural change introduced a layer between the roadmap and the task detail.

### What we built

**16 domain epic files** in `docs/epics/`, each collecting all tasks for a domain regardless of when they shipped. Infrastructure, Users & Auth, Platform Shell, Plugins Runtime, Theming, and so on. Each epic file contains full task entries — Goal, Deliverables, SRS reference, Review checklist — using a stable task ID scheme (`<epic>.<seq>`) independent of roadmap version numbers.

**A compact roadmap** reduced to a version-indexed table: one row per PR, with a link to the canonical task entry in the relevant epic file. 139 lines instead of 2,412.

```
CLAUDE.md                  ← session entry point; ⏳ Next pointer; conventions
    │
    └─▶ docs/roadmap.md    ← 139-line chronological index
            │
            └─▶ docs/epics/<epic>.md   ← full task detail, loaded on demand
```

The key insight is that agents — like humans — should only load what they need. An agent working on email templates does not need to read about monorepo scaffolding, Postgres validation, and the icon system first.

### The `CURRENT_TASK.md` mechanism

Domain-grouping helps with planning and orientation, but it still requires a navigation hop: roadmap → find epic → read task block. For the most frequent operation — "what am I building right now?" — we added `CURRENT_TASK.md`: a transient file written to the repo root by the `/sv-task-start` skill and deleted by `/sv-task-complete`.

```markdown
# Current Task

**Epic task:** 9.9
**Roadmap version:** 0.9.1
**Branch:** feat/email-templates
**Epic file:** docs/epics/theming.md

---

#### ⏳ 9.9 — Email template system + White-labeling Phase 2

**Goal:** …
**Deliverables:** …
**Review checklist:** …
```

Any agent or sub-agent working on the current task reads this one file. No roadmap scan. No epic navigation. The full spec, assembled once at task-start, available instantly for the rest of the session.

### Measured results after Refactor 1

| Operation                                 | Before             | After             | Reduction        |
| ----------------------------------------- | ------------------ | ----------------- | ---------------- |
| Session start (CURRENT_TASK.md exists)    | ~42,000 tokens     | ~7,000 tokens     | **84%**          |
| Session start (fresh, no CURRENT_TASK.md) | ~42,000 tokens     | ~9,300 tokens     | **78%**          |
| Mid-task context refresh                  | ~36,000 tokens     | ~750 tokens       | **98%**          |
| Domain overview                           | ~36,000 tokens     | ~5,500 tokens     | **85%**          |
| Task completion writes                    | 3 writes (complex) | 2 writes + delete | **1 fewer**      |
| Total documentation corpus                | ~2,900 lines       | ~3,600 lines      | +24% (by design) |

The corpus grew because all the task prose that lived in the roadmap now lives in epic files. That is intentional — it is loaded on demand rather than all at once. The 24% growth is the cost of the structure.

The 98% reduction on mid-task refreshes is striking. It happens because `CURRENT_TASK.md` is purpose-built for that use case — 50 lines of exactly what the agent needs, nothing else.

---

## Refactor 2: role-based agents for the task lifecycle

The workflow refactor addressed context load. The second change addressed context _quality_ — specifically, what the main implementation agent has to process that it should not.

### The problem with a monolithic task-complete flow

After implementation, the current agent ran the full check suite, processed the output, updated two documentation files, bumped versions, and drafted the PR description — sequentially, in the same context window. Raw typecheck output (98 lines in this project, hundreds in larger ones) sat in context while the agent tried to write a coherent PR description. Documentation updates context-switched the agent away from the implementation it was about to summarise.

### Three focused role agents

We introduced three skill files, each a standalone agent brief:

**`/sv-verify`** — reads `CURRENT_TASK.md`, runs `format:check`, `lint`, `typecheck`, `test`, `build`, and optionally docs-parity. Returns a structured pass/fail table, not raw output:

```
| Check        | Result   | Notes              |
|--------------|----------|--------------------|
| format:check | ✅ PASS  | —                  |
| lint         | ✅ PASS  | —                  |
| typecheck    | ✅ PASS  | —                  |
| test         | ✅ PASS  | 47 tests passed    |
| build        | ✅ PASS  | —                  |
```

**`/sv-update-task-docs`** — reads `CURRENT_TASK.md` for metadata, marks the roadmap row ✅, appends a completion entry to `CLAUDE.md`, advances the `⏳ Next` pointer, and deletes `CURRENT_TASK.md`.

**`/sv-security-check`** — conditional on the diff touching sensitive paths (auth, middleware, CSP, cookies, SDK surface). Reviews the diff against a lookup table of hard architectural rules: redirect codes, CSP construction, cookie clearing patterns, session config invariants. Violations block the PR draft.

### The parallel execution model

`/sv-task-complete` now spawns Verifier and Docs Updater simultaneously, then conditionally runs the Security Check, then hands the main agent a clean result to work from:

```
[parallel]
  /sv-verify       — checks pass/fail (30–60s)
  /sv-update-task-docs— roadmap + CLAUDE.md + cleanup (5–10s)
[sequential]
  /sv-security-check— only if diff touches sensitive paths
  main agent       — version bumps + PR draft
```

Each role agent is briefed with `CURRENT_TASK.md` (~50 lines) plus its skill file. It needs nothing else. Before this refactor, a sub-agent needed a full project orientation pass to know what it was reviewing.

### Measured results after role agents

The token savings from role agents are modest as a fraction of overall session cost — because the implementation phase dominates and no role agent touches it:

| Phase               | After Refactor 1 | After role agents | Reduction |
| ------------------- | ---------------- | ----------------- | --------- |
| Session start       | ~7,000 tokens    | ~7,000 tokens     | No change |
| Implementation      | ~30,000–50,000   | ~30,000–50,000    | No change |
| Task-complete phase | ~4,500 tokens    | ~1,050 tokens     | **77%**   |
| **Full session**    | ~42,000–62,000   | ~38,000–58,000    | **~7%**   |

The honest headline number is 7% per-session token reduction. That undersells the actual value for two reasons.

**Context cleanliness.** The main agent drafts the PR description without 119 lines of typecheck output in its context window. Noise influences generation quality in ways that are real but hard to quantify — the output from a clean-context PR draft is observably better than one written after processing a wall of compiler output.

**Wall-clock parallelism.** Verification takes ~30–60 seconds; the docs update takes ~10 seconds. Running them in parallel saves roughly the docs-update time per task completion — ~10–15 seconds, or about 20% of the complete-phase wall-clock.

**Security coverage.** This is a new capability, not an optimisation of an existing one. Before: no automatic security review. After: every PR touching auth/middleware/CSP gets a targeted diff review against a concrete rules checklist. If it catches one issue per ten tasks that would otherwise require a fix PR, it eliminates a full task cycle worth of work every ten tasks — which exceeds all the token savings above.

---

## Combined gains: the full picture

Stacking both refactors across a full task session:

| Metric                   | Baseline       | After Refactor 1 | After role agents |
| ------------------------ | -------------- | ---------------- | ----------------- |
| Session start tokens     | ~42,000        | ~7,000           | ~7,000            |
| Mid-task refresh         | ~36,000 tokens | ~750 tokens      | ~750 tokens       |
| Task-complete context    | ~4,500 tokens  | ~4,500 tokens    | ~1,050 tokens     |
| Full session tokens      | ~80,000+       | ~42,000–62,000   | ~38,000–58,000    |
| Security coverage        | Manual         | Manual           | Automatic         |
| Maintenance touch points | 3 writes       | 3 writes         | 2 writes + delete |

The refactors are complementary: Refactor 1 addressed session-start cost (the most frequent operation), role agents addressed completion-phase cost and added a capability.

---

## Principles worth keeping

Working through this, a few principles emerged that feel applicable beyond this specific project:

**Load context on demand, not upfront.** The biggest gain came from not loading the entire roadmap to answer "what do I do next?" A two-pointer system — `CLAUDE.md` holds the next-task pointer, `CURRENT_TASK.md` holds the current-task detail — means an agent loads ~450 lines instead of ~2,800 to orient itself.

**Separate chronological index from canonical spec.** The roadmap is now a version-ordered index that points to epic files. The epic files are the spec. These are different concerns with different consumers: the roadmap answers "when did this ship?", the epic answers "what exactly does this task entail?" Conflating them made both worse.

**Stable cross-references beat fragile anchors.** We replaced markdown anchor links (`#313--per-plugin-database`) with plain epic task IDs (`[3.13]`). Anchor links silently break when a heading is renamed; task IDs are stable forever.

**Role agents need tight briefs, not full context.** The Security Check agent only needs `CURRENT_TASK.md` plus the rules table — not the full CLAUDE.md, not the roadmap, not the epic files. Designing role agents with minimal brief surfaces forces clarity about what each role actually needs to know.

**Measure before claiming wins.** The "role agents save tokens" story looked compelling until we measured: 7% of overall session cost. The real wins were context cleanliness and security coverage, not tokens. Measuring surfaced the honest picture and avoided over-investing in marginal gains.

---

## What we did not do

**We did not create a machine-readable task manifest.** A `tasks.json` would be faster for agents to query than grep-searching markdown files. It remains a possible future improvement, but the current markdown-based approach has a meaningful advantage: humans and agents read the same files, so there is no synchronisation problem between a "human-facing" doc and a "machine-facing" manifest.

**We did not add role agents to the implementation phase.** Multiple agents writing to the same codebase simultaneously creates coordination problems that cost more than they save. The implementation phase remains a single focused agent. Role agents live at the edges: task start, task complete, security review.

---

## Conclusion

The structural refactor reduced session-start context load by 84% and mid-task refresh cost by 98%. Role agents parallelised the task-complete phase and added automatic security coverage. The total documentation corpus grew 24% — but that growth is now spread across files that agents load selectively, rather than concentrated in a single file that agents must scan in full.

More broadly, the exercise confirmed that documentation architecture matters for agentic workflows in the same way that API design matters for software systems: a well-designed interface means consumers only pay for what they use. The roadmap was a useful human document and a costly agent interface. Separating the two concerns — a compact index for navigation, rich spec files loaded on demand — made it a better interface for both.

The full implementation lives in the Sovereign repository. The key files are:

- [`docs/epics/`](epics/) — 16 domain epic files with full task detail
- [`docs/roadmap.md`](roadmap.md) — 139-line version-indexed table
- [`docs/development-workflow.md`](development-workflow.md) — workflow reference for agents and contributors
- [`.claude/commands/`](../.claude/commands/) — task lifecycle skills (`sv-task-start`, `sv-task-complete`, `sv-verify`, `sv-update-task-docs`, `sv-security-check`)

---
title: Documentation structure
description: Scope, ownership, and publication rules for Sovereign documentation.
docSection: contributors
docType: policy
audiences:
  - contributor
---

# Documentation structure

Sovereign keeps product education, task-oriented guides, current technical
reference, design decisions, and project operations separate. Each factual
topic has one canonical owner; other pages summarize it and link to that owner.

## Content classes

| Class               | Purpose                                                                                                                      | Canonical location                                                            | Published        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| Product             | Explain Sovereign's value, capabilities, apps, and direction                                                                 | `product/`, `product-roadmap.md`, `instances.md`                              | Yes              |
| Get started         | Short, sequential paths for users, operators, and app developers                                                             | `get-started/`                                                                | Yes              |
| Audience hubs       | Route each audience to canonical guides and references                                                                       | `guides/`                                                                     | Yes              |
| Technical reference | Describe current behavior, configuration, APIs, and architecture                                                             | Named root references and `plugins/`                                          | Yes              |
| Legal templates     | Operator-fillable templates — privacy/terms extending the shipped root `PRIVACY.md`/`TOS.md`, plus a breach-response runbook | `legal/`                                                                      | Yes              |
| Research            | Explore open-ended questions before a design is proposed                                                                     | `research/`                                                                   | No               |
| Decisions           | Record accepted and proposed cross-cutting designs                                                                           | `rfcs/`                                                                       | Yes, with status |
| Incidents           | Record production incidents — timeline, root cause(s), resolution, follow-ups                                                | `incidents/`                                                                  | No               |
| Workstreams         | Sequence an accepted design's tasks across epics in dependency order                                                         | `workstreams/`                                                                | No               |
| Project operations  | Track tasks, plans, findings, and internal coordination                                                                      | `epics/`, `adhoc/` (being phased out — see below), roadmap and planning files | No               |

## Ownership rules

- Product pages explain outcomes and avoid reproducing configuration or API
  reference material.
- Get-started pages stop after the first successful path and link to the
  canonical reference for complete behavior.
- Audience hubs are indexes. They should not become second copies of guides.
- Technical references describe implemented behavior. Future designs belong in
  RFCs and must not be presented as shipped functionality.
- RFCs explain decisions and proposals. They do not replace current reference
  documentation after implementation.
- Research docs explore a question before it has a concrete design — findings,
  options, and a recommendation, not a commitment. A research doc precedes an
  RFC for open-ended topics; it is not deleted once an RFC lands, and not
  every research doc graduates to one (a documented "not now" is a valid
  outcome). See `docs/research/README.md`.
- **Research-as-design (the RFC exception).** A research doc may serve as the
  governing design directly, with no intermediate RFC, when it already contains
  a settled one. The test is whether an RFC would add a _decision_ or only a
  _restatement_: if the options were weighed, the choice made, and the rejected
  alternatives recorded in the research doc, then an RFC repeating them adds a
  documentation trail and a review cycle without adding information. Permitted
  only when all four hold:
  1. The research doc records **rejected alternatives with reasons**, not just a
     recommendation — this is what an RFC's "Alternatives considered" would have
     carried, and it is what stops a decision being relitigated later.
  2. Every **genuinely open** decision is an explicit gate in the workstream, not
     a silent gap. A design with unresolved forks is not settled and still needs
     an RFC.
  3. A **workstream** carries the decisions forward in its "Decisions locked"
     table, and **epic tasks** carry the deliverables. The design is not left to
     be re-derived from prose.
  4. The workstream and epic tasks **cite the research doc where they would
     otherwise cite an RFC**, so the governing document is unambiguous.

  Reference documentation is still updated on implementation, exactly as it
  would be after an RFC. This exception changes which document holds the design,
  not whether the design is written down. When in doubt, write the RFC — the
  exception exists for the case where the design is genuinely finished, not as a
  general shortcut.

- Workstream docs sequence work; they do not design it or track its status.
  Design stays in `rfcs/`, full task specs stay in `epics/`, and status stays in
  `ROADMAP.md` rows and epic headings. A workstream adds dependency order across
  epics, the decisions already locked (so they are not reopened mid-execution),
  and the gates that determine whether later work proceeds. It is normally
  written after its governing RFCs — if a design is not settled enough to
  sequence, the missing step is an RFC or research doc. Under the
  research-as-design exception above, a workstream may instead be governed by a
  research doc directly. See `docs/workstreams/README.md`.
- The public product roadmap describes themes. `ROADMAP.md` and `epics/` remain
  the private engineering queue and source of task status.
- Incident docs are a factual record of what happened during a specific
  production incident — timeline, root cause(s), the exact remediation run
  against production, and follow-up actions with status. One file per
  incident, named `docs/incidents/YYYY-MM-DD-short-slug.md`. They are not the
  place to propose new designs (that's an RFC or research doc, linked from the
  incident's follow-ups) and are never edited to reflect later changes — if a
  follow-up itself needs documenting, it gets its own entry in whatever
  reference doc it changes, cross-linked back to the incident, not folded into
  the incident file after the fact.
- `docs/adhoc/` predates the `incidents/` and `research/` classes and mixed
  both purposes (bug write-ups, findings, plans) without a clear boundary. It
  is being phased out: new incident write-ups go in `incidents/`, new
  open-ended findings/plans go in `research/` or a package/app-local doc as
  appropriate, and existing `adhoc/` content stays where it is until someone
  deliberately migrates or retires it — don't add new files there.
- `docs/public/` is not a content class — it is the docs site's static-asset
  directory (favicons, the social-preview image, per-plugin icon SVGs used on
  product pages), copied verbatim into the built site the way any VitePress
  `public/` directory is. It carries no documentation prose, so it has no row
  in the table above and no ownership rule beyond this one.

## Technical-reference metadata

Canonical root references keep stable filenames and URLs while declaring their
ownership in frontmatter:

```yaml
docSection: operators
docType: guide
audiences:
  - operator
```

`docSection` controls the primary navigation group and must be one of
`operators`, `app-developers`, `architecture-security`, or `contributors`.
`docType` describes how the page should be maintained and must be `guide`,
`reference`, or `policy`. `audiences` records every audience expected to use the
page and may contain `user`, `operator`, `app-developer`, or `contributor`.

A page has one primary section even when several audiences use it. For example,
`security.md` belongs to Architecture & Security while serving all four
audiences. Metadata expresses ownership without moving established files or
changing their public and GitHub URLs.

## Publication boundary

The docs site (built from the `sovereignfs/sovereignfs` workbench repo, not
this one) uses the explicit allowlist policy in that repo's
`docs/docs-sync.manifest.json`. Public directories and canonical root
references are opted in there via a build-time sparse-checkout of this repo;
every other Markdown file here is never fetched, so it can't appear on the
site.

Adding a link to navigation does not make a document public. A new public
content class or root reference requires a deliberate change to that
manifest, which keeps internal notes from becoming public merely because they
live under `docs/`.

## Compatibility

Long-standing root references such as `self-hosting.md`,
`plugin-development.md`, and `architecture.md` keep their source paths and URLs.
Repository tests, source comments, RFCs, package documentation, and external
GitHub links depend on those locations. Their audience ownership is expressed
through navigation and this contract rather than disruptive file moves.

Audience indexes live in `guides/`, while explicit VitePress rewrites preserve
their established `/docs/` public URLs. Source organization can therefore stay
clear without invalidating bookmarks, search results, or inbound links.

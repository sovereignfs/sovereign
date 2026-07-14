# Sovereign Docs Site Revamp Plan

**Status:** Proposed

**Date:** July 2026

**Scope:** Public product site, hosted-instance directory, and technical documentation
**Related:** [Epic 16](epics/docs.md), [RFC 0037](rfcs/0037-vitepress-docs-site.md)

## Executive Summary

The current Sovereign site is effective as a searchable technical documentation
site, but it assumes that visitors already understand the product. The next
version should first explain Sovereign in practical terms, then help visitors
choose a path: use an existing instance, host an instance, or build apps for the
runtime.

The site should communicate one primary definition consistently:

> Sovereign is an open-source workspace runtime for hosting private, multi-user
> apps on infrastructure you control.

The revamp has three layers:

1. **Product education** explains what Sovereign is, why it exists, how it works,
   what is available, how to begin, and where the product is going.
2. **Instance discovery** provides a curated directory of independently operated
   Sovereign instances, initially containing one entry.
3. **Technical documentation** gives users, operators, app developers, and
   contributors role-specific paths into the existing documentation.

This document defines the content and delivery plan. It does not authorize or
implement the redesign.

## Problem Statement

The current homepage leads with implementation language such as plugin
architecture, database choices, SDK contracts, and deployment topology. That
information is valuable after a visitor has chosen to evaluate or adopt
Sovereign, but it does not answer the questions a first-time visitor has:

- What is Sovereign in terms I can repeat to someone else?
- What can a group do with it today?
- Why would I use it instead of separate hosted services?
- Who operates it and who controls the data?
- Can I try an existing instance?
- What does hosting one require?
- Is the capability I need available now or only planned?

The site also treats self-hosters and app developers as the primary audience.
People who only want to use a Sovereign instance do not have a clear path, and
there is no public discovery surface for hosted instances.

## Goals

- Make the product understandable to a non-technical visitor within one minute.
- Establish **open-source workspace runtime** as the public product category.
- Explain the relationship between a Sovereign instance, its operator, its
  users, and its installed apps.
- Provide distinct journeys for users, operators, and app developers.
- Let visitors try a listed instance or begin hosting within two navigation
  actions.
- Show real product UI and concrete workflows instead of relying on abstract
  architecture claims.
- Separate currently available capabilities from work in development or under
  exploration.
- Retain the depth, searchability, and stable URLs of the technical docs.
- Make instance ownership and trust boundaries explicit.

## Non-Goals

- Rebranding Sovereign or changing the runtime architecture.
- Replacing VitePress or moving documentation out of `docs/`.
- Creating an automated public instance registry in the first release.
- Accepting unreviewed instance submissions.
- Publishing internal task IDs, release sequencing, or speculative dates as a
  product commitment.
- Rewriting every technical document in one release.
- Adding analytics that conflict with Sovereign's privacy principles.

## Positioning and Terminology

### Primary Positioning

Use this definition in the homepage introduction, metadata, social previews,
and the first paragraph of the product overview:

> Sovereign is an open-source workspace runtime for hosting private, multi-user
> apps on infrastructure you control.

Supporting copy should translate that category into outcomes for operators,
users, and app builders:

> Run your own instance, invite users, and install or build the apps your
> community needs. Sovereign provides shared foundations for identity, data,
> storage, and security, so app builders can focus on custom workflows while
> operators retain control of their infrastructure and data.

The longer product explanation should make the extensibility promise concrete:
Sovereign is useful even when an existing app does not meet a group's needs. A
developer can build a purpose-specific app on the runtime and reuse platform
capabilities such as authentication, app-scoped databases, storage, UI, and
security-sensitive services instead of assembling and maintaining that
infrastructure independently. Capabilities such as encryption must be described
according to their current availability rather than implied as universally
available.

### Terminology Model

| Context                  | Preferred term                           | Guidance                                                                  |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------------------- |
| Public product category  | Open-source workspace runtime            | Use as the short, consistent description of Sovereign.                    |
| Technical description    | Modular, self-hostable workspace runtime | Use when architecture or deployment details are relevant.                 |
| A deployed installation  | Sovereign instance                       | An instance has one operator and one or more users.                       |
| A user's environment     | Workspace                                | Describes the cohesive environment people use.                            |
| User-facing capabilities | Apps                                     | Users install, open, and use apps.                                        |
| Architecture and APIs    | Plugins                                  | Preserve this term in manifests, SDKs, code, schemas, and developer docs. |
| Responsible host         | Operator                                 | The person or organization running an instance.                           |

Do not replace **workspace runtime** with **suite** as the primary category.
"Suite" implies a fixed bundle of applications, while Sovereign is a runtime
that hosts an extensible set of apps.

### Voice and Content Principles

- Lead with user and operator outcomes; introduce implementation details when
  they help a visitor evaluate a claim.
- Prefer concrete statements over broad claims such as "take back control."
- Use **app** on end-user surfaces and **plugin** in developer-facing material.
- Explain unfamiliar terms on first use; do not assume knowledge of single
  tenancy, runtime architecture, or the Sovereign plugin model.
- Never present planned functionality as available. Label capability status as
  **Available**, **In development**, **Planned**, or **Exploring**.
- Use real interface screenshots with safe seed data. Screenshots must show the
  actual workflow being discussed and include meaningful alt text.
- Avoid competitor comparisons until the product claims and evaluation criteria
  can be kept current and objectively sourced.

## Audiences and Primary Journeys

### Prospective User

**Question:** Can I use Sovereign without operating infrastructure?

**Journey:** Homepage -> Product overview -> Find an instance -> Review the
operator and access policy -> Visit the instance -> Create or request an account.

The content should explain that the operator, not the Sovereign project,
controls registration, policies, installed apps, and data handling for a listed
instance.

### Prospective Operator

**Question:** Is Sovereign appropriate for my household, team, organization, or
community, and what will I need to run it safely?

**Journey:** Homepage -> How it works -> Host your own -> Production checklist
-> Configuration, backups, upgrades, and security.

The content must set realistic expectations about infrastructure ownership,
ongoing maintenance, email, storage, backups, TLS, upgrades, and user support.

### App Developer

**Question:** Can I build and distribute an app that runs inside Sovereign?

**Journey:** Homepage or Docs -> Build apps -> Plugin model -> Quickstart -> SDK,
manifest, data, UI, security, testing, and distribution references.

Marketing pages can say **build apps**; developer documentation must explain
that apps are delivered as plugins and are constrained by the SDK boundary. The
developer journey should emphasize that the runtime supplies reusable platform
capabilities, allowing a custom app to concentrate on its domain and workflow
instead of rebuilding authentication, data access, storage, UI foundations, and
security boundaries.

### Contributor or Evaluator

**Question:** How is the project designed, governed, secured, tested, and
planned?

**Journey:** Docs hub -> Architecture and security or Contributing -> SRS,
architecture rules, RFCs, source repository, and internal engineering roadmap.

## Proposed Information Architecture

### Global Navigation

Use a concise top-level navigation:

```
Product   Instances   Get Started   Roadmap   Docs   GitHub
```

- **Product** opens the product overview and provides access to why Sovereign,
  how it works, features, and apps.
- **Instances** opens the curated directory.
- **Get Started** lets the visitor choose user, operator, or developer guidance.
- **Roadmap** opens the public product roadmap.
- **Docs** opens the audience-oriented technical documentation hub.
- **GitHub** remains an external destination.

On small screens, preserve all destinations in a conventional menu. The primary
CTA should remain reachable without displacing core navigation.

### Route Map

```
/
├── product
│   ├── why-sovereign
│   ├── how-it-works
│   ├── features
│   └── apps
├── instances
├── get-started
│   ├── users
│   ├── operators
│   └── developers
├── product-roadmap
└── docs
    ├── users
    ├── operators
    ├── developers
    ├── architecture
    └── contributing
```

The exact physical file structure may differ where VitePress compatibility
pages are required. `/product-roadmap` intentionally differs from the internal
`docs/roadmap.md`, which remains an engineering task queue and is excluded from
the public build.

## Layer 1: Product Education

### Homepage

The homepage should answer four questions in order: what Sovereign is, who it is
for, why it matters, and what the visitor can do next.

#### First Viewport

- **H1:** Sovereign
- **Descriptor:** The open-source workspace runtime.
- **Supporting copy:** Run your own instance, invite users, and install or build
  the apps your community needs. Sovereign provides shared foundations for
  identity, data, storage, and security, so app builders can focus on custom
  workflows while operators retain control of their infrastructure and data.
- **Primary action:** Explore Sovereign
- **Secondary action:** Try an instance
- **Tertiary action:** Host your own
- **Visual:** A current, legible product screenshot with representative apps and
  safe seed data. The UI should remain inspectable rather than heavily cropped,
  blurred, or treated as atmospheric decoration.

The first viewport should not lead with SQLite, Postgres, Docker, SDKs, or the
plugin manifest. Those details belong in operator and developer paths.

#### Homepage Content Sequence

1. **What Sovereign is:** Explain the runtime, instance, operator, user, and app
   relationship with a concise diagram or product UI sequence.
2. **How an instance works:** An operator deploys Sovereign, invites users, and
   selects apps; users sign in to one workspace and use the apps made available
   to them.
3. **What users can do:** Show real tasks supported by currently available apps.
4. **What operators control:** Infrastructure, access, app availability,
   instance identity, policies, backups, and upgrades.
5. **Apps and extensibility:** Present available apps separately from planned
   apps, then show how developers can build purpose-specific apps by reusing
   Sovereign's platform capabilities instead of assembling a separate auth,
   data, storage, UI, and security stack.
6. **Privacy and ownership:** State the concrete trust model and avoid implying
   that self-hosting eliminates the need to trust an operator.
7. **Try Sovereign:** Preview the curated instance directory and its registration
   policy.
8. **Where it is going:** Summarize the outcome-based public roadmap.
9. **Choose a path:** End with user, operator, and developer actions.

### Product Overview

`/product` should be the durable explanation of the product. It should contain:

- The primary definition and intended use cases.
- The instance/operator/user/app model.
- A product tour using real screenshots.
- A clear account of what is available today.
- Links to how it works, detailed features, apps, instances, and getting started.
- A short section explaining what Sovereign is not: a hosted SaaS service run by
  the project, a fixed app suite, or a peer-to-peer network by default.

### Why Sovereign

`/why-sovereign` should explain the problem without relying on fear-based or
absolute language. Organize it around practical outcomes:

- One environment for a group's shared apps.
- Infrastructure and data administration chosen by the group.
- Open-source software that can be inspected and adapted.
- Shared authentication, UI, and platform services across installed apps.
- A consistent app development contract instead of isolated deployments.

Claims about privacy, security, and control must link to their technical model
and limitations.

### How It Works

`/how-it-works` should introduce architecture progressively:

1. An operator deploys an instance.
2. The operator configures identity, access, and installed apps.
3. Users authenticate to that instance and enter a shared workspace.
4. Apps use platform capabilities through the plugin SDK.
5. The operator maintains infrastructure, backups, and upgrades.

Use a diagram that distinguishes the user's browser, the Sovereign instance,
installed apps, platform services, and operator-controlled infrastructure. Link
to architecture and security docs for implementation detail.

### Features and Apps

`/features` should group capabilities by user outcome rather than code package:

- Workspace and navigation.
- Identity and account security.
- Multi-user access and administration.
- Installable apps and shared platform services.
- Operator controls and instance identity.
- Data portability, backup, and operational security.
- Developer SDK and design system.

Each capability must carry a status and link to evidence: a guide, screenshot,
release, or roadmap item.

`/apps` should list user-facing apps separately from platform capabilities. Each
app entry should include purpose, screenshots, availability, operator setup
requirements, source, and relevant user/developer documentation. Planned apps
must be visually and semantically distinct from installable apps.

### Getting Started Hub

`/get-started` should ask visitors to choose a role instead of presenting a long
generic guide:

- **Use Sovereign:** Find an instance, understand operator trust, create an
  account, install the instance as a PWA, enable supported device features, and
  navigate the workspace.
- **Host Sovereign:** Evaluate requirements, deploy a test instance, then follow
  a production readiness path.
- **Build an app:** Create a plugin, run it locally, use platform capabilities,
  and prepare it for distribution.

## Layer 2: Hosted-Instance Directory

### Initial Scope

Create `/instances` as a manually curated directory. The first release contains
one candidate entry:

- `https://sovereign.openfs.io/`

Before publishing the entry, confirm its operator identity, intended audience,
registration policy, support contact, privacy/terms links, available apps, and
whether it is a production service or demonstration instance. The visible
"Create account" action alone is not sufficient evidence of open registration.

### Listing Content Model

Store listings in a small structured data file, such as
`docs/data/instances.json`, with schema validation during the docs build.

| Field                  | Required | Purpose                                                    |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `name`                 | Yes      | Public instance name.                                      |
| `url`                  | Yes      | Canonical HTTPS URL.                                       |
| `operatorName`         | Yes      | Person or organization responsible for the service.        |
| `operatorUrl`          | No       | Operator identity or information page.                     |
| `summary`              | Yes      | Intended community or use.                                 |
| `accessPolicy`         | Yes      | Open, approval required, invite only, or demonstration.    |
| `region`               | No       | Broad hosting or legal jurisdiction when disclosed.        |
| `apps`                 | Yes      | User-facing apps confirmed as available.                   |
| `privacyUrl`           | Yes      | Operator's privacy policy.                                 |
| `termsUrl`             | No       | Operator's terms or acceptable use policy.                 |
| `supportUrl`           | Yes      | Operator-controlled support channel.                       |
| `lastVerified`         | Yes      | Date on which listing details were manually checked.       |
| `versionCompatibility` | No       | Public version or compatibility range when safely exposed. |
| `status`               | Yes      | Active, temporarily unavailable, or delisted.              |

Do not expose sensitive deployment metadata or turn the directory into a health
monitor without a separate security and operations review.

### Trust and Governance

Every directory page and listing must state:

- Listed instances are independently operated.
- The Sovereign project does not operate, audit, endorse, or guarantee a listed
  instance unless explicitly stated.
- The instance operator controls accounts, policies, installed apps, retention,
  backups, support, and infrastructure.
- Visitors should review the operator's privacy, terms, and access policies
  before registering or submitting data.

Initial listing changes should use repository pull requests and maintainer
review. Define criteria for addition, correction, temporary suspension, and
delisting before accepting third-party submissions. Automated discovery,
uptime checks, compatibility endpoints, and self-service submissions are later
enhancements, not initial requirements.

## Layer 3: Technical Documentation

### Documentation Hub

`/docs` should replace the current assumption that every visitor wants the same
sidebar. It should offer five entry points:

- **Use Sovereign:** Account access, workspace navigation, app use, profile,
  security, PWA installation, notifications, offline expectations, and data
  controls.
- **Operate Sovereign:** Evaluation, deployment, production configuration,
  users, apps, backups, upgrades, security, and troubleshooting.
- **Build apps:** Plugin quickstart, manifest, SDK, platform capabilities, data,
  UI, security, testing, and distribution.
- **Understand Sovereign:** Product architecture, trust model, security model,
  data model, and RFCs.
- **Contribute:** Repository map, development workflow, architecture rules,
  tests, releases, and governance.

Search should remain global, but results should expose their audience and
section so similarly named user and developer pages are distinguishable.

### Operator Documentation Decomposition

The current `self-hosting.md` is a useful starting point but combines evaluation,
quickstart, production, configuration, and maintenance. Progressively split it:

```
operator/
├── quickstart.md
├── production.md
├── configuration.md
├── users-and-access.md
├── apps.md
├── backups.md
├── upgrades.md
├── security.md
└── troubleshooting.md
```

`/self-hosting` should remain as a compatibility page or redirect to the new
operator quickstart. Existing inbound links must continue to work.

### Content Migration Rules

- Inventory every public page, its audience, owner, freshness, and destination.
- Move content only when the new destination is ready and link-checked.
- Preserve stable routes with compatibility pages or redirects.
- Keep RFCs available but out of the primary user and operator navigation.
- Keep internal plans, task epics, and the engineering roadmap excluded from the
  public build.
- Add page-level "last reviewed" metadata only if the project will maintain it;
  stale timestamps are worse than none.
- Prefer one canonical explanation and link to it instead of duplicating security,
  configuration, or SDK contracts across marketing and technical pages.

## Public Product Roadmap

Create `/product-roadmap` as an outcome-oriented view separate from the internal
engineering queue. Use these horizons:

- **Available now**
- **Being built**
- **Next**
- **Later**
- **Exploring**

Group roadmap items by user outcome, such as easier operation, richer apps,
stronger data control, or broader device access. Do not expose internal task IDs,
volatile slot versions, branch names, or uncommitted delivery dates. Every item
must include a status definition and a link to an RFC or GitHub source when more
technical context is useful.

The page must state that plans can change and that **Exploring** is not a delivery
commitment. The internal `docs/roadmap.md` remains the authoritative engineering
sequence.

## Visual and Interaction Direction

- Build the usable product experience as the homepage, not a decorative
  marketing preface.
- Use current product screenshots in the first viewport and feature sections.
- Keep documentation pages restrained, readable, and optimized for scanning.
- Avoid nested cards and excessive feature-card grids. Use full-width content
  bands, structured comparisons, and screenshots where they communicate more.
- Use Sovereign design tokens where practical, while keeping the VitePress theme
  isolated from runtime-only implementation dependencies.
- Support light and dark themes with equivalent contrast and image treatment.
- Design navigation, screenshots, diagrams, tables, and CTAs for mobile from the
  start.
- Respect reduced-motion preferences and never require animation to understand
  a workflow.

## Technical Approach

Retain VitePress and `docs/` as the source of truth established by RFC 0037.
Extend the current custom theme boundary rather than introducing a second site.

Expected implementation areas:

- Custom VitePress home and product-page components in
  `apps/docs/.vitepress/theme/`.
- Product pages and hubs in `docs/` with public routes defined by the information
  architecture.
- Versioned, optimized screenshots and diagrams in the VitePress public asset
  directory.
- Structured data plus validation for instances and capability status.
- Navigation and sidebar generation that is audience-oriented and does not
  require maintaining the same link list in multiple places.
- Redirect or compatibility handling for migrated documentation routes.
- Build-time link checking and existing VitePress local search.

Avoid fetching directory or roadmap content from a runtime service in the first
release. Static, reviewed data matches the deployment model, reduces failure
modes, and keeps the public site auditable.

## SEO, Accessibility, Performance, and Measurement

### SEO and Sharing

- Give every public page a unique title and description.
- Add canonical URLs, Open Graph metadata, and social preview images.
- Generate a sitemap and appropriate crawler directives.
- Use one descriptive H1 and a logical heading order per page.
- Add structured data only where it accurately describes the software or
  organization; do not fabricate ratings, reviews, or availability.

### Accessibility

- Meet WCAG 2.1 AA for content and interaction.
- Maintain visible focus, keyboard navigation, landmarks, skip links, and
  sufficient contrast.
- Provide useful alt text for instructional images and empty alt text for purely
  decorative images.
- Ensure diagrams have adjacent text explanations.
- Test zoom, text reflow, reduced motion, high contrast, and mobile navigation.

### Performance

- Optimize screenshots to modern formats with explicit dimensions and responsive
  sources.
- Avoid loading nonessential scripts or large media before the primary content.
- Target mobile Lighthouse scores of at least 90 for performance and 100 for
  accessibility on the homepage and one representative docs page.
- Preserve a functional text-first experience when images fail to load.

### Measurement

Start with measurement that does not require visitor tracking:

- Link and build health in CI.
- Search terms collected only if a privacy-preserving, explicitly approved
  mechanism is introduced later.
- Repository issues and support questions categorized by missing or unclear docs.
- Periodic task-based review: find an instance, find production requirements,
  and find the app quickstart.

Do not add third-party analytics as part of the revamp by default.

## Delivery Plan

The task IDs below are proposed additions to Epic 16. They are not scheduled or
approved until the epic and roadmap are updated in a separate planning decision.

### Proposed 16.4: Research, Positioning, and Content Inventory

**Deliverables:** Validate audience assumptions; approve positioning and
terminology; inventory current pages and claims; identify missing user content;
record route migration requirements; confirm the status of marketed features.

**Exit criteria:** Every current page has an audience and destination; product
claims have an owner and evidence; unresolved product decisions are documented.

### Proposed 16.5: Site Foundation and Visual System

**Deliverables:** Custom VitePress theme foundation; global navigation; footer;
responsive layouts; product screenshot workflow; metadata defaults; accessible
components; visual regression coverage for key viewports.

**Exit criteria:** Foundation supports product pages and technical docs without
duplicated shells; responsive and theme behavior is verified in browsers.

### Proposed 16.6: Product Education

**Deliverables:** Homepage, product overview, why Sovereign, how it works,
features, and apps pages with status-labelled claims and real product visuals.

**Exit criteria:** A first-time visitor can explain the product, identify what is
available, and choose a next action without reading technical docs.

### Proposed 16.7: Role-Based Getting Started

**Deliverables:** Getting-started hub; user onboarding path; operator evaluation
and quickstart path; app developer quickstart path.

**Exit criteria:** User, operator, and developer tasks do not compete on one page;
each path reaches an actionable guide within two navigation actions.

### Proposed 16.8: Curated Instance Directory

**Deliverables:** Listing schema and validation; directory page; trust notice;
listing governance; first verified instance entry.

**Exit criteria:** Every published field is verified; access policy and operator
responsibility are unambiguous; invalid listings fail the build.

### Proposed 16.9: Public Product Roadmap

**Deliverables:** Outcome-based roadmap page; horizon definitions; process for
updating public status; links to technical sources where appropriate.

**Exit criteria:** Public plans cannot be confused with shipped capabilities or
the internal engineering queue.

### Proposed 16.10: Technical Documentation Reorganization

**Deliverables:** Docs hub; audience-oriented navigation; operator documentation
decomposition; user documentation foundation; route compatibility; RFC and
contributor navigation cleanup.

**Exit criteria:** Existing URLs remain valid; each audience has a coherent path;
search and links pass in CI.

### Proposed 16.11: Release Quality and Launch

**Deliverables:** Content review; browser and device QA; accessibility audit;
performance tuning; SEO and social metadata; link validation; launch checklist.

**Exit criteria:** All success criteria below pass and no capability is marketed
without an accurate status.

## Dependencies and Sequencing

1. Approve this plan and resolve the product decisions that affect public copy.
2. Complete content inventory and claim verification before visual implementation.
3. Build the site foundation before product pages, directory, or docs migration.
4. Product education, getting started, instances, and public roadmap can proceed
   in parallel once the foundation and content contracts are stable.
5. Reorganize technical docs incrementally, preserving routes throughout.
6. Run cross-site release QA only after all public layers are integrated.

The instance directory depends on operator-provided policy information. Product
screenshots depend on a stable demonstration dataset and a defined update owner.
Public roadmap content depends on maintainer approval of each item's horizon and
wording.

## Risks and Mitigations

| Risk                                    | Mitigation                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Marketing gets ahead of implementation  | Require status labels and evidence for every capability claim.               |
| Self-hosting is presented as trustless  | Explain the operator trust model on product, instance, and user pages.       |
| Public and internal roadmaps drift      | Assign an owner and update public outcomes during release planning.          |
| Technical users lose familiar routes    | Maintain compatibility routes and run link checks before migration.          |
| One instance appears project-operated   | Show operator identity and the independent-operation disclaimer prominently. |
| Screenshots become stale or expose data | Use safe seed data, document capture steps, and review assets per release.   |
| Custom theme becomes hard to maintain   | Keep components small and use VitePress APIs instead of forking the theme.   |
| Site becomes heavy on mobile            | Set image budgets and test representative mobile pages in CI/release QA.     |
| Content has no ongoing owner            | Assign page owners and review triggers before launch.                        |

## Open Decisions

The following decisions should be resolved during proposed task 16.4:

1. Who is the primary launch audience: community operators, household/team
   operators, or people looking for an instance to join?
2. What concrete user workflows are complete enough to feature on the homepage?
3. Is `sovereign.openfs.io` a public production instance, approval-based service,
   invite-only community, or demonstration environment?
4. Who operates that instance, and where are its privacy, terms, support, and
   registration-policy pages?
5. Should "private" in the positioning mean privately operated, access
   controlled, or data private? The supporting copy must define the claim.
6. Which app and platform capabilities are **Available**, **In development**,
   **Planned**, and **Exploring** at launch?
7. Which current screenshots and demonstration data can be published and
   maintained safely?
8. Who approves public roadmap horizon changes and instance directory updates?
9. Is the GitHub Pages domain expected to remain canonical, or should the revamp
   prepare for a project-owned custom domain?
10. Should public pages include privacy-preserving aggregate measurement, and if
    so, what explicit data contract is acceptable?

## Success Criteria

The revamp is ready to launch when:

- A first-time visitor can accurately describe Sovereign after one minute on the
  homepage.
- Users, operators, and app developers can reach their starting guide within two
  navigation actions.
- Real product UI appears in the first viewport on desktop and remains useful on
  mobile.
- Every marketed feature and app has a visible, accurate status.
- The instance directory identifies the operator, access policy, last verification,
  and project/operator trust boundary for every entry.
- The public roadmap cannot be confused with shipped functionality or the
  internal engineering roadmap.
- Existing public documentation URLs continue to resolve.
- Homepage and representative documentation pages meet WCAG 2.1 AA.
- Mobile Lighthouse reaches at least 90 performance and 100 accessibility on
  agreed test pages.
- The VitePress build, internal link validation, structured-data validation, and
  visual smoke tests pass in CI.
- Maintainers have named owners and review triggers for product claims,
  screenshots, instance listings, and roadmap status.

## Approval Gate

Before implementation begins, maintainers should approve:

- The primary positioning and supporting copy.
- The route map and global navigation.
- Capability status and the first set of homepage workflows.
- Instance directory policy and the first listing's verified data.
- Public roadmap horizons and update ownership.
- The proposed Epic 16 task breakdown and roadmap sequencing.

Once approved, update `docs/epics/docs.md` and `docs/roadmap.md` in the first
scheduled implementation PR or a dedicated planning PR. Until then, this plan
is the proposal and the existing epic and roadmap remain authoritative.

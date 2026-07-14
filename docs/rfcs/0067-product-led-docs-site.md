# RFC 0067 — Product-led docs site and instance directory

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `apps/docs`, public content under `docs/`; builds on RFC 0037\
**Incorporated into plan:** No — implementation can proceed without changing epics or the engineering roadmap.

---

## Summary

Evolve the Sovereign VitePress site from a technical landing page into one
coherent public site with three layers: product education, discovery of hosted
Sovereign instances, and audience-oriented technical documentation.

The site will consistently describe Sovereign as:

> Sovereign is an open-source workspace runtime for hosting private, multi-user
> apps on infrastructure you control.

Visitors will be able to understand the product, find an independently operated
instance, host their own instance, build a custom app on Sovereign's shared
platform capabilities, or enter the technical documentation without first
learning the repository architecture.

## Motivation

The current homepage primarily explains implementation characteristics:
self-hosting, plugin architecture, databases, SDK contracts, and the design
system. Those details are useful to operators and developers, but the page does
not first establish what Sovereign enables for a person, team, household,
organization, or community.

Three gaps follow from that emphasis:

1. A first-time visitor does not get a concise product explanation or a visual
   understanding of the workspace.
2. A person who wants to use Sovereign, rather than operate or extend it, has no
   clear path to an available instance.
3. User, operator, app-developer, architecture, and contributor material share a
   technical navigation model instead of beginning from each audience's task.

Sovereign also needs to communicate that extensibility is more than installing
existing apps. A developer can build a purpose-specific app and reuse platform
foundations for identity, app-scoped data, storage, UI, and security instead of
assembling those capabilities independently. Public copy must still distinguish
shipped, in-development, planned, and exploratory capabilities.

## Goals and non-goals

### Goals

- Make Sovereign understandable to a non-technical visitor within one minute.
- Establish **open-source workspace runtime** as the public product category.
- Give users, operators, and app developers distinct starting paths.
- Explain the instance, operator, user, app, and plugin relationship.
- Introduce a curated hosted-instance directory with explicit trust boundaries.
- Separate the public product roadmap from the internal engineering queue.
- Preserve existing technical documentation depth, search, and stable routes.
- Keep `docs/` as the content source and VitePress as the site generator.

### Non-goals

- Changing the Sovereign runtime, SDK, manifest, or deployment architecture.
- Replacing VitePress or creating a separate marketing application.
- Building an automated instance registry, uptime monitor, or open submission
  service in the first release.
- Publishing internal task IDs or speculative dates as product commitments.
- Adding third-party analytics by default.
- Updating epics or `docs/roadmap.md` as part of this RFC.

## Current state (what this builds on)

- RFC 0037 established `apps/docs` as a VitePress site reading directly from
  `docs/`, with local search and GitHub Pages deployment
  (`docs/rfcs/0037-vitepress-docs-site.md`).
- `docs/index.md` uses VitePress's built-in home layout and leads with technical
  feature tiles.
- `apps/docs/.vitepress/config.ts` exposes Guide, Plugin Dev, Design System,
  RFCs, and GitHub in the global navigation and uses one shared technical
  sidebar.
- `apps/docs/.vitepress/theme/index.ts` extends the default VitePress theme and
  already provides a stable custom-theme boundary.
- `docs/self-hosting.md` is the current general operator entry point.
- `docs/roadmap.md` is an internal chronological task queue and is already
  excluded from the public VitePress build.
- `https://sovereign.openfs.io/` is the first candidate hosted instance, but its
  operator, intended audience, registration policy, support path, and policy
  links must be verified before the directory presents them as facts.

## Proposed design

### Positioning and terminology

Use the primary definition in the homepage introduction, product overview,
metadata, and social previews. Supporting copy should communicate operation,
use, and extensibility:

> Run your own instance, invite users, and install or build the apps your
> community needs. Sovereign provides shared foundations for identity, data,
> storage, and security, so app builders can focus on custom workflows while
> operators retain control of their infrastructure and data.

Use these terms consistently:

| Context                  | Term                                     |
| ------------------------ | ---------------------------------------- |
| Public product category  | Open-source workspace runtime            |
| Technical description    | Modular, self-hostable workspace runtime |
| Deployed installation    | Sovereign instance                       |
| User environment         | Workspace                                |
| User-facing capabilities | Apps                                     |
| Architecture and APIs    | Plugins                                  |
| Responsible host         | Operator                                 |

"Suite" is not the primary category because it suggests a fixed application
bundle. Marketing pages use **app**; manifests, SDKs, source code, and developer
documentation retain **plugin**.

### Three-layer information architecture

The global navigation becomes:

```
Product   Instances   Get Started   Roadmap   Docs   GitHub
```

The public route model is:

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

`/product-roadmap` is deliberately separate from the excluded internal
`docs/roadmap.md` route.

### Product education layer

The homepage answers four questions in order: what Sovereign is, who it is for,
why it matters, and what the visitor can do next. It uses a real or faithful
product visual in the first viewport and provides three actions: explore the
product, try an instance, and host an instance.

Homepage content then explains:

1. The instance, operator, user, and app model.
2. What users can do with currently available apps.
3. What operators control and must maintain.
4. How developers build purpose-specific apps on shared platform foundations.
5. The concrete privacy and ownership model, including operator trust.
6. The available instance and role-based next steps.

Product pages expand the explanation without forcing visitors into API or
deployment detail. Every marketed capability uses one of four status labels:
**Available**, **In development**, **Planned**, or **Exploring**. A claim should
link to evidence such as a guide, screenshot, release, source, or roadmap item.

### Hosted-instance directory

`/instances` is a manually curated directory. Listings are maintained as
reviewed structured data and include:

- Instance name and canonical HTTPS URL.
- Operator identity and optional operator information URL.
- Intended audience or community.
- Access policy: open, approval required, invite only, or demonstration.
- Available user-facing apps.
- Privacy, terms, and support links.
- Last verified date and listing status.
- Optional broad region and public version compatibility.

Each page states that listed instances are independently operated and are not
audited, endorsed, guaranteed, or supported by the Sovereign project unless
explicitly stated. The operator controls accounts, policies, apps, retention,
backups, infrastructure, and support.

The first directory release may identify `sovereign.openfs.io` as a candidate or
demonstration endpoint while verification is incomplete. It must not infer open
registration solely from a visible account-creation link.

### Role-based getting started

`/get-started` asks the visitor to choose a goal:

- **Use Sovereign:** Find an instance, understand operator trust, obtain an
  account, install the instance as a PWA, enable supported device features, and
  learn the workspace.
- **Host Sovereign:** Evaluate requirements, deploy a test instance, and follow
  production guidance for TLS, email, storage, backups, upgrades, and security.
- **Build an app:** Create a plugin, use platform capabilities through the SDK,
  test it locally, and prepare it for distribution.

### Technical documentation layer

`/docs` becomes an audience-oriented hub with five entrances: use Sovereign,
operate Sovereign, build apps, understand Sovereign, and contribute. Existing
technical pages remain canonical during the first implementation.

Operator documentation can later be decomposed into quickstart, production,
configuration, users and access, apps, backups, upgrades, security, and
troubleshooting. `/self-hosting` remains valid as a compatibility route or
redirect throughout that migration.

RFCs remain available and searchable but are not a primary user or operator
path. Internal plans, epics, and the engineering roadmap remain excluded from
the public build.

### Installed PWA experience

The user path documents how to install a specific Sovereign instance on iOS,
Android, and supported desktop browsers. It distinguishes the installed instance
from a global app and covers standalone launch, per-device Web Push opt-in,
notification preferences, updates, offline fallback behavior, and common
recovery steps.

The guide makes the operator dependency explicit: production installation and
Web Push require HTTPS, push controls appear only when the operator configures
VAPID, and iOS push requires an installed Home Screen PWA on iOS/iPadOS 16.4 or
later. It does not describe Sovereign as fully offline-first; individual apps
must document any offline data and synchronization guarantees they provide.

### Public product roadmap

`/product-roadmap` presents outcome-based horizons:

- Available now
- Being built
- Next
- Later
- Exploring

It does not expose internal task IDs, roadmap slot versions, branch names, or
uncommitted dates. It links to RFCs or GitHub for technical context and states
that plans can change. The internal engineering roadmap remains authoritative
for sequencing.

### Visual and content system

- Extend the existing VitePress theme rather than fork it.
- Use real product imagery or faithful UI captures with safe demonstration data.
- Keep screenshots inspectable and provide meaningful alt text.
- Use full-width content bands and restrained repeated items; avoid nested card
  layouts and decorative gradients.
- Keep technical pages quiet, readable, and optimized for scanning.
- Support light and dark themes, keyboard navigation, reduced motion, mobile
  layouts, and WCAG 2.1 AA contrast.
- Avoid runtime package imports in the docs theme. Docs components may express
  the Sovereign visual language through local CSS tokens.

### Data and build boundaries

The first implementation remains static and auditable:

- Product, roadmap, and directory content are reviewed repository files.
- The site does not depend on a live Sovereign API at build or request time.
- Structured instance data is validated before publication when the directory
  moves beyond a candidate listing.
- Existing VitePress local search remains the search provider.
- Route compatibility and internal-link validation are release requirements.
- No Dockerfiles, Compose files, runtime ports, environment variables, or
  standalone runtime output are changed.

### Accessibility, performance, and privacy

- Target WCAG 2.1 AA and complete keyboard operation.
- Use semantic headings, landmarks, focus styles, skip links, useful image alt
  text, and adjacent text explanations for diagrams.
- Give images explicit dimensions and responsive formats.
- Target mobile Lighthouse scores of at least 90 for performance and 100 for
  accessibility on the homepage and a representative docs page.
- Add page titles, descriptions, canonical metadata, social previews, and a
  sitemap where supported.
- Do not add third-party analytics by default.

## UI flows

### Learn what Sovereign is

1. A visitor lands on the homepage and reads the product category and outcome.
2. The product visual and model explain an instance with users and apps.
3. The visitor reviews available capabilities without confusing planned work
   with shipped behavior.
4. The visitor chooses to try, host, build, or read technical documentation.

### Find an instance

1. A visitor opens **Instances**.
2. The page explains independent operation and the project's trust boundary.
3. The visitor reviews operator, audience, access policy, apps, policies, and
   verification date.
4. The visitor follows the external link and registers only under the operator's
   stated policy.

### Host an instance

1. A visitor chooses **Host your own**.
2. The operator guide distinguishes evaluation from production operation.
3. The visitor reviews operational responsibilities and prerequisites.
4. The visitor follows the existing deployment guide and then production,
   security, backup, and upgrade guidance.

### Install and enable notifications

1. A user opens their instance in a supported browser.
2. The user installs that instance to the Home Screen, app launcher, or desktop.
3. The user launches the installed app and opens Account → Notifications.
4. The user enables push on that device and grants the browser or OS permission.
5. The user can later mute categories or remove the device subscription.

### Build a custom app

1. A visitor chooses **Build an app**.
2. The page explains that user-facing apps are delivered as plugins.
3. The developer sees which shared capabilities are currently available.
4. The developer follows the plugin quickstart, SDK, data, UI, testing, and
   distribution documentation.

## Alternatives considered

### Keep the technical homepage and add one product page

Rejected because the first page would still require prior product knowledge and
would continue to hide the user journey.

### Build a separate marketing application

Rejected because it would duplicate navigation, content, deployment, search,
and visual maintenance. VitePress already provides the required static-site and
documentation foundation.

### Call Sovereign an app suite

Rejected because a suite implies a fixed bundle. The runtime and reusable
platform capabilities are central to the product.

### Automatically discover public instances

Rejected for the first release because discovery, verification, abuse handling,
health checks, metadata exposure, and delisting require a separate operational
and security design.

### Publish the engineering roadmap directly

Rejected because internal task ordering, identifiers, and experimental work are
not a stable product commitment and are difficult for non-contributors to
interpret.

## Open questions

1. Is `sovereign.openfs.io` a production, approval-based, invite-only, or
   demonstration instance, and who is its public operator?
2. Which privacy, terms, support, and registration-policy links may be published
   for that instance?
3. Which product workflows and screenshots are stable enough for the homepage?
4. Which capabilities belong in each public status at launch, particularly
   encryption-related capabilities?
5. Who owns ongoing review of product claims, screenshots, instance listings,
   and public roadmap horizons?
6. Will GitHub Pages remain the canonical domain after the revamp?

These questions can narrow later content without blocking the initial site
foundation and route structure. Unknown instance facts must remain visibly
unknown rather than being inferred.

## Adoption path

1. Land this RFC and retain the comprehensive internal planning document as
   implementation context.
2. Introduce the product-led theme, homepage, navigation, and audience hubs.
3. Add product education, getting-started, candidate instance, and public
   roadmap pages using verified claims only.
4. Reorganize technical documentation incrementally while preserving routes.
5. Add structured directory validation before accepting more than the initial
   candidate entry.
6. Complete browser, accessibility, performance, link, and metadata review
   before publishing the revamp.

This change affects only the docs site and prose. It does not require a root,
SDK, or UI package version bump. Epics and `docs/roadmap.md` remain unchanged.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |

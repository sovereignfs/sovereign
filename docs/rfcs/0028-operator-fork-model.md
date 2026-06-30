# RFC 0028 — Operator Fork Model & Upstream Sync

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `docs/`, `operator/` directory convention — no code changes, no new runtime surfaces, no version bumps\
**Incorporated into plan:** Yes — epic task 3.14.

---

## Summary

Most Sovereign operators should never fork the source — environment variables,
community plugins installed via `sv plugin add`, and the RFC 0027 branding system
give them full control over their deployment without touching a single source
file. This RFC documents the smaller group who genuinely need a fork: operators
running custom private plugins compiled into the same image, and commercial OEMs
building a white-labeled product for distribution under the dual-licensing model
(§2.7).

The fork model has one overriding rule — **never modify upstream files**. Custom
code lives in a dedicated `operator/` layer and `plugins/<operator-id>/`
directories. Because the operator's additions never share paths with upstream
files, `git rebase upstream/main` applies every upstream release without
conflict. This is the git-level expression of the SDK boundary rule: just as
plugins must not import from `runtime/src`, fork operators must not modify files
owned by upstream. Respecting this boundary means the fork can track upstream
indefinitely, picking up security patches and features with a single rebase
command.

## Motivation

Sovereign's positioning as a "modular, self-hostable workspace runtime" and its
AGPL + commercial dual-license model (§2.7) both point toward a world where
organisations and commercial builders extend the platform with their own code.
Three groups feel the gap today:

- **Organisations** deploying Sovereign internally who want to commit proprietary
  plugins to a private fork alongside the platform, then deploy one coherent
  image without an external clone step at build time.
- **Commercial OEM builders** constructing a white-labeled product for
  distribution on top of Sovereign core — they need a private (or public) fork
  that they can brand and release under a different name.
- **Ambitious self-hosters** who want to pin one or two private plugins alongside
  the platform and still receive upstream security fixes promptly.

All three share the same problem: no documented strategy for structuring the fork
so it does not diverge, and no documented process for pulling upstream changes
without conflict.

RFC 0006 (§3.15) defines the upgrade path for config-only operators (pull
versioned images, expand-contract migrations, `sv backup`/`restore`) but assumes
no source divergence. RFC 0027 (§3.18) defines the branding surface but says
nothing about the git workflow. This RFC fills both gaps.

## Current state

### Existing operator customisation surface (no fork needed)

```
.env                             ← secrets and per-deployment config (gitignored)
sovereign.plugins.json           ← declares community plugins to clone at install time
```

Operators can:

- Configure via `BRAND_*`, `DATABASE_URL`, `SMTP_*`, `AUTH_*` env vars
- Add community plugins with `sv plugin add <repo>` (clones into `plugins/<id>/`)
- Control installed plugins and root plugin from Console
- (Post RFC 0027) Upload logos and configure branding entirely via Console

`.gitignore` already ignores `/plugins/*/` except the three platform plugins
(`account`, `console`, `launcher`) — the foundation for a custom plugin layer
exists but no convention governs it.

### Existing upgrade guidance

RFC 0006/§3.15 documents a pull-based upgrade path (versioned Docker images,
expand-contract migrations, `sv backup`/`restore`, tag-pinned rollback). This
path assumes operators pull from upstream's image registry without source changes.
It does not cover fork-and-track scenarios.

### Existing open-source model

§2.7 states:

- Runtime and core plugins: AGPL-3.0
- SDK and shared packages: MIT
- Third-party (community) plugins: any license
- Commercial dual-license available for organisations needing private deployment
  without AGPL source-disclosure obligations

AGPL triggers on **distribution**, not self-hosted use. A private fork deployed
internally incurs no AGPL obligation; distributing a modified Sovereign to others
requires either AGPL source disclosure or the commercial license.

## Proposed design

### Track 1 — Config-only (the recommended default)

No fork. Operators use pre-built Docker images pinned by `SOVEREIGN_VERSION`,
configure entirely through env vars and Console, and install community plugins
via `sv plugin add` or `sovereign.plugins.json`. This track requires zero source
changes and survives every upstream release with `docker compose pull && docker compose up -d`.

**Operators should start here and only escalate to Track 2 when they have a
specific need that Track 1 cannot meet.** The two legitimate escalation reasons
are:

1. Custom plugins that must be compiled into the same image (not cloned from an
   external repo at build time) — typically for air-gapped environments or
   proprietary plugins whose source cannot be hosted publicly even temporarily.
2. Commercial OEM distribution — the operator is building a derivative product to
   distribute, not just deploying for themselves.

Everything else — branding, custom installed plugins, tenant settings, root
plugin — is satisfied by Track 1.

### Track 2 — Fork-and-track

#### Initial setup

```bash
# 1. Fork sovereignfs/sovereign on GitHub (public or private per your AGPL posture)
# 2. Clone your fork locally
git clone https://github.com/<org>/sovereign-fork
cd sovereign-fork

# 3. Track upstream as a named remote
git remote add upstream https://github.com/sovereignfs/sovereign
git fetch upstream
```

#### The isolation principle

The fork model rests on a single rule enforced by convention:

> **Operators never modify upstream-owned files. They only add new files in the
> fork-safe zone.**

This is the direct git equivalent of the SDK boundary rule (`no-restricted-imports`
blocks `runtime/src` imports in plugins). Both rules have the same justification:
crossing the boundary makes the component unmaintainable in the long run.

The file taxonomy:

| Zone            | Paths                                                                                                                                                                                                                                                    | Rule                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core-locked** | `runtime/`, `packages/`, `apps/`, `scripts/`, `bin/`, `plugins/account/`, `plugins/console/`, `plugins/launcher/`, `turbo.json`, `eslint.config.ts`, `prettier.config.ts`, `vitest.config.ts`, `pnpm-workspace.yaml`, `.github/workflows/` (upstream CI) | Never modify. Owned by upstream. Any edit here creates a conflict on the next rebase and signals a design problem — the right answer is almost always a community plugin or a new upstream RFC. |
| **Fork-safe**   | `plugins/<operator-id>/`, `operator/`, `sovereign.plugins.json` (additions only), `.env.example` (additions only), `.github/workflows/<operator>-*.yml` (operator CI only), `registry/` (additions only)                                                 | Operator-owned. Safe to add files freely. Upstream never creates files at these paths.                                                                                                          |

When the isolation principle is respected, `git rebase upstream/main` produces
zero conflicts because the two path sets are disjoint.

#### The `operator/` directory

Every fork should have a committed `operator/` directory containing the operator
layer. Its structure:

```
operator/
├── OPERATOR.md                   # fork identity, purpose, plugin list, AGPL note
├── UPSTREAM                      # plain text: upstream tag this fork is based on
└── docker-compose.override.yml   # deployment overrides (optional)
```

**`operator/UPSTREAM`** — updated by the operator after each successful upstream
sync. A single line: the upstream tag (e.g. `v1.3.0`) or commit SHA. Serves as
the machine-readable source of truth for which upstream version the fork tracks,
enabling a future `sv fork check` command to flag if the fork is behind.

**`operator/OPERATOR.md`** — a human-readable record of the fork:

```markdown
# <Org> Sovereign Fork

**Upstream:** sovereignfs/sovereign  
**Based on:** see `operator/UPSTREAM`  
**Purpose:** Internal deployment with proprietary CRM integration plugin

## Custom plugins

| Plugin ID          | Location                    | License     |
| ------------------ | --------------------------- | ----------- |
| `com.acme.crm`     | `plugins/com.acme.crm/`     | Proprietary |
| `com.acme.billing` | `plugins/com.acme.billing/` | Proprietary |

## AGPL compliance

This fork is deployed internally and not distributed externally.
No AGPL source-disclosure obligation applies.
For distribution scenarios, contact the Sovereign maintainers for the
commercial dual-license (see docs/sovereign-proposal-plan-srs.md §2.7).

## Contacts

Maintainer: platform-team@acme.com
```

**`operator/docker-compose.override.yml`** — Docker Compose natively merges an
`override` file with the base `docker-compose.yml`. Operators can use this to
customise service definitions (resource limits, extra volumes, network names)
without touching `docker-compose.yml` or `docker-compose.prod.yml`. Example:

```yaml
# operator/docker-compose.override.yml
services:
  runtime:
    environment:
      BRAND_NAME: 'Acme Workspace'
    deploy:
      resources:
        limits:
          memory: 2g
```

Apply with: `docker compose -f docker-compose.prod.yml -f operator/docker-compose.override.yml up -d`

#### Custom plugins in the fork

Operator plugins live in `plugins/<reverse-dns-id>/` — the community plugin
pattern (`type: "community"` in `manifest.json`). No new tooling is needed;
`pnpm generate` picks them up automatically since it scans all `plugins/*/`.

Because upstream plugin directories all use the `fs.sovereign.*` and
`io.openfs.sovereign.*` naming conventions, and operator plugins use their own
reverse-DNS IDs, the paths never collide.

**Update `.gitignore` to unignore your custom plugins:**

```text
# .gitignore — add alongside the existing platform-plugin allowlist:
!/plugins/com.acme.crm/
!/plugins/com.acme.billing/
```

Custom plugins are full community plugins: they use `@sovereignfs/sdk` and
`@sovereignfs/ui` only (the SDK boundary rule applies to them too), declare their
own permissions and `minPlatformVersion`, and appear in the Launcher grid and
sidebar like any installed plugin. They can be any license — they are not subject
to AGPL copyleft because they only import the MIT-licensed SDK and design system.

#### Asset management

**Pre-RFC 0027 (today):** Operators who need a custom logo or favicon can commit
them to `operator/assets/` (never to `runtime/public/` — that is core-locked).
A thin community plugin with a static asset route (`GET /my-brand/logo`) serves
them before the RFC 0027 branding infrastructure exists.

**Post-RFC 0027 (recommended):** Upload assets via the Console branding form.
They are stored in `data/brand/` (the named volume) and served by `/api/brand/*`.
Nothing is committed to the fork. This is the canonical path once RFC 0027 ships
and eliminates the need for the pre-RFC workaround entirely.

#### Upstream sync workflow

```bash
# Run this after each Sovereign upstream release:

# 1. Fetch latest upstream history
git fetch upstream

# 2. Rebase the fork's commits on top of the new upstream main
git rebase upstream/main
# Expected result when isolation principle is respected: zero conflicts.
# A conflict means a core-locked file was modified — fix by reverting the
# operator's change and expressing the intent as a community plugin or RFC instead.

# 3. Record the synced upstream version
git tag -l 'v*' upstream/main | sort -V | tail -1   # or note the tag manually
echo "v1.3.0" > operator/UPSTREAM
git add operator/UPSTREAM
git commit -m "chore: sync with upstream v1.3.0"

# 4. Push the rebased fork (force-push is required after a rebase;
#    use with care on a shared branch — coordinate with your team)
git push --force-with-lease origin main

# 5. Deploy using the standard upgrade procedure (RFC 0006 §3.15).
#    If your fork builds its own image, build/publish that image from the rebased
#    fork before recreating containers.
sv backup
docker compose -f docker-compose.prod.yml up --build -d
```

The rebase strategy is preferred over merge because it keeps the fork's history
linear (operator commits always appear after upstream commits), makes individual
upstream changes easy to inspect with `git log upstream/main..HEAD`, and avoids
merge commits that obscure the upgrade boundary.

#### When you hit a conflict

A conflict on `git rebase upstream/main` means one of two things:

1. **A core-locked file was modified by the fork** — almost always wrong. Identify
   what the fork was trying to achieve and express it as a community plugin, a
   new env var, or an upstream RFC instead. Then revert the core-locked change
   before the next sync.

2. **Upstream renamed or removed a fork-safe file** — rare (upstream almost never
   touches `operator/` or community plugin directories). Resolve normally.

If a conflict is unavoidable (e.g. `sovereign.plugins.json` — both the fork and
upstream added entries), resolve by keeping both sets of entries and committing
the merged result.

### AGPL compliance reference

| Scenario                                                            | Obligation                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Private fork, self-hosted internally, not distributed               | None. AGPL triggers on distribution, not private use.                            |
| Hosting a modified Sovereign as a service for external users (SaaS) | Must publish all source changes under AGPL **or** obtain the commercial license. |
| Building and distributing a white-labeled product                   | Requires the commercial dual-license (§2.7 — contact maintainer).                |

Custom community plugins (`plugins/<operator-*>/`) carry no AGPL obligation
regardless of scenario — they use only the MIT-licensed `@sovereignfs/sdk` and
`@sovereignfs/ui`, and the AGPL copyleft does not propagate through the SDK
boundary into plugins.

Operators should include a brief AGPL note in `operator/OPERATOR.md` describing
their compliance posture (as shown in the template above).

## UI flows

### Fork setup flow (one-time)

1. Fork on GitHub → clone locally → `git remote add upstream` → `git fetch upstream`.
2. Create `operator/UPSTREAM` (set to the current upstream tag).
3. Create `operator/OPERATOR.md` (fill in purpose, plugin list, AGPL note).
4. Add custom plugin directories under `plugins/<operator-id>/`; update `.gitignore` allowlist.
5. `pnpm install && pnpm generate` — verify the new plugins compose correctly.
6. Push to your fork's remote.

### Upstream sync flow (per release)

1. Check `operator/UPSTREAM` to see which version was last synced.
2. Read the Sovereign release notes / `docs/upgrade.md` for the new version.
3. `sv backup` — snapshot before the sync.
4. `git fetch upstream && git rebase upstream/main` — apply upstream changes.
5. Resolve any conflicts (see "When you hit a conflict" above).
6. Update `operator/UPSTREAM`, commit, push.
7. Build/publish your fork image if needed, then recreate containers.

## Alternatives considered

### Git subtree instead of rebase

`git subtree` embeds upstream history as a flattened blob, making it easy to
pull updates but impossible to inspect individual upstream commits or cherry-pick
specific fixes. The history becomes opaque. Rebase is more operationally complex
(force-push required) but gives a transparent, inspectable history. For
operators who sync with every release rather than cherry-picking, the rebase
overhead is one command.

### Operator plugins in a separate repo (installed at deploy time)

This is exactly Track 1 with `sv plugin add` or `sovereign.plugins.json` entries
pointing to the operator's private plugin repos. It is the right choice for
operators who can reach the plugin repos from their build environment. Committing
plugins to the fork is for operators who cannot (air-gapped environments, strict
supply-chain controls) or who prefer a single-repo deployment artefact.

### Package-based extension (operator publishes npm packages overriding runtime behaviour)

Rejected. The SDK boundary rule (`no-restricted-imports` ESLint rule) prevents
any code from importing `runtime/src` — including a hypothetical operator npm
package. There is no plugin API for overriding middleware, shell chrome, or auth
logic because that would break the isolation that makes upgrades safe. Any need
to change core behaviour at that level should be proposed as an upstream RFC.

### A `sv fork sync` CLI command

Deferred. The sync workflow is three git commands and one shell command. A
wrapper adds surface area without enough benefit at this stage. A `sv fork check`
command (warn when `operator/UPSTREAM` is behind the newest upstream tag) would
be more useful and is a natural follow-on once the convention is established.

### Monorepo split (fork the runtime only, plugins in sibling repos)

Some projects split the platform and its plugins into separate repositories and
use git submodules or workspace references to compose them. This adds tooling
complexity (submodule churn on every upstream bump) without meaningful benefit
for an operator who just wants to add one or two private plugins. The
`plugins/<operator-id>/` convention achieves the same result without submodules.

## Open questions

1. **`operator/UPSTREAM` format: plain text or JSON?** Plain text (single version
   tag line) is recommended now — simple to write, simple to read. A future
   `sv fork check` command can parse it. If structured metadata is later needed
   (pinned ref per plugin, minimum platform version the fork supports, etc.) it
   can evolve to JSON without breaking existing forks.

2. **Generate script integrity check** — should `pnpm generate` warn when it
   detects that core-locked files (e.g. `runtime/src/`) have been modified since
   the upstream version recorded in `operator/UPSTREAM`? This could be
   implemented by hashing the core-locked tree at each upstream tag and comparing
   at generate time. Deferred: the CI approach (running upstream's own test suite
   against the fork) catches violations more robustly, and the hash approach adds
   complexity to the generate script that most operators will never need.

3. **`docker-compose.override.yml` location** — `operator/docker-compose.override.yml`
   requires the operator to pass `-f operator/docker-compose.override.yml` on
   every `docker compose` invocation. An alternative is placing it at the repo
   root as `docker-compose.override.yml` (Docker Compose automatically merges a
   file with that name). The automatic merge is convenient but means a single
   override file must serve all compose targets (dev, prod, postgres overlay).
   The `operator/` convention keeps the operator layer clearly separated. The
   recommended upgrade docs can show both.

## Adoption path

This RFC is **documentation-first**. No code changes ship with the RFC. All
deliverables are documents.

| Phase  | Deliverable                                                                           | Status              |
| ------ | ------------------------------------------------------------------------------------- | ------------------- |
| 1      | `docs/rfcs/0028-operator-fork-model.md` (this file)                                   | Documentation-first |
| 1      | `docs/self-hosting.md` — "Maintaining a fork" section                                 | Documentation-first |
| 1      | `docs/rfcs/README.md` — new row                                                       | Documentation-first |
| 1      | `docs/sovereign-proposal-plan-srs.md` — §2.7 pointer + decision-log row               | Documentation-first |
| Future | `sv fork check` command — warns when `operator/UPSTREAM` lags the newest upstream tag | Optional follow-on  |

### Required doc updates

- `docs/self-hosting.md` — a new "Maintaining a fork" section summarising the
  two tracks and the upstream sync workflow (this RFC as the authoritative source)
- `docs/sovereign-proposal-plan-srs.md` — §2.7 Open Source Strategy gains a
  pointer to this RFC; one decision-log row
- `docs/rfcs/README.md` — new row for RFC 0028

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |

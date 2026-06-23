# Versioning Plan

This document explains how Sovereign's packages are versioned, clarifies the
current state of version numbers across the monorepo, and describes the
rectification plan for reaching v1.0.0.

---

## The short version

| What                              | Current version | Semver discipline                                                               |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| Root `package.json` (`sovereign`) | **0.9.3**       | Tracks roadmap phase milestones; stays `0.9.x` until the public `1.0.0` release |
| `runtime/package.json`            | **0.28.0**      | Tracks runtime features; each task that changes the runtime bumps this          |
| `@sovereignfs/sdk`                | **1.10.0**      | Published, stable public contract; strictly semver per NFR-04                   |
| `@sovereignfs/ui`                 | **0.10.0**      | Published, public contract; strictly semver per NFR-04                          |
| `@sovereignfs/db`                 | **1.6.0**       | Internal private package; semver tied to change type                            |
| `@sovereignfs/manifest`           | **0.14.0**      | Internal private package; semver tied to change type                            |
| `@sovereignfs/mailer`             | **0.1.0**       | Internal private package; essentially unchanged since Task 0.3.6                |
| `@sovereignfs/auth`               | **0.8.0**       | Internal (apps/auth); semver tied to change type                                |
| `plugins/console`                 | **0.12.0**      | Internal; semver tied to change type                                            |
| `plugins/account`                 | **0.9.0**       | Internal; semver tied to change type                                            |
| `plugins/launcher`                | **0.1.0**       | Internal; minimal changes since initial implementation                          |

---

## Background: why the version numbers look confusing

### The root platform version tracks roadmap phases

The root `package.json` version is **unfrozen** and now tracks roadmap phase
milestones via minor bumps (one per completed phase) and patch bumps within a phase
(one per completed pre-release hardening task). It stays under `1.0.0` until the
public release — only minor and patch changes are allowed pre-v1.

The roadmap task numbering (`0.3.x`, `0.4.x`, `0.5.x`, etc.) maps directly to
root minor versions. This was formerly decoupled (root frozen at `0.6.0` while
tasks advanced through phases 0.7.x, 0.8.x, 0.9.x, 1.0.x), but that drift made
the root version meaningless. The rectified scheme aligns the two.

### The runtime package drifted into being the "release version"

While the root `package.json` was frozen, the `runtime` package (`runtime/package.json`)
was bumped with every meaningful task — from `0.2.0` in Task 0.4.4 all the way
to `0.28.0` after Task 0.8.4. This happened because:

1. Most tasks change the runtime, so bumping `runtime/package.json` was a natural
   way to track "what changed".
2. The Docker image publication workflow uses GHCR tags that correspond to the
   runtime version (SOVEREIGN_VERSION in Compose files).
3. The upgrade guide (`docs/upgrade.md`) adopted these runtime version numbers as
   its section labels (e.g., "v0.14 → v0.15", "v0.27 → v0.28").

The result: the `runtime` package version has become the de-facto "release version"
that operators track. The upgrade guide's opening paragraph previously said "The
root `package.json` version tracks roadmap milestones" — this was incorrect and
has been corrected. **The upgrade guide version numbers refer to `runtime` package
versions, not the root `package.json`.**

### Per-package versions are independent

Internal packages follow normal semver tied to change type:

- `fix/` branch → patch bump
- `feat/` branch → minor bump
- Breaking change → major bump

Internal packages **may** cross `1.0.0` — for example, `@sovereignfs/db` is
already at `1.6.0`. These are internal versions and do not represent a
user-facing product release.

The published packages `@sovereignfs/sdk` (stable at `1.10.0`) and
`@sovereignfs/ui` (at `0.10.0`) follow their own independent public semver per
NFR-04. The SDK's `1.x` line is a stable contract; the UI is still in its
`0.x` maturation phase. Both are exempt from the platform's "stay under v1" rule.

---

## Root version map (current and planned)

| Root version | Milestone                                                                            |
| ------------ | ------------------------------------------------------------------------------------ |
| `0.3.0`      | Foundation complete (monorepo, packages, auth, runtime, Docker)                      |
| `0.4.0`      | Core plugin trio complete (Console, Launcher, Account)                               |
| `0.5.0`      | Platform features complete (SDK, security, PWA, overlays, CLI, Postgres, CI, etc.)   |
| `0.6.0`      | Roles & capabilities (RFC 0021, RFC 0022)                                            |
| `0.7.0`      | Notifications (RFC 0015 Notification Center, RFC 0016 Web Push)                      |
| `0.8.0`      | Monetization & isolated databases (RFC 0003, RFC 0004)                               |
| `0.9.0`      | E2E test suite complete (Task 0.8.2, Playwright)                                     |
| `0.9.1`      | Storybook for the design system (Task 0.8.5)                                         |
| `0.9.2`      | Production dev-mode & diagnostics (Task 0.8.3)                                       |
| `0.9.3`      | White-labeling Phase 1 + Console UX polish (Task 0.8.4 + ad-hoc tasks) — **current** |
| `0.9.4`      | Instance identity rename (Task 0.9.0, RFC 0032)                                      |
| `0.9.5`      | Notification pub/sub transport (Task 0.9.2, RFC 0034)                                |
| `0.9.6`      | Email templates + White-labeling Phase 2 (Task 0.9.3, RFC 0031 + RFC 0027)           |
| `0.9.7`      | White-labeling Phase 3: dynamic PWA manifest (Task 0.9.4, RFC 0027)                  |
| `0.9.8`      | systemd deployment (Task 0.9.5, RFC 0026)                                            |
| `0.9.9`      | Operator fork model docs (Task 0.9.6, RFC 0028)                                      |
| **`1.0.0`**  | **Public release**                                                                   |

---

## Runtime version map (as of runtime 0.28.0)

The table below maps the runtime package version at which each major capability was
added. This is the reference that `docs/upgrade.md` uses for its section headings.

| Runtime version | Key capability delivered                                                  |
| --------------- | ------------------------------------------------------------------------- |
| 0.2.0           | Platform DB (tenant_settings, root plugin config), Console settings       |
| 0.3.0           | Launcher plugin, root-plugin-in-place rewrite                             |
| 0.4.0           | Account plugin (profile + preferences)                                    |
| 0.5.0           | Plugin install script, PWA configuration                                  |
| 0.6.0           | Local session verification (cookie-cache, AUTH-05)                        |
| 0.7.0           | Public `/api` namespace delegation (PLT-16)                               |
| 0.8.0–0.9.1     | Overlay shell mode (RFC 0001), Dialog UI primitive                        |
| 0.9.0           | Logout / self sign-out (AUTH-02)                                          |
| 0.10.0          | Security hardening Tier 0 + Tier 1 (RFC 0008)                             |
| 0.11.0          | SDK distribution (RFC 0023), zero-dep published SDK                       |
| 0.12.0          | Plugin compatibility & versioning (RFC 0024)                              |
| 0.13.0          | Cross-plugin data sharing (RFC 0002)                                      |
| 0.14.0–0.14.1   | Activity log (RFC 0005), icon system (RFC 0011)                           |
| 0.15.0          | Drizzle-kit migrations, `sv backup`/`restore`, downgrade guard (RFC 0006) |
| 0.16.0          | User data portability (RFC 0007)                                          |
| 0.17.0          | Plugin-scoped env vars (RFC 0018)                                         |
| 0.18.0          | Minimal shell mode (RFC 0014)                                             |
| 0.19.0          | Mobile responsiveness & PWA hardening (RFC 0013)                          |
| 0.20.0          | Passkeys & TOTP MFA (RFC 0012), offline connectivity banner               |
| 0.21.0          | Platform roles & capabilities (RFC 0021)                                  |
| 0.22.0          | Notification Center (RFC 0015)                                            |
| 0.23.0          | Web Push notifications (RFC 0016)                                         |
| 0.25.0–0.25.1   | Plugin monetization (RFC 0003), license generator, entitlements           |
| 0.26.0          | Per-plugin isolated database (RFC 0004)                                   |
| 0.27.0          | Production dev-mode & diagnostics (RFC 0020)                              |
| 0.28.0          | White-labeling Phase 1 (RFC 0027)                                         |

Note: some runtime minor versions (0.24.0) were used by intermediate sub-tasks or
patch versions of earlier milestones and are not listed individually.

---

## What is not yet built

### Remaining pre-v1 tasks

These ship before `v1.0.0` and bump the root patch version with each merge:

| Task                                                                           | Root version after merge |
| ------------------------------------------------------------------------------ | ------------------------ |
| ✅ Task 0.9.0 — Instance identity rename (RFC 0032)                            | `0.9.4`                  |
| ✅ Task 0.9.1 — User data deletion (RFC 0033)                                  | `0.9.1`                  |
| ⏳ Task 0.9.2 — Notification pub/sub transport (RFC 0034)                      | `0.9.5`                  |
| Task 0.9.3 — Email templates + White-labeling Phase 2 (RFC 0031 + RFC 0027)    | `0.9.6`                  |
| Task 0.9.4 — White-labeling Phase 3: dynamic PWA manifest + favicon (RFC 0027) | `0.9.7`                  |
| Task 0.9.5 — Non-Docker Phase 2: systemd (RFC 0026)                            | `0.9.8`                  |
| Task 0.9.6 — Operator fork model & upstream sync (RFC 0028)                    | `0.9.9`                  |

### Post-v1 (will not ship before `1.0.0`)

- **Task 1.0.1** — Encryption at rest, field-level, Tier 2–4 (RFC 0008)
- **Task 1.0.2** — Phase 2 payment integration (RFC 0003 Phase 2)
- **Task 1.0.3** — Internationalization, Phase 1 — Infrastructure (RFC 0029)
- **Task 1.0.4** — Internationalization, Phase 2 — Platform shell adoption (RFC 0029)
- **Task 1.0.5** — Analytics, Phase 1 — Plugin scaffold + server-side infrastructure (RFC 0030)
- **Task 1.0.6** — Analytics, Phase 2 — Client-side click tracking + heatmaps (RFC 0030)

---

## Rectification plan

### What is already correct

- Every individual package (`runtime`, `sdk`, `ui`, `db`, `manifest`, etc.) is
  on the correct semantic version for the features it has shipped. **No package
  version changes are needed.**
- The upgrade guide's section headings correctly correspond to runtime version
  transitions. The incorrect opening paragraph has been fixed.
- The published packages (`@sovereignfs/sdk`, `@sovereignfs/ui`) follow their
  own public semver and are published from the `sdk-v*` / `ui-v*` tag pattern.

### What needs to happen before v1.0.0

1. **Complete remaining pre-v1 tasks** (Tasks 0.9.0–0.9.6): each task bumps
   the root version by a patch (`0.9.4` → `0.9.5` → … → `0.9.9`).
2. **Bump root `package.json` to `1.0.0`** in the final release PR — after the
   last hardening task merges.
3. **Bump runtime to `1.0.0`** to match the product release (see Option A below).
4. **Tag the release**: `git tag v1.0.0`, push, and let the Docker image
   publish workflow produce the `v1.0.0` GHCR image.
5. **Update `docs/upgrade.md`** with final transition notes for `0.9.9 → 1.0.0`.
6. **Branch convention changes at v1.0.0**: `main` becomes the production branch
   and `dev` the integration branch (as noted in CLAUDE.md).

### What does NOT need to change

- The `@sovereignfs/sdk` version: it is already in stable `1.x` territory and
  will continue its own semver independently.
- The `@sovereignfs/ui` version: it is on `0.10.0` and will continue its own
  semver independently.
- Any internal package versions: they track their own history and have no public
  semver promise to uphold.
- **`CLAUDE.md` Status section task numbers**: the Status log is a timestamped
  historical record ("merged to `main`") written at the time each task landed.
  Those entries use the task numbers that existed at the time of merge (the
  pre-renumbering scheme, e.g. `0.5.15 — Security hardening`). Rewriting history
  to match the new numbers would introduce confusion rather than clarity. The
  **roadmap** is the canonical task-number reference going forward; CLAUDE.md's
  Status log is a narrative record, not a cross-reference index.

### Version consistency going forward

Once `v1.0.0` ships:

- Operator-facing release versions should reference the **root `package.json`**
  (which will be `1.0.0`, `1.0.1`, `1.1.0`, etc.) rather than the runtime package
  version. The runtime package can continue to bump for internal tracking.
- The upgrade guide should be reorganised after `v1.0.0` to use root `package.json`
  versions as the section labels (e.g., "v1.0 → v1.1") rather than runtime-internal
  ones.
- The Docker image GHCR tag (`SOVEREIGN_VERSION`) should reflect the root
  `package.json` version at and after `v1.0.0`.

---

## Open question: `runtime` vs root version alignment at v1.0.0

Currently the runtime is at `0.28.0` and the root is at `0.6.0`. Two options
for the v1.0.0 release:

**Option A — aligned:** bump both root and runtime to `1.0.0` simultaneously.
Clean break; both represent the same release milestone. Easier to communicate
to operators.

**Option B — independent:** bump root to `1.0.0`; let runtime continue on
`0.x` (e.g., `0.32.0`). Preserves the independent-semver discipline for internal
packages; avoids a version "lie" for the runtime if it has breaking API surface
to still change.

**Recommendation: Option A.** The runtime is the product from an operator's
perspective. Aligning both to `1.0.0` is clearer and avoids operators seeing
a `sovereign@1.0.0` container running on `runtime@0.32.0` and wondering about
the mismatch. The runtime's internal API surface is not publicly contracted
(only SDK and UI are), so the jump is not misleading.

This decision is deferred until the remaining pre-v1 tasks are complete.

# Sovereign Core — Epics

A domain-first map of the work on `sovereign-core`. An epic groups the tasks of
one domain, whichever phase they belong to; later phases add tasks to the same
epics. [`ROADMAP.md`](../../ROADMAP.md) is the chronological index of the same
tasks, in the order they are built.

What the core app must do is defined in
[`docs/specs/core-app.md`](../specs/core-app.md). Every task cites the spec
sections it implements; where a task and the spec disagree, the spec wins and
the task is corrected.

## Conventions

- **Task IDs are permanent:** `<epic>.<n>`, for example `4.3`. Use them in
  dependency lists and cross-references. They never appear in branch names,
  commit messages or PR titles.
- **One task, one branch, one PR.** A task is done when its review checklist
  passes and its PR is merged.
- **Dependencies** list the tasks that must be merged first. A task marked
  `[parallel]` can run alongside the other tasks whose dependencies are met.
- **On completion,** the task's heading here and its row in `ROADMAP.md` are
  marked ✅ in the same PR, and the root version is bumped (minor per task).
- **Every task** carries a Goal, Deliverables, Dependencies, a Spec reference and
  a Review checklist.
- The full lifecycle — `/sv-task-start` to `/sv-create-pr` — is in
  [`docs/development-workflow.md`](../development-workflow.md).

## Epics

| ID  | Epic                                          | Status     | Summary                                                                           |
| --- | --------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| 0   | [Infrastructure](infrastructure.md)           | 📋 Planned | Workspace, CI, repository documents, Docker, Phase 1 acceptance                   |
| 1   | [Configuration & Data](configuration-data.md) | 📋 Planned | `packages/config`, `packages/database`, encryption of stored secrets, base schema |
| 2   | [Design System](design-system.md)             | 📋 Planned | `packages/ui` in the new workspace, publishing, components core needs             |
| 3   | [Mail](mail.md)                               | 📋 Planned | `packages/mailer`, SMTP configuration, templates                                  |
| 4   | [Identity & Auth](identity-auth.md)           | 📋 Planned | Sign-up, sign-in, verification, reset, TOTP, passkeys, sessions                   |
| 5   | [Roles & Capabilities](roles-capabilities.md) | 📋 Planned | Platform roles, capability matrix, ownership                                      |
| 6   | [OIDC Provider](oidc-provider.md)             | 📋 Planned | Sign-in server for apps: flows, claims, consent, logout                           |
| 7   | [Apps & Launcher](apps-launcher.md)           | 📋 Planned | Client registry with launcher entries, the launcher                               |
| 8   | [Console](console.md)                         | 📋 Planned | Operators' administration area                                                    |
| 9   | [Identity Pages](identity-pages.md)           | 📋 Planned | A person's own account pages                                                      |
| 10  | [Core API](core-api.md)                       | 📋 Planned | `spec/core-api`, `packages/api-client`, Directory API, branding                   |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned · 🚧 Parked · ❌ Rejected_

## Phase 1 milestones

| Milestone                                  | Outcome                                                                                               | Tasks                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **M0 — Foundation**                        | The workspace builds and tests; the three databases work; the design system runs in the new workspace | 0.1–0.4, 1.1–1.4, 2.1–2.2                   |
| **M1 — People can sign in to core**        | Sign-up, sign-in, verification, reset, TOTP, passkeys, sessions, roles; basic identity pages          | 3.1–3.2, 4.1–4.7, 5.1, 9.1–9.3              |
| **M2 — Core is a sign-in server for apps** | OIDC provider with consent, registered apps, launcher, Console, the rest of the identity pages        | 5.2–5.3, 6.1–6.3, 7.1–7.2, 8.1–8.6, 9.4–9.5 |
| **M3 — Phase 1 complete**                  | Core API and Directory, branding, Docker, the acceptance suite                                        | 10.1–10.3, 0.5, 0.6                         |

Task 2.3 runs throughout M1 and M2.

## Open spec questions

None block Phase 1. A question found while working on a task is answered in
the spec before the tasks that depend on it start.

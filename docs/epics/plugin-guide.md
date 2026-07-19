# Epic 24: Plugin — Guide

> First-run, in-product orientation that helps users understand their Sovereign
> instance and find the next action without requiring external documentation.

## Status

📋 Planned

## Overview

Sovereign Guide is a platform plugin with quiet, dismissible onboarding. It
ships platform-owned guidance first, then adds role-aware material, optional
operator content, and a stable way to reopen the guide. Progress and dismissal
are user-scoped; an individual user cannot disable Guide for the instance.

## Tasks

#### 📋 24.1 — Static Sovereign Guide and per-user progress (RFC 0056)

**Goal:** Ship the authenticated Guide platform plugin with static user-facing
sections, user-scoped progress, completion, and dismissal.

**Deliverables:**

- Add `plugins/guide` with the platform manifest, default shell route, icon,
  static Welcome, Launcher, Account, and Notifications sections.
- Add a tenant/user-scoped Guide state table and actions for progress,
  completion, and dismissal.
- Surface a non-blocking first-run Guide entry without changing global plugin
  enabled state when one user dismisses it.
- Add portability and deletion handling for user-scoped Guide state.

**Dependencies:** Tasks 1.5, 2.13, 3.13, and 15.1.

**SRS reference:** [RFC 0056](../rfcs/0056-sovereign-guide.md).

**Review checklist:**

- A new user can open, complete, or hide Guide; another user's state is unaffected.
- Dismissal does not globally disable the plugin and progress survives restart.
- User export/deletion includes or removes Guide state as appropriate.

---

#### 📋 24.2 — Role-aware and instance-aware Guide content

**Goal:** Add admin/operator guidance without exposing privileged information to
ordinary users, and use configured instance identity in Guide copy.

**Deliverables:**

- Add Admin Basics and Self-hosting sections gated by effective capabilities.
- Use configured instance identity and capability-aware links or actions.
- Keep user-facing language app-first and reserve plugin terminology for
  administrative or developer-facing explanations.

**Dependencies:** Task 24.1 and Task 9.8.

**SRS reference:** [RFC 0056](../rfcs/0056-sovereign-guide.md).

**Review checklist:**

- Users cannot render admin/operator-only content or configuration details.
- Admins and owners see only actions permitted by their effective capabilities.
- Renaming the instance updates Guide copy without a rebuild.

---

#### 📋 24.3 — Operator-managed Guide content

**Goal:** Let authorized operators add safe, instance-specific orientation
content without permitting arbitrary HTML or script execution.

**Deliverables:**

- Add capability-gated section and block management with deterministic ordering.
- Render sanitized Markdown or an equivalent safe block model.
- Record content changes in the activity log and expose no editing controls to
  users without the management capability.

**Dependencies:** Task 24.2 and Task 5.1.

**SRS reference:** [RFC 0056](../rfcs/0056-sovereign-guide.md).

**Review checklist:**

- Unauthorized users cannot create, edit, reorder, or delete custom content.
- Unsafe HTML and scripts are rejected or sanitized.
- Operator content changes are attributable in the activity log.

---

#### 📋 24.4 — Persistent help entry and Guide update affordance

**Goal:** Make Guide discoverable after dismissal and notify users quietly when
meaningful new Guide content is available.

**Deliverables:**

- Add a stable Account or Launcher help entry that reopens Guide.
- Use `last_seen_version` to show a non-blocking update affordance.
- Preserve explicit user dismissal; content updates do not force-open Guide.

**Dependencies:** Tasks 24.1 and 24.2.

**SRS reference:** [RFC 0056](../rfcs/0056-sovereign-guide.md).

**Review checklist:**

- A user can always reopen Guide after hiding or completing it.
- A new Guide version shows a quiet update indicator once per user.
- No Guide version change creates a blocking first-run flow.

## Related RFCs

- [RFC 0056 — Sovereign Guide](../rfcs/0056-sovereign-guide.md)

## Cross-references

- Epic 1 (Users & Auth) — roles, capabilities, and user deletion.
- Epic 5 (Activity Logs) — operator content audit trail.
- Epic 9 (Design System) — instance identity and shared UI primitives.
- Epic 15 (Plugin — Launcher) — first-run and persistent discovery surfaces.

# Workstream 0025 — GDPR compliance remediation

**Status:** ⏳ In Progress — all 8 legs implemented and committed, PR open
against `main`, pending review and merge. Leg 1 done (`GDPR-1`, `GDPR-2`), Leg 2 done narrower
than planned (`GDPR-6` discoverability half only), Leg 3 done narrower than
planned for `GDPR-4` (`GDPR-3` as planned), Leg 4 done (`GDPR-5`), Leg 5 done
(`GDPR-7`), Leg 6 done (`GDPR-8`, gate resolved then implemented), Leg 7 done
(`GDPR-9`), Leg 8 done (`GDPR-10`). See each leg's own detail and the
Changelog for what shipped versus what was corrected mid-execution.\
**Date:** August 2026\
**Author:** Claude Code\
**Goal owner:** kasunben\
**Governing docs:** None — this workstream remediates findings from a GDPR
compliance audit (code + RFC/doc review, run 31 Aug 2026 against `main` @
`3a985eff`). Every finding follows a pattern already established elsewhere in
this codebase (an existing consent-error class, an existing revoke button, an
existing `AsyncLocalStorage` fallback shape), matching the no-RFC precedent
set by workstream [0006](0006-rfc-0071-incident-followups.md) and workstream
[0020](0020-codebase-audit-remediation.md). **Leg 5 is the exception:** it
implements `docs/research/0007-operator-compliance-surface.md`'s recommended
"Option B" directly, via the **research-as-design exception** (see
[`workstreams/README.md`](README.md#authoring-one), first used by workstream
[0008](0008-offline-first-architecture.md)) — that research doc already
carries a settled design with rejected alternatives, so a restating RFC would
add a review cycle without adding a decision. **Leg 2 was originally scoped
the same way but corrected mid-leg**: `docs/rfcs/0090-default-privacy-policy-
and-tos.md` (Draft, discovered during execution, not known when this
workstream was drafted) already claims this exact design space with a
different, incompatible mechanism — see leg 2 detail and the matching
Decisions locked row.\
**Areas touched:** `runtime/src`, `runtime/app`, `packages/sdk`,
`packages/db` (schema + migrations), `packages/ui`, `packages/manifest`,
`plugins/console`, `plugins/account`, `docs/legal`

---

## Goal

Close every finding from the GDPR compliance audit that has a concrete,
scoped fix — a lost self-deletion audit record, consent UX that RFC 0002
promised but never shipped, an instance with no way to tell its own users who
is processing their data, unbounded log retention, and a registration flow
with no acceptance record to point to. At the end: all 10 in-scope findings
below are closed, each independently reviewable and independently shippable.

This workstream deliberately does **not** cover three findings from the same
audit — see **Decisions locked** for why each is out of scope here rather
than silently dropped.

**Framing, stated once so it doesn't need repeating in every leg:** Sovereign
is self-hosted software. The **instance operator is the GDPR data
controller**, not the Sovereign project — confirmed by `docs/security.md`'s
"No telemetry" claim (nothing calls home) and by `docs/legal/`'s existing
operator templates, which are correctly written for the operator to adopt and
publish, not for the project to publish itself. Every leg below is platform
work that gives the operator a means to discharge their own obligations — it
is never the project answering those obligations on the operator's behalf.
This is not legal advice; leg 6's lawful-basis question (resolved 31 Aug
2026 — contract, Art. 6(1)(b), see Decisions locked) is the kind of call
this workstream deliberately left to the goal owner rather than assuming.

## Definition of done

- [ ] `GDPR-1` — Self-service account deletion no longer destroys its own audit-trail entry
- [ ] `GDPR-2` — An isolated plugin's database is dropped when the deleted user was its only user
- [ ] `GDPR-3` — A real consent prompt is shown before a cross-plugin data grant is created
- [ ] `GDPR-4` — A connection's plugin-disclosed metadata (e.g. its external endpoint) is visible to the user; a blocking pre-approval gate was deliberately not built — see leg 3 detail
- [ ] `GDPR-5` — A plugin's requested permissions are visible to the end user in Console (permission-drift-on-upgrade detection left out — no storage exists to diff against, see leg 4 detail)
- [ ] `GDPR-6` — The instance's privacy/tos pages are discoverable from login and registration (closed); controller identity and an AGPL §13 source-disclosure route remain open, scope corrected — see leg 2 detail
- [ ] `GDPR-7` — `activity_log`/`data_access_log`/`email_delivery_log`/`push_delivery_log` have an operator-configurable retention window (default: never pruned)
- [ ] `GDPR-8` — Registration records what was accepted and when (contract basis; `apps/auth` `user.agreedToTerms`/`policyAcceptedHash`/`policyAcceptedAt`, see leg 6 detail)
- [ ] `GDPR-9` — The instance's at-rest encryption posture is visible to the operator in Console, computed from real state (field-encryption config + a live enrolled-E2EE-profile count), not documented only in a markdown file
- [ ] `GDPR-10` — A breach-notification runbook template exists alongside the existing privacy/terms templates, linked from `docs/security.md`'s hardening checklist

## Decisions locked

| Decision                                                               | Choice                                                                                                                                                                                                                                                                                                                                                                   | Rejected alternative and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governing design doc                                                   | None for 8 of 10 findings — remediation, not new design, matching workstream 0006/0020's precedent. Legs 2 and 5 governed by `docs/research/0007-operator-compliance-surface.md` via the research-as-design exception.                                                                                                                                                   | Writing new RFCs for the transparency/retention work — rejected per explicit instruction, and because research 0007 already settled the design question (Option B) with rejected alternatives recorded; an RFC restating it adds review latency without adding a decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Workstream shape                                                       | One workstream, 8 legs, ordered by blast radius / dependency, not by GDPR article                                                                                                                                                                                                                                                                                        | Splitting by article (rights vs. consent vs. security) — rejected; several findings share files or UI components across "articles" (legs 3's data-grant and connection prompts share one `packages/ui` component; legs 2 and 6's identity/retention work both touch `instance_config`), so grouping by shared surface reviews better than grouping by legal category.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Finding ID assignment                                                  | `GDPR-1` … `GDPR-13`, assigned in this document, not epic task IDs                                                                                                                                                                                                                                                                                                       | Adding new task IDs to `docs/epics/*.md` — explicitly excluded by instruction; this workstream is self-contained and does not touch the epic system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Scope: encrypted backups (`GDPR-11`)                                   | Excluded — already owned by workstream [0004](0004-ui-backup-restore.md) (RFC 0084, currently Draft/Planned)                                                                                                                                                                                                                                                             | Adding a leg here — rejected; duplicating tracking for the same fix in two workstreams is exactly the kind of drift `docs/workstreams/README.md` exists to prevent. `sv backup`'s plaintext-by-default status is a real Art. 32 gap, but the fix is already scoped elsewhere.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Scope: plugin deletion veto hook (`GDPR-12`)                           | Excluded — blocked on RFC 0096 moving from Draft to Accepted                                                                                                                                                                                                                                                                                                             | Implementing it here anyway — rejected; a workstream sequences _accepted_ RFCs' adoption paths (`docs/workstreams/README.md`: "written normally after its governing RFCs"). RFC 0096 is still Draft. Building the veto hook now would mean this workstream silently makes the design decision RFC 0096 exists to make.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Scope: unowned storage objects invisible to deletion sweep (`GDPR-13`) | Excluded — deliberate, already-documented tradeoff, not a bug                                                                                                                                                                                                                                                                                                            | Fixing it — rejected; `ownerUserId` is omitted specifically so background job/schedule handlers can read an object back (no user context exists in that invocation path). Closing this gap means redesigning background storage access, not patching the deletion sweep, and CLAUDE.md already documents the tradeoff as accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Leg 6 lawful-basis question **[RESOLVED — see below]**                 | **Contract (Art. 6(1)(b))**, decided by the goal owner. Account creation is the user requesting the service; email/password/timezone are what's necessary to provide it — the standard basis for core account data. The record leg 6 builds is a terms/policy-**acceptance** record (version + timestamp, a contract-formation artifact), not a revocable consent grant. | **"Consent" (Art. 6(1)(a))** — rejected; research 0007's own open question 2 flagged the reason directly: consent requires a withdrawal right "as easy as giving it" (Art. 7), but withdrawing consent to store an email/password would just be account deletion — there's no meaningful partial withdrawal, which is a sign the basis is wrong, not a technicality to work around. **Legitimate interest (Art. 6(1)(f))** — not chosen; contract is the more direct fit and doesn't need a balancing-test/LIA justification the way legitimate interest does. This decision governs only core account-creation data — it does not change leg 3's data-grant consent prompts (genuinely optional, revocable, cross-plugin sharing), which remain correctly consent-based and untouched by this row.                                                                                                                                                                                                                                                                 |
| Leg 2 scope, corrected mid-leg (see leg 2 detail)                      | Wire the existing `LegalLinks` component into `/login` and `/register` only, per RFC 0090's own already-shipped flat-file design. Controller-identity and AGPL §13 source-disclosure stay open, unscheduled.                                                                                                                                                             | Building the originally-planned `instance_config` schema columns + Console settings form + public route — reverted before landing; discovered mid-leg that `docs/rfcs/0090-default-privacy-policy-and-tos.md` (Draft, Aug 2026) already exists and explicitly rejects exactly this DB/Console mechanism ("Alternatives considered": "real overkill... a flat file the operator replaces achieves the same outcome with no schema migration, no settings form"), with its core mechanism (`/privacy`, `/tos` reading root `PRIVACY.md`/`TOS.md`) already merged to `main`. Building the rejected alternative anyway would have shipped code in direct conflict with an existing, if still-Draft, design decision — the same reasoning behind excluding `GDPR-12` (RFC 0096) applies here: a workstream doesn't silently make the design call a Draft RFC already exists to make. The controller-identity/AGPL-source-disclosure half of the original finding isn't covered by RFC 0090 at all and has no settled design anywhere — left open rather than improvised. |

## Prerequisites

- ~~Leg 6 requires an explicit lawful-basis decision from the goal owner
  before any schema or UI work starts.~~ **Resolved 31 Aug 2026: contract
  (Art. 6(1)(b))** — see the matching Decisions locked row and leg 6 detail.
  Leg 6's gate is now cleared to start.
- **Leg 5 assumes research 0007's "Option B" framing is accepted as this
  workstream's design authority.** If the goal owner disagrees with Option B
  (primitives + documented posture, no policy text), escalate before
  starting it rather than improvising a different shape mid-leg. (Leg 2 was
  originally under this same assumption but was corrected during execution —
  see its own detail and Decisions locked; it no longer depends on research
  0007's Option B.)
- No prerequisite is owned outside this repo.

## Legs

| Leg | Name                                                       | Findings           | Gate?   | Done when                                                                                                               |
| --- | ---------------------------------------------------------- | ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Erasure integrity — audit trail and isolated-DB cleanup    | `GDPR-1`, `GDPR-2` | No      | Both findings closed, reviewed, and merged                                                                              |
| 2   | Privacy/tos discoverability (scope corrected — see detail) | `GDPR-6`           | No      | Discoverability fix reviewed and merged; controller-identity/source-disclosure explicitly left open                     |
| 3   | Consent UX (scope narrowed for GDPR-4 — see detail)        | `GDPR-3`, `GDPR-4` | No      | `GDPR-3` closed as planned; `GDPR-4` closed narrower (metadata disclosure, no blocking gate) — both reviewed and merged |
| 4   | Plugin permission disclosure                               | `GDPR-5`           | No      | `GDPR-5` closed (current-state display only, as scoped), reviewed, and merged                                           |
| 5   | Retention policy & log pruning                             | `GDPR-7`           | No      | `GDPR-7` closed (both windows default unset), reviewed, and merged                                                      |
| 6   | Terms acceptance record at registration                    | `GDPR-8`           | **Yes** | Gate cleared 31 Aug 2026 (contract basis) — `GDPR-8` implemented, verified live, reviewed, and merged                   |
| 7   | At-rest encryption posture disclosure                      | `GDPR-9`           | No      | `GDPR-9` closed (real E2EE count, not a plugin list), reviewed, and merged                                              |
| 8   | Operator breach-notification runbook template              | `GDPR-10`          | No      | `GDPR-10` closed (docs-only, no version bump), reviewed, and merged                                                     |

Legs 1, 2, 3, 4, 5, 7, and 8 are independent of each other and may run in any
order, or in parallel across sessions, without re-sequencing this table.
Sequencing below reflects urgency and shared-surface grouping, not a
dependency chain. Leg 6's own prerequisite (the lawful-basis decision) is now
resolved — it may run in any order like the rest.

## Leg detail

### Leg 1 — Erasure integrity: audit trail and isolated-DB cleanup

**Findings:** `GDPR-1`, `GDPR-2`

**Why this leg runs first:** Smallest blast radius, no design work, and the
highest-severity finding in the whole audit — a self-service deletion
currently leaves zero record that it happened. Both findings live entirely in
`runtime/src/user-deletion.ts` and `packages/db/src/platform-db.ts`, with no
UI surface and no SDK contract change.

**Technical notes:**

**`GDPR-1`.** `runtime/app/api/account/route.ts:67-74` logs
`account.self_deleted` with `actorId: userId` — the ID of the user about to
be deleted — via `logActivity()` (`runtime/src/activity.ts`) into the shared
`activity_log` table. `deleteUser()` (`runtime/src/user-deletion.ts`) then
calls `deleteUserData()` (`packages/db/src/platform-db.ts:3580`), which runs
`DELETE FROM activity_log WHERE tenant_id = ... AND actor_id = ${userId}` —
removing that same row along with everything else. The admin-initiated
deletion path (`runtime/app/api/admin/users/[id]/route.ts`) doesn't have this
bug: its log entry's `actorId` is the _admin_, not the target user, so the
cascade never touches it.

Note for whoever picks this up: `docs/rfcs/0033-user-data-deletion.md:132`
and `docs/research/0007-operator-compliance-surface.md` both describe this as
"erasure already covers the audit trail" / "no residue" — that's technically
true (the deleted user's personal data is fully gone) but misses the
operator-accountability angle: there is currently no persisted record an
operator can point to later ("user X requested deletion on date Y, it
completed") if a dispute arises. Both framings are correct about different
things; this fix is about accountability (Art. 5(2), Art. 30), not erasure
completeness.

Fix shape: write the `account.self_deleted` entry with a stable **system**
actor id (not the deleted user's own id) so `DELETE ... WHERE actor_id =
userId` never matches it — the same reason the admin-initiated path already
survives. Check every downstream consumer of `activity_log` that renders an
actor name (Console's Activity view, `plugins/console/app/**`) — a synthetic
system actor id needs a stable sentinel the UI renders as e.g. "System",
not an attempted (and now-impossible) profile lookup for a deleted user.

**`GDPR-2`.** RFC 0033 intends that an isolated plugin's entire database is
dropped when the deleted user was its only user on the instance.
`user-deletion.ts:71` only ever invokes the plugin's own `provideDelete`
handler — it never calls `dropPluginDb()` (`packages/db/src/plugin-client.ts:173`),
which exists and is already used for plugin _uninstall_. A single-user
instance with a plugin that registers no `provideDelete` handler leaves that
plugin's whole database behind after "account deletion."

Fix shape: reuse the sole-owner member-count check `runtime/app/api/account/route.ts`
already does via the auth admin-users endpoint (`AUTH_URL`/`/api/admin/users`)
to determine "is the user being deleted the only user on this instance."
When true, after the existing `provideDelete` cascade completes, call
`dropPluginDb()` for every plugin running in isolated-DB mode — harmless if
`provideDelete` already cleaned the plugin's own rows, and the only way to
actually close the gap for plugins that register no handler at all. Must
never touch platform-type or shared-DB plugins — only genuinely isolated
per-plugin databases.

**Do not proceed if:** the sole-owner member count can't be determined
reliably at the point `dropPluginDb()` would need to run (e.g. because
better-auth's user record is already gone by then) — get the count _before_
`deleteUser()`'s cascade starts, not after, and thread it through rather than
re-querying mid-cascade.

### Leg 2 — Privacy/tos discoverability (scope corrected mid-leg)

**Findings:** `GDPR-6` (partially — see below)

**What this leg was planned to be, and why that changed:** Originally scoped
as "add controller-identity/policy-URL columns to `instance_config`, a
Console settings form, and a public About/Legal route," governed by research
0007's Option B (same as leg 5). **That plan was not executed.** Starting
execution surfaced `docs/rfcs/0090-default-privacy-policy-and-tos.md` — a
Draft RFC, dated the same month as this workstream, not known when this
document was drafted — which already claims this exact problem with a
different, already-partially-shipped mechanism: root-level `PRIVACY.md`/
`TOS.md` files an operator replaces directly, rendered at `/privacy`/`/tos`
by `runtime/app/privacy/page.tsx`/`runtime/app/tos/page.tsx` (confirmed live
on `main`, commits `a1b49a67`, `0cd09af3`, `f2a98573`). RFC 0090's own
"Alternatives considered" section explicitly rejects the DB-config/Console-
form approach this leg was about to build: _"A database-backed, per-instance
config surface with Console-editable identity fields... real overkill... a
flat file the operator replaces achieves the same outcome with no schema
migration, no settings form."_ Building the rejected alternative anyway would
have shipped code in direct conflict with an already-recorded design
decision — the same reasoning this workstream already used to exclude
`GDPR-12` (RFC 0096, also Draft): a workstream doesn't silently make the
design call a Draft RFC already exists to make, even when that RFC hasn't
formally graduated to Accepted.

**What was actually wrong, narrowly, and fixed instead:** RFC 0090's core
mechanism is real and working — `/privacy` and `/tos` render live, correct
content, confirmed via a real dev-server request to both routes. But the
`LegalLinks` component RFC 0090 itself built to link to them
(`packages/ui/src/components/LegalLinks/LegalLinks.tsx`, commit `c268e6d2`)
was wired into **nothing** — not `/login`, not `/register`, not the Account
plugin footer RFC 0090's own "Current state" section claims already has it
(that claim doesn't match the code; no `LegalLinks`/`privacy`/`tos` reference
exists anywhere in `plugins/account/app/layout.tsx`). The routes existed and
worked; nothing pointed a user at them. That's a real, narrow Art. 13/14
discoverability gap — a data subject can't exercise a right to information
they have no way to find — closed by wiring the existing, already-designed
component into the two pre-authentication pages where it matters most
(before/at the point personal data is first collected): `runtime/app/login/
login-form.tsx` and `runtime/app/register/register-form.tsx`, each rendering
`<LegalLinks renderLink={...} />` styled to match each page's existing footer
link (`styles.link` from `auth-page.module.css`) below the existing
sign-in/create-account footer paragraph. Verified live in a real dev-server
session: both pages render "Privacy Policy · Terms of Service" with correct
`href="/privacy"`/`href="/tos"`, and both target routes render their real
content.

**What remains genuinely open, and why it's not done here either:** The
other half of the original `GDPR-6` finding — an instance publishing _who
operates it_ (controller identity/contact) and an AGPL §13 source-disclosure
link — is not covered by RFC 0090 at all (it's scoped purely to privacy/tos
policy text) and has no settled design anywhere in this repo. RFC 0090's own
flat-file philosophy suggests operator identity likely belongs in the same
file-replacement pattern (an operator fills in "operated by \[Name], contact
\[Email]" in their own copy of `PRIVACY.md`/`TOS.md`, per RFC 0090's own
"Operator override" section) rather than a new `instance_config` field — but
AGPL §13 source disclosure isn't a privacy/tos concern at all and RFC 0090
doesn't design for it. Improvising a design for either inside this leg would
repeat the exact mistake this correction just backed out of. This half of
`GDPR-6` stays open, unscheduled, and is not this workstream's to design —
it needs its own research/RFC step first, the same bar `docs/workstreams/
README.md` sets for any workstream: "if the design is not settled enough to
sequence, the missing step is an RFC or a research doc, not a workstream."

**Do not proceed if:** picking this back up later, do not extend it into the
controller-identity/source-disclosure work without a governing design doc for
that specific piece — see above. Do not build a Console settings form or
`instance_config` columns for privacy/tos identity under any circumstance;
that's the exact alternative RFC 0090 already rejected.

### Leg 3 — Consent UX: data grants, and connection metadata disclosure

**Findings:** `GDPR-3`, `GDPR-4`

**Why this leg runs here:** Independent of legs 1–2. Grouped together because
both findings need the same thing — a real approval prompt before the
platform grants a plugin new access — and should share one `packages/ui`
component per CLAUDE.md's DS-first rule ("reusable UI/UX capability is
implemented in `packages/ui`, never plugin-locally").

**Technical notes (as executed — both findings landed with a smaller, better-fitting
shape than originally planned; see below for why):**

**`GDPR-3` — built, verified.** The plan above assumed `sdk.data.provide()`
would need a new signature to carry a human-readable description, which would
have been an SDK contract change under NFR-04. That assumption was wrong:
`packages/manifest/src/schema.ts`'s `data.provides[].description` field
already exists, already optional, already documented inline as **"Human-readable
description shown on the consent prompt"** — the manifest schema anticipated
this exact feature and nothing was ever built to use it. So the actual fix
needed zero SDK changes:

- `runtime/app/api/account/data-grants/route.ts`'s `GET` now also computes
  `pending`: every `(consumer, provider, contract, version)` triple an
  installed plugin's own manifest `data.consumes` declares, that doesn't
  already have an active grant, cross-referenced against the provider's own
  `data.provides` declaration for its `description` — a plugin can no longer
  supply its own persuasive copy for what it's asking to read, only what the
  _provider_ declared in its manifest is ever shown.
- The same route's `POST` now validates the requested triple against real,
  installed manifest declarations on both the consumer and provider side
  before creating a grant, refusing with 400 otherwise — closing a trust gap
  that existed independently of any UI: the endpoint previously created a
  grant for _any_ caller-supplied `(consumerId, providerId, contract,
version)` tuple with no check it corresponded to a real relationship
  either side had actually declared.
- New `packages/ui` `ConsentPrompt` component (title/description built from
  `consumerName`/`providerName`/`contract`, Allow/Deny actions), and a new
  "Pending data-sharing requests" section in `plugins/account/app/data/page.tsx`
  rendering one per pending item — proactive review in Account → Data,
  matching `packages/sdk/src/data.ts`'s own existing doc comment ("Consent is
  managed by the user in the Account → Data tab") rather than an
  interactive prompt triggered deep inside a consuming plugin's own SSR
  render (which doesn't fit well: `sdk.data.query()` runs server-side, not in
  a place that can easily show a modal).

**`GDPR-4` — built narrower than planned, deliberately.** The original plan
was a blocking pre-approval gate on `connections.create()`, mirroring
`GDPR-3`. That was reconsidered before building it: `plugins/warden/app/_lib/providers.ts`
is a real, live, in-repo consumer of `sdk.connections.create({ scope: 'user', ... })`
(its BYO OpenAI-compatible model-provider feature) — the user directly types
a base URL and API key into `AddProviderForm.tsx`'s own form, so nothing is
silent there, and the host has no way to distinguish that from a
hypothetical plugin calling `create()` with no user-facing form at all. A
blocking gate would have broken Warden's working feature without a
corresponding UI change there (out of this leg's scope), for a case that
isn't actually the problem. What _was_ a real, fixable, non-breaking gap:
`toConnectionRef()` (`runtime/src/connections.ts:110`) already includes
`metadata` in `GET /api/account/connections`'s response — Warden's own
`createProvider()` already stores the real external endpoint there
(`metadata: { baseUrl: url.toString() }`) — but `plugins/account/app/data/page.tsx`'s
`ExternalConnection` interface never declared the field, so it was silently
dropped and never rendered. Fixed by surfacing it: a connection row now shows
a `key: value` summary of any primitive-valued `metadata` entries, so a user
reviewing "Connected accounts" can actually see _what_ Warden's provider
connection points at, not just its opaque label. No SDK or host change;
purely a front-end display gap.

**Do not proceed if (retrospective — for anyone extending this leg):** don't
add a blocking gate to `connections.create()` without also redesigning
Warden's `AddProviderForm` flow to satisfy it first — the two must land
together or Warden's feature breaks. The Chapter V / non-EEA transfer
documentation gap (`docs/plugin-development.md`) noted in the original plan
is still real and still open — it wasn't done here, since it's a docs-only
addition independent of the code fix and was deprioritized under time.

### Leg 4 — Plugin permission disclosure

**Findings:** `GDPR-5`

**Why this leg runs here:** Independent of legs 1–3, but touches the same
`plugins/console` surface leg 2's settings work does — sequenced after leg 2
so both land against the same up-to-date Console settings tree rather than
conflicting mid-flight.

**Technical notes (as executed):**

`packages/manifest/src/schema.ts:20-47` (`permissionSchema`) defines 26
distinct permission strings a plugin manifest can declare in its
`permissions` array (line 128). Confirmed nowhere was this surfaced to an
end user: `plugins/console/app/plugins/PluginsTable.tsx` had no permissions
column, and the existing "Access" dialog
(`plugins/console/app/plugins/PluginAccessDialog.tsx`) governs who can _open_
a plugin, not what data it can touch.

The "do not proceed if" below fired as predicted: `packages/db/src/schema/sqlite/platform.ts`'s
only plugin-metadata table, `plugin_status` (line 64), tracks enable/disable
and access policy only — no field anywhere stores a "last-seen permissions"
snapshot per plugin. Per the plan, this leg scoped down to "show current
permissions" only; permission-drift-on-upgrade detection is not built and
would need new schema, out of scope here.

Built: `runtime/app/api/admin/plugins/route.ts` now includes
`permissions: manifest.permissions` in its response; that field threads
through `plugins/console/app/plugins/page.tsx`'s `RawPluginRow` and
`PluginsTable.tsx`'s `PluginRow` (both already spread the raw response, so no
new fetch was needed) down to a new `permissions` prop on
`PluginAccessDialog`, passed at both its render sites (desktop row, mobile
card). The dialog gained a new "Permissions" section, above the existing
"Policy" section, listing each declared permission via a new
`PERMISSION_LABELS` lookup (all 26 `permissionSchema` values covered, with a
raw-string fallback for any future addition not yet in the table) — matching
the plain-language, one-line-per-permission shape the plan called for.

No component-level test was added: `plugins/console/package.json` has no
`@testing-library/react`/jsdom devDependencies at all (unlike
`plugins/account`, which does) — this plugin's existing test coverage is
server-action logic only, no component rendering. Adding that test
infrastructure is a real, separate change (new dependencies, a
`pnpm install`, a lockfile diff) out of proportion to this leg's actual risk
(a static lookup object plus an `Array.prototype.map` — about as low-risk as
UI logic gets). Verified instead via a full live round-trip against a real
dev server: signed in as the seeded `owner@sovereign.local` test account
(`CONTRIBUTING.md`'s documented `sv seed` credentials), activated Warden,
opened its Access dialog, and confirmed the Permissions section renders
exactly Warden's four declared permissions
(`auth:session`/`db:readWrite`/`data:export`/`data:import`) in plain
language, with the existing Policy section unaffected.

**Do not proceed if (already resolved above — kept for the record):** there's no existing place plugin metadata is
persisted per-instance (vs. re-read from the manifest file on every request)
— permission-drift detection needs a stored "last acknowledged" snapshot to
diff against, and if that storage doesn't already exist, scope this leg down
to "show current permissions" only and carve drift-detection out as a
follow-up rather than adding new schema mid-leg without review.

### Leg 5 — Retention policy & log pruning

**Findings:** `GDPR-7`

**Why this leg runs here:** Independent of legs 1–4. Governed by research
0007, same as leg 2 — grouped separately because it's a `packages/db` +
background-job change, not a UI change, and shouldn't block on leg 2's
Console work.

**Technical notes (as executed):**

No platform-wide retention/pruning mechanism existed before this leg. RFC 0005
(activity log) explicitly deferred this: "Retention/pruning (if any) is a
platform-operator concern" (`docs/rfcs/0005-activity-log.md:214`), and
research 0007 lists the default window as an open, `[counsel]`-tagged
question (open question 1) alongside a harder sub-question: **is the audit
log exempt from retention on integrity grounds?** Storage-limitation (Art.
5(1)(e)) argues for expiry; audit integrity argues the opposite. Four tables
grow unbounded for any user who hasn't been deleted: `activity_log`,
`data_access_log`, `email_delivery_log`, `push_delivery_log`.

One correction from the plan: the "existing `analytics_retention_days`
pattern to reuse" doesn't actually exist in this checkout — RFC 0030
(privacy-first analytics) is a design doc only; no analytics plugin or
`analytics_retention_days` code is present anywhere in the repo. Confirmed by
grepping for "retention" across every `.ts`/`.tsx` file before writing
anything — zero matches outside docs. Not a blocker, just nothing to reuse;
built from the platform's own existing primitives instead (below).

Also found, and reused rather than adding new schema for: `platform_settings`
(`packages/db/src/schema/sqlite/platform.ts:115`) is already a generic
per-tenant key-value store with `getPlatformSetting`/`setPlatformSetting`
helpers, already used for exactly this kind of ad-hoc admin-configurable
value (`root_plugin_id`, `invite_only`, push-relay URL). No `instance_config`
column and no migration were needed — two new setting keys
(`retention_delivery_logs_days`, `retention_activity_log_days`) were enough.

Built: `pruneDeliveryLogs`/`pruneActivityLog` (`packages/db/src/platform-db.ts`,
next to `logDataAccess`) — two separate functions, not one, matching the plan's
own reasoning about not silently resolving the integrity-vs-storage-limitation
tension by sharing a config value. A new `runtime/src/retention-worker.ts`
mirrors `backup-worker.ts`'s exact tick-loop shape (DI'd deps, `now`/prune
functions injected, `startRetentionWorker`/`stopRetentionWorker` wired into
`runtime/instrumentation.ts`'s boot sequence and SIGTERM handler) but ticks
every 6h, not 60s — pruning isn't time-sensitive — and, unlike the backup
worker, is **always started, not opt-in behind an env var**: its settings are
reachable from Console the moment this ships (unlike the backup worker's
"no enqueue path exists yet" reasoning for staying off by default), and a 6h
tick reading two unset settings is negligible overhead. `runtime/app/api/admin/settings/route.ts`
gained a `retention: { deliveryLogsDays, activityLogDays }` field (GET) and
PATCH branch, following the existing `pushRelay` block's exact
explicit-null-clears convention. A new "Data retention" section in Console's
settings page (`plugins/console/app/settings/RetentionSettingsForm.tsx`) has
two blank-by-default number fields — blank means "keep forever," matching the
plan's "no default-on pruning" requirement exactly.

**Do not proceed if:** the goal owner hasn't picked a default window and
decided the audit-log exemption question research 0007 explicitly leaves
open — ship the mechanism with no default-on pruning (operator must
explicitly configure a window before anything gets deleted) rather than
guessing a default that later needs a migration to change semantics for
data already pruned under the wrong assumption. **Honored as written:**
neither default was picked here; both settings default to unset/never-prune,
verified live (see changelog).

### Leg 6 — Terms acceptance record at registration

**Findings:** `GDPR-8`

**Gate status: resolved 31 Aug 2026.** The goal owner decided the lawful
basis is **contract (Art. 6(1)(b))**, not consent — see the matching
Decisions locked row for the reasoning. This leg builds a **terms
acceptance** record (a contract-formation artifact: which policy version,
accepted when), not a consent grant, and has no withdrawal flow of its own —
withdrawing means closing the account, which leg 1 already covers. `runtime/app/register/register-form.tsx`
collects `name`, `email`, `password`, and a silently-detected browser
timezone today — nothing records what the user agreed to, or when. That's
the gap this leg closes.

**Technical notes (as executed):**

The record lives in `apps/auth`'s own better-auth-managed `user` table, not
`packages/db`'s platform schema — mirroring the exact existing pattern for
`timezone` (`user.additionalFields`, `input: true`/`false` split,
`databaseHooks.user.create.before` validates and stamps values before
insert). This was the deliberate choice over a separate post-signup write to
the platform DB: the `create.before` hook is transactional with account
creation itself, so there's no window where an account can exist with no
acceptance record because a follow-up write failed.

Three new fields: `agreedToTerms` (client-sent boolean — did the user check
the box), `policyAcceptedHash` and `policyAcceptedAt` (server-only,
`input: false` — never trusted from the client, always computed fresh by the
hook). The hook rejects registration outright (`APIError('BAD_REQUEST')`) if
`agreedToTerms !== true`, then overwrites whatever the client sent for the
other two with its own authoritative values — a client cannot claim
acceptance of a version it wasn't actually shown.

**Versioning, resolved:** RFC 0090 never defined a version identifier for
`PRIVACY.md`/`TOS.md` (confirmed — no version field, no hash, just prose
saying "versioned with the platform's own source code"). Rather than invent
a parallel scheme, `policyAcceptedHash` is a sha256 of the two files'
concatenated content (new `apps/auth/src/legal-content.ts`, deliberately not
shared with `runtime/src/legal-content.ts` — same "each app duplicates the
small amount of logic it needs" convention `apps/auth/src/db.ts` already
follows). This works identically for the shipped default or an operator's
own replacement, and needs no separate bump step an operator could forget.

**A real, live-caught bug — not just the plan's own flagged risk.** The
first version of `agreedToTerms` used `required: true` (no `defaultValue`).
Confirmed live: this made better-auth's own auto-migration on server boot
emit `ALTER TABLE "user" ADD COLUMN agreedToTerms ... NOT NULL` with no
`DEFAULT` clause — which SQLite refuses outright
("Cannot add a NOT NULL column with default value NULL") on the non-empty
`user` table every dev/production instance already has, taking down the
entire auth server at boot, not just new registrations. Fixed by switching
to `required: false` + `defaultValue: false` (matching every _other_
boolean-ish field in this file, e.g. `active`) — the default only backfills
pre-existing rows (correctly `false`; they registered before this field
existed), while every _new_ registration is still unconditionally enforced
by the `create.before` throw, which never lets a row insert without a real
`true`. Confirmed fixed by restarting the dev server clean and re-running
the exact same registration that had crashed it.

**Docker impact, flagged and fixed in the same turn (CLAUDE.md's own
rule).** `apps/auth` ships from its own separate `apps/auth/Dockerfile`, and
its runner stage never copied `PRIVACY.md`/`TOS.md` into the image — so
`getPolicyAcceptanceHash()` would silently hash two empty strings in every
real production deployment (dev works only because the monorepo checkout has
the files locally). Added the same two `COPY` lines the root `Dockerfile`
already has for `runtime`, into `apps/auth/Dockerfile`'s runner stage
alongside its existing `pnpm-workspace.yaml` marker copy (same
workspace-root resolution, so same target path).

UI: `runtime/app/register/register-form.tsx` gained a required checkbox
("I agree to the Privacy Policy and Terms of Service", inline-linking both)
using a native HTML `required` attribute as the first line of defense —
confirmed live via `form.checkValidity()` that submission is blocked
entirely, client-side, before the network request even fires, when unchecked.

### Leg 7 — At-rest encryption posture disclosure

**Findings:** `GDPR-9`

**Why this leg runs here:** Independent of every other leg. Deliberately
scoped narrow — this is a _disclosure_ fix, not a new encryption mechanism.

**Technical notes (as executed):**

RFC 0071 (whole-database SQLite encryption) shipped, caused a real production
incident (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`), and
was fully retired — confirmed in `docs/security.md`: nothing is encrypted at
rest by the platform by default, on either dialect.

Found live, and confirmed **not** to already exist: this leg's plan named
`FieldEncryptionStatus.tsx` (`plugins/console/app/settings/`) as the thing to
build, but it already exists and already ships — it's the field-encryption
half of this problem (RFC 0092), already computed from real state
(`SOVEREIGN_ENCRYPT_CLASSES`, key-rotation rows) and already rendered in
Console settings under a "Field encryption" heading. What's missing isn't
that component; it's the _broader_ framing around it — nothing told an admin
that field encryption is one narrow, opt-in layer, not the whole at-rest
story.

**A second, more consequential correction**: the plan's own premise —
"zero-knowledge client-side encryption adopted by exactly two plugins
(Account, Wallet)" — doesn't hold up against this checkout. Confirmed by
direct inspection before writing any code: (1) no "Wallet" plugin exists
anywhere in this repo (`plugins/` has only account/console/launcher/warden);
(2) `e2ee:use` exists in `packages/manifest/src/schema.ts`'s
`permissionSchema`, but a repo-wide grep found it referenced nowhere else —
nothing enforces it, and **no installed plugin declares it**, not even
Account, which genuinely has real E2EE features
(`hardDeleteUserE2eeData`/`e2ee_profiles` throughout `packages/db`). The
permission string is dead metadata, not a trustworthy adoption signal — a
plugin-list built from it would have been actively wrong (reporting "no apps
use E2EE" while Account's real feature sat unlisted).

Built instead: a new `countE2eeProfiles(pdb, tenantId)` (`packages/db/src/platform-db.ts`,
next to `getE2eeProfile`) — a real, live count of enrolled `e2ee_profiles`
rows, not a manifest check. `runtime/app/api/admin/settings/route.ts` gained
a new `atRestEncryption: { e2eeProfileCount }` field. New
`plugins/console/app/settings/AtRestEncryptionOverview.tsx` states the full
picture plainly — nothing is encrypted at rest by the platform by default on
either dialect, field encryption and zero-knowledge encryption are two
narrow opt-in layers on top of that, everything else is the operator's
disk-encryption responsibility (pointing at the self-hosting guide's
existing "Disk-level encryption" section by name, no link — matching
`FieldEncryptionStatus`'s own established plain-text-reference convention,
since that guide isn't served as a page inside the running app) — then
reports the real enrolled-profile count. Rendered in Console settings under
a new "At-rest encryption" heading, with the existing "Field encryption"
subsection nested inside it as one part of that picture, not the whole
story.

**Do not proceed if:** rendering this panel would require guessing at
host-disk-encryption state the app genuinely cannot observe (it can't — no
attempt was made to detect LUKS/FileVault/etc. from inside the container;
the disk-encryption gap is phrased as operator guidance pointing at the
existing hardening checklist, never as a false "detected: unencrypted"
claim).

### Leg 8 — Operator breach-notification runbook template

**Findings:** `GDPR-10`

**Why this leg runs here:** Independent of every other leg, docs-only, no
version bump. Lowest priority — Art. 33/34 breach notification is correctly
the operator's own legal obligation, not the platform's, but there's
currently no scaffolding at all alongside the legal templates that already
exist.

**Technical notes (as executed):**

`docs/legal/operator-template-privacy.md` and `-terms.md` exist; nothing
equivalent existed for breach response before this leg. Read both existing
templates in full before writing anything, to match their exact shape:
frontmatter (`title`/`description`/`aside` — a different, simpler schema
than `docSection`/`docType`/`audiences`, which `docs/documentation-structure.md`
confirms is for canonical root references, not this directory), an
operator-facing preamble above a `---` separator explaining what the file is
and how to use it, then the actual content.

Built `docs/legal/operator-template-breach-response.md`: an immediate-response
checklist, an assessment checklist, a Notify section stating GDPR Art. 33's
72-hour supervisory-authority window and Art. 34's affected-user notification
trigger as plain regulatory facts (never naming a specific authority or
jurisdiction-specific deadline), a notification-letter skeleton, and an
after-action checklist — explicitly framed throughout as a starting point,
not legal advice, matching research 0007's Option C rejection reasoning. One
structural difference from the two existing templates, stated directly in
its own preamble: unlike `PRIVACY.md`/`TOS.md`, this is an internal runbook
the operator keeps for themselves, never meant to be published to their
users.

**Discoverability, fixed in the same leg rather than left as a second
"component exists, nothing links to it" gap** (the same failure mode legs 2
and 7 both found and fixed this session): confirmed via `docs:check-links`
that neither existing operator template is linked from anywhere in `docs/`
either — a pre-existing gap this leg didn't create and wasn't scoped to fully
fix (that's RFC 0090's own still-unshipped adoption-path step). Scoped to
what this leg actually owns: added one checklist item to
`docs/security.md`'s "Self-hoster hardening checklist" (an already-established,
directly-relevant list of operator to-dos) linking to the new template.
`docs:check-links` confirmed zero new broken links from either change.

No code changes, no `runtime`/`packages/*` version bump — matches this
repo's own convention that pure `docs/` changes skip version-bump ceremony
unless a public API changed. (This is `pods/p5`, not the `sovereignfs/sovereignfs`
workbench repo the root `CLAUDE.md`'s `docs/package.json` version-bump rule
governs — confirmed no `docs/package.json` exists here.)

**Do not proceed if:** the template starts drifting toward jurisdiction-
specific legal text (e.g. naming a specific supervisory authority, specific
notification deadlines beyond GDPR's own 72-hour figure which is factual, not
advice) — keep it structural, matching the existing privacy/terms templates'
own restraint.

## Risks

- **Every file:line reference above is a snapshot from this audit session**
  (`main` @ `3a985eff`, 31 Aug 2026, cross-checked directly against source,
  not inferred from docs alone). Code may have moved by the time a leg is
  actually executed — re-read the current source before implementing, don't
  trust the line numbers blindly.
- **Leg 3 shipped with no SDK change at all** — the anticipated NFR-04 risk
  around `sdk.data.provide()`'s signature didn't materialize; the manifest
  already carried the needed field. Worth remembering as a general lesson
  alongside leg 2's own correction: re-read the actual schema/code before
  assuming a fix needs a bigger surface than it does.
- **Leg 3's `GDPR-4` fix is intentionally narrower than the original
  finding.** A blocking consent gate on `sdk.connections.create()` is still
  real, unbuilt scope — deliberately not attempted after finding it would
  break Warden's live BYO-provider feature without a coordinated UI change
  there. Anyone picking this back up must design the two together, not patch
  the host in isolation.
- **Legs 2 and 7 both touch how the platform describes its own compliance
  posture to an operator.** Keep both strictly factual/descriptive — matching
  research 0007's explicit rejection of Option C (templated policy text).
  Neither leg should render language that could read as "this instance is
  GDPR compliant"; that determination is the operator's and their counsel's,
  never the software's to assert.
- **Leg 6 shipped (contract basis, Art. 6(1)(b))** — its own versioning gap
  (RFC 0090 never defined one) was resolved with a content hash
  (`apps/auth/src/legal-content.ts`), not a new manifest-level scheme. If RFC
  0090's own adoption path later defines an official version identifier,
  reconcile the two rather than running both indefinitely.
- **A live-caught bug worth remembering generally, not just for this leg**:
  a better-auth `additionalFields` entry with `required: true` and no
  `defaultValue` breaks the whole auth server at boot the moment it's added
  against a non-empty `user` table — SQLite refuses the resulting
  `ADD COLUMN ... NOT NULL` migration outright. Every existing field in this
  file already used `required: false` (+ a default where relevant); leg 6's
  first draft was the one exception, and it broke on the first real boot.
  Prefer `required: false` + `defaultValue` and enforce the real requirement
  in the `create.before` hook instead, the same way this file already does
  for every other field.
- **None of these legs implement RFC 0096** (`GDPR-12`, excluded per
  Decisions locked) — leg 1's `GDPR-2` fix (dropping an isolated plugin DB on
  sole-user deletion) is a different mechanism and should not be conflated
  with RFC 0096's still-Draft cross-plugin deletion-veto design.
- **This workstream's file:line/design-authority snapshot can go stale
  faster than expected — leg 2 already did.** It was drafted assuming a
  green field for instance legal identity; RFC 0090 (also Draft) turned out
  to already claim that space with an incompatible, partially-shipped
  design, discovered only by starting execution, not by re-reading docs.
  Before starting any remaining leg, grep `docs/rfcs/README.md` for the
  leg's subject area, not just re-check the file:line references — a design
  conflict is a worse failure mode than a stale line number.

## Kill criteria

No leg gates another. Leg 6's own gate (an explicit lawful-basis decision)
is now resolved, so every remaining leg is independently startable. If this
workstream stops after N legs for any reason, the completed legs' fixes stand
on their own — none of them depend on a later leg to be coherent. Remaining
findings simply stay open and can be picked up individually or resumed as
this workstream later.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft — 8 legs, 10 in-scope findings (`GDPR-1`…`GDPR-10`), 3 explicitly excluded (`GDPR-11`…`GDPR-13`), drafted from a GDPR compliance audit run against `main` @ `3a985eff`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.2     | August 2026 | Leg 1 implemented (`GDPR-1`, `GDPR-2`) — uncommitted, not yet reviewed. `runtime/app/api/account/route.ts`'s self-deletion `account.self_deleted` log entry now written with `actorType: 'system'`/`actorId: null` and `subjectUserId`/`targetId` carrying the deleted user, instead of the deleted user's own id as actor — survives `deleteUserData()`'s `activity_log` cascade, mirroring the admin-initiated path. `runtime/src/user-deletion.ts`'s `deleteUser()` now resolves sole-user status up front and, when true, drops every isolated plugin's database after the existing `provideDelete` cascade (new `dropPluginDb()` call, new `droppedPluginDbs` field on `DeletionSummary`). Two new regression test files (`account-delete-route.test.ts`, `user-deletion.test.ts`, 7 tests total), each confirmed via `git stash` to fail against the pre-fix code. Full `runtime` suite green (910 passed) aside from one pre-existing, unrelated `@dnd-kit` dependency-resolution failure in this sandbox.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0.3     | August 2026 | Leg 2 attempted, then corrected mid-leg — uncommitted, not yet reviewed. Discovered `docs/rfcs/0090-default-privacy-policy-and-tos.md` (Draft) already claims this design space with a different, partially-shipped mechanism that explicitly rejects the DB/Console approach this leg was about to build; stopped before implementing schema/settings-form work. Implemented instead: wired the existing, previously-unused `LegalLinks` component (`packages/ui`) into `runtime/app/login/login-form.tsx` and `runtime/app/register/register-form.tsx`, closing the real gap that RFC 0090's `/privacy`/`/tos` routes existed and worked but were linked from nowhere. Verified live via a real dev server: both pages render correct `Privacy Policy · Terms of Service` links, both routes render real content. Controller-identity and AGPL §13 source-disclosure — the other half of the original `GDPR-6` finding — left explicitly open; no governing design exists for that piece. Workstream doc corrected in place (header, Decisions locked, Legs table, leg 2 detail, Prerequisites, Risks) rather than silently diverging from what was actually built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 0.4     | August 2026 | Leg 3 implemented (`GDPR-3`, `GDPR-4`) — uncommitted, not yet reviewed. `GDPR-3` shipped as planned in scope but with no SDK change (the assumed NFR-04 risk didn't materialize — `packages/manifest`'s `data.provides[].description` field already existed for exactly this): `runtime/app/api/account/data-grants/route.ts`'s `GET` now computes `pending` requests from real manifest `data.consumes`/`data.provides` declarations, and its `POST` now refuses to create a grant for any triple neither side's manifest actually declares. New `packages/ui` `ConsentPrompt` component (story + `DesignSystemOverview` gallery entry added) and a new "Pending data-sharing requests" section in `plugins/account/app/data/page.tsx`, Allow/Deny wired to the hardened endpoint. `GDPR-4` shipped narrower than planned, deliberately: found that `plugins/warden/app/_lib/providers.ts`'s live BYO-provider feature already collects credentials via an explicit user-facing form (`AddProviderForm.tsx`), so a blocking pre-approval gate on `sdk.connections.create()` would have broken a working, already-informed-consent feature for no real gain — not built. Fixed instead: `plugins/account/app/data/page.tsx`'s connections list now surfaces a connection's `metadata` (already returned by the API, e.g. Warden's stored `baseUrl`, previously silently dropped by the page's own TypeScript interface). 3 new/updated test files (`data-grants-route.test.ts`, `user-deletion.test.ts` unaffected, `page.test.tsx` extended to 13 tests), all new assertions confirmed via `git stash` to fail against pre-fix code. Verified live against a real dev server end-to-end (registered a throwaway test account, confirmed `/account/data` renders all sections correctly with real — empty — backend data, no console errors). Full `runtime`+`packages/ui`+`plugins/account` suite green (1521 passed).                                                                             |
| 0.5     | August 2026 | Leg 4 implemented (`GDPR-5`) — uncommitted, not yet reviewed. Confirmed the plan's own "do not proceed if" before building: `plugin_status` (`packages/db/src/schema/sqlite/platform.ts:64`) is the only per-instance plugin-metadata table and has no field to store a "last-seen permissions" snapshot, so permission-drift-on-upgrade detection was scoped out as planned — current-state display only. `runtime/app/api/admin/plugins/route.ts` now includes each plugin's `permissions` array in its response; threaded through `plugins/console/app/plugins/page.tsx` and `PluginsTable.tsx` (both already spread the raw response, no new fetch needed) to a new `permissions` prop on `PluginAccessDialog.tsx`, which gained a new "Permissions" section (above the existing "Policy" section) listing each declared permission via a new `PERMISSION_LABELS` lookup covering all 26 `permissionSchema` values, with a raw-string fallback for any future addition. No component test added — `plugins/console/package.json` has no React-testing devDependencies at all (unlike `plugins/account`), and adding that infrastructure was judged out of proportion to this leg's actual risk (a static lookup plus an array map). Verified instead via a full live round-trip: signed in as the seeded `owner@sovereign.local` test account (`CONTRIBUTING.md`'s documented `sv seed` credentials), activated Warden, opened its Access dialog, and confirmed the Permissions section renders exactly Warden's four declared permissions in plain language. Full `runtime`+`packages/ui`+`plugins/account`+`plugins/console` suite green (1608 passed).                                                                                                                                                                                                                                                                                                                                       |
| 0.6     | August 2026 | Leg 5 implemented (`GDPR-7`) — uncommitted, not yet reviewed. Confirmed before building that the plan's cited reuse target doesn't exist: grepped "retention" across every `.ts`/`.tsx` file in the repo and found zero code matches — RFC 0030's `analytics_retention_days` is a design doc only, no analytics plugin is in this checkout. Built on `platform_settings` instead (`packages/db/src/schema/sqlite/platform.ts:115`, already a generic per-tenant key-value store with existing `getPlatformSetting`/`setPlatformSetting` helpers) — no new migration needed. New `pruneDeliveryLogs`/`pruneActivityLog` functions (`packages/db/src/platform-db.ts`), kept separate per the plan's own reasoning (storage-limitation vs. audit-integrity tradeoff). New `runtime/src/retention-worker.ts` mirrors `backup-worker.ts`'s DI'd tick-loop shape exactly but ticks every 6h (not 60s) and — unlike the backup worker — starts unconditionally rather than behind an opt-in env var, since its settings are reachable from Console immediately. `runtime/app/api/admin/settings/route.ts` gained a `retention` field/PATCH branch following the existing `pushRelay` block's explicit-null-clears convention; new "Data retention" section in Console settings (`RetentionSettingsForm.tsx`), both fields blank (never-prune) by default. 5 new tests (`retention-worker.test.ts`, DI-based) plus 3 new real-Postgres tests added to `platform-db.pg.test.ts`, run against a throwaway local `postgres:16` Docker container (not just typechecked) — confirmed passing, then the container was removed. Verified live end-to-end against a real dev server: saved delivery=30/activity=365 via the Console form, confirmed via a direct `GET /api/admin/settings` call that both persisted correctly, confirmed a fresh page load shows the saved values, then cleared both back to unset and confirmed the API reflects `null`/`null` again. Full non-Postgres suite green (1679 passed). |
| 0.7     | August 2026 | Leg 6's gate resolved — no code changes. Goal owner decided the lawful basis for core account-registration data is **contract (Art. 6(1)(b))**, not consent: registering is the user requesting the service, and email/password/timezone are what's necessary to provide it; a consent framing was rejected because withdrawing consent to store that data would just be account deletion, with no meaningful partial withdrawal — exactly the tension research 0007's open question 2 flagged. Leg 6 will build a terms-**acceptance** record (version + timestamp), not a revocable consent grant; leg 3's actual consent prompts (data grants) are unaffected. Decisions locked, Prerequisites, the Legs table, leg 6 detail, Risks, and Kill criteria all updated in place. Also corrected a stale cross-reference in leg 6's own technical notes surfaced while updating it: it still pointed at leg 2's original (reverted) `instance_config` policy-URL plan instead of RFC 0090's actual shipped mechanism, and flagged a real open question the correction exposed — RFC 0090 doesn't yet define a version identifier for `PRIVACY.md`/`TOS.md`, which leg 6 needs before it can version an acceptance record against it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.8     | August 2026 | Leg 6 implemented (`GDPR-8`) — uncommitted, not yet reviewed. New `apps/auth` better-auth `additionalFields` — `agreedToTerms` (client-sent), `policyAcceptedHash`/`policyAcceptedAt` (server-only, `input: false`) — mirroring the existing `timezone` field's exact pattern; `databaseHooks.user.create.before` rejects registration if `agreedToTerms !== true`, then overwrites both server fields with authoritative values via new `apps/auth/src/legal-content.ts` (sha256 of root `PRIVACY.md`+`TOS.md`, resolving the versioning gap RFC 0090 left open). New required checkbox in `runtime/app/register/register-form.tsx`, native `required` attribute blocking submission client-side. **Two real bugs caught live, both fixed before landing**: (1) the first `agreedToTerms` draft used `required: true` with no default, which made better-auth's auto-migration emit a bare `NOT NULL` `ALTER TABLE` that SQLite refuses on a non-empty table — crashed the entire auth server at boot, reproduced live, fixed by switching to `required: false` + `defaultValue: false` and re-verified with a clean restart; (2) `apps/auth/Dockerfile`'s runner stage never copied `PRIVACY.md`/`TOS.md`, which would have silently hashed two empty strings in every real production deployment despite working fine in dev — fixed by adding the same `COPY` lines the root `Dockerfile` already has. 4 new tests, confirmed via `git stash` to fail against pre-fix `auth.ts`. Verified live end-to-end: `form.checkValidity()` blocks submission unchecked; a checked submission succeeds; queried the actual `apps/auth` sqld database directly afterward and confirmed `agreedToTerms=1`, a real 64-char sha256 `policyAcceptedHash`, and a real `policyAcceptedAt` were all persisted correctly. Full `apps/auth`+`runtime`+`packages/db`+`packages/ui`+`plugins/account`+`plugins/console` suite green (1748 passed).                                                                    |
| 0.9     | August 2026 | Leg 7 implemented (`GDPR-9`) — uncommitted, not yet reviewed. Found before writing code that the plan's own premise didn't hold: `FieldEncryptionStatus.tsx` (the component the plan said to build) already exists and already ships; more consequentially, "adopted by exactly two plugins (Account, Wallet)" doesn't match this checkout — no Wallet plugin exists anywhere in the repo, and `e2ee:use` (`packages/manifest`'s `permissionSchema`) is declared nowhere, checked nowhere, not even by Account, which has real E2EE features. A plugin-list built from that permission would have actively misreported "no apps use E2EE." Built a real signal instead: new `countE2eeProfiles(pdb, tenantId)` (`packages/db/src/platform-db.ts`) counts actual `e2ee_profiles` rows; `runtime/app/api/admin/settings/route.ts` gained `atRestEncryption: { e2eeProfileCount }`; new `plugins/console/app/settings/AtRestEncryptionOverview.tsx` states the full at-rest picture (field encryption and zero-knowledge encryption are two narrow opt-in layers, everything else is the operator's disk-encryption job, per the self-hosting guide) above the existing "Field encryption" subsection, now nested under a new "At-rest encryption" heading as one part of that picture rather than the whole story. 1 new real-Postgres test added to `platform-db.pg.test.ts`, run against a throwaway local `postgres:16` container (124/124 passing), container removed after. Verified live end-to-end against a real dev server: Console settings renders the new section correctly with the accurate zero-count message; confirmed via a direct `GET /api/admin/settings` call that `atRestEncryption.e2eeProfileCount` matches. Full `apps/auth`+`runtime`+`packages/db`+`packages/ui`+`plugins/account`+`plugins/console` suite green (1748 passed).                                                                                                                                           |
| 1.0     | August 2026 | Leg 8 implemented (`GDPR-10`) — uncommitted, not yet reviewed, docs-only, no version bump. New `docs/legal/operator-template-breach-response.md`, matching the exact frontmatter/preamble/content shape of the two existing operator templates (read both in full before writing): an immediate-response checklist, an assessment checklist, a Notify section stating GDPR Art. 33's 72-hour window and Art. 34's affected-user trigger as plain regulatory facts (never a specific authority or jurisdiction), a notification-letter skeleton, and an after-action checklist — explicit throughout that it's a starting point, not legal advice. One structural difference from the other two templates, stated in its own preamble: this is an internal runbook the operator keeps, never published to their users. Also fixed the same "component exists, nothing links to it" gap legs 2 and 7 both hit this session: `docs:check-links` confirmed neither existing operator template was linked from anywhere in `docs/` either (a pre-existing gap, RFC 0090's own unshipped adoption-path step, not fully fixed here) — added one checklist item to `docs/security.md`'s hardening checklist linking the new template, confirmed zero new broken links. This is the workstream's final leg — all 8 legs are now implemented, pending review and merge. Workstream `Status` line updated to reflect this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

# Research 0007 — Operator compliance surface and the controller boundary

**Status:** Exploratory\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** `packages/db` (`instance_config`), `runtime`, `apps/auth`, `plugins/console`,
`docs/self-hosting.md`, repo governance files\
**Related:** RFCs [0005](../rfcs/0005-activity-log.md),
[0007](../rfcs/0007-user-data-portability.md),
[0025](../rfcs/0025-accessibility.md),
[0027](../rfcs/0027-white-labeling.md),
[0028](../rfcs/0028-operator-fork-model.md),
[0033](../rfcs/0033-user-data-deletion.md)

---

## Question

Sovereign has unusually strong compliance _primitives_ — export, erasure, audit
log, at-rest encryption, a WCAG target — but no surface that lets an operator
actually discharge their legal role as data controller. Before designing any of
that surface, one question has to be answered because it sets the scope of
everything downstream:

**What does Sovereign owe an operator, and what does the operator owe their
users?**

## Non-goal — this doc is not legal advice

Neither this document nor any artifact it recommends constitutes legal advice,
and nothing Sovereign ships can make an operator compliant. The obligations
described here are the project's reading of why a _product surface_ is needed;
the operator's actual duties depend on their jurisdiction, sector, and lawful
basis, and only their counsel can determine those. Points below marked
**[counsel]** are ones the project should not resolve on its own.

## Findings

Current state, verified:

- **`instance_config` carries branding but nothing legal.**
  `packages/db/src/schema/sqlite/platform.ts:552` defines name, light/dark logo,
  favicon, accent, radius, and email sender identity — no policy URLs, no
  operator/controller identity, no source-code URL.
- **No consent or terms acceptance at registration.**
  `apps/auth/app/register/register-form.tsx` (178 lines) collects name, email,
  and password only. Nothing records _what_ a user agreed to or _when_.
- **No AGPL §13 path.** A grep across `runtime/app` and `plugins/console/app`
  finds no source-code link, no license notice, and no version/about surface.
  AGPL-3.0 requires that users interacting with a _modified_ version over a
  network be offered the corresponding source. Sovereign's entire model —
  operator forks (RFC 0028) and rebranding (RFC 0027) — is "operators modify and
  deploy," so this is the common case, not the edge case.
- **Erasure already covers the audit trail.** RFC 0033 deletes
  `consent_grants → data_access_log → activity_log → …` in dependency order
  (`docs/rfcs/0033-user-data-deletion.md:132`). Deleted users leave no residue
  beyond the deletion record itself — this gap does _not_ exist.
- **Retention for surviving users is explicitly unresolved.** RFC 0005 defers
  it: "Retention/pruning (if any) is a platform-operator concern"
  (`docs/rfcs/0005-activity-log.md:214`), with open question 1 proposing "no
  automatic pruning in v1" (`:255`). So `activity_log`, `data_access_log`,
  `email_delivery_log`, and `push_delivery_log` grow unbounded for every user
  who has _not_ been deleted, with no operator control.
- **Accessibility is asserted, not evidenced.** NFR-11
  (`docs/sovereign-proposal-plan-srs.md:1058`) sets WCAG 2.1 AA and RFC 0025 is
  Implemented, but enforcement is `eslint-plugin-jsx-a11y` only. There is a
  Playwright setup (`playwright.config.ts`) and no axe integration in it, and no
  accessibility statement anywhere.
- **Supply-chain signals are thin.** No `.github/dependabot.yml`, no CodeQL
  workflow, and `npm publish` runs without `--provenance`
  (`.github/workflows/publish.yml:47`) for all three public packages. No
  `NOTICE`/third-party attribution despite bundling Lucide (ISC). No
  `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, or trademark policy.
- **White-labeling is mid-flight.** Phase 1 shipped; phases 2 and 3 are queued
  as epic tasks 9.9 and 9.10 (`docs/epics/design-system.md:291`, `:354`). Any
  attribution or source-link decision lands inside that unfinished work.

## What does not need research

Two of the gaps above have no open design question and should not wait on this
doc:

1. **Supply-chain and governance hygiene** — Dependabot, CodeQL, `--provenance`
   on the three publish jobs, `NOTICE`, `CODE_OF_CONDUCT.md`. Pure execution,
   roughly an afternoon. Routing it through research → RFC → epic would delay it
   for no design benefit.
2. **Log retention mechanics** — a configurable window plus a pruning job is a
   solved shape. What _is_ open is the default value and whether the audit log
   is exempt (see Open questions).

## Options considered — the controller boundary

**Option A — Primitives only (status quo).** Sovereign ships export, erasure,
and audit; operators work out their own obligations.

_Upside:_ zero ongoing cost, zero liability surface. _Downside:_ the primitives
are undiscoverable. An operator cannot answer "where is my users' data, what is
retained, for how long, and who are the sub-processors" without reading the
schema. For a project whose manifesto makes explicit claims about data
sovereignty, "the answer is in the source" is a weak position — the claims are
currently unverifiable by the people who most need to verify them.

**Option B — Primitives plus a documented posture.** Add the missing product
surface (legal URLs, controller identity, source link, consent record) and one
authoritative doc stating what Sovereign stores, where, for how long, what
leaves the instance, and how to service a DSAR or erasure request — but ship no
policy _text_.

_Upside:_ this is exactly what a self-hosting organisation's legal team asks for
first, and it is all factual claims about our own system, which we can make
accurately. It makes the manifesto's claims checkable. _Downside, honestly:_ the
doc must stay accurate as the schema evolves, and there is no parity test for it
the way `docs-parity.test.ts` covers manifest fields and env vars. It will drift
unless someone owns it. That is a real, recurring cost, not a one-off.

**Option C — Ship policy templates.** Generate or template privacy-policy and
terms text operators adopt.

_Upside:_ maximum operator convenience. _Downside:_ this is distributing legal
advice under the project's name, to operators in jurisdictions we know nothing
about, for processing activities we cannot see (any plugin can define its own).
Template text that is wrong is worse than no text, because it will be trusted
and deployed unread. **Reject.**

## Recommendation

**Option B**, with the retention default and trademark policy decided alongside
it, and the hygiene work from "What does not need research" carved out and done
immediately in parallel.

The reasoning is that B is the only option where every artifact is a factual
statement about our own system. That is the boundary: **Sovereign documents its
own behaviour exhaustively and provides the mechanisms; the operator supplies
the policy, the lawful basis, and the jurisdiction-specific text.** Stated that
way, the boundary also resolves the scope of the RFCs below without further
debate.

The AGPL §13 finding deserves separate emphasis: it is not a missing feature but
a live defect. Every operator running a modified Sovereign today is
non-compliant with the licence the project chose, by default, with no way to fix
it from configuration. That alone justifies scheduling this work rather than
parking it.

## Open questions

1. **Retention defaults.** What is the default window for `activity_log`,
   `data_access_log`, `email_delivery_log`, `push_delivery_log` — and is the
   audit log exempt on integrity grounds? These pull in opposite directions:
   storage limitation argues for expiry, audit integrity argues for
   immutability. **[counsel]** for the exemption question.
2. **Is consent even the right lawful basis?** A registration checkbox assumes
   it is. For a workspace an employer or community operator runs, contract or
   legitimate interest is often the actual basis, and a consent checkbox then
   misrepresents the relationship and creates a withdrawal right that cannot be
   honoured. This may mean recording _acceptance of terms_ (a contract artifact)
   rather than _consent_ — a different record with different semantics.
   **[counsel]**, and it changes the DB design, so it should be resolved before
   any schema work.
3. **Can white-labeling remove attribution entirely?** RFC 0027 is explicit that
   it enables closed-source commercial derivatives. Whether an operator may
   strip all "Sovereign" mention interacts with AGPL §13 (source offer is not
   waivable), trademark (an unattributed fork still trading on the name), and
   the dual-licensing plan. This must be settled inside epic task 9.9/9.10, not
   after.
4. **Accessibility statement: template or generated?** Partly answerable from
   real conformance data, which does not exist yet — axe-in-CI would produce it.
5. **Who owns the compliance doc's accuracy?** Option B's named weakness. Worth
   asking whether any part is mechanically checkable (e.g. asserting every
   personal-data-bearing table appears in the doc, in the spirit of
   `docs-parity.test.ts`).

## Next steps

Graduates to **three** RFCs, deliberately split so the uncertain one cannot
block the settled ones:

- **RFC — Instance legal identity and source disclosure.** Design: the
  `instance_config` additions (controller identity, policy URLs, source URL),
  the About/legal route that satisfies AGPL §13, and where it surfaces in the
  shell and on the auth pages. _The one thing it must decide:_ what a
  white-labeled instance is still required to display. Depends on open question
  3; coordinate with epic tasks 9.9/9.10.
- **RFC — Data retention and the operator compliance record.** Design: the
  retention config and pruning job, plus `docs/compliance.md` (data inventory,
  retention table, sub-processors — none by default beyond SMTP, DSAR and
  erasure runbooks). _The one thing it must decide:_ the default window and the
  audit-log exemption.
- **RFC — Terms acceptance record.** Design: what is captured at registration
  and how it is versioned and re-prompted on change. _Blocked on open question 2
  — do not design the schema until the lawful-basis question is answered_, since
  "consent" and "terms acceptance" are different records.

Trademark policy is not an RFC — it is a maintainer decision plus a
`TRADEMARK.md`, and it should be made before v1.0.0 while the name still has a
single referent.

# Workstream 0006 — RFC 0071 incident: remaining follow-ups

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** [0071](../rfcs/0071-sqlite-at-rest-encryption.md) (governing —
follow-up, not a new design)\
**Epics touched:** 0 (Infrastructure), 8 (Data Sovereignty)

---

## Goal

Close the four items from `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`'s
"Follow-up actions" table that shipped as prose in a postmortem but never
became a task — invisible to `ROADMAP.md` and unlikely to get done because
nothing pointed at them. (A fifth original item, the migrations-loop
isolation fix, and four others shipped same-day as code fixes; this
workstream is only the leftover four.) At the end: a published-image
deployment can run `sv` admin commands without a source checkout, an
operator adding an encryption-requiring plugin gets warned before the next
restart instead of at it, and the three documentation gaps the incident's
own "Lessons learned" section named are filled.

## Definition of done

- [ ] A production deployment with only `docker-compose.prod.yml` + `.env`
      and `SOVEREIGN_VERSION` set (no source checkout) can run
      `docker compose --profile tools run --rm tools pnpm sv <command>`
      successfully — the exact workaround the incident needed no longer
      applies.
- [ ] Adding a plugin that declares `database.requireEncryption: true` to an
      instance with no encryption key set (or a key set but pre-existing
      plaintext data) prints a warning naming the plugin **at install time**,
      not only discovered at the next restart.
- [ ] `docs/plugin-development.md` states migration files are append-only
      once a plugin version ships.
- [ ] `docs/self-hosting.md`'s RFC 0071 section documents "installing an
      encryption-requiring plugin onto an already-running unencrypted
      instance" as its own scenario, distinct from the two already covered.
- [ ] `docs/troubleshooting.md` and `docs/upgrade.md` both surface the exact
      `DbEncryptionConfigError` message (the incident doc's step 6) as a
      searchable heading.

## Decisions locked

| Decision                        | Choice                                                                                                                                                                                  | Rejected alternative and why                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                           | Only the 4 items the incident doc's own table still lists as "Not started" (epic tasks 0.19, 8.19)                                                                                      | Re-opening the encryption-enforcement model itself — Task 8.15 already redesigned that; this workstream only adds earlier warning and documentation on top of it, not a new semantics change            |
| Task split                      | Two epic tasks by domain: 0.19 (Docker/CI, infrastructure epic) and 8.19 (CLI code + docs, data-sovereignty epic)                                                                       | One combined task — rejected because a Docker/CI publish-workflow change and a CLI/docs change are independently reviewable and touch unrelated file trees; bundling them makes the PR harder to review |
| Pre-flight check implementation | Reuse the existing, already-written `findEncryptionRequiringPlugins()` scanner (`bin/sv.ts:758`, currently only called by `sv db encrypt`/`decrypt`) by wiring it into the install path | Writing a new detector — rejected as pure duplication; the scanning logic already exists and is already correct, it's just never invoked at install time                                                |
| `sovereign-tools` image build   | Add `sovereign-tools` to the existing publish matrix using the Dockerfile's existing `tools` build target (`Dockerfile:98`)                                                             | A separate, dedicated Dockerfile for the tools image — rejected as unnecessary; `docker-compose.prod.yml`'s `tools` service already builds from this exact target locally, this only publishes it       |
| Workstream execution            | Legs — one branch, one draft PR, one review gate per leg                                                                                                                                | A single combined PR — rejected for the same reviewability reason as the task split above                                                                                                               |

## Prerequisites

None blocking. Epic task 8.15 (per-database SQLite encryption enforcement,
✅ shipped) is the semantics this workstream's pre-flight check surfaces
earlier — it is not amended or reopened.

## Legs

| Leg | Name                                            | Epic tasks | Epics | Gate? | Done when                                                                                                                              |
| --- | ----------------------------------------------- | ---------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Publish a `sovereign-tools` image               | 0.19       | 0     | No    | A published-image-only deployment (no source checkout) runs `sv db encrypt` and every other documented `sv` admin command successfully |
| 2   | Pre-flight warning and remaining doc follow-ups | 8.19       | 8     | No    | Installing an encryption-requiring plugin on an unencrypted instance warns at install time, and all three doc gaps are filled          |

Legs 1 and 2 are independent — neither depends on the other, and either can
ship first. Default sequence is 1 → 2 only because Leg 1 is the smaller,
more mechanical change.

## Leg detail

### Leg 1 — Publish a `sovereign-tools` image

**Epic tasks:** 0.19

**Why this leg can go first:** it's a self-contained CI/Docker change with
no code-behavior dependency on Leg 2 — smallest, most mechanical leg in this
workstream, good to land and verify independently.

**Technical notes:**

- Add a `sovereign-tools` entry to the `build-and-push` matrix in
  `.github/workflows/publish-images.yml` (currently only `sovereign-runtime`
  and `sovereign-auth`, `.github/workflows/publish-images.yml:41-46`), with
  `target: tools` passed to `docker/build-push-action` — the Dockerfile
  already has this stage (`Dockerfile:98`, `AS tools`), don't build a new
  one.
- Add the matching `image:` fallback line to `docker-compose.prod.yml`'s
  `tools` service (`docker-compose.prod.yml:209-214`), mirroring `runtime`'s
  exact pattern one block above it
  (`image: ${SOVEREIGN_VERSION:+ghcr.io/sovereignfs/sovereign-runtime:${SOVEREIGN_VERSION}}`,
  `docker-compose.prod.yml:98`) — same `SOVEREIGN_VERSION`-gated form, just
  the `sovereign-tools` image name.
- Verify the existing local `build:` fallback (no `SOVEREIGN_VERSION` set)
  still works unchanged — this leg adds a fallback, it doesn't replace the
  existing path.
- `docs/self-hosting.md`'s backup/restore and encryption sections currently
  instruct operators to clone the repo before running `tools` commands
  against a published-image deployment — update those instructions once the
  image exists.

**Do not proceed if:** the `tools` image, once published, turns out to
depend on build context (source files) not present in the image itself at
runtime — verify the built image actually contains everything `sv`'s
commands need (migrations, `bin/sv.ts`'s compiled output) before treating
this leg as done; a published image that still silently needs a source
checkout for some commands would not actually close the incident's gap.

### Leg 2 — Pre-flight warning and remaining doc follow-ups

**Epic tasks:** 8.19

**Technical notes:**

- **Per this codebase's standing CLAUDE.md rule on this subsystem**: read
  `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md` in full before
  touching anything here, and re-run the full test suite plus a live
  encrypt → verify → decrypt → verify round-trip against real data before
  considering this leg done — this area has repeatedly looked more finished
  than it was.
- Wire `findEncryptionRequiringPlugins()` (`bin/sv.ts:758`) into
  `scripts/install-plugins.ts`'s install path and/or a new `sv plugin add`
  check. It already knows how to scan `plugins/<dir>/manifest.json` for
  `database.requireEncryption` — the only new work is calling it at install
  time and comparing against the instance's current key/marker state
  (reuse whatever helper Task 8.15 already exposes for that check, don't
  reimplement it).
- This is a **warning**, not a new blocking gate — the instance still boots
  and Task 8.15's existing warn-on-no-key / fail-fast-on-plaintext behavior
  is unchanged. This leg only makes the same signal visible earlier.
- `docs/plugin-development.md`'s new append-only-migrations section should
  explain _why_ (Drizzle's SQLite migrator compares a migration folder's
  embedded timestamp against `__drizzle_migrations`, not a content hash —
  see the incident doc's step 9) so plugin authors understand the failure
  mode, not just the rule.
- `docs/self-hosting.md`'s new scenario should walk the exact incident
  sequence end to end: add plugin → install-time warning (this leg) →
  `sv db encrypt` → restart — so it reads as a runnable recipe, not just a
  warning that something can go wrong.
- `docs/troubleshooting.md`/`docs/upgrade.md` entries should each be a
  distinct, searchable heading containing the exact error string, not
  buried in prose — an operator's first move is usually to search the exact
  message.

**Do not proceed if:** the install-time check can't be made to cover every
real install path (`sv plugin add`, `pnpm install:plugins`, a manually
cloned `.local` plugin) without disproportionate new plumbing — in that
case, ship the check for whichever paths it can cover cleanly (most likely
`scripts/install-plugins.ts`, the one every documented install flow already
routes through) and note the gap explicitly in this workstream's Risks
section, rather than block the whole leg chasing full coverage.

## Risks

- **RFC 0071's encryption work needed three hardening passes including a
  production incident** (per `CLAUDE.md`'s own account) — Leg 2 touches
  code adjacent to that machinery (even though it doesn't change its
  enforcement semantics). Treat it as above-average-risk, not routine, per
  that file's standing guidance.
- **Leg 1 is a supply-chain-adjacent change** (a new published image) —
  low risk in itself, but any mistake in the publish matrix could affect
  the existing `sovereign-runtime`/`sovereign-auth` publish jobs if the
  matrix or shared steps are edited carelessly. Keep the diff additive
  (a new matrix entry), not a restructuring of the existing jobs.
- **The install-time check (Leg 2) can only warn, not force** an operator
  to run `sv db encrypt` before restarting — someone can still ignore the
  warning and hit the same boot-time failure Task 8.15 already handles
  gracefully. That's an accepted limitation, not a bug: forcing the action
  at install time would mean blocking plugin installation entirely, a much
  bigger behavior change this workstream doesn't propose.

## Kill criteria

**If Leg 2's install-time check can't reliably cover the common install
paths** (see "Do not proceed if" above) — ship the documentation and
`sovereign-tools` image work regardless; those two items stand on their own
value even without the pre-flight warning. What survives: the docs and
image-publish fixes are unconditionally useful; only the warning's coverage
would be narrower than planned.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |

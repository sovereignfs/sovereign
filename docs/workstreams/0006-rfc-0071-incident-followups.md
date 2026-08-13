# Workstream 0006 — RFC 0071 incident: remaining follow-ups

**Status:** ✅ Definition of done satisfied — Leg 1 shipped ([PR #431](https://github.com/sovereignfs/sovereign/pull/431), merged 2026-08-13), Leg 2 rejected (see Changelog v0.3)\
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
workstream is only the leftover four.)

**Re-scoped 2026-08-13 (see Changelog v0.2–v0.3):** RFC 0071's at-rest
encryption was retired from the live code path before this workstream was
started, which invalidated three of the original four items outright (Leg
2 — see its section below for the rejection rationale). What remains: a
published-image deployment can run `sv` admin commands without a source
checkout (Leg 1, re-pointed at today's actual commands rather than the
retired `sv db encrypt`/`decrypt`).

## Definition of done

- [x] A production deployment with only `docker-compose.prod.yml` + `.env`
      and `SOVEREIGN_VERSION` set (no source checkout) can run
      `docker compose --profile tools run --rm tools pnpm sv <command>`
      successfully for every documented admin command (`sv backup`/`restore`,
      `sv db migrate-to-sqld`/`migrate-to-postgres`/`encrypt-fields`,
      `sv keys rotate-field-kek`/`rotate-blind-index`, `sv user reset-mfa`)
      — the exact workaround the incident needed no longer applies. Shipped
      in [PR #431](https://github.com/sovereignfs/sovereign/pull/431).

Leg 2's three definition-of-done items (pre-flight encryption warning,
`docs/plugin-development.md` append-only-migrations note, and the
`docs/self-hosting.md`/`troubleshooting.md`/`upgrade.md` doc gaps) are
dropped along with the leg — see its section below.

## Decisions locked

| Decision                        | Choice                                                                                                                                                                                                                | Rejected alternative and why                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                           | Only the 4 items the incident doc's own table still lists as "Not started" (epic tasks 0.19, 8.19)                                                                                                                    | Re-opening the encryption-enforcement model itself — Task 8.15 already redesigned that; this workstream only adds earlier warning and documentation on top of it, not a new semantics change            |
| Task split                      | Two epic tasks by domain: 0.19 (Docker/CI, infrastructure epic) and 8.19 (CLI code + docs, data-sovereignty epic)                                                                                                     | One combined task — rejected because a Docker/CI publish-workflow change and a CLI/docs change are independently reviewable and touch unrelated file trees; bundling them makes the PR harder to review |
| Pre-flight check implementation | ~~Reuse the existing, already-written `findEncryptionRequiringPlugins()` scanner...~~ **Moot as of v0.3** — that scanner and the manifest field it scanned for no longer exist; Leg 2 is rejected, not re-implemented | —                                                                                                                                                                                                       |
| `sovereign-tools` image build   | Add `sovereign-tools` to the existing publish matrix using the Dockerfile's existing `tools` build target (`Dockerfile:98`)                                                                                           | A separate, dedicated Dockerfile for the tools image — rejected as unnecessary; `docker-compose.prod.yml`'s `tools` service already builds from this exact target locally, this only publishes it       |
| Workstream execution            | Legs — one branch, one draft PR, one review gate per leg                                                                                                                                                              | A single combined PR — rejected for the same reviewability reason as the task split above                                                                                                               |

## Prerequisites

None blocking for Leg 1. Epic task 8.15 (per-database SQLite encryption
enforcement) is no longer relevant to this workstream — it was the semantics
Leg 2's pre-flight check would have surfaced earlier, and Leg 2 is rejected.

## Legs

| Leg | Name                                                               | Epic tasks | Epics | Gate? | Done when                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------ | ---------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ Publish a `sovereign-tools` image                               | 0.19       | 0     | No    | A published-image-only deployment (no source checkout) runs every documented `sv` admin command successfully (see Leg 1 detail for the current list) — shipped [PR #431](https://github.com/sovereignfs/sovereign/pull/431) |
| 2   | ~~Pre-flight warning and remaining doc follow-ups~~ — **Rejected** | ~~8.19~~   | ~~8~~ | —     | Not applicable — see Leg 2 detail below                                                                                                                                                                                     |

Legs 1 and 2 were independent — neither depended on the other. Leg 2 is
rejected outright (see its section below); Leg 1 shipped and this
workstream's definition of done is satisfied.

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
- **Re-scoped (2026-08-13): the motivating commands were `sv db encrypt`/
  `decrypt`, which no longer exist** — RFC 0071's at-rest encryption was
  retired from the live code path (see CLAUDE.md's changelog and
  `docs/rfcs/0071-sqlite-at-rest-encryption.md`'s Status line) before this leg
  was ever started. `findEncryptionRequiringPlugins()` is also gone from
  `bin/sv.ts`, and the manifest schema now rejects any `database` key at all
  (`packages/manifest/src/__tests__/validate.test.ts:347-358`). The
  underlying gap this leg closes — no `sovereign-tools` image, so a
  named-volume production deployment needs a full source checkout to run any
  admin `sv` command — is still real and unrelated to encryption; verify
  against today's actual commands instead:
  - `sv backup` / `sv restore` (platform data snapshot/restore)
  - `sv db migrate-to-sqld` (one-time plain-file SQLite → sqld cutover)
  - `sv db migrate-to-postgres` (legacy per-plugin SQLite → Postgres)
  - `sv db encrypt-fields`, `sv keys rotate-field-kek`,
    `sv keys rotate-blind-index` (RFC 0092 field-level encryption — the
    mechanism that actually replaced RFC 0071)
  - `sv user reset-mfa` (break-glass MFA reset)
- `docs/self-hosting.md` sections needing a `tools`-service update once the
  image exists:
  - "Break-glass CLI" (`sv user reset-mfa`, ~line 987) already documents
    `--profile tools` usage; its closing pointer used to be a **dead anchor**
    (`#sqlite-at-rest-encryption-rfc-0071`, a heading removed with the
    retirement) — already fixed out-of-band (2026-08-13, re-pointed at
    "Migrating a legacy per-plugin SQLite database"), no action needed here.
  - "Migrating a legacy per-plugin SQLite database" (`sv db
migrate-to-postgres`, ~line 797) already documents `--profile tools`
    usage — no change needed beyond confirming it still works once the image
    is published.
  - The backup procedure under "Upgrade procedure (non-Docker)" (`sv backup`,
    ~line 707) does not mention the `tools` service at all for Docker
    deployments — add it.
  - "Field encryption (RFC 0092)" (~line 1701) documents `sv db
encrypt-fields`, `sv keys rotate-blind-index`, and `sv keys
rotate-field-kek` with plain `pnpm sv ...` invocations only — add the
    `--profile tools` equivalent for named-volume production deployments,
    same pattern as the MFA and migrate-to-postgres sections.

**Do not proceed if:** the `tools` image, once published, turns out to
depend on build context (source files) not present in the image itself at
runtime — verify the built image actually contains everything `sv`'s
commands need (migrations, `bin/sv.ts`'s compiled output) before treating
this leg as done; a published image that still silently needs a source
checkout for some commands would not actually close the incident's gap.
Verify specifically against the command list above, not the retired
`sv db encrypt`/`decrypt` commands the leg was originally written against.

### Leg 2 — Pre-flight warning and remaining doc follow-ups — **Rejected (2026-08-13)**

**Epic tasks:** ~~8.19~~ — rejected, see
[docs/epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected](../epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected)
for the full rationale.

**Why:** every technical note below assumed `database.requireEncryption` and
`findEncryptionRequiringPlugins()` (`bin/sv.ts:758`) still existed. Neither
does — RFC 0071's at-rest encryption was retired from the live code path
before this leg was started (CLAUDE.md's changelog;
[RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md)'s Status line), the
manifest schema now rejects any `database` key at all
(`packages/manifest/src/__tests__/validate.test.ts:347-358`), and the scanner
function is gone. There is nothing left to scan for or warn about at
install time. Of the four sub-deliverables this leg carried, three are moot
along with the mechanism (the pre-flight warning itself, the
`docs/self-hosting.md` scenario, and the `docs/troubleshooting.md`/
`docs/upgrade.md` entries for the now-unreachable
`DbEncryptionConfigError: ... has not been encrypted yet` message). The
fourth — `docs/plugin-development.md`'s append-only-migrations note — is
**not** encryption-specific and is still valid; it's been split out as its
own standalone follow-up rather than resurrected here (spawned as a separate
task on 2026-08-13).

Re-scoping this leg against RFC 0092's field-level encryption (the mechanism
that actually replaced RFC 0071, with its own `sv db encrypt-fields`/
`sv keys rotate-*` commands) would be a materially different task with a
different scanner, different manifest surface, and different failure modes
— not a fix to this leg. If wanted, plan it fresh under a new epic task, not
under 8.19.

## Risks

- **Leg 1 is a supply-chain-adjacent change** (a new published image) —
  low risk in itself, but any mistake in the publish matrix could affect
  the existing `sovereign-runtime`/`sovereign-auth` publish jobs if the
  matrix or shared steps are edited carelessly. Keep the diff additive
  (a new matrix entry), not a restructuring of the existing jobs.

~~RFC 0071 encryption hardening risk and the install-time-check-can-only-warn
risk~~ — both applied to Leg 2, which is rejected; removed.

## Kill criteria

Moot — Leg 2 (the only leg the original kill criteria covered) is rejected
outright, not conditionally. Leg 1 has no kill criteria of its own beyond
its "Do not proceed if" clause above.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 0.2     | 2026-08-13  | Re-scoped Leg 1: RFC 0071 at-rest encryption was retired from the live code path before this leg started, so the `sv db encrypt`/`decrypt` commands it was written against no longer exist. Leg 1's underlying goal (a `sovereign-tools` image so production doesn't need a source checkout) still stands — re-pointed at today's actual admin commands (`sv backup`/`restore`, `sv db migrate-to-sqld`/`migrate-to-postgres`, RFC 0092's `sv db encrypt-fields`/`sv keys rotate-*`, `sv user reset-mfa`) and flagged a dead anchor link in `docs/self-hosting.md`'s break-glass CLI section pointing at a heading removed with the retirement. Leg 2 is unaffected by this change — it remains fully moot and out of scope until separately re-planned. |
| 0.3     | 2026-08-13  | Rejected Leg 2 (epic task 8.19) outright — its mechanism (`database.requireEncryption`, `findEncryptionRequiringPlugins()`) no longer exists in the codebase; see `docs/epics/data-sovereignty.md`'s 8.19 section and `ROADMAP.md` (now ❌). One of its four sub-deliverables — `docs/plugin-development.md`'s append-only-migrations note — was encryption-independent and mis-bundled into the original rejection scope; corrected and spawned as its own standalone follow-up rather than resurrected under 8.19. Workstream proceeds with Leg 1 only.                                                                                                                                                                                                |
| 0.4     | 2026-08-13  | Leg 1 (epic task 0.19) shipped — [PR #431](https://github.com/sovereignfs/sovereign/pull/431), merged into `main` as `f6f005b`. `ROADMAP.md` and `docs/epics/infrastructure.md`'s 0.19 heading marked ✅. The split-out append-only-migrations doc note (from the 0.3 correction above) shipped separately as [PR #435](https://github.com/sovereignfs/sovereign/pull/435), also merged. This workstream's definition of done is satisfied — Leg 1 done, Leg 2 rejected — and it is closed.                                                                                                                                                                                                                                                              |

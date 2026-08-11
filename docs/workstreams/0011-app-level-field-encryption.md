# Workstream 0011 — App-Level Field Encryption

**Status:** ⏳ In Progress (Legs 1–3 ✅ → Leg 4 next, gate B pending)\
**Date:** August 2026\
**Author:** kasunben & Claude Code\
**Goal owner:** kasunben\
**RFCs:** [0092](../rfcs/0092-app-level-field-encryption.md) (Draft — acceptance is prerequisite 1)\
**Epics touched:** 8 (Data Sovereignty)\
**Research:** [0013](../research/0013-layered-database-encryption-strategy.md)

---

## Goal

A Sovereign instance whose operator has enabled field encryption stores classified plugin data as ciphertext in the database — a database operator with a live `psql`/sqld connection reads scrambled envelopes, not user data — while plugin authors declare sensitivity in one schema-helper call and write zero crypto code, exact-match search keeps working via blind indexes, and pre-existing plaintext is converted only by an explicit operator-run tool, never a boot side effect.

## Definition of done

- [ ] With `SOVEREIGN_ENCRYPT_CLASSES=pii,health` and `SOVEREIGN_FIELD_KEK` set, a classified column's stored value on live Postgres **and** live sqld is an `svf1:` envelope; with policy unset, behavior is byte-identical to today.
- [ ] A plugin using `encryptedText()`/`blindIndex()` passes CRUD + exact-match-search tests on both dialects with no imports beyond `@sovereignfs/sdk`/`drizzle-orm`.
- [ ] `sv keys rotate-field-kek` completes on a populated instance without reading data rows; `sv db encrypt-fields` survives a mid-run kill and resumes.
- [ ] User data export (RFC 0007) of encrypted rows emits plaintext; `sv backup` archives ciphertext.
- [ ] `docs/plugin-development.md` (helpers, permission, search patterns) and `docs/self-hosting.md` (env vars, runbook) updated; docs-parity green.
- [ ] `@sovereignfs/sdk` + `@sovereignfs/manifest` bumped minor only (NFR-04 — no breaking change).

## Decisions locked

| Decision             | Choice                                                                                                       | Rejected alternative and why                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Encryption boundary  | App tier (Node), before the write reaches either dialect                                                     | In-database (`pgcrypto`/`pg_tde`/`pgsodium`/RLS) — none survive a live superuser connection; extensions break bring-your-own-Postgres (research 0013)    |
| Scope model          | Author classifies (`sensitivity:` in schema), operator enforces (`SOVEREIGN_ENCRYPT_CLASSES`)                | Author-only opt-in — coverage would depend on every registry author's diligence, the exact gap this closes                                               |
| Key hierarchy        | `SOVEREIGN_FIELD_KEK` → per-(class × plugin) DEKs + separate HMAC keys, wrapped, stored                      | Reusing `SOVEREIGN_VAULT_KEY` — couples routine-data rotation to high-value secrets; per-user DEKs — key explosion, breaks blind indexes (RFC 0092 Alts) |
| Envelope             | `svf1:<dekId>:<iv>:<tag>:<ciphertext>`, AES-256-GCM, AAD `{tenantId, pluginId, class, column}`               | New scheme from scratch — `runtime/src/secrets.ts`'s proven `sv1` shape extends cleanly with a DEK id                                                    |
| Backfill             | Explicit `sv db encrypt-fields`, operator-triggered, resumable; enabling a class never mutates existing rows | Encrypt-on-boot when policy changes — the RFC 0071 incident shape (instance-wide toggle fanning out into cross-plugin mutation) exactly                  |
| Search on ciphertext | Blind index (exact match) + plaintext metadata + documented decrypt-and-filter fallback                      | Deterministic encryption for searchability — leaks equality patterns to the DB operator the design exists to exclude                                     |
| Helper packaging     | `encryptedText()`/`blindIndex()` in `@sovereignfs/sdk`, metadata-only over `drizzle-orm`                     | In `@sovereignfs/db` — plugins can't import it (SDK boundary); in each plugin — violates DS-first/platform-provides principle                            |

## Prerequisites

1. **RFC 0092 accepted, including gate A (taxonomy)** — kasunben. The four-class enum (`pii`/`health`/`financial`/`sensitive`) ships in leg 2's public packages; changing it later is a compat event.
2. **PR #408 (research 0013 + this planning set) merged** — kasunben review.
3. Live-DB test infrastructure (`TEST_DATABASE_URL`/`TEST_SQLD_URL`, CI services) — already in place from workstream 0009; no new infra.

## Legs

| Leg | Name                                | Epic tasks | Epics | Gate?                                                  | Done when                                                                            |
| --- | ----------------------------------- | ---------- | ----- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | Key service (KEK→DEK envelope)      | 8.31       | 8     | **A before start:** taxonomy sign-off                  | Keys wrap/unwrap/rotate on both dialects; boot guards fail loudly; docs-parity green |
| 2   | `sdk.crypto` surface + `crypto:use` | 8.32       | 8     | —                                                      | Permission-gated round-trip + AAD tamper tests pass; sdk/manifest minor bumps        |
| 3   | Schema helpers + policy write path  | 8.33       | 8     | —                                                      | Both-dialect CRUD/search green; export emits plaintext; plugin-dev docs updated      |
| 4   | Backfill + rotation tooling         | 8.34       | 8     | **B before start:** dual-read rotation design sign-off | Resumable backfill + rotation verified; operator runbook lands                       |

## Leg detail

### Leg 1 — Key service (KEK→DEK envelope)

**Epic tasks:** 8.31

**Why this leg is first:** everything downstream calls the key service; it has no dependency on SDK/manifest surface, so it lands without touching public contracts — the cheapest leg to revise if review reshapes the hierarchy.

**Technical notes:** mirror `runtime/src/secrets.ts`'s loader discipline exactly (`vaultKeyFromEnv()` — encoding, fail-fast, error naming). The wrapped-keys table is platform schema: migration in both `packages/db/migrations/{sqlite,postgres}`. Keep unwrapped DEKs inside one module boundary; the sdk-host layer receives an encrypt/decrypt closure, never key bytes.

**Do not proceed if:** gate A is unsigned (the DEK table is keyed by class — a taxonomy change after this leg means a key-table migration), or if review of RFC 0092 reopens the per-(class × plugin) granularity decision.

### Leg 2 — `sdk.crypto` surface + `crypto:use`

**Epic tasks:** 8.32

**Why this leg is second:** the public contract (SDK + manifest enums) should land in one reviewed piece before the helpers that depend on it; NFR-04 makes these the hardest artifacts to change later.

**Technical notes:** follow the `provideHost()` pattern (`runtime/instrumentation.ts` → `runtime/src/sdk-host.ts`) like every SDK impl. The policy-off passthrough envelope must be distinguishable from ciphertext (prefix discriminates) and documented — plugin code stays policy-agnostic. Remember docs-parity enumerates permissions and SDK keys: `docs/plugin-development.md` in the same PR.

**Do not proceed if:** the passthrough semantics feel ambiguous in review — a silent plaintext-when-you-expected-ciphertext bug here is the worst failure shape this workstream can produce; stop and escalate rather than ship a "probably fine" envelope discriminator.

### Leg 3 — Schema helpers + policy write path

**Epic tasks:** 8.33

**Why this leg is third:** it consumes both the key service and the SDK surface, and it's where dialect portability is proven (live Postgres + live sqld tests, the `.pg.test.ts`/`.sqld.test.ts` convention from workstream 0009).

**Technical notes:** `customType` metadata is the mechanism — the helpers carry no crypto. The write-path hook lives in the platform data layer, not in drizzle internals. Verify RFC 0092 open question 4 here: the RFC 0007 export path must decrypt (regression test), while `sv backup` stays ciphertext. Blind-index HMAC input should be normalized (case/trim) and documented, or exact-match will surprise plugin authors.

**Do not proceed if:** the write path can't intercept classified columns without patching drizzle itself — that's a redesign trigger, not a workaround situation.

### Leg 4 — Backfill + rotation tooling

**Epic tasks:** 8.34

**Why this leg is last:** it operates on data produced by legs 1–3 and carries the highest operational risk; everything before it is useful without it (new writes encrypt from leg 3 onward).

**Technical notes:** model the tool's safety shape on the retired `sv db encrypt` (backup-first, atomic per-unit, resumable progress records) — its operational lessons survive its retirement. Batch by plugin then table; `--plugin` bounds blast radius. The dual-read rotation window needs an explicit end state (re-index complete → old key deleted), not an indefinite both-keys mode.

**Do not proceed if:** gate B (rotation design) is unsigned, or if the RFC 0071 incident doc's checklist (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`) hasn't been re-read against the tool's design — that's the failure catalog this leg exists to not repeat.

## Risks

- **Silent passthrough** (leg 2): a plugin author believing a field is encrypted when the operator never enabled its class. Mitigated by the explicit envelope discriminator + Console policy display (leg 4), but the docs must say plainly that classification is not encryption.
- **Blind-index equality leakage:** even non-deterministic ciphertext plus a deterministic HMAC index reveals _which rows share a value_. Acceptable and documented (research 0013); flagging so it isn't rediscovered as a "vulnerability" mid-execution.
- **Write-path interception complexity** (leg 3): the platform data layer has both a portable-exec path (`packages/db/src/exec.ts`) and direct drizzle usage; classified-column handling must cover every write route a plugin can take, or coverage is illusory. Inventory write routes at leg-3 start.
- **Key-table bootstrapping order:** the key service needs the platform DB before plugin migrations run — same instrumentation-ordering territory as `provideHost()`; verify against `runtime/instrumentation.ts` sequencing early in leg 1.
- **Env drift:** two new env vars must reach `.env.example`, both compose files, and `docs/self-hosting.md` in the same legs that introduce them — the parity test only checks one direction (see CLAUDE.md).

## Kill criteria

If leg 3's write-path interception proves unimplementable without forking drizzle behavior (leg 3's stop condition), the workstream halts: legs 1–2 still leave a coherent, shippable surface — imperative `sdk.crypto.encryptField()`/`decryptField()` under `crypto:use`, documented as the manual path — and the helpers return to research. If gate A never signs off, nothing ships and RFC 0092 stays Draft; no partial taxonomy goes into public packages.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |

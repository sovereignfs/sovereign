# 2026-07-24 — RFC 0071 encryption rollout incident

**Status:** Resolved\
**Severity:** High — five installed plugins unavailable (500s) on the production instance for the duration of the incident; no data loss\
**Systems:** `sovereignfs/sovereign` (platform), `sovereignfs/sovereign-healthlog` (plugin), production deployment at `sovereign.openfs.io`

## Summary

Bumping `sovereign-healthlog` to a version that declares `database.requireEncryption: true`
(RFC 0071) — a deliberate, wanted change, since HealthLog is a personal
health-record plugin — took down five other plugins (`docs`, `plainwrite`,
`shopper`, `wallet`, and HealthLog itself) on the production instance when
deployed. The instance itself stayed up throughout; the failures were scoped
to plugins whose isolated SQLite databases needed a migration or encryption
step that never got to run.

Four distinct root causes contributed, only one of which was actually about
encryption being "wrong." No user data was lost or exposed; every step taken
against production had an automatic backup in front of it.

## Timeline

1. RFC 0071 (opt-in SQLite at-rest encryption) shipped on the platform
   (root/platform version `0.44.0`) with a real bug: the marker guard treated
   "key set, marker absent" as always meaning pre-existing plaintext data,
   with no exception for a genuinely empty data directory — silently
   breaking the documented "enable on a fresh instance" path. Found via
   review, fixed, merged (`fix: allow SQLite encryption to bootstrap on a
genuinely fresh instance`).
2. Two follow-up CI fixes landed the same day: the E2E workflow needed
   `SOVEREIGN_DB_ENCRYPTION_KEY` set once a plugin started requiring
   encryption, and `bin/sv.ts` needed to load the root `.env` the same way
   `scripts/dev.ts` already did (it previously only read `process.env`
   directly, so `sv seed`/`sv db encrypt` silently ignored a key sitting in
   `.env`).
3. `sovereign-healthlog` was updated to declare `database.requireEncryption:
true` — a deliberate product decision (health data warrants demanding
   platform-enforced encryption, not leaving it to the instance-wide
   default) — released as `v0.2.0`, and `sovereign.plugins.json` on `main`
   was bumped to pin that version.
4. Production was deployed with this pinned version. `SOVEREIGN_DB_ENCRYPTION_KEY`
   was set (correctly, as a real environment variable — confirmed during
   triage), but `sv db encrypt` had never been run against the instance's
   existing plaintext data, since the instance had been running
   unencrypted since before this rollout.
5. **First failure mode:** `docs`, `healthlog`, `plainwrite`, `shopper`, and
   `wallet` all returned 500s. Root cause: `runAllPluginMigrations()`
   iterates the plugin registry in a fixed alphabetical order, and
   `assertPluginEncryptionRequirement()`'s check for `healthlog` was called
   _outside_ the per-plugin `try/catch`, specifically so a violation would
   throw and abort. An uncaught throw inside a `for` loop aborts the whole
   loop, not just that iteration — so every plugin sorting alphabetically
   after `healthlog` (`ledger`, `plainwrite`, `shopper`, `tally`, `tasks`,
   `wallet`) silently never got its own migrations attempted that boot.
   Fixed and merged same day (`fix: isolate one plugin's unmet encryption
requirement from all others`) — each plugin's encryption check is now
   isolated in its own `try/catch`; a violation skips only that plugin's own
   provisioning, and the function still throws once, naming every violator,
   only after every other plugin has had its turn.
6. With that fix deployed, the _actual_ trigger was diagnosed from server
   logs: every failure was `DbEncryptionConfigError: SOVEREIGN_DB_ENCRYPTION_KEY
is set, but the data directory has not been encrypted yet.` — correct,
   intentional fail-fast behavior. `docs`, `healthlog`, `plainwrite`,
   `shopper`, and `wallet` all explicitly declare `dialect: "sqlite"` in
   their manifests (so they always use an isolated SQLite file regardless of
   the platform's own dialect), and those files already existed as plaintext
   from before this rollout. `sv db encrypt` had never been run.
7. **Second failure mode, discovered while attempting the fix:** the
   `tools` Compose service (`docker-compose.prod.yml`) has no `image:`
   fallback — only a `build:` block targeting a local `Dockerfile` — and no
   `sovereign-tools` image is ever published to GHCR (only `sovereign-runtime`
   and `sovereign-auth` are). The production deployment pulls published
   images and has no source checkout, so the documented `sv db encrypt`
   procedure was unusable as written. Worked around by cloning the repository
   into a sibling directory (`/opt/apps/sovereign-src`) and running the
   `tools` service from there — the named volume (`sovereign_data`) is
   pinned by an explicit `name:` in the compose file specifically so it
   resolves the same regardless of which directory Compose runs from, so
   this reached the real data correctly.
8. Also discovered mid-workaround: the `tools` image build was extremely
   slow (multiple minutes, looked hung) because the `tools` stage branched
   off the `builder` stage _after_ its `next build` step — a full production
   Next.js build the CLI never needed. Root-caused and fixed (Dockerfile
   restructured so `tools` branches off before the app-build step); verified
   locally (~2:18 total build, vs. an earlier attempt still running past
   3+ minutes).
9. `sv db encrypt` succeeded (7 files, automatic backup first). Services
   restarted with the key set — booted, but `docs` now failed differently:
   `SqliteError: table docs_document_members already exists` during its own
   migration. Root cause: Drizzle's SQLite migrator tracks "already applied"
   purely by comparing a migration folder's embedded timestamp against the
   most recent `created_at` in `__drizzle_migrations` (no hash matching) —
   the `docs` plugin's single migration file had at some point been
   regenerated with a newer timestamp than what was recorded as applied on
   this instance, so Drizzle tried to re-run a `CREATE TABLE` whose table
   already existed from an earlier, successful application. Unrelated to
   encryption — it only surfaced now because `docs`' migrations had never
   gotten a chance to run since the encryption barrier went up. Fixed by
   bumping the tracking row's `created_at` forward via the `tools` container
   (a metadata-only change; no schema or data touched).
10. Final restart: clean boot, no errors. `docs`, `healthlog`, `plainwrite`,
    `shopper`, and `wallet` all confirmed loading correctly.
11. While investigating an unrelated `pg` `DeprecationWarning` noticed in
    the same logs ("Calling client.query() when the client is already
    executing a query"), found a real (if not currently data-corrupting)
    race in `packages/db/src/plugin-client.ts`: an isolated Postgres
    plugin's `search_path` was set via an unawaited `client.query()` inside
    a `pool.on('connect', ...)` handler, which node-postgres currently
    tolerates by internally queueing the overlapping call (verified via a
    live-Postgres stress test: 0/30 wrong-schema reads under concurrent
    load either way) but which is explicitly slated to become a hard error
    in `pg@9.0`. Not the cause of anything in this incident — none of the
    affected plugins are isolated-Postgres — but fixed alongside (pin
    `search_path` via the connection's startup options instead, which
    Postgres applies before accepting any query, eliminating the pattern
    entirely) and covered by a new live-Postgres regression test.

## Impact

- `docs`, `healthlog`, `plainwrite`, `shopper`, and `wallet` returned 500s
  for the duration of the incident. `tasks`, `ledger`, `tally`, and `tritext`
  (shared-database or platform-dialect-fallback plugins) were unaffected
  throughout.
- No data loss. Every destructive-adjacent step (`sv db encrypt`, the
  `docs` migration-tracking edit) was preceded by an automatic backup or was
  itself a non-destructive metadata update.
- No data exposure. The instance was never in a state where encrypted-vs-plaintext
  expectations silently diverged — every failure mode here was the platform
  correctly refusing to guess rather than silently doing the wrong thing.

## Resolution (what was actually run against production)

1. Cloned the repo to `/opt/apps/sovereign-src` (source needed for the `tools`
   image; the main deploy directory only has `docker-compose.prod.yml` + `.env`).
2. `docker compose -f docker-compose.prod.yml --profile tools run --rm tools
pnpm sv db encrypt --dataDir /app/data` — encrypted all 7 SQLite files,
   automatic backup taken first.
3. `docker compose -f docker-compose.prod.yml restart runtime auth` from the
   real deploy directory (`/opt/apps/sovereign`).
4. Diagnosed the `docs` migration-tracking mismatch from `runtime` logs;
   fixed via a one-line `UPDATE __drizzle_migrations SET created_at = ...`
   run through the `tools` container against the now-encrypted `docs.db`.
5. Restarted `runtime` again — clean boot, confirmed all previously-broken
   plugins loading.

## Follow-up actions

| Item                                                                                                                                  | Status                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations-loop isolation (`runAllPluginMigrations`)                                                                                  | Done, merged                                                                                                                                                                  |
| Marker-guard fresh-instance fix                                                                                                       | Done, merged                                                                                                                                                                  |
| E2E workflow / `sv` CLI `.env` loading fixes                                                                                          | Done, merged                                                                                                                                                                  |
| `tools` image: skip the unnecessary `next build`                                                                                      | Done, merged                                                                                                                                                                  |
| `plugin-client.ts` Postgres `search_path` race fix + regression test                                                                  | Done, merged                                                                                                                                                                  |
| Publish a `sovereign-tools` image (or add an `image:` fallback) so `tools` works without a source checkout                            | Tracked — [epic task 0.19](../epics/infrastructure.md#-019--publish-a-sovereign-tools-image)                                                                                  |
| Pre-flight check: warn when a plugin requiring encryption is being added to an instance with pre-existing unencrypted data and no key | [epic task 8.19](../epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected) — Rejected, moot after RFC 0071's retirement |
| Plugin-authoring guidance: migration files are append-only once shipped, never regenerate an already-released one                     | [epic task 8.19](../epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected) — Rejected, moot after RFC 0071's retirement |
| `docs/self-hosting.md`: explicit "installing a plugin that requires encryption on an existing unencrypted instance" scenario          | [epic task 8.19](../epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected) — Rejected, moot after RFC 0071's retirement |
| `docs/troubleshooting.md` / `docs/upgrade.md` entries for this failure class                                                          | [epic task 8.19](../epics/data-sovereignty.md#-819--rfc-0071-incident-pre-flight-warning-and-remaining-doc-follow-ups--rejected) — Rejected, moot after RFC 0071's retirement |

## Lessons learned

- **A single plugin's misconfiguration must never silently take unrelated
  plugins down with it.** The alphabetical-registry-order dependency in
  `runAllPluginMigrations` was a latent landmine since RFC 0071 shipped; it
  just hadn't been triggered by a real deployment until this one.
- **"Works when built from source" and "works from a published image" are
  different claims**, and RFC 0071's admin tooling was only ever validated
  against the former. Any future admin-CLI feature needs to be checked
  against the published-image deployment path specifically, not assumed
  equivalent.
- **Adding a plugin that raises the security bar on an existing instance is
  a distinct operational scenario** from either "fresh instance" or "convert
  existing plaintext instance" — it's a combination of both, and the docs
  didn't call it out as its own case.

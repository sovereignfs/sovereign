---
docSection: operators
docType: guide
audiences:
  - operator
  - app-developer
---

# Upgrade guide

Migration notes for breaking changes and release-by-release upgrade steps.

Per NFR-04, any breaking change to a published package (`@sovereignfs/sdk`,
`@sovereignfs/ui`) ships with at least a minor version bump and an entry here.
Operators upgrading a self-hosted instance should read the Platform releases
section; plugin developers should read the Published package migrations section.

---

## Upgrade procedure (Docker Compose)

This is the standard path for all production upgrades.

### 1. Back up data

Always snapshot before upgrading. On a running instance:

**Docker Compose (production) — back up the named volume.** The prod stack
stores data in the `sovereign_data` named volume, not on the host, so snapshot
the volume directly:

```bash
docker run --rm \
  -v sovereign_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine \
  tar czf /backup/sovereign-backup-$(date +%Y%m%dT%H%M%S).tar.gz -C /data .
```

**Source / host install — use the CLI.** When the databases live in a host
`./data` directory (dev, bind-mount, or a non-Docker host install), `sv backup`
snapshots them (it reads `DATABASE_URL` from the environment):

```bash
pnpm sv backup
```

Either way the archive contains all SQLite databases (with their `-wal`/`-shm`
sidecars) and the `avatars/` directory, stored with paths relative to the data
directory so it restores into any location.

### 2. Apply the upgrade

**Published images** (recommended — no build step):

```bash
# Pin the exact release you are upgrading to.
SOVEREIGN_VERSION=v0.15.0 docker compose -f docker-compose.prod.yml pull
SOVEREIGN_VERSION=v0.15.0 docker compose -f docker-compose.prod.yml up -d
```

**Build from source** (forks, air-gapped environments, custom patches):

```bash
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Database migrations run automatically on startup via `runMigrations()` in
`packages/db`. The server is fail-fast: a migration error prevents the
runtime from accepting requests, leaving the pre-upgrade snapshot intact.

### 3. Verify

```bash
# Check health — includes platform version and any downgrade warning.
curl -s -H "Authorization: Bearer $SOVEREIGN_ADMIN_KEY" \
  http://localhost:4000/api/admin/health | jq .
```

A successful upgrade shows the new `platformVersion`. A `downgradeWarning`
field means the database was last written by a newer binary — stop, restore
your backup, then re-apply the correct image.

### Rollback

If the upgraded instance is unhealthy:

```bash
# 1. Stop the upgraded containers.
docker compose -f docker-compose.prod.yml down

# 2. Restore the pre-upgrade backup into the named volume (mirror of the backup
#    command — overwrites the volume contents from the archive).
docker run --rm \
  -v sovereign_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/<archive>.tar.gz -C /data'

# 3. Start the previous image.
SOVEREIGN_VERSION=<previous-version> docker compose -f docker-compose.prod.yml up -d
```

(For a source / host install, use `pnpm sv restore ./backups/<archive>.tar.gz`
instead of the volume command.)

For published images, `SOVEREIGN_VERSION` pins the exact tag to restart from.
For source builds, `git checkout <previous-commit>` before rebuilding.

---

## Platform releases

Version numbers in the sections below refer to the **`runtime` package version**
(`runtime/package.json`), not the root `package.json`. The root `package.json`
tracks roadmap phase milestones and will jump to `1.0.0` at the public release.
See the [Runtime version map](#runtime-version-map) and [v1.0.0 release checklist](#v100-release-checklist) at the end of this file.

Notes call out any required configuration changes, schema changes, or action required.

### v0.86.1 → v0.87.0

- **Breaking for plugin developers: the runtime shell no longer pads plugin
  content.** Previously `runtime/app/(platform)/shell.module.css` applied
  `var(--sv-space-8)` (32px desktop) / `var(--sv-space-4)` (16px mobile) to
  every non-`data-plugin-fullbleed` plugin's content region. That gutter is
  gone; the shell now contributes only clearance for chrome it alone can
  measure (offline banner height while visible, mobile footer height). A
  plugin's padding and max-width instead come from `@sovereignfs/ui`'s
  `PageContainer`, wrapping the plugin's page or root layout — see
  `docs/design-system.md`'s "Page layout" section and `docs/plugin-development.md`.
  `@sovereignfs/ui` bumped to `0.55.0` with this change: `PageContainer`
  gained a `padding` prop (`'none' | 'sm' | 'md' | 'lg'`, default `'md'` —
  `'md'` reproduces the exact gutter the shell used to apply, so
  `<PageContainer>{children}</PageContainer>` with no props is the
  equivalent replacement for a plugin that previously relied on the shell)
  and `maxWidth`'s default flipped from `'md'` to `'full'` (all in-repo
  callers already passed `maxWidth` explicitly, so this default change was
  invisible in this repo, but is a behavior change for any external caller
  relying on the old default).
  - **Action required — plugin developers:** wrap every page (or your root
    `app/layout.tsx`) in `PageContainer`. Until you do, your plugin renders
    edge-to-edge. If your plugin already had its own `padding`/`max-width`
    in `app/layout.tsx` or a page CSS module, keep that CSS but additionally
    check `docs/design-system.md` — declaring padding in both places
    double-pads; move it onto `PageContainer`'s props instead.
  - **Action required — instance operators:** none. This is a plugin-authoring
    contract change, not a runtime configuration, schema, or data change.
    Every plugin shipped with the platform (`plugins/launcher`,
    `plugins/account`, `plugins/console`, and every `example-plugins/*`
    reference plugin) was migrated in the same change and renders correctly
    with no action needed.
  - See `docs/epics/design-system.md` task 9.25 and `docs/architecture-rules.md`
    for the full rationale, including how overlay-shell (`shell: "overlay"`)
    plugins avoid double-padding inside their `Dialog` automatically.

### v0.75.1 → v0.75.2

- **Fix: offline navigation to a non-cached page now shows the `/offline`
  page instead of a raw browser error.** Root cause: Next's `next.config.ts`
  loader globally retranspiles every module reached from that file through
  SWC (because the compiled config contains `require(`), which silently
  broke every `async` service-worker plugin hook in `runtimeCaching` —
  including `@ducanh2912/next-pwa`'s own auto-injected `handlerDidError` —
  with a `ReferenceError: _async_to_generator is not defined` inside the
  generated `sw.js`. Chrome hid this behind a bare `net::ERR_FAILED`; only
  Safari/WebKit surfaced the real exception, which is how it was
  root-caused. Affected any offline request that fell through to a
  non-precached page (e.g. `/console` visited offline with nothing cached).
  - **Action required:** none. No config, schema, or data changes.
  - See `docs/workstreams/0008-offline-first-architecture.md`'s leg 2 section
    and the comment above `runtimeCaching` in `runtime/next.config.ts`.

### v0.75.0 → v0.75.1

- **`SOVEREIGN_OFFLINE_SESSION_TTL_SECONDS` is removed.** It configured the
  offline session assertion (research 0012, workstream 0008 legs 2a/2b), an
  offline-access mechanism found via live testing to have a real
  authentication bypass: `next-pwa`'s own default caching of `/` never went
  through it at all, so a signed-out user's cached shell replayed offline
  regardless of session validity. Offline access to non-neutral pages (i.e.
  everything except manifest-declared `offline: 'offline-first' | 'device-only'`
  routes) no longer works — those pages now show the generic `/offline` page
  when the network is unreachable, rather than a stale, potentially
  wrong-user copy. Manifest-declared offline-first routes (Launcher, and `/`
  itself when Launcher is the platform root) are unaffected and still work
  offline, via the unrelated neutral-shell mechanism.
  - **Action required:** none. If you set this variable, remove it — it is
    now unread and has no effect. No data, session, or plugin is affected.
  - See `docs/architecture-rules.md`'s "cached authenticated document" rule
    for the current mechanism.

### v0.74 → v0.75 (root `package.json` 0.76.1 → 0.77.0)

**Breaking — database environment variables changed, and SQLite at-rest
encryption was retired.** No application code changes for operators, but
every deployment's `.env`/compose config needs updating before this version
will boot.

- **`DATABASE_URL` and `AUTH_DATABASE_URL` are gone.** `DB_DIALECT` is now
  the sole source of truth for the dialect — **required**, no default, no
  inference from a URL scheme. Postgres additionally requires the new
  `POSTGRES_DB_URL` (read identically by the runtime and the auth server —
  there is no longer a separate auth-specific database variable). SQLite
  needs nothing else here (see below).
  - **Action required:** set `DB_DIALECT=sqlite` or `DB_DIALECT=postgres`
    explicitly. On Postgres, rename `DATABASE_URL`/`AUTH_DATABASE_URL` to a
    single `POSTGRES_DB_URL`.
- **SQLite has no plain-file fallback anymore — sqld is now baked into the
  base Docker Compose files** (`docker-compose.yml` /
  `docker-compose.prod.yml`), not a separate opt-in overlay
  (`docker-compose.sqld.yml` is deleted). A plain `docker compose up --build`
  now also starts the `sqld` service automatically.
  - **Action required for a non-Docker SQLite deployment:** run an sqld
    instance yourself and point `SQLD_URL`/`SQLD_ADMIN_URL` at it — there is
    no more "just open `data/sovereign.db`" fallback.
- **Auth now gets its own dedicated store** instead of sharing the
  platform's — a Postgres schema (`sovereign_auth`) or an sqld namespace of
  the same name, mirroring how every isolated plugin already gets its own
  schema/namespace. On SQLite this matches existing behavior (auth already
  had its own `'auth'` sqld namespace, just renamed). **On Postgres this is
  new**: auth's tables move out of `public` into `sovereign_auth`.
  - **Action required on an existing Postgres instance:** auth's existing
    data (better-auth's `user`/`session`/`account`/`verification` tables,
    plus this platform's own `invites`/`auth_settings`/`auth_email_delivery_log`)
    needs migrating into the new schema before upgrading, or auth starts
    against a fresh, empty schema. There is no automated migration tool for
    this yet — take a `pg_dump` backup first, then move the tables manually
    (`ALTER TABLE ... SET SCHEMA sovereign_auth`) before starting this
    version.
- **`SOVEREIGN_DB_ENCRYPTION_KEY` and SQLite at-rest encryption (RFC 0071)
  are retired** — `sv db encrypt`/`sv db decrypt` are removed. Neither
  dialect has an application-level at-rest encryption option now; rely on
  disk/volume-level encryption if this matters for your deployment. A future
  resolution covering both dialects is tracked separately, not yet designed.
  - **Action required if you had encryption enabled:** decrypt your data with
    the previous version's `sv db decrypt` **before** upgrading — there is no
    decrypt path in this version.
- The manifest's `database` field is removed entirely (`database.isolation`
  was already retired; `database.requireEncryption` goes with this change) —
  a plugin manifest still declaring it fails validation. No first-party
  plugin in this repository declares it.
- `@sovereignfs/manifest` **4.0.0 → 5.0.0**, `@sovereignfs/db` **3.4.1 →
  4.0.0**, `@sovereignfs/auth` **1.1.0 → 2.0.0** (all breaking — see above).

### Root `package.json` 0.50.1 → 0.51.0 (no `runtime` version bump)

- **Console's "Add a plugin" panel is removed.** Console → Plugins no longer
  has the two-step install form (paste a Git repository URL → **Check** a
  fetched `manifest.json` → **Install**). Installing a plugin is now an
  operator action performed outside the web UI.
  - **Action required if you installed plugins through Console:** use the CLI
    instead — `pnpm sv plugin add <repo-url>` (add `--token-env <VAR>` for a
    private repository), or declare the plugin in `sovereign.plugins.json` and
    rebuild. Both paths already existed and are unchanged; see
    `docs/self-hosting.md` and `docs/plugin-development.md`.
  - **Removing** a plugin from Console is unchanged — the per-row Remove
    action and its confirm dialog stay exactly as they were.
  - **No data or plugin is affected by upgrading.** Plugins installed via the
    old panel were cloned into `plugins/<id>/` by the same `sv plugin add` the
    CLI runs, so they remain installed, enabled, and untouched.
  - Only `@sovereignfs/plugin-console` code changed (**→ 0.26.0**); no
    `runtime`, `@sovereignfs/db`, or `@sovereignfs/auth` code is touched, and
    no schema or configuration change is involved.

### Root `package.json` 0.47.0 → 0.48.0 (no `runtime` version bump)

- **Default plugin bundle reduced to Sovereign Tasks only — epic task 3.31
  done.** Previously, `sovereign.plugins.json` was committed at the repo root
  with 16 entries (every first-party plugin plus all 7 example plugins), so a
  fresh checkout, `pnpm dev`, and every CI-published image shipped all of them
  baked in. `sovereign.plugins.json` is now a **local, gitignored** file — a
  fresh checkout has none, and `scripts/install-plugins.ts` falls back to the
  newly-committed `sovereign.plugins.default.json`, which declares only
  **Sovereign Tasks**. The platform plugins (console/launcher/account) are
  unaffected — they ship in this repository regardless.
  - **Action required if you rely on a previously-bundled plugin** (Plainwrite,
    Shopper, Wallet, Tritext, Healthlog, Ledger, Tally, Docs, or any example
    plugin): before your next rebuild, create your own `sovereign.plugins.json`
    at the repo root (copy `sovereign.plugins.default.json` as a starting
    template) declaring every plugin you want, then rebuild. See
    `docs/self-hosting.md`'s "Bundled default plugins" section for the two
    supported ways to carry a custom `sovereign.plugins.json` into a
    production build.
  - **No data is affected either way.** Dropping a plugin from the image never
    touches its database tables — disabling or losing a plugin's code just
    means its data sits untouched until the plugin is re-declared and the
    image rebuilt.
  - **The official, CI-published images** (`SOVEREIGN_VERSION=...`, no local
    Dockerfile) always use the new Tasks-only default from this version
    forward — they build from a clean checkout with no local
    `sovereign.plugins.json` to pick up.
  - This is a build-tooling/CI change with no `runtime`, `@sovereignfs/db`, or
    `@sovereignfs/auth` code touched — only the root `package.json` (roadmap
    milestone) bumps.

### v0.57 → v0.58

- **External OAuth 2.0 / OIDC provider for non-plugin apps (RFC 0072) —
  epic task 1.18 done.** `apps/auth` can now act as an identity provider for
  standalone external apps that are not Sovereign plugins (e.g. a companion
  app on its own domain wanting "log in with Sovereign"), via
  `@better-auth/oauth-provider`. **No action required** for existing
  instances — the feature is inert until an admin registers a client.
  - New Console section **External clients** (Console → External clients,
    gated to `platform:admin`/`platform:owner`) to register, rotate, and
    revoke clients. No dynamic/self-service client registration in v1.
  - New discovery/token endpoints reachable at the auth server's public URL:
    `/.well-known/openid-configuration`, `/oauth2/authorize`,
    `/oauth2/token`, `/oauth2/userinfo`, `/.well-known/jwks.json`. See
    `docs/self-hosting.md`'s "External OAuth/OIDC provider" section.
  - New consent page at `/oauth2/consent` on the auth server.
  - The plugin's own schema (`oauthClient`, `oauthAccessToken`,
    `oauthRefreshToken`, `oauthConsent`) is auto-discovered and created by
    better-auth's existing migrator (`apps/auth/src/migrate.ts`) on next
    startup — no manual migration step.
  - `better-auth` bumped `^1.6.16` → `^1.6.25` (non-breaking, same major) —
    required by `@better-auth/oauth-provider`'s peer range. The bundled
    `oidc-provider` plugin this repo previously considered is deprecated as
    of this better-auth version in favor of the new dedicated package; RFC
    0072 was updated to build on the latter instead.
- **`runtime` → 0.58.0**, **`@sovereignfs/auth` → 0.14.0**,
  **`@sovereignfs/plugin-console` → 0.25.0**.

### v0.56 → v0.57

- **Opt-in single-key SQLite at-rest encryption (RFC 0071) — epic task 8.14
  done.** `SOVEREIGN_DB_ENCRYPTION_KEY` (presence is the toggle, off by
  default) encrypts `sovereign.db`, `auth.db`, and every isolated plugin
  database via SQLCipher (`better-sqlite3-multiple-ciphers`). **No action
  required** for instances that don't set this variable — behavior is
  byte-for-byte unchanged. To adopt it on an existing plaintext instance, stop
  the server and run `sv db encrypt` (see `docs/self-hosting.md`'s "SQLite
  at-rest encryption" section for the full procedure, including the
  named-volume production path via the new `tools` Docker Compose
  service/profile — `docker compose -f docker-compose.prod.yml --profile
tools run --rm tools pnpm sv db encrypt --dataDir /app/data`). Protects a
  stolen disk, leaked volume snapshot, or copied `.db` file — it does not
  protect against a live compromised process or an operator who holds the
  key (see RFC 0060's client-side encryption for that tier).
- **New manifest field `database.requireEncryption`** — raise-only: a plugin
  can force its own isolated SQLite database to be encrypted, but can never
  opt out of encryption the operator has enabled instance-wide. Enforced both
  at manifest-validation time and at runtime plugin startup (fails naming the
  plugin for SQLite, warns for Postgres, which has no SQLCipher equivalent).
- **`runtime` → 0.57.0**, **`@sovereignfs/db` → 1.14.0**,
  **`@sovereignfs/manifest` → 0.23.0** (this release also carries RFC 0062's
  `mailer:sendExternal` permission from the same manifest version).

### v0.55 → v0.56

- **Notification transport default changed from `polling` to `sse` (RFC 0034).**
  Newly-provisioned instances now get instant in-process push delivery for
  free (no extra infra) instead of a 10s polling loop. **Action required for
  multi-container/multi-process deployments only**: `sse` uses an in-process
  `EventEmitter`, which cannot see notifications published on a different
  runtime container — if you scale to more than one runtime replica, set
  `NOTIFICATION_TRANSPORT=redis` (with `REDIS_URL`) explicitly, or it will
  silently degrade to per-user missed real-time updates (nothing is lost —
  the next explicit fetch always catches up — it just stops being instant).
  Single-container deployments (this repo's default `docker-compose.prod.yml`
  topology) are unaffected and need no action.
- **Fixed: the notification broker singleton was never actually visible to API
  routes.** `runtime/src/notification-broker.ts` stored its broker instance in
  a module-level variable, but Next.js compiles `instrumentation.ts` (where
  `initBroker()` runs) into a separate module graph from route handlers (where
  `getBroker()` is read) — even in the standalone server this app ships in
  Docker. In practice this meant `sse` and `redis` transport modes silently
  no-op'd back to polling for every request, regardless of configuration,
  since RFC 0034 shipped. The broker is now stored on `globalThis`, which is
  shared across all of Next.js's separately-bundled chunks within a process.
  **If you already had `NOTIFICATION_TRANSPORT=sse` or `=redis` set**, this
  fix is what actually makes it take effect for the first time — expect the
  bell to switch from polling to push delivery after this upgrade.
- **Fixed: `NotificationBell` fetched, polled, and (once the bug above is
  fixed) opened an `EventSource` twice per page** — the sidebar and mobile
  header both always mount the bell (visibility is CSS-only), and each ran
  its own independent fetch/poll/SSE loop. It now shares one connection
  across both mounted instances via a module-level store. Internal-only, no
  operator action.
- **`runtime` → 0.56.0**.

### v0.54 → v0.55

- **Plugin mailer permission and SDK email surface (RFC 0062) — epic task 3.26
  done.** `sdk.mailer.send()` now resolves the calling plugin's ID from an
  explicitly passed request `Headers` object (pass `await headers()` as the
  second argument, same convention as `sdk.notifications.send()`) and rejects
  the call unless the plugin declares `mailer:send` — a plugin without it
  gets a clear permission error instead of a silent send. A raw `to:` address
  is treated as an external recipient regardless of whether it happens to
  match a platform user's email, and additionally requires the new
  `mailer:sendExternal` permission. Both plugin email surfaces are now
  rate-limited per plugin and per recipient. New additive
  `sdk.email.sendToUser({ recipientUserId, templateId, subject, html?, text?, data? })`
  is the recommended default: the platform resolves the recipient's email
  server-side and only requires `mailer:send`, so there is no
  external-recipient escape hatch to reason about. **Action required for any
  plugin already calling `sdk.mailer.send()`:** declare `mailer:send` (and
  `mailer:sendExternal` if the recipient isn't a platform user resolved by
  ID) in `manifest.json`, and pass `await headers()` as the second argument —
  no plugin in this monorepo currently calls `sdk.mailer.send()`, so this has
  no first-party impact.
- **`runtime` → 0.55.0**, **`@sovereignfs/manifest` → 0.23.0**,
  **`@sovereignfs/sdk` → 1.26.0**.

### v0.53 → v0.54

- **Public plugin page routes (RFC 0042) — epic task 2.14 done.** New optional
  manifest `publicRoutes` field lets a plugin exempt a path prefix (relative
  to its own `routePrefix`) from the platform's session-redirect gate — for
  shared documents, published read-only views, or token-protected previews.
  The plugin itself is responsible for authorizing every request under a
  public route and must fail closed (404) for anything invalid, expired, or
  unknown. Disabled-plugin and paywall gates still apply: a monetized
  plugin's public routes block anonymous access by default (there is no
  `paywallExempt` escape hatch). **No action required** — purely additive;
  plugins that don't declare `publicRoutes` are unaffected.
- **`runtime` → 0.54.0**, **`@sovereignfs/manifest` → 0.22.0**.

### v0.42 → v0.43

- **Cross-plugin references and dependency discovery (RFC 0051) — epic task
  3.20 done.** New `sdk.plugins.get(id)` / `sdk.plugins.list(filter?)` return
  `PluginAvailability` (install/enable status folded with the current user's
  disabled/adminOnly/paywall gates) so a plugin can check an optional sibling
  before offering an integration. `sdk.plugins.getConsentStatus(ref)` checks a
  data-contract consent grant without a full `sdk.data.query()` call. New
  `PluginReference` type defines the standard opaque-link shape (`providerId`,
  `resourceType`, `resourceId`, `contract?`, `version?`, `labelSnapshot?`,
  `metadata?`, `linkedAt`) for a plugin to store a pointer to another plugin's
  record without a cross-plugin foreign key. **No action required** — purely
  additive SDK surface, no schema change.
- **New optional manifest `integrations.optional` field** — informational
  sibling-plugin metadata for install/discovery UX (Console, Account, plugin
  UI hints). Declaring one grants nothing by itself; never an install blocker.
- **Plugin portability export metadata (RFC 0052) complete — epic task 8.8
  done.** `PluginExportSection` gains `references?: PluginReference[]`,
  carried through export and import as **inert metadata only** — the platform
  never dereferences them; importing a reference never grants access to the
  provider plugin. This was the last outstanding RFC 0052 deliverable (the
  rest shipped in the v0.41 → v0.42 entry below).
- **`runtime` → 0.43.0**, **`@sovereignfs/sdk` → 1.25.0**,
  **`@sovereignfs/manifest` → 0.20.0**.

### v0.41 → v0.42

- **Plugin portability export metadata (RFC 0052, partial).** `PluginExportSection`
  gains `pluginVersion` (always overwritten by the runtime from the installed
  manifest — a resolver cannot misreport it), `secretMetadata` (per-plugin
  secret metadata, never plaintext values), and `warnings`. `ExportContext`
  gains `options: { includeFiles }` so a resolver can honor the user's choice
  to skip large attachments. All additive — existing resolvers that don't read
  these fields are unaffected.
- **Account → Data export gains an "include files and attachments" toggle**
  (`?includeFiles=false` on `GET /api/account/export`), and a throwing plugin
  exporter no longer aborts the whole export — it's excluded and recorded in
  the bundle manifest's new `failures` list.
- **Not yet implemented**: cross-plugin reference preservation in exports
  (depends on RFC 0051, still unimplemented) — the remaining piece of RFC 0052.
- **`runtime` → 0.42.0**, **`@sovereignfs/sdk` → 1.24.0**,
  **`plugins/account` → 0.17.0**.

### v0.40 → v0.41

- **Client-side encryption core complete, steps 6 of 7 (RFC 0060) — epic task
  8.9 done.** Account export now includes a user's encryption profile,
  recovery wrapper, and active device enrollments (still wrapped ciphertext
  and non-sensitive KDF/algorithm metadata only — never plaintext). Account
  deletion already removed this data unconditionally; export was the missing
  half. **No action required** — no schema change, existing `e2ee_*` tables
  and DB helper functions were reused as-is.
- **Import is additive-safe, never destructive.** If the importing user
  already has an encryption profile on this instance, imported e2ee data is
  silently skipped rather than overwriting a live setup that might not
  correspond to the same Client Master Key.
- **No `sdk.storage`/`sdk.portability` API change.** Plugin-owned encrypted
  objects (e.g. a future Sovereign Wallet document) already compose through
  each plugin's own export/import handlers calling `sdk.storage` directly —
  documented in `docs/plugin-development.md`, no new platform mechanism
  needed.
- **`docs/security.md` corrected** — it previously described client-side
  encryption as "post-v1 (charted)"; it's implemented and opt-in as of this
  release.
- **`runtime` → 0.41.0**. No SDK/db/manifest version change — this task only
  touched the platform's internal export/import wiring
  (`runtime/src/portability/`), not any published package's contract.

### v0.39 → v0.40

- **Client-side encryption core, steps 1–5 of 7 (RFC 0060).** New `sdk.e2ee`
  persistence surface (profile/recovery-wrapper/device-enrollment plumbing)
  and a new Account → Security section for setup, recovery-secret unlock, and
  device enrollment/revocation. Three new platform tables (`e2ee_profiles`,
  `e2ee_recovery_wrappers`, `e2ee_device_enrollments`) auto-create via the
  existing bootstrap DDL path — **no action required**. All CMK/DEK
  generation, wrap/unwrap, and object encryption happens in the browser
  (WebCrypto); the server only ever stores wrapped ciphertext and
  non-sensitive KDF/algorithm metadata, never plaintext key material.
- **New optional `e2ee:use` manifest permission**, reserved for a future
  plugin consumer (not yet declared by any first-party plugin).
- **`@sovereignfs/sdk` gains `sdk.e2ee.*`** plus browser-only helpers across
  four subpaths: `generateCmk`/`wrapCmkWithRecoverySecret`/etc.
  (`e2ee-crypto`, also `generateDek`/`wrapDekWithCmk`/`unwrapDekWithCmk` for
  per-object keys), `getOrCreateDeviceId`/`storeDeviceKey`/etc.
  (`e2ee-device`), `encryptBlob`/`decryptBlob`/`encryptJson`/`decryptJson`
  (`e2ee-object`), and `getE2eeLocalState` for normalized locked/unlocked
  state detection (`e2ee-state`). Additive, experimental tier — no existing
  SDK surface changed.
- **`sdk.storage` integrated with client-side encryption (step 5).** No
  dedicated storage method was needed — `StorageObject.metadata` (see the
  `@sovereignfs/sdk` 1.22.0 → 1.23.0 migration note below) is where an
  encrypted object's wrapped DEK and algorithm version travel alongside its
  ciphertext.
- **Not yet implemented**: export/delete hook integration — the final step of
  the same RFC 0060 adoption path.
- **`runtime` → 0.40.1**, **`@sovereignfs/sdk` → 1.23.0**,
  **`@sovereignfs/db` → 1.10.2**, **`@sovereignfs/manifest` → 0.19.0**,
  **`plugins/account` → 0.16.1**. `db` 1.10.2 adds a missing unique index on
  `(tenant_id, user_id)` for `e2ee_profiles`/`e2ee_recovery_wrappers`
  (migration `0013`) — the initial `0012` migration created the tables
  without it, so the recovery-wrapper
  upsert's `ON CONFLICT` clause had no matching constraint to target and
  threw on first use.

### v0.37 → v0.38

- **Plugin background schedules — Phase 1 (RFC 0046).** Plugins can now declare
  recurring server-side jobs (manifest `schedules`) that the runtime invokes
  in-process on a 60-second tick, independent of any browser request. **No
  action required** — the scheduler starts automatically at boot and is a
  no-op when no installed plugin declares a schedule.
- **New optional `SOVEREIGN_SCHEDULER_DISABLED` env var.** Set to `1` to stop
  the runtime invoking plugin schedules — a kill-switch for debugging a
  misbehaving plugin job. Unset (default) = scheduler runs. See
  [`docs/self-hosting.md`](self-hosting.md#environment-variables).
- **`@sovereignfs/sdk` gains `ScheduleContext`/`ScheduleHandler` types.**
  Additive, experimental tier — no existing SDK surface changed.
- **No database schema change** at the platform layer. Individual plugins
  that adopt `schedules` may ship their own migrations (e.g.
  `sovereign-tasks` 0.11.0's `tasks_notification_prefs` table).
- **`runtime` → 0.38.0**, **`@sovereignfs/manifest` → 0.18.0**,
  **`@sovereignfs/sdk` → 1.18.0**.

### v0.27 → v0.28

- **White-labeling Phase 1 (RFC 0027).** Operators can now set a brand name,
  primary colour, logo, and favicon via Console → Settings → Branding. A new
  `tenant_branding` table is created by the Drizzle migration automatically on
  startup — **no manual step required**.
- **`sdk.platform.getConfig()` gains `brandName` and `brandPrimaryColor?`.**
  Existing calls are unaffected; the fields are additive.
- **Three new `--sv-brand-*` CSS tokens** (`--sv-brand-logo`,
  `--sv-brand-logo-dark`, `--sv-brand-favicon`) are set at `:root` by
  `BrandProvider` and are available in plugin CSS without any import.
- **Seven new optional `BRAND_*` env vars** control deployment-level brand
  defaults. All are optional; Sovereign defaults apply when unset. See
  [`docs/self-hosting.md`](self-hosting.md#environment-variables).
- **`runtime` → 0.28.0**, **`@sovereignfs/db` → 1.6.0**,
  **`@sovereignfs/sdk` → 1.10.0**, **`@sovereignfs/ui` → 0.10.0**,
  **`plugins/console` → 0.12.0**.

### v0.26 → v0.27

- **Production dev-mode & diagnostics (RFC 0020).** A request-scoped dev-mode
  switch (`SOVEREIGN_DEV_MODE_ENABLED=true`) routes SDK DB calls to a mock
  database for a single request when the correct `X-Sovereign-Dev-Mode-Secret`
  header is present. Real requests are completely unaffected. Off by default.
- **Structured logging.** `LOG_LEVEL` (error/warn/info/debug; default `warn`)
  controls a newline-delimited JSON logger to stdout. No egress.
- **Richer `/api/admin/health`.** Now includes `database.migrationVersion`,
  `plugins.installed`/`adminOnly`, and `diagnostics.{logLevel, devModeEnabled}`.
- **Four new optional env vars:** `LOG_LEVEL`, `SOVEREIGN_DEV_MODE_ENABLED`,
  `SOVEREIGN_DEV_MODE_SECRET`, `SOVEREIGN_DEV_DATABASE_URL`. All documented in
  `.env.example` and `docs/self-hosting.md`.
- **`runtime` → 0.27.0**.

### v0.25 → v0.26

- **Per-plugin isolated databases (RFC 0004).** Plugins can now opt into a dedicated
  database by setting `"database": "isolated"` in their manifest. This is **entirely
  opt-in** — existing `shared` plugins (the default) are completely unaffected and
  require no changes.
- **No action required for operators.** The `data/plugins/` directory is created
  automatically when the first isolated plugin provisions its store. It is included in
  `sv backup` archives automatically. Nothing in the existing platform schema changes.
- **Plugin authors adopting `isolated`:** set `"database": "isolated"` in your
  `manifest.json`, create `plugins/<id>/migrations/sqlite/` and
  `plugins/<id>/migrations/postgres/` directories for your Drizzle migration files, and
  remove the slug prefix from your table names (optional but recommended — you have your
  own namespace). `sdk.db.getClient()` call sites need no changes.
- **`sv plugin remove` now drops the store.** When removing an isolated plugin,
  `sv plugin remove <id>` deletes the store (SQLite file or Postgres schema). Pass
  `--keep-data` to retain the store for manual inspection or migration.
- **`@sovereignfs/db` → 1.5.0** (minor — new `plugin-client.ts` with `getPluginDb`,
  `provisionPluginDb`, `dropPluginDb`, `pluginMigrationsFolder`; `runPluginMigrations`
  added to migrate module).
- **`@sovereignfs/sdk` → 1.9.0** (minor — `sdk.db.getClient()` now routes isolated
  plugins to their dedicated store transparently; `SdkHost.db.getClient` signature change
  is internal only).
- **`runtime` → 0.26.0** (minor — SDK host routes isolated plugins; startup runs
  per-plugin migrations).

See [`docs/plugin-database.md`](plugin-database.md) for the full reference.

### v0.24 → v0.25

- **Plugin monetization (RFC 0003).** Plugin authors can now declare a `monetization`
  field in `manifest.json` to gate access with signed Ed25519 license tokens. A new
  `entitlements` table is created by the Drizzle migration automatically on startup —
  **no manual schema change required**.
- **No action required for most operators.** Plugins without a `monetization` field
  (or with `model: "free"`) are completely unaffected. Monetization is opt-in by plugin
  authors.
- **Users with a paid plugin:** if a user lacks an entitlement for a plugin, they are
  redirected to the plugin's paywall page (`/paywall/<pluginId>`) where they can paste
  a signed license token obtained from the plugin author. Once imported, access is
  granted immediately without restart. Users can manage their licenses in
  Account → Billing.
- **Admins:** Console → Entitlements shows all entitlements across all users. Admin
  key-authenticated `GET /api/admin/entitlements` returns the full list or (with
  `?userId=`) the set of paywalled plugin IDs for a specific user (used by the
  middleware).
- **No Stripe / payment gateway required in v1.** The platform implements only the
  offline Ed25519 license-token model (manual flow). Webhook integration with Stripe
  or other gateways is a post-v1 concern; plugin authors who want automated
  billing today can build their own webhook handler.
- **`@sovereignfs/db` → 1.3.0** (minor — `entitlements` table + 7 helper functions).
- **`@sovereignfs/sdk` → 1.8.0** (minor — `sdk.billing` stub: `getEntitlement()` and
  `requireEntitlement()` exported; `EntitlementRequiredError` exported).
- **`@sovereignfs/manifest` → 0.14.0** (minor — `monetization` manifest field).

### v0.23 → v0.24

- **Web Push notifications (RFC 0016).** Background push delivery for the in-app inbox.
  A new `push_subscriptions` table is created by the Drizzle migration automatically on
  startup — **no manual schema change required**.
- **No action required for most operators.** Push is opt-in and silently disabled when
  VAPID keys are absent. The in-app bell continues to work without any configuration.
- **To enable push:** generate a VAPID key pair once per deployment and add to `.env`:
  ```bash
  npx web-push generate-vapid-keys
  # then add to .env:
  # VAPID_PUBLIC_KEY=<base64url public key>
  # VAPID_PRIVATE_KEY=<base64url private key>
  # VAPID_CONTACT=mailto:admin@example.com
  ```
  Users then opt in per-device via Account → Notifications → "Enable push notifications".
  Push respects per-user muted-category preferences (set in Account → Notifications).
- **Stale subscriptions are pruned automatically.** When a push service returns `410 Gone`
  (device unregistered or browser cleared), the subscription is deleted from the DB.
- **`@sovereignfs/db` → 1.2.0** (minor — `push_subscriptions` table + 6 helper functions).

### v0.22 → v0.23

- **Notification Center (RFC 0015).** In-app per-user notifications with a bell icon in the
  chrome, polling-based delivery (default 30s), and SSE streaming. Two new platform tables
  (`notifications`, `notification_prefs`) are added by the Drizzle migration automatically
  on startup.
- **No action required for operators.** The migration runs automatically. Existing plugins
  continue to work without changes.
- **Plugin authors:** to send notifications, add `"notifications:send"` to your manifest
  `permissions` and call `sdk.notifications.send(input, await headers())`. See
  `docs/plugin-development.md` for the full API.
- **Admin broadcast:** `POST /api/admin/broadcast` (admin key required) sends announcements
  to one or more users; rate-limited to once per 60 seconds.
- **`@sovereignfs/db` → 1.1.0** (minor — new tables and helper functions).
- **`@sovereignfs/sdk` → 1.7.0** (minor — `sdk.notifications` promoted from
  `NotImplementedError` stub to a working implementation; `SendNotificationInput` type
  exported).
- **`@sovereignfs/ui` → 0.9.0** (minor — `Toast`/`ToastProvider`/`useToast` exported).

### v0.21 → v0.22

- **Plugin-declared capabilities (RFC 0022).** Plugins may now declare a
  `capabilities` field in `manifest.json` to express fine-grained, namespaced
  permissions (e.g. `my-plugin:create-item`). This is an additive manifest
  change — existing manifests without a `capabilities` field are unaffected.
- **No action required for operators.** The platform automatically injects
  capabilities declared with `defaultGrant: "all"` into every authenticated
  session. Plugin authors who want to adopt the feature should see the new
  `### capabilities (RFC 0022)` section in `docs/plugin-development.md`.
- **`@sovereignfs/manifest` → 0.13.0** (minor, no breaking changes). The
  internal manifest schema adds the optional `capabilities` field and exports a
  new `pluginCapabilityName(pluginId, capName)` helper.

### v0.20 → v0.21

- **Platform roles expanded to four (RFC 0021).** The `platform:admin` role is
  preserved; two new roles are added: `platform:owner` (full privileges, including
  `role:assign`) and `platform:auditor` (read-only Console access).
- **Automatic migration:** on first startup after upgrading, the auth server
  promotes the oldest `platform:admin` user to `platform:owner` if no owner
  exists yet. No manual action required.
- **Existing `platform:admin` users retain all their current capabilities.**
  The admin preset loses only `role:assign` (the ability to assign roles), which
  is now owner-exclusive. If you need role assignment to remain with an existing
  admin, promote them to owner via Console → Users.
- **`platform:owner` is protected:** the owner's role and account active state
  cannot be changed via the admin API. Use Console → Users (as the owner) or
  the `sv user reset-mfa` CLI for break-glass operations.
- **SDK `@sovereignfs/sdk` 1.6.0:** `SessionUser` gains `capabilities`, and
  `sdk.auth.hasCapability(session, cap)` is added. Plugin authors can use this
  instead of checking `user.role` directly. Both are backward-compatible
  additive additions.

### v0.18 → v0.19

- **Mobile responsiveness & PWA hardening (RFC 0013).** The shell's mobile footer
  is replaced by a single "Apps" Drawer button; the header gains an
  `ActivePluginTitle`; Console moves into the avatar menu on mobile. Dialog
  top-inset (`--sv-dialog-inset-top`) keeps the header visible above overlay
  sheets. Unified breakpoint at 768 px; `100dvh` throughout; safe-area insets;
  44 px touch targets; `viewport-fit=cover` + immersive iOS status bar.
- **New `Drawer` UI primitive** added to `@sovereignfs/ui` (bottom-sheet, focus
  trap, safe-area-aware).
- **PWA manifest polish:** `display_override`, `orientation: "any"`,
  `categories: ["productivity"]`, `shortcuts` (Launcher + Account).
- **No operator action required.** All changes are in the shell UI.
- **`runtime` → 0.19.0**, **`@sovereignfs/ui` → 0.6.0**.

### v0.17 → v0.18

- **Minimal shell mode (RFC 0014).** A `shell: "minimal"` manifest value now
  composes plugins into a chrome-free route group (`(minimal)/`). Previously
  `shell: "minimal"` failed the build. Minimal plugins can be used as the root
  plugin for kiosk use cases.
- **No operator action required.** Existing plugins are unaffected. The new route
  group is entirely generated and gitignored.
- **`runtime` → 0.18.0**.

### v0.16 → v0.17

- **Plugin-scoped environment variables (RFC 0018).** Plugins may now declare an
  `env` map in `manifest.json`; keys are auto-namespaced to
  `SV_PLUGIN_<SLUG>_<KEY>` (runtime) or `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>`
  (build). `sdk.env.get('KEY')` reads only the calling plugin's own vars.
- **No operator action required.** The feature is opt-in by plugin authors.
  Plugin-declared secrets must be supplied at runtime via the namespaced env var.
- **`runtime` → 0.17.0**, **`@sovereignfs/sdk` → 1.5.0**,
  **`@sovereignfs/manifest` → 0.12.0**.

### v0.15 → v0.16

- **User data portability (RFC 0007).** Users can export all their data as a
  versioned ZIP (Account → Data → Export) and import it on another instance.
  Plugin participation is opt-in via `sdk.portability.provideExport` /
  `provideImport` and the `data:export` / `data:import` manifest permissions.
- **No operator action required.** Export/import routes are session-gated. The
  50 MB import cap is enforced by the server.
- **`runtime` → 0.16.0**, **`@sovereignfs/sdk` → 1.4.0**,
  **`@sovereignfs/manifest` → 0.11.0**, **`plugins/account` → 0.5.0**.

### v0.19 → v0.20

- **TOTP and passkey MFA available.** No configuration is required for existing
  deployments — MFA is opt-in per user. The `twoFactor` and `passkey` tables
  are created automatically by better-auth on first startup.
- **Three new optional env vars** (all have safe defaults for `localhost`):
  - `AUTH_WEBAUTHN_RP_ID` — defaults to the hostname of `AUTH_BASE_URL`.
  - `AUTH_WEBAUTHN_RP_NAME` — defaults to `Sovereign`.
  - `AUTH_WEBAUTHN_ORIGIN` — defaults to `SOVEREIGN_AUTH_PUBLIC_URL` or `AUTH_BASE_URL`.

  **Production deployments must set these** — the defaults will not work when
  your instance runs on a real domain. See
  [self-hosting.md — Two-factor authentication](self-hosting.md#two-factor-authentication-mfa)
  for the correct values and the `rpID` constraint.

- **`sv user reset-mfa <email>`** — new CLI break-glass command. Clears TOTP
  secrets and passkeys for a user directly in the SQLite auth database (no
  running server required). For Postgres instances, use Console → Users →
  Reset MFA instead.
- No database migration required — better-auth creates the `twoFactor` and
  `passkey` tables at startup via its own DDL.

### v0.13 → v0.14

- **Activity log (RFC 0005).** The `activity_log` table records platform and plugin
  actions. `sdk.activity.log()` is now implemented (no longer a stub). Personal
  activity appears in Account → Activity; platform-wide history is in Console →
  Activity. The migration runs automatically on startup.
- **Icon system (RFC 0011).** `@sovereignfs/ui` exports an `<Icon>` component
  backed by curated Lucide SVG icons. Plugin manifest `icon.svg` files are served
  from `/plugin-icons/<id>.svg`. Chrome monograms and emoji replaced with icons.
- **No operator action required.** All changes are additive.
- **`runtime` → 0.14.0** (`0.14.1` for icon system), **`@sovereignfs/db` → 0.9.0**,
  **`@sovereignfs/sdk` → 1.3.0**, **`@sovereignfs/ui` → 0.5.0**,
  **`plugins/account` → 0.4.0**, **`plugins/console` → 0.5.0**.

### v0.12 → v0.13

- **Cross-plugin data sharing (RFC 0002).** Provider plugins can call
  `sdk.data.provide(contract, resolver)`; consumer plugins call
  `sdk.data.query(ref, params)`. Consent is managed by users in Account → Data.
  Two new tables (`consent_grants`, `data_access_log`) are created by migration
  on startup.
- **Manifest:** optional `data.provides[]` / `data.consumes[]` fields;
  `data:provide` and `data:consume` permissions promoted from reserved to active.
- **No operator action required.** The feature is entirely opt-in by plugin authors.
- **`runtime` → 0.13.0**, **`@sovereignfs/db` → 0.8.0**,
  **`@sovereignfs/sdk` → 1.2.0**, **`@sovereignfs/manifest` → 0.10.0**,
  **`plugins/account` → 0.3.0**.

### v0.11 → v0.12

- **Plugin compatibility & versioning (RFC 0024).** The dormant `schemaVersion`
  and `compatibility.minPlatformVersion` fields in `manifest.json` are now
  enforced. An incompatible plugin is rejected at `sv plugin add`, at build, and
  is disabled at boot (not bricked). An advisory `maxPlatformVersion` generates a
  warning. Console shows an "Incompatible" badge; `/api/admin/health` lists
  incompatible plugins.
- **No operator action required.** Existing plugins without a `compatibility` field
  are unaffected. Platform plugins ship with appropriate `minPlatformVersion`.
- **`runtime` → 0.12.0**, **`@sovereignfs/manifest` → 0.9.0**.

### v0.10 → v0.11

- **SDK distribution & plugin isolation boundary (RFC 0023).** `@sovereignfs/sdk`
  now has zero runtime dependencies. Implementations are host-provided by the
  runtime at startup via `provideHost()` (`runtime/instrumentation.ts`). Outside
  the runtime, SDK calls throw "no runtime host is registered". Plugin authors can
  type-check against the published SDK without installing `@sovereignfs/db` or
  `@sovereignfs/mailer`.
- **Plugin authors:** no call-site changes needed. If you were relying on the
  SDK importing from `@sovereignfs/db` directly in a non-runtime context (e.g.
  tests), that no longer works — use mocked host registrations instead.
- **`runtime` → 0.11.0**, **`@sovereignfs/sdk` → 1.1.0**.

### v0.14 → v0.15

- **Drizzle-kit migrations replace the interim DDL bootstrap.** Platform schema
  migrations now live in `packages/db/migrations/` and are applied automatically
  at startup via `runMigrations()`. The migrations use `CREATE TABLE IF NOT EXISTS`
  throughout, so existing instances bootstrapped by earlier versions upgrade safely
  without any manual SQL.
- **`sv backup` / `sv restore`** are now available in the `bin/sv` CLI. Run
  `pnpm sv backup` before upgrading; the archive captures all SQLite databases
  and uploaded avatars.
- **Downgrade detection.** The runtime now records the running platform version
  in `platform_settings` on every startup. Starting an older binary against a
  database written by a newer binary is flagged in `GET /api/admin/health` as
  a `downgradeWarning`. Always restore a backup before downgrading.
- **Published Docker images.** Semver-tagged images are published to GHCR on
  every `v*.*.*` tag. Set `SOVEREIGN_VERSION=vX.Y.Z` in your environment to pull
  them without a local build step.
- **`AUTH_TRUSTED_ORIGINS`** (new, optional). Comma-separated list of additional
  origins that better-auth accepts for server-to-server CSRF checks. Set to
  `http://auth:3001` when `AUTH_BASE_URL` is a public domain (the Docker default
  in `docker-compose.prod.yml`).
- **`SOVEREIGN_AUTH_PUBLIC_URL`** (new, optional). Browser-facing auth URL for
  login redirects. Defaults to `SOVEREIGN_AUTH_URL`. Required if your auth
  server is not reachable from the browser on the same address used for
  internal server-to-server calls.
- **Production auth port changed from unexposed to 4001.** `docker-compose.prod.yml`
  now maps auth to `${AUTH_PORT:-4001}:3001`. Update reverse-proxy configs
  if you previously routed directly to the internal service.

### v0.4 → v0.5

- **`SOVEREIGN_ADMIN_KEY` is required** (auth + runtime). Set it in `.env` — both
  services refuse to start without it. Generate with `openssl rand -base64 32`.
- **The runtime now reads `AUTH_SECRET`** to verify sessions locally (AUTH-05).
  It must equal the auth server's `AUTH_SECRET`; since both apps load the one
  root `.env`, no action is needed unless you set a distinct `SOVEREIGN_AUTH_SECRET`.
  The provided Compose files pass `AUTH_SECRET` to the runtime service.
- **PostgreSQL is supported** as an alternative to the default SQLite — opt in
  with `DB_DIALECT=postgres` + `DATABASE_URL`/`AUTH_DATABASE_URL`, or the
  `docker-compose.postgres.yml` overlay. See [self-hosting.md](self-hosting.md#postgresql).
- No data migration is required for existing SQLite instances.

### v0.3 → v0.4

- First-class **Console** (user + plugin management), **Launcher**, and
  **Account** plugins land. No configuration changes; existing data is carried
  forward. The first registered user is the platform admin.

---

## Published package migrations

### `@sovereignfs/manifest` 0.26.0 → 1.0.0 (breaking — RFC 0078)

**The `offline` manifest field is now a plain boolean, replacing the
`offline.routes[]`/`offline.root` object shape (RFC 0074).** RFC 0078
generalizes Launcher's original `offline.root: true` pattern — one
bare-`routePrefix` entry page, entirely client-rendered past that — into the
only offline model, removing the per-route `routes[]` array. `@sovereignfs/manifest`
isn't published to npm, but this is still a breaking change to the
`manifest.json` contract every plugin author writes against.

**Before:**

```json
{ "offline": { "routes": [{ "prefix": "/cards", "description": "…" }] } }
```

or

```json
{ "offline": { "root": true } }
```

**After:**

```json
{ "offline": true }
```

There is no field-for-field migration for a `routes[]` entry — the old model
let a plugin cache several distinct sub-paths independently; the new model
gives every offline-enabled plugin exactly one entry point (its bare
`routePrefix`), and the plugin's own client-side code decides which screens
or data to render past that. Restructure your offline experience as one
client-rendered shell at your bare `routePrefix`, following
`plugins/launcher/app/_components/LauncherOfflineView.tsx` as the reference
pattern.

A manifest still using the old object shape now fails validation — this is
intentional; there is no deprecation period. A new `offline:write` permission
is also added (`permissions: ["offline:write"]`, requires `offline: true`) —
reserved for a forthcoming offline write/sync capability
(`@sovereignfs/sdk/offline-queue`), not yet implemented as of this version.

### `@sovereignfs/manifest` 2.1.0 → 3.0.0 (breaking — retire `database.isolation`/`"shared"`)

**Every `sovereign`/`community` plugin's database is now unconditionally
isolated — its own dedicated SQLite file/namespace or Postgres schema. The
`shared` manifest option (and the `isolation` field generally) is gone.**
Checking every real, installed plugin — in this monorepo or its known
external repos — found `shared` used only by the three first-party
`type: "platform"` plugins (`account`, `console`, `launcher`), none of which
were genuine `shared`-mode data owners in the first place (see epic task
[8.28](epics/data-sovereignty.md#-828--retire-the-databaseisolationshared-manifest-option)
for the full reasoning); every real third-party plugin was already
`isolated`.

**Before:**

```json
{ "database": "shared" }
```

or

```json
{ "database": { "isolation": "isolated", "requireEncryption": true } }
```

**After:**

```json
{}
```

or

```json
{ "database": { "requireEncryption": true } }
```

A manifest still declaring `"database": "shared"`, `"database": "isolated"`,
or `database.isolation` now fails validation — this is intentional, no
deprecation period, the same shape as the `database.dialect` field removal
(task 8.22). Drop the field or the `isolation` key entirely; every
non-platform plugin gets a dedicated store regardless. If your plugin was
genuinely relying on `shared` mode's cross-plugin SQL joins against platform
tables, that access pattern is not supported for third-party plugins going
forward — use the consent-gated `sdk.data` mechanism instead (RFC 0002).

`type: "platform"` is reserved for first-party plugins in this monorepo —
if you maintain a real third-party plugin, this change requires no
manifest edit beyond removing an `isolation`/`"shared"` declaration if you
had one; the resulting behavior (a dedicated store) is very likely already
what your plugin was using.

### `@sovereignfs/manifest` 3.0.0 → 4.0.0 (breaking — research 0012)

**The `offline` manifest field is now a two-value enum, replacing the plain
boolean from RFC 0078 above.** This is the field's third shape:
`offline.routes[]`/`offline.root` object (RFC 0074) → `offline: boolean` (RFC 0078) → `offline: 'offline-first' | 'device-only'` (research 0012, epic task
3.36). Sovereign's offline model has moved from online-first-with-an-allowlist
to genuinely offline-first, and a single boolean can no longer say which of
two materially different capability tiers a plugin needs — see
`docs/research/0012-offline-first-architecture.md` for the full design.

**Before:**

```json
{ "offline": true }
```

**After — pick the tier that matches what your plugin needs:**

```json
{ "offline": "offline-first" }
```

or

```json
{ "offline": "device-only" }
```

- **`offline-first`** — the device holds a full replica of your plugin's data,
  kept fresh in the background; the server stays the source of truth. This is
  what `offline: true` meant before — if your plugin previously declared
  `offline: true`, `offline-first` is very likely the correct replacement, with
  no other change needed. Launcher migrated this way.
- **`device-only`** — your plugin's data never leaves the device; there is no
  server copy. Requires a durable, encrypted, device-auth-gated store, which
  today only a native shell provides — check
  `@sovereignfs/sdk/device-client`'s `isDeviceOnlyTierAvailable()` before
  relying on it; it reports `false` everywhere until the underlying bridge
  capability ships.

There is no explicit "off" value in the enum — omitting the field entirely
still means no offline support, exactly as an absent field did before.

**The `offline:write` permission is removed outright**, not replaced. Both
tiers now imply local mutation, so the tier value itself is sufficient
install-review signal; a manifest still declaring `offline:write` fails
validation as an unknown permission, with no deprecation period. If your
plugin used `sdk.offline-queue`, that module is unaffected by this manifest
change — its own replacement is tracked separately (epic task 3.37).

A manifest still declaring the plain boolean shape (`offline: true`/`false`)
now fails validation, same as the old object shape already did.

### `@sovereignfs/sdk` 1.41.0 → 1.42.0

**`sdk.offline`'s cache is now encrypted at rest** (RFC 0093 task 8.20's
`offline-first`-tier half) — every value is AES-GCM-encrypted under an
automatically-generated, non-extractable device key before it reaches
IndexedDB, no enrollment step or opt-in required. `offline.get`/`offline.set`
keep the exact same signatures; nothing to change in a plugin that only
stores JSON-like data through them (the documented, designed-for use case).

**Narrows accepted values to JSON-serializable data.** Encryption requires
byte-serializing the value first, so `IndexedDB`'s native structured-clone
support for extras like `Blob`/`Map`/`Set` no longer round-trips through
`offline.set` — passing one now throws instead of silently storing it. No
shipped plugin in this repo relies on that; `offline.set`'s own soft
per-entry size cap already estimated size via `JSON.stringify` and treated
non-JSON-serializable values as an edge case, not the primary path.

**A value cached before this version won't be readable afterward.**
`offline.get` returns `null` for it (a cache miss, not a thrown error) rather
than failing, since this cache is disposable by design — the server is
always the source of truth, and the normal "never cached" fetch-fresh path
already handles it.

### `@sovereignfs/sdk` 1.42.0 → 1.43.0

**`isDeviceOnlyTierAvailable()` now also reports `true` on plain web/PWA**
when WebAuthn PRF + OPFS are supported (RFC 0093 §1's web backend), not only
when a native shell advertises the `secureStorage` bridge capability. This
was a real gap, not an intentional native-only scope: the web backend
(`@sovereignfs/sdk/device-only-kv`) shipped without this function being
updated to know about it, so `DeviceOnlyGate` (the documented gating
pattern) showed "Phone only" on every plain browser tab even after the web
storage stack was fully working. No action needed if your plugin already
follows the documented `DeviceOnlyGate`/`DeviceStorageKeyGate` pattern — it
now correctly lets users onto a `device-only` plugin from a capable browser
tab instead of only from a native shell.

### `@sovereignfs/sdk` 1.22.0 → 1.23.0

**`StorageObject` gains a `metadata` field** (RFC 0044/0060). `sdk.storage.put()`
already accepted a `metadata` input, but it was silently dropped and never
returned by `get()`/`list()`/`put()`'s response — a bug, not an intentional
omission. It now round-trips unchanged, which is what makes `sdk.storage`
usable for encrypted objects (RFC 0060 step 5): the wrapped per-object DEK and
algorithm version travel alongside the ciphertext in this field instead of
needing a separate table.

If your own test code or a mock host implementation constructs a `StorageObject`
value directly (rather than only reading one returned by `sdk.storage`), add a
`metadata: null` (or the actual value) — TypeScript now requires it. Real
plugin code that only calls `sdk.storage.get()`/`list()`/`put()` and reads the
result needs no changes; the new field is simply present.

### `@sovereignfs/sdk` 1.1.0 → 1.2.0

**`sdk.data.provide` / `sdk.data.query` are implemented** (RFC 0002).
Plugins may now declare `data.provides[]` and `data.consumes[]` in their
manifest. No action required for existing plugins that don't use cross-plugin
data sharing.

### `@sovereignfs/sdk` 1.0.0 → 1.1.0

**Host-provided implementations (RFC 0023).** `packages/sdk` no longer imports
`@sovereignfs/db` or `@sovereignfs/mailer`. Implementations are registered by
the runtime at startup via `provideHost()`. Plugins never call `provideHost()`.

If you were importing `@sovereignfs/sdk` in a non-runtime context and relying on
the direct DB/mailer imports for testing — those no longer exist. Use mocked host
registrations or test via the runtime instead.

### `@sovereignfs/sdk` 0.6.0 → 0.7.0

### `sdk.db.getClient()` is now implemented and async

`sdk.db.getClient()` previously threw `NotImplementedError`. It now returns the
platform's Drizzle client wrapped in a `Promise`:

```ts
// Before:
const db = sdk.db.getClient(); // threw NotImplementedError

// After:
const db = await sdk.db.getClient();
```

### `@sovereignfs/sdk` 0.5.0 → 0.6.0

### `sdk.platform.getConfig()` is now async

```ts
// Before:
const config = sdk.platform.getConfig();

// After:
const config = await sdk.platform.getConfig();
```

The returned `PlatformConfig` shape is unchanged.

### `@sovereignfs/sdk` 1.9.0 → 1.10.0 (White-labeling Phase 1, RFC 0027)

**`sdk.platform.getConfig()` gains branding fields.** `PlatformConfig` now
includes two new optional fields:

```ts
interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  brandName: string; // ← new; falls back to tenantName
  brandPrimaryColor?: string; // ← new; validated hex or undefined
}
```

Existing calls are unaffected — the new fields are additive.

**New `--sv-brand-*` CSS tokens** (`--sv-brand-logo`, `--sv-brand-logo-dark`,
`--sv-brand-favicon`) are set at `:root` by `BrandProvider` and are available
in plugin CSS without any import.

---

### Platform 0.28 → 0.29 (`@sovereignfs/ui` 0.10.0 → 0.11.0, `@sovereignfs/sdk` 1.10.0 → 1.11.0, Instance identity rename, RFC 0032)

**Breaking: `--sv-brand-*` CSS tokens renamed to `--sv-instance-*`.** Update any plugin CSS that references these tokens:

```css
/* Before */
background-image: var(--sv-brand-logo);

/* After */
background-image: var(--sv-instance-logo);
```

**Breaking: `PlatformConfig.brandName` and `brandPrimaryColor` renamed.** Update calls to `sdk.platform.getConfig()`:

```ts
// Before
const { brandName, brandPrimaryColor } = await sdk.platform.getConfig();

// After
const { instanceName, instancePrimaryColor } = await sdk.platform.getConfig();
```

**Breaking: `BRAND_*` environment variables renamed to `INSTANCE_*`.** Update your `.env` or Compose env block:

```
BRAND_NAME            → INSTANCE_NAME
BRAND_LOGO            → INSTANCE_LOGO
BRAND_LOGO_DARK       → INSTANCE_LOGO_DARK
BRAND_FAVICON         → INSTANCE_FAVICON
BRAND_PRIMARY_COLOR   → INSTANCE_PRIMARY_COLOR
BRAND_EMAIL_FROM_NAME → INSTANCE_EMAIL_FROM_NAME
BRAND_EMAIL_LOGO      → INSTANCE_EMAIL_LOGO
```

**`/api/brand/*` routes renamed to `/api/instance/*`.** If any external system fetches these routes directly, update those references.

The database migration (`0005_rename_tenant_branding`) runs automatically at startup — no manual SQL required.

---

### Platform 0.9.0 → 0.9.1 (`@sovereignfs/sdk` 1.11.0 → 1.12.0, User data deletion, RFC 0033)

**New: `sdk.portability.provideDelete(handler)` — account deletion hook.**
Plugin authors should register a deletion handler to clean up per-user rows when
a user account is deleted. Plugins without a handler will have their rows left in
place (operator responsibility).

```ts
// In a plugin route or Server Component:
import { sdk } from '@sovereignfs/sdk';

await sdk.portability.provideDelete(async ({ userId, db }) => {
  // delete all rows belonging to this user from your plugin's tables
  const deleted = await myCleanupFn(db, userId);
  return { deleted };
});
```

**New: `DELETE /api/account`** — users can now delete their own account from
Account → Data. Requires password re-verification. Returns 409 if the user is
the sole `platform:owner`. On success, clears session cookies.

**New: `DELETE /api/admin/users/[id]?deleteData=true`** — admins can delete a
user and all their data from Console → Users. Requires `user:manage` capability.
Cannot target a `platform:owner`.

No database migrations required — deletion removes existing rows.

### `@sovereignfs/ui` 0.22.0 → 0.23.0

**Breaking: `FormField` children is now a render prop.** The previous API
computed `aria-describedby` but applied it to a wrapper `<div>` around the
child, not the actual control, so screen readers didn't reliably announce
hints/errors. `FormField` now passes the id/aria wiring to the control itself
via a render-prop `children`, and generates its own `id` when one isn't
provided:

```tsx
// Before
<FormField label="Email" htmlFor="email">
  <Input id="email" type="email" />
</FormField>

// After
<FormField label="Email" id="email">
  {(field) => <Input {...field} type="email" />}
</FormField>

// id is optional — FormField generates one via useId() if omitted:
<FormField label="Email">{(field) => <Input {...field} type="email" />}</FormField>
```

`field` is `{ id, 'aria-describedby'?, 'aria-invalid'?, required? }` — spread
it directly onto any `@sovereignfs/ui` form control or a native element.

**New: `Textarea` component** — additive, no migration required.

---

## Runtime version map

Maps the `runtime` package version at which each major capability was added.
The section headings above correspond to these runtime version transitions.
`SOVEREIGN_VERSION` in Compose files should match the runtime version for
the release you are running.

| Runtime version | Key capability delivered                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.2.0           | Platform DB (tenant_settings, root plugin config), Console settings                                                                                                                        |
| 0.3.0           | Launcher plugin, root-plugin-in-place rewrite                                                                                                                                              |
| 0.4.0           | Account plugin (profile + preferences)                                                                                                                                                     |
| 0.5.0           | Plugin install script, PWA configuration                                                                                                                                                   |
| 0.6.0           | Local session verification (cookie-cache, AUTH-05)                                                                                                                                         |
| 0.7.0           | Public `/api` namespace delegation (PLT-16)                                                                                                                                                |
| 0.8.0–0.9.1     | Overlay shell mode (RFC 0001), Dialog UI primitive                                                                                                                                         |
| 0.9.0           | Logout / self sign-out (AUTH-02)                                                                                                                                                           |
| 0.10.0          | Security hardening Tier 0 + Tier 1 (RFC 0008)                                                                                                                                              |
| 0.11.0          | SDK distribution (RFC 0023), zero-dep published SDK                                                                                                                                        |
| 0.12.0          | Plugin compatibility & versioning (RFC 0024)                                                                                                                                               |
| 0.13.0          | Cross-plugin data sharing (RFC 0002)                                                                                                                                                       |
| 0.14.0–0.14.1   | Activity log (RFC 0005), icon system (RFC 0011)                                                                                                                                            |
| 0.15.0          | Drizzle-kit migrations, `sv backup`/`restore`, downgrade guard (RFC 0006)                                                                                                                  |
| 0.16.0          | User data portability (RFC 0007)                                                                                                                                                           |
| 0.17.0          | Plugin-scoped env vars (RFC 0018)                                                                                                                                                          |
| 0.18.0          | Minimal shell mode (RFC 0014)                                                                                                                                                              |
| 0.19.0          | Mobile responsiveness & PWA hardening (RFC 0013)                                                                                                                                           |
| 0.20.0          | Passkeys & TOTP MFA (RFC 0012), offline connectivity banner                                                                                                                                |
| 0.21.0          | Platform roles & capabilities (RFC 0021)                                                                                                                                                   |
| 0.22.0          | Notification Center (RFC 0015)                                                                                                                                                             |
| 0.23.0          | Web Push notifications (RFC 0016)                                                                                                                                                          |
| 0.25.0–0.25.1   | Plugin monetization (RFC 0003), license generator, entitlements                                                                                                                            |
| 0.26.0          | Per-plugin isolated database (RFC 0004)                                                                                                                                                    |
| 0.27.0          | Production dev-mode & diagnostics (RFC 0020)                                                                                                                                               |
| 0.28.0          | White-labeling Phase 1 (RFC 0027)                                                                                                                                                          |
| 0.29.0          | Instance identity rename (RFC 0032)                                                                                                                                                        |
| 0.30.0          | User data deletion (RFC 0033)                                                                                                                                                              |
| 0.31.0          | Notification transport (RFC 0034)                                                                                                                                                          |
| 0.32.0          | Sidebar customization (epic task 2.13)                                                                                                                                                     |
| 0.33.0          | Instance identity — `instanceId` field + terminology cleanup (RFC 0039)                                                                                                                    |
| 0.34.0          | Platform/runtime version reconciliation chore (RFC 0057 plan status fix)                                                                                                                   |
| 0.35.0          | iOS PWA launch screens (`apple-touch-startup-image`)                                                                                                                                       |
| 0.36.0          | Admin disable surface for example plugins (epic task 12.3)                                                                                                                                 |
| 0.37.0          | Account and security email delivery coverage (RFC 0062, epic task 1.14)                                                                                                                    |
| 0.38.0          | Plugin background schedules — Phase 1 (RFC 0046)                                                                                                                                           |
| 0.39.0          | Plugin file storage — `sdk.storage` (RFC 0044)                                                                                                                                             |
| 0.40.0–0.40.1   | Client-side encryption core, steps 1–5 — `sdk.e2ee`, Account UX, object crypto, `sdk.storage` integration (RFC 0060)                                                                       |
| 0.41.0          | Client-side encryption core complete, step 6 — export/delete via `sdk.portability` (RFC 0060, epic task 8.9 done)                                                                          |
| 0.42.0          | Plugin portability export metadata, partial (RFC 0052)                                                                                                                                     |
| 0.43.0          | Cross-plugin references and dependency discovery (RFC 0051); RFC 0052 complete                                                                                                             |
| 0.44.0          | Launcher grid respects saved sidebar order (epic task 2.22)                                                                                                                                |
| 0.45.0          | User groups foundation + per-user capability grants (RFC 0065/0070, epic tasks 1.15–1.16)                                                                                                  |
| 0.46.0          | Plugin access policy enforcement (RFC 0065, epic task 2.21)                                                                                                                                |
| 0.47.0          | Plugin catalog and install-time activation model (RFC 0065, epic task 3.28)                                                                                                                |
| 0.48.0          | Console plugin access management (RFC 0065, epic task 13.7)                                                                                                                                |
| 0.49.0          | Console plugin catalog browser and install-time activation (RFC 0065, epic task 13.8)                                                                                                      |
| 0.50.0          | Plugin invite-scope grant resolution (RFC 0065, epic task 2.23)                                                                                                                            |
| 0.51.0          | Plugin directory browsing and self-service enable/disable (RFC 0065, epic task 15.3)                                                                                                       |
| 0.54.0          | Public plugin page routes — `publicRoutes` manifest field (RFC 0042, epic task 2.14)                                                                                                       |
| 0.55.0          | Plugin mailer permission and SDK email surface — `sdk.email.sendToUser()` (RFC 0062, epic task 3.26)                                                                                       |
| 0.57.0          | Opt-in single-key SQLite at-rest encryption (RFC 0071, epic task 8.14)                                                                                                                     |
| 0.58.0          | External OAuth 2.0 / OIDC provider for non-plugin apps (RFC 0072, epic task 1.18)                                                                                                          |
| 0.59.0          | Offline-route wiring for manifest `offline.root` flag + neutral-shell handling of `/`                                                                                                      |
| 0.60.0          | Web push delivery status logging to Console/Account Activities (RFC 0016)                                                                                                                  |
| 0.61.0          | Per-plugin mobile header/footer toggle (RFC 0075)                                                                                                                                          |
| 0.62.0          | CI dependency-vulnerability scanning; mobile Console access moved from the account menu to the Apps drawer                                                                                 |
| 0.63.0          | Device bridge protocol package — workstream 0003 leg 1 (RFC 0083, epic task 3.34); general per-IP rate limiting                                                                            |
| 0.64.0          | Plugin device surface, permissions, and consent — workstream 0003 leg 2 (RFC 0083, epic task 3.35)                                                                                         |
| 0.65.0          | Forbidden page, authenticated 404 gate, hardened 500 boundary                                                                                                                              |
| 0.65.1          | Offline banner no longer overlaps the mobile header (renders below it on mobile)                                                                                                           |
| 0.65.2          | Mobile shell consumes `MobileHeader`/`MobileFooter` — workstream 0007 leg 2 (RFC 0088, epic task 9.24)                                                                                     |
| 0.65.3          | Fix session gate blocking the custom Web Push worker chunk, which broke the service worker for logged-out visitors                                                                         |
| 0.65.4          | Fix swapped logger args in `instrumentation.ts`; close a `tsconfig.json` include gap that left the boot path unchecked                                                                     |
| 0.66.0          | Per-user service worker page-cache partitioning — workstream 0008 leg 2a (Research 0012, epic task 2.31)                                                                                   |
| 0.67.0          | Cold-start offline launch flow and the Offline page — workstream 0008 leg 2b (Research 0012, epic task 2.32)                                                                               |
| 0.67.1          | Stop bundling plain `better-sqlite3` into the server graph (Webpack externalization fix)                                                                                                   |
| 0.67.2          | Fix SW `runtimeCaching` matchers closing over `next.config.ts` module scope, which had silently disabled custom SW routing                                                                 |
| 0.68.0          | Native mobile push relay — device-token schema + registration API, workstream 0005 leg 1 (RFC 0087, epic task 4.7)                                                                         |
| 0.69.0          | Well-known first-party OAuth clients for native shells, seeding half (RFC 0072 addendum, epic task 1.24)                                                                                   |
| 0.70.0          | Native mobile push relay — `apps/relay` APNs/FCM sending, environment-gated, workstream 0005 leg 2 (RFC 0087, epic task 4.7)                                                               |
| 0.71.0          | Native mobile push relay — `fanOutPushToUser` native delivery branch + push encryption, workstream 0005 leg 3 (RFC 0087, epic task 4.7)                                                    |
| 0.71.1          | Isolated-Postgres plugin migration-table collision fix (epic task 8.26)                                                                                                                    |
| 0.72.0          | Desktop native push scaffold — widen push device tokens to macOS/Windows, workstream 0010 leg 1 (RFC 0087 addendum, epic task 4.8)                                                         |
| 0.73.0          | Retire the `database.isolation`/`"shared"` manifest option — every plugin unconditionally isolated (epic task 8.28)                                                                        |
| 0.74.0          | Tiered plugin offline model — manifest `offline` enum + tier states, workstream 0008 leg 3 (Research 0012, epic tasks 3.36, 2.33)                                                          |
| 0.87.1          | Fix `/api/admin/{connections,data-grants,email-templates/preview}` authorizing off the spoofable `x-sovereign-user-role` header                                                            |
| 0.89.0          | Plugin-scoped roles and grants — `sdk.authz` provider/consumer wiring (RFC 0054, workstream 0017 leg 3, epic task 1.13)                                                                    |
| 0.90.0          | Notification Center read/manage SDK surface — `sdk.notifications.list/markRead/markAllRead/dismiss/dismissAll` (RFC 0015 extension), gated by the existing `notifications:send` permission |

**`runtime@0.33.0` — activity event name changed:**
The `settings.tenant_name_changed` activity log action has been renamed to
`settings.instance_name_changed`. Historical rows already in your `activity_log`
table are unaffected; new renames produce the new event name. If you have any custom
tooling that queries `activity_log` for this specific action string, update it.

**`runtime@0.33.0` — capability strings renamed:**
`tenant:view` → `instance:view` and `tenant:configure` → `instance:configure`.
No plugin manifests are known to declare these capabilities directly (they are
platform-internal), but if you have custom plugins that gate logic on these strings,
update them.

Some runtime minor versions (e.g. 0.24.0) were used by intermediate sub-tasks or
patch releases and are not listed individually.

---

## v1.0.0 release checklist

Steps to execute when all pre-v1 tasks in `ROADMAP.md` are ✅:

1. **Bump root `package.json` to `1.0.0`** and **bump `runtime/package.json` to
   `1.0.0`** in the same PR — aligning both to the product release milestone.
   The runtime is the product from an operator's perspective; keeping both in sync
   avoids operators seeing `sovereign@1.0.0` running on `runtime@0.3x.0`.
2. **Tag the release**: `git tag v1.0.0 && git push --tags`. The Docker image
   publish workflow produces the `v1.0.0` GHCR image automatically.
3. **Update this file** with final transition notes for the last `0.9.x → 1.0.0`
   jump, following the same format as the sections above.
4. **Reorganise upgrade guide section headings** to use root `package.json` versions
   (`v1.0 → v1.1`, etc.) instead of runtime-internal ones going forward. The runtime
   version map above remains the historical reference for pre-v1 sections.
5. **Update `SOVEREIGN_VERSION`** in `docker-compose.prod.yml` to `1.0.0`.
6. **Branch convention changes**: `main` becomes the production branch and `dev`
   the integration branch (as noted in `CLAUDE.md`).

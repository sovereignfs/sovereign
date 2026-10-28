# Hard Architectural Rules

Full reference for the load-bearing constraints that code, CI, or runtime
behaviour depend on. `AGENTS.md` carries the critical-violations summary; this
document has the detail and the reason for each rule.

Most rules below were learned in the legacy Sovereign repository, often from an
incident, and carried over because they still apply to `sovereign-core`. Their
original write-ups, with the full history, are in the legacy repository's
`docs/architecture-rules.md` and `docs/incidents/` (as of commit `131f7585`,
repository `sovereignfs/sovereign-legacy-v1` after the rename). Rules specific
to the legacy plugin model were not carried over.

**Adding a rule:** when a task surfaces a genuinely reusable lesson, add it here
with the story behind it, and add a one- or two-sentence summary to `AGENTS.md`
pointing here.

---

## Boundaries and contracts

- **Core is generic.** Core knows OAuth clients and their launcher entries,
  never a particular app. A feature that only makes sense for one app belongs in
  that app. (`docs/specs/core-app.md` §1.1)
- **Shared packages work with no core present.** Anything under `packages/` is
  used by standalone apps that never talk to core, so it never imports
  `apps/core` and never assumes a core URL exists.
- **Reusable UI capability ships from the design system.** Interaction hooks,
  overlay surfaces, secondary headers, motion and controls belong in
  `packages/ui`; core only consumes them. A fix discovered inside a core page is
  designed as a `packages/ui` addition plus a thin adoption change in core, never
  as a local implementation "to be promoted later".
- **`packages/ui` components are framework-agnostic.** They never import
  `next/navigation` or `next/link`; active state and link rendering come from
  the consumer (`item.active`, `renderLink`), so the package works in any React
  app.
- **Every package and app extends `packages/tsconfig`** (`base`, `nextjs` or
  `library`), so compiler settings never drift between packages.

## Auth, security, proxy

- **The Content Security Policy is built per request, around a fresh nonce, in
  `proxy.ts`, and the proxy matches every path.** API routes and static files carry
  it too; every way out of the proxy goes through one helper, so a branch added
  later (a redirect) cannot skip it. The nonce reaches the page through the request,
  where Next stamps its own scripts, so the root layout reads the request's headers:
  that makes every page render per request, which a nonce needs (a prerendered page
  has none). `style-src-attr 'unsafe-inline'` is the one inline allowance, for the
  design system's `style=""` custom properties; `script-src` never has it.
  `upgrade-insecure-requests` is sent only when core is served over https, because
  some browsers would otherwise upgrade requests to a plain-http `localhost`.
- **Start-up checks that can end the process live in a Node-only module** imported
  behind `NEXT_RUNTIME === 'nodejs'`, and are skipped during `next build`
  (`NEXT_PHASE`): `process.exit` in `instrumentation.ts` itself is flagged by the
  Edge analysis, and a build in CI has no secrets.
- **No secret has a default.** Required secrets throw at start-up when unset or
  too short. A default secret is a secret every installation shares.
- **Server actions and route handlers authorize inside themselves.** Every
  `'use server'` function is a public POST endpoint, whatever guard its page
  has. Each one requires a session and, for every mutation, the specific
  capability. A read-only action that a lesser role's page legitimately renders
  must not demand a mutation capability — it crashes the page for that role.
- **The proxy's sign-in redirect is `303`, never `307`.** A `307` preserves the
  method, so a redirected form POST arrives at the sign-in page as a POST and
  fails with 405.
- **Nonce-based CSP, applied on every proxy return path.** Never
  `'unsafe-inline'` in `script-src`; the pre-paint theme script is allowed by
  hash. `form-action` must include every origin a form legitimately posts to
  or redirects through — browsers check the whole redirect chain, so a missing
  origin silently blocks the submit.
- **`proxy.ts` keeps the Edge discipline.** Next 16 runs it on Node.js, but it
  stays free of Node built-ins and database access so the gate stays portable
  and the signed-cookie verification stays the cheap hot path.
- **No fresh-session requirement (`session.freshAge: 0`).** better-auth's fresh
  gate returns `403 SESSION_NOT_FRESH` for sessions older than a day, which
  breaks sensitive actions with no re-authentication flow to recover. Sensitive
  actions ask for the password instead. A regression test asserts the setting.
- **A better-auth bump is verified against a populated store, never only a fresh
  one.** Its migrator refuses to add a required column to a table that has rows,
  which surfaces only at boot on a real instance. (Legacy skipped 1.7.0–1.7.2
  for exactly this; the genuine cookie fixtures in the session tests guard the
  signed cookie format.) Core keeps what each version wrote in
  `apps/core/src/__tests__/fixtures/auth-store/` (a person, a password hash and
  a live session with its signed cookie); `auth.suite.ts` loads every capture
  into each database and checks sign-in and the open session still work. Before
  upgrading, capture the installed version
  (`SV_CAPTURE_AUTH_STORE=1 pnpm vitest run --project unit auth-store.capture`),
  keep the old file, upgrade, and run the suite on all three databases.
- **The password policy is enforced where the hash is made, not in a request
  hook.** better-auth stores a password only by hashing it, whichever way it
  arrived; `setPassword` is server-only and has no path, so a hook keyed on the
  request path never sees it (found by a test that called it directly). The
  hash function is wrapped (`policedHash` in `src/auth/auth.ts`) to refuse a
  password that breaks the policy, with the reason; the hash itself is
  better-auth's own, so existing accounts keep working. better-auth's own length
  limits are set wide so core's one sentence is what a person reads.
- **The origin and CSRF checks are never switched off.** better-auth turns its
  origin check off by itself when `NODE_ENV` is `test`; core sets
  `disableOriginCheck: false` and `disableCSRFCheck: false` explicitly, so tests
  exercise the check production runs.
- **Rate limits count attempts per client address, in the database, and trust a
  forwarded address only through declared proxies.** `SV_AUTH_TRUSTED_PROXIES`
  lists the reverse proxies in front of core. Without it only a single-address
  `X-Forwarded-For` is believed; any other request shares one limit per path, so
  a client can never choose its own address.
- **Registration is enforced where an account is made, and fails closed.** The
  invite check and the owner assignment are better-auth's `user.create.before`
  hook, which every account passes through, not a request hook, which a
  server-side call with no route never reaches. The first account is the one made
  when _no account exists at all_, never "when there is no owner", so an instance
  that somehow lost its owner is not open to whoever signs up next. At most one
  owner is held by a partial unique index on `users.role`, so two sign-ups that both
  find the instance empty cannot both win it; the loser fails. A role is never
  taken from a request: the field is `input: false`, and the hook sets it anyway.
  Whether sign-up needs an invite is read on every sign-up (it is a setting that
  changes while core runs), and only an explicit `false` opens it. Every way an
  invite can fail (none, expired, cancelled, used) gets the same answer, so a refusal
  says nothing about the invitations other people hold.
- **PostgreSQL migrations never name a schema.** drizzle-kit writes foreign keys
  as `"public"."users"`; core runs in whichever schema the connection's
  `search_path` names (each test file gets its own). `pnpm --filter
@sovereignfs/core db:generate` strips the qualifier, and a test fails if one
  is left.
- **Self-mutations of the profile clear both session-data cookie variants**
  (`better-auth.session_data` and `__Secure-better-auth.session_data`), or the
  cookie cache keeps serving the old values.
- **Server-to-server calls to better-auth send an `Origin` equal to the auth
  base URL**, or its CSRF check answers 403.
- **Timing-safe comparison for every key or token**: `timingSafeEqual` on
  length-checked buffers, never `===`.
- **A signed-download route keeps its token in its own path segment**, and its
  proxy exemption must actually be in the matcher — a comment claiming one is
  not proof.
- **Never interpolate a request-derived value into a shell command.** Use
  `execFileSync` with an argv array and resolve against a server-side
  allowlist. A spawned `git` never inherits `GIT_DIR`/`GIT_WORK_TREE`, and gets
  credentials through its environment (`GIT_ASKPASS`, or `GIT_SSH_COMMAND` with
  a `0600` temporary identity removed in `finally`), never argv or a URL.
- **Service-to-service trust uses one signed-token pattern** (HMAC-SHA256 over
  the request, with expiry). Never invent a new mechanism per service pair.
- **An anchored quantifier before `$` or `^` is quadratic even alone**
  (`/-+$/`). On untrusted input, use a manual index scan.
- **A development-only bypass checks `NODE_ENV === 'development'` exactly**,
  never `!== 'production'`, which also disables the gate under test.
- **The service worker never stores a per-user page.** Authenticated pages are
  served network-only with a timeout and an offline fallback page; only neutral
  shells are ever cached.

## Data layer

- **The data layer is always async**, even on SQLite, so code never depends on
  which database is underneath.
- **Every schema change is made for every dialect.** Schemas and migrations are
  paired per dialect; a parity test fails when a column exists in one only.
- **Session-scoped Postgres primitives run on one pinned client** — advisory
  locks, `SET` GUCs, temporary tables. Two calls on the pool may land on
  different connections; a leaked `pg_advisory_lock` once hung every restart in
  production.
- **node-postgres returns `bigint` and `COUNT(*)` as strings** from raw queries.
  Coerce with `Number()` before comparing.
- **Millisecond timestamps are `bigint({ mode: 'number' })` on Postgres.** A
  13-digit value overflows a 32-bit `integer`. Booleans and ids use plain
  `integer` where the dialects must agree.
- **Postgres identifiers stay under 63 bytes**; longer ones are silently
  truncated. In Postgres tests, clean up only the tables the test created —
  never drop the migration tracker's schema.
- **drizzle-kit can't generate a rename non-interactively.** Hand-author both
  dialects' migration and snapshot, then check with `drizzle-kit check` and a
  no-op `drizzle-kit generate`.
- **Every sqld request names its namespace, `default` included.** With namespaces
  enabled, sqld takes the namespace from the first DNS label of the `Host` header
  when none is sent, so `http://127.0.0.1:8080` is read as the namespace "127" and
  answers 404 ("Namespace `127` doesn't exist"). Sending `x-namespace` on every
  request makes the URL's host irrelevant (found while building the CI database
  legs). Namespace routing by header needs sqld 0.24.33 or later.
- **libSQL calls a custom `fetch` with a `Request`,** headers and body included. To add
  `x-namespace`, set it on a copy of the request; passing `headers` in the init replaces
  the request's own (its content type, an authorization header). A unit test with a stub
  `fetch` cannot see this unless it reads the `Request`.
- **The libSQL file driver is synchronous, so contention inside one process deadlocks.**
  A connection waiting for the file blocks the whole process, including the connection it
  is waiting for. Operations on one file run one at a time within the process; other
  processes rely on SQLite's busy timeout. Never test "several instances at once" against
  a file without that serialisation.
- **Inside a transaction, use the executor you are given, never the database.** On
  PostgreSQL the database would take another connection (outside the transaction, and
  able to exhaust the pool); on a SQLite file it waits forever for a lock the transaction
  holds. The interface throws the same error on every dialect.
- **A migration runner keeps its own record, makes each migration atomic, and never
  rewrites history.** Exactly once under concurrent starts (an advisory lock on one pinned
  PostgreSQL connection, so the pool needs two; a re-check inside the write transaction
  elsewhere); a changed, missing or out-of-order migration is an error, not a guess.
- **Load a database driver only when its dialect is in use.** `@libsql/client`'s native
  addon loads at import; a PostgreSQL deployment, or a musl image without a matching
  binary, must never load it. Keep driver packages in `serverExternalPackages` so Next
  does not bundle them.
- **A setting resolves saved value, then environment, then built-in default, and a setting
  left unset never opens access.** Registration is invite-only until someone chooses
  otherwise. Clearing a saved value returns to the environment. A change shows at once on the
  instance that made it and within the cache time (seconds) on others.
- **A saved secret that cannot be decrypted is "unreadable", never silently replaced by the
  environment's value.** Something running on a credential nobody chose is worse than
  something asking for it again. Every read degrades per value, so one unreadable secret does
  not stop the others, and the Console never gets a secret's value, only whether one is saved.
- **Core brings its own database up to date at start-up, and a failure stops it.** Every
  instance may run the migrations at once (the runner applies each exactly once), and the
  migration folder is read from disk, so a traced build must ship it (`outputFileTracingIncludes`)
  and the read opts out of whole-project tracing (`turbopackIgnore`).
- **A published package ships `dist/` and its licence, and nothing else an app does not need.**
  `files` is an allow-list (`dist`, `LICENSE`, `README.md`, and `NOTICE` where a dependency's
  licence requires it); source, tests, stories and configuration never ship. The check packs the
  real tarball and runs a real `publish --dry-run`, because a `files` list that looks right can
  still miss an entry point or ship a workspace dependency that npm cannot resolve.
- **A link in an email is on the instance's own address, and is checked where the email is
  rendered.** A reset or verification link built from a request's `Host` header sends the token to
  whoever chose the header (password-reset poisoning). Flows build links from `SV_URL`
  (`emailLink`), and the renderer refuses any other origin, any non-web scheme and any credentials in
  it, so one flow's mistake cannot become an attack.
- **Whatever reaches an email is escaped or validated, by where it lands.** Text goes through React
  (HTML escaping); the instance name and a person's name are reduced to one line before they can
  reach a subject; a colour must be `#rrggbb` before it reaches a `style` attribute; a logo must be a
  web address. A setting that appears in emails refuses control characters when it is saved.
- **Every email has an HTML and a plain text version from one set of words,** and says an expiry only
  when there is one (a fixed "48 hours" in the old copy was simply wrong for an invitation that has
  an operator-chosen expiry or none).
- **A flow that needs mail fails loudly when mail cannot be sent.** Not configured, half
  configured or unreachable are all errors with a message that says what to fix; nothing is
  dropped and nothing pretends to have been sent. The start-up only warns, because a core
  without email still serves sign-in for accounts that need none.
- **SMTP credentials never cross a network unencrypted.** With a login the connection must be
  encrypted, by implicit TLS or by a STARTTLS upgrade that is required (a server that merely
  does not offer it must make the send fail, not send the password in the clear), and the
  certificate is verified. Test it against a server that offers no TLS and one with an untrusted
  certificate, and assert the password never arrived.
- **An error from a mail library is translated, not passed on.** Its text can echo the user name
  or the server's reply. Keep the code and the numeric SMTP reply, and write the message.
- **Refuse, do not clean, a line break in anything that becomes a header.** A subject or an
  address with one is a header injection; the message is refused.
- **A shared package reads no environment.** The mailer takes its settings from the caller; core
  resolves them from the Console and `SV_SMTP_*`, so a saved value can override and apply
  without a restart.
- **Stored secrets are encrypted with a key ring, bound to where they are stored.** AES-256-GCM,
  a fresh random IV per value, and the key id and a context (`table.column[:row]`) in the
  authenticated data, so a ciphertext copied into another field or row does not open. New values
  use the first key; any key in the ring decrypts; a value read under an older key comes back
  with its upgraded envelope, so a rotation finishes itself. A bad context is a `TypeError`, not
  a `DecryptionError`: never let a caller's mistake look like a value that failed.
- **A malformed key ring is a start-up error even where encryption is optional,** and no
  message shows a key: problems are named by entry position, because a mistyped entry may be a
  key itself.
- **Encryption settings fail per app and never convert data silently.** A
  required key with an existing plaintext store is a start-up error for that
  app only; a genuinely empty data directory may start encrypted; converting is
  an explicit command shipped in the published image, run with a backup first.
  (Legacy incident 2026-07-24: one component's encryption requirement aborted
  the start-up of five others, and the conversion command existed only in a
  build-only image.)
- **A value that cannot be decrypted degrades per value.** Match the specific
  error and handle that row; never let it reject a whole `Promise.all`.

## Runtime, boot, Docker

- **Never `NEXT_PUBLIC_*` for runtime-varying values.** They are inlined at build
  time, and images are built without an `.env`.
- **Never drop the `pnpm-workspace.yaml` COPY from Dockerfiles.** Workspace-root
  resolution needs it, or on-disk paths resolve outside the volume.
- **The image ships its migrations and every CLI it needs at runtime.** A
  production deployment pulls images and has no source checkout.
- **The lockfile covers every target platform.** `supportedArchitectures` names
  darwin and linux, arm64 and x64, glibc and musl — otherwise a lockfile made on
  a Mac lacks the musl variant of a native package and the Alpine image crashes
  at boot (`Cannot find module '@libsql/linux-arm64-musl'`).
- **Every outbound `fetch` on a server render path has a timeout,** and a route
  that blocks on the network gets a `loading.tsx`.
- **Import-time faults in optional modules must not abort boot.**

## UI and client behaviour

- **Core's pages follow the established Sovereign UI.** The sign-in pages, the
  consent page, the signed-in shell, the launcher, the Console and the identity
  pages keep the layouts and behaviour of their Sovereign predecessors.
  (`docs/specs/core-app.md` §1.3)
- **`'use client'` components never read browser globals in a `useState`
  initializer or during render.** Initialize safely and read in `useEffect`.
- **Never fork a navigation decision (redirect or push) by viewport.**
  `useIsMobile()` is `false` on first paint and corrects in an effect that runs
  after the children's effects. Fork rendered content only.
- **Navigation inside an overlay uses `<Link replace>`.** The overlay closes with
  `router.back()`, so a push stacks history.
- **`Dialog`, `Drawer` and `Sheet` portal into the shell root** (`#sv-app-shell`),
  not `document.body`: the shell's inset and chrome-height properties are
  inherited from there, and an animating `transform` would otherwise clip a
  nested overlay.
- **`router.push()` to the current URL doesn't refetch server data** — use
  `router.refresh()`. Callbacks passed as effect dependencies are memoized.
- **An RSC element stored into client state loses its `key`.** Pass a string key
  prop and apply it client-side on a `Fragment`.
- **A quick-entry input that commits on Enter also commits on blur**
  (`useCommitOnEnterOrBlur`) — iOS's Done key fires only `blur`.
- **`touch-action` is the intersection of an element's value and every
  ancestor's.** Never route nested perpendicular scrollers by narrowing it.
- **Page padding comes from `PageContainer`**, never local padding.
- **Sticky elements inside touch-scrollable content get
  `transform: translateZ(0)`** (iOS Safari re-tiling); skip it on pointer-only
  sticky elements.
- **Measure element heights with `getBoundingClientRect()` in
  `useLayoutEffect` plus a `resize` listener**, not `ResizeObserver`, which has
  been seen never to fire for an already-mounted element.
- **Overriding a design-system module class needs higher specificity**
  (`svg.cls`, not `.cls`) — per-route CSS order isn't guaranteed.
- **Composer-style surfaces keep a stable tree across state changes.** Swap a
  modifier class; never remount the subtree.

## Environment and tooling

- **Routine installs use `pnpm install --frozen-lockfile`.** A bare install
  re-resolves the graph and can silently bump a transitive major.
- **Shared dev tooling is pinned through the pnpm `catalog:`**, never a literal
  version in a package.
- **An `overrides` entry for an advisory is capped to the consumer's declared
  range** (`'>=3.1.6 <4.0.0'`), never open-ended; an open range once moved a
  dependency onto a major its consumer didn't support.
- **Workflows are pinned and least-privileged.** Third-party actions are pinned to a
  full commit SHA with the release in a comment (Dependabot updates both); every
  `actions/checkout` sets `persist-credentials: false` since CI never pushes;
  workflow permissions default to `contents: read`; values from the `github`
  context reach a `run:` script through `env:`, never by interpolation; and each
  job has a `timeout-minutes`. `actionlint` and `zizmor` both pass on the
  workflows (run them from their Docker images after changing one).
- **TypeScript 6:** the shared base sets `types: ["node"]`; never add `baseUrl`.
- **pnpm's release-age gate stays strict.** `minimumReleaseAge` refuses a release
  published less than a day ago; by default pnpm then quietly adds the package to
  `minimumReleaseAgeExclude`, defeating the gate. `minimumReleaseAgeStrict: true`
  makes it fail instead. A catalog range whose floor is a day-old release cannot
  install — name an older floor. (Hit on the first install: a `typescript-eslint`
  floor set to the newest patch.)
- **A tool major is held back only for a named blocker, written next to the pin.**
  TypeScript 7 waits for `typescript-eslint`; ESLint 9 is end-of-life ("no longer
  supported"), so ESLint runs on 10 and `eslint-plugin-jsx-a11y`, which declares
  support only to 9, is allowed through one scoped `peerDependencyRules` entry —
  after its rules were run on 10, and with a test that fails if they stop firing.
- **Don't take a `@types/*` package that pins an end-of-life dependency.**
  `@types/eslint-plugin-jsx-a11y` depends on ESLint 9; a local declaration of the
  one shape used (`types/`) keeps a second ESLint out of the tree.
- **Tests await every async operation they start,** and a long timeout is scoped
  to the one slow test, not set globally.
- **A generator formats its own output,** so a regeneration changes only what the
  source changed. `generate:icons` and `generate:theme-presets` run Prettier on
  what they write, and the `lucide` pin is exact: a generator's output follows its
  input's version, and a bump is a reviewed diff, not a surprise.
- **Checks that scan the repository read the working tree, not `git ls-files`.**
  A new, uncommitted file is the one most likely to break the rule.

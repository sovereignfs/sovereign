# Hard Architectural Rules

Full reference for the load-bearing constraints that code, CI, or runtime
behaviour depend on. `AGENTS.md` carries the critical-violations summary; this
document has the detail and the reason for each rule.

Most rules below were learned in the legacy Sovereign repository, often from an
incident, and carried over because they still apply here. Their
original write-ups, with the full history, are in the legacy repository's
`docs/architecture-rules.md` and `docs/incidents/` (as of commit `131f7585`,
repository `sovereignfs/sovereign-legacy`). Rules specific
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
  The other hardening headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, and `Strict-Transport-Security` over https only) go on the
  same way, from `securityHeaders`, so no response is without them; HSTS is never
  sent over http, where a browser ignores it and a name that has seen it on https
  would refuse http for a year.
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
- **Email is sent in the background, and whether it can be sent is asked first.**
  A flow that sends email (verification, reset) must not answer differently, or
  more slowly, for an address that has an account: `advanced.backgroundTasks`
  runs the send without the request waiting for it, a send that fails is
  logged and never thrown, and a request that needs email while it is not set
  up is refused up front (`EMAIL_NOT_AVAILABLE`, 503) for every address alike.
  Sign-up, resend and reset answer the same for known and unknown addresses.
- **better-auth answers a 403 from a user-create hook with a made-up success
  when verification is required** (its anti-enumeration design), so a refusal
  that must reach the person uses another status: an uninvited sign-up is a
  `422` (`INVITE_REQUIRED`).
- **better-auth's signed cookie cache is off, so every session check reads the
  database.** With it on, a session that had ended (a password reset, a
  deactivation, a sign-out elsewhere) kept working for up to 300 seconds for
  every better-auth endpoint, and the OAuth provider's authorize endpoint went on
  issuing authorization codes to it: a deactivated person could still obtain
  tokens just after their tokens were revoked. A test signs in, removes the
  session row and asks to authorize with the same cookie. Core's own pages call
  `getSession`, which also passes `disableCookieCache`, so the rule holds if the
  cache were ever turned on. Cost: one primary-key lookup per request.
- **What sign-up must carry is checked in the user-create hook, and the record of
  it is set by the server.** The terms must be accepted (`TERMS_NOT_ACCEPTED`)
  and a time zone, if given, must be a real IANA name (`INVALID_TIMEZONE`) and
  a language, if given, a real BCP 47 tag (`INVALID_LOCALE`), both kept in their
  canonical spelling and checked again by every later update of the account,
  before the invitation is even looked at. The time, and the version of the
  text (a digest of the documents as built, so there is no number to forget to
  raise), are written by core: those fields are `input: false`, and an update
  of the account cannot touch them. Refusals are 400, never 403 (see the hook
  rule above).
- **Every page is rendered per request** (`await connection()` in a page that
  reads nothing else dynamic), because the nonce in the Content Security Policy
  exists only for a request: a page prerendered at build time loads no script.
- **Every way of opening a session passes the second step.** With TOTP on,
  better-auth's sign-in answers the password with a challenge and opens no
  session; the plugin hooks only the password sign-in paths. Anything else that
  can open a session (the verification link, a passkey, later the provider's
  own sign-in) must be checked against `twoFactorEnabled` before it is added.
  The verification link is covered by requiring a verified address to turn
  TOTP on, so a person with it on has no link left to follow. A passkey is
  decided: it must be unlocked on the device, which makes it two factors, so it
  does not ask for the code. The checks a person must pass before any session
  (a verified address, an active account) are one function,
  `assertMayOpenSession` in `src/auth/session-gate.ts`, called from the hook on
  creating a session: that hook sees every way of signing in, including ones
  added later, so none can be a way round it. A way of signing in may also call
  it earlier, for a clearer error.
- **Deactivating an account is one transaction, with a place for the rest.**
  `AccountStates` (`src/accounts`) sets the state and ends the sessions in one
  transaction, runs registered steps inside it (revoking issued tokens joins
  here) and notifies listeners after it commits. A failing step rolls the whole
  thing back; a failing notice is logged. Core's own session check also refuses
  a deactivated account, for a session created in the same moment.
- **A passkey answer must be user-verified, and core checks it itself.**
  better-auth asks the device to unlock ("preferred") but verifies with
  `requireUserVerification: false`, so a bare touch of a security key would
  sign in. Both ceremonies refuse an answer without the user-verified flag in
  the plugin's `afterVerification` hook (`PASSKEY_NOT_UNLOCKED`); passkeys are
  asked for as discoverable and unlocked.
- **better-auth's packages move together.** `@better-auth/passkey` is pinned to
  the exact version of `better-auth` (no `^`): a caret pulled 1.7.14 while
  `better-auth` was 1.7.13, and each brought its own `@better-auth/core`, whose
  separate context storage breaks transactions and hooks. Bump them in one
  change, against a populated store.
- **Core offers no "trust this device".** The second step is never skipped for a
  period; a request that asks for it (`trustDevice`) is refused, not ignored.
- **The authenticator key and the backup codes are encrypted by better-auth with
  `SV_AUTH_SECRET`,** not with core's field encryption key ring, because the
  plugin does the encrypting. Rotating the auth secret ends every enrolment.
  Do not "fix" this by hand-rolling TOTP: the plugin's lock-out, attempt
  counters and single-use backup codes are what make it safe.
- **Every check asks `can`, and every action and route calls `requireCapability`
  (or `requireSession`) itself, first.** `src/roles` holds the capability
  registry, the default matrix and `can`; `src/auth/authorize.ts` holds the
  helpers a server action or route calls. `can` fails closed on a role it does
  not know, gives the owner everything, and never gives an owner-only
  capability to another role even from a matrix that says so, so the editable
  matrix cannot weaken them. A test reads spec §3.2.2 and compares every role
  against every capability; another reads `app/` and fails when a route or a
  `'use server'` file does not authorize, so a new one cannot skip it. The two
  public routes (better-auth's own and health) are listed in that test, and
  adding to the list is a decision for review.
- **The matrix in force is the code's default with the owner's stored
  differences, read from the database on every guard; a stored row is never
  trusted to be safe.** `capability_overrides` holds only differences, so a
  capability added to the code later reaches everyone as its default says.
  `applyOverrides` ignores a row for the owner, for a role or capability that
  does not exist, and for an owner-only capability, so a tampered table cannot
  hand those out; `changeCapabilities` refuses the same, all of a request or
  none of it. A change is seen at once on the instance that made it and within
  the store's few seconds elsewhere (§3.2.3 allows the session cookie's 300);
  nothing is carried in the session, since no check reads the cookie. When the
  matrix cannot be read, a check fails; it does not fall back to a more
  generous one.
- **Core's OpenID Connect provider is better-auth's JWT and OAuth provider
  plugins, configured and never forked** (`src/oauth/provider.ts`, research 0001).
  The issuer is the bare instance URL, so the discovery documents are served at
  the root by two route handlers that delegate to the plugin's helpers while the
  endpoints stay under `/api/auth`. Only the authorization code grant and refresh
  tokens exist; PKCE `S256` is required of every client; no client registers
  itself, and `clientPrivileges` lets only a role that holds `client:manage` in
  the matrix in force create, change or list one; a redirect address must match a
  registered one character for character (the plugin's loopback-port allowance is
  turned off); the JWT plugin's own `/token`, which hands any session a signed
  JWT, is disabled. Claims are made by one function (`claimsFor`) for the ID token
  and userinfo alike and only from granted scopes.
  An ID token's algorithm is applied in `src/oauth/id-token-alg.ts` alone: the
  provider signs every ID token with its primary (EdDSA) key and cannot choose
  per app, so an app set to RS256 has its token re-signed after the token
  endpoint (with `at_hash` recomputed), and the RSA key is published when the app
  is saved and whenever the key set is read. An access or logout token is never
  re-signed. A scope core does not offer is dropped by `oauthGuards`
  (`src/oauth/guards.ts`) before the provider reads the request, not refused.
- **Notifications are written only by `NotificationService`, and say nothing of who may be told** (`src/notifications/service.ts`,
  core-app §4.1). The app is taken from its token and the person named by the caller, never from the request body; a send to
  someone who has not used the app, has switched it off or is inactive is accepted and dropped and answers as a delivered one
  does; a link goes only to an `https` address on one of the app's own origins; text is plain. The Core API's person calls act on
  the calling app's own notifications only, and core's own panel route (`/api/notifications`) acts on the session's account and
  checks the request's origin. Remove access, deleting an app and deleting an account delete them in the same transaction.
- **A restore is recorded once, only forward, and by one command** (`sovereign-admin instance restored`, `src/instance/restore.ts`,
  core-app §4.4). It writes `instance.restored_at`, deletes every session and revokes every token row in one transaction; the Core API
  refuses a signed access token or an app token issued at or before the marker. The marker is not one of the Console's settings, and a
  time at or before the one held changes nothing and ends nothing.
- **Activity is a person's own record, written by `ActivityService` alone and read for the person it is about and no one else**
  (`src/activity/service.ts`, core-app §4.3). An app records with its own token and `activity:write` and can read nothing; no operator
  page or route lists entries; the page and its actions use the session's account, never one from the request. A record about a person who
  may not have it is answered as a kept one, and the limits are counted before the person is looked at. What is shown is text, and a link
  is shown only after it was checked against the app's own origins.
- **The services an app uses for itself share what they ask about an app and a person** (`src/clients/use.ts`): where the app's links may
  go, and whether the person has used it. Notifications, email and activity do not keep their own copies.
- **Email for apps is `MailForAppsService`'s alone, and it tells the sender nothing** (`src/mail/apps.ts`, core-app §4.2). The
  recipient is a `sub`; the address is read inside the service and goes only to the mail server, never into an answer or a log. The
  sender, recipient and headers are core's (the app supplies a subject, plain text, one link on its own origin and a key); a send that may
  not be delivered (no such person, not used the app, switched off, deactivated, address not verified) is answered as a delivered one,
  and so is its limit counted before the person is looked at. The answer is given before the mail server has the message. `emailGuard`
  asks for an app token with `email:send`, then answers `404` when the instance has no mail.
- **An app's own token is a different kind from a person's, and the Core API tells them apart**
  (`src/api/token.ts`, core-app §3.6.6). It is made by the provider's client-credentials grant, which an app has only when an
  operator gave it an app scope (`APP_SCOPES`, never `directory` or anything about a person; a public app cannot hold one); its
  subject is the app, it has no session, and `authenticate` refuses it where a person is needed while `authenticateApp` refuses a
  person's where the app's is. `authenticateApp` also requires the scope to be one the app holds _now_, so taking a scope away
  stops it, and it checks the app is on and confidential. Rotating the secret and switching the app off record the time in
  `app_token_revocations` (`revokeAppTokens`), the way Remove access does for a person. The token endpoint's guard leaves a
  client-credentials request's scopes to the provider, and an app scope is never offered to a person.
- **The SDK keeps a refresh token from being used twice** (`packages/sdk/src/tokens.ts`,
  sdk §5). Core rotates the token on every use and removes everything an app holds for a
  person when one is used twice, so two refreshes racing sign the person out everywhere.
  Refreshes run one at a time for each person in a process, and under the app's token
  store lock across processes; the store's write is conditional, and the new token is
  stored before the access token is used. A refresh is sent once: if its answer is lost,
  or core rotated and the write failed, the old token is remembered as dead and never sent
  again, and the person signs in again. A failure that certainly never left (a refused
  connection) or that core answered with a 5xx keeps the token. Requests time out, only a
  call the contract marks `x-safe-to-repeat` (or a GET) is retried, twice, inside ten
  seconds, and a version check never stops a call. Nothing is logged but the operation,
  status and duration. The fake core (`/testing`) is held to the contract by the SDK's
  own tests.
- **The SDK's sign-in keeps its state in the app's store and trusts nothing it was not
  given** (`packages/sdk/src/auth.ts`, sdk §9.1). A sign-in's verifier, `state` and
  `nonce` are a `pending` record named by an unguessable cookie and deleted the first
  time a callback uses it, ten minutes at most; the callback is read at the app's
  public address, never the one a proxy gave the request, and only a path on the app
  can be returned to. The session cookie is host-only (`__Host-`, `Secure`, `HttpOnly`,
  no `Domain`) over https, and `getSession` never calls core. A logout token is refused
  unless its `typ` is `logout+jwt`, its signature checks against core's published keys,
  its issuer and audience are right, it is neither expired nor from the future, it
  carries the back-channel event and a `jti` not seen before, names a `sub` or `sid`,
  and has no `nonce`; it ends the one session its `sid` names, or every session of its
  `sub`. Signing out is a `POST` in the Next adapter, so a page cannot cause it.
- **`sovereign-admin` writes apps as the system actor, built in one place.**
  `systemActor()` (`src/clients/system-actor.ts`) is called by the command's entry
  point (`src/admin/main.ts`) and nowhere else; no route, page or action imports
  it (`system-actor.test.ts` fails when one does). The registry still validates
  and writes everything, and accepts an actor only if it was made there (a
  `WeakSet`, so an object that merely looks like one is refused). The provider's
  client routes ask for a session, so for a call made as the system actor, and
  only then (`runAsSystem` sets an `AsyncLocalStorage` no request can set), a
  before-hook gives the call a session of the owner's role that is never stored.
  A managed app's key is in `managed_clients`, not a column of the provider's
  table, which `oauth-schema.test.ts` holds to what the provider writes. The
  image runs the command from one bundled file (`tsup.admin.config.ts`), with no
  package manager and nothing to run TypeScript.
- **An operator's action on an account holds the role rules in the function, not
  in the page.** `AccountManager` (`src/accounts/manage.ts`) checks `user:manage`
  fresh, that the account exists, that it is not the actor's own, and `mayActOn`,
  before any change; the Console's buttons are only a convenience and the server
  actions are public endpoints. Deleting is one transaction that reads who to tell,
  revokes every token and removes the account and what belongs to it, in an order
  that does not rely on a database's cascade; the apps are told after the commit.
  A search is matched as typed (`like` with `escape`), never as a pattern.
- **An invitation link is public, carries a random id, and decides nothing.**
  `/invite/<id>` is in the proxy's public list; it only forwards a link that can
  still be used to sign-up, and shows one page for every link that cannot
  (unknown, expired, cancelled, used), so it says nothing about other people's
  invitations. Whether a sign-up is admitted stays the server's decision from the
  address (`hasValidInvite`). Invitations are made and cancelled by
  `InviteManager` (`src/invites/manage.ts`), which checks `user:manage` fresh and
  keeps one open invitation per address; when the email cannot be sent the
  invitation still exists and the operator gets the link.
- **The instance's settings are changed only by `InstanceManager`
  (`src/instance/manage.ts`), and the mail settings are never loaded for someone
  who may not see them.** Each change asks for its capability in the matrix read
  fresh (`instance:configure`; `instance:configure-secrets`, which is owner-only,
  for SMTP), validates before it saves, and saves the password first, since that
  is the one that can be refused for want of an encryption key. A page for
  someone without `instance:configure-secrets` calls `describeInstance` with
  `withMail: false`, so what they may not see is never read into what is
  rendered; a saved secret is described (that one is saved), never returned.
- **An uploaded SVG is rebuilt, never passed through.** `sanitiseSvg`
  (`src/images/svg.ts`) writes a new document from an allowlist of elements and
  attributes, so a handler, a script or a link out cannot survive by being
  missed. SVG is accepted for the instance's logos and favicon only, never for
  avatars; the public picture route serves it with `nosniff` and
  `default-src 'none'; sandbox`, and it is kept out of emails.
- **The matrix editor sends the whole table, and a form whose checkboxes a refusal
  must leave is sent from `onSubmit`.** `saveMatrixAction` builds a change for
  every capability the owner may edit from which boxes were ticked, never from
  what the request names, so an owner-only capability, the owner's row or an
  unknown role cannot be reached by forging a field; `changeCapabilities` refuses
  them again. A React form action resets the form's fields when it finishes,
  which would un-tick the boxes a refusal should leave, so such forms (the matrix,
  the sign-up and mail settings) call the action from `onSubmit` with the form's
  `FormData` and nothing is reset.
- **Ownership is handed over from one action that asks for the password, and
  leaves the page.** `transferOwnershipAction` asks for `ownership:transfer`
  itself, passes `confirmPassword` to `transferOwnership` (which holds every rule
  about who may receive it), returns a refusal for the dialog to show, and on
  success redirects: the previous owner may no longer open the page they were on.
- **The Console reaches an app's settings only through `ClientRegistry`, as the
  person and with the request's own headers, and a secret is in the answer to
  the call that made it and nowhere else.** Every action in
  `app/console/apps/actions.ts` asks for `client:manage` first, then hands the
  registry `{ user, headers: await headers() }` so the provider sees who is asking;
  the registry holds every rule (§3.7.3) and says all that is wrong at once, which
  the form shows beside each field. The secret returned by `register` or
  `rotateSecret` goes to the page that asked, is never saved, logged or put in a
  URL, and cannot be read again.
- **The launcher reads apps through `listLauncherApps`, not the registry, and only
  its page may load remote pictures.** `/` checks `launcher:access` itself, and
  `listLauncherApps` returns only a tile's fields (name, description, icon and
  launch address) for apps that are enabled, shown and have a launch address;
  nothing else about an app leaves the server for it. The proxy adds `https:`
  (and `http://localhost:*` on a development instance) to `img-src` for the
  path `/` alone, since the icon is an address an operator gave; every other
  path keeps `'self' blob: data:`, and no other directive changes.
- **A person's connected apps are read and removed for the session's own account
  only.** `listConnectedApps` (`src/oauth/connected.ts`) takes the account from
  the session the page checked, never from a request, reads the consent's scopes
  through the layers the provider stored them in (a list in JSON text inside JSON
  text on SQLite and sqld, an array on PostgreSQL), and says them in the words
  consent used. `removeAccessAction` asks for `profile:manage` itself, first, and
  calls `removeAccess` with the session's account and the app named.
- **A person deletes their own account only through `AccountManager.deleteSelf`,
  after the password, and never an owner's.** `deleteAccountAction` asks for
  `profile:manage` itself, first, then `confirmPassword` (counted and limited),
  then `deleteSelf` with the session's own id; `deleteSelf` judges by the role the
  database holds, not the one the caller passes, and refuses the owner before it
  changes anything. It shares `#erase` with the operator's `delete`, so both are
  one transaction that revokes every token and removes what belongs to the
  account, and tell the apps afterwards.
- **The Core API contract is the only definition, the client is generated from
  it, and every handler is held to it.** `spec/core-api/openapi.yaml` is edited
  first; `pnpm generate:api-client` rewrites `packages/api-client/src/generated/`
  (a test fails if the committed files differ); a handler's answer is checked in
  its test with `expectMatchesContract(operationId, status, body)`
  (`src/__tests__/core-api-contract.ts`), which fails for a field that is
  missing, extra or of the wrong kind; and a route under `app/api/v1` or a
  `/.well-known/sovereign-*` document that the contract does not describe fails.
  Objects in the contract are closed (`additionalProperties: false`), so an
  answer cannot quietly grow a field. An operation not yet served is marked
  `x-planned: true`, and the task that serves it removes the mark.
- **The branding document is typed from the contract and read on every request.**
  `brandingDocument` (`src/instance/branding-document.ts`) returns the generated
  `InstanceBranding`, so a field the contract lacks does not compile, and its
  route is in the proxy's public list and the authorization-coverage test's
  public routes on purpose (an app shows it with no credentials). It is
  `force-dynamic`, revalidated with an ETag, and reads the settings and pictures
  through the same stores the Console writes, so nothing is cached past what those
  stores cache.
- **A call into the Core API is let in only by `authenticate`, and a signed token
  is revoked by time.** Every `/api/v1` route calls its guard
  (`directoryGuard`) before anything else; the proxy lets `/api/v1/` through
  without a cookie, so the route is the only check. `authenticate`
  (`src/api/token.ts`) verifies against core's own keys with EdDSA and `typ`
  `at+jwt`, issuer, audience and expiry, then the scope, then that the account
  is active, the app is on, the session is open and `isTokenRevoked` says no.
  A JWT access token leaves no `oauth_access_tokens` row, so `revoke`
  (`src/oauth/revocation.ts`) also writes `token_revocations` in the same
  transaction, and the account's rows go with the account (`removeAccount`, not
  the cascade). A call with a bad token is not counted by `countCall`.
- **The Directory returns `sub`, `name` and `picture` and nothing else, matches
  names only, and matches an email only whole.** Its queries
  (`src/directory/directory.ts`) are tested for `%`, `_` and wildcards in both
  searches, for part of an address finding nobody, and for a deactivated account
  never appearing.
- **Every Console page checks for itself, and shows a page that is not there to
  someone who may not enter.** `requireConsole` (`src/console/guard.ts`) asks for
  a session, `console:access` and the capability the page needs, judged by the
  matrix read on this request, and answers with `notFound()`, never with what is
  missing. The layout calls it too, but a layout is not rendered again when
  someone moves between the pages beneath it, so a test fails when a Console
  `page.tsx` or `layout.tsx` does not call it. The navigation lists a section
  only when its page exists and the role holds its capability.
- **A client row is written by the registry and nothing else.**
  `ClientRegistry` (`src/clients`) validates everything (`validate.ts`: addresses,
  scopes, text), makes the client through the provider so the secret is hashed
  and defaults apply, and writes core's own fields through the provider's adapter,
  never through Drizzle's schema objects (the plugin's lists and objects come
  back as text on SQLite). The provider's own routes to register, create, change,
  delete or rotate a client are in `disabledPaths`, every method needs
  `client:manage` read fresh from the matrix, and a test reads the source and
  fails when anything else calls those endpoints or names the model. The
  provider's address checks are bypassed on purpose (a placeholder address is
  replaced straight after), because core-app §3.7.1 is the one rule set.
- **One routine revokes tokens, and a session is ended by better-auth.**
  `revokeAllTokens` and `revokeClientTokens` (`src/oauth/revocation.ts`) update
  the tokens' `revoked` time on the caller's own transaction, with table and
  column names read from the generated schema (`schema-names.ts`); deactivation
  (`revokeOnDeactivation`) and, later, deletion and Remove access use it, so an
  operation that fails revokes nothing. Deleting a session row by hand leaves its
  tokens alive (the pointer to the session is cleared, not the token) and tells
  no app, so a session is ended through better-auth's own endpoints
  (`revokeSession`, `revokeOtherSessions`, sign-out), whose hooks revoke the
  session's tokens and send the logout tokens; deactivation, which deletes the
  rows itself in one transaction, reads which apps to tell first
  (`planLogoutNotices`) and sends after the commit. The provider's endpoints that
  delete or narrow a consent are disabled: `removeAccess` is the only way.
- **`roles` is for trusted clients, enforced in three places.** Trust is the
  plugin's `skipConsent`, empty meaning untrusted (`isTrusted`). A before-hook on
  the authorize endpoint takes `roles` out of an untrusted client's request, so
  the signed request that goes through sign-in and consent never carries it and
  consent is not asked again each time; the consent page offers only what
  `scopesAllowedFor` leaves; and an extension adds the `roles` claim to the ID
  token and userinfo only for a trusted client, reading the client as it is now.
  The last one is what stops an operator-revoked client at once.
- **The consent page believes only what the provider signed.**
  `readConsentRequest` verifies the signature (`verifyOAuthQueryParams`) of the
  signed part of the address (`signedQueryOf`, the same rule as the provider's
  own client) before it reads a client id or a scope, so a link someone wrote
  cannot make core name an app or list a permission. Each scope has one plain
  sentence (`SCOPE_COPY`); a scope with none is not shown.
- **The provider's tables are written by hand in both dialects and checked
  against the installed plugins.** A list or object is JSON text on SQLite and a
  native array or jsonb on PostgreSQL, and the schema-parity check treats the two
  as one logical type. `oauth-schema.test.ts` reads what the plugins declare and
  fails when a field has no column of that name or a column is left over, so a
  better-auth bump that changes the schema is found by a test, not by a request.
  Verified on sqld, PostgreSQL and a SQLite file.
- **A sign-in page opened by the provider carries the app's signed request
  through every step.** Its address has the provider's `sig`; the client plugin
  adds the signed request to each sign-in step, the provider answers
  `{ redirect: true, url }`, and the forms go to that address, carrying the
  request to the second step. The page does not send someone already signed in
  away while the request is there, or `prompt=login` could never show the form.
- **Handing over ownership is one transaction of two conditional updates.**
  `transferOwnership` demotes the previous owner `where role = owner` and
  promotes the new one `where role = admin and deactivated_at is null`, in that
  order, and throws (rolling back) unless each changed exactly one row. A
  concurrent transfer, role change or deactivation finds the account no longer
  as it expected and changes nothing; the single-owner unique index is the last
  guard. A session's idea of the role is never trusted for this.
- **Asking for the password again is rate limited by core.** `confirmPassword`
  counts wrong answers per account in `rate_limits` (five in ten minutes, then
  every answer is refused until the window passes, a right one included),
  because better-auth's limiter guards its HTTP routes and a server-side
  verification never reaches it. Use it before anything that cannot be undone
  (a transfer, deleting the account).
- **The owner's guarantees are held in the code that changes things, not only
  in the Console.** `changeRole` refuses anyone but the owner, refuses to make
  an owner or change the owner, and `AccountStates` refuses to deactivate the
  owner; a test runs a long fixed sequence of role changes, deactivations and
  reactivations by every kind of actor and checks there is one active owner
  after each step. Who may act on whom is `mayActOn`.
- **A route handler that changes something checks where the request came from.**
  better-auth does this for its own routes; one written in core calls
  `requireSameOrigin` (core's own address and `SV_AUTH_TRUSTED_ORIGINS`; no
  `Origin` is refused) as well as `requireCapability`, or another site could send
  the person's cookies with a request of its own. A test fails when a route
  exporting `POST`, `PUT`, `PATCH` or `DELETE` does not.
- **An image is judged by its bytes and served as what they proved.**
  `inspectImage` reads the file's header (PNG, JPEG or WebP; at most 1 MB and
  4096 pixels on a side), refuses SVG and anything else, and the picture is served
  with that kind, `nosniff` and a version in its address. A request's declared
  type and size are not believed, and a body is read only as far as the limit.
- **`users.image` is set only by core.** A request cannot set it, at sign-up or
  by an update, since the address would be shown in other people's pages; only
  uploading a picture (`AvatarStore`) writes it.
- **A session is named by its id and ended only for its owner; a list of
  sessions never carries a token.** The token is the secret behind the cookie.
  `endSession` deletes `where id = ? and user_id = ?`, so naming someone else's
  session finds nothing, and `listSessions` selects no token column, so none can
  reach a page. Changing the password ends the other sessions
  (`revokeOtherSessions`), and the address shown for one is shortened or left
  out when it only means "this computer".
- **PostgreSQL migrations never name a schema.** drizzle-kit writes foreign keys
  as `"public"."users"`; core runs in whichever schema the connection's
  `search_path` names (each test file gets its own). `pnpm --filter
@sovereignfs/core db:generate` strips the qualifier, and a test fails if one
  is left.
- **Self-mutations of the profile clear every session-data cookie variant**
  (`better-auth.session_data`, `__Secure-better-auth.session_data` and
  `__Host-better-auth.session_data`), or the cookie cache keeps serving the old
  values. The cache is off now and none is set, but the clearing stays, so turning
  it on cannot bring stale values back. A prefixed cookie is removed with the
  attributes its prefix needs (`removalAttributes`), or a browser ignores the removal.
- **Core's cookies are host-only unless a cookie domain is set, and their names are
  decided in `src/auth/cookies.ts` alone.** Over https with `SV_AUTH_COOKIE_DOMAIN`
  unset they carry `__Host-`, which a browser refuses unless the cookie is `Secure`,
  has `Path=/` and has no `Domain`, so an app on a subdomain cannot plant a cookie
  that core reads as its own (cookie tossing). better-auth knows only `__Secure-`,
  so its own prefix is turned off for these and the name is given to it
  (`advancedCookieOptions`). better-auth's options, the proxy and the routes that
  clear a cookie all read the one module, and a test fails when another file names
  a cookie. The proxy accepts the one name the instance sets, not a list.
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
- **The service worker never stores a per-user page.** It is `src/sw/source.ts`,
  served at `/sw.js`, and keeps only an allow-list: `GET`s with no query string
  and no `Authorization` header, to core's own origin, under `/_next/static/` or
  `/icons/`, in one bounded, versioned cache. It has no handler for anything else,
  so a page, an API call or a token is never stored, and a navigation that fails is
  answered with a page the worker builds itself. A new path is cached only by being
  added to the list, and the tests (the worker's source is evaluated; the
  acceptance suite lists every cache after a signed-in tour) fail when something
  else gets in.

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
- **The image holds no environment and runs as nobody.** `.dockerignore` excludes
  every `.env` (a secret in an image is a secret in every copy of it), the last
  stage is the traced Next server with its migrations and static files and
  nothing else, it runs as `node`, and core refuses to start without `SV_URL` and
  `SV_AUTH_SECRET`. A Dockerfile test fails when a workspace package's manifest
  is not copied, and `pnpm docker:smoke` boots each documented database from
  the built image in CI. Core's own address must be reachable from inside its
  container (it fetches its own keys for an `id_token_hint`), which
  `docs/deploying.md` says how to arrange behind a proxy.
- **Development seeding is for a machine's own instance.** `seedAccounts` refuses
  an address that is not `localhost`, `*.localhost` or loopback, because the
  accounts it makes have a password that is in the source.
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

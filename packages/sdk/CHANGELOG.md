# Changelog: @sovereignfs/sdk

What changed in each version of the SDK an app's server uses to call core, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 2.1.0; earlier versions are in the repository's
history and tags.

## [2.12.1] - 2026-11-26

### Fixed

- `appKeys().unlock()` and `receive()` work on iOS (Safari, an installed app, and every other browser there): the request waiting for
  core's answer kept its private key as an X25519 WebCrypto key, which WebKit's IndexedDB accepts without an error and does not keep,
  so every unlock came back refused as `no-request`. It is now kept wrapped by a key of the browser's that cannot be exported. A
  request made by 2.12.0 and answered after the update is refused once, and the next Unlock works. An app takes the fix by updating;
  nothing in its code changes.
- What the SDK keeps in IndexedDB is written before `unlock()` leaves the page: a write now waits for its transaction to commit.

## [2.12.0] - 2026-11-23

### Added

- `sv.as(person).apps.list()` (`listMyApps`): the apps core's launcher lists for the person, for an app's own launcher. Any of the
  person's tokens will do. The fake core answers it from `setApps`.
- `beginSignIn({ prompt: 'create' })` asks core to open its sign-up rather than its sign-in (OpenID Connect Prompt Create 1.0), for an
  app's _Create an account_; `@sovereignfs/sdk/next`'s `/auth/login` passes it on.

## [2.11.1] - 2026-11-23

### Fixed

- `finishSignIn` and `completeSignIn` check the signature of the ID token core's token endpoint returns, against the keys core publishes
  (sdk §9.1). They did not: `openid-client` checks it only when asked, so an ID token signed with any key was believed, and someone able
  to answer for core's token endpoint could sign a person in as anyone. The keys are fetched through the SDK's own transport, with its
  timeout. An app takes the fix by updating; nothing in its code changes.

## [2.11.0] - 2026-11-20

### Added

- `handleExportRequest(request, app, handler)` answers core's request for a person's part of their export (sdk §9.1, core-app §4.7.2):
  it checks the signed `export-request+jwt` and streams an export, in the format of `@sovereignfs/export`, written by the app's
  `handler`. The Next.js handlers mount it at `/auth/export` with `onExport`. `@sovereignfs/sdk/testing`'s fake core signs such
  requests (`exportRequestToken`).

## [2.10.0] - 2026-11-20

### Added

- `session.user`: who is signed in, typed (`id`, `sub`, `name`, `email`, `emailVerified`, `picture`, `locale`, `zoneinfo`, `roles`), the
  same shape `@sovereignfs/auth` gives (sdk §9.9); `personFromClaims` makes it from core's claims. `sub`, `claims` and `roles` stay.

### Deprecated

- `nextAuth` (`@sovereignfs/sdk/next`): a new app signs people in with `@sovereignfs/auth`. It keeps working and is removed only in a
  major version; `docs/upgrade.md` says how to move off it.

## [2.9.0] - 2026-11-20

### Added

- Signing in for an app that keeps its own sessions (sdk §9.8): `finishSignIn` checks core's answer as `completeSignIn` does and keeps
  the refresh token, then says who signed in without making a session, and `endSessionUrl` gives core's sign-out for an ID token the
  app kept. `completeSignIn` is now `finishSignIn` with the SDK's session made from it; nothing of it changes for an app using it.
- The fake core (`@sovereignfs/sdk/testing`) takes a person's `email`, and sends it, verified, to a sign-in granted the `email` scope.

## [2.8.0] - 2026-11-19

### Added

- `checkEverySeconds`: an app's sessions are checked against core at that interval. Past it, `requireSession` in `@sovereignfs/sdk/next`
  sends the person through core with `prompt=none`, which shows them nothing while their core session lives: the session is renewed
  in place, with the same cookie and key secret and the claims core gives now, so a changed name or role reaches the app. When core says
  they must sign in, the session ends and they sign in the usual way, back to the same page. Not checked unless set.
- A session carries `checkedAt`; `sv.auth.needsCheck(session)` says whether it is due a check, and `sv.auth.endSessionCookie` clears the
  session cookie.
- `SignInError.reason` is `login_required` when core refused a `prompt=none` sign-in because the person is signed out there, with
  `returnTo` saying where they were going.
- `createFakeCore`'s `loginRequired` gives core's answer to a `prompt=none` sign-in for someone with no session.

### Changed

- A sign-in that was begun waits an hour for its callback, not ten minutes, so someone an app sent to core who makes an account, verifies
  their address or resets their password on the way is not refused when they come back.
- Signing in again in a browser that has a session for the same person renews that session instead of making a second one; another
  person signing in on that browser ends the first person's session there.

## [2.7.0] - 2026-11-18

### Added

- `beginSignIn` takes `prompt` (`login` or `none`) and `maxAgeSeconds`, to ask core for a fresh or recent sign-in; a sign-in asked
  with an age is refused at the callback when the ID token's `auth_time` is older.
- A session carries `authTime`, when the person last signed in at core, and `sv.auth.signedInWithin(session, seconds)` says whether that
  was recent. In `@sovereignfs/sdk/next`, `/auth/login` passes `prompt` and `max_age` on, and `requireSession(returnTo, { maxAgeSeconds })`
  sends a person to sign in again when their sign-in is older.
- `SessionEndedError.byCore`, true when core said the session is over.
- `createFakeCore`'s `authorize` takes `authTime`, and its ID tokens carry `auth_time`.

### Changed

- When core refuses to renew a person's token, or refuses their token twice, the SDK ends their sessions in the app and removes their
  stored refresh token, so the app stops acting for them and they sign in again.
- A back-channel logout notice that names the whole person (no `sid`) also removes their stored refresh token, when the token store can.

## [2.6.0] - 2026-11-17

### Changed

- `localVault`, for an app with no core, is imported from `@sovereignfs/sdk/local-vault`, a browser entry of its own, and no longer
  from `@sovereignfs/sdk/keys` (sdk §9.5, §12). No published version had it in `/keys`. An app that gets its key from core no longer
  loads any of the password derivation: `/keys` reaches no file of libsodium, and `/local-vault` loads it only when a key is derived.

### Fixed

- Trailing slashes are dropped from core's address and the auth base path with an index scan, not a regular expression that was
  quadratic on a long run of slashes (`appKeys`, the notice check, the Next.js handler).

## [2.5.0] - 2026-11-17

### Added

- `encryptContent`, `decryptContent`, `encryptBytes`, `decryptBytes`, `importDocumentKey` and `ContentTarget` in
  `@sovereignfs/sdk/keys`: a document, and its name and type, encrypted with its document key in RFC 0005 §1.3's format (sdk §9.4).

## [2.4.0] - 2026-11-17

### Added

- `@sovereignfs/sdk/vault`, for the server of an app that runs with no Sovereign server: `AppVault`, the tables it needs for SQLite,
  sqld and PostgreSQL (`vaultMigrations`), `vaultRoute` for its pages, and `newSessionSecret` to keep with each session (sdk §9.5).
- `localVault()` in `@sovereignfs/sdk/keys`: the same app key, unlocked at the app's own sign-in (or with a passphrase), with the
  recovery kit, and kept until the app's session ends. No request carries a password or a passphrase. `formatKit` for the kit.

## [2.3.0] - 2026-11-17

### Added

- `keys.me()` and `keys.person(sub)`, as a person: their own keys for the app, and another person's public keys (sdk §8).
- Sharing in `@sovereignfs/sdk/keys`: `checkPerson`, `trustChanged`, `identity`, `share`, `openShared` and `newDocumentKey` (sdk §9.4).
- The fake core answers the two key calls, given keys with `setKeys`.

## [2.2.0] - 2026-11-17

### Added

- `@sovereignfs/sdk/keys`, for an app's pages: gets the app's key from the person's Sovereign server once each browser session, and
  keeps it until the app's session ends (sdk §9.3). It is the one part of the SDK a page imports.
- `auth.keySecret(request)`, and `/auth/key-secret` in `nextAuth`'s routes, which the app's pages ask for to keep the key.

## [2.1.0] - 2026-11-02

### Added

- Verifying core's notices (account deletion, back-channel logout) on their own, without the SDK's sessions.

### Fixed

- The discovery document is asked for at the issuer's own address.

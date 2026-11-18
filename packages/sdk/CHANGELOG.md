# Changelog: @sovereignfs/sdk

What changed in each version of the SDK an app's server uses to call core, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 2.1.0; earlier versions are in the repository's
history and tags.

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

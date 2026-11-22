# Changelog: @sovereignfs/auth

What changed in each version of the sign-in core and every Sovereign app share, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is
written in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.6.0] - 2026-11-22

### Added

- Moving an app that had a sign-in of its own onto the package (RFC 0007 amendment 1, auth.md §8.1): `adoptAccountTables` renames its
  better-auth tables onto the package's and marks its passwords for 90 days; `movePasswords` (a plugin for such an app only) and
  `passwordMove` with `signInWithPassword` move a password at the person's next sign-in, opening no session of their own;
  `passwordsMoving`; `resetLink` for an app's own command.
- `coreSubOf` (`./core`): the `sub` core knows a person by, from the app's user id.
- `0001_legacy_passwords` in `accountMigrations`: an empty table in an app made on the package.
- `keySecrets` (`./server`): the session's key secret for `@sovereignfs/sdk/keys` and `localVault` at `/api/auth/sv/key-secret`, kept in
  `sv_key_secrets` (`0002_key_secrets`) and gone with the session; keyed by core's `sub` for a session that came through core.
- `@sovereignfs/auth/database`: `openDatabase({ prefix })` opens the app's database on the form `<PREFIX>_DB_DIALECT` names, a SQLite
  file, sqld (its namespace made when there is an admin address) or PostgreSQL (`direct` for its direct address); `runMigrations`,
  `readMigrations`. `@libsql/client` is an optional peer dependency, as `pg` is.
- Linking an account of the app's own to core (auth.md §8.2): `POST /api/auth/sv/link-sovereign` (`./core`) after the password, for the
  session that asked and for ten minutes, refused for a `sub` or an address another account has; `linkToSovereign` (`./client`).

## [0.5.0] - 2026-11-22

### Changed

- better-auth and `@better-auth/passkey` 1.7.27, named exactly. An app on the package names the same better-auth version, so moving
  to 0.5.0 means moving the app's better-auth to 1.7.27 with it; no app on a newer 1.7 patch has to go down to use the package.

## [0.4.0] - 2026-11-20

### Added

- Who is signed in, typed: `userOf` (`./server`) and `signedInUser` (`./core`) give the SDK's `User`, the same shape for an account of
  the app's own and one from core, with `sub` and the roles core signed only for a session that came through core.

## [0.3.0] - 2026-11-20

### Added

- `@sovereignfs/auth/core`: core as a way in for an app, a better-auth plugin built on the SDK's sign-in, with core's refresh token kept
  by the SDK alone, core's notices verified and remembered, and the plugin's own tables (`coreSignInMigrations`).
- The preset's `localAccounts` switch, the registration's `arrival` (an account from core, or a sign-up of the app's own), and the
  refusal of the password, second-step and passkey routes to an account that has no password.
- The flows behind the second step's setup (`twoFactorSettings`) and the profile (`saveName`).
- Published: the private packages it is built from are bundled in.
- `resolveWaysIn` (the `AUTH_LOCAL` and `AUTH_SIGNUP` defaults of auth.md §5, and an app with no way in refused), `runMigrations` (the
  database package's migrator) and `userIdForSub` (the app's user for core's `sub`).
- `@sovereignfs/auth/postgres`: an app's own PostgreSQL pool as the package's database (`postgresDatabase`), the database package's own
  code, bundled; only this entry loads `pg`.

### Fixed

- A sign-in through core that comes back `login_required` ends only a session that came from core, never a local account's.

## [0.2.0] - 2026-11-19

### Added

- `@sovereignfs/auth/client`: the browser client's plugins and fields, the sign-in value derived from a salt the app names, and the
  flows behind the sign-in pages (`signInWithPassword`, `signInWithPasskey`, `signUp` with `signUpProblem`, `requestPasswordReset`,
  `resetPassword`, `verifySecondStep`, `changePassword`) with their messages.
- `signUpPolicy` and a required `registration`, so no app is open to every sign-up by leaving it out; the server entries throw in a
  browser.

## [0.1.0] - 2026-11-19

### Added

- The part of core's sign-in that is not about core
  ([RFC 0007](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0007-one-sign-in.md)): `createAuthPreset`, better-auth's
  options with every rule a sign-in keeps; the settings resolver; the account and session checks; asking for the password again; a
  person's sessions; the cookie names and the password policy; the session read and page guards with the app's own check between;
  and the account tables with their migrations for apps. Not published yet.

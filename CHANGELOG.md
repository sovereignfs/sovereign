# Changelog: Sovereign

What changed in each version of the platform: core and its image, `ghcr.io/sovereignfs/sovereign`, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.97.0; earlier versions are in the repository's
history and tags.

## [0.101.0] - 2026-11-17

### Added

- Each person's keys are set up silently the first time they sign in with their password, and opened by the password on any
  browser (core-app §5.3). Core keeps only what opens them, wrapped, and opens none of it; deleting an account deletes it all.
- A browser stays unlocked until its session ends (core-app §5.4): the key is kept wrapped by a device key and by the session's own
  secret, so nothing it keeps opens once the session has ended. Signing out forgets it.
- The reset page tells someone with keys that what apps keep encrypted stays locked after a reset, until a passkey or the recovery
  kit opens it.

## [0.100.0] - 2026-11-16

### Changed

- **Core never receives a password.** Every form that sets or asks for one derives a sign-in value in the browser from the password,
  the address and the instance id, and sends that instead (core-app §5.2); the password policy is checked in the browser. Accounts
  made before this set their password again through a reset link (docs/upgrade.md).
- Signing in with anything but a sign-in value is answered as a wrong password, before any account is looked up.
- Core's content security policy allows WebAssembly to be compiled (`'wasm-unsafe-eval'`), which the derivation needs.

### Added

- The instance id, made once at start-up and published in the instance document as `instanceId`.
- The reset page names the account its link is for.
- `sovereign-admin accounts reset-link EMAIL` makes a reset link for an account when mail cannot be sent.
- Apps may be allowed encryption by a key return address, which brings the `keys` scope with it (core-app §5.6).

## [0.99.0] - 2026-11-16

### Changed

- The password derivation's cost is fixed at 19 MiB and 3 passes, timed at about one second on a recent phone. Nothing uses it
  yet.

## [0.98.0] - 2026-11-16

### Added

- Encryption the server cannot read is specified (core-app §5, RFC 0005), and its first parts are built, used by nothing yet: the
  library that derives a sign-in value and an unlock key from a password in the browser, seals keys to people, writes the recovery
  kit and encrypts documents in chunks (`@sovereignfs/crypto/web`), and the design system's `LockedState` and `RecoveryKit`. Nothing
  about signing in has changed.

## [0.97.1] - 2026-11-15

### Fixed

- A Core API call whose body says no length (sent chunked) is refused as soon as the body passes 16 KB, instead of being read whole
  first: an app holding a valid token could otherwise make core hold whatever it streamed (security review, Phase 2).
- Signing in with a passkey or adding one from a device that does not ask for a PIN or biometrics says what to do, now that
  better-auth 1.7.18 refuses such an answer itself.

### Changed

- better-auth 1.7.18, with all of its packages pinned to one version, and the routine updates of the other dependencies; `pnpm audit`
  finds nothing in what core runs.

## [0.97.0] - 2026-11-12

### Added

- People's files on disk, end to end: core keeps what a person uploads to their own account through `@sovereignfs/storage`, in a
  folder and a quota per person (`SV_STORAGE_PATH`, `SV_STORAGE_QUOTA_MB`, `SV_STORAGE_FILE_QUOTA`; core-app §4.6), included in
  backups and restores.

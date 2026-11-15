# Changelog: Sovereign

What changed in each version of the platform: core and its image, `ghcr.io/sovereignfs/sovereign`, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.97.0; earlier versions are in the repository's
history and tags.

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

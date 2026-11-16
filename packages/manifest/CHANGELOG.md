# Changelog: @sovereignfs/manifest

What changed in each version of the app manifest's schemas, validator and `sovereign-manifest`, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.2.0; earlier versions are in the repository's
history and tags.

## [0.3.0] - 2026-11-16

### Added

- Manifest 4: an app that keeps what people give it encrypted so the server cannot read it says so, with `encryption.return`, the
  path core sends a person back to with the app's key; it needs `signIn`. Manifest 4 keeps manifest 3's `storage` and its rules
  ([`contracts/app-manifest.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md) §2.8).

## [0.2.0] - 2026-11-15

### Added

- Manifest 3: an app names the folder of people's files it keeps, which the instance mounts for it alone
  ([`contracts/app-manifest.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/app-manifest.md)).

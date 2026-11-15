# Changelog: @sovereignfs/sdk

What changed in each version of the SDK an app's server uses to call core, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 2.1.0; earlier versions are in the repository's
history and tags.

## [2.1.0] - 2026-11-02

### Added

- Verifying core's notices (account deletion, back-channel logout) on their own, without the SDK's sessions.

### Fixed

- The discovery document is asked for at the issuer's own address.

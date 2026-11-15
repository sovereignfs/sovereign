# Changelog: @sovereignfs/config

What changed in each version of the environment variable convention, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.1.0; earlier versions are in the repository's
history and tags.

## [0.1.0] - 2026-11-08

### Added

- First release: settings declared once, read with the app's prefix, and refused at start-up when missing or invalid
  ([`contracts/env.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/env.md)).

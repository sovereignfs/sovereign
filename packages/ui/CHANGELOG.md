# Changelog: @sovereignfs/ui

What changed in each version of the Sovereign design system, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.96.0; earlier versions are in the repository's
history and tags.

## [0.97.0] - 2026-11-16

### Added

- `LockedState`, experimental: what an encrypted app shows where this browser cannot open something, `locked` (with the app's own
  Unlock link) or `removed` (sharing stopped). Built on `EmptyState`.
- `RecoveryKit`, experimental: the recovery kit shown once at set-up, in fourteen groups, with Print (which prints the kit alone)
  and Save as a file, and Continue held off until the person says they kept it.

## [0.96.1] - 2026-11-12

### Fixed

- Published again: 0.96.0's release did not reach npm. Nothing else changed.

## [0.96.0] - 2026-11-12

### Added

- `DateRangePicker`: two dates in one field.
- `AppTile`, with the launcher's tiles and Console tile in the established style, an "Add an app" ghost tile, and a 32px mark.

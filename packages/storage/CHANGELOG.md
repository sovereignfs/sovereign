# Changelog: @sovereignfs/storage

What changed in each version of the files people upload, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.1.0; earlier versions are in the repository's
history and tags.

## [0.1.1] - 2026-11-26

### Fixed

- A failed upload could leave its unfinished `.part` file in the person's folder. It happened when an upload broke off, or turned out
  longer than it said, before the file for it had been opened, which is likelier on a busy machine. `put` now refuses only once that
  file is gone. A leftover never counted against anyone's quota, and is still cleared once it is a day old.

## [0.1.0] - 2026-11-15

### Added

- First release: a folder and a quota per person on disk (the `fs` driver), paths from the person's `sub` and an id the store makes,
  types judged by their bytes, and only images served inline
  ([RFC 0004](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0004-file-storage.md)).

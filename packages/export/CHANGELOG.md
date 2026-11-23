# Changelog: @sovereignfs/export

What changed in each version of the export format's package, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is written
in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.4.0] - 2026-11-23

### Added

- `@sovereignfs/export/browser`: `BrowserExportWriter` writes a person's export in a page, for an app whose data only the browser can
  open. It imports no `node:` module, holds the data in memory, and writes the same archive, byte for byte, as `ExportWriter` does from
  the same records and files, as a tar or a zip; `readExport` reads it back. `crc32` is the browser's own.

## [0.3.0] - 2026-11-20

### Added

- The rest of what an export needs, for an app with no core as for core: `ExportJobs` (one export at a time for the operator and for
  each person, claimed with a lease, downloaded once by the session that asked, forgotten after an hour) on any database with `run` and
  `transaction`, with its table from `exportJobsMigrations`; `ExportRunner`, which makes what is due; `downloadExport`, which hands a
  ready export over once and removes it; and `viewOf`, what a page shows of one.

## [0.2.0] - 2026-11-20

### Added

- `addFile` takes a fourth argument, `records`, for a file that is already records written as JSON Lines, so that one export can be
  placed in another (core putting an app's part in a person's export) with its records still listed as records.

## [0.1.0] - 2026-11-20

### Added

- First release: the export format of
  [`contracts/export.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/export.md) written as a stream (`ExportWriter`,
  a tar or, for a person's export, a zip), checked as it is read (`readExport`), and encrypted to age X25519 recipients (`encryptTo`,
  `decryptWith`, `parseRecipients`) ([RFC 0008](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0008-exports-and-backups.md)).

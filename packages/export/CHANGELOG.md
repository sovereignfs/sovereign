# Changelog: @sovereignfs/export

What changed in each version of the export format's package, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is written
in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.1.0] - 2026-11-20

### Added

- First release: the export format of
  [`contracts/export.md`](https://github.com/sovereignfs/sovereign/blob/main/contracts/export.md) written as a stream (`ExportWriter`,
  a tar or, for a person's export, a zip), checked as it is read (`readExport`), and encrypted to age X25519 recipients (`encryptTo`,
  `decryptWith`, `parseRecipients`) ([RFC 0008](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0008-exports-and-backups.md)).

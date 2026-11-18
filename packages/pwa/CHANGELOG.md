# Changelog: @sovereignfs/pwa

What changed in each version of what makes an app installable, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is written in
the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.1.0] - 2026-11-18

### Added

- First release: `manifest` (with `launch_handler` and `handle_links`, and an `id` that defaults to the start address), `iconSet`;
  `serviceWorkerSource` and `serviceWorkerResponse` (an allow-list of what is the same for everyone, an optional person-free shell, its
  own offline page, and a new version that waits to be asked); `pwaMetadata`, `pwaViewport` and `PWA_CSP_DIRECTIVES`; and, from
  `@sovereignfs/pwa/client`, `ServiceWorkerRegistration`, which announces a new version with `UpdateNotice`
  ([RFC 0001](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0001-installable-core.md) amendment 1).

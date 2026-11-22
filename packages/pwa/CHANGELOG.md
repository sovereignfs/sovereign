# Changelog: @sovereignfs/pwa

What changed in each version of what makes an app installable, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is written in
the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.3.0] - 2026-11-22

### Added

- Background Sync: `serviceWorkerSource({ sync: { tags, message?, handlers? } })` answers a sync with one of the app's tags by posting
  `{ type, tag }` to every open window (`SYNC_MESSAGE` by default, exported from both entries), or runs the app's `onSync(tag)`.
- `fetchHandlers`: the app's own `onFetch(request, url)`, asked only about requests the worker would leave to the network, never a
  navigation or a kept file, for what is the app's and the same for everyone (map tiles, a file a wake reads).

- 2026-11-20

### Added

- Web Push in the worker and the page ([RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md) §2).
  `serviceWorkerSource({ push })` adds `push` and `notificationclick` handlers, and only then: every push shows something, a push
  with a `kind` asks the app's `onPushKind`, nothing of a push is stored, and opening one goes only to a path on the worker's own
  origin. `@sovereignfs/pwa/client` gains `pushState`, `turnOnPush` (replacing a subscription made with another key), `turnOffPush`,
  `pushAvailability` and the `usePush` hook.

## [0.1.0] - 2026-11-18

### Added

- First release: `manifest` (with `launch_handler` and `handle_links`, and an `id` that defaults to the start address), `iconSet`;
  `serviceWorkerSource` and `serviceWorkerResponse` (an allow-list of what is the same for everyone, an optional person-free shell, its
  own offline page, and a new version that waits to be asked); `pwaMetadata`, `pwaViewport` and `PWA_CSP_DIRECTIVES`; and, from
  `@sovereignfs/pwa/client`, `ServiceWorkerRegistration`, which announces a new version with `UpdateNotice`
  ([RFC 0001](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0001-installable-core.md) amendment 1).

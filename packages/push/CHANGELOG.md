# Changelog: @sovereignfs/push

What changed in each version of the Web Push package, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [semver](https://semver.org/). A version's section is written
in the change that sets the version, dated that day, and becomes the release notes when the version is published.

## [0.1.0] - 2026-11-20

### Added

- First release: Web Push for an app's server with no dependency
  ([RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md) §1.1 to §1.3). `pushSettings` reads
  `<PREFIX>_VAPID_PRIVATE_KEY` (or its `_FILE` form), derives the public key and takes `<PREFIX>_VAPID_SUBJECT` or the app's https
  `<PREFIX>_URL` as the contact; `parseSubscription` accepts a browser's subscription to a known push service and nothing else;
  `checkMessage` holds a message to its limits; `sendPush` encrypts it (RFC 8291 `aes128gcm`), signs for the app (RFC 8292 ES256)
  and posts it with a ten-second timeout, answering sent, gone, retry or refused. `npx @sovereignfs/push keys` makes a key.

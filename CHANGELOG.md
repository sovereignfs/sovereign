# Changelog: Sovereign

What changed in each version of the platform: core and its image, `ghcr.io/sovereignfs/sovereign`, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.97.0; earlier versions are in the repository's
history and tags.

## [0.110.0] - 2026-11-18

### Added

- An installed core is fuller: its manifest brings a window already open forward instead of starting another, offers shortcuts to
  your apps and your account from the icon, and shows pictures of the sign-in page in the install sheet on Android and desktop.
- The account pages offer to install core where the device allows it: the browser's own Install where it has one, the steps for Add to
  Home Screen on an iPhone or iPad, and nothing in an installed window or after "Not now" on that device.

### Changed

- A new version of core is announced instead of swapped in silently: an open page says "A new version is ready", and Reload takes it.
  An installed core left open checks for one whenever it comes back into view.

## [0.109.0] - 2026-11-17

### Added

- Shortcuts: a launcher tile for any site, which opens it in a new tab and signs nobody in. An operator adds shortcuts for everyone
  under the Console's Apps page; anyone with the launcher adds their own on the new Shortcuts account page, which nobody else sees.
  The icon is a letter, an icon from a set, or an uploaded picture of up to 256 KB, kept in core.
- The launcher's first tile is one dashed "Add": an operator chooses between a shortcut for themselves, one for everyone, and an app
  that signs in here; anyone else adds a shortcut of their own.
- At the foot of the launcher, the owner and admins read what the instance runs: the platform and core versions, the database, Node's
  version and how long core has been up. Nobody else is sent it.

### Changed

- The launcher lists apps and shortcuts together in name order, with the Console last, and draws every tile's icon in greys. Its line
  no longer names the person, who is already shown in the header.
- The Console is reached from its tile on the launcher, and is no longer in the avatar's menu.
- The Console can no longer be given to the user role in the permissions table: it, its tile and the details line are for the owner
  and admins only.
- A Console page on a phone has one way back, to the page above it, instead of two links one above the other.
- Appearance offers System first, then Light and Dark.

## [0.108.0] - 2026-11-17

### Changed

- On an instance whose owner turned on recovery, the recovery kit no longer says that nobody else can get a person's encrypted data
  back: it says the kit is their own way back, and that the owner can also recover it. Without recovery, it says what it said before.

## [0.107.0] - 2026-11-17

### Added

- Every item of core's encryption acceptance list (core-app §5.10) is shown by a named test, run on every database: among them, that a
  session ended elsewhere leaves nothing that opens, and that the instance's database and an app's stored files hold no plaintext of a
  document, its name or its type. Not yet audited.
- Encrypting an app's data, a guide for an app's author; Deploying and Operating say what is and is not protected.

### Fixed

- A sign-in page with no session forgets the encryption keys a browser kept for the session that ended, as it should; they could no
  longer be opened, but stayed in the browser.

## [0.106.0] - 2026-11-17

### Added

- An app that runs with no Sovereign server can keep its people's data encrypted the same way, in a vault of its own: unlocked at
  its own sign-in, or with a passphrase when its sign-in is another provider's, with a recovery kit, and staying unlocked until its
  session ends (`@sovereignfs/sdk` 2.4.0, sdk §9.5). Its records are the ones core keeps. Not yet audited.

### Changed

- Core's pages unlock a person's keys with the routine that apps with no core use too. Nothing a person sees changes.

## [0.105.0] - 2026-11-17

### Added

- A person who reset their password unlocks their encrypted data with their recovery kit, and their new password unlocks it from then
  on (core-app §5.3).
- Recovery of encrypted data (escrow), off unless the owner turns it on in the Console with a key made by `sv key escrow` (core-app
  §5.8). Each person is told before they are covered, and their Security page says whether recovery is on; the Console says how many
  people are not covered yet. `sovereign-admin accounts escrow-record` and `put-kit` carry a recovery through, with the key offline.

## [0.104.0] - 2026-11-17

### Added

- People can share encrypted things with each other in an app (core-app §5.7). Two new Core API calls give a person's public keys
  for the app, and the caller's own keys still locked by the app's key; nothing either returns lets a server read what is shared.
- An app's page checks every person's keys against their account's signature, and refuses keys that changed until the person using
  it says to go on.

## [0.103.0] - 2026-11-17

### Added

- Apps can encrypt what they keep so the server can't read it (core-app §5.7). An app's pages get the app's own key from core once
  each browser session, through `@sovereignfs/sdk/keys`, and keep it until the app's session ends. A person who is unlocked sees
  only "Opening…"; a locked browser asks for the password or a passkey.
- The recovery kit is shown, and must be kept, the first time a person opens an app that uses encryption.
- An operator lets an app use encryption by giving it a key return address (built with the previous version, complete now).

## [0.102.0] - 2026-11-17

### Added

- Signing in with a passkey that can unlock opens a person's keys with the same touch (core-app §5.5). Its secret stays in the
  browser: what is sent to core leaves it out.
- A passkey added while the browser is unlocked can unlock too. The passkeys page says which passkeys unlock, offers to let one that
  doesn't, and warns before one that unlocks is removed.
- A passkey that can't unlock still signs in as before.

## [0.101.0] - 2026-11-17

### Added

- Each person's keys are set up silently the first time they sign in with their password, and opened by the password on any
  browser (core-app §5.3). Core keeps only what opens them, wrapped, and opens none of it; deleting an account deletes it all.
- A browser stays unlocked until its session ends (core-app §5.4): the key is kept wrapped by a device key and by the session's own
  secret, so nothing it keeps opens once the session has ended. Signing out forgets it.
- The reset page tells someone with keys that what apps keep encrypted stays locked after a reset, until a passkey or the recovery
  kit opens it.

## [0.100.0] - 2026-11-16

### Changed

- **Core never receives a password.** Every form that sets or asks for one derives a sign-in value in the browser from the password,
  the address and the instance id, and sends that instead (core-app §5.2); the password policy is checked in the browser. Accounts
  made before this set their password again through a reset link (docs/upgrade.md).
- Signing in with anything but a sign-in value is answered as a wrong password, before any account is looked up.
- Core's content security policy allows WebAssembly to be compiled (`'wasm-unsafe-eval'`), which the derivation needs.

### Added

- The instance id, made once at start-up and published in the instance document as `instanceId`.
- The reset page names the account its link is for.
- `sovereign-admin accounts reset-link EMAIL` makes a reset link for an account when mail cannot be sent.
- Apps may be allowed encryption by a key return address, which brings the `keys` scope with it (core-app §5.6).

## [0.99.0] - 2026-11-16

### Changed

- The password derivation's cost is fixed at 19 MiB and 3 passes, timed at about one second on a recent phone. Nothing uses it
  yet.

## [0.98.0] - 2026-11-16

### Added

- Encryption the server cannot read is specified (core-app §5, RFC 0005), and its first parts are built, used by nothing yet: the
  library that derives a sign-in value and an unlock key from a password in the browser, seals keys to people, writes the recovery
  kit and encrypts documents in chunks (`@sovereignfs/crypto/web`), and the design system's `LockedState` and `RecoveryKit`. Nothing
  about signing in has changed.

## [0.97.1] - 2026-11-15

### Fixed

- A Core API call whose body says no length (sent chunked) is refused as soon as the body passes 16 KB, instead of being read whole
  first: an app holding a valid token could otherwise make core hold whatever it streamed (security review, Phase 2).
- Signing in with a passkey or adding one from a device that does not ask for a PIN or biometrics says what to do, now that
  better-auth 1.7.18 refuses such an answer itself.

### Changed

- better-auth 1.7.18, with all of its packages pinned to one version, and the routine updates of the other dependencies; `pnpm audit`
  finds nothing in what core runs.

## [0.97.0] - 2026-11-12

### Added

- People's files on disk, end to end: core keeps what a person uploads to their own account through `@sovereignfs/storage`, in a
  folder and a quota per person (`SV_STORAGE_PATH`, `SV_STORAGE_QUOTA_MB`, `SV_STORAGE_FILE_QUOTA`; core-app §4.6), included in
  backups and restores.

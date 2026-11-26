# Changelog: Sovereign

What changed in each version of the platform: core and its image, `ghcr.io/sovereignfs/sovereign`, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.97.0; earlier versions are in the repository's
history and tags.

## [0.143.1] - 2026-11-26

### Security

- A password could end up in the address. Pressing a password form’s button, or Enter in it, before the page had loaded,
  on a slow connection for example, made the browser send the form itself, with the password in the address: core
  received the password, which it otherwise never does, and the browser’s history and a reverse proxy’s access log could
  keep it. This held for sign-in, sign-up, password reset, the lock page, changing a password and the email settings.
  Those buttons now work only once the page is running.
- If a proxy in front of core keeps access logs, search them for `password=`, ignoring case. Have any password you find
  there changed, the mail server’s included.

### Fixed

- Signing in with a password manager on an iPhone no longer says the email or password is incorrect when both are right. Core's
  sign-in sends what is in the boxes, also when the password manager filled them without telling the page.
- The same holds wherever else core asks for a password: creating an account, setting or changing a password, unlocking, turning
  two-step sign-in on or off, letting a passkey unlock, exporting, deleting an account and handing over ownership. The buttons that
  were greyed out until a password was typed can now be pressed; with an empty box, the browser asks you to fill it in.
- Printing the recovery kit from core installed on a phone's home screen gave a page with the kit's title and first groups cut off.
  The whole kit is printed now. A kit printed that way before is only good if it shows all fourteen groups; saved as a file, or
  printed from the browser, it was whole.
- A file upload that broke off at once, or turned out longer than it said, could leave an unfinished file in the person’s folder
  for a day or more. It is removed straight away now (`@sovereignfs/storage` 0.1.1).

## [0.143.0] - 2026-11-26

### Changed

- Core asks for the recovery kit as soon as a person signs up, and after each sign-in until they have kept it, instead of waiting until
  they first open an app that uses encryption. There is no way to put it off on that screen; the person then goes on to where they were
  headed, an app included. People with an account already see it at their next sign-in. A sign-in that leaves the browser locked, such
  as a passkey that does not open encrypted data, is not held up.

### Added

- The Security page offers the recovery kit to anyone who has not kept it.

## [0.142.1] - 2026-11-26

### Fixed

- What core's pages keep in the browser for encryption (the unlocked account key, the hand-over across sign-in's second step) is
  written before the page moves on: a write now waits until the browser has committed it. The fix for unlocking an app's data on iOS
  is in `@sovereignfs/sdk` 2.12.1, which apps take by updating.

## [0.142.0] - 2026-11-23

### Added

- An app signed in through core can tell when the person last signed in there (`@sovereignfs/auth`'s `coreSignedInAt`), which an export or a
  deletion asks for after a fresh sign-in at core.

## [0.141.0] - 2026-11-23

### Added

- An app can show the apps a person may open in its own header: the Core API's `GET /api/v1/apps` (`listMyApps`) answers the launcher's
  tiles for the person a token is for, with any of their tokens and no new scope; the instance document lists `apps`. Each app's icon
  is served from core's own address (`/api/branding/apps/<id>`), fetched once from the app's launcher entry and checked as a picture.

## [0.140.0] - 2026-11-23

### Added

- An app's _Create an account_ opens core's sign-up (`prompt=create`, OpenID Connect Prompt Create 1.0), and the new account ends in
  the app's sign-in; an invitation-only instance still asks for an invitation. The SDK and `@sovereignfs/auth` ask for it.

## [0.139.0] - 2026-11-23

### Added

- An app whose data only the browser can open writes a person's export there, in the same format (`@sovereignfs/export/browser`).

## [0.138.0] - 2026-11-23

### Added

- The app frame in `@sovereignfs/ui` (epic 21): a settings dialog with a side navigation, the same in core and every app; a
  header with an app's own wordmark, a sidebar and the frame they make; icons for lists,
  categories and cards beyond groceries; and a linear barcode for loyalty cards.

## [0.137.0] - 2026-11-22

### Added

- A person signed in to an app's own account links it to their Sovereign account from the app's security page, after their password,
  and signs in through Sovereign to it from then on (`@sovereignfs/auth`, auth.md §8.2). Nothing is linked because two addresses match.

## [0.136.0] - 2026-11-22

### Added

- An app made from the template runs on a SQLite file, sqld or PostgreSQL, as `<PREFIX>_DB_DIALECT` says, through
  `@sovereignfs/auth/database`; its migrations come in one folder per form, and every migration runs on PostgreSQL's direct address.

## [0.135.0] - 2026-11-22

### Added

- `@sovereignfs/auth` serves the session's key secret (`keySecrets`), which an app's pages keep a person's keys with, so an app that
  encrypts no longer needs the SDK's `nextAuth`. The app template's `--encryption` form now signs in on the package, through core only.

## [0.134.0] - 2026-11-22

### Added

- `@sovereignfs/auth` 0.6.0: an app that had a sign-in of its own moves onto the package without its people starting again. Its tables
  are renamed onto the package's, a password is moved at the person's next sign-in for 90 days, then a reset link the app's operator
  makes; accounts from core keep their rows and lose the tokens `genericOAuth` kept (RFC 0007 amendment 1).

- 2026-11-22

### Added

- `@sovereignfs/pwa` 0.3.0: an app's worker answers Background Sync for its own tags, and may answer requests the shared worker leaves
  to the network with handlers of its own, so no app keeps a worker of its own for them.

- 2026-11-22

### Changed

- better-auth 1.7.27, with every package of it pinned exactly, in core, `@sovereignfs/auth` and the app template; checked against the
  stores 1.7.13 and 1.7.18 wrote, and the store 1.7.27 writes kept beside them.
- An app's `http` address on `localhost` is still accepted on a development instance: better-auth 1.7.27 refuses a web app's `http`
  address unless the server says otherwise, and core now says so by its own rule (`http` on `localhost` and `*.localhost`, only where
  `SV_URL` is `http`). Every other instance accepts only `https`, as before.

### Documentation

- The manifest contract describes manifest 5; the environment contract names the Web Push key and its subject, and the
  `ENCRYPTION_KEY` pair older apps read; the guide lists `@sovereignfs/auth` and `@sovereignfs/export`.

## [0.131.3] - 2026-11-21

### Fixed

- The Security page logged React error #418 and was drawn again in the browser: the times of a person's sessions were written in the
  server's language and zone, then in the browser's. They are now in the person's own zone (UTC until they set one), the same on
  both, with `@sovereignfs/ui` 0.105.0; so are the days on the passkey, connected-app and file lists, which had the same fault.
- An export downloaded as `sovereign-0.0.0.0-…`, named after the address the server listens on in the image. It is named after the
  instance's own host, from `SV_URL`.

## [0.131.2] - 2026-11-21

### Changed

- On the launcher, the Console's tile comes right after "Add", before the apps, and "Add" has the divider and a kind (**new**) like
  every other tile.

### Fixed

- The launcher, reached from another page by the instance's name in the header (or "Go to the start", or "Apps"), showed
  each app's initials instead of its icon until the page was reloaded: it kept the other page's security policy, which refuses
  pictures from other sites. Every link to the launcher now loads it afresh.

## [0.131.1] - 2026-11-21

### Fixed

- The image left out every folder named `data`, its own pages among them: "Your data" (`/data`) and the Console's Data page
  (`/console/data`) were not in it, and answered "This page is not here". The build context now leaves out only the files core keeps
  at run time, and a test fails when it would leave out any source file.

## [0.131.0] - 2026-11-20

### Added

- An app made by `npm create @sovereignfs app` (toolkit 0.27.0) sends notifications, with and without `--encryption`
  ([RFC 0009](docs/rfcs/0009-web-push.md) §4): its key is in the manifest's `generate`, devices and waiting pushes are in its database
  with their keys sealed, a push is queued in the change's own transaction and sent from an outbox, `PushControl` is on its home page
  with "Send me a test notification", and signing out turns the device off first. `docs/building-an-app.md` has "Sending
  notifications".

## [0.130.0] - 2026-11-20

### Added

- Web Push in the worker, the page and the design system ([RFC 0009](docs/rfcs/0009-web-push.md) §2, §3): `@sovereignfs/pwa` 0.2.0's
  worker shows every push and opens only its own paths, when the app asks for push, and its client turns push on and off for a
  device (`usePush`); `@sovereignfs/ui` 0.104.0 has `PushControl`, the one switch every app shows. No app uses them yet.

## [0.129.0] - 2026-11-20

### Added

- `@sovereignfs/push` 0.2.0, a new published package: Web Push for an app's server with no dependency
  ([RFC 0009](docs/rfcs/0009-web-push.md) §1). The app's key is one variable, `<PREFIX>_VAPID_PRIVATE_KEY`, its public key derived;
  messages are encrypted (RFC 8291) and signed (RFC 8292) on `node:crypto` and sent only to the browsers' push services; the app gives
  a store, with an in-memory one and a conformance suite under `/testing`; pushes are queued in the change's own transaction and sent
  from an outbox claimed by a lease; and the subscription route is three framework-free handlers. No app uses it yet.

## [0.128.0] - 2026-11-20

### Changed

- Core's exports run on shared pieces an app with no core can use too: the jobs, the runner and the one-time download from
  `@sovereignfs/export` 0.3.0, and the export panel from `@sovereignfs/ui` 0.103.0. Nothing a person or the owner sees changes, except
  that times on the export pages are written in the person's own time zone.

## [0.127.0] - 2026-11-20

### Added

- A new app made with `npm create @sovereignfs app` answers core when a person downloads their data: their notes and files from the app
  go into the download, encrypted notes still encrypted.

## [0.126.0] - 2026-11-20

### Added

- A person's download from Your data now holds what each app they use keeps of them. Core asks each app at the export address it
  registered (a new setting in an app's technical settings, and `signIn.export` in manifest 5), checks what the app sends, and adds it;
  an app that offers nothing, does not answer or answers wrongly is named in the download as missing.

## [0.125.0] - 2026-11-20

### Added

- Anyone can download their own data from a new account page, Your data, after their password: their profile and settings, the apps
  they allowed, their notifications and activity, their files, and their encrypted data, still encrypted. Their password, passkeys and
  two-factor codes are never in it. It is a zip (or a tar), made in the background and downloaded once within the hour, and it goes
  with the account when the account is deleted.

## [0.124.0] - 2026-11-20

### Added

- The owner can export the instance's data from the Console's Data page, after their password: every account (with no password,
  passkey or two-factor secret), the apps, consents, settings, notifications, activity, the encrypted data people keep, still encrypted,
  and everyone's files. It is made in the background, encrypted to the owner's keys as it is written so the server cannot read it, and
  downloaded once within the hour. `sv export open` opens it. It is not a backup: `sv backup` still is.

## [0.123.0] - 2026-11-20

### Added

- The Console has a Data page, the owner's alone (a new owner-only permission, "Export the instance's data"). On it the owner saves
  the keys an export of the instance is encrypted to: age public keys, as `sv key export` prints them, whose private halves stay with the
  owner. Taking the export itself comes next.

## [0.122.0] - 2026-11-20

### Added

- `@sovereignfs/export` 0.1.0, a new published package: the one export format of [`contracts/export.md`](contracts/export.md),
  written as a stream as a tar (or a zip for a person's export), checked as it is read, and encrypted to age recipients. Core and apps use
  it for the exports of RFC 0008; nothing offers an export yet.

## [0.121.0] - 2026-11-20

### Changed

- Nothing in core changes. This version carries the SDK's typed user and its deprecation of `nextAuth`, and the sign-in package's
  typed user, for apps.

## [0.120.0] - 2026-11-20

### Changed

- The panels for the second sign-in step and a person's profile come from the design system, which apps share; nothing a person sees
  changes.

## [0.119.0] - 2026-11-19

### Changed

- Signing out of an app that is not part of the suite (an external app) no longer signs the person out of Sovereign and every other
  app: only that app's session ends. Signing out of an app the instance runs still signs them out everywhere, as signing out of
  Sovereign does. An operator can change this for each app in the Console. Apps already registered keep what they did until the next
  `sv apply`.
- The sign-in server no longer lists `given_name` and `family_name` among the claims it supports: it never sent them.

## [0.118.0] - 2026-11-19

### Changed

- Core's sign-in, sign-up, forgotten and reset password and second-step pages, and the sessions and change-password panels, are drawn
  with the design system's forms, which every Sovereign app will use, and run on the sign-in package. They say and do what they did.
  Two small things look different: on a screen between 401 and 768 pixels wide the sign-in card has a little more room inside, and a
  box of a sign-in code selects its digit when it is focused, so typing replaces it.

## [0.117.0] - 2026-11-19

### Changed

- Core's sign-in now runs on `@sovereignfs/auth`, the sign-in package every Sovereign app will share
  ([RFC 0007](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0007-one-sign-in.md)). Nothing a person or an app sees
  changes: the same pages, the same rules, the same sessions and the same database.

## [0.116.0] - 2026-11-19

### Added

- A lock on a device. Once signed in, a person can turn it on from the Security page under "Lock on this device", with a passkey that
  works on that device. Core then locks their session after 15 minutes without use (or 1, 5 or 60, as they choose), and, if they ask,
  when they leave the app. A locked session shows nothing of the person, to core's pages or to apps signing in through core, until it is
  unlocked with the passkey or the password; signing out is always offered. Unlocking carries on in the same session, so the person's
  apps stay signed in, and their encrypted data stays closed while the session is locked. Nothing changes for anyone who does not turn
  it on.

## [0.115.0] - 2026-11-19

### Added

- The lock check (`/lock-check`), which tries on a phone what a biometric lock would need, can be opened by the owner on a production
  instance, as well as by anyone signed in on a development or staging instance. It is a new owner-only permission, "Try this instance
  on a device", which the Console's permissions page shows and no other role can be given.

### Changed

- Core's sessions last seven days without use, extended once a day while in use, as before, but now set in core itself, so apps can
  rely on it as they check their sessions against core's.

### Fixed

- Opening an invitation link while already signed in sent the person to the launcher without a word. It now says whose account they
  are in and whom the invitation is for, and offers to go on or to sign out and use the invitation.
- A sign-in page an app sent someone to, left open for more than ten minutes, said the email or password was wrong when they finally
  signed in. It now says the sign-in waited too long and offers to start it again.

## [0.114.1] - 2026-11-19

### Fixed

- When ending a session failed after core had read which apps to tell, what it read was kept in memory for the life of the process. It
  is now dropped after a minute.

## [0.114.0] - 2026-11-18

### Changed

- An app that misses the notice that a person signed out of core is told again: core keeps each notice and, after a timeout, an app
  that cannot be reached or a server error, sends it again after 1, 5 and 30 minutes and then 2 and 6 hours, for up to a day. Any other
  answer from the app is final. Core is now the only sender of these notices; each app's logout notice address is moved to core's own
  settings when core starts, with nothing for an operator to do.

- Every place that asks a signed-in person for their password again counts wrong answers against one limit: five in ten minutes, then
  every answer is refused until the ten minutes pass. Turning two-factor sign-in on or off, its backup codes and key, and changing the
  password now count with handing over ownership and deleting the account.

## [0.113.0] - 2026-11-18

### Added

- A person who signs up from the link of an invitation that core emailed to them no longer gets a second email asking them to verify
  the same address: the account is verified by the invitation and they are signed in straight away. An invitation passed on by hand,
  because its email was not sent, is verified by email as before. Core now records whether each invitation's email was sent; existing
  invitations count as not sent.

### Fixed

- Someone sent to core by an app to sign in, who instead created an account, verified their email or reset their password, now ends up
  back in the app, not on core's launcher.
- A passkey used on the second sign-in step ("Use a passkey instead") unlocks the person's encrypted data with the same touch, as it does
  on the sign-in page.
- Signing out that does not reach the server, or is refused, now says the person is still signed in, instead of seeming to work.
- A verification link that has expired or was already used now says so even in a browser that is already signed in, instead of
  quietly moving on.

## [0.112.0] - 2026-11-18

### Added

- In an installed core, an app's tile opens the app in a new window, which desktop Chrome and Edge hand to the app when it is installed
  too, so it opens as itself; on an iPhone, an iPad and in Safari it opens in a browser view that closes back to core. In a browser tab, a
  tile opens its app in the same tab, as before.
- A shortcut may also keep a native app's own address, such as `spotify:…`, tried first from an installed core or a phone, with its web
  address opened instead if no app answers within a second. Addresses that could run anything in the browser are refused.

## [0.111.0] - 2026-11-18

### Added

- `@sovereignfs/pwa` 0.1.0, what makes a Sovereign app installable: its manifest, a service worker that keeps nothing of a person, and a
  new version announced instead of swapped in. Apps made with `npm create @sovereignfs app` use it (toolkit 0.18.0). Core is unchanged.

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

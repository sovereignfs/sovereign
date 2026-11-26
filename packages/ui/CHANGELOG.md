# Changelog: @sovereignfs/ui

What changed in each version of the Sovereign design system, newest first, in the form of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/). A version's section is written in the change that sets the version, dated that day,
and becomes the release notes when the version is published. This file starts at 0.96.0; earlier versions are in the repository's
history and tags.

## [0.107.4] - 2026-11-26

### Fixed

- `SignInForm` sends what is in its boxes. A password manager can fill them without telling the page (AutoFill on iOS, until a box
  is focused), and the form then sent what it had last heard, usually nothing: "The email or password is incorrect" for a password
  that was right. Its boxes are no longer held in React state, so drawing the form again cannot empty what was filled either.

## [0.107.3] - 2026-11-25

This version carries 0.107.1 and 0.107.2, which were set on `develop` and never published.

### Fixed

- `IconPicker`'s panel is no longer cut off when the picker is at the left of a page. It opened leftwards from its trigger always, which
  a scrolling page beside a sidebar clips; it now opens on the side with room, rightwards from a trigger at the left. `Popover`'s `align`
  takes `auto` for this (`right`, its default side, where the panel fits, else `left`, counting as room only what is visible: the
  viewport less what a scrolling ancestor would clip), and `IconPicker` has an `align` that defaults to `auto`. An explicit `left` or
  `right` is unchanged, and so is every `Popover` that has one.

### Changed

- `AppFrame`: the header's menu button draws its icon at 24px with a heavier stroke, in place of the 20px icon at the default weight, so it
  stands beside an app's wordmark and reads as a button. Nothing else changes.
- `SettingsDialog`'s title row is compact: 49px on a desktop in place of 69, with the title at 18px in place of 20 and a 2rem close button (the × is where it was). A phone keeps the 44px
  touch target and is 61px in place of 69. Only this dialog's header changes: `Dialog`, `Drawer` and `Sheet` have the shared one as before.

## [0.107.0] - 2026-11-23

### Added

- `SettingsDialog`: settings as one dialog with a side navigation, the same in core and every app. Sections in groups with a divider
  between them, each with an icon; an optional search; the section scrolling in a frame that never changes size; on a phone, the
  sections, then one with a back arrow. Controlled (`active`, `onSelect`), so that an app gives each section an address.
- `Dialog`'s `flush`: a body with no padding and no scrolling of its own, for content that scrolls its own regions.
- Twenty icons for lists, categories and cards beyond groceries: `square-pen`, `shopping-cart`, `store`, `hammer`, `wrench`, `plug`,
  `laptop`, `headphones`, `shirt`, `gift`, `sprout`, `flower-2`, `briefcase`, `paperclip`, `pill`, `baby`, `dog`, `sofa`,
  `wallet-cards` and `scan-barcode`.
- `MobileFooter`'s `launcherLabel`: the centered button's name, "Apps" by default, for an app whose middle button opens its own
  drawer.
- `Header`'s `brand`: an app's own wordmark in place of the badge, which stays core's default.
- `AppSidebar` and `useAppSidebar`: the sidebar every app has, full, a rail of icons or hidden, kept on the device per app and per
  kind of page; blocks of rows with an optional heading, an icon in a colour, a count and a trailing _+ New …_ row. The rules are
  exported (`sidebarStateFor`, `toggleSidebarHidden`, `toggleSidebarRail`, `parseSidebarStored`).
- `AppFrame`: the frame of an app's signed-in page, wired once. `Header`, `AppSidebar`, the content and a right column on a wide
  screen; `MobileHeader`, `MobileFooter` and a `Drawer` with the same blocks on a phone; the shell root, publishing the header's and
  the footer's heights for overlays. `AppSidebar`'s `placement="drawer"` fills a phone's drawer.
- `appsLauncherItems`: the apps the Core API's `listMyApps` answers, as `AppsLauncher`'s items, each with its icon or its first letter,
  leaving out the app the launcher is in.
- `Barcode` and `encodeBarcode`: EAN-13, EAN-8, UPC-A, Code 128 and Code 39 as an SVG, black on white in every theme, with no
  dependency; check digits added or checked.

## [0.106.0] - 2026-11-22

### Added

- `LinkSovereignPanel`: linking an account of an app's own to the person's Sovereign account, after their password, and what came back
  (`LinkOutcome`: `done`, `taken`, `address`).

## [0.105.0] - 2026-11-21

### Added

- `SessionsPanel` takes `timeZone`, the person's own, for the times it writes.

### Fixed

- `SessionsPanel` wrote "Signed in" and "Last active" in the runtime's own language and zone, which differ between the server and the
  browser, so React threw the server's page away and logged error #418. It now writes them the same way everywhere: in `timeZone`,
  or in UTC without one.

## [0.104.0] - 2026-11-20

### Added

- `PushControl`: "Notifications on this device", for an app's settings
  ([RFC 0009](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0009-web-push.md) §3). It says why a device can't have
  notifications (a browser without them, a page off https, an iPhone where the app must be added to the Home Screen first, a blocked
  permission) or offers one `Toggle`, busy while working and with the reason beside it when it fails; nothing while checking or when
  the app sends none. The state and actions come from `usePush` in `@sovereignfs/pwa/client`. `IOS_INSTALL_STEPS` is the one sentence
  it shares with `InstallPrompt`.

## [0.103.0] - 2026-11-20

### Added

- `ExportPanel` (experimental): taking an export after the password and downloading it once, for an operator's export or a person's,
  in core or in an app with no core. The consumer gives `onStart`, `downloadAction` and `onRefresh`; it knows no framework.

## [0.102.0] - 2026-11-19

### Added

- The sign-in forms of core and every app ([RFC 0007](https://github.com/sovereignfs/sovereign/blob/main/docs/rfcs/0007-one-sign-in.md)):
  `SignInForm`, `SignUpForm`, `ForgotPasswordForm`, `ResetPasswordForm` and `TwoFactorForm`, and on the account pages `SessionsPanel`
  and `ChangePasswordForm`, with `ActionResult` for what a panel's server action answers and `AuthLinkRenderer` for the consumer's
  links. Each draws and collects, and sends nothing itself. Experimental.
- `SignInForm` takes `otherWays` ("Continue with Sovereign") and needs no reset link where an app cannot send one.

## [0.101.0] - 2026-11-18

### Added

- `AppTile` takes `onClick`, called before the browser follows the link, so the consumer can decide how it opens (a new window when the
  page runs as an installed app, for example) and call `preventDefault()` when it opens it itself. Without it, nothing changes.

## [0.100.0] - 2026-11-18

### Added

- `InstallPrompt`: offers to install the site as an app where the device allows it, and renders nothing anywhere else. Where the
  browser fires `beforeinstallprompt` it shows **Install**, which opens the browser's own prompt; on an iPhone or iPad it says how
  (Share, then Add to Home Screen). Nothing shows in an installed window, and **Not now** is remembered on the device. With it,
  `InstallHint` (what it shows), `useInstallPrompt` and `isInstalledDisplay`.
- `UpdateNotice`: a quiet notice, fixed at the bottom of the window, that a new version of the app is ready, with **Reload** and,
  optionally, **Later**. The consumer shows it while a service worker waits and decides what Reload does.

## [0.99.0] - 2026-11-17

### Added

- `AppTile` takes `external`: with `href`, the tile opens the address in a new tab with `rel="noopener noreferrer"`, and shows a
  small external-link mark beside the name and says "(opens in a new tab)" to assistive tech. Off by default.
- `AppTile` takes `monochrome`: the picture is drawn in shades of grey, so icons that come from elsewhere look like one set. Off by
  default.

## [0.98.0] - 2026-11-17

### Added

- `RecoveryKit` takes `ownerCanRecover`: when the instance's owner turned on recovery, the kit, and the file it saves, say it is the
  person's own way back and that the owner can also recover their data, instead of saying nobody else can. Off by default, which keeps
  today's words.

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

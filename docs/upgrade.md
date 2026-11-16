# Upgrading

What to do when a release changes something you depend on. Newest first. A version that is not here needs nothing from you.

A breaking change adds a note here in the same change that makes it, saying what changed and what to do
([design system §4](specs/design-system.md)). This file starts with the first published release of each package, so nothing
before that is recorded.

## `@sovereignfs/ui`

### 0.89.0

- **`NavTabs` and `SplitPane` use the one breakpoint, 768px.** `NavTabs` scrolls its tabs sideways below 768px (it was 640px) and
  `SplitPane` stacks its two panes below 768px (it was 720px). Between those widths a layout that relied on the old points now
  changes earlier. Nothing in the props changed.
- **`FileDropzone` can be reached with the keyboard.** Its file input was hidden with `display: none`, which took it out of the tab
  order. It is now hidden to the eye only, and the dropzone shows a focus ring. A form's `required` on it now works.
- **`Dialog` and `Drawer` move focus into the panel when they are opened**, as `Sheet` already did. Focus returns to what opened
  them when they close, after their exit animation. A test that expected focus to stay on the opener while they were open needs
  the new behaviour.

## `@sovereignfs/sdk`

### 2.0.0

- **This is a new SDK under the old name.** Versions up to `1.25.0` were the legacy SDK, which ran inside the old platform as an
  object of namespaces. This one is used from an app's own server and calls core over the Core API. Nothing carries over by
  upgrading: remove the legacy package, install `@sovereignfs/sdk@^2`, and follow [Using the SDK](using-the-sdk.md).
  [SDK §10](specs/sdk.md) maps each legacy namespace to what replaces it.

## Core

### 0.100.0

- **Core never receives a password, and every account made before this sets its password again.** The browser now sends a sign-in
  value derived from the password, the address and the instance id ([core-app §5.2](specs/core-app.md)), so a password stored by an
  earlier core no longer signs anyone in. Before you upgrade:
  1. Take a backup (`./sv backup`).
  2. Make sure mail works, so each person can use **Forgot password**. Where it does not, an operator makes a reset link for an
     account on the server with `sovereign-admin accounts reset-link EMAIL` (in core's container) and gives it to the person; it works
     once, for an hour.

  Each person, after the upgrade, sets their password through the reset link and signs in as before. Passkeys keep working. Core
  makes the instance id when it first starts, and its log says how many accounts were made before.

- **Signing in needs JavaScript**, and takes about a second longer, while the browser derives the value.
- **The password policy is checked in the browser**, in the same words. The server checks only that what it receives is a sign-in
  value (`PASSWORD_NOT_DERIVED` otherwise); a client of your own that posts a password to core's sign-in endpoints must derive it
  with `@sovereignfs/crypto/web` first.

# Epic 21: The app frame

> Every app's header, sidebar, settings and launcher are the design system's, drawn once, with the app's own brand and words.

## Status

📋 Planned

## Overview

Tusk and Shopper each carry near copies of the same frame (`AppShell`, `SidebarToggle`, `sidebar.ts`, `useSidebar`, `mobile-nav`), and
both say it is worth offering to `@sovereignfs/ui`. The design system has the parts (`Header`, `NavList`, `ThreeColumnLayout`,
`MobileHeader`, `MobileFooter`, `Drawer`, `AppsLauncher`) but not the frame they make, nor a settings dialog, nor a linear barcode.
Shopper's [RFC 0005](https://github.com/sovereignfs/shopper/blob/main/docs/rfcs/0005-the-frame-settings-and-screens.md) and
[RFC 0007](https://github.com/sovereignfs/shopper/blob/main/docs/rfcs/0007-loyalty-cards.md) asked for them (its epic 16, 16.17 to
16.26); this epic is core's half, so that those requests have an owner here. Shopper is the first consumer; Tusk and Tally adopt the
frame in their own repositories later.

Nothing in a component of this epic knows an app's data or words: every label, icon and destination is given by the app.

## Related

- Shopper's RFC 0005 ("Settings", "The frame", "A list") and RFC 0007 ("A card"): what was asked for
- [docs/design-system.md](../design-system.md) and [docs/specs/design-system.md](../specs/design-system.md): where each component is
  documented
- [epic 2](design-system.md): the design system's earlier components; [epic 7](apps-launcher.md): core's launcher
- [docs/specs/core-app.md](../specs/core-app.md) §3.8 (the launcher) and [contracts/core-api/](../../contracts/core-api/): 21.8
- [RFC 0008](../rfcs/0008-exports-and-backups.md) and `contracts/export.md`: 21.10
- [workstream 0012](../workstreams/0012-app-frame.md): the order the tasks run in

## Tasks

#### 📋 21.1 — `SettingsDialog`

**Goal:** Settings are one dialog with a side navigation, the same in core and every app.

**Deliverables:**

- `SettingsDialog` on `Dialog`'s fixed-size `lg` frame: a title row and close across the width; sections in groups with a divider
  between groups, each with an icon; an optional search (off by default) that filters the sections by label; the active section's
  content, with no repeated heading, scrolling inside a frame that does not change size
- On a phone, the whole screen: the sections first, then one, with a back arrow to the sections
- Controlled (`active`, `onSelect`, `open`, `onClose`), so that an app puts each section at an address; the sections are a
  `nav` with `aria-current` on the active one
- A story (default, with search, on a phone) and a gallery entry; `docs/design-system.md`

**Dependencies:** none

**Spec reference:** Shopper's RFC 0005, "Settings"; `docs/specs/design-system.md` (overlays portal into the shell root)

**Review checklist:**

- The frame keeps its size whichever section is shown; only the content scrolls
- Keyboard: Tab reaches the sections and the content; Escape closes; focus returns to the opener
- No `next/*` import; nothing an app's own

#### 📋 21.2 — More icons, and `square-pen`

**Goal:** The icons Shopper's lists, Inventory and cards use are in the set, chosen with `IconPicker`, never uploaded.

**Deliverables:**

- `square-pen` (Lucide's), and icons beyond groceries: hardware, electronics, clothing, gifts, garden, office, a card, drawn as the
  set's icons are (24-pixel grid, `currentColor` stroke), each with its name and keywords for `IconPicker`'s search
- The icon gallery shows them

**Dependencies:** none

**Spec reference:** Shopper's RFC 0005, "A list"

**Review checklist:**

- Every new icon draws in both themes and at the small size; `IconPicker` finds each by a keyword

#### 📋 21.3 — `MobileFooter`'s middle button, named by the app

**Goal:** The phone's middle button can open something other than the apps.

**Deliverables:**

- An optional `middleLabel` (its text and accessible name, "Apps" when not given) and `middleIcon`; `onOpenApps` keeps working
- The story shows both

**Dependencies:** none

**Spec reference:** Shopper's RFC 0005, "The frame"

**Review checklist:**

- Core's footer renders exactly as before; the label is the button's accessible name

#### 📋 21.4 — `Header` with the app's own brand

**Goal:** An app's header is the design system's, with its own wordmark.

**Deliverables:**

- A `brand` slot drawn in place of the initial badge, which stays the default (core's); a `leading` slot before it for the sidebar's
  button
- On the right, in this order, the launcher, the bell and the avatar, each drawn only when given
- The story shows core's header and an app's

**Dependencies:** none

**Spec reference:** Shopper's RFC 0005, "The frame"

**Review checklist:**

- Core's `AccountHeader` renders as it does today (its tests pass unchanged)

#### 📋 21.5 — `AppSidebar`

**Goal:** The sidebar every app copies, once.

**Deliverables:**

- Full, a rail of icons (each with a tooltip) or hidden, with its own full/rail button; the state remembered on the device per app and
  per kind of page, by pure rules (Shopper's `src/ui/sidebar.ts`, taken as the first consumer's) exported for the header's button
- Its content is blocks of `NavList`, each with an optional heading and an optional trailing _+ New …_ row; an item may carry an
  icon in a colour and a count
- A hook, `useAppSidebar(appId, pageKind)`, reading what was stored in an effect, never in render
- A story (full, rail, hidden) and a gallery entry

**Dependencies:** none

**Spec reference:** Shopper's RFC 0005, "The frame"; `AGENTS.md` (no `next/*`, no browser globals in render)

**Review checklist:**

- The rules are tested with no browser; a stored value that is not what was written is ignored
- An item's colour is the icon's only, never a background or the text's

#### 📋 21.6 — `AppFrame`

**Goal:** The header, the sidebar, the content and a right column, wired, for every app.

**Deliverables:**

- Desktop: `Header`, `AppSidebar`, the content, and `ThreeColumnLayout`'s optional right column; phone: `MobileHeader`, the content,
  `MobileFooter` and a `Drawer` holding the sidebar's blocks
- The overlays' offsets published as CSS custom properties (as Tusk's `AppShell` does), so that a toast or a floating button clears
  the header and the footer
- The same routes on both: only what is drawn differs
- A story and a gallery entry; `docs/design-system.md`

**Dependencies:** 21.3, 21.4, 21.5

**Spec reference:** Shopper's RFC 0005, "The frame"

**Review checklist:**

- Nothing changes a route by viewport; the drawer closes on choosing an item; overlays portal into the shell root

#### 📋 21.7 — `Barcode`

**Goal:** A linear barcode drawn as `QrCode` draws a QR code.

**Deliverables:**

- EAN-13, EAN-8, UPC-A, Code 128 and Code 39 as an SVG, with a quiet zone, black on white in either theme, scaled to its width, its
  value written under it; a value that is not valid for its kind draws nothing and says so
- No dependency and no request
- A story per kind and a gallery entry

**Dependencies:** none

**Spec reference:** Shopper's RFC 0007, "A card"

**Review checklist:**

- Each kind's check digit and bars match known examples

#### 📋 21.8 — The apps a person can open

**Goal:** An app's header can show the suite's launcher.

**Deliverables:**

- A Core API endpoint answering, for the person signed in, the apps they may open (name, description, icon, launch address), the
  launcher's own list (§3.8), with icons served from core's own address; defined first in `contracts/core-api/openapi.yaml`, the
  client generated, the handler checked against the contract
- An SDK call to it, and `AppsLauncher` fed from what it returns
- `core-app.md` §3.8 and the contract

**Dependencies:** none

**Spec reference:** core-app §3.8; Shopper's RFC 0005, "The frame"

**Review checklist:**

- The guard runs first; the answer holds tile fields only; a person who may not use the launcher gets nothing

#### 📋 21.9 — `prompt=create`: an app asks core to open on its sign-up

**Goal:** An app's _Create an account_ lands on core's sign-up, not its sign-in.

**Deliverables:**

- OIDC's `prompt=create` accepted at core's authorize endpoint, sending the person to `/sign-up` with the resume address as its
  `returnTo`
- `beginSignIn` in the SDK and `@sovereignfs/auth`'s `/sign-in/sovereign` route can ask for it

**Dependencies:** none

**Spec reference:** core-app §3.6; OpenID Connect Prompt Create 1.0

**Review checklist:**

- An invitation-only instance still asks for an invitation; the resume address is a path on core

#### 📋 21.10 — Writing an export in the browser

**Goal:** An app whose data only the browser can open writes the contract's export there.

**Deliverables:**

- `@sovereignfs/export`'s writer (the zip, the head, records) usable in a browser, with no `node:` module, from its own entry point

**Dependencies:** none

**Spec reference:** RFC 0008; `contracts/export.md`

**Review checklist:**

- A test fails if the browser entry reaches a `node:` module; what it writes reads back with `readExport`
